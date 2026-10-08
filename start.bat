@echo off
REM Windows launcher for the Node.js version: starts the local server and
REM opens the Discrete Math Toolkit in your default browser.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this computer.
  echo   Install the LTS build from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting the Discrete Math Toolkit...
node server.js --open
pause
