"""Build docs/launchpad/: one page that opens every part of Shelly.

Figures come from the latest retail run (docs/data/shelly-data.js), the skill
registry and the medical supply-chain module (modules/medical-supply-chain).
Static HTML + CSS only, so it runs under Shelly's Content Security Policy.

    python scripts/build_launchpad.py
"""
from __future__ import annotations

import html
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "docs" / "launchpad"

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'")


def js_data(path: Path, var: str) -> dict:
    s = path.read_text()
    return json.loads(s[s.index("{"):s.rstrip().rstrip(";").rindex("}") + 1])


def money(v: float) -> str:
    return f"${v / 1e6:.2f}M" if abs(v) >= 1e6 else f"${v / 1e3:.1f}k" if abs(v) >= 1e4 else f"${v:,.0f}"


def spark(values: list[float], w=150, h=36) -> str:
    lo, hi = min(values), max(values)
    pts = [(i * w / (len(values) - 1), h - 3 - (v - lo) / ((hi - lo) or 1) * (h - 6)) for i, v in enumerate(values)]
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    area = f"0,{h} {line} {w},{h}"
    ex, ey = pts[-1]
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" aria-hidden="true"><polygon points="{area}" class="sa"/>'
            f'<polyline points="{line}" class="sl"/><circle cx="{ex:.1f}" cy="{ey:.1f}" r="2.6" class="se"/></svg>')


def ring(ratios: list[float | None], r=17) -> str:
    dots = []
    for i, q in enumerate(ratios):
        a = i / len(ratios) * 2 * math.pi
        c = "ok" if q is not None and q >= 1 else "warn" if q is not None and q >= .9 else "bad"
        dots.append(f'<circle cx="{r * math.sin(a):.1f}" cy="{-r * math.cos(a):.1f}" r="2.7" class="d {c}" style="animation-delay:{i * .2:.1f}s"/>')
    return f'<svg class="ring" viewBox="-24 -24 48 48" aria-hidden="true"><circle r="10" class="rc"/>{"".join(dots)}</svg>'


