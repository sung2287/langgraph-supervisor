#!/usr/bin/env bash
set -euo pipefail

PWD_REAL="$(pwd -P)"

if [[ "$PWD_REAL" == /mnt/* ]]; then
  echo "ERROR: This project must NOT run under /mnt/* (Windows drive mount)."
  echo "Current: $PWD_REAL"
  echo "Fix: Move/clone the repo into WSL filesystem (e.g., ~/projects/...)"
  exit 1
fi

echo "OK: WSL filesystem path confirmed: $PWD_REAL"
