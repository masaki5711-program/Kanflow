@echo off
chcp 65001 >nul 2>&1
setlocal

REM -------------------------------------------------------------------
REM Kanflow watchdog installer — registers a scheduled task that checks
REM port 3000 every 5 minutes and restarts KanflowApp if it is down.
REM Run as administrator.
REM -------------------------------------------------------------------

echo ============================================
echo   Kanflow Watchdog Installer
echo ============================================
echo.

REM --- Admin check ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    pause
    exit /b 1
)
echo [OK] Running as administrator
echo.

set "WATCHDOG=D:\APP\Kanflow\watchdog-kanflow.bat"
set "TASK=KanflowWatchdog"

if not exist "%WATCHDOG%" (
    echo [ERROR] Watchdog script not found at: %WATCHDOG%
    pause
    exit /b 1
)

REM Remove existing task if any
schtasks /Query /TN "%TASK%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Existing %TASK% task found. Removing first...
    schtasks /Delete /TN "%TASK%" /F >nul 2>&1
)

REM Create scheduled task: run every 5 minutes, indefinitely, as SYSTEM
schtasks /Create /TN "%TASK%" ^
    /TR "\"%WATCHDOG%\"" ^
    /SC MINUTE /MO 5 ^
    /RU SYSTEM /RL HIGHEST /F >nul

if %errorlevel% neq 0 (
    echo [ERROR] Failed to create scheduled task.
    pause
    exit /b 1
)

REM Run once now to seed the watchdog log
schtasks /Run /TN "%TASK%" >nul 2>&1

echo [OK] Watchdog scheduled task '%TASK%' registered.
echo.
echo Watchdog runs every 5 minutes:
echo   - Checks if port 3000 is LISTENING
echo   - If down, ends and re-runs KanflowApp task
echo   - Logs to D:\APP\Kanflow\watchdog.log
echo.
echo To view: schtasks /Query /TN %TASK% /V /FO LIST
echo To remove: schtasks /Delete /TN %TASK% /F
echo.
pause
exit /b 0
