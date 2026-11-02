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
    DROP (WITH FORCE) + CREATE $DbConfig.Database (UTF-8, ICU "und" collation
    like every Kanflow PostgreSQL, from template0 so no pre-installed extension
    comes along) and import $SqlFile (from Expand-KanflowDump) into it with
    ON_ERROR_STOP. With -Owner the new database and every table / sequence /
    view are handed to that role afterwards (restore as the superuser, run the
    app as its own user). Destructive: callers guard the name.
    #>
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PgBinDir,
        [Parameter(Mandatory = $true)][string]$SqlFile,
        [string]$Owner
    )
    $name = $DbConfig.Database
    if ($name -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid database name" }
    if ($Owner -and $Owner -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid owner role name" }
    $pass = New-PgPassFile -DbConfig $DbConfig
    $err = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-import-{0}.err" -f ([guid]::NewGuid().ToString("N")))
    try {
        # Two statements, two calls: DROP / CREATE DATABASE cannot run inside one implicit transaction.
        [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql ("DROP DATABASE IF EXISTS `"{0}`" WITH (FORCE)" -f $name))
        [void](Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql ("CREATE DATABASE `"{0}`" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8'" -f $name))
        $code = Invoke-PgClient -FilePath (Join-Path $PgBinDir "psql.exe") `
            -Arguments ("{0} -d {1} -X -q -v ON_ERROR_STOP=1 -f `"{2}`"" -f (Get-PgConnectionArgs $DbConfig), $name, $SqlFile) `
            -PassFile $pass -StdoutFile ([System.IO.Path]::GetTempFileName()) -StderrFile $err
        if ($code -ne 0) {
            $msg = if (Test-Path -LiteralPath $err) { ([System.IO.File]::ReadAllText($err)).Trim() } else { "" }
            throw "psql import exited with $code : $msg"
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
    } finally {
        Remove-Item -LiteralPath $pass, $err -Force -ErrorAction SilentlyContinue
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
