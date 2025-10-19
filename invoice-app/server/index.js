const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));

// Setup simple sqlite DB
const DB_FILE = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY,
    vendor TEXT,
    invoiceNumber TEXT,
    date TEXT,
    total TEXT,
    currency TEXT,
    raw TEXT,
    savedAt TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY,
    invoiceId INTEGER,
    field TEXT,
    detectedText TEXT,
    correctText TEXT,
    page INTEGER,
    bbox TEXT,
    errorType TEXT,
    timestamp TEXT
  )`);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// POST /api/ocr - accepts file, extracts text with pdf-parse
app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file uploaded' });
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text || '';
    res.json({ ok: true, ocrText: text, pages: pdfData.numpages || 1, savedFile: req.file.filename });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/extract - very small heuristic extraction from text
app.post('/api/extract', (req, res) => {
  try {
    const { text } = req.body;
    const now = new Date();
    // naive regex-based examples
    const invNoMatch = text && text.match(/(INV|Rechnungsnr\.?|Rechnung\s?Nr\.?)[^\d]*([0-9\-\/\w]+)/i);
    const dateMatch = text && text.match(/(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/);
    const totalMatch = text && text.match(/(Gesamtbetrag|Total|Summe)[^\d,]*(\d+[\d\.]*[,\.]\d{2})/i);

    const invoice = {
      id: Date.now(),
      vendor: 'unknown',
      invoiceNumber: invNoMatch ? invNoMatch[2] : 'UNKNOWN',
      date: dateMatch ? dateMatch[0] : now.toISOString().slice(0,10),
      total: totalMatch ? totalMatch[2].replace(',', '.') : '0.00',
      currency: 'EUR',
      rawTextSample: (text || '').slice(0, 300)
    };
    res.json({ ok: true, invoice });
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/invoices - persist invoice in sqlite
app.post('/api/invoices', (req, res) => {
  try {
    const inv = req.body;
    const stmt = db.prepare(`INSERT INTO invoices (vendor, invoiceNumber, date, total, currency, raw, savedAt) VALUES (?,?,?,?,?,?,?)`);
    stmt.run(inv.vendor||'', inv.invoiceNumber||'', inv.date||'', inv.total||'', inv.currency||'', JSON.stringify(inv.raw||{}), new Date().toISOString(), function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, id: this.lastID });
    });
    stmt.finalize();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/feedbacks - persist feedback in sqlite
app.post('/api/feedbacks', (req, res) => {
  try {
    const fb = req.body;
    const stmt = db.prepare(`INSERT INTO feedbacks (invoiceId, field, detectedText, correctText, page, bbox, errorType, timestamp) VALUES (?,?,?,?,?,?,?,?)`);
    stmt.run(fb.invoiceId||null, fb.field||'', fb.detectedText||'', fb.correctText||'', fb.page||null, JSON.stringify(fb.bbox||{}), fb.errorType||'ocr', fb.timestamp||new Date().toISOString(), function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, feedbackId: this.lastID, feedback: fb });
    });
    stmt.finalize();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Test API (sqlite) listening: http://localhost:${port}`));
