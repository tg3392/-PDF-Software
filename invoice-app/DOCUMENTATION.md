# Invoice App — Verständliche Beschreibung

Diese kurze, einfache Anleitung beschreibt, was die App macht, wie sie aufgebaut ist und wie du sie schnell benutzt oder anpasst. Ziel: so schreiben, dass auch Nicht-Programmierer die Funktionalität nachvollziehen können.

1) Worum es geht
- Du lädst eine PDF‑Rechnung hoch.
- Die App versucht, automatisch Text aus der PDF zu lesen (OCR) und daraus strukturierte Felder zu gewinnen (z. B. Rechnungsnummer, Datum, Gesamtbetrag).
- Du kannst die vorgeschlagenen Werte überprüfen, korrigieren und falsche Erkennungen als Feedback melden.
- Gesammeltes Feedback lässt sich exportieren (JSON oder XML) und später zum Trainieren einer besseren Erkennungs‑KI verwenden.

2) So benutzt du die App (einfacher Ablauf)
- Öffne die App im Browser (nachdem du das Frontend gestartet hast).
- Gehe zum Upload‑Tab und ziehe deine PDF hinein oder wähle sie aus.
- Die App zeigt dir danach die automatisch erkannten Werte in der Review‑Ansicht an.
- Prüfe die Werte: Wenn etwas falsch ist, klicke auf den Feedback‑Button für das Feld, fülle die Korrektur ein (und optional die Bounding‑Box) und sende das Feedback ab.
- Du kannst alle Feedbacks als JSON oder XML herunterladen (Export‑Tab).

3) Die wichtigsten Bereiche / Dateien (wo finde ich was)
- `src/pages/App.jsx` — das Herz der App: hier wird hochgeladen, die Erkennungs‑Routine aufgerufen, die Review‑Liste gepflegt und Feedback gespeichert.
- `src/components/` — kleinere UI‑Bausteine wie das Feedback‑Modal oder die Demo‑Komponente.
- `src/styles/index.css` — Styling (Tailwind ist verwendet).
- `server/` — ein kleines lokales Test‑Backend (Express). Es simuliert OCR und Extraktion, damit du die Frontend‑Workflows testen kannst.

4) Was funktioniert schon und was ist Platzhalter
- Funktioniert bereits:
	- PDF‑Upload, Anzeige erkannter Felder, Feedback‑Modal, Export (JSON/XML), Demo‑Ansicht, grundlegendes Styling.
- Platzhalter / Demo‑Verhalten:
	- OCR und Feld‑Extraktion: im Test‑Backend werden diese Schritte nur simuliert (Mock‑Antworten). Für produktive Erkennung musst du ein echtes OCR/Extraction‑System anbinden.
	- Bounding‑Box: im Feedback‑Modal kannst du aktuell Koordinaten als Zahlen eingeben; eine interaktive Markierung auf der PDF‑Vorschau (Drag‑to‑draw) ist noch nicht implementiert.

5) Schnellstart (Kurzbefehle)
1) Test‑Backend starten (falls du die lokale Simulation verwenden willst):

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\TEST\invoice-app\server"
npm install
npm run start
```

2) Frontend starten:

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\TEST\invoice-app"
npm install
npm run dev
```

Öffne dann die lokale Vite‑URL (z. B. `http://localhost:5173`) und teste eine PDF im Upload‑Tab.

6) Wenn du etwas anpassen willst (schnell)
- Echte OCR/Extraction anschließen: in `src/pages/App.jsx` die Funktion `processInvoice(file)` so ändern, dass sie deine OCR/Extract‑API anruft (statt der lokalen Mock‑Calls).
- Feedback persistent speichern: `submitFeedback()` in `src/pages/App.jsx` so ändern, dass POST `/api/feedbacks` an ein echtes Backend geht, das die Daten in einer DB ablegt.
- Bounding‑Box interaktiv: PDF auf einer Canvas rendern (z. B. `react-pdf`) und ein Overlay zum Zeichnen hinzufügen; die Koordinaten dann normalisiert speichern (0..1).

6.1) Konkrete Stellen für Integration (wo genau ändern)

Wenn du die KI- oder DB-Anbindung einbauen willst, ändere genau diese Stellen:

- Frontend: `src/pages/App.jsx`
	- Funktion `processInvoice(file)` — hier wird aktuell die PDF verarbeitet. Ersetze die Dummy-/Mock‑Logik durch:
		1) POST `/api/ocr` (multipart/form-data) mit der Datei
		2) POST `/api/extract` mit dem erhaltenen `ocrText`
		3) optional POST `/api/invoices` um das resultierende Invoice persistieren zu lassen
	- Minimaler fetch‑Ablauf (Einfügen in `processInvoice`):
		```js
		const form = new FormData();
		form.append('file', file);
		const ocr = await fetch('/api/ocr', { method: 'POST', body: form }).then(r => r.json());
		const extract = await fetch('/api/extract', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: ocr.ocrText }) }).then(r => r.json());
		// extract.invoice enthält die strukturierten Felder
		```

- Frontend: `src/pages/App.jsx` (Feedback)
	- Funktion `submitFeedback()` — hier baust du das Feedback‑Objekt und sendest es an dein Backend.
	- Minimaler fetch‑Call:
		```js
		await fetch('/api/feedbacks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(feedbackObj) });
		```

- Backend / Persistenz:
	- Test-Server: `server/index.js` (aktuell SQLite‑basiert in `data.db`). Wenn du eine produktive DB willst, tausche hier die sqlite3‑Logik gegen z. B. einen Postgres‑Client (pg).
	- Orte im Server, die du austauschen willst:
		- `POST /api/ocr`: aktuell nutzt `pdf-parse` — hier kannst du stattdessen einen Cloud‑OCR‑Call (z. B. Google Vision) machen und das resultierende Textfeld zurückgeben.
		- `POST /api/extract`: hier kannst du eigene Extraktionslogik oder einen externen Extraction‑Service aufrufen.
		- `POST /api/invoices` und `POST /api/feedbacks`: hier wird gespeichert — ersetze SQLite‑Insert durch deine DB‑Client‑Aufrufe.
	- Beispiel: Postgres (pseudo):
		```js
		// pseudo-code im server
		const { rows } = await pg.query('INSERT INTO invoices (vendor, invoiceNumber, date, total) VALUES ($1,$2,$3,$4) RETURNING id', [vendor, number, date, total]);
		```

Hinweis: Achte auf CORS/HTTPS und Auth, wenn Frontend und Backend getrennte Hosts haben. Teste die Calls zuerst lokal gegen `http://localhost:3000` (Test-Backend) bevor du sie an produktive Dienste weiterreichst.

7) Sicherheit kurz erklärt
- Das Test‑Backend ist nur für lokale Tests gedacht. Vor produktiver Nutzung: HTTPS, Auth (Token), Dateigrößenlimits, MIME‑Checks, Virenscan und Upgrade von unsicheren Bibliotheken (z. B. Multer 1.x → 2.x) einbauen.


  
