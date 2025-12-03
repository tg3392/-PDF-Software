<#
Package Dockerfiles for sharing.

Usage:
  .\package-dockerfiles.ps1 [-Out zipfile] [-CreateGist]

Options:
  -Out: output zip filename (default: dockerfiles.zip)
  -CreateGist: if set and `gh` CLI is installed/authorized, create a public Gist and print the URL
#>

param(
  [string]$Out = 'dockerfiles.zip',
  [switch]$CreateGist
)

$files = @()
if (Test-Path './Dockerfile.frontend') { $files += (Resolve-Path './Dockerfile.frontend').Path }
if (Test-Path './server/Dockerfile') { $files += (Resolve-Path './server/Dockerfile').Path }
if (Test-Path './ocr/Dockerfile') { $files += (Resolve-Path './ocr/Dockerfile').Path }

if ($files.Count -eq 0) {
  Write-Error "No Dockerfiles found in expected locations: ./Dockerfile.frontend, ./server/Dockerfile, ./ocr/Dockerfile"
  exit 1
}

Write-Host "Creating zip $Out with these files:" -ForegroundColor Cyan
$files | ForEach-Object { Write-Host " - $_" }

if (Test-Path $Out) { Remove-Item $Out -Force }
Compress-Archive -Path $files -DestinationPath $Out -Force

Write-Host "Created: $Out" -ForegroundColor Green

if ($CreateGist) {
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "Creating Gist (public) via gh..." -ForegroundColor Cyan
    $args = @()
    foreach ($f in $files) { $args += $f }
    $result = gh gist create @args --public -d "Dockerfiles for invoice-app"
    if ($?) { Write-Host "Gist created: $result" -ForegroundColor Green }
    else { Write-Error "Failed to create gist via gh" }
  } else {
    Write-Error "gh CLI not found. Install GitHub CLI and 'gh auth login' to enable gist creation." -ForegroundColor Yellow
  }
}

Write-Host "Done." -ForegroundColor Cyan
