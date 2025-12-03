# Invoice App

Dieses Repository enthält eine kleine Webanwendung zum Verarbeiten von Rechnungen. Kurz gesagt: PDFs hochladen, per OCR lesen lassen, Felder automatisch extrahieren, Ergebnis prüfen und speichern.

Übersicht
- Frontend: React (Vite)
- Backend: Node + Express (SQLite als lokale DB)
- OCR: FastAPI‑Wrapper (optional)
- NLP: Flask‑Service (lokal buildbar oder als externes Image)

Schnellstart (Docker, empfohlen auf Windows)

1. Docker Desktop starten (oder sicherstellen, dass der Docker‑Daemon läuft).
2. Im Projektordner den Compose‑Stack starten:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Nach dem Start sind die üblichen Endpunkte erreichbar:
- Frontend: http://localhost:8000
- API: http://localhost:3000

Hinweis: OCR und NLP laufen in separaten Containern. Die Compose‑Konfiguration legt die erwarteten Ports und Volumes an.

Entwickler: lokal ohne Docker

Frontend
```powershell
npm install
npm run dev
```

Vite läuft meist unter `http://localhost:5173`.

Backend
```powershell
cd server
npm install
node index.js
```

Der Server lauscht standardmäßig auf Port `3000`.

Wichtige Hinweise
- Das spaCy‑Modell ist nicht Teil des Repositories. Lege ein Modell unter `./nlp/invoice_nlp/model/model-best` ab oder baue das NLP‑Image lokal (siehe `server/nlp_service`).
- Docker Compose legt Volumes für DB und Feedback an — die Einstellungen stehen in `docker-compose.yml`.
- Für einen schnellen Funktionstest eignet sich `node server/e2e_test.js`.

Mehr Details
Die ausführliche Bedienung, Architektur und Fehlerbehebung stehen in `DOCUMENTATION.md`.
