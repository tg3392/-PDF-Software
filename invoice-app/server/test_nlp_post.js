const axios = require('axios');

async function run() {
  try {
    const body = {
      ocrText: {
        pages: [
          {
            page_number: 1,
            full_text: `Rechnung\nRechnungsnummer: INV-2025-1001\nRechnungsdatum: 2025-11-30\nLieferant: Meine GmbH\nKunde: Beispielkunde AG\nZwischensumme: 900,00 EUR\nUmsatzsteuer (19%): 171,00 EUR\nRechnungsbetrag (Brutto): 1071,00 EUR\nIBAN: DE89370400440532013000\n`          }
        ]
      }
    };
    const resp = await axios.post('http://127.0.0.1:3000/nlp/extract', body, { timeout: 10000 });
    console.log('STATUS', resp.status);
    console.log(JSON.stringify(resp.data, null, 2));
  } catch (err) {
    if (err.response) console.error('ERR', err.response.status, err.response.data);
    else console.error('ERR', err.message);
    process.exit(1);
  }
}

run();
