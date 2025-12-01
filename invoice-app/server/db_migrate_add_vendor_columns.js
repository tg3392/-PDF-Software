const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.db');
if (!fs.existsSync(DB_FILE)) {
  console.error('Database file not found:', DB_FILE);
  process.exit(1);
}

const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.all("PRAGMA table_info(invoices)", (err, rows) => {
    if (err) return console.error('Failed to read invoices schema:', err.message);
    const cols = (rows || []).map(r => r.name);
    const toAdd = [];
    if (!cols.includes('vendor_name')) toAdd.push("ALTER TABLE invoices ADD COLUMN vendor_name TEXT");
    if (!cols.includes('vendor_street')) toAdd.push("ALTER TABLE invoices ADD COLUMN vendor_street TEXT");
    if (!cols.includes('vendor_city')) toAdd.push("ALTER TABLE invoices ADD COLUMN vendor_city TEXT");
    if (!cols.includes('iban')) toAdd.push("ALTER TABLE invoices ADD COLUMN iban TEXT");
    if (!cols.includes('bic')) toAdd.push("ALTER TABLE invoices ADD COLUMN bic TEXT");

    (function next(i){
      if (i>=toAdd.length) return backfill();
      const sql = toAdd[i];
      console.log('Running:', sql);
      db.run(sql, (e)=>{
        if (e) console.error('Add column failed', e.message);
        else console.log('Added column');
        next(i+1);
      });
    })(0);

    function backfill(){
      console.log('Backfilling vendor columns from vendor JSON where available...');
      db.all('SELECT id, vendor FROM invoices', (e, rows2) => {
        if (e) return console.error('select failed', e.message);
        const upd = db.prepare('UPDATE invoices SET vendor_name = ?, vendor_street = ?, vendor_city = ?, iban = ?, bic = ? WHERE id = ?');
        rows2.forEach(r => {
          if (!r.vendor) return;
          let v = null;
          try { v = JSON.parse(r.vendor); } catch (ex) { return; }
          const name = v.name || null;
          const street = v.street || null;
          const city = v.city || v.zip_code || null;
          const iban = v.iban || null;
          const bic = v.bic || null;
          upd.run(name, street, city, iban, bic, r.id, (er) => { if (er) console.error('update failed', er.message); });
        });
        upd.finalize(() => { console.log('Backfill complete'); db.close(); });
      });
    }
  });
});
