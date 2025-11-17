const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();

// small heuristic classifier: Eingangsrechnung (incoming) vs Ausgangsrechnung (outgoing)
function classifyInvoice(text) {
  const t = (text || '').toString();
  const low = t.toLowerCase();

  // strong indicators for outgoing invoice (invoice issued to a customer)
  const outgoing = /(rechnung an|rechnungsempfänger|empfänger:|bill to|invoice to|kunde:|customer:)/i;
  // strong indicators for incoming invoice (invoice received from a vendor)
  const incoming = /(rechnung von|rechnungsteller|lieferant:|vendor:|invoice from|lieferant von|lieferant:)/i;

  if (outgoing.test(t)) return 'Ausgangsrechnung';
  if (incoming.test(t)) return 'Eingangsrechnung';

  // fallback heuristics
  if (/rechnung an[:\s]/i.test(t) || /kunde[:\s]/i.test(low)) return 'Ausgangsrechnung';
  if (/lieferant[:\s]/i.test(t) || /rechnung von[:\s]/i.test(t)) return 'Eingangsrechnung';

  return 'Unbestimmt';
}

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
  db.run(`CREATE TABLE IF NOT EXISTS training (
    id INTEGER PRIMARY KEY,
    jobId TEXT,
    invoiceId INTEGER,
    original TEXT,
    edited TEXT,
    editorId TEXT,
    notes TEXT,
    createdAt TEXT
  )`);
  // company table to hold the operator / own-company profile
  db.run(`CREATE TABLE IF NOT EXISTS company (
    id INTEGER PRIMARY KEY,
    name TEXT,
    street TEXT,
    zip_code TEXT,
    city TEXT,
    vat_id TEXT
  )`);
  // ensure there is at least one company row (seed will be inserted later if needed)
});

