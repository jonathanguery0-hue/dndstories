#!/usr/bin/env bash
# Lance Contes & Dragons (macOS / Linux).
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 n'est pas installé. Télécharge-le sur https://www.python.org/downloads/"
  read -r -p "Appuie sur Entrée pour fermer…"
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "Première installation, cela peut prendre une minute…"
  python3 -m venv .venv || exit 1
fi
.venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || exit 1
.venv/bin/python -m app
