#!/usr/bin/env bash
# Drone Analytics Studio launcher for macOS / Linux.
set -e
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python || true)
if [ -z "$PY" ]; then
  echo "Python 3.9+ is needed: https://www.python.org/downloads/"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "First run - setting things up (needs internet once)..."
  "$PY" -m venv .venv
fi
.venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt
exec .venv/bin/python studio.py "$@"
