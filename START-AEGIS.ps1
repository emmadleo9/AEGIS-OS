$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22.19 or newer is required. Install Node.js, then run MASTER START AEGIS-OS V.04.bat again.'
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

foreach ($directory in @('gateway', 'console')) {
    $project = Join-Path $root $directory
    if (-not (Test-Path (Join-Path $project 'node_modules'))) {
        Write-Host "[AEGIS-OS] Installing missing $directory dependencies from its lockfile..."
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

$launcher = Join-Path $root 'scripts\start-singularity.js'
Write-Host '[AEGIS-OS] Starting the gateway first, then waiting for its API health check before starting the console.'
& node $launcher
if ($LASTEXITCODE -ne 0) {
    throw "AEGIS master startup failed (exit $LASTEXITCODE). Check the error above and verify ports 2785 and 5173."
}
