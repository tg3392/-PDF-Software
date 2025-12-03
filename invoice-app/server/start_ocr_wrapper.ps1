<#
Startet den OCR FastAPI Wrapper (`ocr_fastapi_single.py`) auf Port 8003.
Beendet ggf. laufende Prozesse auf Port 8003 und startet uvicorn im Hintergrund.
#>
Write-Output "Starting OCR wrapper (uvicorn) on port 8003"

$pidLine = (netstat -ano | Select-String ":8003" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
if ($pidLine) {
    try {
        Write-Output "Killing PID $pidLine on port 8003"
        Stop-Process -Id $pidLine -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Output "Failed to kill PID $($pidLine): $_"
    }
}

$script = Join-Path $PSScriptRoot 'ocr_fastapi_single.py'
if (-not (Test-Path $script)) { Write-Output "Wrapper not found: $script"; exit 1 }

Start-Process -NoNewWindow -FilePath python -ArgumentList '-m','uvicorn','ocr_fastapi_single:app','--app-dir',$PSScriptRoot,'--host','127.0.0.1','--port','8003','--log-level','info' -WorkingDirectory $PSScriptRoot
Write-Output "OCR wrapper started (background). Check logs in the console or use: curl http://127.0.0.1:8003/"
