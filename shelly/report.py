"""
Digest renderers: HTML dashboard (self-contained, inline SVG charts with hover),
Markdown (for GitHub / email) and a WhatsApp-length team summary.
"""
from __future__ import annotations

import html
from datetime import datetime

import pandas as pd

CSS = """
:root{--surface:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--line:#e6e5e0;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--pos:#2a78d6;--neg:#e34948;--mid:#f0efec;
--p1:#c62828;--p2:#b26a00;--p3:#5f6b7a;--p1bg:#fdecea;--p2bg:#fff4e0;--p3bg:#eef1f5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--surface:#1a1a19;--card:#232322;--ink:#fff;--ink2:#c3c2b7;
--muted:#8f8e86;--line:#3a3a37;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--pos:#3987e5;--neg:#e66767;--mid:#383835;
--p1:#ff8a80;--p2:#ffc466;--p3:#b0bac6;--p1bg:#3a1f1d;--p2bg:#3a2e17;--p3bg:#2a2f36}}
:root[data-theme="dark"]{--surface:#1a1a19;--card:#232322;--ink:#fff;--ink2:#c3c2b7;--muted:#8f8e86;--line:#3a3a37;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--pos:#3987e5;--neg:#e66767;--mid:#383835;--p1:#ff8a80;--p2:#ffc466;--p3:#b0bac6;
--p1bg:#3a1f1d;--p2bg:#3a2e17;--p3bg:#2a2f36}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink);
font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 4px}h3{font-size:15px;margin:0 0 8px}
.sub{color:var(--ink2);margin:0}.phase{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:36px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:12px}
.summary{font-size:16px}.engine{font-size:12px;color:var(--muted);margin-top:8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.tile .l{font-size:12px;color:var(--ink2)}.tile .v{font-size:24px;font-weight:650;margin:2px 0}
.tile .d{font-size:12px;color:var(--ink2)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--ink2);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap}
.P1{background:var(--p1bg);color:var(--p1)}.P2{background:var(--p2bg);color:var(--p2)}.P3{background:var(--p3bg);color:var(--p3)}
.why{color:var(--ink2);font-size:12px}
svg{display:block;width:100%;height:auto}.wide{min-width:620px}svg text{fill:var(--ink2);font-size:11px}
.legend{display:flex;gap:16px;font-size:12px;color:var(--ink2);margin:4px 0 0}.legend i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.note{font-size:12px;color:var(--ink2);margin-top:8px}
details summary{cursor:pointer;color:var(--ink2);font-size:13px;margin-top:8px}
footer{margin-top:40px;font-size:12px;color:var(--muted)}
@media (max-width:640px){table.actions thead{display:none}table.actions tr{display:block;padding:10px 0;border-bottom:1px solid var(--line)}
table.actions td{display:block;border:0;padding:2px 0;text-align:left}table.actions td.n:not(:empty){font-weight:600}}
"""


def _m(v):
    return f"${v:,.0f}"


def _sm(v):
    return ("+" if v >= 0 else "−") + f"${abs(v):,.0f}"


def _pct(v):
    return f"{v:+.1f}%"


def _esc(s):
    return html.escape(str(s))


