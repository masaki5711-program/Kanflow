@echo off
REM Kanflow recovery script — end + restart KanflowApp + show status
chcp 65001 >nul 2>&1

echo === [1/5] End KanflowApp ===
schtasks /End /TN "KanflowApp"
echo.

echo === [2/5] Wait 3s ===
timeout /t 3 /nobreak

echo === [3/5] Run KanflowApp ===
schtasks /Run /TN "KanflowApp"
echo.

echo === [4/5] Wait 8s for Next.js to start ===
timeout /t 8 /nobreak

echo === [5/5] Status ===
echo.
echo --- Port 3000 ---
netstat -ano | findstr ":3000"
echo.
echo --- service.log ---
type "D:\APP\Kanflow\app\service.log"
echo.

echo ============================================
echo Done. Look for "LISTENING" above.
echo ============================================
pause