def main():
    from shelly.core.skills import load_all
    skills = load_all()
    packs = {}
    for s in skills.values():
        packs[s.pack] = packs.get(s.pack, 0) + 1

    shelly = js_data(ROOT / "docs/data/shelly-data.js", "SHELLY_DATA")
    m, k = shelly["meta"], shelly["kpis"]
    daily = [d["v"] for d in shelly["daily"][-28:]]
    pending = len(shelly.get("decisions", []))
    pack_titles = [p["title"] for p in shelly.get("packs", [])]

    sc_path = ROOT / "modules/medical-supply-chain/dashboard/data.json"
    sc = json.loads(sc_path.read_text()) if sc_path.exists() else None
    if sc:
        V = sc["vision"]
        net_ratio = []
        for i in range(len(V["weeks"])):
            a = sum(n["actual"][i] for n in V["nodes"] if n["type"] == "client")
            p = sum(n["plan"][i] for n in V["nodes"] if n["type"] == "client")
            net_ratio.append(a / p if p else None)
        sck = sc["kpi"]

    cards = []

    def card(href, tag, title, text, figure, figlabel, chip, chipcls="", visual="", extra_cls=""):
        inner = (f'<div class="top"><span class="tag">{tag}</span><span class="chip {chipcls}">{chip}</span></div>'
                 f'<h2>{title}</h2><p>{text}</p>'
                 f'<div class="fig"><div><b>{figure}</b><span>{figlabel}</span></div>{visual}</div>')
        if href:
            cards.append(f'<a class="card {extra_cls}" href="{href}">{inner}<span class="go" aria-hidden="true">→</span></a>')
        else:
            cards.append(f'<div class="card static {extra_cls}">{inner}</div>')

    vs = k.get("vs_budget_pct", 0)
    card("../index.html", "Retail · live agent", "Talk to Shelly",
         "Ask about this week's trade by typing or voice. Daily briefing, forecasts, exceptions, actions and decisions.",
         money(k["sales"]), f"week to {m['asof_label'].split(' ', 1)[1]} · {vs:+.1f}% vs budget",
         "Live", "live", spark(daily), "wide")
    brain_p = ROOT / "docs/data/brain.js"
    bstats = js_data(brain_p, "SHELLY_BRAIN")["stats"] if brain_p.exists() else None
    if bstats:
        card("../brain/", "One brain · every department", "Shelly Brain",
             "The orchestrator, memory, governance, knowledge and learning behind every business, and an agent for every department job.",
             str(bstats["agents"]), f"agents in {bstats['departments']} departments · {bstats['approve']} need approval", "Core", "live")
    card("../report.html", "All industries", "Reports",
         "Budget, 13-week forecast, trading, category, roster, stock, waste and industry-pack reports as Excel, PDF or on screen.",
         "11", "report types · Excel with live formulas and PivotTables", "Excel · PDF")
    if sc:
        tot = V["total"]
        card("../supply-chain/", "Medical imports · separate business", "Tōtara Medical Supply Chain Command",
             "Zoomable supplier → product → client vision board with weekly plan vs actual, stock-out and expiry risk, "
             "inbound holds, supplier OTIF and SARIMA-X forecasts.",
             f"{tot['ach'] * 100:.1f}%", f"network sales vs plan · 12 wks · {sck['at_risk_skus']}/{sck['skus']} SKUs need action",
             "New", "new", ring(net_ratio), "wide")
    card("../index.html#s-packs", "Electronics · wholesale · warehousing · production", "Industry packs",
         "The same engine applied beyond retail: sell-through and markdowns, cost-to-serve and OTIF, ABC-XYZ slotting, OEE and scrap.",
         str(len(pack_titles) or 4), "industry packs on demo data", "Demo data")
    card("../index.html#s-dec", "Governance", "Decisions waiting for you",
         "Big-money, compliance, price, range and credit judgements are proposals. Nothing happens until you confirm or reject.",
         str(pending), "proposals across all packs", "Needs you", "warn")
    card(None, "Daily · by email", "TD Report",
         "Technology & Data newsletter at 6:15am NZ: retail and grocery, electronics, supply chain, AI and data, markets (information only) and matching jobs.",
         "6:15am", "every day to your Gmail", "Scheduled")
    card("https://github.com/Pavi44M/Agent-Shelly-0.3/blob/main/skills/INDEX.md", "Open source", "Skills library",
         "Every capability is a documented skill that OpenJarvis or any LLM planner can call.",
         str(len(skills)), f"skills across {len(packs)} packs", "GitHub")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "launchpad.css").write_text(CSS)
    sys.path.insert(0, str(ROOT / "scripts"))
    from business_switch import switch_html
    SWITCH = switch_html("../", "launchpad")
    boot_lines = [f"› starting Shelly v{m.get('version', '')} · {len(skills)} skills across {len(packs)} packs",
                  f"› Neighbourhood store · {money(k['sales'])} this week · {vs:+.1f}% vs budget",
                  (f"› Tōtara Medical · sales {sc['vision']['total']['ach'] * 100:.1f}% of plan · {sck['at_risk_skus']}/{sck['skus']} SKUs need action"
                   if sc else "› Tōtara Medical · module not built yet"),
                  "› reports · 11 types · Excel, PDF and presentation",
                  f"› governance · {pending} store and pack decisions + {len(sc['escalate']) if sc else 0} Tōtara judgements waiting for you",
                  "› TD Report scheduled for 6:15am NZ"]
    BOOT = ('<div id="boot" aria-live="polite"><div class="boot-in"><span class="tag">Shelly · launchpad</span>'
            '<div class="boot-orbs" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i></div>'
            '<h2 class="boot-h">Opening <b>every workspace</b></h2>'
            f'<pre id="bootLog" data-lines="{html.escape(json.dumps(boot_lines, ensure_ascii=False))}"></pre>'
            '<button id="skipBoot" type="button">Skip</button></div></div>')
    (OUT / "launchpad.js").write_text(BOOT_JS)
    (OUT / "index.html").write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Shelly Launchpad</title>