# ------------------------------------------------------------------ SVG charts
def svg_line(actual: pd.Series, fc: pd.Series, w=960, h=300) -> str:
    """Actual daily sales + dashed forecast; each point has a hover title."""
    pad_l, pad_r, pad_t, pad_b = 52, 30, 12, 28
    allv = pd.concat([actual, fc])
    ymax = allv.max() * 1.1
    xs = list(actual.index) + list(fc.index)
    n = len(xs)
    X = lambda i: pad_l + i * (w - pad_l - pad_r) / (n - 1)
    Y = lambda v: pad_t + (1 - v / ymax) * (h - pad_t - pad_b)
    g = []
    for t in range(0, 5):
        v = ymax * t / 4
        g.append(f'<line x1="{pad_l}" x2="{w - pad_r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="var(--line)"/>'
                 f'<text x="{pad_l - 6}" y="{Y(v) + 4:.1f}" text-anchor="end">${v / 1000:.1f}k</text>')
    a_pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(actual.values))
    off = len(actual) - 1
    f_pts = " ".join(f"{X(off + i):.1f},{Y(v):.1f}" for i, v in enumerate([actual.values[-1]] + list(fc.values)))
    dots = "".join(f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="6" fill="transparent"><title>{d:%a %d %b}: {_m(v)}</title></circle>'
                   for i, (d, v) in enumerate(actual.items()))
    dots += "".join(f'<circle cx="{X(off + 1 + i):.1f}" cy="{Y(v):.1f}" r="4" fill="var(--s2)" stroke="var(--card)" stroke-width="2">'
                    f'<title>{d:%a %d %b} forecast: {_m(v)}</title></circle>' for i, (d, v) in enumerate(fc.items()))
    ticks = "".join(f'<text x="{X(i):.1f}" y="{h - 8}" text-anchor="middle">{d:%d %b}</text>'
                    for i, d in enumerate(xs) if i % 14 == 0 or i == n - 1)
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Daily sales, actual and forecast">{"".join(g)}'
            f'<polyline points="{a_pts}" fill="none" stroke="var(--s1)" stroke-width="2"/>'
            f'<polyline points="{f_pts}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/>'
            f'<line x1="{X(off):.1f}" x2="{X(off):.1f}" y1="{pad_t}" y2="{h - pad_b}" stroke="var(--muted)" stroke-dasharray="2 3"/>'
            f'{dots}{ticks}</svg>'
            '<div class="legend"><span><i style="background:var(--s1)"></i>Actual</span>'
            '<span><i style="background:var(--s2)"></i>Forecast (best model per category)</span></div>')


def svg_diverging(items: pd.Series, w=960, row=28, label_w=170) -> str:
    """Horizontal diverging bars (e.g. $ vs budget)."""
    h = row * len(items) + 12
    m = max(items.abs().max(), 1)
    val_w = 80
    mid = label_w + (w - label_w - val_w) / 2
    half = (w - label_w - val_w) / 2 - 8
    out = [f'<line x1="{mid}" x2="{mid}" y1="0" y2="{h}" stroke="var(--muted)"/>']
    for i, (k, v) in enumerate(items.items()):
        y = 6 + i * row
        bw = abs(v) / m * half
        x = mid if v >= 0 else mid - bw
        col = "var(--pos)" if v >= 0 else "var(--neg)"
        out.append(f'<text x="{label_w - 8}" y="{y + 14}" text-anchor="end">{_esc(k)}</text>'
                   f'<rect x="{x:.1f}" y="{y + 3}" width="{max(bw, 1):.1f}" height="{row - 10}" rx="4" fill="{col}">'
                   f'<title>{_esc(k)}: {"+" if v >= 0 else "-"}{_m(abs(v))} vs budget</title></rect>'
                   f'<text x="{w - 4}" y="{y + 14}" text-anchor="end">{_sm(v)}</text>')
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Category sales vs budget">{"".join(out)}</svg>'


def svg_bridge(b: dict, w=460, h=230) -> str:
    steps = [("Last week", b["previous"], "total"), ("Volume", b["volume"], "d"), ("Mix", b["mix"], "d"),
             ("Price", b["price"], "d"), ("This week", b["current"], "total")]
    lo = min(b["previous"], b["current"]) * 0.97
    hi = max(b["previous"], b["current"], b["previous"] + max(b["volume"], 0)) * 1.01
    pad_t, pad_b = 16, 28
    Y = lambda v: pad_t + (1 - (v - lo) / (hi - lo)) * (h - pad_t - pad_b)
    bw = (w - 40) / len(steps)
    run = b["previous"]
    out = []
    for i, (lab, v, kind) in enumerate(steps):
        x = 20 + i * bw + bw * 0.2
        if kind == "total":
            y0, y1, col = Y(v), Y(lo), "var(--s1)"
            txt = _m(v)
        else:
            y0, y1 = sorted([Y(run), Y(run + v)])
            col = "var(--pos)" if v >= 0 else "var(--neg)"
            txt = ("+" if v >= 0 else "−") + _m(abs(v))
            run += v
        out.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw * 0.6:.1f}" height="{max(y1 - y0, 2):.1f}" rx="4" fill="{col}">'
                   f'<title>{lab}: {txt}</title></rect>'
                   f'<text x="{x + bw * 0.3:.1f}" y="{y0 - 4:.1f}" text-anchor="middle">{txt}</text>'
                   f'<text x="{x + bw * 0.3:.1f}" y="{h - 8}" text-anchor="middle">{lab}</text>')
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Sales bridge: volume, mix, price">{"".join(out)}</svg>'


