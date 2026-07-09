@echo off
title dyntune
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden.
  echo Bitte zuerst installieren: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo Installiere Abhaengigkeiten, das dauert nur beim ersten Start ...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install ist fehlgeschlagen. Siehe Fehlermeldung oben.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starte dyntune ...
echo.
start "dyntune Server" cmd /k node server.js

timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/lead.html"

exit
