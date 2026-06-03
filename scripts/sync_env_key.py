"""Sync OPENROUTER_API_KEY from sibling projects into ownNBLM/.env (no stdout secrets)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [ROOT.parent / "PageIndex" / ".env", ROOT.parent / "ca-saas" / ".env"]


def read_key(path: Path) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            return line.partition("=")[2].strip()
    return ""


def main() -> None:
    key = ""
    for src in SOURCES:
        key = read_key(src)
        if key and len(key) > 40:
            break
    if not key:
        raise SystemExit("OPENROUTER_API_KEY not found in PageIndex or ca-saas .env")

    env_path = ROOT / ".env"
    lines = []
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if not line.startswith("OPENROUTER_API_KEY="):
                lines.append(line)
    out = [f"OPENROUTER_API_KEY={key}", *lines]
    if not any(l.startswith("ENVIRONMENT=") for l in out):
        out.append("ENVIRONMENT=development")
    if not any(l.startswith("SECRET_KEY=") for l in out):
        out.append("SECRET_KEY=dev-secret-change-in-production")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("Synced OPENROUTER_API_KEY into .env (length ok:", len(key) > 40, ")")


if __name__ == "__main__":
    main()
