# Docker / Sharing Guide

This guide explains how to build, save and push the complete invoice-app so others can run it.

Prerequisites
- Docker engine installed and running
- Logged into Docker Hub: `docker login`

Files added
- `docker-compose.yml` — builds services: `frontend`, `api`, `ocr`, `redis` (images are named `tg3392/...`)
- `Dockerfile.frontend` — builds the React app and serves with `nginx`
- `server/Dockerfile` — builds the Node/Express backend
- `push-images.ps1` — PowerShell script to tag and push images to Docker Hub
- `build-and-save.ps1` — builds images and saves them into a single TAR for offline sharing

Quick steps

1) Build images (recommended):
```powershell
docker compose build --no-cache
```

2) Push images to Docker Hub (replace/tag as needed):
```powershell
# push existing built images (defaults to user 'tg3392' and tag 'latest')
.\push-images.ps1 -Tag 'v1.0.0' -Build
```

3) Save images to a TAR file (for offline distribution):
```powershell
.\build-and-save.ps1 -Tag 'v1.0.0' -OutFile 'invoice-app-v1.0.0.tar'
```

4) Load images on another host and run:
```powershell
# copy invoice-app-v1.0.0.tar to target
docker load -i invoice-app-v1.0.0.tar
# then either docker run the images or use a docker-compose file adapted to use the image names
docker pull tg3392/invoice-app-frontend:v1.0.0
```

Notes
- `redis` is not pushed; use the published `redis:7-alpine` on the target host.
- The `ocr` service uses the `ocr/Dockerfile` in the repo; if `docker compose build` fails there, remove or fix the `ocr` service.
- If you want private repos on Docker Hub, ensure the target host authenticates before pulling.

If you want, I can:
- add a versioned `docker-compose.prod.yml` that references the `tg3392/*` images,
- or remove the `ocr` service temporarily to allow building only `frontend` + `api`.