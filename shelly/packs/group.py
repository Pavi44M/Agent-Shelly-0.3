"""Group HQ pack (v2.3): finance close, P&L, cash flow, people (roles only), procurement, board pack, governance. Synthetic data."""
from __future__ import annotations

from ..core.skills import skill


def _hq():
    from ..group import hq
    return hq.run()


@skill("group.pnl", pack="group", summary="P&L by business to EBITDA with intercompany eliminations, and the biggest variance in each business explained",
       inputs=["sales", "costs", "budgets", "Gateway charges"], outputs=["P&L", "variances"], triggers=["profit", "P&L", "EBITDA", "budget variance"])
def pnl():
    r = _hq(); return {"pnl": r["pnl"], "variances": r["variances"]}


@skill("group.close", pack="group", summary="Month-end close checklist by business day, owner and status", inputs=["ledgers"], outputs=["close checklist"], triggers=["month end", "close"])
def close():
    return _hq()["close"]


@skill("group.cash", pack="group", summary="13-week cash-flow forecast: receipts and payments by kind, the low point and the buffer",
       inputs=["takings", "terms", "payroll", "imports", "GST"], outputs=["weekly cash", "low point"], triggers=["cash flow", "cash"])
def cash():
    return _hq()["cash"]


@skill("group.people", pack="group", summary="Headcount and pay by business and role (roles only), leave owed, licences and certificates due",
       inputs=["rosters", "roles"], outputs=["headcount", "pay", "certificates"], triggers=["headcount", "licences", "certificates", "leave"])
def people():
    return _hq()["people"]


@skill("group.procurement", pack="group", summary="Categories bought separately across the group, spend and what buying as one saves",
       inputs=["supplier spend"], outputs=["savings", "actions"], triggers=["procurement", "suppliers", "buying"])
def procurement():
    return _hq()["procurement"]


@skill("group.board", pack="group", summary="Monthly board pack: results, risks, decisions needed, compliance", inputs=["everything above"], outputs=["board pack"], triggers=["board pack", "board"])
def board():
    return _hq()["board"]


@skill("group.governance", pack="group", summary="Every agent's action limit (what it does alone, the cap, what always escalates) and the audit log",
       inputs=["agent registry", "event bus", "approvals"], outputs=["limits", "audit log"], triggers=["limits", "audit", "governance"], confirm=True)
def governance():
    r = _hq(); return {"limits": r["limits"], "audit": r["audit"]}
