# ShadowScope Engine Starter Script for Windows
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$venvDir = Join-Path $backendDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

Write-Host ">>> Starting ShadowScope Engine on Windows..." -ForegroundColor Cyan

$pythonExe = "C:\Python315\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating Python virtual environment in $venvDir..." -ForegroundColor Yellow
    & $pythonExe -m venv $venvDir
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")
}

Set-Location $backendDir
Write-Host ">>> Launching Uvicorn server on http://127.0.0.1:8787..." -ForegroundColor Green
& $venvPython -m uvicorn app.main:app --host 0.0.0.0 --port 8787
