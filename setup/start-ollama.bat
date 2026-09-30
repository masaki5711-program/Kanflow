@echo off
rem Start (or restart) Ollama with the settings shared by Kanflow and BankMasalah.
rem Always launch Ollama through this file. Launching it from an old terminal
rem or from another app inherits stale environment variables (context 8192,
rem one resident model) and every app then reloads the model on each switch.
set OLLAMA_MAX_LOADED_MODELS=2
set OLLAMA_CONTEXT_LENGTH=12288
set OLLAMA_NUM_PARALLEL=2
set OLLAMA_KEEP_ALIVE=24h
set OLLAMA_FLASH_ATTENTION=1
taskkill /IM "ollama app.exe" /F >nul 2>&1
taskkill /IM ollama.exe /F >nul 2>&1
ping -n 4 127.0.0.1 >nul
start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
