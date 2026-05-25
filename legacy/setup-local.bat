@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   Scrum Tool (KanFlow) - Local Setup
echo   (No Docker required)
echo ============================================
echo.

REM -----------------------------------------------
REM 1. Prerequisites check
REM -----------------------------------------------
echo [1/7] Checking prerequisites...

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed.
    echo         https://git-scm.com/downloads
    goto :error
)
echo   [OK] Git

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo         https://nodejs.org/ v20+
    goto :error
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo   [OK] Node.js %NODE_VER%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed.
    goto :error
)
echo   [OK] npm

where mysql >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] mysql command not found.
    echo        Make sure MySQL 8.0 is installed.
    echo        https://dev.mysql.com/downloads/installer/
    echo.
    pause
) else (
    echo   [OK] MySQL client
)

echo.

REM -----------------------------------------------
REM 2. Port configuration
REM -----------------------------------------------
echo [2/7] Port configuration...
echo.

REM --- App port ---
set APP_PORT=3000
echo   Default app port: %APP_PORT%

netstat -an | findstr ":3000 .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [WARN] Port 3000 is already in use!
    set APP_PORT=3001
    netstat -an | findstr ":3001 .*LISTENING" >nul 2>&1
    if !errorlevel! equ 0 (
        set APP_PORT=3002
        netstat -an | findstr ":3002 .*LISTENING" >nul 2>&1
        if !errorlevel! equ 0 set APP_PORT=3003
    )
    echo   [INFO] Suggested free port: !APP_PORT!
)

set /p INPUT_APP_PORT="  App port [!APP_PORT!]: "
if not "!INPUT_APP_PORT!"=="" set APP_PORT=!INPUT_APP_PORT!

netstat -an | findstr ":!APP_PORT! .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [ERROR] Port !APP_PORT! is in use. Choose another port.
    goto :error
)
echo   [OK] App port: !APP_PORT!
echo.

REM --- MySQL port ---
set DB_PORT=3306
echo   Default MySQL port: %DB_PORT%

set /p INPUT_DB_PORT="  MySQL port [!DB_PORT!]: "
if not "!INPUT_DB_PORT!"=="" set DB_PORT=!INPUT_DB_PORT!
echo   [OK] MySQL port: !DB_PORT!
echo.

REM -----------------------------------------------
REM 3. Clone repository
REM -----------------------------------------------
echo [3/7] Getting repository...

set REPO_URL=https://gitlab.scm.service.infosys.yamaha.com/ymma/stragegic-planning/appications/kanflow.git
set APP_DIR=kanflow

if exist "%APP_DIR%\.git" (
    echo   Already cloned. Pulling latest...
    pushd "%APP_DIR%"
    git pull origin main
    popd
) else if exist "%APP_DIR%" (
    echo [ERROR] %APP_DIR% folder exists but is not a git repo.
    goto :error
) else (
    git clone %REPO_URL% %APP_DIR%
)

if %errorlevel% neq 0 (
    echo [ERROR] Failed to get repository.
    goto :error
)
echo   [OK] Repository ready
echo.

REM -----------------------------------------------
REM 4. MySQL database setup
REM -----------------------------------------------
echo [4/7] Setting up MySQL database...
echo.
echo   Enter MySQL root password:
echo.

set /p MYSQL_ROOT_PW="  MySQL root password: "

echo   Creating database and user...

set "CHARS=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
call :generate_password APP_DB_PW

mysql -u root -p%MYSQL_ROOT_PW% -P !DB_PORT! -e "CREATE DATABASE IF NOT EXISTS scrum_tool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to connect to MySQL.
    echo         Check MySQL is running and password/port is correct.
    goto :error
)

mysql -u root -p%MYSQL_ROOT_PW% -P !DB_PORT! -e "CREATE USER IF NOT EXISTS 'scrum_app'@'localhost' IDENTIFIED BY '!APP_DB_PW!';" 2>nul
mysql -u root -p%MYSQL_ROOT_PW% -P !DB_PORT! -e "GRANT ALL PRIVILEGES ON scrum_tool.* TO 'scrum_app'@'localhost'; FLUSH PRIVILEGES;" 2>nul

echo   [OK] Database: scrum_tool
echo   [OK] User: scrum_app
echo.

REM -----------------------------------------------
REM 5. Generate .env
REM -----------------------------------------------
pushd "%APP_DIR%\app"

echo [5/7] Generating .env file...

call :generate_password NEXTAUTH_SEC1
call :generate_password NEXTAUTH_SEC2

(
    echo DATABASE_URL=mysql://scrum_app:!APP_DB_PW!@localhost:!DB_PORT!/scrum_tool
    echo DATABASE_HOST=localhost
    echo DATABASE_PORT=!DB_PORT!
    echo DATABASE_USER=scrum_app
    echo DATABASE_PASSWORD=!APP_DB_PW!
    echo DATABASE_NAME=scrum_tool
    echo NEXTAUTH_URL=http://localhost:!APP_PORT!
    echo NEXTAUTH_SECRET=!NEXTAUTH_SEC1!!NEXTAUTH_SEC2!
    echo NEXT_PUBLIC_COLLABORA_URL=http://localhost:9980
    echo APP_EXTERNAL_URL=http://localhost:!APP_PORT!
) > .env

echo   [OK] .env generated (App=!APP_PORT!, MySQL=!DB_PORT!)
echo.

REM -----------------------------------------------
REM 6. npm install and Prisma setup
REM -----------------------------------------------
echo [6/7] Installing dependencies...
echo   (This may take a few minutes...)
echo.

call npm ci
if %errorlevel% neq 0 (
    echo [ERROR] npm ci failed.
    goto :error_pop
)
echo   [OK] npm packages installed

echo.
echo   Generating Prisma client...
call npx prisma generate --schema=prisma/schema.prisma
if %errorlevel% neq 0 (
    echo [ERROR] Prisma generate failed.
    goto :error_pop
)
echo   [OK] Prisma client generated

echo.
echo   Running database migrations...
call npx prisma migrate deploy --schema=prisma/schema.prisma
if %errorlevel% neq 0 (
    echo [ERROR] Prisma migrate failed.
    echo         Make sure MySQL is running.
    goto :error_pop
)
echo   [OK] Migrations complete
echo.

REM -----------------------------------------------
REM 7. Start app
REM -----------------------------------------------
echo [7/7] Starting application...
echo.

echo ============================================
echo   Setup complete!
echo ============================================
echo.
echo   App:   http://localhost:!APP_PORT!
echo   MySQL: localhost:!DB_PORT!
echo.
echo   Starting dev server...
echo   (Press Ctrl+C to stop)
echo ============================================
echo.

call npm run dev -- -p !APP_PORT!

popd
endlocal
exit /b 0

REM ===============================================
REM Subroutines
REM ===============================================

:generate_password
set "_pw="
for /L %%i in (1,1,16) do (
    set /a "_idx=!random! %% 62"
    for %%j in (!_idx!) do set "_pw=!_pw!!CHARS:~%%j,1!"
)
set "%1=!_pw!"
exit /b

:error_pop
popd
:error
echo.
echo Setup failed. Check the errors above.
endlocal
pause
exit /b 1
