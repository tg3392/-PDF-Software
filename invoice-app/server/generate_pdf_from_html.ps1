param(
    [string]$html = "example-outgoing-invoice.html",
    [string]$out = "example-outgoing-invoice.pdf"
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $here

Write-Host "Generate PDF from HTML:" $html "->" $out

# Try msedge (Chromium) headless print-to-pdf
$edge = Get-Command msedge -ErrorAction SilentlyContinue
if ($edge) {
    Write-Host "Using msedge to print to PDF..."
    $htmlPath = (Resolve-Path $html).ProviderPath
    $fileUri = "file:///$htmlPath" -replace "\\","/"
    $cmd = "$($edge.Source) --headless --disable-gpu --print-to-pdf=$out $fileUri"
    Write-Host $cmd
    & $edge.Source --headless --disable-gpu --print-to-pdf=$out $fileUri
    if (Test-Path $out) { Write-Host "PDF generated: $out"; exit 0 }
    Write-Host "msedge reported exit but file not created." -ForegroundColor Yellow
}

# Try wkhtmltopdf
$wk = Get-Command wkhtmltopdf -ErrorAction SilentlyContinue
if ($wk) {
    Write-Host "Using wkhtmltopdf to render PDF..."
    & $wk.Source $html $out
    if (Test-Path $out) { Write-Host "PDF generated: $out"; exit 0 }
    Write-Host "wkhtmltopdf reported exit but file not created." -ForegroundColor Yellow
}

Write-Host "No supported PDF renderer found on PATH." -ForegroundColor Red
Write-Host "Options:"
Write-Host " - Install wkhtmltopdf and re-run: https://wkhtmltopdf.org/"
Write-Host " - Or open the HTML in a browser and print to PDF manually."
Write-Host "Command to run manually with msedge (if installed):"
Write-Host "msedge --headless --disable-gpu --print-to-pdf=example-outgoing-invoice.pdf file:///$(Resolve-Path $html)"
exit 2
