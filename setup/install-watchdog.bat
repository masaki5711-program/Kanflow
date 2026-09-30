@echo off
REM -------------------------------------------------------------------
REM Kanflow watchdog installer (run as administrator).
REM Registers "KanflowWatchdog" (every 5 min + at startup, as SYSTEM):
REM probes /api/health and restarts service kanflow.exe after 2
REM consecutive failures. Also removes the legacy "KanflowApp" task.
REM Logic: ops\watchdog\register-watchdog-task.ps1
REM -------------------------------------------------------------------
setlocal
chcp 65001 >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This script must be run as Administrator.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\ops\watchdog\register-watchdog-task.ps1"
set "RC=%errorlevel%"
pause
exit /b %RC%
