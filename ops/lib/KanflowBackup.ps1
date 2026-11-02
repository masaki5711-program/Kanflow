# =====================================================================
#  Kanflow ops - backup generation helpers (dot-sourced by KanflowOps.psm1)
#
#  Get-KanflowDirStats            : file count + bytes of a folder tree
#  Get-KanflowBackupGenerations   : complete generations under <root>\daily|weekly
#  Test-KanflowBackupGeneration   : manifest + dump SHA-256 check (throws)
#  Assert-KanflowDrillDatabaseName: guard for throwaway restore-drill databases
#  Keep this file ASCII-only.
# =====================================================================

$script:GenerationNamePattern = '^kanflow-\d{8}-\d{6}$'
$script:ReservedDatabases = @("postgres", "template0", "template1")

function Get-KanflowDirStats {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{ Files = 0; Bytes = [long]0 } }
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    $bytes = if ($m.Sum) { [long]$m.Sum } else { [long]0 }
    return [pscustomobject]@{ Files = [int]$m.Count; Bytes = $bytes }
}

function Get-KanflowBackupGenerations {
    <# Complete (renamed, non-.partial) generation folders, newest first. #>
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [ValidateSet("daily", "weekly")][string]$Kind = "daily"
    )
    $dir = Join-Path $Root $Kind
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $script:GenerationNamePattern } | Sort-Object Name -Descending)
}

function Test-KanflowBackupGeneration {
    <#
    .SYNOPSIS
    Verify a generation folder: manifest.json present, dump present, dump
    SHA-256 equal to the manifest. Returns Manifest, DumpPath. Throws otherwise.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)
    $manifestPath = Join-Path $Path "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw "manifest.json missing - not a complete generation: $Path" }
    $m = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $dumpPath = Join-Path $Path $m.dump.File
    if (-not (Test-Path -LiteralPath $dumpPath)) { throw "dump file missing: $dumpPath" }
    $sha = Get-FileSha256 -Path $dumpPath
    if ($sha -ne $m.dump.Sha256) { throw "SHA-256 mismatch for $($m.dump.File) (backup corrupted)" }
    return [pscustomobject]@{ Manifest = $m; DumpPath = $dumpPath }
}

function Expand-KanflowDump {
    <#
    .SYNOPSIS
    Expand a .sql.gz dump (pg_dump plain format) to a temp .sql and check it:
    "-- PostgreSQL database dump complete" trailer present, and NO
    "\connect" / "\c" / "CREATE DATABASE" (a dump with them would import into
    the database it names instead of the one chosen by the caller - e.g.
    production during a drill). Returns SqlFile, CreateTables. The caller
    deletes SqlFile. Throws on any problem.
    #>
    param([Parameter(Mandatory = $true)][string]$DumpPath)
    $sql = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-dump-{0}.sql" -f ([guid]::NewGuid().ToString("N")))
    try {
        Expand-GzipFile -Source $DumpPath -Destination $sql
        # Older dumps may still carry CREATE EXTENSION timescaledb: drop it so they restore anywhere.
        [void](Remove-KanflowDumpExtensionLines -Path $sql)
        $tail = @(Get-Content -LiteralPath $sql -Tail 8 -Encoding UTF8)
        if (@($tail -match "^-- PostgreSQL database dump complete").Count -eq 0) { throw "dump has no 'PostgreSQL database dump complete' trailer" }
        $switching = @(Select-String -LiteralPath $sql -Pattern '^\s*(\\connect\b|\\c\s|CREATE\s+DATABASE\b)' -Encoding UTF8 | Select-Object -First 1)
        if ($switching.Count -gt 0) {
            throw ("dump switches database at line {0} ('{1}') - refusing to import it into a chosen database" -f $switching[0].LineNumber, $switching[0].Line.Trim())
        }
        $tables = @(Select-String -LiteralPath $sql -Pattern '^CREATE TABLE' -Encoding UTF8).Count
        return [pscustomobject]@{ SqlFile = $sql; CreateTables = $tables }
    } catch {
        Remove-Item -LiteralPath $sql -Force -ErrorAction SilentlyContinue
        throw
    }
}

