/*
  NLP Hilfsfunktionen

  Diese Datei enthält mehrere kleine Helfer, die die nachfolgenden
  heuristischen Regeln für Adressen, IBAN/BIC und Beträge übernehmen.
  Die Absicht ist, die unzuverlässigen OCR-Ausgaben (z. B. fehlerhafte
  Leerzeichen, fehlerhafte Zeichen für 'ß' oder Währungszeichen) vorzu-
  bereiten und in eine brauchbare Form zu bringen, damit die Regexes
  im Hauptprozessor zuverlässiger arbeiten.

  Die Funktionen sind bewusst einfach gehalten und dokumentiert — wenn du
  hier etwas anpasst, teste mit mehreren echten Rechnungen (verschiedene
  Layouts und Sprachen).
*/
const IBAN_REGEX = /[A-Z]{2}[0-9A-Z]{10,30}/i;
const BIC_REGEX = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i;

// Korrigiert häufige OCR-Fehler in String-Formaten
//
// Erklärung: OCRs geben oft seltsame Leerzeichen oder falsche
// Anführungszeichen zurück. Zusätzlich können deutsche Sonderzeichen
// oder Währungszeichen durch OCR-Verarbeitungen verfälscht werden.
// Diese Funktion führt einfache Ersetzungen durch, um nachfolgende
// Regex-Prüfungen robuster zu machen.
function fuzzyFixCommonOcr(s) {
  if (!s) return s;
  let t = String(s);
  // häufige unsichtbare oder typographische Zeichen ersetzen
  t = t.replace(/\u00A0/g, ' '); // geschützte Leerzeichen
  t = t.replace(/[\u2018\u2019\u201C\u201D]/g, '"');
  // kleine heuristische Ersetzungen für Adressen
  t = t.replace(/\bStran\b/gi, 'Str.');
  t = t.replace(/\bStrasse\b/gi, 'Straße');
  t = t.replace(/\bStr\b\.?/gi, 'Str.');
  // OCR verwechselt gern Buchstaben mit Zahlen in IBANs (I -> 1, O -> 0)
  t = t.replace(/I(?=\d)/g, '1');
  t = t.replace(/O(?=\d)/g, '0');
  return t;
}

// Vereinfacht und säubert einen IBAN-String, so gut es geht.
// Ziel: Entferne Leer- und Sonderzeichen, korrigiere typische OCR-Fehler
// (O vs 0, I vs 1) außerhalb des Ländercodes, und gib eine
// normalisierte Version zurück.
function normalizeIban(iban) {
  if (!iban) return undefined;
  let s = String(iban).toUpperCase();
  s = s.replace(/[^A-Z0-9]/g, '');
  if (s.length > 4) {
    const cc = s.slice(0,2);
    const rest = s.slice(2).replace(/O/g, '0').replace(/I/g, '1');
    s = cc + rest;
  }
  // wenn das Ergebnis nicht wie ein IBAN aussieht, wird trotzdem
  // die bestmögliche Version zurückgegeben; die Funktion ist tolerant.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return s;
  return s;
}

// Sucht im gesamten OCR-Text nach IBAN und BIC. Versucht zuerst
// explizit beschriftete Vorkommen (z. B. 'IBAN: ...'), fällt
// ansonsten auf eine generische Token-Suche zurück.
function extractBankDetails(text) {
  if (!text) return {};
  const t = String(text);
  let iban;
  const m1 = t.match(/IBAN[:\s]*([A-Z0-9 \-]{8,40})/i);
  if (m1 && m1[1]) iban = normalizeIban(m1[1]);
  if (!iban) {
    const m2 = t.match(IBAN_REGEX);
    if (m2) iban = normalizeIban(m2[0]);
  }

  let bic;
  const b1 = t.match(/BIC[:\s]*([A-Z0-9]{8,11})/i);
  if (b1 && b1[1]) bic = b1[1].toUpperCase();
  if (!bic) {
    const b2 = t.match(BIC_REGEX);
    if (b2) bic = b2[1].toUpperCase();
  }

  return { iban, bic };
}

