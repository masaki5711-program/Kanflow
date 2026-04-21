@echo off
cd /d "D:\APP\Kanflow\app"
set NODE_ENV=production
:loop
call npx next start -H 0.0.0.0 -p 3000 > "D:\APP\Kanflow\app\service.log" 2>&1
echo [%DATE% %TIME%] next exited, restarting in 5s... >> "D:\APP\Kanflow\app\service.log"
timeout /t 5 /nobreak >nul
goto loop