def svg_channels(df: pd.DataFrame, w=460, h=230) -> str:
    """Delivery channels, last 14 days (two lines, direct labelled)."""
    pad_l, pad_r, pad_t, pad_b = 44, 70, 10, 26
    cols = [c for c in ["uber_eats", "on_demand"] if c in df]
    ymax = df[cols].max().max() * 1.15
    n = len(df)
    X = lambda i: pad_l + i * (w - pad_l - pad_r) / (n - 1)
    Y = lambda v: pad_t + (1 - v / ymax) * (h - pad_t - pad_b)
    out = [f'<line x1="{pad_l}" x2="{w - pad_r}" y1="{Y(0):.1f}" y2="{Y(0):.1f}" stroke="var(--line)"/>',
           f'<text x="{pad_l - 6}" y="{Y(ymax / 1.15) + 4:.1f}" text-anchor="end">{_m(ymax / 1.15)}</text>']
    for c, col, name in zip(cols, ["var(--s1)", "var(--s3)"], ["Uber Eats", "On-Demand"]):
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(df[c].values))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2"/>')
        out += [f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="3.5" fill="{col}"><title>{d:%a %d %b} {name}: {_m(v)}</title></circle>'
                for i, (d, v) in enumerate(df[c].items())]
        out.append(f'<text x="{X(n - 1) + 8:.1f}" y="{Y(df[c].values[-1]) + 4:.1f}">{name}</text>')
    out += [f'<text x="{X(i):.1f}" y="{h - 8}" text-anchor="middle">{d:%a %d}</text>'
            for i, d in enumerate(df.index) if i % 2 == 0]
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Delivery channel sales, last 14 days">{"".join(out)}</svg>'


def svg_models(lb: pd.DataFrame, w=460, row=28, label_w=110) -> str:
    h = row * len(lb) + 8
    m = lb["wape"].max() * 1.15
    out = []
    for i, r in enumerate(lb.itertuples()):
        y = 4 + i * row
        bw = r.wape / m * (w - label_w - 60)
        col = "var(--s1)" if i == 0 else "var(--muted)"
        out.append(f'<text x="{label_w - 8}" y="{y + 14}" text-anchor="end">{_esc(r.model)}</text>'
                   f'<rect x="{label_w}" y="{y + 3}" width="{bw:.1f}" height="{row - 10}" rx="4" fill="{col}">'
                   f'<title>{_esc(r.model)}: WAPE {r.wape:.1f}%, MAPE {r.mape:.1f}%</title></rect>'
                   f'<text x="{label_w + bw + 6:.1f}" y="{y + 14}">{r.wape:.1f}%</text>')
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Forecast model error (lower is better)">{"".join(out)}</svg>'


# ------------------------------------------------------------------ tables
def _table(df: pd.DataFrame, fmt: dict | None = None, num=()):
    fmt = fmt or {}
    th = "".join(f'<th class="{"n" if c in num else ""}">{_esc(c)}</th>' for c in df.columns)
    rows = []
    for _, r in df.iterrows():
        tds = "".join(f'<td class="{"n" if c in num else ""}">{_esc(fmt[c](r[c]) if c in fmt and pd.notna(r[c]) else ("" if pd.isna(r[c]) else r[c]))}</td>'
                      for c in df.columns)
        rows.append(f"<tr>{tds}</tr>")
    return f'<div class="scroll"><table><thead><tr>{th}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>'


