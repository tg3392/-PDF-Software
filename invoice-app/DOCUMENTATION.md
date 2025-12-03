# Invoice App — Bedienung, Architektur und Schritt‑für‑Schritt Anleitung

Dieses Dokument erklärt, was die App macht, wie die Teile zusammenarbeiten und wie sie lokal installiert und benutzt werden kann. Die Texte sind in einem leicht lesbaren, praxisnahen Stil formuliert — so, wie man einem Kollegen die Anwendung und das Aufsetzen erklären würde.

Kurzüberblick
- Zweck: PDFs (Rechnungen) einlesen, Vorschläge für strukturierte Felder liefern, manuelle Korrekturen erlauben und Feedback/Trainingsdaten speichern.
- Typischer Ablauf: Upload → OCR → NLP/Extraktion → Überprüfung → Korrektur/Feedback → Speichern / Export.

Wichtige Funktionen
- Automatischer PDF‑Upload und OCR‑Verarbeitung.
- Heuristische Extraktion von Rechnungsfeldern (Lieferant/Empfänger, Rechnungsnummer, Datum, Positionen, Steuern, Summen).
- Einfache Klassifikation (Eingangs- vs. Ausgangsrechnung).
- Review‑UI für manuelle Korrekturen und Feedback‑Erzeugung.
- Lokale Persistenz in SQLite für Rechnungen und Feedback.

Architektur (kurz)
- Frontend: React + Vite. Haupteinstiegspunkt: `src/pages/App.jsx`.
- Backend: Node + Express, Implementierung in `server/index.js`.
- Persistenz: SQLite in `server/data.db`.
- Grober Datenfluss: Frontend lädt PDF hoch → `/api/ocr` → `ocrText` → `/nlp/extract` → `prediction` → Frontend zeigt Resultat und sendet ggf. `/nlp/feedback`.

API‑Kurzreferenz
- `POST /api/ocr` — Datei hochladen (multipart/form-data `file`). Antwort enthält mind. `{ ok: true, ocrText }`.
- `POST /nlp/extract` — Body: `{ requestId?, ocrText?, ocrResult? }`. Antwort enthält `prediction` mit `extractedData`, `classification` und `confidence`.
- `POST /nlp/feedback` — Feedback/Trainingsdaten (original vs. edited prediction).
- `GET/POST /api/company` — Firmenprofil lesen/setzen.
- `POST /api/invoices` — finale Rechnung persistieren.

Datenformat‑Hinweise
- Adressen: bevorzugt als Objekt `{ name, street, zip_code, city, raw }`.
- Datum: ISO (YYYY‑MM‑DD). Zahlen: Dezimalpunkt (z. B. `1234.56`).
- `confidence`: numerischer Wert (z. B. `0.92`). `status` beschreibt Zustand (`extrahiert`, `teilweise`, `prüfung_erforderlich`).

Installation & Start (Windows / PowerShell)

Voraussetzungen
- Node.js (v16+ empfohlen).
- Optional: Python, wenn ein lokaler OCR‑Wrapper auf Basis von FastAPI genutzt werden soll.

Backend starten
1. PowerShell öffnen.
2. In das Backend‑Verzeichnis wechseln und Abhängigkeiten installieren:

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server"
npm install
```

3. Server starten:

```powershell
node index.js
```

Der Server hört standardmäßig auf Port `3000`. Die Health‑Route ist `http://localhost:3000/api/health`.

Frontend starten
1. Neues PowerShell‑Fenster öffnen.
2. In das Projekt‑Frontend wechseln und Abhängigkeiten installieren:

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app"
npm install
```

3. Dev‑Server starten:

```powershell
npm run dev
```

Standardmäßig ist Vite unter `http://localhost:5173` erreichbar. API‑Aufrufe werden an `http://localhost:3000` erwartet; bei anderem Backend‑Port Vite‑Proxy oder Frontend‑Konfiguration anpassen.

Optional: OCR‑Wrapper (FastAPI/Python)
- Wenn ein lokaler OCR‑Wrapper genutzt werden soll, existiert ein Startskript `start_ocr_wrapper.ps1` im `server`‑Ordner. Die App prüft die üblichen lokalen Wrapper‑URLs (8003, 8002, 8001) und fällt sonst auf `pdf-parse` zurück.

