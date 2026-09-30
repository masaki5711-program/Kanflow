<#
.SYNOPSIS
Restore a Kanflow backup generation (DB and/or app\private and optionally app\.env).

.DESCRIPTION
ALWAYS start with -DryRun. It verifies the generation (manifest, SHA-256,
dump trailer), shows what would be replaced, and changes nothing.

A real restore:
  1. asks you to type the target database name (skip with -Force)
  2. stops the kanflow.exe service when the PRODUCTION database or
     app\private is the target (skip with -NoServiceStop)
  3. takes a safety dump of the current target DB to ops\restore-safety\
  4. DROPs and re-creates the target database, imports the dump
  5. moves the current private folder aside (<target>.pre-restore-<ts>)
     and copies the backup's private\ into place
  6. (-RestoreEnv only) saves app\.env as .env.pre-restore-<ts> and restores it
  7. starts the service again and verifies /api/health
  8. prints per-table row counts and compares them with the manifest

Restore DRILL (no production impact): restore into another database and
another folder, e.g.
  -TargetDatabase kanflow_drill -PrivateTarget D:\KanflowDrill\private -NoServiceStop -UseRootCredential
(-UseRootCredential because the app user normally cannot CREATE other databases.)

Exit codes: 0 = success / dry-run OK, 1 = failure, 2 = aborted or invalid input.

.EXAMPLE
.\restore-kanflow.ps1 -BackupPath E:\KanflowBackup\daily\kanflow-20260923-023000 -DryRun
.\restore-kanflow.ps1 -Latest -DryRun
.\restore-kanflow.ps1 -BackupPath E:\KanflowBackup\daily\kanflow-20260923-023000
#>
[CmdletBinding(DefaultParameterSetName = "Path")]
param(
    [Parameter(ParameterSetName = "Path", Mandatory = $true)][string]$BackupPath,
    [Parameter(ParameterSetName = "Latest", Mandatory = $true)][switch]$Latest,
    [Parameter(ParameterSetName = "Latest")][string]$BackupRoot = $(if ($env:KANFLOW_BACKUP_DIR) { $env:KANFLOW_BACKUP_DIR } else { "E:\KanflowBackup" }),

    [switch]$DryRun,
    [string]$TargetDatabase,
    [string]$PrivateTarget,
    [switch]$SkipDatabase,
    [switch]$SkipPrivate,
    [switch]$RestoreEnv,
    [switch]$UseRootCredential,
    [switch]$NoServiceStop,
    [switch]$NoSafetyBackup,
    [switch]$Force,
    [string]$ServiceName = "kanflow.exe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "restore.log"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level }

function Resolve-Generation {
    if ($Latest) {
        $g = @(Get-KanflowBackupGenerations -Root $BackupRoot -Kind daily)
        if ($g.Count -eq 0) { throw "no generation found under $(Join-Path $BackupRoot 'daily')" }
        return $g[0].FullName
    }
    if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) { throw "backup path not found: $BackupPath" }
    return (Resolve-Path -LiteralPath $BackupPath).Path
}

function Test-Generation([string]$gen) {
    $checked = Test-KanflowBackupGeneration -Path $gen
    $m = $checked.Manifest
    Log ("generation OK: created {0}, db={1}, dump {2:N1} MB, private {3} files, commit {4}" -f $m.createdAt, $m.database, ($m.dump.RawBytes / 1MB), $m.privateFiles, $m.gitCommit)
    return $checked
}

function Expand-AndCheckDump([string]$dumpPath) {
    $x = Expand-KanflowDump -DumpPath $dumpPath
    Log "dump expanded and verified: $($x.CreateTables) CREATE TABLE statements"
    return $x.SqlFile
}

function Confirm-Restore([string]$targetDb) {
    if ($Force) { Log "confirmation skipped (-Force)" "WARN"; return }
    Write-Host ""
    Write-Host "!!! This REPLACES data. Current contents are moved aside / safety-dumped first. !!!" -ForegroundColor Red
    $answer = Read-Host ("Type the target database name '{0}' to continue (anything else aborts)" -f $targetDb)
    if ($answer -cne $targetDb) { Log "aborted by operator" "WARN"; exit 2 }
}

