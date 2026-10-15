"""Commercial pack (v2.5.0): promotions, discount depth and baskets for the Neighbourhood Store. Synthetic data."""
from __future__ import annotations

from ..core.skills import skill


def _c():
    from .. import commercial
    return commercial.run()


@skill("commercial.promo", pack="commercial", summary="Was each promo worth it: uplift, margin gained, cannibalisation, the dip after, and a keep / shallower / stop call per line",
       inputs=["daily sales by line", "promo flags", "products"], outputs=["promo scorecard", "net margin"], triggers=["promo", "promotion", "was it worth it", "uplift"])
def promo():
    r = _c(); return {"totals": r["totals"], "categories": r["categories"], "scorecard": r["scorecard"]}


@skill("commercial.depth", pack="commercial", summary="Discount depth lab: margin a day at 5% to 30% off and the supplier funding needed to break even",
       inputs=["promo history", "prices", "costs"], outputs=["depth curve", "funding ask"], triggers=["discount", "price", "elasticity", "supplier funding"])
def depth():
    return _c()["price_lab"]


@skill("commercial.basket", pack="commercial", summary="What sells together (support, confidence, lift) and shopping missions from anonymous baskets",
       inputs=["baskets"], outputs=["pairs", "missions", "placement ideas"], triggers=["basket", "sells together", "cross-sell", "mission"])
def basket():
    return _c()["basket"]
