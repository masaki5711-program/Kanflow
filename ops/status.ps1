<#
.SYNOPSIS
One-screen Kanflow status (read-only, no admin needed): services, ports,
/api/health, builds (web + worker bundle), worker heartbeat, translation
backlog, scheduled tasks, last backup, maintenance flag.

.PARAMETER Json
Print one JSON object instead of the text report (for scripts / deploy.ps1).

.PARAMETER BackupDir
Backup destination to inspect. Default: the -Destination of the KanflowBackup
task, else $env:KANFLOW_BACKUP_DIR, else E:\KanflowBackup.

Exit code: 0 = web healthy (db ok), 1 = web unhealthy / not reachable.
Warnings (worker stale, old backup, ...) do not change the exit code.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\status.ps1
#>
[CmdletBinding()]
param(
    [switch]$Json,
    [string]$BackupDir,
    [int]$Port = 3000,
    [ValidateRange(1, 720)][int]$BackupMaxAgeHours = 30
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "lib\KanflowOps.psm1") -Force
$paths = Get-KanflowPaths
$warnings = New-Object System.Collections.Generic.List[string]

function Get-SvcInfo([string]$name) {
    $s = Get-Service -Name $name -ErrorAction SilentlyContinue
    if (-not $s) { return [pscustomobject]@{ Name = $name; Status = "NOT INSTALLED"; Pid = 0 } }
    return [pscustomobject]@{ Name = $name; Status = "$($s.Status)"; Pid = (Get-ServicePid -ServiceName $name) }
}

function Read-Text([string]$file) {
    if (Test-Path -LiteralPath $file -PathType Leaf) { return ([System.IO.File]::ReadAllText($file)).Trim() }
    return $null
}

function Get-BuildInfo([string]$dirName) {
    $dir = Join-Path $paths.App $dirName
    if (-not (Test-Path -LiteralPath $dir)) { return $null }
    $workerId = $null
    $info = Read-Text (Join-Path $dir "worker\BUILD_INFO.json")
    if ($info) { try { $workerId = ($info | ConvertFrom-Json).webBuildId } catch { $workerId = "unreadable" } }
    return [pscustomobject]@{
        Dir          = $dirName
        BuildId      = Read-Text (Join-Path $dir "BUILD_ID")
        WorkerBundle = (Test-Path -LiteralPath (Join-Path $dir "worker\main.cjs"))
        WorkerFor    = $workerId
        Modified     = (Get-Item -LiteralPath $dir).LastWriteTime.ToString("yyyy-MM-dd HH:mm")
    }
}

$script:TaskScheduler = $null
function Get-TaskInfo([string]$name) {
    # Task Scheduler COM API instead of Get-ScheduledTask: the CIM/WMI-based
    # cmdlets have been observed to hang on this host.
    # SYSTEM tasks are only visible to an elevated prompt.
    $none = [pscustomobject]@{ Name = $name; State = $(if (Test-IsAdministrator) { "NOT REGISTERED" } else { "not visible (run elevated)" }); LastRun = $null; LastResult = $null; Arguments = $null }
    try {
        if (-not $script:TaskScheduler) { $script:TaskScheduler = New-Object -ComObject Schedule.Service; $script:TaskScheduler.Connect() }
        $t = $script:TaskScheduler.GetFolder("\").GetTask($name)
    } catch { return $none }
    $states = @{ 0 = "Unknown"; 1 = "Disabled"; 2 = "Queued"; 3 = "Ready"; 4 = "Running" }
    $argsText = $null
    try { $argsText = $t.Definition.Actions.Item(1).Arguments } catch { $argsText = $null }
    return [pscustomobject]@{
        Name       = $name
        State      = $states[[int]$t.State]
        LastRun    = $t.LastRunTime
        LastResult = $t.LastTaskResult
        Arguments  = $argsText
    }
}

function Get-LastBackup($backupTask) {
    $dest = $BackupDir
    if (-not $dest -and $backupTask.Arguments -and ($backupTask.Arguments -match '-Destination\s+"([^"]+)"')) { $dest = $Matches[1] }
    if (-not $dest) { $dest = $(if ($env:KANFLOW_BACKUP_DIR) { $env:KANFLOW_BACKUP_DIR } else { "E:\KanflowBackup" }) }
    $daily = Join-Path $dest "daily"
    $res = [ordered]@{ Destination = $dest; Latest = $null; AgeHours = $null; HasManifest = $false }
    if (-not (Test-Path -LiteralPath $daily)) { return [pscustomobject]$res }
    $gen = Get-ChildItem -LiteralPath $daily -Directory -Filter "kanflow-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($gen) {
        $res.Latest = $gen.FullName
        $res.AgeHours = [Math]::Round(((Get-Date) - $gen.LastWriteTime).TotalHours, 1)
        $res.HasManifest = Test-Path -LiteralPath (Join-Path $gen.FullName "manifest.json")
    }
    return [pscustomobject]$res
}

