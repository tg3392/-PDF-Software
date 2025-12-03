<#
Exports the root filesystem of a Docker image by creating a temporary container,
exporting its filesystem to a TAR, and extracting it to a host directory.

Usage examples:
  # default image and output dir
  .\tools\export_nlp_image.ps1

  # specify image and output directory
  .\tools\export_nlp_image.ps1 -ImageName 'apl83/nlp:1.0' -OutDir '.\\extracted\\apl83_nlp'

Parameters:
  -ImageName: Docker image to pull/export (default: 'apl83/nlp:1.0')
  -OutDir: directory to extract root filesystem into (default: './extracted/apl83_nlp')
  -SaveImageTar: switch to also run `docker save` and keep image tar (default: $false)
  -ImageTarPath: path for saved image tar when -SaveImageTar is used
#>

param(
    [string]$ImageName = 'apl83/nlp:1.0',
    [string]$OutDir = '.\extracted\apl83_nlp',
    [switch]$SaveImageTar,
    [string]$ImageTarPath = '.\apl83_nlp_1.0_image.tar'
)

function Abort([string]$msg){ Write-Error $msg; exit 1 }

Write-Host "Exporting image root filesystem: $ImageName"

# Check docker exists
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Abort "Docker CLI not found in PATH. Install Docker Desktop and ensure 'docker' is available."
}

try {
    Write-Host 'Pulling image (may take a while)...'
    docker pull $ImageName | Out-Null
} catch {
    Abort ("Failed to pull image " + $ImageName + ": " + $_)
}

if ($SaveImageTar) {
    Write-Host "Saving image to tar: $ImageTarPath"
    try { docker save -o $ImageTarPath $ImageName } catch { Write-Warning ("docker save failed: " + $_) }
}

# create temporary container
$tmpName = "tmp_export_$(Get-Random)"
Write-Host "Creating temporary container: $tmpName"
try {
    $cid = (docker create --name $tmpName $ImageName).Trim()
} catch {
    Abort ("Failed to create container from " + $ImageName + ": " + $_)
}

$tarPath = Join-Path -Path (Get-Location) -ChildPath "$($tmpName)_fs.tar"
Write-Host "Exporting container filesystem to: $tarPath"
try {
    docker export -o $tarPath $cid
} catch {
    # cleanup container before exiting
    docker rm -f $cid | Out-Null
    Abort ("docker export failed: " + $_)
}

Write-Host "Removing temporary container $cid"
docker rm -f $cid | Out-Null

# ensure outdir exists and extract
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
Write-Host "Extracting TAR to $OutDir (this may take a while)"
try {
    tar -xf $tarPath -C $OutDir
} catch {
    Write-Warning ("Extraction via 'tar' failed: " + $_ + ". On Windows ensure tar is available (WSL or builtin tar on recent Windows).")
    Abort ("Failed to extract " + $tarPath)
}

Write-Host "Cleaning up temporary TAR: $tarPath"
Remove-Item -Force $tarPath

Write-Host "Done. Root filesystem extracted to: $OutDir"
Write-Host "You can now inspect files under $OutDir (e.g. $OutDir\app or $OutDir\usr)."
