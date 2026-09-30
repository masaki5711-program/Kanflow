@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - Install the web app as Windows Service via node-windows
REM Run as administrator. Idempotent - safe to re-run.
REM
REM Why node-windows:
REM   - schtasks-based persistence kept being killed by user-session
REM     events (^C in service.log even though /RU SYSTEM was set).
REM   - pm2-windows-service is deprecated.
REM   - node-windows produces a real Windows Service (LocalSystem, no
REM     console attachment) with crash-restart.
REM
REM Steps:
REM   1. Remove the legacy "KanflowApp" scheduled task / pm2 leftovers.
REM      (The "KanflowWatchdog" task is NOT touched any more.)
REM   2. Check node-windows is present in app\node_modules
REM      (this script no longer runs "npm install" on the server - the
REM      dependency tree is only changed by the deploy procedure).
REM   3. Old wrapper in node_modules\next\dist\bin\daemon present?
REM        -> ops\web\migrate-service-wrapper.ps1 (verified move + rollback)
REM      Otherwise register "kanflow.exe" with its wrapper in
REM      ops\web\daemon (setup-windows-service.js) and start it.
REM   4. Verify port 3000 LISTENING.
REM -----------------------------------------------------------------

echo ============================================
echo   Kanflow Windows Service Installer
echo ============================================
echo.

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
REM node-windows registers display name "Kanflow" with service id "kanflow.exe"
set "SERVICE_NAME=kanflow.exe"
set "DAEMON_DIR=%PROJECT_ROOT%\ops\web\daemon"
set "LEGACY_DAEMON_DIR=%APP_DIR%\node_modules\next\dist\bin\daemon"
set "INSTALL_SCRIPT=%APP_DIR%\setup-windows-service.js"
set "MIGRATE_PS1=%PROJECT_ROOT%\ops\web\migrate-service-wrapper.ps1"

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Install script not found: %INSTALL_SCRIPT%
    pause
    exit /b 1
)

REM --- 1. Legacy persistence mechanisms ---
echo [Step 1/4] Removing legacy KanflowApp task / pm2 leftovers...
schtasks /End /TN "KanflowApp" >nul 2>&1
schtasks /Delete /TN "KanflowApp" /F >nul 2>&1
call pm2 kill >nul 2>&1
echo   [OK]  (KanflowWatchdog task left as is)
echo.

REM --- 2. node-windows present? ---
echo [Step 2/4] Checking node-windows in app\node_modules...
if not exist "%APP_DIR%\node_modules\node-windows\package.json" (
    echo [ERROR] node-windows is missing. It is a devDependency of app\package.json:
    echo         cd %APP_DIR% ^&^& npm ci      ^(during a maintenance window, see docs\operations\deploy.md^)
    pause
    exit /b 1
)
echo   [OK]
echo.

REM --- 3. Register / migrate ---
if exist "%LEGACY_DAEMON_DIR%\kanflow.xml" (
    echo [Step 3/4] Old wrapper found in node_modules - migrating to ops\web\daemon...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MIGRATE_PS1%"
    if !errorlevel! neq 0 (
        echo [ERROR] Migration failed and was rolled back - see ops\logs\deploy.log
        pause
        exit /b 1
    )
    goto verify
)

echo [Step 3/4] Registering "%SERVICE_NAME%" (wrapper in %DAEMON_DIR%)...
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    if not exist "%DAEMON_DIR%\kanflow.xml" (
        echo [ERROR] Service "%SERVICE_NAME%" exists but its wrapper is in neither
        echo         %DAEMON_DIR% nor %LEGACY_DAEMON_DIR%.
        echo         Remove it first:  sc stop %SERVICE_NAME% ^&^& sc delete %SERVICE_NAME%
        pause
        exit /b 1
    )
)
REM Free port %PORT% only if something other than the service holds it.
sc query "%SERVICE_NAME%" | findstr /C:"RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
        echo   killing leftover PID %%P on port %PORT%
        taskkill /F /PID %%P >nul 2>&1
    )
)
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

:verify
REM --- 4. Verify port %PORT% LISTENING ---
echo [Step 4/4] Verifying port %PORT% (allowing 20s for first start)...
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
    echo                 type %DAEMON_DIR%\kanflow.err.log
)
echo.

echo ============================================
echo   Windows Service installation complete
echo ============================================
echo.
echo   Service:     %SERVICE_NAME%        (sc query %SERVICE_NAME%^)
echo   Run As:      LocalSystem, auto-start, crash-restart by the wrapper
echo   Wrapper:     %DAEMON_DIR%   (outside node_modules)
echo   Logs:        %DAEMON_DIR%\kanflow.out.log / kanflow.err.log
echo.
echo   Manage:
echo     recover.bat                -- robust restart (kills orphan :3000 listener)
echo     ops\status.ps1             -- services, health, worker, backlog, backups
echo.
echo   Watchdog (once):  setup\install-watchdog.bat
echo   Uninstall:        cd %APP_DIR% ^&^& node uninstall-windows-service.js
echo.
pause
exit /b 0
