"""Kill processes listening on a TCP port (Windows)."""

import sys

import subprocess


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    result = subprocess.run(
        f"netstat -ano | findstr :{port}",
        shell=True,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        print(f"Freed port {port} (pids: none)")
        return
    out = result.stdout
    pids = set()
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        parts = line.split()
        if parts:
            pids.add(parts[-1])
    for pid in pids:
        subprocess.run(["taskkill", "/F", "/PID", pid, "/T"], check=False)
        subprocess.run(
            ["powershell", "-Command", f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue"],
            check=False,
        )
    print(f"Freed port {port} (pids: {', '.join(sorted(pids)) or 'none'})")


if __name__ == "__main__":
    main()
