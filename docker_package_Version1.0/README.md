# Docker Package — Version 1.0

Enthält die Docker- und Compose-Dateien, um die App (Frontend, Backend, OCR) reproduzierbar zu starten.

Enthaltene Dateien:
- `docker-compose.yml`
- `docker-compose.override.yml` (Dev-Override)
- `invoice-app/Dockerfile`
- `invoice-app/nginx.conf`
- `invoice-app/ocr/Dockerfile`
- `README.md` (diese Datei)

Kurzanleitung:
1. Wechsel in das Paket-Verzeichnis:

```powershell
cd D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\docker_package_Version1.0
```

2. Dienste bauen und starten:

```powershell
docker-compose up --build -d
```

3. Logs prüfen:

```powershell
docker-compose logs -f
```

Hinweis: Dieses Paket geht davon aus, dass der Rest des Repos (insbesondere `invoice-app/server`) im übergeordneten Pfad verfügbar ist, wie in `docker-compose.yml` referenziert. Wenn du das Paket an Dritte schickst, empfehle ich, die relative Struktur beizubehalten oder ein ZIP mit der vollen Repo-Struktur zu erstellen.
