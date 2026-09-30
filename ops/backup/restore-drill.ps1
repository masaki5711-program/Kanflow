<#
.SYNOPSIS
Automated restore drill: restore the latest backup into a THROWAWAY database,
run sanity checks, drop it again, alert on failure. Never touches the
production database, app\private or app\.env. Monthly task: register-restore-drill-task.ps1.

.DESCRIPTION
  1. resolve the generation (-BackupPath, else newest <root>\daily\kanflow-*;
     root = -BackupRoot, or KANFLOW_BACKUP_SECONDARY_DIR with -FromSecondary)
  2. verify it: manifest, dump SHA-256, private\ file count vs manifest
  3. expand the dump; refuse it if it contains USE / CREATE DATABASE
  4. DROP + CREATE the drill database (default "<production db>_drill",
     e.g. scrum_tool_drill) and import the dump (root credential from .db-pw)
  5. sanity checks on the drill database:
       - every table of the manifest exists (no table lost)
       - row count per table within max(-RowDriftMin, -RowDriftPct %) of the
         manifest (the manifest counts are taken right after the dump, so
         tiny drift is possible if users were writing at 02:30)
       - key tables (-KeyTables) exist and are not empty
       - without manifest counts (old backups): key-table checks only
  6. DROP the drill database (always, also on failure; -KeepDatabase to inspect)
  7. result -> ops\logs\restore-drill.log + ops\logs\restore-drill-last.json;
     alert "restore-drill.failed" (Error) or "restore-drill.ok" (Info, with the
     measured duration = RTO estimate for the database part)

Production guard (Assert-KanflowDrillDatabaseName, checked before every
destructive statement): the drill database name must be a plain identifier,
contain "drill", and differ from DATABASE_NAME in app\.env; system schemas are
refused; dumps that switch database are refused.

Changes nothing outside the drill database and %TEMP%. Needs the MySQL root
password file D:\APP\Kanflow\.db-pw (the app user cannot CREATE databases).

Exit codes: 0 = drill passed, 1 = drill failed, 2 = configuration error.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-drill.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-drill.ps1 -FromSecondary
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-drill.ps1 -BackupPath E:\KanflowBackup\daily\kanflow-20260923-023000 -KeepDatabase
#>
[CmdletBinding()]
param(
    [string]$BackupRoot = $(if ($env:KANFLOW_BACKUP_DIR) { $env:KANFLOW_BACKUP_DIR } else { "E:\KanflowBackup" }),
    [switch]$FromSecondary,
    [string]$BackupPath,
    [string]$DrillDatabase,
    [ValidateRange(0, 100)][double]$RowDriftPct = 1,
    [ValidateRange(0, 1000000)][int]$RowDriftMin = 10,
    [string[]]$KeyTables = @("User", "Project", "_prisma_migrations"),
    [switch]$KeepDatabase,
    [switch]$NoSuccessAlert
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "restore-drill.log"
$ResultFile = Join-Path $paths.LogDir "restore-drill-last.json"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level }

function Resolve-DrillGeneration {
    if ($BackupPath) {
        if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) { throw "backup path not found: $BackupPath" }
        return (Resolve-Path -LiteralPath $BackupPath).Path
    }
    $root = $BackupRoot
    if ($FromSecondary) {
        $root = Get-KanflowSetting -Name "KANFLOW_BACKUP_SECONDARY_DIR"
        if (-not $root) { throw "-FromSecondary: KANFLOW_BACKUP_SECONDARY_DIR is not configured" }
    }
    $g = @(Get-KanflowBackupGenerations -Root $root -Kind daily)
    if ($g.Count -eq 0) { throw "no complete generation under $(Join-Path $root 'daily')" }
    return $g[0].FullName
}

function New-DrillDbConfig($rootCfg, [string]$name) {
    # Copy, never mutate the production config object.
    return [pscustomobject]@{ Host = $rootCfg.Host; Port = $rootCfg.Port; User = $rootCfg.User; Password = $rootCfg.Password; Database = $name }
}

