<#
.SYNOPSIS
Register (or re-register) the daily Kanflow backup scheduled task. Run as administrator.

.DESCRIPTION
Creates task "KanflowBackup" that runs ops\backup\backup-kanflow.ps1 daily at
-Time (default 02:30). By default the task runs as SYSTEM, which is fine for a
local/USB destination (E:\...). SYSTEM authenticates to the network as the
computer account, so for a NAS/UNC destination pass -RunAsUser with a
domain/service account that can write to the share (you will be prompted for
its password; it is stored by Task Scheduler, not by this script).

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1 -Destination F:\KanflowBackup -Time 03:00
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1 -Destination \\nas01\backup\kanflow -RunAsUser YMMA\svc-kanflow
#>
[CmdletBinding()]
param(
    [string]$Destination = $(if ($env:KANFLOW_BACKUP_DIR) { $env:KANFLOW_BACKUP_DIR } else { "E:\KanflowBackup" }),
    [ValidatePattern('^\d{2}:\d{2}$')][string]$Time = "02:30",
    [string]$TaskName = "KanflowBackup",
    [string]$RunAsUser,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

if (-not (Test-IsAdministrator)) {
    Write-Host "[ERROR] Run this script from an elevated PowerShell (Run as administrator)." -ForegroundColor Red
    exit 1
}

$script = Join-Path $PSScriptRoot "backup-kanflow.ps1"
if (-not (Test-Path -LiteralPath $script)) { Write-Host "[ERROR] not found: $script" -ForegroundColor Red; exit 1 }
if ($Destination -match '"') { Write-Host "[ERROR] invalid destination" -ForegroundColor Red; exit 1 }

$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`" -Destination `"$Destination`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory (Get-KanflowRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew `
    -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] existing task '$TaskName' removed"
}

$description = "Kanflow daily backup (MySQL dump + app\private + app\.env) to $Destination. Log: ops\logs\backup.log"
if ($RunAsUser) {
    $cred = Get-Credential -UserName $RunAsUser -Message "Password for the backup task account (needs write access to $Destination)"
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest -Description $description | Out-Null
} else {
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Principal $principal -Description $description | Out-Null
}

Write-Host "[OK] '$TaskName' registered: daily at $Time -> $Destination"
Write-Host "     Run now : Start-ScheduledTask -TaskName $TaskName"
Write-Host "     Status  : Get-ScheduledTaskInfo -TaskName $TaskName   (LastTaskResult 0 = OK)"
Write-Host "     Log     : $(Join-Path (Get-KanflowRoot) 'ops\logs\backup.log')"

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "[INFO] started; follow the log above"
}
exit 0
