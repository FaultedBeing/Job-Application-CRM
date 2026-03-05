const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');

const db = new sqlite3.Database('./database.sqlite');

db.get('SELECT value FROM settings WHERE key = ?', ['supabase_url'], (err, urlRow) => {
    db.get('SELECT value FROM settings WHERE key = ?', ['supabase_key'], async (err, keyRow) => {
        if (!urlRow || !keyRow) return console.log('No keys');

        // Create client using the key saved from the wizard
        const supabase = createClient(urlRow.value, keyRow.value);

        console.log('Sending user_id: "admin"');
        const { data: data2, error: error2 } = await supabase.from('companies').upsert({ name: 'Type Test', user_id: 'admin' }).select();
        console.log('Error:', error2);
    });
});
