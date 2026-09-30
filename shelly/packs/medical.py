"""Medical imports supply chain (module: modules/medical-supply-chain).

A supply-chain command dashboard for a New Zealand importer of medicines,
medical consumables and medical equipment: stock-outs and reorder points,
FEFO expiry risk, inbound shipments and Medsafe/WAND holds, supplier OTIF and
risk, SARIMA-X demand forecasts, client segments and a zoomable
supplier → product → client vision board with weekly plan vs actual.

The module keeps its own pipeline (it runs on its own data model), so these
skills call it rather than the retail engine. Demo data is synthetic.
"""
from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

from ..core.skills import skill

MODULE = Path(__file__).resolve().parents[2] / "modules" / "medical-supply-chain"
SITE = Path(__file__).resolve().parents[2] / "docs" / "supply-chain"


def _run(script: str, *args: str) -> None:
    argv = sys.argv
    try:
        sys.argv = [script, *args]
        runpy.run_path(str(MODULE / "src" / script), run_name="__main__")
    finally:
        sys.argv = argv


def _data() -> dict:
    return json.loads((MODULE / "dashboard" / "data.json").read_text())


@skill("medical.supply_chain", pack="medical",
       summary="Medical-imports supply chain: stock-out risk, expiry, inbound holds, supplier OTIF, forecasts and the vision board",
       inputs=["suppliers", "products", "customers", "sales_daily", "purchase_orders", "batches"],
       outputs=["dashboard (docs/supply-chain/)", "Monday brief", "escalations", "KPIs"],
       confirm=True,
       triggers=["supply chain", "medical imports", "which products will run out", "expiring stock",
                 "supplier OTIF", "shipments on hold", "sales vs plan by client", "vision board"])
def supply_chain(regenerate: bool = False, publish: bool = True) -> dict:
    """Run the medical supply-chain module end to end.

    Stock-out, expiry and clearance-hold escalations are proposals: each one
    waits for Pavi to approve or dismiss before anyone acts on it.
    """
    if regenerate or not (MODULE / "data" / "sales_daily.csv").exists():
        _run("generate_data.py")
    _run("pipeline.py")
    _run("vision.py")
    if publish:
        _run("build_dashboard.py", "--site", str(SITE))
    d = _data()
    return {"kpi": d["kpi"], "brief": d["brief"], "escalations": d["escalate"],
            "sales_vs_plan": d["vision"]["total"]}


@skill("medical.brief", pack="medical",
       summary="This week's medical supply-chain brief and escalations (from the last run)",
       outputs=["Monday brief", "escalations"],
       triggers=["supply chain brief", "what needs my attention in the supply chain"])
def brief() -> dict:
    """Read the Monday brief and the items escalated to a person from the last module run."""
    d = _data()
    return {"brief": d["brief"], "escalations": d["escalate"]}
