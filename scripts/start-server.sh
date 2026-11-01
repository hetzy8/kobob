#!/usr/bin/env bash
# Use the same launcher behavior from Bash or Python.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$script_dir/start-server.py" "$@"
