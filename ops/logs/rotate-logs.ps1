<#
.SYNOPSIS
Rotate Kanflow log files that are not rotated by their writers.

.DESCRIPTION
Size-based rotation (file -> file.1 .. file.N) for:
  - ops\logs\*.log                       (backup / watchdog / surveillance)
  - D:\APP\Kanflow\ai-activity.log       (AI monitor feed written by the app)
  - node-windows daemon logs             web: ops\web\daemon\*.log (legacy:
                                         app\node_modules\next\dist\bin\daemon\*.log),
                                         worker: ops\worker\daemon\*.log
Files held open by a running process are skipped (a warning is printed).
The watchdog calls this once per run, so no separate schedule is needed.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\logs\rotate-logs.ps1 -MaxMB 10 -Keep 5
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 1024)][int]$MaxMB = 10,
    [ValidateRange(1, 100)][int]$Keep = 5,
    [string[]]$ExtraPaths = @()
)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "LogRotation.psm1") -Force

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$targets = @()
$targets += @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter "*.log" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$targets += (Join-Path $root "ai-activity.log")
foreach ($rel in @("ops\web\daemon", "app\node_modules\next\dist\bin\daemon", "ops\worker\daemon")) {
    $targets += @(Get-ChildItem -LiteralPath (Join-Path $root $rel) -Filter "*.log" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
}
$targets += $ExtraPaths

$rotated = 0
foreach ($t in ($targets | Where-Object { $_ } | Select-Object -Unique)) {
    if (Invoke-LogRotation -Path $t -MaxBytes ($MaxMB * 1MB) -Keep $Keep) {
        Write-Host "rotated: $t"
        $rotated++
    }
}
Write-Host "log rotation done ($rotated rotated)"
exit 0
