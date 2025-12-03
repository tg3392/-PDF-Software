<#
Setup-Skript für OCR-Umgebung (Windows PowerShell)
- Installiert Python-Abhängigkeiten (pip)
- Versucht Tesseract via Chocolatey zu installieren (wenn choco vorhanden)
#>
Write-Output "== OCR Setup Script =="

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Output "Python nicht gefunden. Bitte Python installieren und in PATH einfügen."; exit 1
}

$req = Join-Path -Path $PSScriptRoot -ChildPath 'requirements.txt'
if (Test-Path $req) {
    Write-Output "Installing Python requirements from $req"
    python -m pip install --upgrade pip
    python -m pip install -r $req
} else {
    Write-Output "requirements.txt not found in $PSScriptRoot"
}

if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Output "Chocolatey found — attempting to install tesseract"
    choco install -y tesseract
} else {
    Write-Output "Chocolatey not found. Please install Tesseract manually from https://github.com/tesseract-ocr/tesseract/releases"
}

Write-Output "Setup finished. Verify Tesseract with: tesseract --version"
Write-Output "Then start the OCR wrapper: .\start_ocr_wrapper.ps1"
