/* Shelly Commercial lab (synthetic data from docs/data/commercial.js, built by scripts/build_commercial.py) */
(function () {
  "use strict";
  const D = window.SHELLY_COMMERCIAL, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-NZ");
  const mood = (m, ms = 2500) => dispatchEvent(new CustomEvent("shelly:mood", { detail: { mood: m, ms } }));
  const T = D.totals, B = D.basket;
  $("#ver").textContent = D.version;

  /* ---- KPIs */
  const avgUp = D.events.reduce((a, e) => a + (e.uplift_pct || 0), 0) / D.events.length;
  $("#kpis").innerHTML = [[D.events.length, "promotions scored", `${D.years} years, in store`], [`${D.share_worth_it}%`, "paid their way", "net margin above zero"],
    [`+${Math.round(avgUp)}%`, "average extra units", "shoppers do respond"], [$$(T.net), "net margin", "after cannibalisation and the dip"],
    [B.baskets.toLocaleString("en-NZ"), "baskets analysed", `${B.days} days · simulated`], [B.pairs[0] ? `${B.pairs[0].lift}×` : "", "strongest pair", B.pairs[0] ? `${B.pairs[0].a_name} + ${B.pairs[0].b_name}` : ""]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---- actions */
  $("#acts").innerHTML = D.actions.map(a => `<li>${esc(a)}</li>`).join("");

  /* ---- margin bridge: where two years of promo margin went */
  (function bridge() {
    const steps = [["Margin on the extra units", T.extra_gp], ["Discount on units that would have sold anyway", -T.subsidy],
      ["Taken from other lines in the category", -T.cannibalised], ["The dip after the promo", -T.dip]];
    const W = 960, H = 300, L = 40, R = 30, top = 30, bot = 230, n = steps.length + 1, bw = (W - L - R) / n;
    let run = 0; const pts = steps.map(([k, v]) => { const a = run; run += v; return { k, v, a, b: run }; });
    const lo = Math.min(0, ...pts.map(p => Math.min(p.a, p.b))), hi = Math.max(0, ...pts.map(p => Math.max(p.a, p.b)));
    const y = v => top + (hi - v) / (hi - lo) * (bot - top);
    let s = `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#3d4a5c"/>`;
    pts.forEach((p, i) => { const x = L + i * bw + bw * .18, w = bw * .64, y1 = y(Math.max(p.a, p.b)), h = Math.max(2, Math.abs(y(p.a) - y(p.b)));
      s += `<rect x="${x}" y="${y1}" width="${w}" height="${h}" rx="3" fill="${p.v >= 0 ? "#3fb87f" : "#e66767"}" fill-opacity=".75"><title>${esc(p.k)}: ${$$(p.v)}</title></rect>` +
        `<text x="${x + w / 2}" y="${y1 - 6}" text-anchor="middle" class="bv">${$$(p.v)}</text>` +
        `<foreignObject x="${L + i * bw}" y="${bot + 8}" width="${bw}" height="60"><div class="bl">${esc(p.k)}</div></foreignObject>`;
      if (i < pts.length - 1) s += `<line x1="${x + w}" x2="${x + bw}" y1="${y(p.b)}" y2="${y(p.b)}" stroke="#7d8a9c" stroke-dasharray="3 3"/>`; });
    const x = L + steps.length * bw + bw * .18, w = bw * .64;
    s += `<rect x="${x}" y="${y(Math.max(0, run))}" width="${w}" height="${Math.abs(y(run) - y(0))}" rx="3" fill="#9aa6b6"><title>Net: ${$$(T.net)}</title></rect>` +
      `<text x="${x + w / 2}" y="${y(Math.max(0, run)) + 22}" text-anchor="middle" class="bv b dark">${$$(T.net)}</text><foreignObject x="${L + steps.length * bw}" y="${bot + 8}" width="${bw}" height="60"><div class="bl"><b>Net margin from all promos</b></div></foreignObject>`;
    $("#bridge").innerHTML = s;
    $("#bridgeNote").innerHTML = `Shoppers bought <b>${Math.round(avgUp)}% more</b> on promo, but the margin on those extra units (${$$(T.extra_gp)}) did not cover the discount given to people who would have bought anyway (${$$(T.subsidy)}). Green adds margin, red takes it away. A 20% discount on a line with about 27% margin needs roughly three times the sales just to stand still.`;
  })();

  /* ---- categories */
  $("#cats").innerHTML = `<thead><tr><th>Category</th><th>Promos</th><th>Paid their way</th><th>Extra units</th><th>Margin gained</th><th>Taken from others</th><th>Dip after</th><th>Net</th></tr></thead><tbody>` +
    D.categories.map(c => `<tr><td>${esc(c.category)}</td><td>${c.events}</td><td>${c.worth_it}</td><td>+${c.avg_uplift_pct}%</td><td class="${c.inc_gp < 0 ? "neg" : ""}">${$$(c.inc_gp)}</td><td>${$$(-c.cannibalised)}</td><td>${$$(-c.dip)}</td><td class="${c.net < 0 ? "neg" : "pos"}"><b>${$$(c.net)}</b></td></tr>`).join("") + "</tbody>";

  /* ---- lines */
  const ACT = ["All", "Keep", "Shallower", "Stop"]; let f = "All", open = null;
  function lines() {
    const rows = D.scorecard.filter(s => f === "All" || s.action.startsWith(f));
    $("#lines").innerHTML = `<thead><tr><th>Line</th><th>Category</th><th>Promos</th><th>Paid</th><th>Extra units</th><th>Net</th><th>Shelly suggests</th></tr></thead><tbody>` +
      rows.map(s => `<tr class="pick${open === s.sku ? " on" : ""}" data-sku="${esc(s.sku)}" tabindex="0"><td><b>${esc(s.name)}</b></td><td>${esc(s.category)}</td><td>${s.events}</td><td>${s.worth_it}</td><td>+${s.avg_uplift_pct}%</td><td class="${s.net < 0 ? "neg" : "pos"}">${$$(s.net)}</td><td>${esc(s.action)}</td></tr>`).join("") + "</tbody>";
    $("#ev").innerHTML = open ? (() => { const ev = D.events.filter(e => e.sku === open); const n = D.scorecard.find(s => s.sku === open);
      return `<h3>${esc(n.name)} <small>each promo</small></h3><div class="tblw"><table class="tb"><thead><tr><th>Dates</th><th>Off</th><th>Sold</th><th>Expected</th><th>Extra</th><th>Margin gained</th><th>From others</th><th>Dip</th><th>Net</th></tr></thead><tbody>` +
        ev.map(e => `<tr><td>${esc(e.start)} to ${esc(e.end.slice(5))}</td><td>${e.discount_pct}%</td><td>${e.units}</td><td>${e.baseline}</td><td>+${e.uplift_pct}%</td><td>${$$(e.inc_gp)}</td><td>${$$(-e.cannibalised)}</td><td>${$$(-e.dip)}</td><td class="${e.net < 0 ? "neg" : "pos"}">${$$(e.net)}</td></tr>`).join("") + "</tbody></table></div>"; })() : "";
  }
  $("#lineF").innerHTML = ACT.map(a => `<button type="button" class="chip${a === f ? " on" : ""}" data-f="${a}">${a}</button>`).join("");
  $("#lineF").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; f = b.dataset.f; [...$("#lineF").children].forEach(c => c.classList.toggle("on", c === b)); lines(); });
  const pick = e => { const r = e.target.closest("tr[data-sku]"); if (!r) return; open = open === r.dataset.sku ? null : r.dataset.sku; lines(); mood("thinking", 1200); };
  $("#lines").addEventListener("click", pick); $("#lines").addEventListener("keydown", e => { if (e.key === "Enter") pick(e); });
  lines();

  /* ---- depth lab */
  const sel = $("#dSku"), dep = $("#dDep");
  sel.innerHTML = D.price_lab.slice().sort((a, b) => a.name.localeCompare(b.name)).map(l => `<option value="${esc(l.sku)}">${esc(l.name)}</option>`).join("");
  const first = D.price_lab.find(l => l.sku === (D.scorecard[0] || {}).sku); if (first) sel.value = first.sku;
  function depth() {
    const l = D.price_lab.find(x => x.sku === sel.value), r = l.depths[+dep.value];
    $("#dDepV").textContent = `${r.depth_pct}% off`;
    $("#dOut").innerHTML = `<div class="dk"><div><b>${l.baseline_day}</b><span>units a day at full price</span></div><div><b>${r.units_day}</b><span>units a day at ${r.depth_pct}% off (+${r.uplift_pct}%)</span></div>
      <div><b class="${r.net_gp_day < 0 ? "neg" : "pos"}">${$$(r.net_gp_day)}</b><span>net margin a day vs full price</span></div><div><b>${r.funding_pct >= 100 ? "all of it" : r.funding_pct + "%"}</b><span>of the discount a supplier must fund to break even</span></div></div>
      <p class="note">${esc(l.name)}: ${l.margin_pct}% margin at $${l.price.toFixed(2)}; promo response ${l.response} from ${l.events} promos at about ${l.usual_depth_pct}% off. ${l.best_depth_pct ? `Best depth: ${l.best_depth_pct}% off.` : "Every depth costs margin unless a supplier funds it."}</p>`;
    const W = 480, H = 260, L = 50, R = 16, t0 = 20, b0 = 210, xs = l.depths.map((_, i) => L + i * (W - L - R) / (l.depths.length - 1));
    const v = l.depths.map(d => d.net_gp_day), lo = Math.min(0, ...v), hi = Math.max(0, ...v), y = q => t0 + (hi - q) / ((hi - lo) || 1) * (b0 - t0);
    $("#dChart").innerHTML = `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#3d4a5c"/><text x="${L - 6}" y="${y(0) + 4}" text-anchor="end" class="ax">$0</text>` +
      `<polyline fill="none" stroke="#9aa6b6" stroke-width="2" points="${xs.map((x, i) => `${x},${y(v[i])}`).join(" ")}"/>` +
      l.depths.map((d, i) => `<circle cx="${xs[i]}" cy="${y(d.net_gp_day)}" r="${i === +dep.value ? 6 : 3.5}" fill="${i === +dep.value ? "#63b6d8" : "#9aa6b6"}"><title>${d.depth_pct}% off: ${$$(d.net_gp_day)} a day</title></circle>` +
        `<text x="${xs[i]}" y="${b0 + 22}" text-anchor="middle" class="ax">${d.depth_pct}%</text>`).join("") +
      `<text x="${xs[+dep.value]}" y="${y(r.net_gp_day) - 12}" text-anchor="middle" class="bv b">${$$(r.net_gp_day)}</text><text x="${(W + L) / 2}" y="${H - 6}" text-anchor="middle" class="ax">discount</text>`;
  }
  sel.addEventListener("change", depth); dep.addEventListener("input", depth); depth();

  /* ---- baskets */
  $("#bkNote").textContent = `${B.baskets.toLocaleString("en-NZ")} baskets · ${B.avg_items} items each`;
  $("#pairs").innerHTML = `<thead><tr><th>Pair</th><th>Lift</th><th>In baskets</th><th>Confidence</th></tr></thead><tbody>` +
    B.pairs.slice(0, 10).map(p => `<tr><td>${esc(p.a_name)} + ${esc(p.b_name)}</td><td><b>${p.lift}×</b></td><td>${p.support_pct}%</td><td>${p.confidence_pct}%</td></tr>`).join("") + "</tbody>";
  const mx = Math.max(...B.missions.map(m => Math.max(m.share_pct, m.sales_share_pct)));
  $("#miss").innerHTML = B.missions.map(m => `<div class="ms"><span>${esc(m.mission)} <small>${m.items} items · $${m.avg_basket.toFixed(2)}</small></span>
    <i class="bk" style="width:${m.share_pct / mx * 100}%" title="${m.share_pct}% of baskets"></i><em>${m.share_pct}% baskets</em>
    <i class="sl" style="width:${m.sales_share_pct / mx * 100}%" title="${m.sales_share_pct}% of sales"></i><em>${m.sales_share_pct}% sales</em></div>`).join("");
  $("#bkHonest").textContent = "The sample data has daily totals, not till receipts, so these baskets are simulated from shopping missions and scaled to the real daily sales. They show the method; with real receipts the same code finds real pairs. No basket is linked to a person, a card or a face.";
  $("#foot").textContent = `Shelly v${D.version} · built ${D.generated} · promos ${D.period[0]} to ${D.period[1]} · synthetic data · no supplier funding is included, which a real store would add`;

  window.SHELLY_GUIDE = {
    "s-actions": `<b>This week's commercial actions.</b> The few moves the numbers point to. You decide; I only suggest.`,
    "s-promo": `<b>Where the promo margin went.</b> ${Math.round(avgUp)}% more units, but ${$$(T.net)} net over ${D.years} years: the discount on sales we'd have made anyway is the biggest cost.`,
    "s-lines": `<b>Line by line.</b> Tap a line to see every promo it ran, what it sold against what it would have, and the net.`,
    "s-depth": `<b>Discount depth lab.</b> Slide the discount and watch the margin. The funding number is your ask to the supplier.`,
    "s-basket": `<b>What sells together.</b> ${B.pairs[0] ? `${esc(B.pairs[0].a_name)} and ${esc(B.pairs[0].b_name)} sell together ${B.pairs[0].lift}× more than chance.` : ""} Simulated baskets, real method.`,
  };
})();
