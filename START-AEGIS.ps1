$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $env:LOCALAPPDATA 'AEGIS-OS\runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

foreach ($directory in @('gateway', 'console')) {
    $project = Join-Path $root $directory
    if (-not (Test-Path (Join-Path $project 'node_modules'))) {
        Write-Host "[AEGIS-OS] Installing missing $directory dependencies..."
        Push-Location $project
        try {
            & npm.cmd ci --silent
            if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed for $directory (exit $LASTEXITCODE)." }
        } finally {
            Pop-Location
        }
    }
}

function Start-AegisService {
    param([string]$Name, [int]$Port, [string]$WorkingDirectory, [string[]]$Arguments)

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        Write-Host "[AEGIS-OS] Port $Port is already occupied; leaving its process untouched."
        return
    }

    $stdout = Join-Path $runtime "$Name.log"
    $stderr = Join-Path $runtime "$Name-error.log"
    $process = Start-Process -FilePath 'node' -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    Set-Content -LiteralPath (Join-Path $runtime "$Name.pid") -Value $process.Id -NoNewline
    Write-Host "[AEGIS-OS] Started $Name (PID $($process.Id)) on port $Port."
}

$gatewayDirectory = Join-Path $root 'gateway'
$consoleDirectory = Join-Path $root 'console'
$viteEntry = Join-Path $consoleDirectory 'node_modules\vite\bin\vite.js'
$gatewayEntry = Join-Path $gatewayDirectory 'index.js'
Start-AegisService -Name 'gateway' -Port 2785 -WorkingDirectory $gatewayDirectory -Arguments @($gatewayEntry)

$gatewayReady = $false
$deadline = (Get-Date).AddSeconds(30)
do {
    try {
        $status = Invoke-RestMethod -Uri 'http://127.0.0.1:2785/api/whatsapp/status' -TimeoutSec 3
        $gatewayReady = $status.PSObject.Properties.Name -contains 'status'
    } catch { }
    if (-not $gatewayReady) { Start-Sleep -Seconds 1 }
} while (-not $gatewayReady -and (Get-Date) -lt $deadline)
if (-not $gatewayReady) {
    throw 'The AEGIS local gateway is not responding with WhatsApp routes on port 2785. Check gateway-error.log and stop any other service using that port.'
}

Start-AegisService -Name 'console' -Port 5173 -WorkingDirectory $consoleDirectory -Arguments @($viteEntry, '--host', '0.0.0.0', '--port', '5173')
Write-Host '[AEGIS-OS] Console: http://localhost:5173  AEGIS local gateway: http://localhost:2785'
