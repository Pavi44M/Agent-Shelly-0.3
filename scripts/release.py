"""Ship a Shelly release in one step (v2.0).

    python scripts/release.py 2.0.1 -m "short summary of the release" [--no-tests] [--dry-run] [--out DIR]

What it does, in order (it stops at the first failure and changes nothing it has not reached):
  1. bump the version everywhere it lives: shelly/__init__.py, the version in the published data files,
     the mascot kit (KIT_V) and every ?v= tag on the pages, so phones never keep an old saved copy
  2. rebuild the pages that show the version or the shared data (Store Vision, Loss Prevention, Brain,
     Shelly OS, Shift Pilot, Tower, Gateway and, last, the Launchpad that reads them)
  3. run the tests, including every page opened on a desktop and a phone (no script errors, no sideways scroll)
  4. commit as Pavithra (with the session's attribution lines) and write a git bundle of the new commit,
     ready to push from the PC: git fetch <bundle> HEAD && git merge --ff-only FETCH_HEAD && git push
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDERS = ["build_vision", "build_lp", "build_brain", "build_os", "build_shift", "build_ops", "build_group", "build_commercial", "build_mind", "build_tower", "build_gateway", "build_launchpad"]   # launchpad last: it reads the others
DATA_FILES = ["docs/data/shelly-data.js", "docs/data/shelly-reports.js", "docs/data/store-floor.js"]
TRAILER = ("Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"
           "Claude-Session: https://claude.ai/code/session_01VXjp7DwK3tLyLAJcafn74e")
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def current() -> str:
    return re.search(r'__version__ = "([^"]+)"', (ROOT / "shelly/__init__.py").read_text()).group(1)


def stamp_targets():
    """every file that carries a ?v= tag for the mascot kit"""
    for pat in ("docs/**/*.html", "modules/**/*.html", "scripts/*.html", "scripts/*.py", "modules/**/*.py"):
        for p in ROOT.glob(pat):
            if p.name != "release.py" and "?v=" in p.read_text(encoding="utf-8", errors="ignore"):
                yield p


def bump(old: str, new: str, dry=False) -> list:
    changed = []

    def sub(p: Path, pairs):
        s = p.read_text(encoding="utf-8"); t = s
        for a, b in pairs:
            t = t.replace(a, b)
        if t != s:
            changed.append(str(p.relative_to(ROOT)))
            if not dry: p.write_text(t, encoding="utf-8")
    sub(ROOT / "shelly/__init__.py", [(f'__version__ = "{old}"', f'__version__ = "{new}"')])
    for f in DATA_FILES:
        sub(ROOT / f, [(f'"version":"{old}"', f'"version":"{new}"'), (f'"version": "{old}"', f'"version": "{new}"')])
    sub(ROOT / "docs/kit/shelly-kit.js", [(f'const KIT_V = "{old}"', f'const KIT_V = "{new}"')])
    for p in stamp_targets():
        s = p.read_text(encoding="utf-8")
        t = re.sub(r'(shelly-kit\.(?:js|css)|switch\.css)\?v=[0-9.]+', rf"\1?v={new}", s)
        if t != s:
            changed.append(str(p.relative_to(ROOT)))
            if not dry: p.write_text(t, encoding="utf-8")
    return sorted(set(changed))


def run(cmd, **kw):
    print("  $", " ".join(map(str, cmd)))
    return subprocess.run(cmd, cwd=ROOT, **kw)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version"); ap.add_argument("-m", "--message", required=True)
    ap.add_argument("--no-tests", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "outputs"))
    a = ap.parse_args(argv)
    old, new = current(), a.version.lstrip("v")
    if not SEMVER.match(new): sys.exit(f"version must look like 2.0.1, got {a.version}")
    if new == old: sys.exit(f"already at {old}")
    print(f"Shelly release {old} -> {new}")
    print("1 · version"); ch = bump(old, new, a.dry_run)
    print(f"  {len(ch)} files" + (" (dry run, nothing written)" if a.dry_run else ""))
    if a.dry_run:
        for c in ch: print("   ", c)
        return 0
    print("2 · pages")
    for b in BUILDERS:
        r = run([sys.executable, f"scripts/{b}.py"], capture_output=True, text=True)
        if r.returncode: print(r.stdout[-800:], r.stderr[-1500:]); sys.exit(f"{b} failed: release stopped (version already bumped; fix and re-run, or git checkout .)")
    if not a.no_tests:
        print("3 · tests")
        import os
        r = run([sys.executable, "-m", "pytest", "-q"], capture_output=True, text=True, env={**os.environ, "SHELLY_RENDER": "1"})
        print("  " + (r.stdout.strip().splitlines() or ["?"])[-1])
        if r.returncode: print(r.stdout[-3000:]); sys.exit("tests failed: release stopped before the commit")
    print("4 · commit and bundle")
    base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    run(["git", "add", "-A"], check=True)
    msg = f"v{new}: {a.message}\n\n{TRAILER}\n"
    run(["git", "-c", "user.name=Pavithra", "-c", "user.email=pavithrasam.s6@gmail.com", "commit", "-q", "-F", "-"], input=msg, text=True, check=True)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); bundle = out / f"shelly-v{new}.bundle"
    run(["git", "bundle", "create", str(bundle), "HEAD", f"^{base}"], check=True, capture_output=True)
    print(f"\nReleased v{new} -> {bundle}\nOn the PC: git fetch <bundle> HEAD && git merge --ff-only FETCH_HEAD && git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
