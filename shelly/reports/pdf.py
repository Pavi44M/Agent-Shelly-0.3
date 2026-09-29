"""PDF export: prints the Shelly report page with headless Chromium, so the PDF looks exactly like the screen.

Needs Playwright:  pip install playwright && python -m playwright install chromium
"""
from __future__ import annotations

import functools
import http.server
import shutil
import threading
from pathlib import Path

DOCS = Path(__file__).resolve().parents[2] / "docs"


def stage_viewer(out_dir: Path) -> Path:
    """Copy the report page next to the bundle so the output folder works on its own (offline too)."""
    out_dir = Path(out_dir)
    for f in ("report.html", "report.js", "report.css"):
        shutil.copy(DOCS / f, out_dir / f)
    (out_dir / "index.html").write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=report.html">')
    return out_dir


def export(out_dir, spec_ids: list[str], themes=("light",), log=print) -> list[str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("  PDF skipped: install Playwright (pip install playwright && python -m playwright install chromium)")
        return []
    out_dir = Path(out_dir)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    handler = functools.partial(Quiet, directory=str(out_dir))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    written = []
    pdf_dir = out_dir / "pdf"
    pdf_dir.mkdir(exist_ok=True)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1100, "height": 1400})
            for sid in spec_ids:
                for th in themes:
                    page.goto(f"http://127.0.0.1:{port}/report.html?id={sid}&theme={th}")
                    page.wait_for_function("window.__shellyReady === true", timeout=15000)
                    name = pdf_dir / f"{sid}{'' if th == 'light' else '-' + th}.pdf"
                    page.pdf(path=str(name), print_background=True, prefer_css_page_size=True)
                    written.append(str(name))
            b.close()
    finally:
        srv.shutdown()
    return written
