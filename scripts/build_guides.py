"""Build docs/guide/*.html (in-depth pages) and insert the short 'What is this?'
notes under each section of docs/index.html. Safe to run repeatedly.

    python scripts/build_guides.py
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from guide_content import GUIDES  # noqa: E402

E = html.escape
OUT = ROOT / "docs" / "guide"
OUT.mkdir(parents=True, exist_ok=True)
BY = {g["slug"]: g for g in GUIDES}

HEAD = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>{title} · Shelly guide</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="../app.css">
<style>
.guide h1{{font-size:clamp(28px,5vw,44px)}} .guide h2{{margin-top:34px}}
.guide ul,.guide ol{{padding-left:20px;max-width:70ch}} .guide li{{margin:6px 0;line-height:1.55}}
.formula{{display:grid;grid-template-columns:minmax(120px,200px) 1fr;gap:1px;background:var(--etch-2);border:1px solid var(--etch-2);border-radius:3px;overflow:hidden}}
.formula div{{background:var(--panel);padding:10px 12px;font-size:14px}} .formula div:nth-child(odd){{color:var(--ink);font-weight:500}}
.formula div:nth-child(even){{font-family:var(--mono);font-size:12.5px;color:var(--ink-2)}}
.crumbs{{font-family:var(--mono);font-size:11px;letter-spacing:.08em;margin-top:28px}} .crumbs a{{color:var(--ink-3)}}
.asks span{{display:inline-block;border:1px solid var(--etch);border-radius:99px;padding:5px 12px;margin:4px 6px 0 0;font-size:13px}}
.toc{{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}}
.toc a{{text-decoration:none}}
</style></head><body><div class="wrap guide">"""
FOOT = """<footer><span><a href="../index.html">← Back to Shelly</a></span><span><a href="index.html">All guides</a></span>
<span><a href="https://github.com/Pavi44M/Agent-Shelly-0.3">Source on GitHub</a></span><span>Built by <a href="https://pavi44m.github.io/pavibamunu/">Pavithra Bamunu</a></span></footer></div></body></html>"""


def lst(items, tag="ul"):
    return f"<{tag}>" + "".join(f"<li>{E(i)}</li>" for i in items) + f"</{tag}>" if items else ""


def page(g):
    parts = [HEAD.format(title=E(g["title"])),
             '<div class="crumbs"><a href="../index.html">Shelly</a> / <a href="index.html">Guide</a></div>',
             f'<header style="padding-top:18px"><span class="tag">Shelly guide</span><h1>{E(g["title"])}</h1>',
             f'<p class="sub">{E(g["lead"])}</p></header>']
    if g["glance"]:
        parts += ['<section><h2>At a glance</h2>', lst(g["glance"]), "</section>"]
    if g["how"]:
        parts += ['<section><h2>How it works</h2>', lst(g["how"], "ol"), "</section>"]
    if g["method"]:
        parts += ['<section><h2>Method &amp; formulas</h2><div class="formula">',
                  "".join(f"<div>{E(k)}</div><div>{E(v)}</div>" for k, v in g["method"]), "</div></section>"]
    if g["read"]:
        parts += ['<section><h2>How to read it</h2>', lst(g["read"]), "</section>"]
    if g["limits"]:
        parts += ['<section><h2>Limits &amp; safeguards</h2>', lst(g["limits"]), "</section>"]
    if g["ask"]:
        parts += ['<section><h2>Ask Shelly</h2><div class="asks">', "".join(f"<span>{E(a)}</span>" for a in g["ask"]),
                  '</div><p class="small">Type or say these in the chat on the <a href="../index.html#chat">main page</a>.</p></section>']
    if g["related"]:
        parts += ['<section><h2>Related</h2><div class="toc">',
                  "".join(f'<a class="item" href="{r}.html"><span class="t" style="font-size:17px">{E(BY[r]["title"])}</span></a>'
                          for r in g["related"] if r in BY), "</div></section>"]
    parts.append(FOOT)
    return "\n".join(parts)


for g in GUIDES:
    (OUT / f"{g['slug']}.html").write_text(page(g))

idx = [HEAD.format(title="All guides"), '<div class="crumbs"><a href="../index.html">Shelly</a> / Guide</div>',
       '<header style="padding-top:18px"><span class="tag">Shelly guide</span><h1>How Shelly <b>works</b></h1>',
       '<p class="sub">In-depth notes for every part of the dashboard: what it shows, how it\'s calculated, how to read it, and its limits.</p></header>',
       '<section><div class="toc">']
idx += [f'<a class="item" href="{g["slug"]}.html"><span class="k">{E(g["slug"].replace("-", " "))}</span>'
        f'<span class="t" style="font-size:18px">{E(g["title"])}</span><span class="d">{E(g["mini"] or g["lead"])}</span></a>' for g in GUIDES]
idx += ["</div></section>", FOOT]
(OUT / "index.html").write_text("\n".join(idx))

# ---- inject 'What is this?' notes into index.html
p = ROOT / "docs" / "index.html"
s = p.read_text()
s = re.sub(r"\n?<!--about:[\w-]+-->.*?<!--/about-->", "", s, flags=re.S)
for g in GUIDES:
    if not g["section"] or not g["mini"]:
        continue
    note = (f'\n<!--about:{g["slug"]}--><details class="about"><summary>What is this?</summary>'
            f'<p>{E(g["mini"])}</p><a href="guide/{g["slug"]}.html">In-depth guide →</a></details><!--/about-->')
    if g["section"] == "chat":
        anchor = '<div class="hint" id="hint">'
        i = s.index(anchor)
        j = s.index("</div>", i) + len("</div>")
        s = s[:j] + note.replace('class="about"', 'class="about in-chat"') + s[j:]
    else:
        m = re.search(rf'<section id="{g["section"]}">\s*<h2>.*?</h2>', s, flags=re.S)
        s = s[:m.end()] + note + s[m.end():]
p.write_text(s)
print(f"Wrote {len(GUIDES)} guide pages + index; notes added to index.html")
