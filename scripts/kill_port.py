"""Kill processes listening on a TCP port (Windows)."""

from __future__ import annotations

import subprocess
import sys


def _listening_pids(port: int) -> set[str]:
    result = subprocess.run(
        f"netstat -ano | findstr :{port}",
        shell=True,
        text=True,
        capture_output=True,
    )
    pids: set[str] = set()
    if result.returncode != 0 or not result.stdout.strip():
        return pids
    for line in result.stdout.splitlines():
        if "LISTENING" not in line:
            continue
        parts = line.split()
        if parts:
            pids.add(parts[-1])
    return pids


def _uvicorn_pids(port: int) -> set[str]:
    """Find python/uvicorn processes for this port via WMIC (Windows)."""
    result = subprocess.run(
        ["wmic", "process", "where", "name='python.exe'", "get", "ProcessId,CommandLine"],
        text=True,
        capture_output=True,
        check=False,
    )
    pids: set[str] = set()
    needle = f"--port {port}"
    for line in result.stdout.splitlines():
        if needle not in line:
            continue
        parts = line.rsplit(None, 1)
        if parts and parts[-1].isdigit():
            pids.add(parts[-1])
    return pids


def _kill_pid(pid: str) -> None:
    subprocess.run(["taskkill", "/F", "/PID", pid, "/T"], check=False)
    subprocess.run(
        [
            "powershell",
            "-Command",
            f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue",
        ],
        check=False,
    )


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    pids = _listening_pids(port) | _uvicorn_pids(port)
    if not pids:
        print(f"Freed port {port} (pids: none)")
        return
    for pid in sorted(pids):
        _kill_pid(pid)
    remaining = _listening_pids(port)
    if remaining:
        print(
            f"Port {port} still held by zombie pids: {', '.join(sorted(remaining))}. "
            "Start the API on another port or reboot."
        )
    else:
        print(f"Freed port {port} (pids: {', '.join(sorted(pids)) or 'none'})")


if __name__ == "__main__":
    main()