function Remove-DrillDatabase($drillCfg, [string]$binDir, [string]$prodName) {
    Assert-KanflowDrillDatabaseName -Name $drillCfg.Database -ProductionName $prodName
    $opt = New-MySqlOptionFile -DbConfig $drillCfg
    try {
        $bt = [char]96
        [void](Invoke-MySqlQuery -MySqlBinDir $binDir -OptionFile $opt -Sql ("DROP DATABASE IF EXISTS {1}{0}{1}" -f $drillCfg.Database, $bt))
    } finally {
        Remove-Item -LiteralPath $opt -Force -ErrorAction SilentlyContinue
    }
}

function Test-PrivateFiles($gen, $manifest) {
    $expected = 0
    if ($manifest.PSObject.Properties.Name -contains "privateFiles") { $expected = [int]$manifest.privateFiles }
    $actual = (Get-KanflowDirStats -Path (Join-Path $gen "private")).Files
    if ($actual -ne $expected) { return "private\ has $actual files, manifest says $expected" }
    Log "private\ files: $actual (matches manifest)"
    return $null
}

function Compare-DrillCounts($manifest, $actual) {
    # Returns a list of problems (empty = pass). Table names compared
    # case-insensitively (lower_case_table_names=1 on Windows).
    $problems = New-Object System.Collections.Generic.List[string]
    $act = @{}
    foreach ($k in $actual.Keys) { $act[$k.ToLowerInvariant()] = [long]$actual[$k] }

    foreach ($t in $KeyTables) {
        $lk = $t.ToLowerInvariant()
        if (-not $act.ContainsKey($lk)) { $problems.Add("key table $t missing") }
        elseif ($act[$lk] -le 0) { $problems.Add("key table $t is empty") }
    }

    $expected = $null
    if ($manifest.PSObject.Properties.Name -contains "tableRowCounts") { $expected = $manifest.tableRowCounts }
    if (-not $expected) {
        Log "manifest has no tableRowCounts (older backup) - only key tables checked" "WARN"
        return $problems
    }
    $checked = 0
    foreach ($p in @($expected.PSObject.Properties)) {
        $lk = $p.Name.ToLowerInvariant()
        $exp = [long]$p.Value
        if (-not $act.ContainsKey($lk)) { $problems.Add("table $($p.Name) missing after restore"); continue }
        $allowed = [Math]::Max([double]$RowDriftMin, [Math]::Ceiling($exp * $RowDriftPct / 100.0))
        $delta = [Math]::Abs($act[$lk] - $exp)
        if ($exp -gt 0 -and $act[$lk] -eq 0) { $problems.Add(("table {0} is EMPTY after restore, manifest {1} rows" -f $p.Name, $exp)) }
        elseif ($delta -gt $allowed) { $problems.Add(("table {0}: {1} rows, manifest {2} (allowed drift {3})" -f $p.Name, $act[$lk], $exp, $allowed)) }
        elseif ($delta -gt 0) { Log ("table {0}: {1} rows vs manifest {2} (within drift)" -f $p.Name, $act[$lk], $exp) }
        $checked++
    }
    $expNames = @($expected.PSObject.Properties | ForEach-Object { $_.Name.ToLowerInvariant() })
    $extra = @($act.Keys | Where-Object { $expNames -notcontains $_ })
    if ($extra.Count -gt 0) { Log ("tables not in the manifest: {0}" -f ($extra -join ", ")) "WARN" }
    Log ("row counts checked for {0} table(s)" -f $checked)
    return $problems
}

function Save-DrillResult([hashtable]$r) {
    try { $r | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultFile -Encoding UTF8 } catch { Log "could not write $ResultFile : $($_.Exception.Message)" "WARN" }
}

# ======================================================================
$started = Get-Date
$result = @{ startedAt = $started.ToString("o"); generation = $null; drillDatabase = $null; passed = $false; problems = @(); durationSec = $null; importSec = $null }
$sqlFile = $null
$drillCfg = $null
$binDir = $null
$prodName = $null
$created = $false
$exitCode = 1

