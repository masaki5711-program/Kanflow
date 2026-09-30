@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - Install PM2 as a Windows Service
REM Run as administrator. Idempotent - safe to re-run anytime.
REM
REM Why this script exists:
REM   The schtasks-based wrapper kept being killed by something in the
REM   corporate Windows session (^C events in service.log even though
REM   /RU SYSTEM was specified). The task ended up with
REM   "Logon Mode: Interactive/Background" instead of pure Background,
REM   exposing it to user-session events.
REM
REM   PM2 + pm2-windows-service installs a real Windows Service that
REM   runs the PM2 daemon as LocalSystem. PM2 then supervises the
REM   kanflow Next.js process with its own crash-restart loop. This is
REM   fully decoupled from any user session.
REM
REM Steps:
REM   1. Tear down old KanflowApp / KanflowWatchdog scheduled tasks
REM   2. Kill any process holding port 3000
REM   3. npm install -g pm2 pm2-windows-service
REM   4. Install PM2 as Windows Service "PM2" (unattended)
REM   5. Start kanflow via ecosystem.config.js
REM   6. pm2 save  (so the service resurrects kanflow on next start)
REM   7. Verify port 3000 LISTENING
REM -----------------------------------------------------------------

echo ============================================
echo   Kanflow PM2 Service Installer
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

set "PROJECT_ROOT=D:\APP\Kanflow"
set "APP_DIR=%PROJECT_ROOT%\app"
set "ECOSYSTEM=%PROJECT_ROOT%\ecosystem.config.js"
set "PORT=3000"
set "PM2_SERVICE_NAME=PM2"

if not exist "%ECOSYSTEM%" (
    echo [ERROR] ecosystem.config.js not found: %ECOSYSTEM%
    pause
    exit /b 1
)

REM --- 1. Tear down old scheduled tasks ---
echo [Step 1/7] Removing old KanflowApp / KanflowWatchdog tasks...
schtasks /End /TN "KanflowApp" >nul 2>&1
schtasks /Delete /TN "KanflowApp" /F >nul 2>&1
schtasks /End /TN "KanflowWatchdog" >nul 2>&1
schtasks /Delete /TN "KanflowWatchdog" /F >nul 2>&1
echo   [OK]
echo.

REM --- 2. Kill any leftover process holding port %PORT% ---
echo [Step 2/7] Killing leftover process on port %PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    echo   killing PID %%P
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo   [OK]
echo.

REM --- 3. Install pm2 and pm2-windows-service ---
echo [Step 3/7] Installing pm2 and pm2-windows-service (npm -g)...
call npm install -g pm2 pm2-windows-service
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo   [OK]
echo.

REM --- 4. Install PM2 as Windows Service ---
echo [Step 4/7] Installing PM2 as Windows Service "%PM2_SERVICE_NAME%"...
REM Check if already installed
sc query "%PM2_SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [INFO] Service "%PM2_SERVICE_NAME%" already exists. Removing first...
    call pm2-service-uninstall >nul 2>&1
    timeout /t 3 /nobreak >nul
)
REM --unattended skips the interactive PM2_HOME / user / password prompts
call pm2-service-install --unattended -n "%PM2_SERVICE_NAME%"
if %errorlevel% neq 0 (
    echo [WARN] --unattended flag rejected. Retrying interactively.
    echo        Accept defaults at each prompt (just press Enter).
    pause
    call pm2-service-install -n "%PM2_SERVICE_NAME%"
)
echo   [OK] Service installed
echo.

REM --- 5. Wait for service to come online, then start kanflow ---
echo [Step 5/7] Waiting for PM2 service to be ready, then starting kanflow...
timeout /t 5 /nobreak >nul
call pm2 start "%ECOSYSTEM%"
if %errorlevel% neq 0 (
    echo [ERROR] pm2 start failed. Check pm2 logs.
    pause
    exit /b 1
)
echo   [OK]
echo.

REM --- 6. Save process list so PM2 resurrects on next service start ---
echo [Step 6/7] Saving PM2 process list...
call pm2 save
echo   [OK]
echo.

REM --- 7. Verify port %PORT% LISTENING ---
echo [Step 7/7] Verifying port %PORT%...
timeout /t 12 /nobreak >nul
set "PORT_UP=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "PORT_UP=1"
    set "APP_PID=%%P"
)

if "%PORT_UP%"=="1" (
    echo   [OK] Port %PORT% LISTENING (PID=%APP_PID%^)
) else (
    echo   [WARN] Port %PORT% NOT LISTENING after 12s.
    echo          Check: pm2 logs kanflow
)
echo.

echo ============================================
echo   PM2 Service installation complete
echo ============================================
echo.
echo   Windows Service: %PM2_SERVICE_NAME%       (sc query %PM2_SERVICE_NAME%)
echo   PM2 process:     kanflow                  (pm2 status)
echo   PM2 stdout log:  %APP_DIR%\pm2-out.log
echo   PM2 stderr log:  %APP_DIR%\pm2-error.log
echo.
echo   Useful commands:
echo     pm2 status                 -- list managed processes
echo     pm2 logs kanflow           -- tail logs
echo     pm2 restart kanflow        -- manual restart
echo     pm2 reload ecosystem.config.js -- zero-downtime reload
echo     pm2 save                   -- persist process list after changes
echo.
echo   To uninstall:
echo     pm2 delete kanflow
echo     pm2 save
echo     pm2-service-uninstall
echo.
pause
exit /b 0
