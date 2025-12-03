<#
Kurzes Smoke-Test-Skript:
- Erwartet, dass Node API auf http://127.0.0.1:3000 läuft
- Erwartet, dass OCR Wrapper (uvicorn) auf http://127.0.0.1:8003 läuft
- Sendet `example-invoice-for-upload.pdf` an `/api/ocr` und dann das Ergebnis an `/nlp/extract`
#>
param()

$api = 'http://127.0.0.1:3000'
$ocrFile = Join-Path $PSScriptRoot '..\example-invoice-for-upload.pdf'
if (-not (Test-Path $ocrFile)) { Write-Output "Beispiel-PDF nicht gefunden: $ocrFile"; exit 1 }

Write-Output "Posting PDF to $api/api/ocr ..."

$form = @{ file = Get-Item $ocrFile }
try {
    $ocrRespRaw = Invoke-WebRequest -Uri "$api/api/ocr" -Method Post -Form $form -TimeoutSec 60
    $ocrResp = $ocrRespRaw.Content | ConvertFrom-Json
    Write-Output "OCR response status: $($ocrResp | Get-Member -Name ocrText -ErrorAction SilentlyContinue ? 'ok' : 'no ocrText')"
    if ($ocrResp.ocrText) {
        Write-Output "ocrText excerpt: $($ocrResp.ocrText.Substring(0,[math]::Min(300,$ocrResp.ocrText.Length)))"
    }
    Write-Output "Posting to /nlp/extract ..."
    $body = @{ requestId = "smoke-" + (Get-Date -UFormat %s); ocrText = $ocrResp.ocrText }
    $nlp = Invoke-RestMethod -Uri "$api/nlp/extract" -Method Post -Body ($body | ConvertTo-Json -Depth 5) -ContentType 'application/json' -TimeoutSec 60
    Write-Output "nlp response:"; $nlp | ConvertTo-Json -Depth 5
} catch {
    Write-Output "Smoke test failed: $_"
    exit 1
}

Write-Output "Smoke test finished."
