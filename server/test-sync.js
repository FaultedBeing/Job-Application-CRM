const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite');

db.get('SELECT value FROM settings WHERE key = ?', ['supabase_url'], (err, urlRow) => {
    if (err || !urlRow) return console.error('No URL');

    db.get('SELECT value FROM settings WHERE key = ?', ['supabase_key'], async (err, keyRow) => {
        if (err || !keyRow) return console.error('No Key');

        console.log('Connecting to Supabase...');

        try {
            // Intentionally passing an extra SQLite column that might be failing the schema check
            const mockCompany = {
                name: 'Test Sync Co',
                user_id: 'test_admin',
                job_count: 0
            };

            console.log('Attempting Upsert:', mockCompany);

            const response = await fetch(`${urlRow.value}/rest/v1/companies`, {
                method: 'POST',
                headers: {
                    'apikey': keyRow.value,
                    'Authorization': `Bearer ${keyRow.value}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                },
                body: JSON.stringify(mockCompany)
            });

            const responseData = await response.text();

            if (!response.ok) {
                console.error('Supabase Rejection Error:', response.status, responseData);
            } else {
                console.log('Success:', responseData);
            }
        } catch (e) {
            console.error('Exception:', e);
        }
    });
});
