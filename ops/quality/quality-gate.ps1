<#
.SYNOPSIS
Local quality gate for app\: lint, typecheck, unit tests with coverage
thresholds. Fails when any step fails. Run by ops\deploy\deploy.ps1 in its
preflight (skippable only with the logged -SkipQualityGate switch).

.DESCRIPTION
Steps (in app\, with the repo's own node_modules):
  1. lint       npx eslint src --quiet      (errors only; warnings do not fail)
  2. typecheck  npm run typecheck           (tsc --noEmit)
  3. tests      npm run test:coverage       (vitest run --coverage; thresholds in
                                             app\vitest.config.ts: 80% lines /
                                             functions / branches / statements)
Read-only for the running system: no build, no install, no database access
(tests mock Prisma). Writes app\coverage\ and logs only.

Log: ops\logs\quality-gate.log (summary), full output of the last run in
ops\logs\quality-gate-output.log.

Exit codes: 0 = all steps passed, 1 = a step failed, 2 = cannot run
(node_modules missing).

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\quality\quality-gate.ps1
#>
[CmdletBinding()]
param(
    [ValidateSet("lint", "typecheck", "test")][string[]]$Steps = @("lint", "typecheck", "test")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "quality-gate.log"
$OutFile = Join-Path $paths.LogDir "quality-gate-output.log"

function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level }

$Definitions = [ordered]@{
    lint      = @{ Exe = "npx.cmd"; Args = @("eslint", "src", "--quiet") }
    typecheck = @{ Exe = "npm.cmd"; Args = @("run", "typecheck") }
    test      = @{ Exe = "npm.cmd"; Args = @("run", "test:coverage") }
}

function Invoke-GateStep([string]$name) {
    $def = $Definitions[$name]
    # PS 5.1: with EAP=Stop, native stderr lines under 2>&1 become terminating errors.
    $ErrorActionPreference = "Continue"
    $started = Get-Date
    Push-Location $paths.App
    try {
        Add-Content -LiteralPath $OutFile -Value ("`r`n===== {0}: {1} {2}" -f $name, $def.Exe, ($def.Args -join " ")) -Encoding UTF8
        $out = @(& $def.Exe @($def.Args) 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
        Add-Content -LiteralPath $OutFile -Value $out -Encoding UTF8
    } finally {
        Pop-Location
    }
    return [pscustomobject]@{ Name = $name; Code = $code; Sec = [int]((Get-Date) - $started).TotalSeconds; Output = $out }
}

function Get-CoverageSummary([string[]]$lines) {
    # "Statements   : 99.03% ( 36378/36731 )" -> "statements 99.03%"
    $found = @($lines | Where-Object { $_ -match '^(Statements|Branches|Functions|Lines)\s*:\s*[\d.]+%' } |
            ForEach-Object { ($_ -replace '^(\w+)\s*:\s*([\d.]+%).*$', '$1 $2').ToLowerInvariant() })
    return ($found -join ", ")
}

# ======================================================================
foreach ($req in @("node_modules\eslint\package.json", "node_modules\typescript\package.json", "node_modules\vitest\package.json", "node_modules\@vitest\coverage-v8\package.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $paths.App $req))) { Log "cannot run: app\$req missing" "ERROR"; exit 2 }
}
Set-Content -LiteralPath $OutFile -Value ("quality gate {0}" -f (Get-Date -Format o)) -Encoding UTF8
Log ("==== quality gate start ({0}) ====" -f ($Steps -join ", "))

$failed = @()
foreach ($name in @($Definitions.Keys | Where-Object { $Steps -contains $_ })) {
    $r = Invoke-GateStep $name
    $extra = ""
    if ($name -eq "test") {
        $cov = Get-CoverageSummary $r.Output
        if ($cov) { $extra = "; coverage: $cov" }
    }
    if ($r.Code -eq 0) {
        Log ("{0}: OK in {1}s{2}" -f $name, $r.Sec, $extra)
    } else {
        $failed += $name
        Log ("{0}: FAILED (exit {1}) in {2}s{3}" -f $name, $r.Code, $r.Sec, $extra) "ERROR"
        $r.Output | Where-Object { $_ -match '\S' } | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" }
    }
}

if ($failed.Count -gt 0) {
    Log ("==== quality gate FAILED: {0} - full output: {1} ====" -f ($failed -join ", "), $OutFile) "ERROR"
    exit 1
}
Log "==== quality gate passed ===="
exit 0
