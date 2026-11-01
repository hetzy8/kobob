#!/usr/bin/env python3
"""Start the local Next.js development server from any working directory."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        sys.exit("Node.js 24 and npm must be available on PATH.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if version.split(".")[0] != "v24":
        sys.exit(f"Node.js 24 is required (found {version}). Select Node 24 and retry.")
    if not (root / "node_modules" / "next").is_dir():
        sys.exit("Dependencies are missing. Run npm ci in the repository first.")
    os.chdir(root)
    os.execv(npm, [npm, "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000", *sys.argv[1:]])


if __name__ == "__main__":
    main()
