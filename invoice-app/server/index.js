/*
  Einfacher Node/Express-Server für die Entwicklungsumgebung.

  Überblick:
  - `/api/ocr` empfängt eine PDF-Datei und versucht, sie an einen
  OCR-Wrapper (FastAPI/Python) weiterzuleiten. Falls das nicht klappt,
    fällt der Server auf `pdf-parse` als Fallback zurück.
  - `/nlp/extract` nimmt den reinen Text aus dem OCR (oder strukturierte
    OCR-Ausgabe) und wendet heuristische Regeln an, um Rechnungsfelder
    zu extrahieren (Lieferant, Empfänger, Positionen, Summen, Bankdaten).
  - Feedback- und Trainingsendpunkte speichern Korrekturen in einer
    lokalen SQLite-Datenbank.

  Diese Datei ist bewusst pragmatisch: Ziel ist ein stabiler Entwicklungs-
  workflow, nicht die produktionsreife NLP-Pipeline. Kommentare unten
  erklären die wichtigsten Stellen.
*/
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const FormData = require('form-data');
const { parseAddress, extractBankDetails, fuzzyFixCommonOcr } = require('./nlp_utils');

// Einfache Heuristik zur Klassifizierung: Eingangs- vs. Ausgangsrechnung
// Diese Funktion durchsucht den Text nach typischen Schlüsselwörtern
// und trifft eine Empfehlung. Die Heuristik ist absichtlich einfach;
// für zuverlässigere Ergebnisse ist später ein ML-Ansatz oder eine
// räumliche Analyse (Bounding-Boxes) sinnvoll.
function classifyInvoice(text) {
  const t = (text || '').toString();
  const low = t.toLowerCase();
  // Indikatoren für Ausgangs- bzw. Eingangsrechnung
  const outgoing = /(rechnung an|rechnungsempfänger|empfänger:|bill to|invoice to|kunde:|customer:)/i;
  const incoming = /(rechnung von|rechnungsteller|lieferant:|vendor:|invoice from|lieferant von|lieferant:)/i;

  if (outgoing.test(t)) return 'Ausgangsrechnung';
  if (incoming.test(t)) return 'Eingangsrechnung';

  // Fallback-Heuristiken
  if (/rechnung an[:\s]/i.test(t) || /kunde[:\s]/i.test(low)) return 'Ausgangsrechnung';
  if (/lieferant[:\s]/i.test(t) || /rechnung von[:\s]/i.test(t)) return 'Eingangsrechnung';

  return 'Unbestimmt';
}

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer-Konfiguration mit Limits (10 MiB) und PDF-Filter
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MiB
  fileFilter: function (req, file, cb) {
    const okMime = file.mimetype === 'application/pdf';
    const okExt = file.originalname && file.originalname.toLowerCase().endsWith('.pdf');
    if (!okMime && !okExt) return cb(new Error('Only pdf allowed'));
    cb(null, true);
  }
});
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));

// Hinweis zur Dateiablage:
// Uploaded-Dateien landen temporär im Ordner `server/uploads`. Das ist
// bewusst einfach — in Produktion würdest du die Dateien in einen
// seperaten Storage-Service (S3, Azure Blob) ablegen und nach der
// Verarbeitung ggf. löschen.

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

// Ensure invoices table has extended columns required for NLP and app features
const ensureInvoiceSchema = () => {
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
    needed.forEach(([name, type]) => {
      if (!cols.includes(name)) {
        const sql = `ALTER TABLE invoices ADD COLUMN ${name} ${type}`;
        db.run(sql, (e) => {
          if (e) console.error('Failed to add column', name, e.message);
          else console.log('Added invoices column', name);
        });
      }
    });
  });
};
ensureInvoiceSchema();

app.get('/api/health', (req, res) => res.json({ ok: true }));
// Multer error handling (file too large / invalid type)
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'file too large' });
  if (err && err.message === 'Only pdf allowed') return res.status(400).json({ ok: false, error: 'invalid file type' });
  next(err);
});

