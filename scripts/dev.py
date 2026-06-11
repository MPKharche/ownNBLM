"""
dev.py — one-command local dev launcher for ownNBLM (Windows-safe).

Usage:
    python scripts/dev.py

What it does:
1. Finds a free TCP port starting at 8000 (skips anything owned by non-Python processes).
2. Writes frontend/.env.development.local with VITE_DEV_API_PROXY pointing at that port.
3. Starts uvicorn on that port in a subprocess (visible in Terminal 1 output).
4. Starts the Vite dev server (Terminal 2 output interleaved).

Both processes run in the foreground. Ctrl-C kills both.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

# Force UTF-8 output on Windows so print() never hits cp1252 encoding errors
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
ENV_LOCAL = FRONTEND / ".env.development.local"

API_HOST = "127.0.0.1"
PORT_RANGE = range(8000, 8020)


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        try:
            s.connect((API_HOST, port))
            return False  # something is listening
        except (ConnectionRefusedError, TimeoutError, OSError):
            return True


def find_free_port() -> int:
    for port in PORT_RANGE:
        if _port_free(port):
            return port
    raise RuntimeError(f"No free port found in {PORT_RANGE}. Close some applications and retry.")


def write_vite_proxy(port: int) -> None:
    ENV_LOCAL.write_text(f"VITE_DEV_API_PROXY=http://{API_HOST}:{port}\n", encoding="utf-8")
    print(f"[dev] Wrote {ENV_LOCAL.relative_to(ROOT)} -> proxy to :{port}")


def wait_for_api(port: int, timeout: int = 20) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not _port_free(port):
            return True
        time.sleep(0.5)
    return False


def main() -> None:
    port = find_free_port()
    print(f"[dev] Using API port {port}")
    write_vite_proxy(port)

    # Run migration idempotently before starting
    print("[dev] Running migrations...")
    subprocess.run(
        [sys.executable, "migrations/add_notebooks.py"],
        cwd=BACKEND,
        check=False,
    )

    python = sys.executable
    api_cmd = [
        python, "-m", "uvicorn", "app.main:app",
        "--host", API_HOST,
        "--port", str(port),
        "--reload",
    ]
    vite_cmd = ["npm", "run", "dev"]

    print(f"[dev] Starting API:    {' '.join(api_cmd)}")
    api_proc = subprocess.Popen(api_cmd, cwd=BACKEND)

    print("[dev] Waiting for API to be ready...")
    if not wait_for_api(port):
        print("[dev] ERROR: API did not start within 20s. Check backend logs above.")
        api_proc.terminate()
        sys.exit(1)
    print(f"[dev] API ready at http://{API_HOST}:{port}")

    print(f"[dev] Starting Vite:   {' '.join(vite_cmd)}")
    vite_proc = subprocess.Popen(vite_cmd, cwd=FRONTEND, shell=(os.name == "nt"))

    def _shutdown(sig=None, frame=None):
        print("\n[dev] Shutting down...")
        vite_proc.terminate()
        api_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Wait for either process to exit
    while True:
        if api_proc.poll() is not None:
            print("[dev] API exited unexpectedly. Stopping Vite.")
            vite_proc.terminate()
            break
        if vite_proc.poll() is not None:
            print("[dev] Vite exited unexpectedly. Stopping API.")
            api_proc.terminate()
            break
        time.sleep(1)


if __name__ == "__main__":
    main()
