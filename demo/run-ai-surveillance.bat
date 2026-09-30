@echo off
REM Moved to ops\surveillance\run-ai-surveillance.bat - this stub keeps the
REM demo shortcut working (interactive: pauses at the end).
call "%~dp0..\ops\surveillance\run-ai-surveillance.bat" /interactive
exit /b %errorlevel%
