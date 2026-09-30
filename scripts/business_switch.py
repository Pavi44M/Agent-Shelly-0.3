"""The business switch (one big toggle between Shelly's two business models), shared by every page.

    switch_html(base="../", active="medical")   ->  <nav> ... </nav>
"""
STORE = ("Neighbourhood store", "Retail · Shelly store agent", "🛒", "")
MEDICAL = ("Tōtara Medical", "Supply Chain Command", "✚", "med")


def switch_html(base: str = "", active: str = "retail") -> str:
    def opt(href, lab, sub, ic, cls, on):
        cur = ' aria-current="page"' if on else ""
        return (f'<a class="biz-opt {cls}" href="{href}"{cur}><span class="ic" aria-hidden="true">{ic}</span>'
                f'<span class="tx"><b>{lab}</b><small>{sub}</small></span></a>')
    lp = ' aria-current="page"' if active == "launchpad" else ""
    return (f'<nav class="biz" aria-label="Choose a business">'
            f'<div class="biz-track">{opt(base or "./", *STORE, active == "retail")}'
            f'{opt(base + "supply-chain/", *MEDICAL, active == "medical")}</div>'
            f'<a class="biz-lp" href="{base}launchpad/"{lp}>⌘ Launchpad</a></nav>')
