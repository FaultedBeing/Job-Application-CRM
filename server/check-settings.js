const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.all('SELECT key, value FROM settings', (err, rows) => {
    const url = rows.find(r => r.key === 'supabase_url');
    const key = rows.find(r => r.key === 'supabase_key');
    console.log('URL defined:', !!url);
    console.log('Key defined:', !!key);
});
