<#
.SYNOPSIS
Kanflow watchdog - probes /api/health and restarts the node-windows
"kanflow.exe" service when the app is really down. Run every 5 minutes by the
"KanflowWatchdog" scheduled task (see register-watchdog-task.ps1) as SYSTEM.

.DESCRIPTION
Decision flow per run:
  0. rotate logs (ops\logs, ai-activity.log, node-windows daemon logs)
  1. maintenance flag ops\watchdog\MAINTENANCE present (and < 6h old) -> do nothing
  2. probe health; on failure wait -RetryDelaySec and probe again
     (2 consecutive failures are required before acting)
  3. database reported "error" and the KanflowMySQL service is not running
     -> start MySQL first (restarting the app would not help), re-probe
  4. otherwise restart kanflow.exe robustly (stop, kill orphan port listener,
     start, verify NEW listener PID + healthy), at most once per -CooldownMin
  W. worker check (before 2-4, only when app\.env AI_TRANSLATION_WORKER is
     external - the default): service $WorkerServiceName installed but not
     Running, or Running with a STALE heartbeat file (hung / lock lost)
     -> Restart-KanflowWorker, at most once per -WorkerCooldownMin.
     "absent" heartbeat while Running = standby or still starting: warn only.
     Not installed while external: warn (every 6 h), no action.
Healthy runs write nothing to the log (no log bloat).

Until a build that contains /api/health is deployed, a 404 from /api/health
falls back to probing /api/auth/csrf so the watchdog never restart-loops on
an older build.

Exit codes: 0 = healthy / recovered / maintenance, 1 = still unhealthy.
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "kanflow.exe",
    [string]$MySqlServiceName = "KanflowMySQL",
    [string]$WorkerServiceName = "kanflowworker.exe",
    [ValidateRange(0, 1440)][int]$WorkerCooldownMin = 15,
    [switch]$SkipWorkerCheck,
    [int]$Port = 3000,
    [string]$HealthUrl = "http://127.0.0.1:3000/api/health",
    [string]$FallbackUrl = "http://127.0.0.1:3000/api/auth/csrf",
    [ValidateRange(1, 120)][int]$ProbeTimeoutSec = 15,
    [ValidateRange(0, 300)][int]$RetryDelaySec = 20,
    [ValidateRange(0, 1440)][int]$CooldownMin = 15,
    [ValidateRange(1, 48)][int]$MaintenanceMaxHours = 6
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "watchdog.log"
$StateFile = Join-Path $paths.LogDir "watchdog-state.json"
$MaintenanceFlag = Join-Path $PSScriptRoot "MAINTENANCE"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level -Quiet }

function Read-State {
    $s = [ordered]@{ lastRestart = $null; failedRuns = 0; lastMaintenanceLog = $null; lastWorkerRestart = $null; lastWorkerWarn = $null }
    if (Test-Path -LiteralPath $StateFile) {
        try {
            $j = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
            foreach ($k in @("lastRestart", "failedRuns", "lastMaintenanceLog", "lastWorkerRestart", "lastWorkerWarn")) {
                if ($j.PSObject.Properties.Name -contains $k) { $s[$k] = $j.$k }
            }
        } catch { Log "state file unreadable; starting fresh" "WARN" }
    }
    return $s
}

function Save-State($s) {
    try { $s | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8 } catch { Log "could not save state: $($_.Exception.Message)" "WARN" }
}

function Invoke-Probe {
    $h = Test-KanflowHealth -Url $HealthUrl -TimeoutSec $ProbeTimeoutSec
    if ($h.StatusCode -eq 404) {
        # Older build without /api/health: fall back to a cheap existing route.
        try {
            $r = Invoke-WebRequest -Uri $FallbackUrl -UseBasicParsing -TimeoutSec $ProbeTimeoutSec -ErrorAction Stop
            return [pscustomobject]@{ Ok = ([int]$r.StatusCode -eq 200); StatusCode = [int]$r.StatusCode; Db = "n/a"; Ollama = "n/a"; Error = "fallback probe" }
        } catch {
            return [pscustomobject]@{ Ok = $false; StatusCode = 404; Db = $null; Ollama = $null; Error = "fallback probe failed: $($_.Exception.Message)" }
        }
    }
    return $h
}

function Format-Probe($h) { return ("http={0} db={1} ollama={2} err={3}" -f $h.StatusCode, $h.Db, $h.Ollama, $h.Error) }