// POST /api/ocr - proxy to FastAPI wrapper with timeout and fallback to local pdf-parse
app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file uploaded' });
    const filePath = req.file.path;

    // Versuche, die Datei an vorhandene FastAPI-OCR-Wrapper weiterzuleiten
    const candidateWrapperUrls = [];
    if (process.env.OCR_WRAPPER_URL) candidateWrapperUrls.push(process.env.OCR_WRAPPER_URL);
    // Übliche lokale Ports für die Projekt-Wrapper (wahrscheinliche Reihenfolge)
    candidateWrapperUrls.push('http://127.0.0.1:8003/api/ocr');
    candidateWrapperUrls.push('http://127.0.0.1:8002/api/ocr');
    candidateWrapperUrls.push('http://127.0.0.1:8001/api/ocr');

    let proxied = false;
    for (const wrapperUrl of candidateWrapperUrls) {
        try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), { filename: req.file.originalname || req.file.filename });
        const headers = form.getHeaders();
        // Sende rohe Bytes, um Encoding-Probleme zu vermeiden; Antworte als ArrayBuffer
        const resp = await axios.post(wrapperUrl, form, { headers, timeout: 10000, responseType: 'arraybuffer' });
        if (resp && resp.data) {
          // Zuerst als UTF-8 parsen, bei Fehlern Latin1->UTF-8 als Reparaturversuch
          try {
            const text = Buffer.from(resp.data).toString('utf8');
            const d = JSON.parse(text);
            // Normalisiere die Antwort: Falls kein ocrText vorhanden ist, aber
            // `ocrResult.pages_structure`, erstelle daraus einen Fließtext für das NLP.
            if ((typeof d.ocrText !== 'string' || d.ocrText.trim() === '') && d.ocrResult && Array.isArray(d.ocrResult.pages_structure)) {
              const pages = d.ocrResult.pages_structure;
              d.ocrText = pages.map(p => (p.lines || []).map(l => l.line_text || '').join('\n')).join('\n\n');
            }
            // ensure NFC normalization on the main text field if available
            try { if (d.ocrText && typeof d.ocrText === 'string' && d.ocrText.normalize) d.ocrText = d.ocrText.normalize('NFC'); } catch(e) {}
            proxied = true;
            return res.json(d);
          } catch (parseErr) {
            // Erster Parse schlug fehl: Versuche eine Latin1->UTF8-Reparatur (häufig bei Mojibake)
            try {
              const latin = Buffer.from(resp.data).toString('latin1');
              // Rekonstruiere ein Buffer-Objekt aus dem Latin1-String und interpretiere als UTF-8
              const repaired = Buffer.from(latin, 'binary').toString('utf8');
              const d2 = JSON.parse(repaired);
              if ((typeof d2.ocrText !== 'string' || d2.ocrText.trim() === '') && d2.ocrResult && Array.isArray(d2.ocrResult.pages_structure)) {
                const pages = d2.ocrResult.pages_structure;
                d2.ocrText = pages.map(p => (p.lines || []).map(l => l.line_text || '').join('\n')).join('\n\n');
              }
              try { if (d2.ocrText && typeof d2.ocrText === 'string' && d2.ocrText.normalize) d2.ocrText = d2.ocrText.normalize('NFC'); } catch(e) {}
              proxied = true;
              console.warn(`Parsed OCR wrapper response from ${wrapperUrl} using latin1->utf8 fallback`);
              return res.json(d2);
            } catch (parseErr2) {
              console.warn(`Failed to parse OCR wrapper response from ${wrapperUrl} (utf8 and latin1 fallbacks):`, parseErr && parseErr.message ? parseErr.message : parseErr, parseErr2 && parseErr2.message ? parseErr2.message : parseErr2);
              // Weiter mit dem nächsten Kandidaten
            }
          }
        }
      } catch (proxyErr) {
        // log and try next candidate
        console.warn(`OCR wrapper proxy to ${wrapperUrl} failed (trying next):`, proxyErr && proxyErr.message ? proxyErr.message : proxyErr);
        continue;
      }
    }
    if (!proxied) {
      // Hinweis:
      // Wenn die Wrapper nicht erreichbar sind (z. B. weil das Python-
      // Service nicht gestartet wurde), wird ein Fallback auf `pdf-parse`
      // verwendet. Dieser Fallback ist langsamer und weniger robust,
      // liefert aber für einfache PDFs oft brauchbare Ergebnisse.
      console.warn('All OCR wrapper proxy attempts failed, falling back to local PDF parse');
    }

    // Fallback: lokale PDF-Auswertung mit `pdf-parse`
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
    // Hinweis:
    // dieser Endpunkt ist sehr einfach und dient als Beispiel,
    // wie man aus einem Text Feldinformationen extrahiert. Er wird
    // vom Frontend selten benutzt; stattdessen ist `/nlp/extract`
    // vorgesehen, da dieser strukturiertere Daten zurückgibt.
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
app.post('/nlp/extract', async (req, res) => {
  // If configured, try forwarding the request to an external NLP service.
  // Try a list of candidates (environment override -> localhost host port -> compose service name).
  // This makes local development (API running locally) work with the dockerized NLP mapped to host:8003,
  // and keeps the original compose DNS name for containerized runs.
  const forwardToken = process.env.NLP_API_TOKEN || null;
  const candidates = [];
  if (process.env.NLP_API_URL) candidates.push(process.env.NLP_API_URL);
  // common host port mapping we use in compose: host 8003 -> container 8000
  // The extracted NLP Flask app exposes its route under /nlp/extract (not /extract)
  candidates.push('http://localhost:8003/nlp/extract');
  // service name inside compose network
  candidates.push('http://nlp_api:8000/nlp/extract');

  // Prefer an explicit Authorization header from the incoming request, falling
  // back to the configured NLP_API_TOKEN if present.
  const incomingAuth = req.header('authorization');
  const authHeader = incomingAuth || (forwardToken ? `Bearer ${forwardToken}` : null);
  if (!authHeader) console.warn('No Authorization header for NLP forwarding (requests to NLP may be rejected)');

  let forwardedSuccess = false;
  for (const url of candidates) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;
      console.log(`Attempting to forward NLP request to ${url}`);
      const forwarded = await axios.post(url, req.body || {}, { headers, timeout: 20000 });
      if (forwarded && forwarded.data) {
        forwardedSuccess = true;
        return res.json(forwarded.data);
      }
    } catch (fErr) {
      // don't throw — try next candidate
      console.warn(`Forward to ${url} failed:`, fErr && fErr.message ? fErr.message : fErr);
      continue;
    }
  }
  if (!forwardedSuccess) {
    console.warn('All external NLP forward attempts failed, falling back to local heuristic extraction');
  }

  try {
    const { requestId: incomingRequestId, ocrText, ocrResult } = req.body || {};
    /*
      Wichtige Anmerkung zum `/nlp/extract` Endpunkt:

      "- Erwartet entweder einen einfachen `ocrText` (String) oder eine
        strukturierte `ocrResult`/`ocrText.pages`-Struktur, wie sie
        bestimmte OCR-Wrapper liefern.
      - Führt mehrere Heuristiken aus:
         * Normalisierung (fuzzyFixCommonOcr)
         * Extraktion von Rechnungsnummer, Datum, Summen
         * Aufteilung des oberen Seitenbereichs in Lieferant/Empfänger
         * Erkennung von Bankdaten (IBAN/BIC)
         * Parsen von Positionszeilen (sehr grob)

      Tipp: Diese Datei ist absichtlich heuristisch — wenn später
      Bounding-Box-Informationen verfügbar sind, sollten die heuristischen
      Splits durch räumliche Regeln ersetzt werden.
    */
    // Unterstützung für strukturierte OCR-Ausgaben (z. B. Seiten mit vollem Text)
    let text = '';
    if (typeof ocrText === 'string') text = ocrText;
    else if (ocrText && Array.isArray(ocrText.pages)) {
      text = ocrText.pages.map(p => p.full_text || '').join('\n');
    } else if (ocrResult && ocrResult.text) text = ocrResult.text;
    text = (text || '').toString();

    // Normalisiere typische OCR-Störungen (geschützte Leerzeichen, Mojibake)
    try { if (text && typeof text === 'string') text = fuzzyFixCommonOcr(text); } catch (e) { /* ignore */ }

    // Grundlegende Pattern-Abgleiche für wichtige Rechnungsfelder
    const invNoMatch = text && text.match(/(INV|Rechnungsnr\.?|Rechnung\s?Nr\.?)[^\d]*([0-9\-\/\w]+)/i);
    const dateMatch = text && text.match(/(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})/);
    const totalMatch = text && text.match(/(Gesamtbetrag|Total|Summe|Bruttobetrag)[^\d,]*(\d+[\d\.]*[,\.]\d{2})/i);

    // Hilfsfunktion: Zerlege Text in nicht-leere Zeilen
    const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Hilfsfunktion: Nimmt die folgenden Zeilen nach einem Schlüsselwort (Block)
    const captureBlockAfter = (keywords, maxLines = 4) => {
      const idx = lines.findIndex(l => keywords.some(k => new RegExp(k, 'i').test(l)));
      if (idx === -1) return null;
      return lines.slice(idx + 1, idx + 1 + maxLines).join('\n');
    };

    // Lieferant (leistendes Unternehmen) - Heuristiken
    let vendorRaw = null;
    vendorRaw = captureBlockAfter(['rechnung von', 'lieferant', 'rechnungssteller', 'from:']) || null;
    if (!vendorRaw) {
      // Fallback: oberer Dokumentbereich (erste 8 Zeilen). Kann bei zweispaltigen Kopfbereichen
      // sowohl Lieferant als auch Empfänger enthalten.
      const topLines = lines.slice(0, 8);
      vendorRaw = topLines.join('\n');
    }
    // Empfänger (Leistungsempfänger / Kunde)
    let recipientRaw = captureBlockAfter(['rechnung an', 'rechnungsempfänger', 'empfänger', 'bill to', 'invoice to']) || null;
    // Falls kein Empfänger erkannt wurde: Heuristische Teilung des Kopfbereichs (zweispaltige Layouts)
    if (!recipientRaw) {
      try {
        const top = (vendorRaw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // look for zip code lines (5-digit) to help split supplier vs recipient
        const zipIndices = top.map((l, i) => (/\b\d{5}\b/.test(l) ? i : -1)).filter(i => i !== -1);
        if (zipIndices.length >= 2) {
          // if two zip codes, split after the first zip occurrence
          const splitAt = zipIndices[0] + 1;
          vendorRaw = top.slice(0, splitAt).join('\n');
          recipientRaw = top.slice(splitAt).join('\n');
        } else if (top.length >= 4) {
          // fallback: split in middle
          const mid = Math.ceil(top.length / 2);
          vendorRaw = top.slice(0, mid).join('\n');
          recipientRaw = top.slice(mid).join('\n');
        }
      } catch (e) {
        // ignore heuristic errors and leave recipientRaw null
      }
    }

    // Zentrale Adress-Parsing-Routine aus `nlp_utils` (wendet fuzzy-Fixes an
    // und gibt {name, street, zip_code, city, raw} zurück).
    // Erklärung:
    // `parseAddress` versucht, aus einem Textblock sinnvolle Adresskomponenten
    // zu extrahieren. Da Dokumente sehr unterschiedlich formatiert sind,
    // priorisiert die Funktion Robustheit gegenüber Vollständigkeit.
    
    const vendor = parseAddress(vendorRaw);
    const recipient = parseAddress(recipientRaw);

    // Erkenne Bankdaten mit Hilfsfunktionen (robust gegenüber OCR-Fehlern)
    let bankIban, bankBic;
    try {
      // Normalisiere Text für Bank-Erkennung (entferne Nicht-Printable-Zeichen)
      let bankSearchText = text.replace(/[^\x00-\x7F]/g, ' ');
      bankSearchText = bankSearchText.replace(/\u00A0/g, ' ');
      const bank = extractBankDetails(bankSearchText);
      // Hinweis: extractBankDetails versucht zuerst, 'IBAN:' Labels
      // zu finden. Wenn das nicht klappt, sucht es nach IBAN-ähnlichen
      // Token. Die Funktion gibt Best-Effort-Ergebnisse zurück.
      if (bank && bank.iban) {
        bankIban = bank.iban;
        if (vendor) vendor.iban = bankIban;
      }
      if (bank && bank.bic) {
        bankBic = bank.bic;
        if (vendor) vendor.bic = bankBic;
      }
    } catch (e) { console.warn('bank extraction error', e); }

    // Prüfe, ob der erkannte Lieferant mit dem konfigurierten Firmenprofil übereinstimmt
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

    // Erkennung von Steuerkennzeichen (z. B. Steuernummer oder USt-IdNr)
    const taxIdMatch = text.match(/(Steuernummer|Steuer-Nr\.?|USt-IdNr\.?|Umsatzsteuer-Id(nr)?|USt-Id)[\s:]*([A-Z0-9\-\/\s]+)/i);
    const taxId = (taxIdMatch && taxIdMatch[2]) ? taxIdMatch[2].trim() : undefined;

    // Positionen und Summen: Verwende erweiterte Parser aus `nlp_utils` für robustere Extraktion
    const { parseItemsFromText, extractTotals } = require('./nlp_utils');
    const items = parseItemsFromText(text) || [];

    // Steueraufschlüsselung (z. B. '19% 100,00')
    const taxBreakdown = [];
    const taxRegex = /(\d{1,2})%[^\d\n\r]*(\d+[\.,]\d{2})/g;
    let tr;
    while ((tr = taxRegex.exec(text)) !== null) {
      taxBreakdown.push({ rate: tr[1] + '%', amount: tr[2].replace(',', '.') });
    }

    // USt-Betrag und Brutto-Summen über dedizierte Extraktionsroutine
    const totals = extractTotals(text);
    const vatAmount = totals && totals.vat !== undefined ? totals.vat : undefined;
    const grossTotal = totals && totals.gross !== undefined ? totals.gross : (totalMatch ? totalMatch[2].replace(',', '.') : undefined);

    const prediction = {
      classification: classifyInvoice(text),
      status: totalMatch ? 'Extrahiert' : 'Prüfung erforderlich',
      extractedData: {
        vendor,
        recipient,
        taxId,
        // Wenn vorhanden: erkannte Bankdaten einschließen
        iban: (vendor && vendor.iban) || bankIban,
        bic: (vendor && vendor.bic) || bankBic,
        issueDate: dateMatch ? dateMatch[0] : undefined,
        invoiceNumber: invNoMatch ? invNoMatch[2] : undefined,
        items: items.length ? items : undefined,
        taxBreakdown: taxBreakdown.length ? taxBreakdown : undefined,
        vatAmount,
        grossTotal,
        totalsTokens: (totals && totals.tokens) ? totals.tokens : undefined,
        currency: 'EUR',
        rawTextSample: text.slice(0, 1000)
      },
      confidence: totalMatch ? 0.8 : 0.45,
      meta: { source: 'nlp-extract-v2', heuristics: 'regex+lineheuristics' }
    };

    // Baue die formale Antwortstruktur, wie sie das Frontend erwartet
    const reqId = incomingRequestId || ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2,8));
    const status = prediction.confidence >= 0.6 ? 'ok' : 'partial';
    const warnings = [];

    const mapField = (name, value, conf) => ({ name, value: value !== undefined && value !== null ? String(value) : '', confidence: conf });

    const typeMap = (c) => {
      if (!c) return 'UNKNOWN';
      if (/ausgang/i.test(c) || /outgoing/i.test(c)) return 'OUTGOING';
      if (/eingang/i.test(c) || /incoming/i.test(c)) return 'INCOMING';
      return 'UNKNOWN';
    };

    const data = {
      type: typeMap(prediction.classification),
      fields: []
    };

    const ed = prediction.extractedData || {};
    data.fields.push(mapField('INVOICE_NO', ed.invoiceNumber, ed.invoiceNumber ? 0.95 : 0.2));
    data.fields.push(mapField('INVOICE_DATE', ed.issueDate, ed.issueDate ? 0.9 : 0.2));
    data.fields.push(mapField('SUPPLIER_NAME', ed.vendor && ed.vendor.name, ed.vendor && ed.vendor.name ? 0.9 : 0.2));
    data.fields.push(mapField('SUPPLIER_ADDRESS', ed.vendor && ed.vendor.raw, ed.vendor && ed.vendor.raw ? 0.8 : 0.2));
    data.fields.push(mapField('SUPPLIER_ADDRESS_STREET', ed.vendor && ed.vendor.street, ed.vendor && ed.vendor.street ? 0.8 : 0.2));
    data.fields.push(mapField('SUPPLIER_ADDRESS_CITY', ed.vendor && ((ed.vendor.zip_code ? (ed.vendor.zip_code + ' ') : '') + (ed.vendor.city || '')), (ed.vendor && (ed.vendor.zip_code || ed.vendor.city)) ? 0.8 : 0.2));
    data.fields.push(mapField('RECIPIENT_NAME', ed.recipient && ed.recipient.name, ed.recipient && ed.recipient.name ? 0.9 : 0.2));
    data.fields.push(mapField('RECIPIENT_ADDRESS', ed.recipient && ed.recipient.raw, ed.recipient && ed.recipient.raw ? 0.8 : 0.2));
    data.fields.push(mapField('ITEMS', ed.items ? JSON.stringify(ed.items) : undefined, ed.items ? 0.85 : 0.2));
    data.fields.push(mapField('TOTAL_GROSS', ed.grossTotal ? ed.grossTotal : undefined, ed.grossTotal ? 0.8 : 0.2));
    data.fields.push(mapField('VAT_AMOUNT', ed.vatAmount ? ed.vatAmount : undefined, ed.vatAmount ? 0.8 : 0.2));
    data.fields.push(mapField('IBAN', ed.iban ? ed.iban : undefined, ed.iban ? 0.9 : 0.2));
    data.fields.push(mapField('BIC', ed.bic ? ed.bic : undefined, ed.bic ? 0.9 : 0.2));

    // persist request + prediction in DB for traceability
    const createdAt = new Date().toISOString();
    try {
      const rq = JSON.stringify(req.body || {});
      const pj = JSON.stringify(prediction);
      db.run(`INSERT OR REPLACE INTO nlp_requests (requestId, requestJson, predictionJson, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`, [reqId, rq, pj, status, createdAt, createdAt], (e) => {
        if (e) console.error('Failed to save nlp_request', e.message);
      });
    } catch (e) {
      console.error('Failed to persist nlp_request', e);
    }

    res.json({ requestId: reqId, status, warnings, data });
  } catch (err) {
    console.error('nlp/extract error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /nlp/feedback - nimmt bearbeitete Vorhersage entgegen und speichert Trainingsdaten
app.post('/nlp/feedback', (req, res) => {
  try {
    // Kurz erklärt:
    // Dieser Endpunkt nimmt Korrekturen aus der UI entgegen und speichert
    // sie in der `training`-Tabelle sowie in `feedbacks`. Das erlaubt
    // späteres Überwachtes Lernen oder Analysen, welche Felder häufig
    // falsch erkannt werden.
    // Unterstützt zwei Formate:
    // 1) legacy: { jobId, invoiceId, originalPrediction, editedPrediction, editorId, notes }
    // 2) einfach: { requestId, corrections: [{ name, value }, ...] }
    const body = req.body || {};
    const createdAt = new Date().toISOString();

    if (body.requestId && Array.isArray(body.corrections)) {
      // Einfaches Korrekturformat
      const requestId = body.requestId;
      const corrections = body.corrections;
      // Lege eine Trainings-Zeile zur Rückverfolgbarkeit an
      const stmt = db.prepare(`INSERT INTO training (jobId, invoiceId, original, edited, editorId, notes, createdAt) VALUES (?,?,?,?,?,?,?)`);
      stmt.run(requestId||null, null, JSON.stringify({}), JSON.stringify({ corrections }), 'nlp-client', '', createdAt, function(err) {
        if (err) console.error('training insert error', err);
      });
      stmt.finalize();

      // Speichere jede Korrektur in der Tabelle `feedbacks`
      try {
        corrections.forEach(c => {
          const fbStmt = db.prepare(`INSERT INTO feedbacks (invoiceId, field, detectedText, correctText, page, bbox, errorType, timestamp) VALUES (?,?,?,?,?,?,?,?)`);
          fbStmt.run(null, c.name, '', c.value || '', null, JSON.stringify({}), 'correction', createdAt);
          fbStmt.finalize();
        });
      } catch (e) {
        console.error('Error saving corrections:', e);
        return res.status(500).json({ ok: false, error: e.message });
      }

      // Aktualisiere außerdem ggf. den Eintrag in `nlp_requests`
      try {
        db.run('UPDATE nlp_requests SET editedJson = ?, status = ?, updatedAt = ? WHERE requestId = ?', [JSON.stringify({ corrections }), 'edited', createdAt, requestId], (uerr) => {
          if (uerr) console.error('Failed to update nlp_requests with edits', uerr.message);
        });
      } catch (u) {
        console.error('nlp_requests update error', u);
      }

      return res.json({ requestId: body.requestId, saved: true });
    }

    // legacy handling
    const { jobId, invoiceId, originalPrediction, editedPrediction, editorId, notes } = body;
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
    // Hinweis: Diese Route speichert die geprüfte Rechnung in der lokalen
    // SQLite-Datenbank. Felder wie `vendor` werden als JSON gespeichert
    // wenn sie komplex sind. In produktivem Einsatz würde man hier
    // zusätzliche Validierungen und Authentifizierung einbauen.
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


