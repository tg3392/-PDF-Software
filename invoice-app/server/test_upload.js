const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const filePath = path.join(__dirname, 'example-invoice-for-upload.pdf');
const url = 'http://localhost:3000/api/ocr';

(async () => {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const resp = await axios.post(url, form, { headers: form.getHeaders(), timeout: 20000 });
    console.log('Status:', resp.status);
    console.log('Data:', typeof resp.data === 'object' ? JSON.stringify(resp.data, null, 2).slice(0,10000) : String(resp.data).slice(0,10000));
  } catch (err) {
    console.error('Upload test failed:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    if (err && err.response) {
      try { console.error('Response data:', JSON.stringify(err.response.data, null, 2)); } catch(e) { console.error('Response (raw):', err.response.data); }
    }
    process.exit(1);
  }
})();