# ------------------------------------------------------------------ HTML
def render_html(P, R, cfg, acts, summary, engine, quality) -> str:
    k = R["commercial"]["kpis"]
    c = k["current"]
    t = cfg["kpi_targets"]
    fc = R["forecast"]["forecast"]
    fc_daily = fc.groupby("date")["forecast_sales"].sum()
    daily = R["commercial"]["daily_sales"]
    actual = daily[daily.index > P.asof - pd.Timedelta(days=56)]

    def tile(label, value, delta):
        return f'<div class="tile"><div class="l">{label}</div><div class="v">{value}</div><div class="d">{delta}</div></div>'

    tiles = "".join([
        tile("Sales (7 days)", _m(c["sales"]), f'{_pct(k["wow_pct"])} WoW · {_pct(k["yoy_pct"])} YoY'),
        tile("vs Budget", _pct(k["vs_budget_pct"]), f'Budget {_m(k["budget"])}'),
        tile("Gross margin", f'{c["gm_pct"]:.1f}%', f'Target {t["gross_margin_pct"]}% · {_m(c["gross_margin"])}'),
        tile("Waste + markdown", f'{c["waste_pct"]:.1f}%', f'Target ≤{t["waste_pct_of_sales"]}% · {_m(c["waste_value"])}'),
        tile("Delivery share", f'{c["delivery_share_pct"]:.1f}%', f'Target {t["delivery_share_pct"]}%'),
        tile("Next 7 days (forecast)", _m(fc_daily.sum()), f'{_pct((fc_daily.sum() / c["sales"] - 1) * 100)} vs this week'),
    ])

    act_rows = "".join(
        f'<tr><td><span class="pill {a["priority"]}">{a["priority"]} · {a["when"]}</span></td>'
        f'<td><b>{_esc(a["area"])}</b><br>{_esc(a["action"])}<div class="why">{_esc(a["why"])}</div></td>'
        f'<td class="n">{_sm(a["weekly_impact_nzd"]) if a["weekly_impact_nzd"] else "–"}</td><td>{_esc(a["owner"])}</td></tr>'
        for a in acts)

    pl = R["commercial"]["category_pl"].reset_index()[["category", "sales", "gm_pct", "wow_pct", "yoy_pct", "vs_budget", "waste_value", "contribution"]]
    pl.columns = ["Category", "Sales", "GM %", "WoW %", "YoY %", "vs Budget", "Waste", "Contribution"]
    pl_html = _table(pl, {"Sales": _m, "GM %": lambda v: f"{v:.1f}", "WoW %": _pct, "YoY %": _pct,
                          "vs Budget": _sm, "Waste": _m, "Contribution": _m},
                     num=pl.columns[1:])

    an = R["anomalies"]
    an_html = _table(an[["date", "type", "item", "detail", "impact_nzd"]].rename(columns={
        "date": "Date", "type": "Signal", "item": "Item", "detail": "Detail", "impact_nzd": "Impact"}),
        {"Impact": _sm}, num=["Impact"]) if len(an) else "<p>No exceptions.</p>"

    seg = R["segments"]
    prof = seg["profile"][["segment", "n_skus", "avg_daily_units", "gm_pct", "waste_rate_pct",
                           "delivery_share_pct", "promo_uplift", "jaccard_stability", "stability_verdict"]].copy()
    prof.columns = ["Segment", "SKUs", "Units/day", "GM %", "Waste %", "Delivery %", "Promo uplift %", "Jaccard", "Stability"]
    seg_html = _table(prof, {c: (lambda v: f"{v:.1f}") for c in ["Units/day", "GM %", "Waste %", "Delivery %", "Promo uplift %"]} |
                      {"Jaccard": lambda v: f"{v:.2f}"}, num=prof.columns[1:8])
    members = seg["sku_segments"].groupby("segment")["product_name"].apply(lambda s: ", ".join(s)).reset_index()
    members.columns = ["Segment", "Products"]

    rp = R["replenishment"]
    rp_top = rp[rp["suggested_order"] > 0].head(15)[["product_name", "supplier", "est_on_hand", "days_cover", "reorder_point",
                                                     "suggested_order", "order_value", "status"]]
    rp_top.columns = ["Product", "Supplier", "On hand (est.)", "Days cover", "Reorder pt", "Order qty", "Order $", "Status"]
    rp_html = _table(rp_top, {"On hand (est.)": lambda v: f"{v:.0f}", "Days cover": lambda v: f"{v:.1f}",
                              "Reorder pt": lambda v: f"{v:.0f}", "Order qty": lambda v: f"{v:.0f}", "Order $": _m},
                     num=["On hand (est.)", "Days cover", "Reorder pt", "Order qty", "Order $"])

    lp = R["labour"][["day", "forecast_sales", "hours_needed", "wage_cost", "wage_pct_sales"]].copy()
    lp.columns = ["Day", "Forecast sales", "Hours", "Wage cost", "Wage % sales"]
    lp_html = _table(lp, {"Forecast sales": _m, "Hours": lambda v: f"{v:.1f}", "Wage cost": _m,
                          "Wage % sales": lambda v: f"{v:.1f}%"}, num=lp.columns[1:])

    best = R["forecast"]["best_by_category"].copy()
    best.columns = ["Category", "Best model", "WAPE %"]
    best_html = _table(best, {"WAPE %": lambda v: f"{v:.1f}"}, num=["WAPE %"])

    q_html = "".join(f"<li><b>{_esc(s.title())}</b> – {_esc(m)}</li>" for s, m in quality.issues)

    ch = P.sales.groupby(["date", "channel"])["net_sales"].sum().unstack(fill_value=0)
    ch = ch[ch.index > P.asof - pd.Timedelta(days=14)]

    lb = R["forecast"]["model_leaderboard"]
    base_note = ""
    sn = lb[lb["model"] == "Seasonal Naive"]["wape"].iloc[0]
    if lb.iloc[0]["model"] in ("SARIMA-X", "XGBoost"):
        base_note = (f"{lb.iloc[0]['model']} beat the seasonal-naive baseline by {sn - lb.iloc[0]['wape']:.1f} WAPE points, "
                     "so the extra complexity pays for itself here.")
    else:
        base_note = ("A simple baseline won. That's a real finding, not a failure: in the MAB thesis seasonal naive "
                     "(3.75% MAPE) also beat XGBoost (5.03%).")

    b = R["commercial"]["bridge"]
    sil = ", ".join(f"k={kk}: {v:.2f}" for kk, v in seg["silhouette"].items())

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shelly Weekly Digest</title><style>{CSS}</style></head><body><div class="wrap">
<h1>Shelly · Weekly Sales Digest</h1>
<p class="sub">{_esc(cfg['store']['name'])} · week ending {P.asof:%A %d %B %Y} · for {_esc(cfg['store']['audience'])}</p>

