$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $env:LOCALAPPDATA 'AEGIS-OS\runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

# --- Prerequisites -----------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Install Node.js (>=22.19), then run MASTER START AEGIS-OS V.04.bat again.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm.cmd was not found. Repair the Node.js installation and try again.'
}

$nodeVersionText = (& node --version).Trim().TrimStart('v')
try {
    $nodeVersion = [version]$nodeVersionText
} catch {
    throw "Could not read the installed Node.js version: $nodeVersionText"
}
if ($nodeVersion -lt [version]'22.19') {
    throw "Node.js 22.19 or newer is required; found $nodeVersionText."
}

# --- Install dependencies if missing -----------------------------------------
foreach ($directory in @('gateway', 'console')) {
    $project = Join-Path $root $directory
    $modules = Join-Path $project 'node_modules'
    if (-not (Test-Path $modules)) {
        Write-Host "[AEGIS-OS] Installing missing $directory dependencies..."
        Push-Location $project
        try {
            & npm.cmd ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                throw "Dependency installation failed for $directory (exit $LASTEXITCODE)."
            }
        } finally {
            Pop-Location
        }
    }
}

# --- Build OpenWA if needed --------------------------------------------------
$gatewayDir = Join-Path $root 'gateway'
$openwaMain = Join-Path $gatewayDir 'dist\main.js'
if (-not (Test-Path -LiteralPath $openwaMain)) {
    Write-Host '[AEGIS-OS] Building OpenWA gateway...'
    Push-Location $gatewayDir
    try {
        & npm.cmd run build --silent
        if ($LASTEXITCODE -ne 0) {
            throw 'OpenWA build failed.'
        }
    } finally {
        Pop-Location
    }
}

# --- Start the coordinator launcher ------------------------------------------
$launcher = Join-Path $root 'scripts\start-singularity.js'
Write-Host '[AEGIS-OS] Starting the gateway first, then waiting for its API health check before starting the console.'
& node $launcher
if ($LASTEXITCODE -ne 0) {
    throw "AEGIS master startup failed (exit $LASTEXITCODE). Check the error above and verify ports 2785 and 5173."
}

Write-Host '[AEGIS-OS] Startup complete.'
Write-Host '[AEGIS-OS] Console: http://localhost:5173'
Write-Host '[AEGIS-OS] Gateway: http://127.0.0.1:2785'
