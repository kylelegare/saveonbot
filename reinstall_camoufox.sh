#!/bin/bash

set -euo pipefail

VENV_DIR="./venv"
PYTHON="python3"

if [ ! -d "$VENV_DIR" ]; then
  echo "[*] Creating virtualenv at $VENV_DIR"
  $PYTHON -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install "camoufox[geoip]==0.4.11"

python -m camoufox path

deactivate

echo "[*] Camoufox reinstall complete."
