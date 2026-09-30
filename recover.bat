@echo off
REM ---------------------------------------------------------------------
REM Kanflow manual recovery (double-click, then approve the UAC prompt).
REM Robust restart of the node-windows service "kanflow.exe":
REM   stop -> kill orphan node.exe still LISTENING on :3000 -> start
REM   -> verify a NEW listener PID and a healthy /api/health
REM Then shows service / port / health status and the daemon log tails.
REM
REM   recover.bat            restart + status (asks for elevation)
REM   recover.bat /status    status only, no restart
REM   recover.bat /nopause   do not wait for a key at the end
REM Logic: ops\watchdog\recover-kanflow.ps1
REM ---------------------------------------------------------------------
setlocal
chcp 65001 >nul 2>&1
set "PS1=%~dp0ops\watchdog\recover-kanflow.ps1"
set "EXTRA="
set "NOPAUSE="
for %%A in (%*) do (
    if /i "%%~A"=="/status" set "EXTRA=-StatusOnly"
    if /i "%%~A"=="/nopause" set "NOPAUSE=1"
)

if not defined EXTRA (
    net session >nul 2>&1
    if errorlevel 1 (
        echo Requesting administrator rights...
        if "%~1"=="" (
            powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
        ) else (
            powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
        )
        exit /b 0
    )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %EXTRA%
set "RC=%errorlevel%"
if not defined NOPAUSE pause
exit /b %RC%
