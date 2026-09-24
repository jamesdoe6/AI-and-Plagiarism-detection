@echo off
REM Lancement Windows : crée l'environnement virtuel au 1er lancement, puis démarre.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Creation de l'environnement virtuel...
    python -m venv .venv || (echo Python introuvable. Installez Python 3.10+ & pause & exit /b 1)
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt || (pause & exit /b 1)
)
".venv\Scripts\python.exe" run.py %*
pause
