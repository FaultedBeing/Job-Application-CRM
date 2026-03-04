import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database';

export class SyncService {
    private supabase: SupabaseClient | null = null;
    private db: Database;
    private syncInterval: NodeJS.Timeout | null = null;
    private isSyncing = false;

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

    startSyncLoop(ms: number = 60000) { // Default 60 seconds
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.sync(), ms);
        // Run once immediately
        this.sync();
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

    async sync() {
        if (this.isSyncing || !this.supabase) return;
        this.isSyncing = true;
        console.log('SyncService: Starting sync...');

        try {
            await this.pushLocalChanges();
            await this.pullRemoteChanges();
            console.log('SyncService: Sync completed successfully.');
        } catch (error) {
            console.error('SyncService: Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    private async pushLocalChanges() {
        // 1. Get items from sync_queue
        const queue = await this.db.all('SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 100');
        if (queue.length === 0) return;

        console.log(`SyncService: Pushing ${queue.length} changes to cloud...`);

        for (const item of queue) {
            try {
                const { table_name, record_id, action, data } = item;
                let payload: any = {};
                try {
                    payload = data ? JSON.parse(data) : {};
                } catch (e) {
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
                    // Add user_id and record_id to payload if not present
                    const record = { ...payload, id: record_id, user_id: userId };

                    const { error } = await this.supabase!
                        .from(table_name)
                        .upsert(record);

                    if (error) throw error;
                } else if (action === 'DELETE') {
                    const { error } = await this.supabase!
                        .from(table_name)
                        .delete()
                        .match({ id: record_id, user_id: userId });

                    if (error) throw error;
                }

                // Mark as synced
                await this.db.run('UPDATE sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?', [item.id], true);
            } catch (err) {
                console.error(`SyncService: Failed to push item ${item.id}: `, err);
                // We'll retry in the next loop
            }
        }
    }

    private async pullRemoteChanges() {
        const userId = await this.db.getUserId();
        if (!userId) return;

        // Get last sync timestamp
        const settings = await this.db.getSettings();
        const lastSync = settings.last_cloud_sync || '1970-01-01T00:00:00Z';

        const tables = ['companies', 'jobs', 'contacts', 'interactions', 'reminders', 'documents', 'interview_questions'];
        let latestTimestamp = lastSync;

        for (const table of tables) {
            const { data, error } = await this.supabase!
                .from(table)
                .select('*')
                .eq('user_id', userId)
                .gt('updated_at', lastSync);

            if (error) {
                console.error(`SyncService: Error pulling from ${table}: `, error);
                continue;
            }

            if (data && data.length > 0) {
                console.log(`SyncService: Pulling ${data.length} updates for ${table}...`);

                // Use a transaction for bulk updates to prevent DB locking the UI
                await this.db.run('BEGIN TRANSACTION', [], true);
                try {
                    for (const record of data) {
                        await this.upsertLocal(table, record);
                        if (record.updated_at > latestTimestamp) {
                            latestTimestamp = record.updated_at;
                        }
                    }
                    await this.db.run('COMMIT', [], true);
                } catch (txErr) {
                    await this.db.run('ROLLBACK', [], true);
                    console.error(`SyncService: Transaction failed for ${table}: `, txErr);
                }
            }
        }

        // Update last_cloud_sync setting
        if (latestTimestamp !== lastSync) {
            await this.db.updateSetting('last_cloud_sync', latestTimestamp);
        }
    }

    private async upsertLocal(table: string, record: any) {
        // This is a generic upsert. In a real app, we might need more specific logic per table.
        // For now, we'll build a query dynamically.
        const keys = Object.keys(record);
        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys.map(k => `${k} = EXCLUDED.${k} `).join(', ');

        // This depends on the table having a primary key named 'id'
        const sql = `
      INSERT INTO ${table} (${keys.join(', ')})
                        VALUES(${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updates}
                        `;

        // Note: 'PLACEHOLDER' logic for ON CONFLICT depends on SQLite version or specific syntax.
        // For SQLite 3.24+, it supports standard upsert syntax.

        // Simpler fallback: check if exists, then update or insert.
        const existing = await this.db.get(`SELECT id FROM ${table} WHERE id = ? `, [record.id]);
        if (existing) {
            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const params = keys.map(k => record[k]).concat(record.id);
            await this.db.run(`UPDATE ${table} SET ${setClause} WHERE id = ? `, params, true);
        } else {
            const placeholdersArr = keys.map(() => '?').join(', ');
            const params = keys.map(k => record[k]);
            await this.db.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES(${placeholdersArr})`, params, true);
        }
    }
}
