<#
.SYNOPSIS
Authoritative Kanflow deploy: preflight -> backup -> read-only drift check ->
build web + worker into .next-new -> (migrations) -> swap -> health verify ->
automatic rollback. Procedure and phases: docs\operations\deploy.md.

.DESCRIPTION
-Phase A  translations run INSIDE the web service (AI_TRANSLATION_WORKER=inprocess
          in app\.env). The worker service is not required.
-Phase B  translations run in the standalone worker service kanflowworker.exe
          (AI_TRANSLATION_WORKER=external, INTERNAL_API_TOKEN set, service installed
          - or pass -InstallWorker to install it after the swap).
Phase C (Next.js upgrade + service wrapper relocation) is a manual procedure
in deploy.md using ops\deploy\node-modules-snapshot.ps1 and
ops\web\migrate-service-wrapper.ps1.

Steps
  1. preflight   admin, git work tree clean + HEAD tagged, app\.env matches the
                 phase, node_modules present, no MAINTENANCE flag, app reachable
  2. backup      ops\backup\backup-kanflow.ps1 (must exit 0)
  3. drift       READ-ONLY: prisma migrate status + migrate diff (DB -> schema.prisma)
                 - pending migrations need -ApplyMigrations (applied after the build)
                 - only the baseline pending and DB == schema: -ResolveBaseline marks it applied
                 - DB differs from schema with nothing pending: abort (drift)
  4. build       prisma generate; NEXT_DIST_DIR=.next-new: next build + build:worker
  5. migrate     prisma migrate deploy (only with -ApplyMigrations)
  6. swap        ops\deploy\swap-build.ps1 (web + worker restart, verified, auto-rollback)
  7. verify      /api/health 200, buildId = new build; Phase B: worker heartbeat ok
                 -> on failure: swap-build.ps1 -Rollback
Log: ops\logs\deploy.log (build output: ops\logs\deploy-build-<ts>.log)

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A -PreflightOnly
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A -ResolveBaseline
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase B -InstallWorker
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet("A", "B")][string]$Phase,
    [string]$BackupDestination,
    [switch]$ApplyMigrations,
    [switch]$ResolveBaseline,
    [switch]$InstallWorker,
    [switch]$SkipBackup,
    [switch]$AllowDirty,
    [switch]$AllowUntagged,
    [switch]$PreflightOnly,
    [string]$NewDir = ".next-new"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$BaselineMigration = "20260923000000_baseline_drift"
$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "deploy.log"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BuildLog = Join-Path $paths.LogDir "deploy-build-$stamp.log"
$swap = Join-Path $PSScriptRoot "swap-build.ps1"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message ("[deploy {0}] {1}" -f $Phase, $msg) -Level $level }
function Fail([string]$msg, [int]$code = 2) { Log $msg "ERROR"; exit $code }

function Invoke-AppCommand([string]$exe, [string[]]$argv, [switch]$Quiet, [hashtable]$EnvVars = @{}) {
    # Runs in app\, output appended to the build log; returns @{ Code; Output }.
    # PS 5.1: with EAP=Stop, native stderr lines under 2>&1 become terminating errors.
    $ErrorActionPreference = "Continue"
    Push-Location $paths.App
    $saved = @{}
    foreach ($k in $EnvVars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $EnvVars[$k]) }
    try {
        Add-Content -LiteralPath $BuildLog -Value ("`r`n> {0} {1}" -f $exe, ($argv -join " ")) -Encoding UTF8
        $out = & $exe @argv 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
        Add-Content -LiteralPath $BuildLog -Value $out -Encoding UTF8
        if (-not $Quiet) { $out | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" } }
        return [pscustomobject]@{ Code = $code; Output = @($out) }
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
        Pop-Location
    }
}