<meta name="author" content="Pavithra Bamunu">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="no-referrer">
<meta name="description" content="Shelly Launchpad: every part of Pavi's analytics agent in one place — retail agent, medical supply chain, reports, industry packs, TD Report and skills.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap">
<link rel="stylesheet" href="launchpad.css">
<link rel="stylesheet" href="../switch.css">
<link rel="stylesheet" href="../kit/shelly-kit.css">
</head>
<body>
{BOOT}
{SWITCH}
<div class="wrap">
<header>
  <span class="tag">Shelly v{html.escape(m.get('version', ''))} · Launchpad · Auckland, New Zealand</span>
  <h1>Everything Shelly does, <b>one tap away.</b></h1>
  <p class="sub">Pick a workspace. Each one runs on the same engine: data in, skills do the analysis, and anything important waits for your confirmation.</p>
  <div class="who"><span>{len(skills)} skills</span><span>{len(packs)} packs</span><span>Retail data to {html.escape(m['asof_label'])}</span><span>Demo · synthetic data</span></div>
</header>
<main class="grid">
{chr(10).join(cards)}
</main>
<footer>
  <span>Built by <a href="https://pavi44m.github.io/pavibamunu/">Pavithra Bamunu</a></span>
  <span><a href="https://github.com/Pavi44M/Agent-Shelly-0.3">Source on GitHub</a></span>
  <span><a href="../guide/index.html">How Shelly works (guide)</a></span>
  <span><a href="../guide/security.html">Security</a></span>
  <span><a href="../digest.html">Classic digest (v0.1)</a></span>
</footer>
</div>
<script src="launchpad.js"></script>
<script src="../data/approvals.js"></script>
<script src="../kit/shelly-kit.js" data-page="launchpad" data-base="../"></script>
</body>
</html>
""")
    print("Launchpad:", OUT / "index.html", f"({len(cards)} cards)")


CSS = """/* Shelly Launchpad — same look as the Shelly app and pavi44m.github.io/pavibamunu */
:root{color-scheme:dark;
  --void:#070b12;--panel:#0f1622;--panel-2:#141e2c;--etch:#1f2a38;--etch-2:#172230;
  --ink:#eaf0f6;--ink-2:#b0bac8;--ink-3:#7d8a9c;--accent:#63b6d8;
  --ok:#3fb87f;--warn:#e0a53a;--bad:#e66767;--new:#b69cf2;
  --mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box}
html,body{background:var(--void)}
body{margin:0;padding:env(safe-area-inset-top,0) 20px calc(40px + env(safe-area-inset-bottom,0));color:var(--ink-2);
  font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:1080px;margin:0 auto}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--ink-3)}
header{padding-block:64px 8px}
h1{font-size:clamp(32px,6.2vw,56px);font-weight:300;letter-spacing:-.03em;line-height:1.05;margin:16px 0 0;color:var(--ink);text-wrap:balance}
h1 b{font-weight:600}
.sub{font-size:clamp(16px,2.2vw,18px);max-width:60ch;margin:18px 0 0}
.who{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:20px;font-family:var(--mono);font-size:11.5px;color:var(--ink-3);letter-spacing:.05em}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-flow:dense;gap:12px;margin-top:40px;padding-top:32px;border-top:1px solid var(--etch-2)}
.card{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:18px 18px 16px;border:1px solid var(--etch);border-radius:3px;
  background:linear-gradient(165deg,var(--panel-2),var(--panel) 62%);color:inherit;text-decoration:none;transition:border-color .2s,transform .2s}
