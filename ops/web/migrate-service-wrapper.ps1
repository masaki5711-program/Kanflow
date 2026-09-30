<#
.SYNOPSIS
Move the web service wrapper (node-windows / winsw "kanflow.exe") out of
app\node_modules\next\dist\bin\daemon into ops\web\daemon, with verification
and automatic rollback. Run as administrator during a maintenance window
(the site is down for ~1 minute).

.DESCRIPTION
Why: npm ci / npm install of a new `next` deletes node_modules\next\dist\bin\daemon,
i.e. the service's winsw exe + xml + logs; the service then cannot start.

  0. preconditions: admin, legacy kanflow.xml present (else: already migrated
     -> exit 0), node-windows installed, setup-windows-service.js present
  1. snapshot the legacy daemon dir -> ops\backup\daemon-snapshot-<ts>\ (rollback source)
  2. ops\watchdog\MAINTENANCE flag (watchdog pauses)
  3. Stop-KanflowService (incl. orphan :3000 listener kill)
  4. uninstall the old registration (node uninstall-windows-service.js --legacy;
     falls back to sc.exe delete)
  5. install the new one (node setup-windows-service.js -> ops\web\daemon, starts it)
  6. verify: service Running, a NEW listener PID on :3000, /api/health 200
     (builds without /api/health: /api/auth/csrf 200)
  7. on any failure: remove the new registration, restore the snapshot into
     the legacy dir, re-register it with winsw ("kanflow.exe install"), start, verify
  8. remove the MAINTENANCE flag
Log: ops\logs\deploy.log

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\web\migrate-service-wrapper.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\web\migrate-service-wrapper.ps1
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "kanflow.exe",
    [int]$Port = 3000,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "deploy.log"
$flag = Join-Path $paths.Root "ops\watchdog\MAINTENANCE"
$legacyDir = $paths.LegacyDaemonDir
$newDir = $paths.WebDaemonDir
$healthUrl = "http://127.0.0.1:$Port/api/health"
$fallbackUrl = "http://127.0.0.1:$Port/api/auth/csrf"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message ("[wrapper-migration] " + $msg) -Level $level }

function Invoke-Node([string[]]$ScriptArgs) {
    Push-Location $paths.App
    try {
        & node.exe @ScriptArgs 2>&1 | ForEach-Object { Log ("  node: " + $_) }
        return $LASTEXITCODE
    } finally { Pop-Location }
}

function Test-ServiceGone { return -not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) }

function Remove-Registration([string]$flagArg) {
    [void](Invoke-Node @("uninstall-windows-service.js", $flagArg))
    if (-not (Wait-Condition -TimeoutSec 30 -Condition { Test-ServiceGone })) {
        Log "uninstall via node-windows did not remove $ServiceName - using sc.exe delete" "WARN"
        & sc.exe delete $ServiceName | Out-Null
        [void](Wait-Condition -TimeoutSec 30 -Condition { Test-ServiceGone })
    }
    return (Test-ServiceGone)
}