function Import-KanflowDump {
    <#
    .SYNOPSIS
    DROP (WITH FORCE) + CREATE $DbConfig.Database from template0 (UTF-8, no
    pre-installed extension) with the locale -Locale - normally the SOURCE
    database's settings recorded in the backup manifest (dbLocale). Without
    -Locale (older generations, or -UseServerLocale in the scripts) the target
    server's template1 settings are used: always valid on that server, e.g. a
    native Windows PostgreSQL that has no "C.UTF-8" libc locale. Then imports
    $SqlFile (from Expand-KanflowDump) with ON_ERROR_STOP in ONE transaction
    (--single-transaction): a failed import leaves an empty database, never a
    partial one. With -Owner the database and every table / sequence / view are
    handed to that role afterwards. Returns the locale used. Destructive:
    callers guard the name.
    #>
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PgBinDir,
        [Parameter(Mandatory = $true)][string]$SqlFile,
        [string]$Owner,
        $Locale
    )
    $name = $DbConfig.Database
    if ($name -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid database name" }
    if ($Owner -and $Owner -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid owner role name" }
    if ($null -eq $Locale) { $Locale = Get-KanflowDbLocale -DbConfig $DbConfig -PgBinDir $PgBinDir -ServerDefault }
    $create = Get-KanflowCreateDatabaseSql -Name $name -Locale $Locale
    $pass = New-PgPassFile -DbConfig $DbConfig
    $err = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-import-{0}.err" -f ([guid]::NewGuid().ToString("N")))
    $out = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-import-{0}.out" -f ([guid]::NewGuid().ToString("N")))
    try {
        # Two statements, two calls: DROP / CREATE DATABASE cannot run inside one implicit transaction.
        [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql ("DROP DATABASE IF EXISTS `"{0}`" WITH (FORCE)" -f $name))
        try {
            [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql $create)
        } catch {
            if ($_.Exception.Message -match "invalid (LC_COLLATE|LC_CTYPE) locale name|ICU locale") {
                throw ("this server does not have the source locale (provider={0} collate={1} ctype={2} icu={3}); re-run with -UseServerLocale to use the locale of this server. {4}" -f $Locale.Provider, $Locale.Collate, $Locale.Ctype, $Locale.IcuLocale, $_.Exception.Message)
            }
            throw
        }
        $code = Invoke-PgClient -FilePath (Join-Path $PgBinDir "psql.exe") `
            -Arguments ("{0} -d {1} -X -q --single-transaction -v ON_ERROR_STOP=1 -f `"{2}`"" -f (Get-PgConnectionArgs $DbConfig), $name, $SqlFile) `
            -PassFile $pass -StdoutFile $out -StderrFile $err
        if ($code -ne 0) {
            $msg = if (Test-Path -LiteralPath $err) { ([System.IO.File]::ReadAllText($err)).Trim() } else { "" }
            throw "psql import exited with $code (nothing imported: single transaction) : $msg"
        }
        if ($Owner) {
            [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql ("ALTER DATABASE `"{0}`" OWNER TO `"{1}`"" -f $name, $Owner))
            $reown = @"
DO `$`$DECLARE r record; BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm') LOOP
    EXECUTE format('ALTER %s public.%I OWNER TO %I',
      CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
      r.relname, '$Owner');
  END LOOP;
END`$`$;
"@
            [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql $reown -Database $name)
        }
        return $Locale
    } finally {
        Remove-Item -LiteralPath $pass, $err, $out -Force -ErrorAction SilentlyContinue
    }
}

function Assert-KanflowDrillDatabaseName {
    <#
    .SYNOPSIS
    Throw unless $Name is safe to DROP/CREATE for a restore drill: plain
    identifier, contains "drill", is not a PostgreSQL system database and is NOT the
    production database ($ProductionName, from app\.env). Called before every
    destructive statement of ops\backup\restore-drill.ps1.
    #>
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Name,
        [Parameter(Mandatory = $true)][string]$ProductionName
    )
    if ($Name -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "drill database name '$Name' is not a plain identifier" }
    if ($Name -notmatch '(?i)drill') { throw "drill database name '$Name' must contain 'drill'" }
    if ($Name -ieq $ProductionName) { throw "refusing to use the PRODUCTION database '$ProductionName' as drill target" }
    if ($script:ReservedDatabases -contains $Name.ToLowerInvariant()) { throw "refusing to use system database '$Name'" }
}
