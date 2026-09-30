<#
.SYNOPSIS
Save / restore app\node_modules (+ package.json + package-lock.json) around a
dependency change (e.g. the Next.js upgrade, docs\operations\deploy.md Phase C).

.DESCRIPTION
-Save     robocopy app\node_modules -> ops\backup\node_modules-<ts>\node_modules
          and copy package.json / package-lock.json next to it. Prints the path.
-Restore  STOP the services first (kanflow.exe, kanflowworker.exe: files in
          node_modules are in use). Mirrors the snapshot back (robocopy /MIR)
          and restores package.json / package-lock.json.
          -Snapshot <dir> picks one; default = newest ops\backup\node_modules-*.
-List     show snapshots.
A snapshot is ~1 GB; delete old ones by hand (ops\backup\node_modules-*).
Log: ops\logs\deploy.log

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\node-modules-snapshot.ps1 -Save
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\node-modules-snapshot.ps1 -Restore
#>
[CmdletBinding(DefaultParameterSetName = "List")]
param(
    [Parameter(ParameterSetName = "Save", Mandatory = $true)][switch]$Save,
    [Parameter(ParameterSetName = "Restore", Mandatory = $true)][switch]$Restore,
    [Parameter(ParameterSetName = "Restore")][string]$Snapshot,
    [Parameter(ParameterSetName = "List")][switch]$List
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "deploy.log"
$backupRoot = Join-Path $paths.Root "ops\backup"
function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message ("[node_modules] " + $msg) -Level $level }
function Get-Snapshots { return @(Get-ChildItem -LiteralPath $backupRoot -Directory -Filter "node_modules-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending) }

if ($Save) {
    $dest = Join-Path $backupRoot ("node_modules-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Log "saving app\node_modules -> $dest"
    $rc = Invoke-Robocopy -Source (Join-Path $paths.App "node_modules") -Destination (Join-Path $dest "node_modules") -Options @("/E", "/COPY:DAT", "/DCOPY:DAT", "/R:1", "/W:1", "/NP", "/NFL", "/NDL", "/MT:16")
    if (-not $rc.Success) { Log "robocopy failed (exit $($rc.ExitCode))" "ERROR"; exit 1 }
    foreach ($f in @("package.json", "package-lock.json")) { Copy-Item -LiteralPath (Join-Path $paths.App $f) -Destination $dest -Force }
    $nextVer = $null
    try { $nextVer = (Get-Content -LiteralPath (Join-Path $dest "node_modules\next\package.json") -Raw | ConvertFrom-Json).version } catch { $nextVer = "?" }
    Log "snapshot OK: $dest (next $nextVer)"
    Write-Output $dest
    exit 0
}

if ($Restore) {
    if (-not (Test-IsAdministrator)) { Log "run from an elevated PowerShell" "ERROR"; exit 2 }
    foreach ($svcName in @("kanflow.exe", "kanflowworker.exe")) {
        $s = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($s -and $s.Status -ne "Stopped") { Log "service $svcName is $($s.Status) - stop it first (node_modules files are in use)" "ERROR"; exit 2 }
    }
    if (-not $Snapshot) { $first = Get-Snapshots | Select-Object -First 1; if ($first) { $Snapshot = $first.FullName } }
    if (-not $Snapshot -or -not (Test-Path -LiteralPath (Join-Path $Snapshot "node_modules\next\package.json"))) { Log "no usable snapshot ($Snapshot)" "ERROR"; exit 2 }
    Log "restoring $Snapshot -> app\node_modules (mirror)"
    $rc = Invoke-Robocopy -Source (Join-Path $Snapshot "node_modules") -Destination (Join-Path $paths.App "node_modules") -Options @("/MIR", "/COPY:DAT", "/DCOPY:DAT", "/R:1", "/W:1", "/NP", "/NFL", "/NDL", "/MT:16")
    if (-not $rc.Success) { Log "robocopy failed (exit $($rc.ExitCode))" "ERROR"; exit 1 }
    foreach ($f in @("package.json", "package-lock.json")) { Copy-Item -LiteralPath (Join-Path $Snapshot $f) -Destination $paths.App -Force }
    Log "restore OK - start the services again (recover.bat; sc start kanflowworker.exe)"
    exit 0
}

foreach ($s in Get-Snapshots) {
    $v = "?"
    try { $v = (Get-Content -LiteralPath (Join-Path $s.FullName "node_modules\next\package.json") -Raw | ConvertFrom-Json).version } catch { $v = "?" }
    Write-Output ("{0}  next {1}" -f $s.FullName, $v)
}
exit 0