function Test-Serving([int[]]$PreviousPids) {
    $listening = Wait-Condition -TimeoutSec 180 -IntervalSec 3 -Condition {
        @(Get-PortListenerPids -Port $Port | Where-Object { $PreviousPids -notcontains $_ }).Count -gt 0
    }
    if (-not $listening) { Log "no NEW listener on :$Port within 180s" "ERROR"; return $false }
    return (Wait-Condition -TimeoutSec 90 -IntervalSec 5 -Condition {
        $h = Test-KanflowHealth -Url $healthUrl
        if ($h.Ok) { return $true }
        if ($h.StatusCode -eq 404) {
            try { return ([int](Invoke-WebRequest -Uri $fallbackUrl -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200) } catch { return $false }
        }
        return $false
    })
}

# ------------------------------------------------------------ preconditions
if (-not (Test-Path -LiteralPath (Join-Path $legacyDir "kanflow.xml"))) {
    if (Test-Path -LiteralPath (Join-Path $newDir "kanflow.xml")) { Log "already migrated: wrapper is in $newDir"; exit 0 }
    Log "no wrapper found in $legacyDir or $newDir - install fresh with setup\install-kanflow-service.bat" "ERROR"; exit 2
}
foreach ($req in @((Join-Path $paths.App "node_modules\node-windows\package.json"), (Join-Path $paths.App "setup-windows-service.js"), (Join-Path $paths.App "uninstall-windows-service.js"))) {
    if (-not (Test-Path -LiteralPath $req)) { Log "missing $req" "ERROR"; exit 2 }
}
Log ("plan: stop {0}; uninstall wrapper in {1}; install wrapper in {2}; verify; rollback on failure" -f $ServiceName, $legacyDir, $newDir)
if ($DryRun) { Log "dry run - nothing changed"; exit 0 }
if (-not (Test-IsAdministrator)) { Log "run from an elevated PowerShell" "ERROR"; exit 2 }

# ------------------------------------------------------------ 1. snapshot
$snapshot = Join-Path $paths.Root ("ops\backup\daemon-snapshot-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null
Copy-Item -Path (Join-Path $legacyDir "*") -Destination $snapshot -Recurse -Force
if (-not (Test-Path -LiteralPath (Join-Path $snapshot "kanflow.xml")) -or -not (Test-Path -LiteralPath (Join-Path $snapshot "kanflow.exe"))) {
    Log "snapshot incomplete ($snapshot) - aborting before any change" "ERROR"; exit 2
}
Log "snapshot of the old wrapper: $snapshot"

Set-Content -LiteralPath $flag -Value ("wrapper-migration {0}" -f (Get-Date -Format o)) -Encoding ASCII
$exitCode = 0
try {
    $oldPids = @(Get-PortListenerPids -Port $Port)
    if (-not (Stop-KanflowService -ServiceName $ServiceName -Port $Port -LogFile $LogFile)) { throw "service did not stop cleanly - nothing changed" }

    if (-not (Remove-Registration "--legacy")) { throw "could not remove the old $ServiceName registration" }
    Log "old registration removed"

    $code = Invoke-Node @("setup-windows-service.js", "--ignore-legacy")
    if ($code -ne 0) { throw "setup-windows-service.js exited with $code" }
    if (-not (Wait-Condition -TimeoutSec 60 -Condition { $s = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue; $s -and $s.Status -eq "Running" })) {
        throw "new $ServiceName registration is not Running"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $newDir "kanflow.xml"))) { throw "kanflow.xml not found in $newDir after install" }
    if (-not (Test-Serving $oldPids)) { throw "new registration does not serve a healthy app" }
    Log ("migration OK: wrapper now in {0}, listeners [{1}]" -f $newDir, ((Get-PortListenerPids -Port $Port) -join ","))
} catch {
    $exitCode = 1
    Log ("migration failed: {0} - rolling back to the old wrapper" -f $_.Exception.Message) "ERROR"
    try {
        [void](Stop-KanflowService -ServiceName $ServiceName -Port $Port -LogFile $LogFile)
        if (-not (Test-ServiceGone)) { [void](Remove-Registration "--new") }
        New-Item -ItemType Directory -Force -Path $legacyDir | Out-Null
        Copy-Item -Path (Join-Path $snapshot "*") -Destination $legacyDir -Recurse -Force
        & (Join-Path $legacyDir "kanflow.exe") install 2>&1 | ForEach-Object { Log ("  winsw: " + $_) }
        Start-Service -Name $ServiceName
        if (Test-Serving @()) { Log "rollback OK: old wrapper ($legacyDir) serving again" "WARN" }
        else { Log "ROLLBACK UNHEALTHY - run recover.bat; old wrapper files: $snapshot" "ERROR" }
    } catch {
        Log ("ROLLBACK FAILED: {0}. Manual: copy {1}\* to {2}, run '{2}\kanflow.exe install', then 'sc start {3}'" -f $_.Exception.Message, $snapshot, $legacyDir, $ServiceName) "ERROR"
    }
} finally {
    Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
}
exit $exitCode
