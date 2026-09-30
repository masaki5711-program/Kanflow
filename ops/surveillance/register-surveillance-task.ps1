<#
.SYNOPSIS
Register (or re-register) the "KanflowAiSurveillance" scheduled task. Run as administrator.

.DESCRIPTION
Daily run of ops\surveillance\run-ai-surveillance.ps1 at -Time.
Default 06:30: finishes before the 08:00 start of work, so the local LLM is
free again for interactive use. Use -Time 19:00 for an evening run instead.
Avoid 02:30 (backup) and the 08:00-17:00 working hours.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\surveillance\register-surveillance-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\surveillance\register-surveillance-task.ps1 -Time 19:00
#>
[CmdletBinding()]
param(
    [ValidatePattern('^\d{2}:\d{2}$')][string]$Time = "06:30",
    [string]$TaskName = "KanflowAiSurveillance"
)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

if (-not (Test-IsAdministrator)) {
    Write-Host "[ERROR] Run this script from an elevated PowerShell (Run as administrator)." -ForegroundColor Red
    exit 1
}
$hour = [int]$Time.Substring(0, 2)
if ($hour -ge 8 -and $hour -lt 17) {
    Write-Host "[WARN] $Time is inside working hours - the LLM run will slow down users' AI requests." -ForegroundColor Yellow
}

$script = Join-Path $PSScriptRoot "run-ai-surveillance.ps1"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory (Get-KanflowRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] existing task '$TaskName' removed"
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Kanflow AI surveillance (anomaly checks + local LLM investigation). Log: ops\logs\surveillance.log" | Out-Null

Write-Host "[OK] '$TaskName' registered: daily at $Time"
Write-Host "     Manual run: ops\surveillance\run-ai-surveillance.bat /interactive"
exit 0
