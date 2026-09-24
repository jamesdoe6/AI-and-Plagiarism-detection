#!/usr/bin/env bash
# Lancement macOS / Linux : crée l'environnement virtuel au 1er lancement, puis démarre.
set -e
cd "$(dirname "$0")"
if [ ! -x ".venv/bin/python" ]; then
  echo "Création de l'environnement virtuel..."
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python run.py "$@"
