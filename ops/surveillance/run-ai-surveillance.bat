@echo off
REM =====================================================================
REM  Kanflow AI Surveillance - one run (scheduled task or manual).
REM  Reads SURVEILLANCE_TOKEN from app\.env (never hardcoded / printed)
REM  and POSTs /api/surveillance. Log: ops\logs\surveillance.log
REM
REM    run-ai-surveillance.bat                non-interactive (scheduler)
REM    run-ai-surveillance.bat /interactive   pause at the end (manual/demo)
REM
REM  Schedule: off-hours (06:30 default) - see
REM    ops\surveillance\register-surveillance-task.ps1
REM =====================================================================
setlocal
chcp 65001 >nul 2>&1
set "INTERACTIVE="
if /i "%~1"=="/interactive" set "INTERACTIVE=1"
if /i "%~1"=="-i" set "INTERACTIVE=1"
if defined INTERACTIVE (
    title Kanflow AI Surveillance - manual run
    echo Starting AI surveillance run... (open demo\start-ai-monitor.bat to watch the AI live)
    echo.
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0run-ai-surveillance.ps1"
set "RC=%errorlevel%"

if defined INTERACTIVE (
    echo.
    if "%RC%"=="0" (echo Done. Reports ^(if any^) appear on each project dashboard.) else (echo FAILED with exit code %RC% - see ops\logs\surveillance.log)
    pause
)
exit /b %RC%