// load company profile into memory (fallback if empty)
let companyProfile = null;
const loadCompany = () => {
  db.get('SELECT * FROM company LIMIT 1', (err, row) => {
    if (err) {
      console.error('Failed to load company profile:', err.message);
      companyProfile = null;
      return;
    }
    if (row) companyProfile = row;
    else {
      // seed default if none exists
      const seed = { name: 'Mustergesellschaft mbH', street: 'Musterstr. 11', zip_code: '12345', city: 'Musterstadt', vat_id: '' };
      db.run('INSERT INTO company (name,street,zip_code,city,vat_id) VALUES (?,?,?,?,?)', [seed.name, seed.street, seed.zip_code, seed.city, seed.vat_id], function(se) {
        if (se) return console.error('Failed to seed company profile:', se.message);
        db.get('SELECT * FROM company LIMIT 1', (er2, r2) => { if (!er2) companyProfile = r2; });
      });
    }
  });
};
loadCompany();

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
    invoice.classification = classifyInvoice(text);
    res.json({ ok: true, invoice });
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /nlp/extract - accepts OCR result JSON and returns structured prediction
app.post('/nlp/extract', (req, res) => {
  try {
    const { ocrText, ocrResult } = req.body || {};
    const text = (ocrText || (ocrResult && ocrResult.text) || '').toString();

    // basic matches used below
    const invNoMatch = text && text.match(/(INV|Rechnungsnr\.?|Rechnung\s?Nr\.?)[^\d]*([0-9\-\/\w]+)/i);
    const dateMatch = text && text.match(/(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/);
    const totalMatch = text && text.match(/(Gesamtbetrag|Total|Summe|Bruttobetrag)[^\d,]*(\d+[\d\.]*[,\.]\d{2})/i);

    // helper: split into non-empty lines
    const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // helper to capture a block of following lines after a keyword
    const captureBlockAfter = (keywords, maxLines = 4) => {
      const idx = lines.findIndex(l => keywords.some(k => new RegExp(k, 'i').test(l)));
      if (idx === -1) return null;
      return lines.slice(idx + 1, idx + 1 + maxLines).join('\n');
    };

    // vendor (leistendes Unternehmen) heuristics
    let vendorRaw = null;
    vendorRaw = captureBlockAfter(['rechnung von', 'lieferant', 'rechnungssteller', 'from:']) || null;
    if (!vendorRaw) {
      // fallback: top of document (first 4 lines)
      vendorRaw = lines.slice(0, 4).join('\n');
    }

    // recipient (Leistungsempfänger / Kunde)
    let recipientRaw = captureBlockAfter(['rechnung an', 'rechnungsempfänger', 'empfänger', 'bill to', 'invoice to']) || null;

    // try to parse simple address components (zip + city)
    const parseAddress = (block) => {
      if (!block) return null;
      const parts = block.split(/\n/).map(p => p.trim()).filter(Boolean);
      const name = parts[0] || undefined;
      const addr = parts.slice(1).join(', ') || undefined;
      let zip_code, city, street;
      // try to find a line containing zip and city
      const zipLine = parts.find(p => /\b\d{5}\b/.test(p));
      if (zipLine) {
        const m = zipLine.match(/(\d{5})\s+(.+)$/);
        if (m) { zip_code = m[1]; city = m[2]; }
      }
      // try to find street line (simple heuristic: contains digits)
      const streetLine = parts.find(p => /\d+/.test(p) && !/\d{5}/.test(p));
      if (streetLine) street = streetLine;
      return { name, street, zip_code, city, raw: block };
    };

    const vendor = parseAddress(vendorRaw);
    const recipient = parseAddress(recipientRaw);

    // mark if vendor matches the configured company profile
    try {
      if (companyProfile && vendor && vendor.name) {
        const norm = s => (s||'').toString().toLowerCase().replace(/[^a-z0-9äöüß]/gi,'').trim();
        const vname = norm(vendor.name);
        const cname = norm(companyProfile.name);
        const matchByName = cname && vname && vname.includes(cname);
        const matchByZipCity = companyProfile.zip_code && companyProfile.city && vendor.zip_code && vendor.city && (companyProfile.zip_code === vendor.zip_code && companyProfile.city.toLowerCase() === (vendor.city||'').toLowerCase());
        if (matchByName || matchByZipCity) {
          vendor.isOwnCompany = true;
        }
      }
    } catch (e) {
      console.error('Company match error', e);
    }

    // tax id detection (Steuernummer or USt-IdNr)
    const taxIdMatch = text.match(/(Steuernummer|Steuer-Nr\.?|USt-IdNr\.?|Umsatzsteuer-Id(nr)?|USt-Id)[\s:]*([A-Z0-9\-\/\s]+)/i);
    const taxId = taxIdMatch ? taxIdMatch[2].trim() : undefined;

    // items: naive scan for table-like lines with at least one decimal amount
    const items = [];
    const itemLineRegex = /^(\d+[\.,]?\d*)?\s*(x)?\s*(.+?)\s+(\d+[\.,]\d{2})\s*(€|EUR)?\s*(\d+[\.,]\d{2})?$/i;
    lines.forEach(line => {
      // skip summary/total lines
      if (/gesamt|summe|brutto|netto|steuer|umsatzsteuer|rechnung/i.test(line)) return;
      // try structured match
      const m = line.match(itemLineRegex);
      if (m) {
        const quantity = m[1] ? m[1].replace(',', '.') : undefined;
        const description = m[3] ? m[3].trim() : line;
        const unitOrPrice = m[4] ? m[4].replace(',', '.') : undefined;
        const lineTotal = m[6] ? m[6].replace(',', '.') : undefined;
        items.push({ raw: line, quantity, description, unitOrPrice, lineTotal });
      } else {
        // fallback: if line contains two amounts, treat as item
        const amounts = Array.from(line.matchAll(/(\d+[\.,]\d{2})/g)).map(a => a[1].replace(',', '.'));
        if (amounts.length >= 1 && /[A-Za-zÄÖÜäöüß]/.test(line)) {
          items.push({ raw: line, amounts });
        }
      }
    });

    // tax breakdowns (e.g., '19% 100,00')
    const taxBreakdown = [];
    const taxRegex = /(\d{1,2})%[^\d\n\r]*(\d+[\.,]\d{2})/g;
    let tr;
    while ((tr = taxRegex.exec(text)) !== null) {
      taxBreakdown.push({ rate: tr[1] + '%', amount: tr[2].replace(',', '.') });
    }

    // VAT amount
    const vatMatch = text.match(/(Umsatzsteuer|MwSt\.?|Mehrwertsteuer)[^\d\n\r]*(\d+[\.,]\d{2})/i);
    const vatAmount = vatMatch ? vatMatch[2].replace(',', '.') : undefined;

    // gross total (brutto)
    const grossTotal = totalMatch ? totalMatch[2].replace(',', '.') : undefined;

    const prediction = {
      classification: classifyInvoice(text),
      status: totalMatch ? 'Extrahiert' : 'Prüfung erforderlich',
      extractedData: {
        vendor,
        recipient,
        taxId,
        issueDate: dateMatch ? dateMatch[0] : undefined,
        invoiceNumber: invNoMatch ? invNoMatch[2] : undefined,
        items: items.length ? items : undefined,
        taxBreakdown: taxBreakdown.length ? taxBreakdown : undefined,
        vatAmount,
        grossTotal,
        currency: 'EUR',
        rawTextSample: text.slice(0, 1000)
      },
      confidence: totalMatch ? 0.8 : 0.45,
      meta: { source: 'nlp-extract-v2', heuristics: 'regex+lineheuristics' }
    };

    res.json({ ok: true, prediction });
  } catch (err) {
    console.error('nlp/extract error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /nlp/feedback - accepts edited prediction and stores training sample
app.post('/nlp/feedback', (req, res) => {
  try {
    const { jobId, invoiceId, originalPrediction, editedPrediction, editorId, notes } = req.body || {};
    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`INSERT INTO training (jobId, invoiceId, original, edited, editorId, notes, createdAt) VALUES (?,?,?,?,?,?,?)`);
    stmt.run(jobId||null, invoiceId||null, JSON.stringify(originalPrediction||{}), JSON.stringify(editedPrediction||{}), editorId||'', notes||'', createdAt, function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      const trainingId = this.lastID;

      try {
        if (editedPrediction && originalPrediction) {
          const orig = originalPrediction.extractedData || {};
          const edit = editedPrediction.extractedData || {};
          Object.keys(edit).forEach((field) => {
            const detected = orig[field] !== undefined ? String(orig[field]) : '';
            const correct = edit[field] !== undefined ? String(edit[field]) : '';
            if (detected !== correct) {
              const fbStmt = db.prepare(`INSERT INTO feedbacks (invoiceId, field, detectedText, correctText, page, bbox, errorType, timestamp) VALUES (?,?,?,?,?,?,?,?)`);
              fbStmt.run(invoiceId||null, field, detected, correct, null, JSON.stringify({}), 'correction', createdAt);
              fbStmt.finalize();
            }
          });
        }
      } catch (e) {
        console.error('Error saving field-level feedback:', e);
      }

      res.json({ ok: true, trainingId, jobId, invoiceId });
    });
    stmt.finalize();
  } catch (err) {
    console.error('nlp/feedback error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/invoices - persist invoice in sqlite
app.post('/api/invoices', (req, res) => {
  try {
    const inv = req.body;
    // ensure vendor column stores a readable string (or JSON) and keep raw as JSON
    const vendorToStore = (inv && typeof inv.vendor === 'object') ? JSON.stringify(inv.vendor) : (inv.vendor || '');
    const stmt = db.prepare(`INSERT INTO invoices (vendor, invoiceNumber, date, total, currency, raw, savedAt) VALUES (?,?,?,?,?,?,?)`);
    stmt.run(vendorToStore, inv.invoiceNumber||'', inv.date||'', inv.total||'', inv.currency||'', JSON.stringify(inv.raw||{}), new Date().toISOString(), function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, id: this.lastID });
    });
    stmt.finalize();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/company - return operator/company profile
app.get('/api/company', (req, res) => {
  db.get('SELECT * FROM company LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, company: row || null });
  });
});

// POST /api/company - upsert operator/company profile
app.post('/api/company', (req, res) => {
  const body = req.body || {};
  const name = body.name || '';
  const street = body.street || '';
  const zip_code = body.zip_code || '';
  const city = body.city || '';
  const vat_id = body.vat_id || '';
  db.get('SELECT id FROM company LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (row) {
      db.run('UPDATE company SET name=?, street=?, zip_code=?, city=?, vat_id=? WHERE id=?', [name, street, zip_code, city, vat_id, row.id], function(eu) {
        if (eu) return res.status(500).json({ ok: false, error: eu.message });
        loadCompany();
        res.json({ ok: true, updated: true });
      });
    } else {
      db.run('INSERT INTO company (name,street,zip_code,city,vat_id) VALUES (?,?,?,?,?)', [name, street, zip_code, city, vat_id], function(ei) {
        if (ei) return res.status(500).json({ ok: false, error: ei.message });
        loadCompany();
        res.json({ ok: true, created: true });
      });
    }
  });
});

// POST /api/feedbacks - persist feedback in sqlite
app.post('/api/feedbacks', (req, res) => {
  try {
    const fb = req.body;
    const stmt = db.prepare(`INSERT INTO feedbacks (invoiceId, field, detectedText, correctText, page, bbox, errorType, timestamp) VALUES (?,?,?,?,?,?,?,?)`);
    stmt.run(fb.invoiceId||null, fb.field||'', fb.detectedText||'', fb.correctText||'', fb.page||null, JSON.stringify(fb.bbox||{}), fb.errorType||'ocr', fb.timestamp|| new Date().toISOString(), function(err) {
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


