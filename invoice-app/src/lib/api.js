// Kleine API-Schicht für das Frontend.
//
// Zweck: Diese Datei kapselt die HTTP-Aufrufe an das lokale Backend und
// stellt einfache Funktionen bereit, die im Frontend aufgerufen werden.
// Die Funktionen sind minimal gehalten: Sie erwarten JSON-Antworten vom
// Server und geben das geparste JSON direkt zurück.
//
// Hinweis: Bei Backend-Fehlern zuerst die entsprechenden Endpunkte in
// `server/index.js` prüfen.
export async function getCompany() {
  const r = await fetch('/api/company');
  return r.json();
}

// Speichert die Operator- oder Firmen-Informationen (Profil)
export async function saveCompany(payload) {
  const r = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return r.json();
}

// Lädt eine PDF-Datei an den OCR-Endpunkt hoch.
// Erwartet ein FormData-Objekt mit dem Schlüssel `file`.
export async function ocrUpload(formData) {
  const r = await fetch('/api/ocr', { method: 'POST', body: formData });
  return r.json();
}

// Sendet den vom OCR erhaltenen Text an die heuristische NLP-Extraktion
// (dieser Endpunkt macht die eigentliche Zuordnung von Feldern).
export async function nlpExtract(body) {
  const r = await fetch('/nlp/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

// Schickt Korrekturen/Feedback an das Backend (wird als Trainings- oder
// Feedback-Event persistiert).
export async function sendNlpFeedback(payload) {
  const r = await fetch('/nlp/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return r.json();
}
