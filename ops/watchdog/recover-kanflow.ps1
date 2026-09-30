<#
.SYNOPSIS
Manual recovery: force a robust restart of the kanflow.exe service and print
status (service, port 3000 listener, /api/health, tail of daemon logs).
Run as administrator (recover.bat in the repo root does this for you).

.PARAMETER StatusOnly
Only print the status; do not restart anything.
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "kanflow.exe",
    [int]$Port = 3000,
    [string]$HealthUrl = "http://127.0.0.1:3000/api/health",
    [switch]$StatusOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force
$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "watchdog.log"

function Show-Status {
    Write-Host ""
    Write-Host "=== Status ===" -ForegroundColor Cyan
    foreach ($name in @($ServiceName, "KanflowMySQL", "kanflowworker.exe")) {
        $s = Get-Service -Name $name -ErrorAction SilentlyContinue
        Write-Host ("  service {0,-14}: {1}" -f $name, $(if ($s) { $s.Status } else { "NOT INSTALLED" }))
    }
    $pids = @(Get-PortListenerPids -Port $Port)
    $desc = if ($pids.Count -eq 0) { "nothing LISTENING" } else {
        ($pids | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; "{0} ({1})" -f $_, $(if ($p) { $p.ProcessName } else { "?" }) }) -join ", "
    }
    Write-Host ("  port {0}          : {1}" -f $Port, $desc)
    $h = Test-KanflowHealth -Url $HealthUrl
    Write-Host ("  /api/health        : http={0} db={1} ollama={2} build={3} {4}" -f $h.StatusCode, $h.Db, $h.Ollama, $h.BuildId, $(if ($h.Error) { "($($h.Error))" } else { "" }))
    $hb = Get-WorkerHeartbeat
    Write-Host ("  worker heartbeat   : {0} (age {1}s, pid {2}) mode={3}" -f $hb.Status, $hb.AgeSec, $hb.Pid, (Get-TranslationWorkerMode))
    if ($null -ne $h.Pending) { Write-Host ("  translation queue  : pending={0} oldest={1}s" -f $h.Pending, $h.OldestPendingAgeSec) }
    foreach ($f in @("kanflow.err.log", "kanflow.out.log")) {
        $path = Join-Path $paths.DaemonDir $f
        if (Test-Path -LiteralPath $path) {
            Write-Host ""
            Write-Host "--- last 15 lines of $path ---" -ForegroundColor DarkGray
            Get-Content -LiteralPath $path -Tail 15 | ForEach-Object { Write-Host "  $_" }
        }
    }
}

if (-not $StatusOnly) {
    if (-not (Test-IsAdministrator)) {
        Write-Host "[ERROR] Restarting the service requires an elevated prompt (Run as administrator)." -ForegroundColor Red
        Show-Status
        exit 1
    }
    Write-Host "=== Restarting $ServiceName (stop, kill orphan listener on :$Port, start, verify) ===" -ForegroundColor Cyan
    Write-RotatingLog -Path $LogFile -Message "manual recovery requested by $env:USERNAME"
    $ok = Restart-KanflowService -ServiceName $ServiceName -Port $Port -HealthUrl $HealthUrl -LogFile $LogFile
    Show-Status
    Write-Host ""
    if ($ok) { Write-Host "[OK] Kanflow recovered." -ForegroundColor Green; exit 0 }
    Write-Host "[FAIL] Kanflow is not healthy. See the daemon logs above and ops\logs\watchdog.log." -ForegroundColor Red
    exit 1
}
Show-Status
exit 0