// Parst numerische Betragstoken in eine Zahl (unterstützt 1.234,56 und 1234.56
// sowie typische OCR-Verunreinigungen)
function parseAmountToken(s) {
  if (s === undefined || s === null) return undefined;
  let t = String(s).replace(/[^^0-9,\.\-]/g, '').trim();
  if (t === '') return undefined;
  // If both '.' and ',' present, assume '.' thousand sep and ',' decimal
  if (t.indexOf('.') !== -1 && t.indexOf(',') !== -1) {
    t = t.replace(/\./g, '').replace(/,/g, '.');
  } else if (t.indexOf(',') !== -1 && t.indexOf('.') === -1) {
    t = t.replace(/,/g, '.');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

// Extrahiere tabellenähnliche Positionen aus dem OCR-Text mittels
// toleranter Heuristiken
function parseItemsFromText(text) {
  if (!text) return [];
  const raw = String(text);
  // Normalisiere häufige Mojibake- bzw. Währungsartefakte
  const clean = raw.replace(/Ôé¼/g, '').replace(/\u00A0/g, ' ').replace(/[\u2018\u2019]/g, "'");
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Suche Blockgrenzen der Positionen zwischen typischen Kopfzeilen und den Summen
  const startIdx = lines.findIndex(l => /beschreibung|positions|positionen|menge|einheit/i.test(l));
  const endIdxCandidates = lines.map((l,i)=> ({i,l})).filter(x => /zwischensumme|rechnungsbetrag|brutto|gesamtbetrag|summe/i.test(x.l)).map(x=>x.i);
  const endIdx = endIdxCandidates.length ? endIdxCandidates[0] : lines.length;
  const block = lines.slice(startIdx === -1 ? 0 : startIdx, endIdx);

  const items = [];
  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    // skip header-like short lines
    if (/^(menge|einheit|einzelpreis|gesamt\s*\(|beschreibung)$/i.test(line)) continue;

    // Finde alle betragähnlichen Token in dieser Zeile
    const amtMatches = Array.from(line.matchAll(/(\d{1,3}(?:[\.\s]\d{3})*(?:[\.,]\d{2}))/g));
    const amounts = amtMatches.map(m => parseAmountToken(m[1]));

    if (amounts.length >= 2) {
      // description is the part before the first amount
      const firstAmtIndex = line.indexOf(amtMatches[0][1]);
      const desc = line.slice(0, firstAmtIndex).replace(/[\t ]+/g, ' ').trim();
      items.push({ raw: line, description: desc || undefined, quantity: undefined, unit: undefined, unitPrice: amounts[0], lineTotal: amounts[1] });
      continue;
    }

    if (amounts.length === 1) {
      // maybe description is previous non-amount line
      let desc = line.replace(/(\d+[\.,]\d{2})/g, '').trim();
      if (!desc && i > 0) desc = block[i-1];
      items.push({ raw: line, description: desc || undefined, quantity: undefined, unit: undefined, unitPrice: undefined, lineTotal: amounts[0] });
      continue;
    }

    // Fallback: wenn die Zeile wie eine Beschreibung aussieht und die
    // nächste Zeile Beträge enthält, verbinde beide Zeilen zur Position
    if (i + 1 < block.length) {
      const next = block[i+1];
      const nextAmts = Array.from(next.matchAll(/(\d{1,3}(?:[\.\s]\d{3})*(?:[\.,]\d{2}))/g)).map(m => parseAmountToken(m[1]));
      if (nextAmts.length >= 1) {
        items.push({ raw: line + ' / ' + next, description: line, quantity: undefined, unit: undefined, unitPrice: nextAmts.length >= 2 ? nextAmts[0] : undefined, lineTotal: nextAmts.length >= 1 ? nextAmts[nextAmts.length - 1] : undefined });
        i += 1; // skip next line
        continue;
      }
    }
  }

  return items;
}

  // Extrahiere Summen (Netto, USt, Brutto) aus dem Text
function extractTotals(text) {
  if (!text) return {};
  const t = String(text).replace(/Ôé¼/g, '').replace(/\u00A0/g, ' ');
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Sammle numerische Token mit ihren Zeilenindizes
  const numericTokens = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = Array.from(line.matchAll(/(\d{1,3}(?:[\.\s]\d{3})*(?:[\.,]\d{2}))/g));
    matches.forEach(m => numericTokens.push({ idx: i, token: m[1], value: parseAmountToken(m[1]) }));
  }
  // Debugausgabe: gefundene numerische Tokens (für Analyse)
  console.log('extractTotals numericTokens:', numericTokens);

  let net, vat, gross;

  // Helfer: Nimmt das nächste numerische Token nach einer gegebenen Zeile
  const nextNumericAfter = (lineIdx, offset = 0) => {
    const candidates = numericTokens.filter(n => n.idx > lineIdx);
    return candidates[offset] ? candidates[offset].value : undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/zwischensumme|netto|nettobetrag/i.test(l) && net === undefined) {
      // take the first numeric token after this line as net
      net = nextNumericAfter(i, 0);
      // if there's a second numeric right after, use it as vat candidate
      const possibleVat = nextNumericAfter(i, 1);
      if (possibleVat !== undefined && vat === undefined) vat = possibleVat;
    }
    if (/(umsatzsteuer|ust|mwst|mehrwertsteuer|steuer)/i.test(l) && vat === undefined) {
      // VAT amount may appear on the same or following numeric lines
      vat = nextNumericAfter(i, 0);
      if (vat === undefined) vat = nextNumericAfter(i, 1);
    }
    if (/(rechnungsbetrag|brutto|gesamtbetrag|betrag\s*brutto|rechnungssumme)/i.test(l) && gross === undefined) {
      gross = nextNumericAfter(i, 0);
      if (gross === undefined) gross = nextNumericAfter(i, 1);
    }
  }

  // Fallback: falls Bruttobetrag fehlt, nutze das letzte gefundene numerische Token
  if (gross === undefined && numericTokens.length) {
    gross = numericTokens[numericTokens.length - 1].value;
  }

  return { net, vat, gross, tokens: numericTokens };
}

