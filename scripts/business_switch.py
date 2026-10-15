"""The business switch (one big toggle between Shelly's two businesses), shared by every page.

    switch_html(base="../", active="medical")   ->  <nav> ... </nav>

active: retail | medical | gateway | tower | launchpad | brain | store. The approvals badge is filled in by docs/kit/shelly-kit.js.
"""
STORE = ("Neighbourhood store", "Retail · Shelly store agent", "🛒", "")
MEDICAL = ("Tōtara Medical", "Supply Chain Command", "✚", "med")
GATEWAY = ("Gateway", "Warehousing & Transport", "⛟", "gw")


CUR = ' aria-current="page"'
# every other workspace, grouped, behind one "Workspaces" button (v2.4.1: the row of 11 links was too crowded)
GROUPS = [
    ("Store", [("store/", "▦", "Floor", "store", "3D store plan"), ("shift/", "⏱", "Shift", "shift", "the Duty Manager's day"),
               ("vision/", "👁", "Vision", "vision", "camera counts"), ("lp/", "🛡", "Loss", "lp", "loss prevention"),
               ("commercial/", "💲", "Commercial", "commercial", "promos, price, baskets")]),
    ("Ops & HQ", [("ops/", "⛓", "Ops", "ops", "docks, suppliers, flows"), ("group/", "🏛", "Group", "group", "finance, people, board"),
                         ("tower/", "🏙", "Tower", "tower", "head office in 3D"))]),
    ("Shelly", [("ask/", "💬", "Ask", "ask", "ask anything"), ("brain/", "🧠", "Brain", "brain", "every agent"),
                ("os/", "⚙", "OS", "os", "data model + event bus"), ("launchpad/", "⌘", "Launchpad", "launchpad", "everything, one tap")]),
]


def switch_html(base: str = "", active: str = "retail") -> str:
    def opt(href, lab, sub, ic, cls, on):
        cur = ' aria-current="page"' if on else ""
        return (f'<a class="biz-opt {cls}" href="{href}"{cur}><span class="ic" aria-hidden="true">{ic}</span>'
                f'<span class="tx"><b>{lab}</b><small>{sub}</small></span></a>')

    cur = next(((ic, lab) for _, items in GROUPS for _, ic, lab, key, _ in items if key == active), None)
    menu = "".join(
        f'<div class="biz-grp"><span class="biz-gh">{g}</span>' + "".join(
            f'<a class="biz-lp" href="{base}{href}"{CUR if key == active else ""}><span aria-hidden="true">{ic}</span><b>{lab}</b><small>{note}</small></a>'
            for href, ic, lab, key, note in items) + "</div>" for g, items in GROUPS)
    summ = (f'<span aria-hidden="true">{cur[0]}</span> {cur[1]}' if cur else '<span aria-hidden="true">⌘</span> Workspaces')
    return (f'<nav class="biz" aria-label="Choose a business">'
            f'<div class="biz-track">{opt(base or "./", *STORE, active == "retail")}'
            f'{opt(base + "supply-chain/", *MEDICAL, active == "medical")}'
            f'{opt(base + "gateway/", *GATEWAY, active == "gateway")}</div>'
            f'<div class="biz-side"><details class="biz-more"><summary class="biz-ws{" on" if cur else ""}">{summ} <i aria-hidden="true">▾</i></summary>'
            f'<div class="biz-menu">{menu}</div></details>'
            f'<button class="biz-ap" type="button" id="apBadge" hidden aria-haspopup="dialog">'
            f'<span aria-hidden="true">🔔</span> <span class="lbl">Approvals</span> <b id="apCount">0</b></button></div></nav>')
