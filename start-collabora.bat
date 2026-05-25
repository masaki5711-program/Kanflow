@echo off
chcp 65001 >nul 2>&1

REM -----------------------------------------------------------------
REM  Kanflow - Start Collabora Online container
REM -----------------------------------------------------------------

echo ============================================
echo   Starting Collabora Online
echo ============================================
echo.

cd /d "%~dp0"

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] docker command not found.
    echo         Launch "Rancher Desktop" first and wait for it to be ready.
    pause
    exit /b 1
)

docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker daemon not reachable.
    echo         Open Rancher Desktop, make sure status is "Running"
    echo         and container engine is "dockerd (moby)".
    pause
    exit /b 1
)

echo [1/3] Pulling Collabora image (first run may take several minutes)...
docker pull collabora/code:latest
if %errorlevel% neq 0 (
    echo [ERROR] Failed to pull image.
    pause
    exit /b 1
)
echo.

echo [2/3] Starting Collabora container...
docker compose -f docker-compose-collabora.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start container.
    pause
    exit /b 1
)
echo.

echo [3/3] Waiting for Collabora to become ready...
set /a _tries=0
:wait_loop
set /a _tries+=1
timeout /t 3 /nobreak >nul
curl -s -o nul -w "" http://localhost:9980/hosting/discovery 2>nul
if %errorlevel% equ 0 goto ready
if %_tries% lss 30 goto wait_loop
echo   [WARN] Collabora still not responding after 90 seconds.
echo          Check:   docker logs kanflow-collabora
pause
exit /b 1

:ready
echo   [OK] Collabora is ready at http://localhost:9980
echo.
echo ============================================
echo   Collabora Online running
echo ============================================
echo.
echo   Discovery URL:  http://localhost:9980/hosting/discovery
echo   Admin console:  http://localhost:9980/browser/dist/admin/admin.html
echo.
echo   Kanflow app:    http://localhost:3000
echo                   http://pp-21.ymma.emi.yamaha.co.jp:3000
echo.
echo   To stop:    docker compose -f docker-compose-collabora.yml stop
echo   To restart: docker compose -f docker-compose-collabora.yml restart
echo   Logs:       docker logs -f kanflow-collabora
echo.
pause
exit /b 0
