Param(
    [string]$ModelUrl
)

# Creates the required directories for the nlp_api service and optionally downloads a model archive.

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$paths = @(
    "..\cache\feedback",
    "..\cache\pending_results",
    "invoice_nlp\model"
)

foreach ($p in $paths) {
    $full = Join-Path $root $p
    if (-not (Test-Path $full)) {
        Write-Host "Creating $full"
        New-Item -ItemType Directory -Path $full -Force | Out-Null
    }
}

# Create .gitkeep placeholders so empty dirs can be inspected
foreach ($p in @('..\cache\feedback','.','..\cache\pending_results')) {
    $f = Join-Path $root $p
    $keep = Join-Path $f ".gitkeep"
    if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
}

if ($ModelUrl) {
    $out = Join-Path $root "invoice_nlp\model\model.zip"
    Write-Host "Downloading model from $ModelUrl to $out"
    try {
        Invoke-WebRequest -Uri $ModelUrl -OutFile $out -UseBasicParsing -ErrorAction Stop
        Write-Host "Downloaded model archive to $out. Please extract it so that the folder 'model-best' sits under 'nlp/invoice_nlp/model'"
    } catch {
        Write-Error "Download failed: $_"
        exit 1
    }
} else {
    Write-Host "Created directories. Place your model under 'nlp/invoice_nlp/model/model-best' (read-only mount)."
}