<div class="card summary">{_esc(summary)}<div class="engine">Summary written by: {_esc(engine)}</div></div>
<div class="tiles">{tiles}</div>

<div class="phase">Action plan</div>
<h2>What to do, in priority order</h2>
<div class="card"><div class="scroll"><table class="actions"><thead><tr><th>Priority</th><th>Action</th><th class="n">$ / week</th><th>Owner</th></tr></thead>
<tbody>{act_rows}</tbody></table></div></div>

<div class="phase">Performance</div>
<h2>Daily sales and 7-day forecast</h2>
<div class="card"><div class="scroll"><div class="wide">{svg_line(actual, fc_daily)}</div></div></div>
<div class="grid2">
 <div><h2>What moved sales vs last week</h2><div class="card">{svg_bridge(b)}
 <p class="note">Volume = more or fewer units, mix = shift toward cheaper or dearer lines, price = selling-price change (promos).</p></div></div>
 <div><h2>Delivery channels, last 14 days</h2><div class="card">{svg_channels(ch)}
 <p class="note">Each point is one day's sales. A drop to zero is an outage, not a demand change.</p></div></div>
</div>
<h2>Category vs budget</h2>
<div class="card"><div class="scroll"><div class="wide">{svg_diverging(R['commercial']['category_pl']['vs_budget'].sort_values())}</div></div></div>
<h2>Category P&amp;L</h2><div class="card">{pl_html}</div>

<div class="phase">Exceptions</div>
<h2>What the agent flagged</h2>
<div class="card">{an_html}<p class="note">Method: robust z-score (median/MAD) against the same weekday over the previous 8 weeks.
Declines are checked against last year to separate seasonality from real problems. SAP counts are compared with shelf counts.</p></div>

<div class="phase">Operations</div>
<h2>Reorder list (JIT)</h2><div class="card">{rp_html}<p class="note">Reorder point = demand over lead time + review period, plus safety stock
(z={cfg['replenishment']['service_level_z']}). Order-up-to is capped at the product's shelf life so we don't order in waste. Recalled lines are blocked.
Showing the top 15. The full list is in the Excel workbook.</p></div>
<h2>Roster plan, next 7 days</h2><div class="card">{lp_html}<p class="note">Hours = forecast sales ÷ ${cfg['labour']['sales_per_labour_hour']} per labour hour,
minimum {cfg['labour']['min_hours_per_day']} h/day.</p></div>

