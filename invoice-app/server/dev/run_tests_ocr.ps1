$files = @()
# ensure PowerShell prints UTF-8 to console where possible
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if (Test-Path .\example-invoice-for-upload.pdf) { $files += (Resolve-Path -LiteralPath .\example-invoice-for-upload.pdf).Path }
if (Test-Path .\uploads) { $files += Get-ChildItem -LiteralPath .\uploads -File -Filter '*.pdf' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName }
if(-not $files){ Write-Host 'No files found to test.'; exit 0 }
foreach ($f in $files) {
    Write-Host "=== FILE: $f ==="
    try {
        # call curl and store raw response into a temp file, then read as UTF8
        $tmp = [IO.Path]::GetTempFileName()
        curl.exe -s -F ("file=@" + $f) http://127.0.0.1:3000/api/ocr -o $tmp
        $ocrJson = Get-Content -Raw -Encoding UTF8 $tmp
        Remove-Item $tmp -ErrorAction SilentlyContinue
        if (-not $ocrJson) { Write-Host 'No OCR response'; continue }
        $ocr = $ocrJson | ConvertFrom-Json
        $txt = ($ocr.ocrText -replace "`r", "") -replace "`n", ' '
        $len = ($txt).Length
        $sample = if ($len -gt 300) { $txt.Substring(0,300) + '...' } else { $txt }
        Write-Host "OCR length: $len"
        Write-Host "OCR sample: $sample"
        $epoch = [int][double]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalSeconds
        $body = @{ requestId = ("smoke-{0}" -f $epoch); ocrText = $ocr.ocrText } | ConvertTo-Json -Depth 5
        # send NLP request via curl to avoid PowerShell Invoke-RestMethod encoding issues
        $tmpBody = [IO.Path]::GetTempFileName()
        $body | Out-File -FilePath $tmpBody -Encoding UTF8
        $nlpRaw = curl.exe -s -H "Content-Type: application/json; charset=utf-8" --data-binary "@$tmpBody" http://127.0.0.1:3000/nlp/extract
        Remove-Item $tmpBody -ErrorAction SilentlyContinue
        if (-not $nlpRaw) { Write-Host 'No NLP response'; continue }
        $nlp = $nlpRaw | ConvertFrom-Json
        Write-Host "NLP status: $($nlp.status)  type: $($nlp.data.type)"
        foreach ($fie in $nlp.data.fields) { Write-Host (" - {0}: {1} (conf={2})" -f $fie.name, ($fie.value -replace "`r|`n", ' '), $fie.confidence) }
    } catch {
        Write-Host ('Error testing {0}: {1}' -f $f, $_)
    }
}
