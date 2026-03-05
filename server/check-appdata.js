const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const appDataPath = process.env.APPDATA || path.join(process.env.HOME || '', '.job-tracker-desktop');
const defaultDbPath = path.join(appDataPath, 'job-tracker-desktop', 'database.sqlite');
const alternateDbPath = path.join(appDataPath, 'database.sqlite'); // checking both possible paths

let targetDbPath = null;
if (fs.existsSync(defaultDbPath)) {
    targetDbPath = defaultDbPath;
} else if (fs.existsSync(alternateDbPath)) {
    targetDbPath = alternateDbPath;
} else {
    console.log('No AppData database found at either path:');
    console.log(defaultDbPath);
    console.log(alternateDbPath);
    process.exit(0);
}

console.log('Target DB:', targetDbPath);
const db = new sqlite3.Database(targetDbPath);

db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) console.error(err);
    const url = rows?.find(r => r.key === 'supabase_url');
    console.log('Supabase Configured:', !!url);

    db.get('SELECT count(*) as count FROM sync_queue WHERE synced_at IS NULL', (err, row) => {
        console.log('Pending syncs:', row);

        db.all('SELECT * FROM sync_queue WHERE synced_at IS NULL LIMIT 2', (err, rows) => {
            console.log('First 2 pending:', rows);

            db.get('SELECT count(*) as count FROM companies WHERE user_id IS NULL OR user_id = ""', (err, row) => {
                console.log('Unassigned local companies:', row);
            });
        });
    });
});
