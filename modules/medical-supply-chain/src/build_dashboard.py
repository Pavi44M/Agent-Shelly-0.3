"""Build the supply-chain dashboard from dashboard/template.html + data.json.

    python src/build_dashboard.py                 -> dashboard/index.html (single self-contained page)
    python src/build_dashboard.py --site DIR      -> DIR/index.html + sc.css + sc.js + data.js + d3.min.js
                                                     (for the Shelly website: no inline scripts, no CDNs,
                                                      so it runs under Shelly's Content Security Policy)
    python src/build_dashboard.py --artifact      -> dashboard/artifact.html (body-only, for Claude artifacts)
"""
import argparse
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
D3_CDN = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; "
       "base-uri 'none'; form-action 'none'")


def assemble():
    tpl = (DASH / "template.html").read_text()
    return (tpl.replace("/*VISION_CSS*/", (DASH / "vision.css").read_text())
               .replace("/*VISION_JS*/", (DASH / "vision.js").read_text()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", help="write a CSP-safe multi-file site into this folder")
    ap.add_argument("--artifact", action="store_true")
    a = ap.parse_args()
    page = assemble()
    data = (DASH / "data.json").read_text()

    if a.site:
        out = Path(a.site); out.mkdir(parents=True, exist_ok=True)
        title = re.search(r"<title>.*?</title>", page).group(0)
        links = "\n".join(re.findall(r"<link [^>]+>", page))
        css = re.search(r"<style>(.*?)</style>", page, re.S).group(1)
        body = page[page.index("</style>") + len("</style>"):page.index(f'<script src="{D3_CDN}">')]
        js = re.findall(r"<script>(.*?)</script>", page, re.S)[-1].replace("const DATA = /*DATA*/null;", "")
        body = body.replace("<!--BACK-->", "")
        sw = Path(__file__).resolve().parents[3] / "scripts" / "business_switch.py"
        if sw.exists():   # inside the Shelly repo: add the big business toggle at the top
            import importlib.util
            spec = importlib.util.spec_from_file_location("business_switch", sw)
            mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
            body = mod.switch_html("../", "medical") + body
            links += '\n<link rel="stylesheet" href="../switch.css">'
        css += "\n.back{display:inline-block;font-family:var(--mono);font-size:11px;color:var(--accent);text-decoration:none;margin-bottom:6px}.back:hover{text-decoration:underline}"
        (out / "sc.css").write_text(css)
        (out / "sc.js").write_text(js)
        (out / "data.js").write_text("const DATA = " + data + ";\n")
        d3 = next((p for p in [ROOT / "vendor/d3.min.js"] if p.exists()), None)
        if d3 is None:
            raise SystemExit("vendor/d3.min.js missing (d3 v7.9.0, ISC licence)")
        shutil.copy(d3, out / "d3.min.js")
        (out / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{title}
<meta name="author" content="Pavithra Bamunu">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="no-referrer">
<meta name="description" content="Tōtara Medical Supply Chain Command (Shelly): a medical-imports command dashboard with a zoomable supplier to product to client vision board. Synthetic demo data.">
{links}
<link rel="stylesheet" href="sc.css">
<style>body{{margin:0}}</style>
</head>
<body>
{body}
<script src="d3.min.js"></script>
<script src="data.js"></script>
<script src="sc.js"></script>
</body>
</html>
""")
        print("site written to", out)
        return

    body = page.replace("/*DATA*/null", data)
    if a.artifact:
        (DASH / "artifact.html").write_text(body)
        print("built", DASH / "artifact.html")
        return
    (DASH / "index.html").write_text(
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>body{margin:0}</style></head><body>\n' + body + "\n</body></html>\n")
    print("built", DASH / "index.html")


if __name__ == "__main__":
    main()
