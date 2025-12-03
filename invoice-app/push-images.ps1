<#
Push images to Docker Hub.

Usage:
  1) Set your Docker Hub username in $DockerUser (or pass as first arg).
  2) Run: .\push-images.ps1 mydockerhubuser

This script will:
  - build images via `docker compose build`
  - tag the built images to `$DockerUser/...`
  - push them to Docker Hub

You must run `docker login` beforehand or this will prompt.
#>

param(
  [string]$DockerUser,
  [string]$Tag = 'latest',
  [switch]$Build
)

if (-not $DockerUser) {
  if ($env:DOCKERHUB_USER) { $DockerUser = $env:DOCKERHUB_USER }
  else {
    $DockerUser = 'tg3392'
    Write-Host "No username provided — defaulting to '$DockerUser'" -ForegroundColor Yellow
  }
}

if ($Build) {
  Write-Host "Building images with docker compose..." -ForegroundColor Cyan
  docker compose build --no-cache
}

# Local image names used in compose (without tag)
$images = @(
  @{ local='invoice-app-frontend'; remote="$DockerUser/invoice-app-frontend" },
  @{ local='invoice-app-api'; remote="$DockerUser/invoice-app-api" },
  @{ local='invoice-app-ocr'; remote="$DockerUser/invoice-app-ocr" }
)

Write-Host "Tagging and pushing images to Docker Hub as user: $DockerUser (tag: $Tag)" -ForegroundColor Cyan
foreach ($img in $images) {
  $local = "${($img.local)}:$Tag"
  $remote = "${($img.remote)}:$Tag"

  # If the local image with username already exists, prefer it; otherwise tag fallback
  $exists = (docker images -q $remote) -ne $null -and (docker images -q $remote) -ne ''
  if (-not $exists) {
    $local_id = docker images -q $local 2>$null
    if ($local_id) {
      Write-Host "Tagging $local -> $remote"
      docker tag $local $remote
    } else {
      # check for unscoped local image (no username)
      $fallback = ($local -replace "^$Tag:`", '')
      # attempt to tag from image without username
      $fallback_name = (${img.local} + ':' + $Tag)
      $fallback_id = docker images -q $fallback_name 2>$null
      if ($fallback_id) {
        Write-Host "Tagging fallback $fallback_name -> $remote"
        docker tag $fallback_name $remote
      } else {
        Write-Error "Required image $local (or fallback) is not present. Run docker compose build or use -Build to build first. Aborting."
        exit 1
      }
    }
  } else {
    Write-Host "Remote-tag already present locally: $remote"
  }

  Write-Host "Pushing $remote"
  docker push $remote
}

Write-Host "Done. Verify images on Docker Hub or run `docker pull <user>/<repo>` on other host." -ForegroundColor Green
