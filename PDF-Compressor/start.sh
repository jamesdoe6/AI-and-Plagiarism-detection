#!/usr/bin/env bash
# Lancement macOS / Linux : crée l'environnement virtuel au 1er lancement, puis démarre.
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 est introuvable. Sur Ubuntu : sudo apt install python3 python3-venv python3-pip"
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "Création de l'environnement virtuel..."
  if ! python3 -m venv .venv; then
    rm -rf .venv
    echo
    echo "Le module venv est absent. Sur Ubuntu/Debian, lancez :"
    echo "    sudo apt install python3-venv python3-pip"
    echo "puis relancez ./start.sh"
    exit 1
  fi
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python run.py "$@"
