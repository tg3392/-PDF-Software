# PDF-Software — Docker Development & Run Guide

Kurz: Dieses Repo enthält eine React/Vite‑Frontend (`invoice-app`), einen Node.js‑Backend (`invoice-app/server`) und einen OCR‑Wrapper (Python/Tesseract). Die bereitgestellten Dockerfiles und `docker-compose.yml` erlauben, die gesamte App lokal zu starten.

Voraussetzungen
- Docker Desktop (Windows: mit WSL2 empfohlen)
- optional: Git

Schnellstart (Produktion / Integration)
1. Projektstamm öffnen (wo `docker-compose.yml` liegt).
2. Build & Start aller Dienste:

```powershell
cd D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software
docker-compose up --build -d
```

3. Dienste prüfen / Logs:

```powershell
# Alle Logs
docker-compose logs -f
# OCR logs
docker-compose logs -f ocr
# stop
docker-compose down
```

Ports
- Frontend (nginx): http://localhost:5173
- Backend (Node): http://localhost:3000
- OCR (FastAPI): http://localhost:8003

OCR-Test (Beispiel)
- Upload eines Beispiel-PDFs an den OCR-Endpunkt:

```powershell
curl.exe -v -F "file=@invoice-app/server/example-invoice-for-upload.pdf" http://127.0.0.1:8003/api/ocr
```

Hinweise für Entwickler (Live-Entwicklung lokal)
- Standard‑`docker-compose.yml` baut statische Frontend‑Assets und dient Production‑like Use.
- Für aktive Entwicklung (Hot‑reload) liegt `docker-compose.override.yml` bereit. Diese startet Dienste mit Bind‑Mounts und Dev-Commands:
  - Frontend: `npm run dev` innerhalb des Containers, Port 5173 sichtbar am Host
  - Backend: bind mount des Server‑Ordners, führt `node index.js` (oder beliebtes Dev-Tool)
  - OCR: UVicorn mit `--reload`, mountet `invoice-app/server` für live edits

Empfohlene Workflows
- Schnell lokal testen ohne Container: starte OCR wrapper mit `start_ocr_wrapper.ps1` (Windows) oder `python -m uvicorn ocr_fastapi_single:app --port 8003`.
- Für vollständigen Integrationstest: nutze `docker-compose up --build`.

Verbesserungsvorschläge
- Führe `docker-compose.override.yml` nur bei aktiver Entwicklung aus (Docker Compose lädt es automatisch).
- Ergänze `docker-compose.dev.yml` für ausgefeiltere Dev-Setups (z. B. nodemon, hot reload für Node).
- Secrets und Konfiguration über `.env` / Docker Secrets statt hardcoding.

Support
- Bei Problemen mit Tesseract: prüfe lokal mit `tesseract --version` und stelle sicher, dass Sprachpakete installiert sind.
- Bei Windows-Volume‑Problemen: verwende WSL2 oder passe Bind-Mounts an.


