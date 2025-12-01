const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath, err => {
  if (err) {
    console.error('ERR:' + err.message);
    process.exit(1);
  }
  db.all("SELECT name,type FROM sqlite_master WHERE type='table' ORDER BY name", (e, rows) => {
    if (e) {
      console.error('ERR:' + e.message);
      process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  });
});
