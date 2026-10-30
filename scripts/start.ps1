# Starts ShadowScope on Windows: backend on :8787, the mock provider if present, and the web app on :5173.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -BindHost 0.0.0.0    reachable from other laptops
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -NoWeb               backend only
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -DryRun              show the steps, change nothing
#
# Works on Windows PowerShell 5.1 and PowerShell 7. This file must stay ASCII: 5.1 misreads UTF-8 without a BOM.
#
# Packet capture is optional. Without Npcap (https://npcap.com, tick "WinPcap API-compatible mode") the dns_sni and
# loopback collectors stay off and report why in /api/health. Everything else works, including the dashboard,
# uploads, the simulator and the gateway.
param(
    [string]$BindHost = "127.0.0.1",
    [switch]$NoWeb,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Port = 8787
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Venv = Join-Path $Backend ".venv"
$Logs = Join-Path $Backend "data"
$OnWindows = $env:OS -eq "Windows_NT"
$VenvPython = if ($OnWindows) { Join-Path $Venv "Scripts\python.exe" } else { Join-Path $Venv "bin/python" }
$Npm = if ($OnWindows) { "npm.cmd" } else { "npm" }

function Exit-WithMessage([string]$Message) {
    # Write-Error would throw here because of ErrorActionPreference, and show a stack trace instead of the message.
    [Console]::Error.WriteLine($Message)
    exit 1
}

function Write-Step([string]$Message) {
    if ($DryRun) { Write-Output "[dry run] $Message" }
}

function Test-PythonVersion([string]$Command, [string[]]$Arguments) {
    # 3.11+ only. The Microsoft Store stub on PATH prints nothing and fails this check.
    try {
        & $Command @Arguments -c "import sys; sys.exit(sys.version_info < (3, 11))" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Find-Python {
    if (Test-Path "C:\Python315\python.exe") {
        return @{ Command = "C:\Python315\python.exe"; Arguments = @() }
    }
    foreach ($version in "-3.15", "-3.14", "-3.13", "-3.12", "-3.11") {
        if ((Get-Command "py" -ErrorAction SilentlyContinue) -and (Test-PythonVersion "py" @($version))) {
            return @{ Command = "py"; Arguments = @($version) }
        }
    }
    foreach ($name in "python", "python3") {
        if ((Get-Command $name -ErrorAction SilentlyContinue) -and (Test-PythonVersion $name @())) {
            return @{ Command = $name; Arguments = @() }
        }
    }
    return $null
}

function Test-PortBusy([int]$Number) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $client.BeginConnect("127.0.0.1", $Number, $null, $null)
        return $attempt.AsyncWaitHandle.WaitOne(500) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-LanAddress {
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())
        $found = $addresses | Where-Object { $_.AddressFamily -eq "InterNetwork" -and -not $_.ToString().StartsWith("127.") -and -not $_.ToString().StartsWith("169.254.") }
        return ($found | Select-Object -First 1).ToString()
    } catch {
        return ""
    }
}

function Test-Health {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Stop-Tree($Process) {
    # /T stops children too: npm.cmd starts node, and killing only npm would leave Vite running.
    # Errors are swallowed so one failure cannot leave the other processes running.
    if ($null -eq $Process -or $Process.HasExited) { return }
    try {
        if ($OnWindows) {
            & taskkill /PID $Process.Id /T /F 2>$null | Out-Null
        } else {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Output "Could not stop process $($Process.Id). You may need to end it from Task Manager."
    }
}

function Assert-Success([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed. Check the messages above." }
}

if (-not $OnWindows -and -not $DryRun) {
    Exit-WithMessage "This script is for Windows. Use scripts/start.sh on macOS and Linux."
}

$Python = Find-Python
if ($null -eq $Python) {
    Exit-WithMessage "ShadowScope needs Python 3.11 or newer. Install it from https://www.python.org/downloads/ and tick 'Add python to PATH'."
}
if (-not $NoWeb -and -not (Get-Command $Npm -ErrorAction SilentlyContinue)) {
    Exit-WithMessage "npm was not found. Install Node.js from https://nodejs.org, or use -NoWeb for the backend only."
}
if ((Test-PortBusy $Port) -and -not $DryRun) {
    Exit-WithMessage "Port $Port is already in use. Stop whatever is using it, then try again."
}

Write-Step "python: $($Python.Command) $($Python.Arguments -join ' ')"
Write-Step "repo root: $Root"
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $Logs | Out-Null }

if (-not (Test-Path $VenvPython)) {
    Write-Step "create venv at $Venv"
    if (-not $DryRun) {
        Write-Output "Creating the Python environment..."
        $venvArguments = $Python.Arguments + @("-m", "venv", $Venv)
        & $Python.Command @venvArguments
        Assert-Success "Creating the Python environment"
    }
}

$Stamp = Join-Path $Venv ".installed"
$Requirements = Join-Path $Backend "requirements.txt"
$DetectorDir = Join-Path $Root "detector"
$Wanted = (Get-FileHash $Requirements).Hash + (Get-FileHash (Join-Path $DetectorDir "pyproject.toml")).Hash
$Installed = if (Test-Path $Stamp) { (Get-Content $Stamp -Raw).Trim() } else { "" }
if ($Installed -ne $Wanted) {
    Write-Step "pip install -r $Requirements"
    Write-Step "pip install -e $DetectorDir"
    if (-not $DryRun) {
        Write-Output "Installing backend dependencies..."
        & $VenvPython -m pip install --quiet --disable-pip-version-check -r $Requirements
        Assert-Success "Installing backend dependencies"
        & $VenvPython -m pip install --quiet --disable-pip-version-check -e $DetectorDir
        Assert-Success "Installing the detector"
        Set-Content -Path $Stamp -Value $Wanted
    }
}

$Lan = ""
$Origins = if ($env:SHADOWSCOPE_CORS_ORIGINS) { $env:SHADOWSCOPE_CORS_ORIGINS } else { "" }
if ($BindHost -ne "127.0.0.1") {
    $Lan = if ($BindHost -eq "0.0.0.0") { Get-LanAddress } else { $BindHost }
    if ($Lan) { $Origins = (@($Origins, "http://${Lan}:5173") | Where-Object { $_ }) -join "," }
    Write-Warning "The API has no login. Anyone on this network can read it. Use only on a network you trust."
    Write-Output "Windows Firewall may ask to allow Python: allow it on private networks only."
}

$BackendArguments = @("-m", "uvicorn", "app.main:app", "--host", $BindHost, "--port", "$Port")
$HasMock = Test-Path (Join-Path $Root "simulator\mock_provider.py")
Write-Step "CORS origins: '$Origins'"
Write-Step "backend: python $($BackendArguments -join ' ') (in $Backend)"
Write-Step "mock provider: $(if ($HasMock) { 'python -m simulator.mock_provider' } else { 'not present, skipped' })"
Write-Step "web: $(if ($NoWeb) { 'skipped' } else { "$Npm run dev (in web)" })"
if ($DryRun) {
    Write-Output "[dry run] complete, nothing was changed"
    exit 0
}

$BackendProcess = $null
$MockProcess = $null
$WebProcess = $null
try {
    $env:SHADOWSCOPE_CORS_ORIGINS = $Origins
    $BackendProcess = Start-Process -FilePath $VenvPython -ArgumentList $BackendArguments -WorkingDirectory $Backend -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $Logs "backend.out.log") -RedirectStandardError (Join-Path $Logs "backend.log")

    Write-Output "Starting the backend (the first run seeds demo data)..."
    $Ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-Health) { $Ready = $true; break }
        if ($BackendProcess.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) {
        Write-Output "The backend did not start. Last lines of backend\data\backend.log:"
        Get-Content (Join-Path $Logs "backend.log") -Tail 15
        exit 1
    }

    if ($HasMock) {
        $MockProcess = Start-Process -FilePath $VenvPython -ArgumentList @("-m", "simulator.mock_provider") -WorkingDirectory $Root -NoNewWindow -PassThru `
            -RedirectStandardOutput (Join-Path $Logs "mock_provider.out.log") -RedirectStandardError (Join-Path $Logs "mock_provider.log")
    }

    if (-not $NoWeb) {
        $WebDir = Join-Path $Root "web"
        if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
            Write-Output "Installing web dependencies..."
            Push-Location $WebDir
            try {
                & $Npm install --silent
                Assert-Success "Installing web dependencies"
            } finally {
                Pop-Location
            }
        }
        $WebProcess = Start-Process -FilePath $Npm -ArgumentList @("run", "dev") -WorkingDirectory $WebDir -NoNewWindow -PassThru `
            -RedirectStandardOutput (Join-Path $Logs "web.log") -RedirectStandardError (Join-Path $Logs "web.err.log")
    }

    Write-Output ""
    Write-Output "ShadowScope is running. Press Ctrl+C to stop."
    if (-not $NoWeb) { Write-Output "  Dashboard:  http://localhost:5173/app" }
    Write-Output "  API:        http://localhost:$Port/api/health"
    Write-Output "  Gateway:    http://localhost:8789/{provider}/...  (this machine only)"
    if ($Lan) {
        Write-Output ""
        Write-Output "  From another laptop: http://${Lan}:5173/app"
    }
    Write-Output "  dns_sni and loopback stay off without Npcap. See the top of this script."
    Write-Output "  Logs:       backend\data\*.log"

    while (-not $BackendProcess.HasExited) { Start-Sleep -Seconds 1 }
    Write-Output "The backend stopped. See backend\data\backend.log"
} finally {
    Write-Output ""
    Write-Output "Stopping ShadowScope..."
    Stop-Tree $WebProcess
    Stop-Tree $MockProcess
    Stop-Tree $BackendProcess
}
