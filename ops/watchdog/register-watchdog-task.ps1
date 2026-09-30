<#
.SYNOPSIS
Register (or re-register) the "KanflowWatchdog" scheduled task. Run as administrator.

.DESCRIPTION
Runs ops\watchdog\watchdog-kanflow.ps1 every -IntervalMin minutes (default 5)
as SYSTEM (needed to stop/start the kanflow.exe service and kill orphan
listeners). Replaces the legacy task that restarted the "KanflowApp"
scheduled task. Also removes the legacy "KanflowApp" task if it still exists
(-KeepLegacyAppTask to skip), because running both would fight over port 3000.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\watchdog\register-watchdog-task.ps1
#>
[CmdletBinding()]
param(
    [string]$TaskName = "KanflowWatchdog",
    [ValidateRange(1, 60)][int]$IntervalMin = 5,
    [switch]$KeepLegacyAppTask
)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

if (-not (Test-IsAdministrator)) {
    Write-Host "[ERROR] Run this script from an elevated PowerShell (Run as administrator)." -ForegroundColor Red
    exit 1
}
if (-not (Get-Service -Name "kanflow.exe" -ErrorAction SilentlyContinue)) {
    Write-Host "[WARN] service 'kanflow.exe' not found - install it first (setup\install-kanflow-service.bat)." -ForegroundColor Yellow
}

$script = Join-Path $PSScriptRoot "watchdog-kanflow.ps1"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory (Get-KanflowRoot)
# Start 1 minute from now, repeat forever (omitting RepetitionDuration = indefinitely).
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMin)
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] existing task '$TaskName' removed"
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trigger, $bootTrigger) -Settings $settings `
    -Principal $principal -Description "Kanflow watchdog: probes /api/health, restarts service kanflow.exe on 2 consecutive failures. Log: ops\logs\watchdog.log" | Out-Null
Write-Host "[OK] '$TaskName' registered: every $IntervalMin min + at startup, as SYSTEM"

if (-not $KeepLegacyAppTask -and (Get-ScheduledTask -TaskName "KanflowApp" -ErrorAction SilentlyContinue)) {
    Stop-ScheduledTask -TaskName "KanflowApp" -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "KanflowApp" -Confirm:$false
    Write-Host "[OK] legacy task 'KanflowApp' removed (the app runs as service kanflow.exe)"
}

Write-Host "     Log         : $(Join-Path (Get-KanflowRoot) 'ops\logs\watchdog.log')  (quiet while healthy)"
Write-Host "     Pause       : create file $(Join-Path $PSScriptRoot 'MAINTENANCE')  (ignored after 6h)"
Write-Host "     Status      : Get-ScheduledTaskInfo -TaskName $TaskName"
exit 0
