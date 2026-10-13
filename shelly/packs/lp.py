"""Loss Prevention pack (Shelly Intelligence · Loss Prevention): patterns about stock and places, never people.
Locked to Shelly's own businesses; every case is checked by a person; nobody is identified."""
from __future__ import annotations

from ..core.skills import skill


def _cfg():
    from ..lp.run import load_cfg
    return load_cfg()


@skill("lp.unpaid_exit", pack="lp", summary="Store pattern: picked at a high-risk shelf, concealed (pose skeleton only), left without paying for it -> a case for the Duty Manager",
       inputs=["aisle camera skeletons (face points dropped)", "till transactions", "door"], outputs=["assist prompts", "review cases"], triggers=["shoplifting", "theft", "suspicious", "loss prevention"], confirm=True)
def unpaid_exit(days: int = 1):
    from ..lp.run import week
    w = week(_cfg(), days)["store"]; return {"cases": len([c for c in w["cases"] if c["rule"] == "unpaid_exit"]), "assists": len(w["assists"])}


@skill("lp.cases", pack="lp", summary="Every loss case across Shelly's sites (store, Gateway, Tōtara, Tower) with the rule, steps, value and owner",
       inputs=["camera patterns", "POS, self-checkout, dock booking, gate, WMS, access and asset-tag events"], outputs=["case queue"], triggers=["loss cases", "incidents"])
def cases(days: int = 1):
    from ..lp.run import week
    return {s: len(w["cases"]) for s, w in week(_cfg(), days).items()}


@skill("lp.evidence", pack="lp", summary="Evidence pack for a confirmed case: steps, clip window (faces pixelated), value, police report and trespass blanks",
       inputs=["a review case"], outputs=["evidence pack (markdown)"], triggers=["evidence", "police report"], confirm=True)
def evidence(case: dict):
    from ..lp.evidence import pack, pack_markdown
    return pack_markdown(pack(case, _cfg()))


@skill("lp.shrink", pack="lp", summary="Step 1, no camera: where the loss is, by cause and by place, for a Shelly site",
       inputs=["sales", "stock counts", "waste", "receipts"], outputs=["loss by cause", "loss by place"], triggers=["shrinkage", "where is the loss"])
def shrink(site: str = "store"):
    from ..lp.evidence import shrink as S
    return S(site)


@skill("lp.pia", pack="lp", summary="Privacy impact checklist for a Shelly site (signs, staff notice, access, retention, disclosure, fairness)",
       inputs=["site cameras and rules"], outputs=["checklist"], triggers=["privacy impact", "cctv law"])
def pia(site: str = "store"):
    from ..lp.evidence import pia as P
    return P(_cfg(), site)
