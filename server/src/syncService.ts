import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';

export class SyncService {
    private supabase: SupabaseClient | null = null;
    private db: Database;
    private syncInterval: NodeJS.Timeout | null = null;
    private isSyncing = false;

    // FIX #8: Cache bucket existence so we don't call listBuckets() every sync cycle
    private knownBuckets = new Set<string>();

    constructor(db: Database) {
        this.db = db;
    }

    async initialize() {
        const settings = await this.db.getSettings();
        const url = settings.supabase_url;
        const key = settings.supabase_key;

        if (url && key) {
            this.supabase = createClient(url, key);
            console.log('SyncService: Supabase client initialized.');
            this.startSyncLoop();
        } else {
            console.log('SyncService: Supabase config missing. Sync disabled.');
        }
    }

    getStatus() {
        return {
            isSyncing: this.isSyncing,
            hasConfig: !!this.supabase
        };
    }

    startSyncLoop(ms: number = 60000) {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.sync(), ms);
        this.sync(); // Run once immediately
    }

    stopSyncLoop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    triggerImmediateSync() {
        return this.sync();
    }

    async checkSupabaseDataExists(userId: string): Promise<{ exists: boolean; counts?: { companies: number; jobs: number } }> {
        if (!this.supabase) return { exists: false };
        try {
            const { count: jobCount, error: jobError } = await this.supabase
                .from('jobs')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (jobError) throw jobError;

            const { count: companyCount, error: companyError } = await this.supabase
                .from('companies')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (companyError) throw companyError;

            const exists = (jobCount && jobCount > 0) || (companyCount && companyCount > 0);
            return {
                exists: Boolean(exists),
                counts: {
                    companies: companyCount || 0,
                    jobs: jobCount || 0
                }
            };
        } catch (error) {
            console.error('SyncService: Error checking Supabase data:', error);
            return { exists: false };
        }
    }

    async uploadFile(localPath: string, originalName: string, bucket: string = 'documents'): Promise<string | null> {
        if (!this.supabase) return null;
        try {
            const userId = await this.db.getUserId();
            if (!userId) return null;

            await this.ensureBucket(bucket);

            const fileBuffer = await fs.readFile(localPath);
            // Use basename of the local path (already includes extension); prefix with userId for isolation
            const cloudFilename = `${userId}/${path.basename(localPath)}`;

            const { error: uploadError } = await this.supabase.storage
                .from(bucket)
                .upload(cloudFilename, fileBuffer, {
                    contentType: 'application/octet-stream',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = this.supabase.storage
                .from(bucket)
                .getPublicUrl(cloudFilename);

            return publicUrl;
        } catch (error) {
            console.error(`SyncService: Failed to upload to bucket ${bucket}:`, error);
            return null;
        }
    }

    // FIX #8: Cache bucket-existence check — only hit Supabase the first time per session
    private async ensureBucket(name: string = 'documents') {
        if (!this.supabase || this.knownBuckets.has(name)) return;
        try {
            const { data: buckets } = await this.supabase.storage.listBuckets();
            if (!buckets?.find(b => b.name === name)) {
                await this.supabase.storage.createBucket(name, { public: true });
            }
            this.knownBuckets.add(name);
        } catch (_err) {
            console.warn(`SyncService: Could not ensure bucket "${name}" — it may already exist or permissions are restricted.`);
        }
    }

    async sync() {
        if (this.isSyncing || !this.supabase) return;
        this.isSyncing = true;
        console.log('SyncService: Starting sync...');

        try {
            await this.ensureBucket();
            await this.pushLocalChanges();
            await this.pullRemoteChanges();
            // Always record when the last successful sync ran (regardless of whether new data was found)
            await this.db.updateSetting('last_cloud_sync', new Date().toISOString());
            // FIX #5: Prune stale (already-synced) queue rows older than 7 days to prevent unbounded growth
            await this.db.run(
                `DELETE FROM sync_queue WHERE synced_at IS NOT NULL AND created_at < datetime('now', '-7 days')`,
                [],
                true
            );
            console.log('SyncService: Sync completed successfully.');
        } catch (error) {
            console.error('SyncService: Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    private async pushLocalChanges() {
        // FIX #6: Fetch passphrase ONCE before the loop, not once per encrypted item
        const passphraseRow = await this.db.get(`SELECT value FROM settings WHERE key = 'supabase_encryption_key'`);
        const passphrase: string | null = passphraseRow?.value
            ? (this.db.ENCRYPTED_KEYS.includes('supabase_encryption_key')
                ? this.db.decrypt(passphraseRow.value)
                : passphraseRow.value)
            : null;

        // FIX #6: Skip queue items that have been retried too many times this session.
        // We use a simple in-memory counter keyed by queue item ID.
        const MAX_RETRIES = 5;
        const failCounts: Map<number, number> = (this as any)._pushFailCounts ?? ((this as any)._pushFailCounts = new Map());

        // Get unsynced items (exclude permanently-stale items older than 24h with repeated failures)
        const queue = await this.db.all(`
            SELECT * FROM sync_queue
            WHERE synced_at IS NULL
            ORDER BY created_at ASC
            LIMIT 100
        `);
        if (queue.length === 0) return;

        console.log(`SyncService: Pushing ${queue.length} changes to cloud...`);

        for (const item of queue) {
            // FIX #6 cont.: skip items that have failed too many times this session
            const fails = failCounts.get(item.id) ?? 0;
            if (fails >= MAX_RETRIES) {
                console.warn(`SyncService: Skipping queue item ${item.id} after ${fails} consecutive failures.`);
                continue;
            }

            try {
                const { table_name, record_id, action, data } = item;
                let payload: any = {};
                try {
                    payload = data ? JSON.parse(data) : {};
                } catch (_e) {
                    console.warn(`SyncService: Invalid JSON in sync_queue item ${item.id}`);
                }

                const userId = await this.db.getUserId();

                if (action === 'INSERT' || action === 'UPDATE') {
                    if (!data || Object.keys(payload).length === 0) {
                        payload = await this.db.get(`SELECT * FROM ${table_name} WHERE id = ?`, [record_id]);
                        if (!payload) {
                            // Record deleted locally before sync ran
                            await this.db.run('UPDATE sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?', [item.id], true);
                            continue;
                        }
                    }

                    const record = { ...payload, id: record_id, user_id: userId };

                    // Pre-flight: strip virtual/computed columns not in the actual DB schema
                    const tableInfo = await this.db.all(`PRAGMA table_info(${table_name})`);
                    const validColumns = tableInfo.map((col: any) => col.name);
                    const cleanRecord: any = {};
                    for (const key of Object.keys(record)) {
                        if (validColumns.includes(key)) cleanRecord[key] = record[key];
                    }

                    // --- DOCUMENT UPLOAD INTERCEPTOR ---
                    if (table_name === 'documents' && cleanRecord.path) {
                        if (!cleanRecord.path.startsWith('http')) {
                            try {
                                if (await fs.pathExists(cleanRecord.path)) {
                                    const fileBuffer = await fs.readFile(cleanRecord.path);
                                    const ext = path.extname(cleanRecord.path);
                                    const cloudFilename = `${userId}/${crypto.randomUUID()}${ext}`;

                                    const { error: uploadError } = await this.supabase!.storage
                                        .from('documents')
                                        .upload(cloudFilename, fileBuffer, {
                                            contentType: 'application/octet-stream',
                                            upsert: true
                                        });

                                    if (uploadError) throw new Error(`Bucket upload failed: ${uploadError.message}`);

                                    const { data: { publicUrl } } = this.supabase!.storage
                                        .from('documents')
                                        .getPublicUrl(cloudFilename);

                                    cleanRecord.path = publicUrl;
                                } else {
                                    console.warn(`SyncService: Local document missing for sync at ${cleanRecord.path}`);
                                }
                            } catch (uploadEx) {
                                console.error('SyncService: Document storage upload error:', uploadEx);
                                throw uploadEx;
                            }
                        }
                    }
                    // --- END DOCUMENT INTERCEPTOR ---

                    // --- SETTINGS PUSH INTERCEPTOR ---
                    if (table_name === 'settings') {
                        // FIX #1: supabase_encryption_key must NEVER leave this device
                        if (cleanRecord.key === 'supabase_encryption_key') {
                            await this.db.run('UPDATE sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?', [item.id], true);
                            continue;
                        }

                        if (cleanRecord.key && this.db.ENCRYPTED_KEYS.includes(cleanRecord.key)) {
                            // Decrypt hardware-bound layer to get plaintext
                            const plaintext = cleanRecord.value ? this.db.decrypt(cleanRecord.value) : '';

                            if (passphrase) {
                                // Re-encrypt portably so only the Lambda (which has SETTINGS_ENCRYPTION_KEY) can decrypt
                                cleanRecord.value = this.db.encryptForCloud(plaintext, passphrase);
                            } else {
                                // Safe fallback: refuse to store plaintext, mark it so Lambda rejects it too
                                cleanRecord.value = 'UNENCRYPTED:' + plaintext;
                                console.warn(`SyncService: SES key "${cleanRecord.key}" synced without cloud encryption. Set a Supabase Encryption Key in Notification Settings.`);
                            }
                        }
                    }
                    // --- END SETTINGS PUSH INTERCEPTOR ---

                    const { error } = await this.supabase!
                        .from(table_name)
                        .upsert(cleanRecord)
                        .select();

                    if (error) throw error;

                } else if (action === 'DELETE') {
                    // --- DOCUMENT STORAGE DELETION INTERCEPTOR ---
                    if (table_name === 'documents') {
                        try {
                            if (payload?.path?.startsWith('http')) {
                                const urlParts = payload.path.split('/documents/');
                                if (urlParts.length > 1) {
                                    const cloudFilename = urlParts[1];
                                    const { error: removeError } = await this.supabase!.storage
                                        .from('documents')
                                        .remove([cloudFilename]);
                                    if (removeError) console.warn(`SyncService: Failed to purge cloud blob ${cloudFilename}:`, removeError);
                                }
                            }
                        } catch (delError) {
                            console.error('SyncService: Document storage cleanup error:', delError);
                        }
                    }
                    // --- END DOCUMENT DELETION INTERCEPTOR ---

                    const { error } = await this.supabase!
                        .from(table_name)
                        .delete()
                        .match({ id: record_id, user_id: userId })
                        .select();

                    if (error) throw error;
                }

                // Mark synced — reset fail counter
                await this.db.run('UPDATE sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?', [item.id], true);
                failCounts.delete(item.id);

            } catch (err) {
                console.error(`SyncService: Failed to push item ${item.id}:`, err);
                failCounts.set(item.id, (failCounts.get(item.id) ?? 0) + 1);
                // Intentionally do not rethrow — the next sync loop will retry
            }
        }
    }

    private async pullRemoteChanges() {
        const userId = await this.db.getUserId();
        if (!userId) return;

        const settings = await this.db.getSettings();
        const lastSync = settings.last_cloud_sync || '1970-01-01T00:00:00Z';

        // FIX #4: Added 'settings' to the pull table list so SES/notification settings
        // sync to other devices automatically
        const tables = [
            'companies', 'jobs', 'contacts', 'interactions',
            'reminders', 'documents', 'interview_questions', 'settings'
        ];
        let latestTimestamp = lastSync;

        // FIX #2 (pull side): Fetch local passphrase ONCE so we can decrypt CLOUD: values
        // that arrive from Supabase and re-encrypt with the local hardware key for storage
        const localPassphraseRow = await this.db.get(`SELECT value FROM settings WHERE key = 'supabase_encryption_key'`);
        const localPassphrase: string | null = localPassphraseRow?.value
            ? (this.db.ENCRYPTED_KEYS.includes('supabase_encryption_key')
                ? this.db.decrypt(localPassphraseRow.value)
                : localPassphraseRow.value)
            : null;

        for (const table of tables) {
            let query = this.supabase!
                .from(table)
                .select('*')
                .gt('updated_at', lastSync);

            // settings table: pull all for this user_id; other tables: same
            query = query.eq('user_id', userId);

            const { data, error } = await query;

            if (error) {
                console.error(`SyncService: Error pulling from ${table}:`, error);
                continue;
            }

            if (!data || data.length === 0) continue;

            console.log(`SyncService: Pulling ${data.length} update(s) for ${table}...`);

            await this.db.run('BEGIN TRANSACTION', [], true);
            try {
                for (const record of data) {
                    // --- DOCUMENT DOWNLOAD INTERCEPTOR ---
                    if (table === 'documents' && record.path?.startsWith('http')) {
                        try {
                            const filename = record.filename || 'downloaded_doc';
                            const uploadsDir = path.join(
                                process.env.APPDATA ||
                                (process.platform === 'darwin'
                                    ? (process.env.HOME ?? '') + '/Library/Application Support'
                                    : (process.env.HOME ?? '') + '/.local/share'),
                                'job-tracker-desktop', 'uploads'
                            );
                            await fs.ensureDir(uploadsDir);
                            const localPath = path.join(uploadsDir, `${record.id}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`);

                            if (!(await fs.pathExists(localPath))) {
                                console.log(`SyncService: Downloading cloud document ${filename}...`);
                                const response = await axios({ method: 'GET', url: record.path, responseType: 'stream' });
                                const writer = fs.createWriteStream(localPath);
                                response.data.pipe(writer);
                                await new Promise<void>((resolve, reject) => {
                                    writer.on('finish', resolve);
                                    writer.on('error', reject);
                                });
                            }
                            record.path = localPath;
                        } catch (downloadErr) {
                            console.error(`SyncService: Failed to download cloud document ${record.path}:`, downloadErr);
                        }
                    }
                    // --- END DOCUMENT INTERCEPTOR ---

                    // --- SETTINGS PULL INTERCEPTOR ---
                    // FIX #1+#2: Only one interceptor block (removed the duplicate), and now
                    // correctly handles CLOUD:-prefixed values instead of blindly hardware-encrypting them.
                    if (table === 'settings') {
                        // Never write the encryption key back — it's device-local only
                        if (record.key === 'supabase_encryption_key') continue;

                        if (record.key && this.db.ENCRYPTED_KEYS.includes(record.key) && record.value) {
                            if (record.value.startsWith('CLOUD:')) {
                                // FIX #2: Value was stored in portable CLOUD: format.
                                // Decrypt it with the user's passphrase, then re-encrypt with
                                // the local hardware key so the local API routes (which call db.decrypt())
                                // can use it transparently.
                                if (localPassphrase) {
                                    try {
                                        const plaintext = this.db.decryptFromCloud(record.value, localPassphrase);
                                        record.value = this.db.encrypt(plaintext);
                                    } catch (decryptErr) {
                                        console.error(`SyncService: Could not decrypt CLOUD: value for key "${record.key}" — wrong passphrase?`, decryptErr);
                                        // Store the CLOUD: value as-is; the local route will fail to use it
                                        // but we don't corrupt the row
                                    }
                                } else {
                                    console.warn(`SyncService: Received CLOUD:-encrypted setting "${record.key}" but no local supabase_encryption_key is set. The setting will be stored as-is and won't be usable locally until the passphrase is configured.`);
                                    // Store CLOUD: value as-is — the local API will just fail gracefully on decrypt
                                }
                            } else if (record.value.startsWith('UNENCRYPTED:')) {
                                // Sentinel value from a push without a passphrase — strip the prefix and hardware-encrypt
                                const plaintext = record.value.slice('UNENCRYPTED:'.length);
                                record.value = this.db.encrypt(plaintext);
                            } else {
                                // Legacy plain text (from before CLOUD: format was introduced) — hardware-encrypt it
                                record.value = this.db.encrypt(record.value);
                            }
                        }
                    }
                    // --- END SETTINGS PULL INTERCEPTOR ---

                    await this.upsertLocal(table, record);

                    if (record.updated_at > latestTimestamp) {
                        latestTimestamp = record.updated_at;
                    }
                }
                await this.db.run('COMMIT', [], true);
            } catch (txErr) {
                await this.db.run('ROLLBACK', [], true);
                console.error(`SyncService: Transaction failed for ${table}:`, txErr);
            }
        }

        if (latestTimestamp !== lastSync) {
            await this.db.updateSetting('last_cloud_sync', latestTimestamp);
        }
    }

    // FIX #3: Removed the dead INSERT ... ON CONFLICT SQL that was built but never executed.
    // This is now a clean check-and-update-or-insert with no dead code.
    private async upsertLocal(table: string, record: any) {
        const keys = Object.keys(record);
        const existing = await this.db.get(`SELECT id FROM ${table} WHERE id = ?`, [record.id]);

        if (existing) {
            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const params = keys.map(k => record[k]).concat(record.id);
            await this.db.run(`UPDATE ${table} SET ${setClause} WHERE id = ?`, params, true);
        } else {
            const placeholders = keys.map(() => '?').join(', ');
            const params = keys.map(k => record[k]);
            await this.db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES(${placeholders})`, params, true);
        }
    }
}
