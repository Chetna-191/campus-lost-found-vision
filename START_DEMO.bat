@echo off
title Campus Lost and Found - One Click Launcher
color 0A
echo ========================================================
echo   CAMPUS LOST ^& FOUND - ONE-CLICK DEMO LAUNCHER
echo ========================================================
echo.

echo [1/3] Starting AI Microservice (Port 8000: YOLOv8 + CLIP)...
start "Campus Lost & Found - AI Microservice (Port 8000)" cmd /k "cd /d e:\PROJECTS\inhouse-fa\campus-lostfound-backend\ai-service && .\venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8000"

echo Waiting for AI models to initialize...
timeout /t 4 /nobreak >nul

echo.
echo [2/3] Starting Web Server (Port 5050: Node.js Express)...
start "Campus Lost & Found - Web Server (Port 5050)" cmd /k "cd /d e:\PROJECTS\inhouse-fa\campus-lostfound-backend && node server.js"

echo Waiting for Web Server to start...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Launching Web Browser at http://localhost:5050...
start http://localhost:5050

echo.
echo ========================================================
echo   SUCCESS! The site is now open in your browser.
echo   Keep the two black terminal windows open during presentation.
echo ========================================================
echo.
pause
