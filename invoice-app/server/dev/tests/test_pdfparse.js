// archived test moved into server/dev/tests
const fs = require('fs');
const pdfParse = require('pdf-parse');
(async () => {
  try {
    const dataBuffer = fs.readFileSync('example-invoice.pdf');
    const data = await pdfParse(dataBuffer);
    console.log('pdf-parse succeeded. pages:', data.numpages);
    console.log('text excerpt:', data.text.slice(0,300));
  } catch (e) {
    console.error('pdf-parse failed:', e);
    if (e && e.stack) console.error(e.stack);
  }
})();
