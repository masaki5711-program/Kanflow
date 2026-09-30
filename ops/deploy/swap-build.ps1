<#
.SYNOPSIS
Swap a side-by-side build (web + worker bundle, built with NEXT_DIST_DIR=.next-new)
into place as app\.next with a short, verified service restart and automatic
rollback - or, with -Rollback, go back to the previous build (.next-prev).
Run as administrator AFTER the build has succeeded.

.DESCRIPTION
Deploy (default):
  1. checks <NewDir>\BUILD_ID (web build finished) and <NewDir>\worker\main.cjs
     (worker bundle, built by `npm run build:worker` AFTER `next build`; its
     BUILD_INFO.json must name the same BUILD_ID)
  2. creates ops\watchdog\MAINTENANCE so the watchdog does not interfere
  3. stops the worker service (if installed), then the web service
     (Stop-KanflowService incl. orphan :3000 listener kill)
  4. app\.next -> app\.next-prev   (the previous .next-prev is deleted)
     app\<NewDir> -> app\.next
  5. starts the web service, verifies NEW PID + /api/health = 200
  6. on failure: stop, swap back (.next -> <NewDir>.failed, .next-prev -> .next), start
  7. starts the worker service again (if installed) and waits for a fresh
     heartbeat; a worker failure does NOT roll back the web build (exit 3)
  8. removes the MAINTENANCE flag

Rollback (-Rollback):
  app\.next -> app\.next-rolledback-<timestamp> (kept, not deleted),
  app\.next-prev -> app\.next, restart web (+ worker), verify.
  After a rollback there is no .next-prev until the next deploy.

-NewDir can never be .next / .next-prev (that would delete the rollback target).

Log: ops\logs\deploy.log

Note: rollback restores the BUILD only (web + worker bundle). If
`prisma migrate deploy` ran and the old build is incompatible with the new
schema, restore the DB from the pre-deploy backup
(docs\operations\deploy.md "Rollback" and backup-restore.md).

Exit codes: 0 OK, 1 failed (rolled back if possible), 2 precondition not met,
3 web OK but worker did not come back.

.EXAMPLE
# after: cd D:\APP\Kanflow\app; $env:NEXT_DIST_DIR=".next-new"; npm run build; npm run build:worker
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback
#>
[CmdletBinding()]
param(
    [ValidatePattern('^\.next-[A-Za-z0-9_-]+$')][string]$NewDir = ".next-new",
    [switch]$Rollback,
    [string]$ServiceName = "kanflow.exe",
    [string]$WorkerServiceName = "kanflowworker.exe",
    # Swap even when <NewDir>\worker\main.cjs is missing (web-only build; the worker service is left stopped if installed).
    [switch]$AllowMissingWorkerBundle,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "deploy.log"
$flag = Join-Path $paths.Root "ops\watchdog\MAINTENANCE"
$live = Join-Path $paths.App ".next"
$prev = Join-Path $paths.App ".next-prev"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level }
function Read-BuildId([string]$dir) {
    $f = Join-Path $dir "BUILD_ID"
    if (Test-Path -LiteralPath $f) { return ([System.IO.File]::ReadAllText($f)).Trim() }
    return $null
}
function Read-WorkerBuildId([string]$dir) {
    $f = Join-Path $dir "worker\BUILD_INFO.json"
    if (-not (Test-Path -LiteralPath (Join-Path $dir "worker\main.cjs"))) { return $null }
    try { return ([System.IO.File]::ReadAllText($f) | ConvertFrom-Json).webBuildId } catch { return "unknown" }
}
function Get-WorkerService { return Get-Service -Name $WorkerServiceName -ErrorAction SilentlyContinue }

function Stop-Worker {
    $w = Get-WorkerService
    if (-not $w -or $w.Status -eq "Stopped") { return }
    Log "stopping worker $WorkerServiceName"
    try { Stop-Service -Name $WorkerServiceName -Force -NoWait -ErrorAction Stop } catch { Log "Stop-Service worker: $($_.Exception.Message)" "WARN" }
    if (-not (Wait-Condition -TimeoutSec 60 -Condition { (Get-Service -Name $WorkerServiceName).Status -eq "Stopped" })) {
        $wp = Get-ServicePid -ServiceName $WorkerServiceName
        if ($wp -gt 0) { Log "worker did not stop in 60s; killing wrapper PID $wp" "WARN"; Stop-Process -Id $wp -Force -ErrorAction SilentlyContinue }
    }
}

function Start-Worker([string]$dir) {
    if (-not (Get-WorkerService)) { return $true }
    if (-not (Test-Path -LiteralPath (Join-Path $dir "worker\main.cjs"))) {
        Log "worker bundle missing in .next - $WorkerServiceName left STOPPED (build it: npm run build:worker, then re-deploy)" "ERROR"
        return $false
    }
    return (Restart-KanflowWorker -ServiceName $WorkerServiceName -LogFile $LogFile)
}

function Restore-Previous {
    # Put .next-prev back as .next after a failed start; returns $true when a healthy start followed.
    param([string]$FailedName)
    [void](Stop-KanflowService -ServiceName $ServiceName -LogFile $LogFile)
    $failed = Join-Path $paths.App $FailedName
    if (Test-Path -LiteralPath $failed) { Remove-Item -LiteralPath $failed -Recurse -Force }
    if (Test-Path -LiteralPath $live) { Rename-Item -LiteralPath $live -NewName (Split-Path -Leaf $failed) }
    if (Test-Path -LiteralPath $prev) { Rename-Item -LiteralPath $prev -NewName ".next" }
    return (Start-KanflowService -ServiceName $ServiceName -LogFile $LogFile)
}

