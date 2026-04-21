@echo off
chcp 65001 >nul 2>&1

echo ============================================
echo   Kanflow Services Uninstaller
echo ============================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Run as administrator.
    pause
    exit /b 1
)

set "SVC_MYSQL=KanflowMySQL"
set "SVC_APP_TASK=KanflowApp"

echo Stopping and removing MySQL service...
sc stop %SVC_MYSQL% >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete %SVC_MYSQL% >nul 2>&1
echo   [OK]

echo Stopping and removing app task...
schtasks /End /TN "%SVC_APP_TASK%" >nul 2>&1
schtasks /Delete /TN "%SVC_APP_TASK%" /F >nul 2>&1
echo   [OK]

echo Killing any remaining node / mysqld...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3306 .*LISTENING"') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 .*LISTENING"') do taskkill /F /PID %%P >nul 2>&1
echo   [OK]

echo.
echo Uninstall complete.
pause
exit /b 0
