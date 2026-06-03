"""Kill processes listening on a TCP port (Windows)."""

import sys

import subprocess


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    out = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True, text=True)
    pids = set()
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        parts = line.split()
        if parts:
            pids.add(parts[-1])
    for pid in pids:
        subprocess.run(["taskkill", "/F", "/PID", pid, "/T"], check=False)
    print(f"Freed port {port} (pids: {', '.join(sorted(pids)) or 'none'})")


if __name__ == "__main__":
    main()
