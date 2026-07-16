@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - Install as Windows Service via node-windows
REM Run as administrator. Idempotent - safe to re-run anytime.
REM
REM Why this script exists:
REM   - schtasks-based persistence kept being killed by user-session
REM     events (^C in service.log even though /RU SYSTEM was set).
REM   - pm2-windows-service is deprecated and its CLI is not exposed
REM     on PATH after npm -g install on this host.
REM   - node-windows is maintained, installs locally into app/, and
REM     produces a real Windows Service that runs as LocalSystem with
REM     no console attachment.
REM
REM Steps:
REM   1. Tear down old KanflowApp / KanflowWatchdog scheduled tasks
REM      and any pm2 leftover.
REM   2. Kill any process holding port 3000.
REM   3. Install node-windows into app/ as devDependency.
REM   4. Run setup-windows-service.js to register the "Kanflow"
REM      Windows Service and start it.
REM   5. Verify port 3000 LISTENING.
REM -----------------------------------------------------------------

echo ============================================
echo   Kanflow Windows Service Installer
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
set "PORT=3000"
set "SERVICE_NAME=Kanflow"
set "INSTALL_SCRIPT=%APP_DIR%\setup-windows-service.js"

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Install script not found: %INSTALL_SCRIPT%
    pause
    exit /b 1
)
if not exist "%APP_DIR%\package.json" (
    echo [ERROR] app\package.json not found at %APP_DIR%
    pause
    exit /b 1
)

REM --- 1. Tear down old persistence mechanisms ---
echo [Step 1/5] Removing old KanflowApp / KanflowWatchdog tasks...
schtasks /End /TN "KanflowApp" >nul 2>&1
schtasks /Delete /TN "KanflowApp" /F >nul 2>&1
schtasks /End /TN "KanflowWatchdog" >nul 2>&1
schtasks /Delete /TN "KanflowWatchdog" /F >nul 2>&1
REM Stop any PM2 daemon process (leftover from the earlier failed PM2 install).
call pm2 kill >nul 2>&1
REM Remove any half-installed Kanflow service (so re-running this script
REM is safe even if a previous run partially succeeded).
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [INFO] Service "%SERVICE_NAME%" already exists. Removing first...
    sc stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    pushd "%APP_DIR%"
    if exist node_modules\node-windows (
        call node "%APP_DIR%\uninstall-windows-service.js" >nul 2>&1
    )
    popd
    sc delete "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)
echo   [OK]
echo.

REM --- 2. Kill any leftover process holding port %PORT% ---
echo [Step 2/5] Killing leftover process on port %PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    echo   killing PID %%P
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo   [OK]
echo.

REM --- 3. Install node-windows into app/ ---
echo [Step 3/5] Installing node-windows into app/ (local dev dependency)...
pushd "%APP_DIR%"
call npm install node-windows --save-dev --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERROR] npm install node-windows failed.
    popd
    pause
    exit /b 1
)
popd
echo   [OK]
echo.

REM --- 4. Register and start the Kanflow Windows Service ---
echo [Step 4/5] Registering "%SERVICE_NAME%" Windows Service...
pushd "%APP_DIR%"
call node "%INSTALL_SCRIPT%"
if %errorlevel% neq 0 (
    echo [ERROR] Service install script failed.
    popd
    pause
    exit /b 1
)
popd
echo.

REM --- 5. Verify port %PORT% LISTENING ---
echo [Step 5/5] Verifying port %PORT% (allowing 20s for first start)...
timeout /t 20 /nobreak >nul
set "PORT_UP=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "PORT_UP=1"
    set "APP_PID=%%P"
)

if "%PORT_UP%"=="1" (
    echo   [OK] Port %PORT% LISTENING (PID=%APP_PID%^)
) else (
    echo   [WARN] Port %PORT% NOT LISTENING after 20s.
    echo          Check: sc query %SERVICE_NAME%
    echo                 type %APP_DIR%\daemon\kanflow.out.log
    echo                 type %APP_DIR%\daemon\kanflow.err.log
)
echo.

echo ============================================
echo   Windows Service installation complete
echo ============================================
echo.
echo   Service:     %SERVICE_NAME%        (sc query %SERVICE_NAME%^)
echo   Auto-start:  Automatic         (boot)
echo   Run As:      LocalSystem       (no user session dependency)
echo   Restart:     Automatic on failure (handled by node-windows wrapper)
echo   Logs:        %APP_DIR%\daemon\kanflow.out.log
echo                %APP_DIR%\daemon\kanflow.err.log
echo.
echo   Manage:
echo     sc query   %SERVICE_NAME%   -- status
echo     sc start   %SERVICE_NAME%   -- start
echo     sc stop    %SERVICE_NAME%   -- stop
echo     sc qfailureflag %SERVICE_NAME%   -- view recovery actions
echo.
echo   Uninstall:
echo     cd %APP_DIR%
echo     node uninstall-windows-service.js
echo.
pause
exit /b 0