try {
    Log "==== restore drill start ===="
    try {
        $prodName = (Get-KanflowDbConfig).Database
        $rootCfg = Get-KanflowDbConfig -UseRootCredential
        if ($rootCfg.Database -ne $prodName) { throw "inconsistent production database name" }
        $drillName = $(if ($DrillDatabase) { $DrillDatabase } else { "{0}_drill" -f $prodName })
        Assert-KanflowDrillDatabaseName -Name $drillName -ProductionName $prodName
        $drillCfg = New-DrillDbConfig $rootCfg $drillName
        $binDir = Get-MySqlBinDir
        $gen = Resolve-DrillGeneration
    } catch {
        $result.problems = @("configuration: $($_.Exception.Message)")
        Log "configuration error: $($_.Exception.Message)" "ERROR"
        $exitCode = 2
        throw
    }
    $result.generation = $gen
    $result.drillDatabase = $drillCfg.Database
    Log ("generation {0} -> drill database {1} (production {2} is not touched)" -f $gen, $drillCfg.Database, $prodName)

    $checked = Test-KanflowBackupGeneration -Path $gen
    $m = $checked.Manifest
    Log ("generation OK: created {0}, db={1}, dump {2:N1} MB, SHA-256 ok" -f $m.createdAt, $m.database, ($m.dump.RawBytes / 1MB))
    $problems = New-Object System.Collections.Generic.List[string]
    $pf = Test-PrivateFiles $gen $m
    if ($pf) { $problems.Add($pf) }

    $x = Expand-KanflowDump -DumpPath $checked.DumpPath
    $sqlFile = $x.SqlFile
    Log "dump expanded: $($x.CreateTables) CREATE TABLE statements, no database switch"

    Assert-KanflowDrillDatabaseName -Name $drillCfg.Database -ProductionName $prodName
    $importStart = Get-Date
    $created = $true
    Import-KanflowDump -DbConfig $drillCfg -MySqlBinDir $binDir -SqlFile $sqlFile
    $result.importSec = [int]((Get-Date) - $importStart).TotalSeconds
    Log "import into $($drillCfg.Database) finished in $($result.importSec)s"

    $counts = Get-KanflowTableCounts -DbConfig $drillCfg -MySqlBinDir $binDir
    if ($counts.Count -ne $x.CreateTables) { $problems.Add("drill database has $($counts.Count) tables, dump creates $($x.CreateTables)") }
    foreach ($p in @(Compare-DrillCounts $m $counts)) { $problems.Add($p) }

    $result.problems = @($problems)
    $result.passed = ($problems.Count -eq 0)
    $exitCode = $(if ($result.passed) { 0 } else { 1 })
} catch {
    if ($exitCode -ne 2) {
        $result.problems = @($result.problems) + @("error: $($_.Exception.Message)")
        Log ("restore drill error: {0}" -f $_.Exception.Message) "ERROR"
        $exitCode = 1
    }
} finally {
    if ($sqlFile) { Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue }
    if ($created -and $drillCfg) {
        if ($KeepDatabase) { Log "drill database $($drillCfg.Database) KEPT (-KeepDatabase) - drop it when done" "WARN" }
        else {
            try { Remove-DrillDatabase $drillCfg $binDir $prodName; Log "drill database $($drillCfg.Database) dropped" }
            catch {
                $result.problems = @($result.problems) + @("cleanup: $($_.Exception.Message)")
                Log ("could not drop drill database {0}: {1}" -f $drillCfg.Database, $_.Exception.Message) "ERROR"
            }
        }
    }
}

$result.durationSec = [int]((Get-Date) - $started).TotalSeconds
Save-DrillResult $result
if ($exitCode -eq 0) {
    Log ("==== restore drill PASSED in {0}s (import {1}s) ====" -f $result.durationSec, $result.importSec)
    if (-not $NoSuccessAlert) {
        Send-KanflowAlert -Key "restore-drill.ok" -Severity Info -Source restore-drill -Title "Restore drill passed" `
            -Message ("Generation {0} restored into {1} and verified in {2}s (DB import {3}s = RTO estimate for the database). Drill DB dropped." -f $result.generation, $result.drillDatabase, $result.durationSec, $result.importSec)
    }
} else {
    foreach ($p in @($result.problems)) { Log "problem: $p" "ERROR" }
    Log ("==== restore drill FAILED in {0}s ====" -f $result.durationSec) "ERROR"
    Send-KanflowAlert -Key "restore-drill.failed" -Severity Error -Source restore-drill -Title "Restore drill FAILED - backups may not be restorable" `
        -Message ("Generation: {0}`r`n{1}`r`nLog: {2}" -f $result.generation, (@($result.problems) -join "`r`n"), $LogFile)
}
exit $exitCode
