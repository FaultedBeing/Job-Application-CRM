const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.get('SELECT count(*) as count FROM sync_queue', (err, row) => {
    console.log('Total queue size:', row);

    db.get('SELECT count(*) as count FROM sync_queue WHERE synced_at IS NULL', (err, row) => {
        console.log('Pending syncs:', row);

        db.all('SELECT * FROM sync_queue WHERE synced_at IS NULL LIMIT 5', (err, rows) => {
            console.log('First 5 pending:', rows);

            db.get('SELECT count(*) as count FROM companies WHERE user_id IS NULL OR user_id = ""', (err, row) => {
                console.log('Unassigned companies:', row);
            });
        });
    });
});
