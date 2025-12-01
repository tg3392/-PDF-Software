const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_FILE = path.join(__dirname, 'data.db');

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
  console.log('Opened DB for migration:', DB_FILE);
});

const ensure = () => {
  db.all("PRAGMA table_info(invoices)", (err, rows) => {
    if (err) return console.error('Failed to read invoices schema:', err.message);
    const cols = (rows || []).map(r => r.name);
    const needed = [
      ['classification', 'TEXT'],
      ['status', 'TEXT'],
      ['confidence', 'REAL'],
      ['items', 'TEXT'],
      ['taxBreakdown', 'TEXT'],
      ['vatAmount', 'TEXT'],
      ['grossTotal', 'TEXT'],
      ['iban', 'TEXT'],
      ['ocrText', 'TEXT'],
      ['createdAt', 'TEXT'],
      ['updatedAt', 'TEXT']
    ];
    let pending = 0;
    needed.forEach(([name, type]) => {
      if (!cols.includes(name)) {
        pending++;
        const sql = `ALTER TABLE invoices ADD COLUMN ${name} ${type}`;
        db.run(sql, (e) => {
          if (e) console.error('Failed to add column', name, e.message);
          else console.log('Added invoices column', name);
          pending--;
          if (pending === 0) finish();
        });
      }
    });
    if (pending === 0) finish();
  });
};

const finish = () => {
  console.log('Migration completed');
  db.close();
};

ensure();

// ensure nlp_requests table exists
db.run(`CREATE TABLE IF NOT EXISTS nlp_requests (
  id INTEGER PRIMARY KEY,
  requestId TEXT UNIQUE,
  requestJson TEXT,
  predictionJson TEXT,
  editedJson TEXT,
  status TEXT,
  createdAt TEXT,
  updatedAt TEXT
)`, (err) => {
  if (err) console.error('Failed to ensure nlp_requests table:', err.message);
  else console.log('Ensured nlp_requests table exists');
});