<div class="phase">Strategy</div>
<h2>Product segments (K-means)</h2>
<div class="card">{seg_html}
<p class="note">Features: velocity, margin, demand volatility, waste rate, delivery share and promo uplift (last 13 weeks, standardised).
Silhouette by k: {sil}, so k={seg['k']} was chosen. Stability is the bootstrap Jaccard over 100 resamples (Hennig: under 0.6 means the cluster doesn't hold up).
PCA explains {sum(seg['pca_var']) * 100:.0f}% of variance in 2 components.</p>
<details><summary>Products in each segment</summary>{_table(members)}</details></div>

<div class="phase">Model evaluation (CRISP-DM phase 5)</div>
<div class="grid2">
 <div><h2>Forecast accuracy by model</h2><div class="card">{svg_models(lb)}
 <p class="note">WAPE = total absolute error ÷ total actual sales, lower is better. Rolling-origin backtest: {cfg['analysis']['backtest_days'] // 7} folds × 7 days.
 {_esc(base_note)}</p></div></div>
 <div><h2>Model chosen for each category</h2><div class="card">{best_html}</div></div>
</div>

<div class="phase">Data understanding (CRISP-DM phase 2)</div>
<h2>Data quality score: {quality.score:.0f}/100</h2>
<div class="card"><ul>{q_html}</ul><p class="note">{sum(quality.rows.values()):,} rows across {len(quality.rows)} tables · {quality.date_range[0]} to {quality.date_range[1]}</p></div>

<footer>Generated {datetime.now():%d %b %Y %H:%M} by Shelly v{__import__('shelly').__version__} · CRISP-DM pipeline · Python (pandas, scikit-learn, statsmodels, XGBoost) ·
The Excel, Power BI, Tableau and SQL outputs are in the same folder.</footer>
</div></body></html>"""


# ------------------------------------------------------------------ Markdown & WhatsApp
def render_markdown(P, R, cfg, acts, summary) -> str:
    k = R["commercial"]["kpis"]
    c = k["current"]
    lines = [f"# Weekly Sales Digest: week ending {P.asof:%d %b %Y}", "", summary, "",
             "| KPI | Value | vs last week | vs last year |", "|---|---:|---:|---:|",
             f"| Sales | {_m(c['sales'])} | {_pct(k['wow_pct'])} | {_pct(k['yoy_pct'])} |",
             f"| Gross margin | {c['gm_pct']:.1f}% | | |",
             f"| Waste + markdown | {c['waste_pct']:.1f}% of sales | | |",
             f"| Delivery share | {c['delivery_share_pct']:.1f}% | | |",
             f"| vs Budget | {_pct(k['vs_budget_pct'])} | | |", "", "## Actions", ""]
    for a in acts:
        imp = f" (~{_m(abs(a['weekly_impact_nzd']))}/wk)" if a["weekly_impact_nzd"] else ""
        lines.append(f"- **{a['priority']} {a['area']}**: {a['action']}{imp}. _{a['why']}_ ({a['owner']})")
    lines += ["", "## Forecast model leaderboard", "", "| Model | WAPE % | MAPE % |", "|---|---:|---:|"]
    lines += [f"| {r.model} | {r.wape:.1f} | {r.mape:.1f} |" for r in R["forecast"]["model_leaderboard"].itertuples()]
    return "\n".join(lines) + "\n"


def render_whatsapp(P, R, acts) -> str:
    k = R["commercial"]["kpis"]
    c = k["current"]
    p1 = [a for a in acts if a["priority"] == "P1"][:4]
    msg = [f"*Shelly weekly update: w/e {P.asof:%d %b}*",
           f"Sales {_m(c['sales'])} ({_pct(k['wow_pct'])} WoW, {_pct(k['vs_budget_pct'])} vs budget)",
           f"GM {c['gm_pct']:.1f}% · Waste {c['waste_pct']:.1f}% · Delivery {c['delivery_share_pct']:.1f}%", "",
           "*Today:*"]
    msg += [f"• {a['action'].split(';')[0].split('. Top lines')[0][:110]}" for a in p1]
    fc = R["forecast"]["forecast"].groupby("date")["forecast_sales"].sum()
    msg += ["", f"Busiest day next week: {fc.idxmax():%A} (~{_m(fc.max())})"]
    return "\n".join(msg)