function Get-AppHealth {
    $h = Test-KanflowHealth -TimeoutSec 15
    if ($h.StatusCode -eq 404) {
        try { if ([int](Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/auth/csrf" -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200) { $h.Ok = $true } } catch { Write-Verbose "fallback probe failed" }
    }
    return $h
}

# ================================================================ 1. preflight
Log "=== deploy start (NewDir $NewDir) ==="
if ($NewDir -ieq ".next" -or $NewDir -ieq ".next-prev") { Fail "NewDir $NewDir is not allowed" }

function Invoke-Git([string[]]$argv) {
    $ErrorActionPreference = "Continue"
    $out = & git.exe -C $paths.Root @argv 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $out
}
$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) { Fail "git not found" }
$dirty = @(Invoke-Git @("status", "--porcelain") | Where-Object { $_ })
if ($dirty.Count -gt 0) {
    if ($AllowDirty) { Log ("work tree has {0} uncommitted change(s) - continuing (-AllowDirty)" -f $dirty.Count) "WARN" }
    else { Fail ("git work tree not clean ({0} change(s)); commit/stash first or pass -AllowDirty" -f $dirty.Count) }
}
$head = "$(Invoke-Git @('rev-parse', '--short', 'HEAD'))".Trim()
$tag = Invoke-Git @("describe", "--exact-match", "--tags", "HEAD")
if (-not $tag) {
    if ($AllowUntagged) { Log "HEAD $head is not tagged - continuing (-AllowUntagged)" "WARN" }
    else { Fail "HEAD $head is not tagged (git tag deploy-$stamp) - or pass -AllowUntagged" }
}
Log ("revision {0} {1}" -f $head, $tag)

$mode = Get-TranslationWorkerMode
if ($Phase -eq "A" -and $mode -ne "inprocess") {
    Fail "Phase A requires AI_TRANSLATION_WORKER=inprocess in app\.env (current: $mode). Without it the new build does not translate at all."
}
if ($Phase -eq "B") {
    if ($mode -ne "external") { Fail "Phase B requires AI_TRANSLATION_WORKER=external (or unset) in app\.env (current: $mode)" }
    if (-not (Get-KanflowEnvValue -Name "INTERNAL_API_TOKEN")) { Fail "Phase B requires INTERNAL_API_TOKEN in app\.env (shared by web and worker)" }
    if (-not (Get-Service -Name "kanflowworker.exe" -ErrorAction SilentlyContinue) -and -not $InstallWorker) {
        Fail "worker service kanflowworker.exe is not installed - pass -InstallWorker (installed after the swap) or install it first"
    }
}
foreach ($req in @("node_modules\next\package.json", "node_modules\esbuild\package.json", "node_modules\prisma\package.json", ".env")) {
    if (-not (Test-Path -LiteralPath (Join-Path $paths.App $req))) { Fail "missing app\$req (npm ci / restore .env first)" }
}
if (Test-Path -LiteralPath (Join-Path $paths.Root "ops\watchdog\MAINTENANCE")) { Fail "ops\watchdog\MAINTENANCE exists - another maintenance in progress? Remove it first." }
$before = Get-AppHealth
if (-not $before.Ok) { Log ("app is NOT healthy before the deploy (http={0} db={1}) - continuing, rollback target may be broken too" -f $before.StatusCode, $before.Db) "WARN" }
$liveId = $null
$liveFile = Join-Path $paths.App ".next\BUILD_ID"
if (Test-Path -LiteralPath $liveFile) { $liveId = ([System.IO.File]::ReadAllText($liveFile)).Trim() }
Log ("preflight OK: mode={0}, live build {1}, health http={2}" -f $mode, $liveId, $before.StatusCode)

# ================================================================ 3. drift (read-only; before backup so a bad state aborts early)
Log "read-only drift check (prisma migrate status / migrate diff)"
$st = Invoke-AppCommand "npx.cmd" @("prisma", "migrate", "status") -Quiet
$pending = @()
$capture = $false
foreach ($line in $st.Output) {
    if ($line -match "have not yet been applied|not yet been applied") { $capture = $true; continue }
    if ($capture) {
        $name = $line.Trim()
        if ($name -match '^\d{14}_[A-Za-z0-9_]+$') { $pending += $name } elseif ($name -ne "") { $capture = $false }
    }
}
if ($st.Code -ne 0 -and $pending.Count -eq 0) { Fail ("prisma migrate status failed (exit {0}) - see {1}" -f $st.Code, $BuildLog) }
$diff = Invoke-AppCommand "npx.cmd" @("prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code") -Quiet
# --exit-code: 0 = no difference, 2 = difference, 1 = error
if ($diff.Code -eq 1) { Fail "prisma migrate diff failed - see $BuildLog" }
$dbMatchesSchema = ($diff.Code -eq 0)
Log ("pending migrations: [{0}]; DB == schema.prisma: {1}" -f ($pending -join ", "), $dbMatchesSchema)

$resolveBaselineNow = $false
if ($pending.Count -eq 0 -and -not $dbMatchesSchema) {
    Fail "DRIFT: the database differs from schema.prisma but no migration is pending. Inspect: npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script"
}
if ($pending -contains $BaselineMigration) {
    if ($pending.Count -eq 1 -and $dbMatchesSchema) {
        if (-not $ResolveBaseline) { Fail "baseline $BaselineMigration is pending and the DB already matches the schema: re-run with -ResolveBaseline (marks it applied, runs no SQL)" }
        $resolveBaselineNow = $true
    } elseif ($pending.Count -gt 1) {
        Fail "baseline + other migrations pending: resolve the baseline first (deploy.md 'Prisma baseline'), then deploy again"
    } else {
        Fail "baseline pending but the DB does NOT match schema.prisma - do not resolve blindly; see deploy.md 'Prisma baseline'"
    }
}
$otherPending = @($pending | Where-Object { $_ -ne $BaselineMigration })
if ($otherPending.Count -gt 0 -and -not $ApplyMigrations) { Fail ("pending migrations [{0}] - re-run with -ApplyMigrations (after reading them)" -f ($otherPending -join ", ")) }
if ($PreflightOnly) { Log "preflight only - stopping here (nothing changed)"; exit 0 }
if (-not (Test-IsAdministrator)) { Fail "run from an elevated PowerShell (backup task, service stop/start)" }

# ================================================================ 2. backup
if ($SkipBackup) { Log "backup SKIPPED (-SkipBackup)" "WARN" } else {
    Log "backup (ops\backup\backup-kanflow.ps1)"
    $bArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $paths.Root "ops\backup\backup-kanflow.ps1"))
    if ($BackupDestination) { $bArgs += @("-Destination", $BackupDestination) }
    & powershell.exe @bArgs
    if ($LASTEXITCODE -ne 0) { Fail "backup failed (exit $LASTEXITCODE) - nothing deployed" }
    Log "backup OK"
}

