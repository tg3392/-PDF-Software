const { fuzzyFixCommonOcr, normalizeIban, extractBankDetails, parseAddress } = require('../nlp_utils');

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT FAILED:', msg);
    process.exitCode = 1;
  }
}

console.log('Running nlp_utils tests...');

// Address parsing
const addrBlock = `Lieferant GmbH\nMusterstran 12\n12345 Musterstadt`;
const addr = parseAddress(addrBlock);
console.log('Parsed address:', addr);
assert(addr.name && addr.name.includes('Lieferant'), 'vendor name');
assert(addr.street && /Musterstr/.test(addr.street), 'street fix (Stran -> Str.)');
assert(addr.zip_code === '12345', 'zip extracted');

// IBAN normalization and extraction
const rawText = 'Bitte überweisen an IBAN: DE89 3704 0044 0532 0130 00 BIC: COBADEFFXXX';
const bank = extractBankDetails(rawText);
console.log('Extracted bank:', bank);
assert(bank.iban && bank.iban.startsWith('DE89'), 'IBAN presence');
assert(bank.bic && bank.bic === 'COBADEFFXXX', 'BIC exact');

// fuzzy normalization
const ocrIban = 'D E 8 9 3 7 0 4 0 0 4 4 0 5 3 2 0 1 3 0 0 0'.replace(/\s+/g,'');
const norm = normalizeIban(ocrIban);
console.log('Normalized IBAN:', norm);
assert(norm && norm.startsWith('DE89'), 'normalizeIban');

if (process.exitCode && process.exitCode !== 0) {
  console.error('Some tests failed.');
} else {
  console.log('All nlp_utils tests passed.');
}
