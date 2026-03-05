/**
 * Job Application CRM - Serverless Email Reminder Lambda
 *
 * Reads due reminders from Supabase and sends them via AWS SES.
 * Runs on a schedule via EventBridge Cron. No PC required.
 *
 * Required Environment Variables (set in Lambda console):
 *   SUPABASE_URL          - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY  - Your Supabase service_role key (NOT the anon key)
 *   SETTINGS_ENCRYPTION_KEY - The same passphrase you set in the app under
 *                             Notifications > Serverless Email > Supabase Encryption Key.
 *                             Without this, the Lambda cannot decrypt your SES credentials.
 */

const https = require('https');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Cloud-safe decryption (mirrors database.ts encryptForCloud)
// Format: "CLOUD:<ivHex>:<authTagHex>:<ciphertextHex>"
// ---------------------------------------------------------------------------
const CLOUD_SALT = 'job-crm-supabase-settings-v1';

function decryptSetting(value, encryptionKey) {
    if (!value) return value;

    // Value synced without a passphrase — safe by design, Lambda refuses to use it
    if (value.startsWith('UNENCRYPTED:')) {
        throw new Error(
            `Credential was synced without cloud encryption. ` +
            `Set a Supabase Encryption Key in the app's Notification Settings, ` +
            `save, and wait for it to sync before running the Lambda again.`
        );
    }

    // Non-sensitive settings (not CLOUD-prefixed) returned as-is
    if (!value.startsWith('CLOUD:')) return value;

    if (!encryptionKey) {
        throw new Error(
            'SETTINGS_ENCRYPTION_KEY environment variable is required to decrypt credentials stored in Supabase. ' +
            'Set it to the same passphrase you entered in the app\'s Notification Settings.'
        );
    }

    const parts = value.split(':');
    // Format: CLOUD : ivHex : authTagHex : ciphertextHex
    if (parts.length !== 4) throw new Error('Invalid CLOUD-encrypted value format.');
    const [, ivHex, authTagHex, encrypted] = parts;

    const key = crypto.pbkdf2Sync(encryptionKey, CLOUD_SALT, 100000, 32, 'sha256');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ---------------------------------------------------------------------------
// Supabase helpers (lightweight, no SDK needed in Lambda)
// ---------------------------------------------------------------------------
async function supabaseRequest(url, apiKey, method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: new URL(url).hostname,
            path: `/rest/v1${path}`,
            method,
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': method === 'GET' ? 'return=representation' : 'return=minimal',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function getSettings(supabaseUrl, supabaseKey, userId) {
    const res = await supabaseRequest(
        supabaseUrl, supabaseKey, 'GET',
        `/settings?user_id=eq.${encodeURIComponent(userId)}&select=key,value`
    );
    if (!res.data || !Array.isArray(res.data)) return {};
    return res.data.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
}

async function getDueReminders(supabaseUrl, supabaseKey, userId) {
    const now = new Date().toISOString();
    const res = await supabaseRequest(
        supabaseUrl, supabaseKey, 'GET',
        `/reminders?user_id=eq.${encodeURIComponent(userId)}&notify_email=eq.1&sent_at=is.null&due_at=lte.${encodeURIComponent(now)}&select=*`
    );
    return res.data || [];
}

async function markReminderSent(supabaseUrl, supabaseKey, userId, reminderId) {
    await supabaseRequest(
        supabaseUrl, supabaseKey, 'PATCH',
        `/reminders?id=eq.${reminderId}&user_id=eq.${encodeURIComponent(userId)}`,
        { sent_at: new Date().toISOString() }
    );
}

async function getDistinctUsers(supabaseUrl, supabaseKey) {
    const now = new Date().toISOString();
    const res = await supabaseRequest(
        supabaseUrl, supabaseKey, 'GET',
        `/reminders?notify_email=eq.1&sent_at=is.null&due_at=lte.${encodeURIComponent(now)}&select=user_id`
    );
    if (!res.data || !Array.isArray(res.data)) return [];
    const ids = [...new Set(res.data.map(r => r.user_id).filter(Boolean))];
    return ids;
}

// ---------------------------------------------------------------------------
// Email sender
// ---------------------------------------------------------------------------
async function createTransporter(settings, encryptionKey) {
    const host = settings.ses_smtp_host || `email-smtp.${settings.ses_region || 'us-east-1'}.amazonaws.com`;
    const port = parseInt(settings.ses_smtp_port || '587', 10);
    const user = settings.ses_key_id;  // ses_key_id is not in ENCRYPTED_KEYS, stored as plaintext
    const pass = decryptSetting(settings.ses_secret_key, encryptionKey);

    if (!user || !pass) throw new Error('SES SMTP credentials not configured. Set ses_key_id and ses_secret_key in Notification Settings.');

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
}

function buildEmailHtml(reminder) {
    return `
    <div style="font-family: sans-serif; padding: 24px; background: #f9fafb;">
      <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-top: 0;">📅 Job Application Reminder</h2>
        <p style="color: #374151; font-size: 16px; line-height: 1.5;">${reminder.message}</p>
        ${reminder.link_path ? `<p style="color: #6b7280; font-size: 13px;">View in app: ${reminder.link_path}</p>` : ''}
        <hr style="border: 1px solid #f3f4f6; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          This reminder was due at ${new Date(reminder.due_at).toLocaleString()}.<br/>
          Sent by your Job Application CRM — serverless email via AWS SES.
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.');
        return { statusCode: 500, body: 'Missing Supabase configuration' };
    }

    if (!ENCRYPTION_KEY) {
        console.error('SETTINGS_ENCRYPTION_KEY is not set. Lambda cannot decrypt SES credentials stored in Supabase. Add this env var in the Lambda console — it must match the passphrase set in the app\'s Notification Settings.');
        return { statusCode: 500, body: 'SETTINGS_ENCRYPTION_KEY not set' };
    }

    console.log('[CRM-Lambda] Starting reminder check...');

    let totalSent = 0;
    let totalFailed = 0;

    try {
        // Get all unique users with due reminders
        const userIds = await getDistinctUsers(SUPABASE_URL, SUPABASE_KEY);
        console.log(`[CRM-Lambda] Found ${userIds.length} user(s) with due reminders.`);

        for (const userId of userIds) {
            try {
                const settings = await getSettings(SUPABASE_URL, SUPABASE_KEY, userId);
                const reminders = await getDueReminders(SUPABASE_URL, SUPABASE_KEY, userId);
                console.log(`[CRM-Lambda] User ${userId}: ${reminders.length} due reminders.`);

                if (reminders.length === 0) continue;

                if (!settings.ses_key_id || !settings.ses_secret_key) {
                    console.warn(`[CRM-Lambda] User ${userId}: SES credentials not configured. Skipping.`);
                    continue;
                }

                const from = settings.ses_from;
                const to = settings.ses_recipient || settings.ses_from;

                if (!from || !to) {
                    console.warn(`[CRM-Lambda] User ${userId}: SES from/to email not set. Skipping.`);
                    continue;
                }

                // This will throw with a clear message if decryption fails
                const transporter = await createTransporter(settings, ENCRYPTION_KEY);

                const threshold = parseInt(settings.notification_email_summary_threshold || '5', 10);

                if (reminders.length >= threshold) {
                    const summaryHtml = `
            <div style="font-family: sans-serif; padding: 24px; background: #f9fafb;">
              <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                <h2 style="color: #1f2937; margin-top: 0;">📋 ${reminders.length} Job Application Reminders Due</h2>
                <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
                  ${reminders.map(r => `<li>${r.message} <span style="color:#9ca3af; font-size:12px;">(due ${new Date(r.due_at).toLocaleString()})</span></li>`).join('')}
                </ul>
                <hr style="border: 1px solid #f3f4f6; margin: 20px 0;" />
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">Sent by your Job Application CRM via AWS SES.</p>
              </div>
            </div>
          `;

                    await transporter.sendMail({
                        from,
                        to,
                        subject: `[Job CRM] ${reminders.length} reminders need your attention`,
                        html: summaryHtml,
                    });

                    for (const reminder of reminders) {
                        await markReminderSent(SUPABASE_URL, SUPABASE_KEY, userId, reminder.id);
                    }
                    totalSent += reminders.length;
                    console.log(`[CRM-Lambda] User ${userId}: Sent 1 summary email for ${reminders.length} reminders.`);

                } else {
                    for (const reminder of reminders) {
                        try {
                            await transporter.sendMail({
                                from,
                                to,
                                subject: `[Job CRM] Reminder: ${reminder.message.substring(0, 80)}`,
                                html: buildEmailHtml(reminder),
                            });
                            await markReminderSent(SUPABASE_URL, SUPABASE_KEY, userId, reminder.id);
                            totalSent++;
                        } catch (mailErr) {
                            console.error(`[CRM-Lambda] Failed to send reminder ${reminder.id}:`, mailErr);
                            totalFailed++;
                        }
                    }
                    console.log(`[CRM-Lambda] User ${userId}: Sent ${reminders.length} individual emails.`);
                }

            } catch (userErr) {
                console.error(`[CRM-Lambda] Error processing user ${userId}:`, userErr);
            }
        }
    } catch (err) {
        console.error('[CRM-Lambda] Fatal error:', err);
        return { statusCode: 500, body: err.message };
    }

    const summary = `Done. Sent: ${totalSent}, Failed: ${totalFailed}`;
    console.log(`[CRM-Lambda] ${summary}`);
    return { statusCode: 200, body: summary };
};
