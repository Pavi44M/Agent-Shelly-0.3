/* Shelly Operations page: Gateway docks, labour and billing; Tōtara suppliers, expiry and what-if; flows end to end
   (synthetic data from docs/data/ops.js, built by scripts/build_ops.py) */
(function () {
  "use strict";
  const D = window.SHELLY_OPS, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const G = D.gateway, T = D.totara;
  const min = s => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
  $("#ver").textContent = D.version;

  /* ---- KPIs */
  const jobs = G.docks.reduce((a, d) => a + d.jobs.length, 0), clashes = G.docks.reduce((a, d) => a + d.clashes.length, 0);
  const billed = G.billing.reduce((a, b) => a + b.total, 0), contract = G.billing.reduce((a, b) => a + b.contract, 0);
  const weak = T.scorecards.filter(s => s.grade === "C" || s.grade === "D").length;
  $("#kpis").innerHTML = [[jobs, "trucks booked into docks", `${G.docks.length} sites today`], [clashes, "dock clashes", clashes ? "each with a fix" : "none today"],
    [$$(billed), "billed this month, as used", `${billed >= contract ? "+" : ""}${((billed - contract) / contract * 100).toFixed(1)}% vs contracts`],
    [`${weak}/${T.scorecards.length}`, "suppliers graded C or D", "each with one ask"], [$$(T.expiry_saved), "short-dated stock rescued", `of ${$$(T.expiry_at_risk)} at risk`],
    [D.flows.length, "flows followed end to end", "store · Gateway · Tōtara"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---- flows */
  const BZ = { store: ["Store", "#63b6d8"], totara: ["Tōtara", "#b69cf2"], gateway: ["Gateway", "#8fb8ff"], group: ["Group", "#f2c14e"] };
  $("#flows").innerHTML = D.flows.map(f => `<div class="card flow"><h3>${esc(f.title)}</h3><ol class="steps">${f.steps.map(s => `<li style="--c:${(BZ[s.biz] || BZ.group)[1]}">
      <span class="who">${esc(s.who)} <i>${esc((BZ[s.biz] || BZ.group)[0])}</i></span><p>${esc(s.what)}</p>${s.gate ? `<span class="gate ${/waits/.test(s.gate) ? "w" : ""}">${esc(s.gate)}</span>` : ""}</li>`).join("")}</ol></div>`).join("");

  /* ---- docks */
  let site = G.docks[0].site;
  $("#siteTabs").innerHTML = G.docks.map(d => `<button type="button" data-s="${d.site}" aria-pressed="${d.site === site}">${esc(d.name)} · ${d.jobs.length}</button>`).join("");
  $("#siteTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; site = b.dataset.s;
    $("#siteTabs").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); docks(); });
  function docks() {
    const d = G.docks.find(x => x.site === site);
    $("#dockH").innerHTML = `${esc(d.name)} <small>${d.docks} docks (${d.chilled_docks} chilled) · dock time used ${d.utilisation_pct}% between 05:00 and 17:00</small>`;
    const t0 = 5 * 60, t1 = Math.max(17 * 60, ...d.jobs.map(j => min(j.end))) + 30, W = 960, x0 = 70, row = 24, H = d.docks * row + 34;
    const X = m => x0 + (m - t0) / (t1 - t0) * (W - x0 - 10);
    let s = "";
    for (let h = Math.ceil(t0 / 60); h * 60 <= t1; h++) s += `<line x1="${X(h * 60)}" x2="${X(h * 60)}" y1="4" y2="${H - 22}" stroke="#1f2a38"/><text x="${X(h * 60)}" y="${H - 6}" text-anchor="middle">${String(h).padStart(2, "0")}</text>`;
    for (let i = 0; i < d.docks; i++) s += `<text x="${x0 - 8}" y="${10 + i * row + 13}" text-anchor="end">Dock ${i + 1}${i < d.chilled_docks ? " ❄" : ""}</text><line x1="${x0}" x2="${W - 10}" y1="${10 + i * row + row - 2}" y2="${10 + i * row + row - 2}" stroke="#141e2c"/>`;
    d.jobs.forEach(j => { const y = 10 + (j.dock - 1) * row, a = X(min(j.start)), b = X(min(j.end)), c = j.kind === "out" ? "#63b6d8" : "#8fe3c8";
      s += `<rect x="${a}" y="${y + 2}" width="${Math.max(3, b - a - 1)}" height="${row - 8}" rx="4" fill="${c}" fill-opacity="${j.wait > 30 ? 1 : .7}" stroke="${j.cold ? "#eaf0f6" : "none"}" stroke-dasharray="${j.cold ? "3 2" : ""}"><title>${esc(j.truck)} · ${esc(j.client)} · ${j.pallets} pallets · ${j.start}–${j.end}${j.wait ? ` · waited ${j.wait} min` : ""}</title></rect>`; });
    $("#gantt").setAttribute("viewBox", `0 0 ${W} ${H}`); $("#gantt").innerHTML = s;
    $("#clashes").innerHTML = d.clashes.length ? `<h3 class="mt">Clashes to fix</h3>` + d.clashes.map(c => `<div class="clash"><b>${esc(c.truck)}</b> wanted ${esc(c.window)}, earliest dock ${c.dock} at ${esc(c.start)} (${c.wait} min wait): ${esc(c.fix)}.</div>`).join("") : `<p class="note">No clashes: every truck gets a dock within 30 minutes of its window.</p>`;
  }
  docks();

  /* ---- labour */
  const SH = { day: "Day 06:00", aft: "Afternoon 14:00", night: "Night 22:00" }, nm = Object.fromEntries(G.docks.map(d => [d.site, d.name]));
  $("#labour").innerHTML = `<thead><tr><th>Site · shift</th><th>Pallets</th><th>Pickers</th><th>Forklift</th><th>Loaders</th><th>What to do</th></tr></thead><tbody>` +
    G.labour.map(l => l.shifts.map(s => `<tr><td>${esc(nm[l.site] || l.site)} · ${SH[s.shift]}</td><td>${s.pallets}</td>` +
      ["pickers", "forklift", "loaders"].map(k => `<td class="${s.gaps[k] < 0 ? "neg" : s.gaps[k] > 1 ? "spare" : ""}">${s.rostered[k]} / ${s.need[k]}</td>`).join("") + `<td>${esc(s.advice)}</td></tr>`).join("")).join("") +
    `</tbody><caption>rostered / needed · red = short, amber = 2 or more spare</caption>`;

  /* ---- billing */
  $("#bills").innerHTML = G.billing.map(b => `<div class="card bill"><h3>${esc(b.name)}</h3><b class="tot">${$$(b.total)}</b><small>contract ${$$(b.contract)} · <span class="${b.vs_contract_pct > 5 ? "up" : b.vs_contract_pct < -10 ? "down" : ""}">${b.vs_contract_pct > 0 ? "+" : ""}${b.vs_contract_pct}%</span></small>
    <ul>${b.lines.map(l => `<li><span>${esc(l.item)}</span><b>${$$(l.amount)}</b></li>`).join("")}</ul><p class="note">${esc(b.note.charAt(0).toUpperCase() + b.note.slice(1))}.</p></div>`).join("");

  /* ---- suppliers */
  $("#sup").innerHTML = `<thead><tr><th>Supplier</th><th>Grade</th><th>Score</th><th>On time</th><th>In full</th><th>Lead (±)</th><th>Spend</th><th>Raise at the review</th></tr></thead><tbody>` +
    T.scorecards.map(s => `<tr><td>${esc(s.name)}<small>${esc(s.country)} · ${esc(s.mode)}</small></td><td><span class="gr g${s.grade}">${s.grade}</span></td><td>${s.score}</td><td>${s.on_time}%</td><td>${s.in_full}%</td><td>${s.lead_days}d (±${s.lead_sd})</td><td>${$$(s.spend)}</td><td class="ask">${esc(s.ask)}</td></tr>`).join("") + "</tbody>";

  /* ---- expiry */
  $("#expiry").innerHTML = T.expiry.map(e => `<div class="exp"><div class="eh"><b>${esc(e.name)}</b><span>batch ${esc(e.batch)} · expires ${esc(e.expires)} (${e.days_left} days) · ${e.at_risk_qty.toLocaleString("en-NZ")} at risk (${$$(e.at_risk_value)})</span></div>
    <div class="offers">${e.offers.map(o => `<span class="of">${esc(o.client)} <b>${o.qty.toLocaleString("en-NZ")}</b></span>`).join("") || `<span class="note">No client uses it fast enough</span>`}</div>
    <div class="res"><span class="up">${$$(e.saved_value)} rescued</span>${e.left_qty ? ` · ${e.left_qty.toLocaleString("en-NZ")} left: ${esc(e.fallback)}` : ""}</div></div>`).join("");

  /* ---- what-if */
  const sel = $("#wiSup"); let delay = 14;
  const order = [...T.suppliers].sort((a, b) => (D.totara.what_if[`${b.id}:28`].revenue) - (D.totara.what_if[`${a.id}:28`].revenue));
  sel.innerHTML = order.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("#wiDelay").innerHTML = T.delays.map(d => `<button type="button" data-d="${d}" aria-pressed="${d === delay}">${d} days late</button>`).join("");
  $("#wiDelay").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; delay = +b.dataset.d;
    $("#wiDelay").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); wi(); });
  sel.addEventListener("change", wi);
  function wi() {
    const r = T.what_if[`${sel.value}:${delay}`];
    $("#wi").innerHTML = r.skus.length ? `<p class="big2">${$$(r.revenue)} <small>of sales at stake · ${r.skus.length} SKU${r.skus.length > 1 ? "s" : ""} run short · ${r.clients} clients buy them</small></p>
      <div class="tblw"><table class="tb"><thead><tr><th>SKU</th><th>Cover now</th><th>Days short</th><th>Sales at stake</th><th>Best fix</th></tr></thead><tbody>` +
      r.skus.map(s => `<tr><td>${esc(s.name)}</td><td>${s.cover_days} d</td><td class="neg">${s.days_short} d</td><td>${$$(s.revenue)}</td><td class="ask">${esc(s.fix)}</td></tr>`).join("") + "</tbody></table></div>"
      : `<p class="note">${esc(r.supplier)} ${delay} days late: current cover rides it out. Nothing runs short.</p>`;
  }
  wi();
  const worst = T.scorecards[0], big = Object.values(T.what_if).sort((a, b) => b.revenue - a.revenue)[0];
  window.SHELLY_GUIDE = {
    "s-flow": `Two events followed through every department: ${esc(D.flows[0].title.split(":")[0].toLowerCase())}, and ${esc((D.flows[1] || D.flows[0]).title.split(":")[0].toLowerCase())}. Amber steps wait for a person.`,
    "s-docks": `${jobs} trucks booked into docks across ${G.docks.length} sites, ${clashes} clash${clashes === 1 ? "" : "es"} to fix. Pick a site; cold loads only go on the chilled docks.`,
    "s-labour": "People needed per shift from the day's pallets, against the roster. Red is short, amber is two or more spare.",
    "s-bill": `This month's invoices, as used: ${$$(billed)} against ${$$(contract)} of contracts. Clients well under their contract could move to a smaller plan.`,
    "s-sup": `${weak} of ${T.scorecards.length} suppliers are graded C or D. Weakest: <b>${esc(worst.name)}</b>, ${esc(worst.ask)}.`,
    "s-exp": `${$$(T.expiry_saved)} of ${$$(T.expiry_at_risk)} of short-dated stock finds a home before it expires; medicines only go to hospitals and clinics.`,
    "s-whatif": `Pick a supplier and how late. The worst case: ${esc(big.supplier)} ${big.delay} days late puts ${$$(big.revenue)} of sales at stake.`,
  };
  $("#foot").textContent = `Operations v${D.version} · built ${D.generated} · synthetic Gateway and Tōtara data · real data stays on your own PC`;
})();
