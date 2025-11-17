
# Invoice App — Bedienung, Architektur und Entwicklerhinweise

Dieses Dokument beschreibt die App: was sie macht, wie sie aufgebaut ist, wie man sie lokal startet und welche Schnittstellen relevant sind. Ziel ist, dass Teams (Frontend, OCR, NLP, DB) schnell verstehen, wie die Teile zusammenarbeiten.

Kurzbeschreibung
- Ziel: Rechnungen (PDF) automatisch auslesen, strukturierte Felder vorschlagen, Korrekturen und Feedback erfassen und final speichern.
- Ablauf: Upload → OCR → NLP/Extraktion → Review → Korrektur/Feedback → Speichern.

Funktionen (Kurz)
- PDF‑Upload und OCR‑Textgewinnung.
- Heuristische NLP‑Extraktion von Feldern (Lieferant/Empfänger, Rechnungsnummer, Datum, Positionen, Steuern, Gesamtsumme).
- Klassifikation: Eingangs‑ vs. Ausgangsrechnung.
- Review‑UI mit Feldern zur Korrektur und Feedback‑Export.
- Persistenz: Speicherung von Rechnungen und Feedback in SQLite (lokal) mit einfachem Company‑Profil.

Architekturübersicht
- Frontend: React + Vite, Hauptseite `src/pages/App.jsx`.
- Backend: Node/Express in `server/index.js`, SQLite für lokale Persistenz.
- Datenfluss: Frontend lädt PDF hoch → Backend `/api/ocr` liefert `ocrText` → Frontend ruft `/nlp/extract` → Backend liefert `prediction` → Frontend zeigt Ergebnis, sendet ggf. `/nlp/feedback` und `/api/invoices`.

Wichtige Endpunkte (Kurzreferenz)
- POST /api/ocr — PDF upload (multipart/form-data `file`) → `{ ok: true, ocrText, pages?, ocrResult?, savedFile? }`.
- POST /nlp/extract — `{ ocrText }` → `{ ok: true, prediction: { classification, status, extractedData, confidence, meta? } }`.
- POST /nlp/feedback — Trainingsdaten: `{ originalPrediction, editedPrediction, ... }` → `{ ok: true, trainingId? }`.
- POST /api/invoices — persistiert finale Rechnung → `{ ok: true, id }`.
- POST /api/feedbacks — persistiert einzelnes Feedback‑Item → `{ ok: true, feedbackId }`.
- GET /api/company & POST /api/company — lesen/setzen des lokalen Unternehmer‑Profils.

Datenformat‑Hinweise
- `extractedData.vendor` und `extractedData.recipient` sind bevorzugt strukturierte Objekte: `{ name, street, zip_code, city, raw }`.
- Datum: ISO (YYYY‑MM‑DD). Zahlen: Dezimalpunkt (e.g. 1234.56).
- `confidence` zwischen 0 und 1; `status` beschreibt Vollständigkeit (`Extrahiert`, `Prüfung erforderlich`, ...).

WasWichtig für die Entwickler:

Frontend
- Hauptkomponenten: `src/pages/App.jsx` (Upload, Review, Training, Export). Passe hier die Fetch‑Ziele an, wenn Backend‑URL/Port abweichen.
- UX: Felder lassen sich editieren; Korrekturen werden lokal gehalten und können als Feedback via `/nlp/feedback` gesendet werden.

OCR
- Implementiere `/api/ocr` so, dass `ocrText` zuverlässig zurückkommt (UTF‑8 Fließtext).
- Optional: Rückgabe von Layoutdaten (Seiten, Bounding‑Boxes) in `ocrResult`.
- Validierung: Nicht‑PDF → 400, beschädigt → 422, sonst 200.

NLP
- `/nlp/extract` muss `prediction` liefern mit `extractedData` (siehe Felder oben), `classification` und `confidence`.
- Normalisiere Datums‑ und Zahlenformate. Markiere `vendor.isOwnCompany` bei Übereinstimmung mit `/api/company`.
- Bei niedriger Sicherheit `confidence` niedrig setzen und `status` entsprechend melden.

Datenbank / Persistenz
- Lokale DB: SQLite (`server/data.db`). Tabellen: `invoices`, `feedbacks`, `training`, `company`.
- `vendor` kann JSON gespeichert werden, um Struktur zu erhalten. Indexe auf `invoiceNumber` und `vendor.name` empfohlen.
- Schreibe Transaktionen für atomare Operationen (z. B. invoice + feedback).

Lokal starten
- Backend (server):

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server"
npm install
node index.js
```

- Frontend (Vite):

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app"
npm install
npm run dev
```

Hinweis: Frontend erwartet standardmäßig Backend unter `http://localhost:3000`. Bei abweichendem Port anpassen oder Vite‑Proxy konfigurieren.

Fehlerbehandlung & Troubleshooting (Kurz)
- Port belegt: Prüfe laufende Prozesse (`netstat -ano`) und stoppe den Prozess oder starte Backend auf anderem Port.
- OCR liefert leere Texte: prüfe PDF‑Datei und OCR‑Library; teste mit mehreren Samples.
- NLP‑Extraktion falsch: Logs prüfen, Confidence‑Schwellen anpassen, Trainingsdaten via `/nlp/feedback` sammeln.


Bedienoberfläche — Buttons
- Header: `Firma bearbeiten` — öffnet das Formular, um die gespeicherte Unternehmer‑Adresse zu ändern.

- Navigation (oben):
	- `Upload` — Öffnet die Upload‑Ansicht. Ziehe oder wähle PDF‑Dateien aus, die App lädt sie hoch und startet die automatische Verarbeitung (OCR → NLP). Nach der Verarbeitung erscheinen die erkannten Rechnungen in der "Überprüfung".
	- `Überprüfung` — Zeigt alle erkannten Rechnungen zur Kontrolle. Du kannst Felder direkt bearbeiten, per "Feedback" Korrekturen speichern/exportieren, eine Vorschau öffnen oder die Rechnung als geprüft markieren (Verifizieren). Änderungen an der Rechnungsart (Dropdown) werden als Klassifikations‑Feedback an den Server gesendet.
	- `Lernen` — Trainingsbereich, um Dokumente für das weitere Modelltraining vorzumerken. Hier sammelst du gezielt gute oder problematische Beispiele, die später als Trainingsdaten genutzt werden können.
	- `Export` — Bietet Export‑Optionen: Tabellenexport (CSV), vollständige Daten (JSON) und gesammelte Feedbacks (JSON oder XML). Nutze diese Buttons, um lokale Backups oder Trainingsdaten zu exportieren.
	- `Exportieren (CSV)` — lädt eine Tabelle mit den Rechnungen als CSV herunter.
	- `Exportieren (JSON)` — lädt alle Rechnungsdaten als JSON‑Datei herunter.
	- `Feedbacks (JSON)` / `Feedbacks (XML)` — exportiert alle gesammelten Feedback‑Einträge im gewählten Format.



