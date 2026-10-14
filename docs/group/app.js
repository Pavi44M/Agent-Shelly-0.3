/* Shelly Group HQ page (synthetic data from docs/data/group.js, built by scripts/build_group.py) */
(function () {
  "use strict";
  const D = window.SHELLY_GROUP, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-NZ");
  const k$ = v => (v < 0 ? "−$" : "$") + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + "M" : Math.round(Math.abs(v) / 1e3) + "k");
  const P = D.pnl, CF = D.cash, PE = D.people, BIZ = { store: "Neighbourhood Store", totara: "Tōtara Medical", gateway: "Gateway", group: "Shelly Tower & group" };
  const COL = { store: "#63b6d8", totara: "#b69cf2", gateway: "#8fb8ff", group: "#f2c14e" };
  $("#ver").textContent = D.version; $("#month").textContent = P.month; $("#bpMonth").textContent = P.month;

  /* ---- KPIs */
  const save = D.procurement.reduce((a, p) => a + p.saving_month, 0), certsDue = PE.certs.reduce((a, c) => a + c.expiring_60d, 0);
  const alone = D.limits.filter(l => l.autonomy === "auto").length;
  $("#kpis").innerHTML = [[k$(P.group_revenue), "group revenue", P.month], [k$(P.group_ebitda), "EBITDA", `${P.group_margin_pct}% margin`],
    [k$(CF.low.close), "lowest cash, 13 weeks", CF.warn ? "under the buffer" : `buffer ${k$(CF.buffer)}`], [PE.headcount, "people", `${k$(PE.pay_week)} pay a week`],
    [k$(save), "procurement saving / month", "buying as one group"], [`${alone}/${D.limits.length}`, "agents that act alone", "inside limits you approve"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---- board pack */
  const B = D.board;
  $("#board").innerHTML = `<p class="lead">${esc(B.headline)}</p><div class="bp">
    <div><h3>Results</h3>${Object.entries(P.by_business).map(([b, v]) => `<div class="res" style="--c:${COL[b]}"><span>${esc(BIZ[b])}</span><b>${k$(v.revenue)}</b><small class="${v.ebitda < 0 ? "neg" : ""}">EBITDA ${k$(v.ebitda)} · ${v.margin_pct}%</small></div>`).join("")}</div>
    <div><h3>Risks</h3><ul>${B.risks.map(r => `<li><b>${esc(r.area)}</b> ${esc(r.text)}</li>`).join("")}</ul></div>
    <div><h3>Decisions for you</h3><ul>${B.decisions.map(d => `<li><b>${esc(d.what)}</b>${d.ask ? ` · ask ${$$(d.ask)}, payback ${d.payback_months} months` : ""}<br><small>${esc(d.why)}</small></li>`).join("")}</ul></div>
    <div><h3>Compliance</h3><ul>${B.compliance.map(c => `<li>${esc(c.what)}<br><small>${esc(c.action)}</small></li>`).join("")}</ul></div></div>`;

  /* ---- P&L */
  const bs = Object.keys(P.by_business), lines = [...new Set(bs.flatMap(b => Object.keys(P.by_business[b].lines)))];
  $("#pnl").innerHTML = `<thead><tr><th>${esc(P.month)}</th>${bs.map(b => `<th style="color:${COL[b]}">${esc(BIZ[b])}</th>`).join("")}<th>Eliminations</th><th>Group</th></tr></thead><tbody>` +
    lines.map(l => { const vals = bs.map(b => P.by_business[b].lines[l]); const el = (P.elim_lines || {})[l] || 0;
      return `<tr><td>${esc(l)}</td>${vals.map(v => `<td>${v === undefined ? "" : $$(v)}</td>`).join("")}<td>${el ? $$(el) : ""}</td><td>${$$(vals.reduce((a, v) => a + (v || 0), 0) + el)}</td></tr>`; }).join("") +
    `<tr class="tot"><td>EBITDA</td>${bs.map(b => `<td class="${P.by_business[b].ebitda < 0 ? "neg" : ""}">${$$(P.by_business[b].ebitda)}</td>`).join("")}<td></td><td>${$$(P.group_ebitda)}</td></tr>` +
    `<tr><td>Margin</td>${bs.map(b => `<td>${P.by_business[b].margin_pct}%</td>`).join("")}<td></td><td>${P.group_margin_pct}%</td></tr></tbody>`;
  $("#pnlNote").textContent = `Gateway revenue: ${P.notes.gateway_revenue}. ${P.notes.eliminations}.`;
  $("#var").innerHTML = D.variances.map(v => `<div class="vr" style="--c:${COL[v.business]}"><span>${esc(BIZ[v.business])} · ${esc(v.line)}</span><b class="${v.var < 0 ? "neg" : "pos"}">${$$(v.var)}</b><small>actual ${$$(v.actual)} · budget ${$$(v.budget)}</small><p>${esc(v.why)}</p></div>`).join("");

  /* ---- close */
  $("#close").innerHTML = D.close.map(c => `<li class="${c.status.replace(/\s+/g, "-")}"><span class="bd">BD${c.bd}</span><div><b>${esc(c.task)}</b><small>${esc(c.owner)} · due ${esc(c.due)}</small></div><span class="st">${esc(c.status)}</span></li>`).join("");

  /* ---- cash flow */
  (function () {
    const W = 960, H = 300, x0 = 64, y0 = 14, w = W - x0 - 16, hh = H - y0 - 34, wk = CF.weeks;
    const all = wk.flatMap(r => [r.in, r.out, r.close]).concat([CF.buffer, 0]), lo = Math.min(...all) * 1.08, hi = Math.max(...all) * 1.08;
    const Y = v => y0 + hh - (v - lo) / (hi - lo) * hh, bw = w / wk.length, X = i => x0 + i * bw;
    let s = "";
    for (let k = 0; k <= 5; k++) { const v = lo + (hi - lo) * k / 5; s += `<line x1="${x0}" x2="${W - 16}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1f2a38"/><text x="${x0 - 6}" y="${Y(v) + 4}" text-anchor="end">${k$(v)}</text>`; }
    s += `<line x1="${x0}" x2="${W - 16}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3d4a5c"/>`;
    wk.forEach((r, i) => { s += `<rect x="${X(i) + 6}" y="${Y(r.in)}" width="${bw / 2 - 7}" height="${Y(0) - Y(r.in)}" fill="#3fb87f" opacity=".7"><title>Week of ${r.week}: in ${$$(r.in)}</title></rect>
      <rect x="${X(i) + bw / 2 + 1}" y="${Y(0)}" width="${bw / 2 - 7}" height="${Y(r.out) - Y(0)}" fill="#ff8f6b" opacity=".7"><title>Week of ${r.week}: out ${$$(r.out)}</title></rect>
      <text x="${X(i) + bw / 2}" y="${H - 10}" text-anchor="middle">${r.week.slice(8)}/${r.week.slice(5, 7)}</text>`; });
    s += `<line x1="${x0}" x2="${W - 16}" y1="${Y(CF.buffer)}" y2="${Y(CF.buffer)}" stroke="#ffc466" stroke-dasharray="5 4"/><text x="${W - 18}" y="${Y(CF.buffer) - 5}" text-anchor="end" fill="#ffc466">buffer ${k$(CF.buffer)}</text>`;
    s += `<path d="${wk.map((r, i) => `${i ? "L" : "M"}${X(i) + bw / 2} ${Y(r.close)}`).join("")}" fill="none" stroke="#eaf0f6" stroke-width="2.2"/>` + wk.map((r, i) => `<circle cx="${X(i) + bw / 2}" cy="${Y(r.close)}" r="3.5" fill="${r === CF.low ? "#ffc466" : "#eaf0f6"}"><title>Week of ${r.week}: cash ${$$(r.close)}</title></circle>`).join("");
    $("#cashC").innerHTML = s;
    $("#cashAdv").innerHTML = `<span class="legend2"><span><i style="background:#3fb87f"></i>In</span><span><i style="background:#ff8f6b"></i>Out</span><span><i style="background:#eaf0f6;height:3px"></i>Cash at week end</span></span> ${esc(CF.advice)}`;
  })();

  /* ---- people */
  const tb = PE.by_business;
  $("#ppl").innerHTML = Object.entries(tb).map(([b, v]) => `<div class="pr" style="--c:${COL[b]}"><span>${esc(BIZ[b])}</span><b>${v.headcount}</b><small>${$$(v.pay_week)} a week</small>
    <div class="roles">${PE.rows.filter(r => r.business === b).sort((x, y) => y.count - x.count).slice(0, 6).map(r => `<span>${esc(r.role)} ${r.count}</span>`).join("")}</div></div>`).join("") +
    `<p class="note">Leave owed: about ${$$(PE.leave_liability)} (${PE.leave_weeks} weeks a person on average). ${esc(PE.note)}</p>`;
  $("#certs").innerHTML = PE.certs.map(c => `<div class="cert ${c.held < c.needed ? "short" : c.expiring_60d ? "soon" : "ok"}"><b>${esc(c.what)}</b><span>${c.held}/${c.needed} held${c.expiring_60d ? ` · ${c.expiring_60d} expire within 60 days` : ""}</span><small>${esc(c.law)}</small><p>${esc(c.action)}</p></div>`).join("");

  /* ---- procurement */
  $("#proc").innerHTML = `<thead><tr><th>Category</th><th>Spend a month</th><th>Bought by</th><th>Suppliers</th><th>Saving a month</th><th>What to do</th></tr></thead><tbody>` +
    D.procurement.map(p => `<tr><td>${esc(p.category)}</td><td>${$$(p.monthly_spend)}</td><td>${p.businesses.map(b => `<span class="dot" style="background:${COL[b]}" title="${esc(BIZ[b])}"></span>`).join("")} ${p.businesses.length}</td><td>${p.suppliers}</td><td class="pos">${$$(p.saving_month)}</td><td class="ask">${esc(p.action)}</td></tr>`).join("") +
    `</tbody><caption>Total saving about ${$$(save)} a month (${$$(save * 12)} a year)</caption>`;

  /* ---- governance */
  const AU = { auto: "acts alone", suggest: "suggests", approve: "needs sign-off" };
  let filt = "all";
  $("#govTop").innerHTML = `<b>These limits wait for your approval.</b> ${alone} agents may act alone on routine work (spend capped at $500 or their department's limit, whichever is lower); the rest prepare and recommend. Policy, pricing, hiring, credit, customer terms, budgets, pay runs, markdowns and write-offs always come to a person. <button type="button" id="openAp">Review in Approvals</button>`;
  const ob = $("#openAp"); if (ob) ob.onclick = () => { if (window.ShellyKit && window.ShellyKit.openTray) window.ShellyKit.openTray(); };
  $("#limF").innerHTML = ["all", "auto", "suggest", "approve"].map(k => `<button type="button" data-f="${k}" aria-pressed="${k === filt}">${k === "all" ? "All" : AU[k]} · ${k === "all" ? D.limits.length : D.limits.filter(l => l.autonomy === k).length}</button>`).join("");
  $("#limF").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; filt = b.dataset.f; $("#limF").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); lim(); });
  function lim() {
    const L = D.limits.filter(l => filt === "all" || l.autonomy === filt);
    $("#limN").textContent = `${L.length} agents`;
    $("#lim").innerHTML = `<thead><tr><th>Agent</th><th>Business</th><th>May do alone</th><th>Cap</th></tr></thead><tbody>` +
      L.map(l => `<tr><td>${esc(l.name)}<small>${esc(l.department)}</small></td><td><span class="dot" style="background:${COL[l.business] || "#7d8a9c"}"></span></td><td class="ask">${esc(l.alone)}</td><td>${l.cap_nzd ? $$(l.cap_nzd) : "–"}</td></tr>`).join("") + "</tbody>";
  }
  lim();
  $("#audN").textContent = `${D.audit.length} entries`;
  $("#aud").innerHTML = D.audit.slice(0, 40).map(a => `<div class="au" style="--c:${COL[a.business] || "#7d8a9c"}"><time>${esc(a.when)}</time><span class="ag">${esc(a.agent)} · ${esc(a.source)}</span><p>${esc(a.what)}</p><small class="${/^waiting/.test(a.status) ? "w" : "d"}">${esc(a.status)}</small></div>`).join("") +
    (D.audit.length > 40 ? `<p class="note">and ${D.audit.length - 40} more; the full log is in the data model (Shelly OS).</p>` : "");

  /* ---- what Shelly says about each section */
  const worstVar = [...D.variances].sort((a, b) => a.var - b.var)[0];
  window.SHELLY_GUIDE = {
    "s-board": `${esc(B.headline)} ${B.decisions.length} decisions wait for you.`,
    "s-pnl": `Group EBITDA is <b>${k$(P.group_ebitda)}</b> (${P.group_margin_pct}%). Biggest gap to budget: ${esc(BIZ[worstVar.business])} ${esc(worstVar.line.toLowerCase())}, ${$$(worstVar.var)}. ${esc(worstVar.why)}`,
    "s-close": `${D.close.filter(c => /done/.test(c.status)).length} of ${D.close.length} close tasks are done; the board pack waits for your sign-off.`,
    "s-cash": esc(CF.advice),
    "s-people": `${PE.headcount} people across the group. ${certsDue} licences or certificates expire within 60 days; the liquor Manager's Certificate comes first.`,
    "s-proc": `Buying as one group could save about ${$$(save)} a month. The quick win: buy gloves from Tōtara instead of outside suppliers.`,
    "s-gov": `${alone} of ${D.limits.length} agents act alone, inside limits that wait for your approval. The audit log has ${D.audit.length} entries.`,
  };
  $("#foot").textContent = `Group HQ v${D.version} · built ${D.generated} · synthetic group data; roles only, never names · real data stays on your own PC`;
})();