function Test-DatabaseExists($db, [string]$binDir) {
    $opt = New-MySqlOptionFile -DbConfig $db
    try {
        $rows = @(Invoke-MySqlQuery -MySqlBinDir $binDir -OptionFile $opt -Sql ("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='{0}'" -f $db.Database))
        return ($rows.Count -gt 0 -and [int]$rows[0] -gt 0)
    } finally {
        Remove-Item -LiteralPath $opt -Force -ErrorAction SilentlyContinue
    }
}

function Restore-Database($db, [string]$binDir, [string]$sqlFile) {
    Log "database $($db.Database): drop, re-create and import..."
    Import-KanflowDump -DbConfig $db -MySqlBinDir $binDir -SqlFile $sqlFile
    Log "database import finished"
}

function Restore-Private([string]$gen, [string]$target) {
    $src = Join-Path $gen "private"
    if (-not (Test-Path -LiteralPath $src)) { throw "backup has no private\ folder" }
    if (Test-Path -LiteralPath $target) {
        $aside = "$target.pre-restore-$stamp"
        Rename-Item -LiteralPath $target -NewName (Split-Path -Leaf $aside)
        Log "current private folder moved aside: $aside"
    }
    $roboLog = Join-Path $paths.LogDir "restore-robocopy.log"
    [void](Invoke-LogRotation -Path $roboLog -MaxBytes 5MB -Keep 3)
    $rc = Invoke-Robocopy -Source $src -Destination $target -LogFile $roboLog
    if (-not $rc.Success) { throw "robocopy restore failed with exit $($rc.ExitCode)" }
    $n = @(Get-ChildItem -LiteralPath $target -Recurse -File -Force).Count
    Log "private restored to $target ($n files, robocopy exit $($rc.ExitCode))"
}

function Restore-EnvFile([string]$gen) {
    $src = Join-Path $gen "env\.env"
    if (-not (Test-Path -LiteralPath $src)) { throw "backup has no env\.env" }
    if (Test-Path -LiteralPath $paths.EnvFile) {
        Copy-Item -LiteralPath $paths.EnvFile -Destination "$($paths.EnvFile).pre-restore-$stamp" -Force
        Log "current app\.env saved as .env.pre-restore-$stamp"
    }
    Copy-Item -LiteralPath $src -Destination $paths.EnvFile -Force
    Log "app\.env restored"
}

function Compare-RowCounts($expected, $actual) {
    if (-not $expected) { Log "manifest has no row counts (older backup); showing restored counts only" "WARN" }
    $diff = 0
    foreach ($k in $actual.Keys) {
        $exp = $null
        if ($expected -and ($expected.PSObject.Properties.Name -contains $k)) { $exp = [long]$expected.$k }
        $mark = if ($null -eq $exp) { "" } elseif ($exp -eq $actual[$k]) { "ok" } else { $diff++; "DIFF (backup: $exp)" }
        Write-Host ("  {0,-40} {1,10}  {2}" -f $k, $actual[$k], $mark)
    }
    if ($diff -gt 0) { Log "$diff table(s) differ from the manifest counts (small drift is possible if users wrote during the backup)" "WARN" }
    else { Log "row counts match the manifest" }
}

