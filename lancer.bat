@echo off
chcp 65001 >nul
title Contes et Dragons
cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY (where python >nul 2>nul && set PY=python)
if not defined PY (
  echo.
  echo  Python n'est pas installe.
  echo  Installe-le depuis https://www.python.org/downloads/
  echo  IMPORTANT : coche la case "Add python.exe to PATH" pendant l'installation.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo  Premiere installation, cela peut prendre une minute...
  %PY% -m venv .venv || goto erreur
)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto erreur
".venv\Scripts\python.exe" -m app
pause
exit /b 0

:erreur
echo.
echo  Une erreur est survenue pendant l'installation (voir ci-dessus).
pause
exit /b 1