# ------------------------------------------------------------ preconditions
$liveId = Read-BuildId $live
if ($Rollback) {
    $targetDir = $prev
    $targetId = Read-BuildId $prev
    if (-not $targetId) { Log "no BUILD_ID in $prev - nothing to roll back to" "ERROR"; exit 2 }
    Log ("rollback plan: live {0} -> previous {1}" -f $liveId, $targetId)
} else {
    if ($NewDir -ieq ".next-prev" -or $NewDir -ieq ".next") {
        Log "NewDir '$NewDir' is not allowed (it is the live build or the rollback target). Use -Rollback to go back." "ERROR"; exit 2
    }
    $targetDir = Join-Path $paths.App $NewDir
    $targetId = Read-BuildId $targetDir
    if (-not $targetId) { Log "no BUILD_ID in $targetDir - build missing or unfinished" "ERROR"; exit 2 }
    $workerId = Read-WorkerBuildId $targetDir
    if (-not $workerId) {
        if (-not $AllowMissingWorkerBundle) {
            Log "no worker bundle in $targetDir\worker\main.cjs - run 'npm run build:worker' with the same NEXT_DIST_DIR after next build (or pass -AllowMissingWorkerBundle)" "ERROR"; exit 2
        }
        Log "worker bundle missing - continuing web-only (-AllowMissingWorkerBundle)" "WARN"
    } elseif ($workerId -ne $targetId) {
        Log ("worker bundle was built for BUILD_ID {0}, web build is {1} - rebuild the worker bundle after next build" -f $workerId, $targetId) "ERROR"; exit 2
    }
    $prevId = Read-BuildId $prev
    if (-not $prevId) { $prevId = "(none)" }
    Log ("swap plan: live {0} -> new {1} ({2}); old .next-prev {3} will be deleted, live becomes .next-prev" -f $liveId, $targetId, $NewDir, $prevId)
}
if ($DryRun) { Log "dry run - nothing changed"; exit 0 }
if (-not (Test-IsAdministrator)) { Log "run from an elevated PowerShell (service stop/start)" "ERROR"; exit 2 }

Set-Content -LiteralPath $flag -Value ("swap-build {0}" -f (Get-Date -Format o)) -Encoding ASCII
$exitCode = 0
$servedDir = $live
try {
    $oldPids = @(Get-PortListenerPids -Port 3000)
    Stop-Worker
    if (-not (Stop-KanflowService -ServiceName $ServiceName -LogFile $LogFile)) { throw "service did not stop cleanly - nothing swapped" }

    if ($Rollback) {
        $parked = ".next-rolledback-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss")
        if (Test-Path -LiteralPath $live) { Rename-Item -LiteralPath $live -NewName $parked }
        Rename-Item -LiteralPath $prev -NewName ".next"
        Log "rolled back: .next = $targetId, $parked = $liveId"
        if (Start-KanflowService -ServiceName $ServiceName -PreviousPids $oldPids -LogFile $LogFile) {
            Log "rollback OK: serving BUILD_ID $targetId"
        } else {
            $exitCode = 1
            Log "previous build is not healthy either - run recover.bat / check daemon logs in $($paths.DaemonDir); the rolled-back build is kept in $parked" "ERROR"
        }
    } else {
        if (Test-Path -LiteralPath $prev) { Remove-Item -LiteralPath $prev -Recurse -Force }
        if (Test-Path -LiteralPath $live) { Rename-Item -LiteralPath $live -NewName ".next-prev" }
        Rename-Item -LiteralPath $targetDir -NewName ".next"
        Log "swapped: .next = $targetId, .next-prev = $liveId"
        if (Start-KanflowService -ServiceName $ServiceName -PreviousPids $oldPids -LogFile $LogFile) {
            Log "deploy OK: serving BUILD_ID $targetId"
        } else {
            Log "new build is not healthy - rolling back to $liveId" "ERROR"
            $exitCode = 1
            if (Restore-Previous -FailedName "$NewDir.failed") {
                Log "rollback OK: serving BUILD_ID $liveId again (failed build kept in $NewDir.failed)" "WARN"
            } else {
                Log "ROLLBACK ALSO UNHEALTHY - run recover.bat and check the daemon logs in $($paths.DaemonDir)" "ERROR"
            }
        }
    }
    if (-not (Start-Worker $servedDir)) {
        if ($exitCode -eq 0) { $exitCode = 3 }
        Log "web is up but the worker did not come back - translations queue up; see ops\logs\deploy.log and app\logs\worker-*.log" "ERROR"
    }
} catch {
    Log ("swap failed: {0}" -f $_.Exception.Message) "ERROR"
    $exitCode = 1
    if (-not (Test-Path -LiteralPath $live) -and (Test-Path -LiteralPath $prev)) {
        Rename-Item -LiteralPath $prev -NewName ".next"
        Log "restored previous build to .next" "WARN"
    }
    if ((Get-Service -Name $ServiceName).Status -ne "Running") {
        Log "starting $ServiceName with whatever is in .next" "WARN"
        [void](Start-KanflowService -ServiceName $ServiceName -LogFile $LogFile)
    }
    [void](Start-Worker $live)
} finally {
    Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
}
exit $exitCode