a.card:hover,a.card:focus-visible{border-color:var(--accent);transform:translateY(-2px);outline:none}
a.card:focus-visible{box-shadow:0 0 0 2px var(--accent)}
.card.wide{grid-column:span 2}
@media (max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:620px){.grid{grid-template-columns:minmax(0,1fr)}.card.wide{grid-column:auto}}
.top{display:flex;justify-content:space-between;gap:10px;align-items:center}
.top .tag{letter-spacing:.16em;font-size:9.5px}
.chip{font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid var(--etch);color:var(--ink-3);white-space:nowrap}
.chip.live{color:var(--ok);border-color:currentColor}.chip.new{color:var(--new);border-color:currentColor}.chip.warn{color:var(--warn);border-color:currentColor}
.card h2{margin:4px 0 0;font-size:19px;font-weight:600;color:var(--ink);letter-spacing:-.01em}
.card p{margin:0;font-size:14px;line-height:1.5;max-width:60ch}
.fig{margin-top:auto;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.fig div{display:grid;gap:2px;min-width:0}
.fig b{font-family:var(--mono);font-weight:500;font-size:26px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}
.fig span{font-family:var(--mono);font-size:11px;color:var(--ink-3)}
.go{position:absolute;right:16px;bottom:14px;font-family:var(--mono);color:var(--ink-3);transition:color .2s,transform .2s}
a.card:hover .go{color:var(--accent);transform:translateX(3px)}
.card.wide .go{display:none}
.spark{width:150px;height:36px;flex:none}
.spark .sa{fill:var(--accent);fill-opacity:.12}.spark .sl{fill:none;stroke:var(--accent);stroke-width:1.5}.spark .se{fill:var(--accent)}
.ring{width:56px;height:56px;flex:none}
.ring .rc{fill:none;stroke:var(--new);stroke-width:1.5;opacity:.7}
.ring .d{animation:blink 2.4s ease-in-out infinite}
.ring .ok{fill:var(--ok)}.ring .warn{fill:var(--warn)}.ring .bad{fill:var(--bad)}
@keyframes blink{0%,100%{opacity:.35}12%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ring .d{animation:none}a.card,.go{transition:none}}
#boot{position:fixed;inset:0;z-index:50;background:var(--void);display:grid;place-items:center;padding:24px;transition:opacity .6s ease,visibility .6s}
#boot.done{opacity:0;visibility:hidden}
.boot-in{width:min(560px,100%)}
.boot-h{margin:14px 0 0;font-size:clamp(22px,4.6vw,32px);font-weight:300;color:var(--ink);letter-spacing:-.02em}.boot-h b{font-weight:600}
.boot-orbs{display:flex;gap:10px;margin-top:20px}
.boot-orbs i{width:12px;height:12px;border-radius:50%;opacity:.25;animation:orb 1.2s ease-in-out infinite}
.boot-orbs .a{background:var(--accent)}.boot-orbs .b{background:var(--new);animation-delay:.2s}.boot-orbs .c{background:var(--ok);animation-delay:.4s}
@keyframes orb{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
#bootLog{font-family:var(--mono);font-size:12.5px;line-height:1.9;color:var(--ink-2);white-space:pre-wrap;min-height:170px;margin:14px 0 0}
#bootLog .ok{color:var(--accent)}
#skipBoot{font-family:var(--mono);font-size:11px;background:none;border:1px solid var(--etch);color:var(--ink-3);border-radius:3px;padding:6px 12px;cursor:pointer}
#skipBoot:hover{color:var(--ink);border-color:var(--accent)}
@media (prefers-reduced-motion:reduce){.boot-orbs i{animation:none;opacity:1}}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--etch-2);display:flex;flex-wrap:wrap;gap:8px 22px;font-size:12.5px;color:var(--ink-3)}
"""

BOOT_JS = """/* Launchpad boot sequence: quick on repeat visits in the same tab; Skip jumps straight in */
(async function () {
  const box = document.getElementById("boot"), log = document.getElementById("bootLog");
  if (!box || !log) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false, quick = false, lines = [];
  try { lines = JSON.parse(log.dataset.lines || "[]"); } catch (e) {}
  try { quick = sessionStorage.getItem("launchpad.booted") === "1"; sessionStorage.setItem("launchpad.booted", "1"); } catch (e) {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
  document.getElementById("skipBoot").onclick = () => { skip = true; };
  for (const t of lines) {
    if (skip) break;
    log.insertAdjacentText("beforeend", t + "\\n");
    await sleep(quick ? 50 : 360);
  }
  const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = "✓ Launchpad ready."; log.appendChild(ok);
  await sleep(skip || quick ? 80 : 450);
  box.classList.add("done");
  setTimeout(() => box.remove(), 700);
})();
"""

if __name__ == "__main__":
    main()
