const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const LAMBDA_DIR = path.join(__dirname, 'lambda-src');
const PUBLIC_DIR = path.join(__dirname, 'client', 'public');
const ZIP_PATH = path.join(PUBLIC_DIR, 'lambda-deployment.zip');

// 1. Create lambda-src directory if it doesn't exist
if (!fs.existsSync(LAMBDA_DIR)) {
    fs.mkdirSync(LAMBDA_DIR, { recursive: true });
}

// 2. Write the Lambda function code
// We use a different way to represent the code to avoid backtick hell
const lambdaCode = [
    "const { createClient } = require('@supabase/supabase-js');",
    "const axios = require('axios');",
    "const nodemailer = require('nodemailer');",
    "",
    "exports.handler = async (event) => {",
    "    const supabaseUrl = process.env.SUPABASE_URL;",
    "    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    "    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase environment variables');",
    "    const supabase = createClient(supabaseUrl, supabaseKey);",
    "    try {",
    "        // 1. Process email reminders (should run every time)",
    "        await handleEmailReminders(supabase);",
    "        ",
    "        // 2. Process daily summary (only once per day around 1 AM UTC)",
    "        await sendDailySummary(supabase); ",
    "        ",
    "        return { statusCode: 200, body: 'Processed successfully' };",
    "    } catch (err) {",
    "        console.error('Lambda Execution Error:', err);",
    "        return { statusCode: 500, body: err.message };",
    "    }",
    "};",
    "",
    "async function handleEmailReminders(supabase) {",
    "    const now = new Date().toISOString();",
    "    // Find notifications that are due now or in the past, and haven't been delivered yet",
    "    const { data: notifications, error } = await supabase.from('notifications')",
    "        .select('*')",
    "        .is('delivered_email_at', null)",
    "        .eq('notify_email', 1)",
    "        .lte('due_at', now);",
    "",
    "    if (error) throw error;",
    "    if (!notifications || notifications.length === 0) return;",
    "",
    "    const { data: settingsList } = await supabase.from('settings').select('*');",
    "    const settings = Object.fromEntries(settingsList.map(s => [s.key, s.value]));",
    "    if (settings.email_enabled !== 'true') return;",
    "",
    "    const transporter = nodemailer.createTransport({",
    "        host: settings.smtp_host, ",
    "        port: parseInt(settings.smtp_port), ",
    "        secure: settings.smtp_secure === 'true',",
    "        auth: { user: settings.smtp_user, pass: settings.smtp_pass }",
    "    });",
    "",
    "    for (const notif of notifications) {",
    "        console.log(`Sending email for notification: ${notif.id}`);",
    "        await transporter.sendMail({ ",
    "            from: settings.smtp_from, ",
    "            to: settings.smtp_recipient || settings.smtp_from, ",
    "            subject: `Reminder: ${notif.title}`, ",
    "            text: `${notif.message}\\n\\n-- Sent via Cloud Tracker Sync` ",
    "        });",
    "        await supabase.from('notifications').update({ delivered_email_at: new Date().toISOString() }).eq('id', notif.id);",
    "    }",
    "}",
    "",
    "async function sendDailySummary(supabase) {",
    "    const now = new Date();",
    "    // Only attempt summary during the 1 AM hour UTC",
    "    if (now.getUTCHours() !== 1) return;",
    "",
    "    const today = now.toISOString().split('T')[0];",
    "    const { data: lastSent } = await supabase.from('settings')",
    "        .select('value')",
    "        .eq('key', 'last_summary_sent_at')",
    "        .maybeSingle();",
    "",
    "    if (lastSent && lastSent.value === today) return; // Already sent today",
    "",
    "    console.log('Generating daily summary...');",
    "    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();",
    "    const { data: activities, error } = await supabase.from('activity_log').select('*').gte('timestamp', yesterday);",
    "    if (error) throw error;",
    "",
    "    const { data: settingsList } = await supabase.from('settings').select('*');",
    "    const settings = Object.fromEntries(settingsList.map(s => [s.key, s.value]));",
    "    ",
    "    if (settings.discord_enabled !== 'true' || !settings.discord_bot_token || !settings.discord_recipient_id) return;",
    "",
    "    let summary = \"**Daily Progress Summary**\\n\";",
    "    if (activities && activities.length > 0) {",
    "         summary += `Great work! You accomplished ${activities.length} actions in the last 24 hours.`;",
    "    } else {",
    "         summary += \"No tracking activity recorded in the last 24 hours. Keep pushing!\";",
    "    }",
    "",
    "    const idsString = settings.discord_recipient_id || \"\";",
    "    let ids = [];",
    "    try {",
    "        const parsed = JSON.parse(idsString);",
    "        if (Array.isArray(parsed)) {",
    "            ids = parsed.map(r => typeof r === 'string' ? r : r.id);",
    "        } else {",
    "            ids = [idsString];",
    "        }",
    "    } catch (e) {",
    "        ids = idsString.split(',').map(id => id.trim());",
    "    }",
    "",
    "    for (const id of ids) {",
    "        if (!id) continue;",
    "        await axios.post(`https://discord.com/api/v10/channels/${id}/messages`, { content: summary }, { ",
    "            headers: { Authorization: `Bot ${settings.discord_bot_token.trim()}`, 'Content-Type': 'application/json' } ",
    "        });",
    "    }",
    "",
    "    // Mark as sent today",
    "    await supabase.from('settings').upsert({ key: 'last_summary_sent_at', value: today });",
    "}"
].join('\n');

fs.writeFileSync(path.join(LAMBDA_DIR, 'index.js'), lambdaCode);

// 3. Write package.json for the Lambda function
const packageJson = {
    "name": "job-tracker-lambda",
    "version": "1.0.0",
    "description": "Serverless notifications for Job Application Tracker",
    "main": "index.js",
    "dependencies": {
        "@supabase/supabase-js": "^2.39.7",
        "axios": "^1.6.7",
        "nodemailer": "^6.9.11"
    }
};
fs.writeFileSync(path.join(LAMBDA_DIR, 'package.json'), JSON.stringify(packageJson, null, 2));

// 4. Install dependencies inside lambda-src
console.log('Installing Lambda dependencies...');
execSync('npm install', { cwd: LAMBDA_DIR, stdio: 'inherit' });

// 5. Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// 6. Zip the folder
console.log('Zipping deployment package...');

async function finalize() {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(ZIP_PATH);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`✅ Zip file created successfully at ${ZIP_PATH} (${archive.pointer()} total bytes)`);

            // 7. Copy ZIP to distribution folder if it exists
            const DIST_DIR = path.join(__dirname, 'client', 'dist');
            if (fs.existsSync(DIST_DIR)) {
                const DIST_ZIP_PATH = path.join(DIST_DIR, 'lambda-deployment.zip');
                fs.copyFileSync(ZIP_PATH, DIST_ZIP_PATH);
                console.log(`✅ Also copied ZIP to ${DIST_ZIP_PATH}`);
            }
            resolve();
        });

        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.directory(LAMBDA_DIR, false);
        archive.finalize();
    });
}

finalize().catch(err => {
    console.error('Finalization Error:', err);
    process.exit(1);
});
