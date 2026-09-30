<#
.SYNOPSIS
Register (or re-register) the monthly "KanflowRestoreDrill" scheduled task.
Run as administrator. Registration only - it does not run the drill.

.DESCRIPTION
Runs ops\backup\restore-drill.ps1 once a month (default: first Sunday, 04:00 -
after the 02:30 backup, before the 06:30 AI surveillance). The drill restores
the newest backup into a throwaway database (<db>_drill), checks it, drops it
and alerts on failure (docs\operations\backup-restore.md section 4).

Runs as SYSTEM by default (reads the root password file .db-pw). With
-FromSecondary the drill reads the NAS copy; SYSTEM usually cannot read a
share, so pass -RunAsUser (a domain/service account with read access to the
share and to D:\APP\Kanflow\.db-pw). schtasks.exe prompts for its password.

Monthly triggers are not available through New-ScheduledTaskTrigger, so this
script uses schtasks.exe.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1 -Week SECOND -Day SAT -Time 05:00
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1 -FromSecondary -RunAsUser YMMA\svc-kanflow
#>
[CmdletBinding()]
param(
    [ValidatePattern('^\d{2}:\d{2}$')][string]$Time = "04:00",
    [ValidateSet("FIRST", "SECOND", "THIRD", "FOURTH", "LAST")][string]$Week = "FIRST",
    [ValidateSet("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")][string]$Day = "SUN",
    [string]$TaskName = "KanflowRestoreDrill",
    [string]$BackupRoot,
    [switch]$FromSecondary,
    [string]$RunAsUser
)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

if (-not (Test-IsAdministrator)) {
    Write-Host "[ERROR] Run this script from an elevated PowerShell (Run as administrator)." -ForegroundColor Red
    exit 1
}
$script = Join-Path $PSScriptRoot "restore-drill.ps1"
if (-not (Test-Path -LiteralPath $script)) { Write-Host "[ERROR] not found: $script" -ForegroundColor Red; exit 1 }
if ($BackupRoot -match '"' -or $RunAsUser -match '"') { Write-Host "[ERROR] invalid argument" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath (Get-KanflowPaths).DbPwFile)) {
    Write-Host "[WARN] $((Get-KanflowPaths).DbPwFile) not found - the drill needs the MySQL root password file" -ForegroundColor Yellow
}

$command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
if ($BackupRoot) { $command += " -BackupRoot `"$BackupRoot`"" }
if ($FromSecondary) { $command += " -FromSecondary" }
if ($command.Length -gt 261) { Write-Host "[ERROR] task command longer than 261 characters (schtasks limit); shorten -BackupRoot" -ForegroundColor Red; exit 1 }

# Windows PowerShell 5.1 does not escape embedded quotes for native programs: do it here.
$argList = @("/Create", "/F", "/TN", $TaskName, "/TR", ($command -replace '"', '\"'), "/SC", "MONTHLY", "/MO", $Week, "/D", $Day, "/ST", $Time, "/RL", "HIGHEST")
if ($RunAsUser) { $argList += @("/RU", $RunAsUser, "/RP", "*") } else { $argList += @("/RU", "SYSTEM") }

& schtasks.exe @argList
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] schtasks /Create failed (exit $LASTEXITCODE)" -ForegroundColor Red; exit 1 }

Write-Host "[OK] '$TaskName' registered: $Week $Day of every month at $Time ($(if ($RunAsUser) { $RunAsUser } else { 'SYSTEM' }))"
Write-Host "     Run now : schtasks /Run /TN $TaskName   (restores into <db>_drill, then drops it)"
Write-Host "     Result  : $(Join-Path (Get-KanflowRoot) 'ops\logs\restore-drill.log'), ops\logs\restore-drill-last.json"
exit 0
