@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - Rebuild persistence (scheduled tasks + watchdog)
REM Run as administrator. Idempotent - safe to re-run anytime.
REM
REM Why this script exists:
REM   - Earlier KanflowApp task could be killed by user session events
REM     (^C in service.log proved a console interrupt was reaching it).
REM   - Earlier KanflowWatchdog had a findstr bug that always reported
REM     port 3000 as "up" so it never restarted a dead app.
REM
REM What this script does:
REM   1. Tear down existing KanflowApp / KanflowWatchdog tasks cleanly
REM   2. Kill any node.exe leftover that is holding port 3000
REM   3. Recreate KanflowApp with SYSTEM + HIGHEST + ONSTART
REM      (truly runs whether or not anyone is logged on - no console
REM      attachment, so Ctrl+C cannot reach it)
REM   4. Recreate KanflowWatchdog at 1-minute interval as SYSTEM HIGHEST
REM   5. Start KanflowApp immediately and verify port 3000 is LISTENING
REM -----------------------------------------------------------------

echo ============================================
echo   Kanflow Persistence Rebuild
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

set "APP_TASK=KanflowApp"
set "WATCHDOG_TASK=KanflowWatchdog"
set "WRAPPER=D:\APP\Kanflow\app\start-service.bat"
set "WATCHDOG=D:\APP\Kanflow\watchdog-kanflow.bat"
set "PORT=3000"

if not exist "%WRAPPER%" (
    echo [ERROR] Wrapper not found: %WRAPPER%
    pause
    exit /b 1
)
if not exist "%WATCHDOG%" (
    echo [ERROR] Watchdog not found: %WATCHDOG%
    pause
    exit /b 1
)

REM --- 1. Tear down existing tasks ---
echo [Step 1/5] Removing existing tasks...
schtasks /End /TN "%APP_TASK%" >nul 2>&1
schtasks /Delete /TN "%APP_TASK%" /F >nul 2>&1
schtasks /End /TN "%WATCHDOG_TASK%" >nul 2>&1
schtasks /Delete /TN "%WATCHDOG_TASK%" /F >nul 2>&1
echo   [OK] Tasks removed
echo.

REM --- 2. Kill any leftover process holding port 3000 ---
echo [Step 2/5] Killing leftover process on port %PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    echo   killing PID %%P
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo   [OK]
echo.

REM --- 3. Create KanflowApp task ---
REM   /SC ONSTART      - boot trigger (implies "run whether logged on or not")
REM   /RU SYSTEM       - LocalSystem, no user session attachment
REM   /RL HIGHEST      - elevated
REM   /NP              - no password required (only valid for SYSTEM)
echo [Step 3/5] Creating %APP_TASK% task (SYSTEM HIGHEST ONSTART)...
schtasks /Create /TN "%APP_TASK%" ^
    /TR "\"%WRAPPER%\"" ^
    /SC ONSTART ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create %APP_TASK% task.
    pause
    exit /b 1
)
echo   [OK]
echo.

REM --- 4. Create KanflowWatchdog task at 1-minute interval ---
echo [Step 4/5] Creating %WATCHDOG_TASK% task (every 1 min, SYSTEM HIGHEST)...
schtasks /Create /TN "%WATCHDOG_TASK%" ^
    /TR "\"%WATCHDOG%\"" ^
    /SC MINUTE /MO 1 ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create %WATCHDOG_TASK% task.
    pause
    exit /b 1
)
echo   [OK]
echo.

REM --- 5. Start app immediately and verify ---
echo [Step 5/5] Starting %APP_TASK% and verifying port %PORT%...
schtasks /Run /TN "%APP_TASK%" >nul
timeout /t 12 /nobreak >nul

set "PORT_UP=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "PORT_UP=1"
    set "APP_PID=%%P"
)

if "%PORT_UP%"=="1" (
    echo   [OK] Port %PORT% LISTENING (PID=%APP_PID%^)
) else (
    echo   [WARN] Port %PORT% NOT LISTENING yet.
    echo          The wrapper may need a few more seconds, or check:
    echo            type D:\APP\Kanflow\app\service.log
)
echo.

echo ============================================
echo   Persistence rebuild complete
echo ============================================
echo.
echo   App task:     %APP_TASK%        (sc query unavailable for tasks; use schtasks /Query /TN %APP_TASK% /V)
echo   Watchdog:     %WATCHDOG_TASK%   (runs every 1 min, fixes downtime within ~60s)
echo   Wrapper log:  D:\APP\Kanflow\app\service.log
echo   Watchdog log: D:\APP\Kanflow\watchdog.log
echo.
echo   To uninstall: setup\uninstall-services.bat (as admin)
echo.
pause
exit /b 0
