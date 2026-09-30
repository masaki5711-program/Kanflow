@echo off
REM =====================================================================
REM  Kanflow - AI Surveillance scheduled task installer (run as administrator)
REM  Registers "KanflowAiSurveillance": daily OFF-HOURS run (default 06:30,
REM  before the 08:00 start) of ops\surveillance\run-ai-surveillance.ps1.
REM    install-ai-surveillance.bat          -> 06:30
REM    install-ai-surveillance.bat 19:00    -> evening run
REM  Logic: ops\surveillance\register-surveillance-task.ps1
REM =====================================================================
setlocal
chcp 65001 >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Run as administrator.
    pause
    exit /b 1
)

set "TIME_ARG="
if not "%~1"=="" set "TIME_ARG=-Time %~1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\ops\surveillance\register-surveillance-task.ps1" %TIME_ARG%
set "RC=%errorlevel%"
pause
exit /b %RC%