# ------------------------------------------------------------------ collect
$services = @((Get-SvcInfo "kanflow.exe"), (Get-SvcInfo "kanflowworker.exe"), (Get-SvcInfo "KanflowMySQL"))
$listeners = @(Get-PortListenerPids -Port $Port)
$health = Test-KanflowHealth -Url ("http://127.0.0.1:{0}/api/health" -f $Port) -TimeoutSec 10
if ($health.StatusCode -eq 404) {
    # Build older than /api/health: fall back to a cheap existing route (same as the watchdog).
    try {
        $legacyOk = ([int](Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/auth/csrf" -f $Port) -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200)
    } catch { $legacyOk = $false }
    if ($legacyOk) { $health.Ok = $true; $health.Db = "n/a (build without /api/health)" }
}
$hb = Get-WorkerHeartbeat
$mode = Get-TranslationWorkerMode
$builds = @(".next", ".next-new", ".next-prev") | ForEach-Object { Get-BuildInfo $_ } | Where-Object { $_ }
$tasks = @((Get-TaskInfo "KanflowWatchdog"), (Get-TaskInfo "KanflowBackup"), (Get-TaskInfo "KanflowAiSurveillance"))
$backup = Get-LastBackup ($tasks | Where-Object { $_.Name -eq "KanflowBackup" })
$maintenance = Test-Path -LiteralPath (Join-Path $paths.Root "ops\watchdog\MAINTENANCE")
$wrapper = $(if ($paths.DaemonDir -eq $paths.WebDaemonDir) { "ops\web\daemon" } else { "LEGACY node_modules\next\dist\bin\daemon (run ops\web\migrate-service-wrapper.ps1)" })

# ------------------------------------------------------------------ assess
if (-not $health.Ok) { $warnings.Add("web unhealthy: http=$($health.StatusCode) db=$($health.Db)") }
if ($mode -eq "external") {
    $w = $services | Where-Object { $_.Name -eq "kanflowworker.exe" }
    if ($w.Status -eq "NOT INSTALLED") { $warnings.Add("AI_TRANSLATION_WORKER=external but the worker service is not installed - translations stay pending") }
    elseif ($w.Status -ne "Running") { $warnings.Add("worker service is $($w.Status)") }
    if ($hb.Status -ne "ok") { $warnings.Add("worker heartbeat $($hb.Status)") }
}
$liveBuild = $builds | Where-Object { $_.Dir -eq ".next" }
if ($liveBuild -and $liveBuild.WorkerBundle -and $liveBuild.WorkerFor -ne $liveBuild.BuildId) { $warnings.Add("worker bundle in .next was built for $($liveBuild.WorkerFor), web is $($liveBuild.BuildId)") }
if ($null -ne $health.OldestPendingAgeSec -and $health.OldestPendingAgeSec -gt 3600) { $warnings.Add("oldest pending translation is $([int]($health.OldestPendingAgeSec / 60)) min old") }
if (-not $backup.Latest) { $warnings.Add("no backup found under $($backup.Destination)") }
elseif ($backup.AgeHours -gt $BackupMaxAgeHours) { $warnings.Add("last backup is $($backup.AgeHours) h old") }
elseif (-not $backup.HasManifest) { $warnings.Add("last backup has no manifest.json (incomplete?)") }
if ($maintenance) { $warnings.Add("MAINTENANCE flag present - watchdog paused") }
if ($paths.DaemonDir -ne $paths.WebDaemonDir) { $warnings.Add("web service wrapper still inside node_modules") }

$result = [ordered]@{
    time        = (Get-Date).ToString("o")
    services    = $services
    port        = [ordered]@{ port = $Port; listeners = $listeners }
    health      = $health
    worker      = [ordered]@{ mode = $mode; heartbeat = $hb }
    builds      = $builds
    wrapper     = $wrapper
    tasks       = @($tasks | Select-Object Name, State, LastRun, LastResult)
    backup      = $backup
    maintenance = $maintenance
    warnings    = @($warnings)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
} else {
    Write-Host ""
    Write-Host "=== Kanflow status $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" -ForegroundColor Cyan
    foreach ($s in $services) { Write-Host ("  service {0,-18}: {1}{2}" -f $s.Name, $s.Status, $(if ($s.Pid) { " (pid $($s.Pid))" } else { "" })) }
    Write-Host ("  port {0}             : {1}" -f $Port, $(if ($listeners.Count) { "LISTENING pid " + ($listeners -join ",") } else { "nothing listening" }))
    Write-Host ("  /api/health           : http={0} db={1} ollama={2} build={3}" -f $health.StatusCode, $health.Db, $health.Ollama, $health.BuildId)
    Write-Host ("  translation mode      : {0}" -f $mode)
    Write-Host ("  worker heartbeat      : {0} (age {1}s, pid {2}, business hours {3})" -f $hb.Status, $hb.AgeSec, $hb.Pid, $hb.BusinessHours)
    if ($null -ne $health.Pending) { Write-Host ("  translation backlog   : pending={0}, oldest={1}s" -f $health.Pending, $health.OldestPendingAgeSec) }
    Write-Host ("  web service wrapper   : {0}" -f $wrapper)
    foreach ($b in $builds) { Write-Host ("  build {0,-16}: {1}  worker bundle={2} (for {3})  {4}" -f $b.Dir, $b.BuildId, $b.WorkerBundle, $b.WorkerFor, $b.Modified) }
    foreach ($t in $tasks) { Write-Host ("  task {0,-17}: {1}, last run {2}, result {3}" -f $t.Name, $t.State, $t.LastRun, $t.LastResult) }
    Write-Host ("  last backup           : {0} ({1} h old, manifest={2})" -f $backup.Latest, $backup.AgeHours, $backup.HasManifest)
    Write-Host ""
    if ($warnings.Count -eq 0) { Write-Host "  [OK] no warnings" -ForegroundColor Green }
    foreach ($w in $warnings) { Write-Host "  [WARN] $w" -ForegroundColor Yellow }
    Write-Host ""
}
if ($health.Ok) { exit 0 } else { exit 1 }
