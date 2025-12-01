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
  // Create vendors table if not exists
  db.run(`CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY,
    name TEXT,
    street TEXT,
    city TEXT,
    zip_code TEXT,
    iban TEXT,
    bic TEXT,
    createdAt TEXT
  )`, (err) => {
    if (err) return console.error('Failed to create vendors table', err.message);

    // Ensure invoices has vendor_id column
    db.all("PRAGMA table_info(invoices)", (err2, rows) => {
      if (err2) return console.error('Failed to read invoices schema:', err2.message);
      const cols = (rows || []).map(r => r.name);
      const ensureVendorId = () => {
        if (!cols.includes('vendor_id')) {
          db.run('ALTER TABLE invoices ADD COLUMN vendor_id INTEGER', (ae) => {
            if (ae) console.error('Failed to add vendor_id column', ae.message);
            else console.log('Added vendor_id column to invoices');
            backfill();
          });
        } else {
          backfill();
        }
      };

      const backfill = () => {
        console.log('Backfilling vendors table from invoices...');
        // Gather distinct vendor info rows
        db.all(`SELECT DISTINCT vendor_name, vendor_street, vendor_city, iban, bic FROM invoices WHERE vendor_name IS NOT NULL AND vendor_name != ''`, (gerr, rows2) => {
          if (gerr) return console.error('Select distinct failed', gerr.message);
          const insertVendor = db.prepare('INSERT INTO vendors (name,street,city,zip_code,iban,bic,createdAt) VALUES (?,?,?,?,?,?,?)');
          const findVendor = (name, street, city, cb) => {
            db.get('SELECT id FROM vendors WHERE name = ? AND (street IS ? OR street = ?) AND (city IS ? OR city = ?)', [name, street || null, street || '', city || null, city || ''], cb);
          };

          (function loop(i){
            if (i >= rows2.length) {
              insertVendor.finalize(() => {
                console.log('Vendor insertions complete, updating invoices with vendor_id...');
                // update invoices by joining on vendor_name/vendor_street/vendor_city
                db.each('SELECT id, vendor_name, vendor_street, vendor_city FROM invoices WHERE vendor_name IS NOT NULL AND vendor_name != "" AND (vendor_id IS NULL OR vendor_id = 0)', (uerr, invRow) => {
                  if (uerr) return console.error('Each error', uerr.message);
                  findVendor(invRow.vendor_name, invRow.vendor_street, invRow.vendor_city, (ferr, found) => {
                    if (ferr) return console.error('findVendor error', ferr.message);
                    if (found && found.id) {
                      db.run('UPDATE invoices SET vendor_id = ? WHERE id = ?', [found.id, invRow.id]);
                    }
                  });
                }, () => {
                  console.log('Invoices updated with vendor_id where matches found');
                  db.close();
                });
              });
              return;
            }
            const r = rows2[i];
            const name = r.vendor_name || null;
            const street = r.vendor_street || null;
            const city = r.vendor_city || null;
            const iban = r.iban || null;
            const bic = r.bic || null;
            // check if vendor already exists
            findVendor(name, street, city, (ferr, found) => {
              if (ferr) return console.error('findVendor error', ferr.message);
              if (found && found.id) {
                // already present
                loop(i+1);
              } else {
                insertVendor.run(name, street, city, null, iban, bic, new Date().toISOString(), (inErr) => {
                  if (inErr) console.error('insertVendor error', inErr.message);
                  loop(i+1);
                });
              }
            });
          })(0);
        });
      };

      ensureVendorId();
    });
  });
});
