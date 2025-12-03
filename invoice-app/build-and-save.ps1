<#
Build all images via docker compose, verify them and save into a single TAR file.

Usage:
  .\build-and-save.ps1 [-Tag 'v1.0.0'] [-OutFile 'invoice-app-images.tar'] [-Push]

Options:
  -Tag: image tag to use (default 'latest')
  -OutFile: output TAR file name
  -Push: if set, also push the images to Docker Hub (requires docker login)
#>

param(
  [string]$Tag = 'latest',
  [string]$OutFile = 'invoice-app-images.tar',
  [switch]$Push
)

Write-Host "Building images with docker compose (tag: $Tag)..." -ForegroundColor Cyan
docker compose build --no-cache

$username = 'tg3392'
$images = @(
  "$username/invoice-app-frontend:$Tag",
  "$username/invoice-app-api:$Tag",
  "$username/invoice-app-ocr:$Tag"
)

foreach ($img in $images) {
  Write-Host "Checking image: $img"
  $qid = docker images -q $img 2>$null
  if (-not $qid) {
    # try fallback local name without username
    $local = ($img -replace "^$username/", '')
    Write-Host "Image $img not found, checking local fallback: $local"
    $local_id = docker images -q $local 2>$null
    if ($local_id) {
      Write-Host "Tagging local image $local -> $img"
      docker tag $local $img
    } else {
      Write-Error "Required image $img is not present and no fallback found. Aborting."
      exit 1
    }
  }
}

Write-Host "Saving images to $OutFile ..." -ForegroundColor Cyan
docker save -o $OutFile $($images -join ' ')

if ($Push) {
  Write-Host "Pushing images to Docker Hub (user: $username)" -ForegroundColor Cyan
  foreach ($img in $images) {
    Write-Host "Pushing $img"
    docker push $img
  }
}

Write-Host "Done. TAR saved as: $OutFile" -ForegroundColor Green
