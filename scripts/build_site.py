"""Run Shelly and refresh the website in docs/.

    python scripts/build_site.py                 # sample data, latest date in the data
    python scripts/build_site.py --data data/real
"""
import argparse
import glob
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from shelly.agent import run  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--data", default=str(ROOT / "data/sample"))
ap.add_argument("--asof", default=None)
a = ap.parse_args()

# 1) industry packs (demo data) -> reports + decisions for confirmation
import json  # noqa: E402
from datetime import date  # noqa: E402

import yaml  # noqa: E402
from shelly.core.decisions import DecisionLog, propose_from_actions  # noqa: E402
from shelly.core.skills import load_all  # noqa: E402
from shelly.packs import pack_markdown, run_pack  # noqa: E402

load_all()
gov = yaml.safe_load(open(ROOT / "config.yaml")).get("governance", {})
packs_web = []
(ROOT / "docs/example").mkdir(parents=True, exist_ok=True)
for name in ["electronics", "wholesale", "warehousing", "production"]:
    pr = run_pack(name)
    decs = propose_from_actions(DecisionLog(), [f.as_action() for f in pr["findings"]], date.today().isoformat(), gov, pack=name)
    (ROOT / "docs/example" / f"pack_{name}.md").write_text(pack_markdown(pr, decs))
    packs_web.append({"pack": name, "title": pr["title"],
                      "kpis": {k: v for r in pr["results"].values() for k, v in r.kpis.items()},
                      "findings": [f.as_action() for f in pr["findings"][:4]]})

# 2) the weekly retail run (also learns from decisions and writes the validation report)
res = run(a.data, str(ROOT / "outputs"), a.asof)
web_js = Path(res["files"]["web"])
data = json.loads(web_js.read_text()[len("window.SHELLY_DATA = "):].rstrip().rstrip(";"))
data["packs"] = packs_web
web_js.write_text("window.SHELLY_DATA = " + json.dumps(data, default=str, separators=(",", ":")) + ";\n")
shutil.copy(res["files"]["run_report"], ROOT / "docs/example/run_report.md")
(ROOT / "docs/data").mkdir(parents=True, exist_ok=True)
shutil.copy(res["files"]["web"], ROOT / "docs/data/shelly-data.js")
shutil.copy(res["files"]["html"], ROOT / "docs/digest.html")
shutil.copy(res["files"]["excel"], ROOT / "docs/example" / Path(res["files"]["excel"]).name)
for old in glob.glob(str(ROOT / "docs/example/Weekly_Sales_Digest_*.xlsx")):
    if Path(old).name != Path(res["files"]["excel"]).name:
        Path(old).unlink()
print("Site refreshed: docs/index.html now shows week ending", res["prepared"].asof.date())

# 3) v1.1 report engine: every report as a web page spec + an Excel workbook (dashboard, model, pivots, raw, lookups)
from shelly import __version__  # noqa: E402
from shelly.reports.build import build_all, write_web_bundle  # noqa: E402
from shelly.reports.context import Ctx  # noqa: E402

cfg = yaml.safe_load(open(ROOT / "config.yaml"))
ctx = Ctx(res["prepared"], res["results"], cfg, res["actions"], res["summary"], __version__, cfg["store"]["name"],
          synthetic=Path(a.data).resolve() == (ROOT / "data/sample").resolve())
rep = build_all(ctx, ROOT / "docs/reports", xlsx=True, with_cache=True)
write_web_bundle(rep, ROOT / "docs/data/shelly-reports.js")
print(f"Reports: {len(rep['specs'])} report views, {len(rep['files'])} Excel workbooks in docs/reports/")

# Shelly Brain (agents, approvals queue) first, then the Launchpad that reads it
runpy_brain = __import__("runpy")
runpy_brain.run_path(str(ROOT / "scripts" / "build_brain.py"), run_name="__main__")

# Store Floor: the 3D store plan with this week's numbers on every shelf (docs/store/)
runpy_brain.run_path(str(ROOT / "scripts" / "build_store.py"), run_name="__main__")

# Launchpad: refresh the figures on docs/launchpad/ (retail numbers change every week)
import runpy  # noqa: E402
runpy.run_path(str(ROOT / "scripts" / "build_launchpad.py"), run_name="__main__")
