# Runs the demo sequence against a running backend. Start one first with scripts\start.ps1.
#   powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Api = "http://127.0.0.1:8787/api"
$OnWindows = $env:OS -eq "Windows_NT"
$Python = if ($OnWindows) { Join-Path $Root "backend\.venv\Scripts\python.exe" } else { Join-Path $Root "backend/.venv/bin/python" }
$Scenarios = @("shadow_saas_sweep", "env_file_leak", "customer_pii_dump", "proprietary_code", "rogue_agent", "canary_trip", "gateway_block", "exfil_spike")
$GapSeconds = 4
$HasSimulator = Test-Path (Join-Path (Join-Path $Root "simulator") "demo_sequence.py")

if ($DryRun) {
    Write-Output "[dry run] $(if ($HasSimulator) { "$Python -m simulator.demo_sequence" } else { "canned scenarios: $($Scenarios -join ', ')" })"
    exit 0
}

try {
    Invoke-RestMethod -Uri "$Api/health" -TimeoutSec 2 | Out-Null
} catch {
    [Console]::Error.WriteLine("The backend is not running. Start it with scripts\start.ps1")
    exit 1
}

if ($HasSimulator) {
    Push-Location $Root
    try {
        & $Python -m simulator.demo_sequence
        exit $LASTEXITCODE
    } finally {
        Pop-Location
    }
}

Write-Output "simulator/ is not available yet, so this runs the backend's canned scenarios instead."
foreach ($scenario in $Scenarios) {
    Write-Output "  $scenario"
    Invoke-RestMethod -Uri "$Api/simulate" -Method Post -ContentType "application/json" -Body (@{ scenario_id = $scenario } | ConvertTo-Json) | Out-Null
    Start-Sleep -Seconds $GapSeconds
}
Write-Output "Done."
