const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const filePath = path.join(__dirname, 'example-invoice-for-upload.pdf');
const baseUrl = 'http://localhost:3000';

(async () => {
  try {
    console.log('1) Uploading PDF to /api/ocr...');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const ocrResp = await axios.post(baseUrl + '/api/ocr', form, { headers: form.getHeaders(), timeout: 30000 });
    console.log('OCR response status:', ocrResp.status);
    const ocrData = ocrResp.data || {};

    console.log('2) Calling /nlp/extract...');
    const nlpResp = await axios.post(baseUrl + '/nlp/extract', { ocrText: ocrData.ocrText, ocrResult: ocrData.ocrResult }, { timeout: 20000 });
    console.log('NLP response status:', nlpResp.status);
    const nlp = nlpResp.data || {};
    const fields = (nlp.data && nlp.data.fields) || [];
    const getField = (name) => (fields.find(f => f.name === name) || {}).value || '';

    const vendor = {
      name: getField('SUPPLIER_NAME') || 'unknown',
      street: getField('SUPPLIER_ADDRESS_STREET') || '',
      city: (getField('SUPPLIER_ADDRESS_CITY') || '').split(' ').slice(1).join(' ') || '',
      zip_code: (getField('SUPPLIER_ADDRESS_CITY') || '').split(' ')[0] || ''
    };

    const invoiceNumber = getField('INVOICE_NO') || 'UNKNOWN';
    const invoiceDate = getField('INVOICE_DATE') || new Date().toISOString().slice(0,10);
    const totalGross = getField('TOTAL_GROSS') || getField('TOTAL') || '';

    const inv = {
      vendor,
      invoiceNumber,
      date: invoiceDate,
      total: totalGross || '0.00',
      currency: 'EUR',
      raw: { ocr: ocrData, nlp: nlp }
    };

    console.log('3) Persisting invoice via POST /api/invoices...');
    const saveResp = await axios.post(baseUrl + '/api/invoices', inv, { timeout: 10000 });
    console.log('Save response:', saveResp.status, saveResp.data);

    console.log('4) Verifying last saved invoice in SQLite DB...');
    const dbFile = path.join(__dirname, 'data.db');
    const db = new sqlite3.Database(dbFile);
    db.get('SELECT id, vendor, invoiceNumber, date, total, savedAt FROM invoices ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) {
        console.error('DB read error:', err.message);
        process.exit(1);
      }
      console.log('Last invoice row:', row);
      if (row && row.vendor) {
        try { console.log('Vendor stored:', JSON.parse(row.vendor)); } catch (e) { console.log('Vendor (raw):', row.vendor); }
      }
      db.close();
      console.log('E2E test completed successfully.');
    });

  } catch (err) {
    console.error('E2E test failed:', err && err.message ? err.message : err);
    if (err && err.response) try { console.error('Response data:', JSON.stringify(err.response.data, null, 2)); } catch(e) { console.error(err.response.data); }
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
