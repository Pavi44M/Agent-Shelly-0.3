"""Build every report: specs for the web report page + Excel workbooks (+ PDFs when asked).

    python -m shelly report all                       every report, Excel + web specs
    python -m shelly report budget --months 6 --category Dairy --pdf
"""
from __future__ import annotations

import json
import time
import warnings
from pathlib import Path

from . import packs as PK
from . import retail as RT
from .context import Ctx
from .excel import build_workbook, cache_values

CATALOG = [
    {"type": "budget", "title": "Budget & forecast plan", "file": "Shelly_Budget_Plan.xlsx", "horizons": [1, 3, 6, 12], "default": 3, "unit": "months",
     "per_category": True, "blurb": "Monthly budget (last year + growth target) against Shelly's forecast, by month and category.",
     "words": ["budget", "plan", "target", "next quarter", "quarter", "months", "annual", "year plan", "financial year"]},
    {"type": "forecast", "title": "13-week sales forecast", "file": "Shelly_13_Week_Forecast.xlsx", "horizons": [4, 8, 13], "default": 13, "unit": "weeks",
     "per_category": True, "blurb": "Weekly forecast with an 80% range, compared with last year.",
     "words": ["forecast", "projection", "predict", "outlook", "weeks ahead", "next weeks", "future sales"]},
    {"type": "weekly", "title": "Weekly trading report", "file": "Shelly_Weekly_Trading.xlsx", "per_category": True,
     "blurb": "KPIs, daily sales, category P&L, channels, exceptions and actions for the week.",
     "words": ["weekly", "trading", "week report", "performance", "kpi", "digest", "how did we trade", "p&l", "pnl"]},
    {"type": "category", "title": "Category review", "file": "Shelly_Category_Review.xlsx", "per_category": True,
     "blurb": "13-week category and product review: trend, margin, ABC, range calls.",
     "words": ["category review", "range review", "product review", "products", "assortment", "abc", "category"]},
    {"type": "labour", "title": "Roster & labour plan", "file": "Shelly_Roster_Labour.xlsx", "per_category": False,
     "blurb": "Hours and wages for the next 7 days and 13 weeks from the forecast.",
     "words": ["roster", "labour", "labor", "staff", "hours", "wage", "shifts", "rostering", "people"]},
    {"type": "stock", "title": "Stock & reorder plan", "file": "Shelly_Stock_Reorder.xlsx", "per_category": True,
     "blurb": "Live reorder calculation: safety stock, reorder points, order quantities by supplier.",
     "words": ["stock", "reorder", "order", "inventory", "replenish", "supplier", "purchase", "ordering"]},
    {"type": "waste", "title": "Waste & shrink report", "file": "Shelly_Waste_Shrink.xlsx", "per_category": True,
     "blurb": "Waste, markdowns and stock-count shrink by category, product and reason.",
     "words": ["waste", "shrink", "markdown", "wastage", "loss", "write off", "theft"]},
    {"type": "pack-electronics", "title": "Consumer electronics report", "file": "Shelly_Pack_Electronics.xlsx", "per_category": False, "pack": "electronics",
     "blurb": "Sell-through, weeks of cover, aged stock, price erosion, attach rate.", "words": ["electronics", "tv", "phones", "sell through", "aged stock"]},
    {"type": "pack-wholesale", "title": "Wholesale report", "file": "Shelly_Pack_Wholesale.xlsx", "per_category": False, "pack": "wholesale",
     "blurb": "Customer profitability, receivables ageing, fill rate and OTIF.", "words": ["wholesale", "customer", "debtors", "receivables", "otif", "credit"]},
    {"type": "pack-warehousing", "title": "Warehouse operations report", "file": "Shelly_Pack_Warehousing.xlsx", "per_category": False, "pack": "warehousing",
     "blurb": "ABC-XYZ slotting, pick productivity, capacity.", "words": ["warehouse", "warehousing", "picking", "slotting", "capacity", "dc"]},
    {"type": "pack-production", "title": "Production report", "file": "Shelly_Pack_Production.xlsx", "per_category": False, "pack": "production",
     "blurb": "OEE, scrap and schedule adherence by line.", "words": ["production", "manufacturing", "oee", "scrap", "factory", "line"]},
]


def _specs_for(ctx: Ctx, t: dict) -> dict:
    cats = ["All"] + (ctx.categories if t["per_category"] else [])
    out = {}
    fn = getattr(RT, t["type"] + "_specs")
    for c in cats:
        if "horizons" in t:
            for h in t["horizons"]:
                sp = fn(ctx, c, h)
                out[sp["id"]] = sp
        else:
            sp = fn(ctx, c)
            out[sp["id"]] = sp
    return out


def build_all(ctx: Ctx, out_dir, xlsx: bool = True, with_cache: bool = True, only: list | None = None, log=print) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    specs, files = {}, {}
    from ..core.skills import load_all
    from ..packs import run_pack
    from ..packs.common import PACKS
    load_all()
    for t in CATALOG:
        if only and t["type"] not in only:
            continue
        t0 = time.time()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if "pack" in t:
                d = PACKS[t["pack"]]["demo"]()
                res = run_pack(t["pack"], d)
                sp = PK.pack_spec(t["pack"], res)
                sp["excel"] = t["file"]
                specs[sp["id"]] = sp
                plan = PK.pack_workbook(t["pack"], d, res) if xlsx else None
            else:
                ss = _specs_for(ctx, t)
                for sp in ss.values():
                    sp["excel"] = t["file"]
                specs.update(ss)
                plan = getattr(RT, t["type"] + "_workbook")(ctx) if xlsx else None
            if plan is not None:
                p = out / t["file"]
                build_workbook(plan, p)
                cached = cache_values(str(p)) if with_cache else False
                files[t["type"]] = str(p)
        log(f"  report {t['type']:18s} {'xlsx' + (' +values' if xlsx and cached else '') if xlsx else 'specs'} ({time.time() - t0:.1f}s)")
    return {"specs": specs, "files": files, "catalog": [{k: v for k, v in t.items()} for t in CATALOG]}


def write_web_bundle(result: dict, path) -> str:
    """docs/data/shelly-reports.js: catalog + every spec, loaded by the chat and the report page."""
    js = "window.SHELLY_REPORTS = " + json.dumps({"catalog": result["catalog"], "specs": result["specs"]},
                                                  separators=(",", ":"), ensure_ascii=False) + ";\n"
    Path(path).write_text(js, encoding="utf-8")
    return str(path)