# ================================================================ 4. build
$newPath = Join-Path $paths.App $NewDir
if (Test-Path -LiteralPath $newPath) { Remove-Item -LiteralPath $newPath -Recurse -Force }
Log "build -> $NewDir (log $BuildLog)"
if ((Invoke-AppCommand "npx.cmd" @("prisma", "generate")).Code -ne 0) { Fail "prisma generate failed" }
if ((Invoke-AppCommand "npm.cmd" @("run", "build") -EnvVars @{ NEXT_DIST_DIR = $NewDir }).Code -ne 0) { Fail "next build failed - nothing swapped" }
if ((Invoke-AppCommand "npm.cmd" @("run", "build:worker") -EnvVars @{ NEXT_DIST_DIR = $NewDir }).Code -ne 0) { Fail "worker bundle build failed - nothing swapped" }
$newId = ([System.IO.File]::ReadAllText((Join-Path $newPath "BUILD_ID"))).Trim()
$dry = Invoke-AppCommand "node.exe" @("src/worker/service-entry.mjs", "--dry-run") -Quiet -EnvVars @{ KANFLOW_WORKER_BUNDLE = "$NewDir/worker/main.cjs" }
if ($dry.Code -ne 0) { Fail "worker bundle --dry-run failed - see $BuildLog" }
Log "build OK: BUILD_ID $newId (worker bundle dry-run OK)"

# ================================================================ 5. migrations
if ($resolveBaselineNow) {
    Log "marking $BaselineMigration as applied (no SQL executed)"
    if ((Invoke-AppCommand "npx.cmd" @("prisma", "migrate", "resolve", "--applied", $BaselineMigration)).Code -ne 0) { Fail "migrate resolve failed" }
}
if ($otherPending.Count -gt 0) {
    Log ("applying migrations: {0}" -f ($otherPending -join ", "))
    if ((Invoke-AppCommand "npx.cmd" @("prisma", "migrate", "deploy")).Code -ne 0) { Fail "prisma migrate deploy FAILED - the old build is still serving; restore the DB from the backup if the migration half-applied (backup-restore.md)" 1 }
}

# ================================================================ 6. swap
Log "swap $NewDir -> .next"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $swap -NewDir $NewDir
$swapCode = $LASTEXITCODE
if ($swapCode -eq 1 -or $swapCode -eq 2) { Fail "swap failed (exit $swapCode; swap-build rolled the web build back if it could). See ops\logs\deploy.log" 1 }
if ($swapCode -eq 3) { Log "web swapped but the worker did not come back (exit 3)" "WARN" }

if ($InstallWorker -and -not (Get-Service -Name "kanflowworker.exe" -ErrorAction SilentlyContinue)) {
    Log "installing the worker service"
    Push-Location $paths.Root
    try { & node.exe (Join-Path $paths.Root "ops\worker\install-worker-service.js") } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Log "worker service install failed" "ERROR" }
}

# ================================================================ 7. verify (+ auto-rollback)
$ok = Wait-Condition -TimeoutSec 120 -IntervalSec 5 -Condition { $h = Test-KanflowHealth; $h.Ok -and $h.BuildId -eq $newId }
$h = Test-KanflowHealth
$problems = @()
if (-not $ok) { $problems += ("health http={0} db={1} buildId={2} (expected {3})" -f $h.StatusCode, $h.Db, $h.BuildId, $newId) }
if ($Phase -eq "B") {
    $wOk = Wait-Condition -TimeoutSec 180 -IntervalSec 5 -Condition { (Test-KanflowHealth).Worker -eq "ok" }
    if (-not $wOk) { $problems += ("worker heartbeat {0}" -f (Test-KanflowHealth).Worker) }
}
if ($problems.Count -gt 0) {
    Log ("post-deploy verification FAILED: {0} - rolling back to {1}" -f ($problems -join "; "), $liveId) "ERROR"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $swap -Rollback
    Log ("rollback exit {0}. Migrations/baseline resolution are NOT reverted - see deploy.md 'Rollback'." -f $LASTEXITCODE) "ERROR"
    exit 1
}
Log ("deploy OK: BUILD_ID {0} ({1} {2}), worker={3}, pending translations={4}" -f $newId, $head, $tag, $h.Worker, $h.Pending)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $paths.Root "ops\status.ps1")
exit 0
