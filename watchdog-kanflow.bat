@echo off
REM ---------------------------------------------------------------------
REM Kanflow watchdog - thin wrapper kept at this path so an existing
REM "KanflowWatchdog" scheduled task pointing here keeps working.
REM Logic lives in ops\watchdog\watchdog-kanflow.ps1:
REM   probe http://127.0.0.1:3000/api/health (2 consecutive failures)
REM   -> start MySQL if it is down, else robust restart of service kanflow.exe
REM Log: ops\logs\watchdog.log   Pause: create ops\watchdog\MAINTENANCE
REM Re-register the task: ops\watchdog\register-watchdog-task.ps1 (admin)
REM ---------------------------------------------------------------------
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0ops\watchdog\watchdog-kanflow.ps1" %*
exit /b %errorlevel%
