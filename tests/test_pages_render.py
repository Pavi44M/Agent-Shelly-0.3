"""Every page opens without a script error, on a desktop and on a phone, and never scrolls sideways on a phone.
Uses Playwright + Chromium when installed. Slow (a few minutes), so it runs on a release (scripts/release.py sets
SHELLY_RENDER=1) or when asked: SHELLY_RENDER=1 python -m pytest tests/test_pages_render.py
Screenshots go to outputs/screens/ (not published)."""
import functools
import os
import http.server
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["", "supply-chain/", "gateway/", "tower/", "store/", "brain/", "vision/", "lp/", "os/", "shift/", "ops/", "group/", "commercial/", "floors/", "clinic/", "hotel/", "case/", "quality/", "ask/", "launchpad/", "report.html", "digest.html"]
BOOTED = "try{['gw.booted','vision.booted','lp.booted','os.booted','shift.booted','ops.booted','group.booted','ask.booted','commercial.booted','floors.booted','clinic.booted','hotel.booted'].forEach(k=>sessionStorage.setItem(k,'1'))}catch(e){}"


@pytest.fixture(scope="module")
def site():
    if os.environ.get("SHELLY_RENDER") != "1":
        pytest.skip("page rendering runs on a release (SHELLY_RENDER=1)")
    pw = pytest.importorskip("playwright.sync_api")
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):  # keep the test output clean
            pass
    handler = functools.partial(Quiet, directory=str(ROOT / "docs"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with pw.sync_playwright() as p:
        try:
            br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        except Exception as e:  # no browser installed
            pytest.skip(f"no Chromium: {e}")
        yield br, f"http://127.0.0.1:{srv.server_address[1]}/"
        br.close()
    srv.shutdown()


@pytest.mark.parametrize("size", [(1360, 860), (390, 844)], ids=["desktop", "phone"])
def test_pages_render(site, size):
    br, base = site
    out = ROOT / "outputs/screens"; out.mkdir(parents=True, exist_ok=True)
    problems = []
    for path in PAGES:
        ctx = br.new_context(viewport={"width": size[0], "height": size[1]}, is_mobile=size[0] < 600, has_touch=size[0] < 600)
        ctx.add_init_script(BOOTED)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        pg.goto(base + path, wait_until="domcontentloaded", timeout=90000); pg.wait_for_timeout(2000)
        sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
        try:   # a picture for people to look at; a slow software-rendered 3D page may not finish one, which is not a failure
            pg.screenshot(path=str(out / f"{(path or 'index').strip('/').replace('/', '_').replace('.html', '')}-{'phone' if size[0] < 600 else 'desktop'}.png"), timeout=45000)
        except Exception:
            pass
        if errs: problems.append(f"{path or 'index'}: {errs[0]}")
        if size[0] < 600 and sw > cw + 1: problems.append(f"{path or 'index'}: scrolls sideways on a phone ({sw}px wide on {cw}px)")
        ctx.close()
    assert not problems, "\n".join(problems)