// Zerlegt einen Adressblock in grobe Bestandteile: Name, Straße, PLZ, Ort.
//
// Wichtig: Diese Funktion ist keine vollständige Adress-Parsing-Bibliothek —
// sie versucht mit einfachen Heuristiken (z. B. Suche nach 5-stelliger PLZ)
// brauchbare Felder zu extrahieren. Bei ungewöhnlichen Layouts kann es
// zu Fehlextraktionen kommen.
function parseAddress(block) {
  if (!block) return null;
  const txt = fuzzyFixCommonOcr(block || '');
  const parts = txt.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
  const name = parts[0] || undefined;
  let street;
  let zip_code;
  let city;

  // Suche nach einer Zeile, die eine 5-stellige PLZ enthält
  const zipLineIndex = parts.findIndex(p => /\b\d{5}\b/.test(p));
  if (zipLineIndex !== -1) {
    const zipLine = parts[zipLineIndex];
    const m = zipLine.match(/(\d{5})\s+(.+)$/);
    if (m) { zip_code = m[1]; city = m[2]; }
    if (zipLineIndex >= 1) street = parts[zipLineIndex - 1];
  } else {
    if (parts.length >= 2) street = parts[1];
    if (parts.length >= 3) city = parts[2];
  }

  if (street === '') street = undefined;
  if (city === '') city = undefined;

  return { name, street, zip_code, city, raw: block };
}

// Exportiere die Helfer — diese werden von `server/index.js` verwendet.
module.exports = { fuzzyFixCommonOcr, normalizeIban, extractBankDetails, parseAddress, parseAmountToken, parseItemsFromText, extractTotals };
