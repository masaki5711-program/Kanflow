<#
.SYNOPSIS
Continuous deployment entry point: called by the GitLab Runner on the
production PC (job "deploy-production" in .gitlab-ci.yml) after a push to
main. Moves the production working tree to the pipeline's commit and runs the
authoritative deploy (ops\deploy\deploy.ps1). Procedure: docs\operations\cicd.md.

.DESCRIPTION
  1. The commit is fetched from the runner's own checkout ($SourceRepo), so the
     production tree needs no GitLab credentials.
  2. Refused (production untouched) when the production tree is dirty, or when
     app\package-lock.json changed: dependency upgrades need the manual
     procedure (service stop + npm ci, docs\operations\deploy.md).
  3. The commit gets a deploy tag (deploy-YYYYMMDD-HHmmss-<sha>) and is checked out
     detached - deploy.ps1 requires a tagged, clean HEAD.
  4. deploy.ps1 -ApplyMigrations: quality gate, backup, build into .next-new,
     migrations, swap, health check, automatic build rollback + alerts.
  5. If deploy.ps1 fails, the source tree goes back to the previous revision so
     it matches the (rolled back) live build again.
Exit code: 0 = deployed or already live, otherwise the failing step's code.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\auto-deploy.ps1 -CommitSha $env:CI_COMMIT_SHA
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{7,40}$')][string]$CommitSha,
    [string]$SourceRepo = $env:CI_PROJECT_DIR,
    [string]$ProdDir = "D:\APP\Kanflow",
    [ValidateSet("", "A", "B")][string]$Phase = ""
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProdDir "ops\logs\auto-deploy.log"

function Log([string]$msg) {
    $line = "{0} [auto-deploy] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Output $line
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Invoke-Git([string[]]$argv) {
    # PS 5.1: with EAP=Stop, git's progress lines on stderr ("From ...") under 2>&1 become terminating errors.
    $ErrorActionPreference = "Continue"
    $out = @(& git -C $ProdDir @argv 2>&1 | ForEach-Object { "$_" })
    if ($LASTEXITCODE -ne 0) { throw ("git {0} failed: {1}" -f ($argv -join " "), ($out -join " ")) }
    return $out
}

function Get-Phase {
    if ($Phase) { return $Phase }
    # Same rule as deploy.ps1's preflight: external worker = Phase B, else A.
    $envFile = Join-Path $ProdDir "app\.env"
    if (-not (Test-Path -LiteralPath $envFile)) { return "A" }
    $mode = Select-String -Path $envFile -Pattern '^\s*AI_TRANSLATION_WORKER\s*=\s*"?(\w+)' -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($mode -and $mode.Matches[0].Groups[1].Value -eq "external") { return "B" }
    return "A"
}

if (-not $SourceRepo -or -not (Test-Path $SourceRepo)) { throw "SourceRepo not found (run from the GitLab job or pass -SourceRepo)" }
New-Item -ItemType Directory -Force (Split-Path $LogFile) | Out-Null
Log "=== start: commit $CommitSha from $SourceRepo ==="

if ((Invoke-Git @("status", "--porcelain")) -ne $null) { Log "REFUSED: production tree has local changes (git status)"; exit 10 }
$previous = (Invoke-Git @("rev-parse", "HEAD")) | Select-Object -First 1
Invoke-Git @("fetch", "--no-tags", $SourceRepo, $CommitSha) | Out-Null
$target = (Invoke-Git @("rev-parse", "FETCH_HEAD")) | Select-Object -First 1
if ($target -eq $previous) { Log "already live: $target - nothing to do"; exit 0 }

& git -C $ProdDir diff --quiet $previous $target -- app/package-lock.json
if ($LASTEXITCODE -ne 0) {
    Log "REFUSED: app/package-lock.json changed ($previous..$target). Dependency upgrades use the manual procedure (docs\operations\deploy.md)."
    exit 11
}

$short = $target.Substring(0, 8)
$tag = "deploy-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $short
# A retried job may find its tag already there: reuse it when it names the same commit.
& git -C $ProdDir rev-parse -q --verify "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) {
    $tagged = (Invoke-Git @("rev-list", "-n", "1", $tag)) | Select-Object -First 1
    if ($tagged -ne $target) { Log "REFUSED: tag $tag exists for another commit ($tagged)"; exit 12 }
} else {
    Invoke-Git @("tag", $tag, $target) | Out-Null
}
Invoke-Git @("checkout", "--detach", $tag) | Out-Null
Log "checked out $tag (was $previous)"

$phase = Get-Phase
$deploy = Join-Path $ProdDir "ops\deploy\deploy.ps1"
Log "running deploy.ps1 -Phase $phase -ApplyMigrations"
& powershell -NoProfile -ExecutionPolicy Bypass -File $deploy -Phase $phase -ApplyMigrations
$code = $LASTEXITCODE
if ($code -ne 0) {
    # deploy.ps1 already rolled the build back (or never swapped); keep source == live build.
    Invoke-Git @("checkout", "--detach", $previous) | Out-Null
    Log "FAILED: deploy.ps1 exit $code - source tree back at $previous (see ops\logs\deploy.log)"
    exit $code
}
Log "=== deployed $tag ==="
exit 0
