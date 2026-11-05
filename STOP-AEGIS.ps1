$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:LOCALAPPDATA 'AEGIS-OS\runtime'

# --- Stop launcher-owned processes -------------------------------------------
$specifications = @(
    @{ Name = 'singularity'; Entry = 'start-singularity.js' },
    @{ Name = 'ollama'; Entry = 'ollama serve' },
    @{ Name = 'gateway'; Entry = '\gateway\index.js' },
    @{ Name = 'console'; Entry = '\console\node_modules\vite\bin\vite.js' }
)

foreach ($specification in $specifications) {
    $pidPath = Join-Path $runtime "$($specification.Name).pid"
    if (-not (Test-Path -LiteralPath $pidPath)) {
        Write-Host "[AEGIS-OS] No launcher-owned $($specification.Name) process recorded; leaving running processes untouched."
        continue
    }

    $rootId = [int](Get-Content -LiteralPath $pidPath -Raw)
    $processes = @(Get-CimInstance Win32_Process)
    $rootProcess = $processes | Where-Object { $_.ProcessId -eq $rootId } | Select-Object -First 1
    if (-not $rootProcess) {
        Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
        Write-Host "[AEGIS-OS] Cleared stale $($specification.Name) PID record."
        continue
    }

    if (-not $rootProcess.CommandLine -or $rootProcess.CommandLine.IndexOf($specification.Entry, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        Write-Host "[AEGIS-OS] PID $rootId no longer matches the recorded $($specification.Name) command; leaving it untouched."
        Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
        continue
    }

    $ownedIds = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ownedIds.Add($rootId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($process in $processes) {
            if ($ownedIds.Contains([int]$process.ParentProcessId) -and $ownedIds.Add([int]$process.ProcessId)) {
                $changed = $true
            }
        }
    }
    foreach ($processId in @($ownedIds) | Sort-Object -Descending) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $pidPath -Force
    Write-Host "[AEGIS-OS] Stopped launcher-owned $($specification.Name) process tree."
}

# --- Clear stale master startup lock -----------------------------------------
$lockPath = Join-Path $runtime 'master-start-v04.lock'
if (Test-Path -LiteralPath $lockPath) {
    $lockOwner = 0
    [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw), [ref]$lockOwner)
    if ($lockOwner -le 0 -or -not (Get-Process -Id $lockOwner -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $lockPath -Force
        Write-Host '[AEGIS-OS] Cleared stale master startup lock.'
    }
}

Write-Host '[AEGIS-OS] Stop complete.'