# ======================================================================
$serviceStopped = $false
$sqlFile = $null
$exitCode = 0
try {
    Log ("==== restore start{0} ====" -f $(if ($DryRun) { " (DRY RUN)" } else { "" }))
    $gen = Resolve-Generation
    Log "generation: $gen"
    $checked = Test-Generation $gen

    $db = Get-KanflowDbConfig -UseRootCredential:$UseRootCredential
    $prodDbName = $db.Database
    if ($TargetDatabase) {
        if ($TargetDatabase -notmatch '^[A-Za-z0-9_]+$') { throw "invalid -TargetDatabase" }
        $db.Database = $TargetDatabase
    }
    if (-not $PrivateTarget) { $PrivateTarget = $paths.Private }
    $binDir = Get-MySqlBinDir

    $touchesProd = ((-not $SkipDatabase) -and $db.Database -eq $prodDbName) -or
        ((-not $SkipPrivate) -and ([System.IO.Path]::GetFullPath($PrivateTarget).TrimEnd('\') -ieq $paths.Private.TrimEnd('\'))) -or
        $RestoreEnv

    Write-Host ""
    Write-Host "Restore plan" -ForegroundColor Cyan
    Write-Host ("  from        : {0}" -f $gen)
    Write-Host ("  database    : {0}" -f $(if ($SkipDatabase) { "(skip)" } else { "$($db.Database)  <- DROP + re-create + import" }))
    Write-Host ("  private     : {0}" -f $(if ($SkipPrivate) { "(skip)" } else { "$PrivateTarget  <- replaced (current moved aside)" }))
    Write-Host ("  app\.env    : {0}" -f $(if ($RestoreEnv) { "replaced (current saved as .pre-restore)" } else { "(unchanged)" }))
    Write-Host ("  production  : {0}" -f $(if ($touchesProd) { "YES - service $ServiceName will be stopped" } else { "no" }))
    Write-Host ""

    if (-not $SkipDatabase) { $sqlFile = Expand-AndCheckDump $checked.DumpPath }

    if ($DryRun) {
        if (-not $SkipPrivate) {
            Write-Host "Files that differ between backup and $PrivateTarget (robocopy /L):"
            [void](Invoke-Robocopy -Source (Join-Path $gen "private") -Destination $PrivateTarget -Options @("/E", "/L", "/NP", "/NJH", "/NDL"))
        }
        Log "==== DRY RUN finished - nothing was changed ===="
        exit 0
    }

    if ($touchesProd -and -not $NoServiceStop -and -not (Test-IsAdministrator)) {
        throw "stopping the production service needs an elevated PowerShell (Run as administrator)"
    }
    Confirm-Restore $db.Database

    if ($touchesProd -and -not $NoServiceStop) {
        Log "stopping $ServiceName"
        if (-not (Stop-KanflowService -ServiceName $ServiceName -LogFile $LogFile)) { throw "could not stop $ServiceName cleanly" }
        $serviceStopped = $true
    }

    if (-not $SkipDatabase) {
        if (-not $NoSafetyBackup) {
            $safetyDir = Join-Path $paths.Root "ops\restore-safety"
            New-Item -ItemType Directory -Path $safetyDir -Force | Out-Null
            if (Test-DatabaseExists $db $binDir) {
                $safety = Join-Path $safetyDir ("pre-restore-{0}-{1}.sql.gz" -f $db.Database, $stamp)
                [void](Export-KanflowDatabase -DbConfig $db -MySqlBinDir $binDir -OutFile $safety)
                Log "safety dump of current $($db.Database): $safety"
            }
        }
        Restore-Database $db $binDir $sqlFile
    }
    if (-not $SkipPrivate) { Restore-Private $gen $PrivateTarget }
    if ($RestoreEnv) { Restore-EnvFile $gen }

    if (-not $SkipDatabase) {
        Write-Host ""
        Write-Host "Row counts in $($db.Database):" -ForegroundColor Cyan
        $counts = Get-KanflowTableCounts -DbConfig $db -MySqlBinDir $binDir
        $expected = $null
        if ($checked.Manifest.PSObject.Properties.Name -contains "tableRowCounts") { $expected = $checked.Manifest.tableRowCounts }
        Compare-RowCounts $expected $counts
    }
    Log "==== restore finished OK ===="
} catch {
    Log ("RESTORE FAILED: {0}" -f $_.Exception.Message) "ERROR"
    Log "safety dumps: ops\restore-safety\ ; moved-aside folders: *.pre-restore-$stamp" "WARN"
    $exitCode = 1
} finally {
    if ($sqlFile) { Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue }
    if ($serviceStopped) {
        Log "starting $ServiceName"
        if (Start-KanflowService -ServiceName $ServiceName -LogFile $LogFile) {
            Log "service healthy after restore"
        } else {
            Log "service did not come back healthy - check the daemon logs and /api/health" "ERROR"
            $exitCode = 1
        }
    }
}
exit $exitCode
