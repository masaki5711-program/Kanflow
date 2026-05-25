@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM -----------------------------------------------------------------
REM Kanflow - WSL2 + Rancher Desktop installer
REM   Right-click -> "Run as administrator"
REM -----------------------------------------------------------------

echo ============================================
echo   WSL2 + Rancher Desktop Installer
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Run this script as Administrator.
    pause
    exit /b 1
)
echo [OK] Admin OK
echo.

REM --- 1. WSL check ---
echo [Step 1/3] Checking WSL...
wsl --status >nul 2>&1
if %errorlevel% neq 0 (
    echo   [INFO] WSL not installed. Installing WSL2 + Ubuntu...
    wsl --install --no-launch
    if %errorlevel% neq 0 (
        echo [ERROR] WSL install failed.
        pause
        exit /b 1
    )
    echo.
    echo ============================================
    echo   WSL2 installed. REBOOT REQUIRED.
    echo ============================================
    echo   1. Reboot this PC now
    echo   2. After reboot, run this script AGAIN as admin
    echo      to continue with Rancher Desktop install
    echo.
    set /p DO_REBOOT="  Reboot now? (y/N): "
    if /i "!DO_REBOOT!"=="y" shutdown /r /t 10
    pause
    exit /b 0
) else (
    echo   [OK] WSL is installed
)
wsl --set-default-version 2 >nul 2>&1
echo   [OK] WSL2 set as default
echo.

REM --- 2. Install Rancher Desktop via winget ---
echo [Step 2/3] Installing Rancher Desktop...
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] winget not available. Install Rancher Desktop manually from:
    echo         https://rancherdesktop.io/
    pause
    exit /b 1
)

winget list --id SUSE.RancherDesktop --accept-source-agreements >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Rancher Desktop already installed
) else (
    echo   Downloading and installing Rancher Desktop...
    winget install --id SUSE.RancherDesktop --accept-package-agreements --accept-source-agreements --silent
    if %errorlevel% neq 0 (
        echo [ERROR] Rancher Desktop install failed.
        echo         Download manually: https://github.com/rancher-sandbox/rancher-desktop/releases/latest
        pause
        exit /b 1
    )
    echo   [OK] Rancher Desktop installed
)
echo.

REM --- 3. Final instructions ---
echo [Step 3/3] Setup instructions
echo.
echo ============================================
echo   Next steps (manual, one-time)
echo ============================================
echo.
echo   1. Launch "Rancher Desktop" from Start menu
echo   2. First-run wizard:
echo        - Container Engine: select "dockerd (moby)"   ^<-- IMPORTANT
echo        - Kubernetes: disable (uncheck)
echo        - Click "Accept"
echo   3. Wait 2-5 minutes for VM to provision
echo   4. Open CMD and run:
echo        docker version
echo      You should see Client and Server versions.
echo   5. Run start-collabora.bat in D:\APP\Kanflow
echo.
pause
exit /b 0
