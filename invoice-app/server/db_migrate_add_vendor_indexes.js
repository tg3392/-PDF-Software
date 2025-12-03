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
  const statements = [
    "CREATE INDEX IF NOT EXISTS idx_invoices_vendor_name ON invoices (vendor_name)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_vendor_city ON invoices (vendor_city)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_iban ON invoices (iban)"
  ];

  (function next(i){
    if (i >= statements.length) {
      console.log('Index creation complete');
      db.close();
      return;
    }
    const sql = statements[i];
    console.log('Executing:', sql);
    db.run(sql, (err) => {
      if (err) console.error('Failed to create index:', err.message);
      else console.log('OK');
      next(i+1);
    });
  })(0);
});
