@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   Scrum Tool (KanFlow) - Docker Setup
echo ============================================
echo.

REM -----------------------------------------------
REM 1. Prerequisites check
REM -----------------------------------------------
echo [1/5] Checking prerequisites...

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed.
    echo         https://git-scm.com/downloads
    goto :error
)
echo   [OK] Git

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed.
    echo         https://www.docker.com/products/docker-desktop/
    goto :error
)
echo   [OK] Docker

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Desktop is not running.
    echo         Start Docker Desktop and try again.
    goto :error
)
echo   [OK] Docker Desktop running
echo.

REM -----------------------------------------------
REM 2. Clone repository
REM -----------------------------------------------
echo [2/5] Getting repository...

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
REM 3. Generate .env
REM -----------------------------------------------
pushd "%APP_DIR%"

echo [3/5] Generating .env file...

if exist .env (
    echo   [OK] .env already exists (skip)
    goto :skip_env
)

if not exist .env.example (
    echo [ERROR] .env.example not found.
    goto :error_pop
)

set "CHARS=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
call :generate_password ROOT_PW
call :generate_password APP_PW
call :generate_password COLLABORA_PW
call :generate_password SECRET1
call :generate_password SECRET2

(
    echo MYSQL_ROOT_PASSWORD=!ROOT_PW!
    echo MYSQL_DATABASE=scrum_tool
    echo MYSQL_APP_USER=scrum_app
    echo MYSQL_APP_PASSWORD=!APP_PW!
    echo NEXTAUTH_URL=http://localhost:3000
    echo NEXTAUTH_SECRET=!SECRET1!!SECRET2!
    echo COLLABORA_ADMIN_USER=admin
    echo COLLABORA_ADMIN_PASSWORD=!COLLABORA_PW!
    echo NEXT_PUBLIC_COLLABORA_URL=http://localhost:9980
    echo APP_EXTERNAL_URL=http://scrum-app:3000
) > .env

echo   [OK] .env generated with random passwords
:skip_env
echo.

REM -----------------------------------------------
REM 4. Docker build and start
REM -----------------------------------------------
echo [4/5] Building and starting Docker containers...
echo   (First time may take several minutes...)
echo.

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Docker startup failed.
    echo         Run: docker compose logs
    goto :error_pop
)
echo.

REM -----------------------------------------------
REM 5. Health check
REM -----------------------------------------------
echo [5/5] Waiting for app to start...

set /a count=0
:wait_loop
if !count! geq 60 (
    echo   [WARN] Timeout. Check logs: docker compose logs app
    goto :done
)
docker compose logs app 2>&1 | findstr /c:"Ready in" >nul 2>&1
if %errorlevel% equ 0 (
    goto :ready
)
timeout /t 2 /nobreak >nul
set /a count+=2
echo   Waiting... (%count%s)
goto :wait_loop

:ready
echo   [OK] Application is ready!
echo.

:done
echo ============================================
echo   Setup complete!
echo ============================================
echo.
echo   App:       http://localhost:3000
echo   Collabora: http://localhost:9980
echo.
echo   Logs:      docker compose logs -f
echo   Stop:      docker compose down
echo   Restart:   docker compose up -d
echo ============================================

popd
endlocal
exit /b 0

REM -----------------------------------------------
REM Generate 16-char random password
REM -----------------------------------------------
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
