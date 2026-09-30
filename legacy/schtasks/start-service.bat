@echo off
cd /d "D:\APP\Kanflow\app"
set NODE_ENV=production
set "LOG=D:\APP\Kanflow\app\service.log"
set "PORT=3000"

REM Mark wrapper start so we can detect cmd-wrapper kills (cmd ID = task instance)
echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo [%DATE% %TIME%] start-service.bat wrapper started (pid=%~n0) >> "%LOG%"
echo ============================================================ >> "%LOG%"

:loop

REM --- Port conflict pre-flight check (port %PORT%) ---
REM Filter to LISTENING lines first, then look for :PORT followed by a space.
REM Using /C: keeps the pattern literal so findstr does not split on the space.
set "HOLDER_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr /C:":%PORT% " 2^>nul') do (
    set "HOLDER_PID=%%P"
    goto :portheld
)
goto :portfree

:portheld
set "HOLDER_NAME=unknown"
for /f "tokens=1 delims=," %%N in ('tasklist /FI "PID eq %HOLDER_PID%" /FO CSV /NH 2^>nul') do (
    set "HOLDER_NAME=%%~N"
)
echo. >> "%LOG%"
echo *** [%DATE% %TIME%] WARN: Port %PORT% already LISTENING (PID=%HOLDER_PID% %HOLDER_NAME%). Waiting 10s before retry... *** >> "%LOG%"
timeout /t 10 /nobreak >nul
goto loop

:portfree
echo. >> "%LOG%"
echo --- [%DATE% %TIME%] Port %PORT% free. Spawning Next.js (npx next start) --- >> "%LOG%"
call npx next start -H 0.0.0.0 -p %PORT% >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo *** [%DATE% %TIME%] next exited (errorlevel=%ERRORLEVEL%), restarting in 5s... *** >> "%LOG%"
timeout /t 5 /nobreak >nul
goto loop
