"""Operations pack (v2.2): Gateway docks, labour and billing; Tōtara supplier scorecards, expiry rescue and what-if. Synthetic data."""
from __future__ import annotations

from ..core.skills import skill


@skill("ops.docks", pack="ops", summary="Dock scheduler: every truck into a dock (cold loads on chilled docks), clashes over 30 minutes with a fix",
       inputs=["shipments", "inbound deliveries", "docks per site"], outputs=["dock schedule", "clashes"], triggers=["dock", "truck slot", "dock clash"])
def docks():
    from ..ops.gateway_ops import run
    return run()["docks"]


@skill("ops.labour", pack="ops", summary="Labour planner: pickers, forklift drivers and loaders per shift from the day's pallets, against the roster",
       inputs=["dock schedule", "roster"], outputs=["people needed vs rostered"], triggers=["how many pickers", "short of staff"])
def labour():
    from ..ops.gateway_ops import run
    return run()["labour"]


@skill("ops.billing", pack="ops", summary="Client billing: storage by temperature, handling, deliveries and cold-chain monitoring, against the contract",
       inputs=["pallets", "movements", "deliveries", "contracts"], outputs=["invoices"], triggers=["invoice", "billing"], confirm=True)
def billing():
    from ..ops.gateway_ops import run
    return run()["billing"]


@skill("ops.scorecards", pack="ops", summary="Supplier scorecards: on time, in full, steady lead times; grade A-D and the one thing to raise",
       inputs=["purchase orders", "receipts"], outputs=["scorecards"], triggers=["supplier scorecard", "supplier review"])
def scorecards():
    from ..ops.totara_ops import run
    return run()["scorecards"]


@skill("ops.expiry", pack="ops", summary="Expiry rescue: short-dated batches offered to healthcare clients who will use them in time",
       inputs=["batches", "client usage"], outputs=["offers", "value rescued"], triggers=["expiry", "short-dated"])
def expiry():
    from ..ops.totara_ops import run
    return run()["expiry"]


@skill("ops.whatif", pack="ops", summary="What-if planner: a supplier 7, 14 or 28 days late, the SKUs that run short and the best fix",
       inputs=["inventory cover", "suppliers"], outputs=["SKUs short", "sales at stake", "fixes"], triggers=["what if", "supplier late"])
def whatif():
    from ..ops.totara_ops import run
    return run()["what_if"]
