@echo off
REM Kanflow watchdog — runs every 5 minutes via scheduled task.
REM Restarts KanflowApp scheduled task when:
REM   (a) port 3000 is not LISTENING, OR
REM   (b) port is LISTENING but HTTP health endpoint does not return 200
REM       (catches hung node.exe where the port stays bound).

set "LOG=D:\APP\Kanflow\watchdog.log"
set "PORT=3000"
set "HEALTH_URL=http://localhost:3000/api/auth/csrf"

REM --- Step 1: port check ---
REM Filter to LISTENING lines first, then look for :PORT followed by a space.
REM Using /C: keeps the pattern literal so findstr does not split on the space.
set "PORT_UP=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "PORT_UP=1"
)

if "%PORT_UP%"=="0" (
    echo [%DATE% %TIME%] Port %PORT% not LISTENING. Triggering KanflowApp restart. >> "%LOG%"
    goto restart
)

REM --- Step 2: HTTP health check (10s timeout) ---
REM curl returns 0 on HTTP 2xx/3xx; non-zero or HTTP 5xx -> restart.
curl -s -f --max-time 10 -o nul "%HEALTH_URL%"
if %errorlevel% equ 0 (
    REM Healthy — exit silently to avoid log bloat
    exit /b 0
)
echo [%DATE% %TIME%] Port %PORT% LISTENING but health check failed (errorlevel=%ERRORLEVEL%). Triggering KanflowApp restart. >> "%LOG%"

:restart
REM End any stuck task instance first (ignore failure)
schtasks /End /TN "KanflowApp" >nul 2>&1

REM Re-run the main task
schtasks /Run /TN "KanflowApp" >> "%LOG%" 2>&1

REM Wait a bit and verify
timeout /t 8 /nobreak >nul

set "PORT_UP=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "PORT_UP=1"
)

if "%PORT_UP%"=="1" (
    echo [%DATE% %TIME%] Recovered: port %PORT% is LISTENING. >> "%LOG%"
) else (
    echo [%DATE% %TIME%] Restart attempted but port %PORT% still not LISTENING. >> "%LOG%"
)

exit /b 0
