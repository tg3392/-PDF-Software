<#
Run a smoke test for the integrated NLP container + API.

What it does:
- ensures required dirs exist (calls create_nlp_dirs.ps1)
- warns if model folder `./nlp/invoice_nlp/model/model-best` is missing
- starts docker compose (development `docker compose up -d`)
- waits for `nlp_api` to respond on http://localhost:8000/ (retries)
- sends a sample POST to local API at http://127.0.0.1:3000/nlp/extract
- prints the response and tails `nlp_api` logs

Usage:
  Open an elevated PowerShell (or a shell with Docker access) and run:
    .\tools\run_nlp_smoke_test.ps1

Notes:
- This script runs commands on your machine; I cannot execute them for you.
- Ensure Docker Desktop is running before executing.
#>

param(
    [int]$NlpCheckRetries = 20,
    [int]$NlpCheckIntervalSec = 3
)

function Abort([string]$msg){ Write-Error $msg; exit 1 }

Write-Host "Step 1: create required directories"
if (-not (Test-Path .\create_nlp_dirs.ps1)) { Abort "Missing helper script: create_nlp_dirs.ps1" }
& .\create_nlp_dirs.ps1

$modelPath = Join-Path (Get-Location) 'nlp\invoice_nlp\model\model-best'
if (-not (Test-Path $modelPath)) {
    Write-Warning "Model directory not found: $modelPath"
    Write-Warning "The nlp_api container may fail if the model is required. Place the model at the above path and re-run."
}

Write-Host "Step 2: start docker compose (development)"
try {
    docker compose -f docker-compose.yml pull --quiet | Out-Null
} catch { Write-Host "docker compose pull failed or skipped: $_" }

try {
    docker compose -f docker-compose.yml up -d
} catch {
    Abort "Failed to start compose: $_"
}

Write-Host "Waiting for nlp_api to respond on http://localhost:8003/"
$ok = $false
for ($i=0; $i -lt $NlpCheckRetries; $i++) {
    try {
        $r = Invoke-WebRequest -Uri http://localhost:8003/ -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $ok = $true; break }
    } catch {
        Write-Host -NoNewline "."
    }
    Start-Sleep -Seconds $NlpCheckIntervalSec
}
Write-Host ""
if (-not $ok) {
    Write-Warning "nlp_api did not respond within timeout. Gathering logs for diagnosis..."
    docker compose -f docker-compose.yml logs nlp_api --tail 200
    Abort "nlp_api not responding"
}

Write-Host "nlp_api is responding. Performing sample request against local API (which forwards to nlp_api)"
try {
    $body = @{ ocrText = "Rechnung Nr. 2025-1001`nGesamtbetrag 71,00" } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/nlp/extract -Body $body -ContentType 'application/json' -TimeoutSec 20
    Write-Host "API Response:`n" (ConvertTo-Json $resp -Depth 5)
} catch {
    Write-Warning "API test request failed: $_"
}

Write-Host "Tailing nlp_api logs (last 200 lines):"
docker compose -f docker-compose.yml logs nlp_api --tail 200

Write-Host "Smoke test completed. If you saw a JSON response above the forwarding works; otherwise inspect logs.`n"
