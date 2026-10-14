@echo off
setlocal
cd /d "%~dp0"
title Drone Analytics Studio

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo  Python 3.9 or newer is needed.
  echo  Download it from https://www.python.org/downloads/
  echo  IMPORTANT: tick "Add python.exe to PATH" during installation, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo  First run - setting things up. This needs internet once and takes 1-2 minutes...
  echo.
  %PY% -m venv .venv
  if errorlevel 1 ( echo Could not create the Python environment. & pause & exit /b 1 )
)

".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 ( echo. & echo  Installing requirements failed - check your internet connection. & pause & exit /b 1 )

".venv\Scripts\python.exe" studio.py %*
pause
