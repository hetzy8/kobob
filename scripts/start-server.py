#!/usr/bin/env python3
"""Start the local Next.js development server from any working directory."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm is required. Install Node.js and npm, then retry.")
    node = shutil.which("node")
    version = subprocess.check_output([node, "--version"], text=True).strip() if node else ""
    command = [npm]
    if version.split(".")[0] != "v24":
        print("Selecting Node.js 24 through npm (downloaded if not cached).", flush=True)
        command += ["exec", "--yes", "--package=node@24", "--", "npm"]
    if not (root / "node_modules" / "next").is_dir():
        sys.exit("Dependencies are missing. Run npm ci in the repository first.")
    os.chdir(root)
    os.execv(npm, [*command, "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000", *sys.argv[1:]])


if __name__ == "__main__":
    main()