function Invoke-LogHousekeeping {
    $targets = @(Get-ChildItem -LiteralPath $paths.LogDir -Filter "*.log" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    $targets += (Join-Path $paths.Root "ai-activity.log")
    $targets += @(Get-KanflowDaemonLogFiles)   # web (ops\web\daemon or legacy) + worker (ops\worker\daemon)
    foreach ($t in $targets) { [void](Invoke-LogRotation -Path $t -MaxBytes 10MB -Keep 5) }
}

function Test-MinutesSince($iso, [int]$minutes) {
    if (-not $iso) { return $true }
    try { return (((Get-Date) - [datetime]$iso).TotalMinutes -ge $minutes) } catch { return $true }
}

function Invoke-WorkerCheck($state) {
    if ($SkipWorkerCheck) { return }
    if ((Get-TranslationWorkerMode) -ne "external") { return }
    $svc = Get-Service -Name $WorkerServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        if (Test-MinutesSince $state.lastWorkerWarn 360) {
            Log "AI_TRANSLATION_WORKER=external but service $WorkerServiceName is not installed - translations stay pending (docs\operations\deploy.md Phase B)" "WARN"
            $state.lastWorkerWarn = (Get-Date).ToString("o"); Save-State $state
        }
        return
    }
    $hb = Get-WorkerHeartbeat
    $reason = $null
    if ($svc.Status -ne "Running") { $reason = "service is $($svc.Status)" }
    elseif ($hb.Status -eq "stale") { $reason = "heartbeat stale ($($hb.AgeSec)s old, pid $($hb.Pid))" }
    elseif ($hb.Status -eq "absent") {
        if (Test-MinutesSince $state.lastWorkerWarn 60) {
            Log "worker service Running but no heartbeat file ($($hb.File)) - standby (another worker holds the lock) or still starting" "WARN"
            $state.lastWorkerWarn = (Get-Date).ToString("o"); Save-State $state
        }
        return
    }
    if (-not $reason) { return }
    if (-not (Test-MinutesSince $state.lastWorkerRestart $WorkerCooldownMin)) {
        Log "worker unhealthy ($reason) but restarted less than $WorkerCooldownMin min ago - not restarting again" "ERROR"
        return
    }
    Log "worker unhealthy ($reason) - restarting $WorkerServiceName" "WARN"
    $state.lastWorkerRestart = (Get-Date).ToString("o"); Save-State $state
    if (Restart-KanflowWorker -ServiceName $WorkerServiceName -LogFile $LogFile) { Log "worker recovered" }
    else { Log "worker restart did not produce a fresh heartbeat" "ERROR" }
}

# ======================================================================
try {
    Invoke-LogHousekeeping
    $state = Read-State

    if (Test-Path -LiteralPath $MaintenanceFlag) {
        $age = (Get-Date) - (Get-Item -LiteralPath $MaintenanceFlag).LastWriteTime
        if ($age.TotalHours -lt $MaintenanceMaxHours) {
            $last = $null
            if ($state.lastMaintenanceLog) { $last = [datetime]$state.lastMaintenanceLog }
            if (-not $last -or ((Get-Date) - $last).TotalMinutes -ge 60) {
                Log ("maintenance flag present ({0:N0} min old) - watchdog paused" -f $age.TotalMinutes) "WARN"
                $state.lastMaintenanceLog = (Get-Date).ToString("o")
                Save-State $state
            }
            exit 0
        }
        Log ("maintenance flag is {0:N1}h old (> {1}h) - ignoring it. Delete {2} when maintenance is over." -f $age.TotalHours, $MaintenanceMaxHours, $MaintenanceFlag) "WARN"
    }

    try { Invoke-WorkerCheck $state } catch { Log ("worker check failed: {0}" -f $_.Exception.Message) "ERROR" }

    $p1 = Invoke-Probe
    if ($p1.Ok) {
        if ($state.failedRuns -gt 0) { Log "healthy again after $($state.failedRuns) failed run(s)"; $state.failedRuns = 0; Save-State $state }
        exit 0
    }
    Log ("probe 1 failed: {0}; re-probing in {1}s" -f (Format-Probe $p1), $RetryDelaySec) "WARN"
    Start-Sleep -Seconds $RetryDelaySec
    $p2 = Invoke-Probe
    if ($p2.Ok) { Log "probe 2 OK - transient failure, no action"; exit 0 }
    Log ("probe 2 failed: {0}" -f (Format-Probe $p2)) "ERROR"

    # Database down? Fix MySQL first; restarting the app would not help.
    if ($p2.Db -eq "error") {
        $mysql = Get-Service -Name $MySqlServiceName -ErrorAction SilentlyContinue
        if ($mysql -and $mysql.Status -ne "Running") {
            Log "$MySqlServiceName is $($mysql.Status) - starting it" "WARN"
            try { Start-Service -Name $MySqlServiceName -ErrorAction Stop } catch { Log "could not start ${MySqlServiceName}: $($_.Exception.Message)" "ERROR" }
            if (Wait-Condition -TimeoutSec 60 -IntervalSec 5 -Condition { (Invoke-Probe).Ok }) {
                Log "recovered after starting $MySqlServiceName"
                $state.failedRuns = 0; Save-State $state
                exit 0
            }
            Log "app still unhealthy after starting $MySqlServiceName" "ERROR"
        }
    }

    if ($state.lastRestart) {
        $since = (Get-Date) - [datetime]$state.lastRestart
        if ($since.TotalMinutes -lt $CooldownMin) {
            $state.failedRuns = [int]$state.failedRuns + 1
            Save-State $state
            Log ("last restart was {0:N0} min ago (< {1} min cooldown) - not restarting again; failed runs: {2}. Manual check needed: recover.bat, daemon logs in {3}" -f $since.TotalMinutes, $CooldownMin, $state.failedRuns, $paths.DaemonDir) "ERROR"
            exit 1
        }
    }

    $state.lastRestart = (Get-Date).ToString("o")
    Save-State $state
    $ok = Restart-KanflowService -ServiceName $ServiceName -Port $Port -HealthUrl $HealthUrl -LogFile $LogFile
    if (-not $ok) {
        # Old build (no /api/health): accept the fallback probe as success.
        $ok = (Invoke-Probe).Ok
        if ($ok) { Log "service answers the fallback probe - treating restart as successful" }
    }
    if ($ok) { $state.failedRuns = 0 } else { $state.failedRuns = [int]$state.failedRuns + 1 }
    Save-State $state
    if ($ok) { exit 0 } else { exit 1 }
} catch {
    Log ("watchdog error: {0}" -f $_.Exception.Message) "ERROR"
    exit 1
}
