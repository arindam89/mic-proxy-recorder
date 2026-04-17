#!/usr/bin/env bash
# Create .venv-parakeet at repo root and install NeMo for Parakeet ASR (large download).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pick_python() {
  for c in python3.12 python3.11 python3.10; do
    if command -v "$c" &>/dev/null; then
      echo "$c"
      return
    fi
  done
  echo "No python3.12, python3.11, or python3.10 found on PATH." >&2
  echo "NeMo ASR is not supported on Python 3.13+. Install e.g. Homebrew python@3.12 and retry." >&2
  exit 1
}

PY="$(pick_python)"
echo "Using: $PY ($("$PY" -c 'import sys; print(sys.version)'))"

if [[ ! -d .venv-parakeet ]]; then
  "$PY" -m venv .venv-parakeet
fi
# shellcheck disable=SC1091
source .venv-parakeet/bin/activate
python -m pip install --upgrade pip
pip install -r scripts/requirements-parakeet.txt
echo "Done. The Tauri app will use $ROOT/.venv-parakeet/bin/python3 when present."