```powershell
cd "D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server"
.\start_ocr_wrapper.ps1
```

Container / Docker Compose (empfohlen)
-----------------------------------

Für die schnellere und konsistente lokale Ausführung empfehlen wir Docker Compose. Die Compose‑Konfiguration startet Frontend, API, OCR, NLP und Redis. Wichtige Hinweise:

- Docker Desktop (oder ein laufender Docker‑Daemon) wird auf Windows empfohlen.
- Das lokale NLP ist konfiguriert, um aus `server/nlp_service` gebaut zu werden (Image: `tg3392/invoice-app-nlp:local`). Alternativ kann ein externes Image benutzt werden.
- Modellpfad: mounte das spaCy‑Modell unter `./nlp/invoice_nlp/model/model-best` — dieses Verzeichnis wird in den `nlp_api`‑Container gemountet (read‑only).
- Volumes: Compose nutzt `./cache/feedback` und `./cache/pending_results` für Feedback/pending Daten sowie `./server/data.db` für die SQLite DB.

Starten mit Docker Compose:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Wichtige Diagnoseschritte:

- Containerstatus anzeigen: `docker compose -f docker-compose.yml ps`
- Logs beobachten: `docker compose -f docker-compose.yml logs api --tail 200 -f`
- Healthchecks: Das `nlp_api` verwendet einen auth‑geschützten Healthcheck, der ein kleines POST an `/nlp/extract` macht und Antworten <500 als gesund wertet. Bei langen Modellladezeiten ggf. `timeout`/`retries` in `docker-compose.yml` erhöhen.


Kurzer Smoke‑Test
- OCR + NLP mit Beispiel‑PDF testen (PowerShell‑Beispiel):

```powershell
# Beispielablauf (auskommentiert, kann Zeile für Zeile ausgeführt werden):
#$ocr = curl.exe -s -F "file=@example-invoice-for-upload.pdf" http://127.0.0.1:3000/api/ocr | ConvertFrom-Json
#$body = @{ requestId = "smoke-$(Get-Date -UFormat %s)"; ocrText = $ocr.ocrText } | ConvertTo-Json -Depth 5
#Invoke-RestMethod -Uri 'http://127.0.0.1:3000/nlp/extract' -Method Post -Body $body -ContentType 'application/json'
```

Benutzung — Schritt für Schritt (GUI)
1. `Upload` öffnen.
2. PDF per Drag & Drop oder Dateiauswahl hochladen.
3. Verarbeiten lassen (OCR → NLP).
4. `Überprüfung` öffnen und erkannten Werte prüfen bzw. korrigieren.
5. Korrekturen speichern oder als Feedback absenden.
6. Rechnungen bei Bedarf als CSV/JSON exportieren.

Wichtige Bedienelemente
- `Firma bearbeiten`: eigenes Unternehmensprofil anpassen.
- `Upload`: PDFs hochladen und automatische Verarbeitung starten.
- `Überprüfung`: erkannte Rechnungen prüfen und verifizieren.
- `Lernen` / `Training`: Beispiele für späteres Modelltraining markieren.
- `Export`: Daten als CSV/JSON/XML exportieren.

Fehlerbehebung (häufige Probleme)
- Backend startet nicht: Ports prüfen, Logs lesen, `npm install` ausführen.
- OCR liefert leere Ergebnisse: PDF prüfen (gescannt vs. digital), OCR‑Wrapper überprüfen oder `pdf-parse` testen.
- Felder falsch extrahiert: Logs prüfen, Confidence‑Werte beachten und problematische Beispiele per Feedback sammeln.

Entwicklerhinweise
- Heuristiken und Hilfsfunktionen befinden sich in `server/nlp_utils.js`.
- Hauptlogik für Upload/Extraktion/Feedback ist in `server/index.js`.
- Frontend‑Mapping und UI‑Logik sind in `src/pages/App.jsx` implementiert.

Hinweis zur Weiterentwicklung
- Diese Anleitung ist bewusst praktisch gehalten. Für produktive Nutzung empfiehlt sich eine robustere OCR‑Pipeline mit Bounding‑Box‑Informationen, sowie eine Trainingspipeline für das NLP.

Änderungshistorie
- 2025‑11‑30: Dokumentation überarbeitet und um Installations‑ sowie Bedienungsanleitung ergänzt.
