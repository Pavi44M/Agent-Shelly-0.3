"""The business switch (one big toggle between Shelly's two businesses), shared by every page.

    switch_html(base="../", active="medical")   ->  <nav> ... </nav>

active: retail | medical | gateway | launchpad | brain | store. The approvals badge is filled in by docs/kit/shelly-kit.js.
"""
STORE = ("Neighbourhood store", "Retail · Shelly store agent", "🛒", "")
MEDICAL = ("Tōtara Medical", "Supply Chain Command", "✚", "med")
GATEWAY = ("Gateway", "Warehousing & Transport", "⛟", "gw")


def switch_html(base: str = "", active: str = "retail") -> str:
    def opt(href, lab, sub, ic, cls, on):
        cur = ' aria-current="page"' if on else ""
        return (f'<a class="biz-opt {cls}" href="{href}"{cur}><span class="ic" aria-hidden="true">{ic}</span>'
                f'<span class="tx"><b>{lab}</b><small>{sub}</small></span></a>')

    def side(href, label, key):
        cur = ' aria-current="page"' if active == key else ""
        return f'<a class="biz-lp" href="{href}"{cur}>{label}</a>'
    return (f'<nav class="biz" aria-label="Choose a business">'
            f'<div class="biz-track">{opt(base or "./", *STORE, active == "retail")}'
            f'{opt(base + "supply-chain/", *MEDICAL, active == "medical")}'
            f'{opt(base + "gateway/", *GATEWAY, active == "gateway")}</div>'
            f'<div class="biz-side">{side(base + "store/", "▦ Floor", "store")}{side(base + "brain/", "🧠 Brain", "brain")}{side(base + "launchpad/", "⌘ Launchpad", "launchpad")}'
            f'<button class="biz-ap" type="button" id="apBadge" hidden aria-haspopup="dialog">'
            f'<span aria-hidden="true">🔔</span> Approvals <b id="apCount">0</b></button></div></nav>')
