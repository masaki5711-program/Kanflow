@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - Windows Services Installer
REM   Run this file with "Run as administrator"
REM -----------------------------------------------------------------

echo ============================================
echo   Kanflow Windows Services Installer
echo ============================================
echo.

REM --- 1. Admin check ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo         Right-click install-services.bat and choose "Run as administrator".
    pause
    exit /b 1
)
echo [OK] Running as administrator
echo.

set "MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
set "MYSQL_INI=D:\APP\Kanflow\mysql-data\my.ini"
set "APP_DIR=D:\APP\Kanflow\app"
set "SVC_MYSQL=KanflowMySQL"
set "SVC_APP_TASK=KanflowApp"

if not exist "%MYSQL_BIN%" (
    echo [ERROR] mysqld.exe not found at: %MYSQL_BIN%
    pause
    exit /b 1
)
if not exist "%MYSQL_INI%" (
    echo [ERROR] my.ini not found at: %MYSQL_INI%
    pause
    exit /b 1
)

REM --- 2. Power settings (disable sleep + hibernate) ---
echo [Step 1/5] Disabling sleep and hibernate...
powercfg -change -standby-timeout-ac 0 >nul
powercfg -change -standby-timeout-dc 0 >nul
powercfg -change -hibernate-timeout-ac 0 >nul
powercfg -change -hibernate-timeout-dc 0 >nul
powercfg -change -disk-timeout-ac 0 >nul
powercfg -change -monitor-timeout-ac 0 >nul
powercfg -hibernate off >nul 2>&1
powercfg -setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 >nul 2>&1
powercfg -setactive SCHEME_CURRENT >nul 2>&1
echo   [OK] Sleep/hibernate disabled on AC power
echo.

REM --- 3. Stop any running manual processes on 3306 / 3000 ---
REM NOTE: this kills whatever serves port 3000 (incl. the kanflow.exe service
REM child) - run only during initial setup / maintenance.
echo [Step 2/5] Stopping manual mysqld / node processes...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3306 .*LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 .*LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
echo   [OK] Old processes stopped
echo.

REM --- 4. Install MySQL service ---
echo [Step 3/5] Registering MySQL Windows service...
sc query %SVC_MYSQL% >nul 2>&1
if %errorlevel% equ 0 (
    echo   [INFO] Service %SVC_MYSQL% already exists. Removing first...
    sc stop %SVC_MYSQL% >nul 2>&1
    sc delete %SVC_MYSQL% >nul 2>&1
    timeout /t 2 /nobreak >nul
)

sc create %SVC_MYSQL% binPath= "\"%MYSQL_BIN%\" --defaults-file=\"%MYSQL_INI%\" %SVC_MYSQL%" DisplayName= "Kanflow MySQL 8.4" start= auto >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create MySQL service.
    pause
    exit /b 1
)
sc description %SVC_MYSQL% "MySQL server for Kanflow (auto-starts on boot)" >nul
sc failure %SVC_MYSQL% reset= 86400 actions= restart/5000/restart/10000/restart/30000 >nul
sc start %SVC_MYSQL% >nul
echo   [OK] MySQL service registered and started
echo.

REM Wait for MySQL to be ready
timeout /t 3 /nobreak >nul

REM --- 5. App process management ---
REM The app is NOT started from a scheduled task any more (legacy KanflowApp
REM task + app\start-service.bat were moved to legacy\schtasks\). It runs as
REM the node-windows Windows service "kanflow.exe" - install it with
REM setup\install-kanflow-service.bat, then the watchdog with
REM setup\install-watchdog.bat.
echo [Step 4/5] Removing legacy KanflowApp scheduled task (if any)...
schtasks /End /TN "%SVC_APP_TASK%" >nul 2>&1
schtasks /Delete /TN "%SVC_APP_TASK%" /F >nul 2>&1
echo   [OK] Next: run setup\install-kanflow-service.bat and setup\install-watchdog.bat
echo.

REM --- 6. Firewall rules (ensure port 3000 open) ---
echo [Step 5/5] Ensuring firewall rules...
netsh advfirewall firewall show rule name="Kanflow 3000" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Kanflow 3000" dir=in action=allow protocol=TCP localport=3000 >nul
    echo   [OK] Firewall rule for port 3000 added
) else (
    echo   [OK] Firewall rule already exists
)
echo.

echo ============================================
echo   Installation complete
echo ============================================
echo.
echo   MySQL service:  %SVC_MYSQL%      (sc query %SVC_MYSQL%)
echo   App service:    kanflow.exe      (install: setup\install-kanflow-service.bat)
echo.
echo   URL: http://localhost:3000
echo        http://pp-21.ymma.emi.yamaha.co.jp:3000 (LAN)
echo.
echo   To uninstall: run uninstall-services.bat as administrator
echo.
pause
exit /b 0
