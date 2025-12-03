# Invoice App

Dieses Repository enthält eine kleine Web‑App zur Verarbeitung von Rechnungen:
- Frontend: React (Vite)
- Backend: Node/Express (API, SQLite)
- OCR: FastAPI/uvicorn Wrapper (optional)
- NLP: Flask basierter Service (lokal buildbar / optional als externes Image)

## Schnellstart (empfohlen: Docker Desktop auf Windows)

1. Docker Desktop starten (oder sicherstellen, dass ein Docker‑Daemon erreichbar ist).
2. Im Projektverzeichnis den Compose‑Stack starten:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Der Stack startet folgende Dienste:
- Frontend: http://localhost:8000
- API: http://localhost:3000
- OCR (Wrapper): Hostport 8001 → container 8003 (optional)
- NLP (local build): Hostport 8003 → container 8000

## Entwickler: lokal ohne Docker

### Frontend
```powershell
npm install
npm run dev
```

Vite läuft standardmäßig unter `http://localhost:5173`.

### Backend
```powershell
cd server
npm install
node index.js
```
Der Backend‑Server hört standardmäßig auf Port `3000`.

## Wichtige Hinweise
- Das spaCy‑Modell selbst ist nicht im Repo; lege das Modell unter `./nlp/invoice_nlp/model/model-best` ab oder nutze das lokale Build in `server/nlp_service`.
- Compose legt Volumes an für DB und Feedback: siehe `docker-compose.yml`.
- Für die UI‑Tests empfiehlt sich `node server/e2e_test.js`.

## Weitere Informationen
Die ausführliche Bedienung, Architektur und Troubleshooting findest du in `DOCUMENTATION.md`.
