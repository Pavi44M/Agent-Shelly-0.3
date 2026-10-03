/* Store Floor · Improve tab: points to improve, worked out from this week's data, today's team and the plan.
   Each point names the evidence and links to the shelf (tap to fly there).
   Recall · stock below lead-time cover · thin floor cover vs the busiest hours · queue pressure at the tills ·
   waste over target · budget gap · delivery-app outage · shelf-space productivity (gross margin per metre). */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = v => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-NZ");
const FLOOR_ROLES = new Set(["Store Team", "Duty Manager"]);   // cooks, café and the manager's desk don't cover the floor

function metres(f, pxm) {   // shoppable shelf length; both faces count on an island gondola
  let L = 0;
  if (f.seg) L = Math.hypot(f.seg[2] - f.seg[0], f.seg[3] - f.seg[1]) * pxm;
  else if (f.rect) L = Math.max(Math.abs(f.rect[2] - f.rect[0]), Math.abs(f.rect[3] - f.rect[1])) * pxm;
  return L * ((f.type === "gondola" || f.type === "island") && !f.face ? 2 : 1);
}

export function improvePane(S, ST, fmt) {
  const FX = ST.fixtures, T = ST.targets || {}, OPS = ST.operations || {}, out = [];
  const add = (sev, area, text, fx) => out.push({ sev, area, text, fx });
  // recall
  FX.filter(f => (f.reasons || []).some(r => /recall/i.test(r))).forEach(f => {
    const prod = (f.reasons.find(r => /recall/i.test(r)) || "").split(":")[0] || "The recalled product";
    add("high", "Recall", `${prod} on ${f.name} is recalled: pull it and quarantine it before opening, and block it at the tills.`, f.id); });
  // stock below lead-time cover
  const on = FX.filter(f => f.kpi && f.kpi.order_now).sort((a, b) => b.kpi.order_now - a.kpi.order_now);
  if (on.length) add("high", "Stock", `${on.reduce((s, f) => s + f.kpi.order_now, 0)} lines are below lead-time cover. Worst shelves: ${on.slice(0, 3).map(f => `${f.name} (${f.kpi.order_now})`).join(", ")}. Order today; top up from the storeroom first.`, on[0].id);
  // floor cover vs customers by hour (today's team from the roster)
  const FOOT = OPS.footfall || {}, FSUM = Object.values(FOOT).reduce((a, b) => a + b, 0) || 1, CPD = OPS.customers_per_day || 150;
  const L = window.SHELLY_LIVE;
  const hours = Object.keys(FOOT).map(Number).sort((a, b) => a - b);
  const rows = hours.map(h => {
    const live = L && L.by_hour && L.by_hour.find(x => x.h === h);
    const cust = live && live.baskets != null ? live.baskets : CPD * FOOT[h] / FSUM;
    const staff = (S.staff || []).filter(m => FLOOR_ROLES.has(m.role) && m.start <= h * 60 && m.end > h * 60).length;
    return { h, cust, staff, per: cust / Math.max(1, staff) };
  }).filter(r => r.cust > 0);
  if (rows.length) {
    const worst = rows.reduce((a, b) => b.per > a.per ? b : a);
    const thin = rows.filter(r => r.staff < 2);
    if (thin.length) add("high", "Floor cover", `Fewer than two people on the floor at ${thin.map(r => `${String(r.h).padStart(2, "0")}:00`).slice(0, 6).join(", ")}${thin.length > 6 ? "…" : ""} (cooks, café and the office not counted). Busiest of those: ${String(thin.reduce((a, b) => b.cust > a.cust ? b : a).h).padStart(2, "0")}:00.`, "checkout");
    add(worst.per > 14 ? "med" : "low", "Busiest hour", `${String(worst.h).padStart(2, "0")}:00 has about ${Math.round(worst.cust)} customers for ${worst.staff} on the floor (${Math.round(worst.per)} each)${L ? " (live POS)" : ""}. Keep fills, deliveries and breaks out of that hour; push shoppers to the self-checkouts.`, "selfcheck");
  }
  // waste over target
  FX.filter(f => f.kpi && f.kpi.waste_pct != null && f.kpi.waste_pct > (T.waste_pct_of_sales ?? 3) && f.kpi.waste > 20).sort((a, b) => b.kpi.waste - a.kpi.waste).slice(0, 2).forEach(f =>
    add("med", "Waste", `${f.name}: waste ${f.kpi.waste_pct}% of its sales (${money(f.kpi.waste)}) against a ${T.waste_pct_of_sales ?? 3}% target. Cut late prep and mark down earlier.`, f.id));
  // budget gap
  const worstB = FX.filter(f => f.kpi && f.kpi.vs_budget).sort((a, b) => a.kpi.vs_budget - b.kpi.vs_budget)[0];
  if (worstB && worstB.kpi.vs_budget < 0) add("med", "Budget", `${worstB.name} is ${money(worstB.kpi.vs_budget)} behind this week's budget (${worstB.kpi.wow_pct != null ? worstB.kpi.wow_pct.toFixed(1) + "% on last week" : ""}). Check range, price and position.`, worstB.id);
  // delivery-app outage
  ((OPS.delivery || {}).outages || []).slice(0, 1).forEach(e =>
    add("high", "Delivery apps", `${({ uber_eats: "Uber Eats", on_demand: "On-Demand" })[e.item] || e.item}: ${e.detail} on ${e.date}. Check the tablet is online and the menu is live before lunch.`, "checkout"));
  // shelf-space productivity: gross margin per metre per week
  const pxm = ST.plan.px_to_m || 0.02;
  const sp = FX.filter(f => f.kpi && f.kpi.sales > 0 && f.kpi.gm_pct != null && !["counter", "kiosks"].includes(f.type))
    .map(f => ({ f, m: metres(f, pxm), gp: f.kpi.sales * f.kpi.gm_pct / 100 })).filter(x => x.m > 0.3).map(x => ({ ...x, gpm: x.gp / x.m })).sort((a, b) => a.gpm - b.gpm);
  if (sp.length > 4) {
    const lo = sp[0], hi = sp[sp.length - 1], mid = sp[Math.floor(sp.length / 2)].gpm;
    add("med", "Shelf space", `${lo.f.name} earns ${money(lo.gpm)} gross margin per metre of shelf a week (${lo.m.toFixed(1)} m) against ${money(hi.gpm)} for ${hi.f.name}; store middle ${money(mid)}. Give ${lo.f.name} less space or a better position, and extend ${hi.f.name}.`, lo.f.id);
  }
  const ord = { high: 0, med: 1, low: 2 }; out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  return `<div class="ts-h"><h3>Points to improve</h3><span class="tag">${out.length} found</span></div>` +
    out.map(x => `<button type="button" class="imp ${x.sev}" ${x.fx ? `data-fx="${esc(x.fx)}"` : ""}><b>${esc(x.area)}</b>${esc(x.text)}</button>`).join("") +
    `<p class="note">Worked out from this week's results, ${esc(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][S.day] || "today")}'s team on the roster and the store plan${L ? ", with today's live POS hours" : ""}. Tap a point to go to the shelf.</p>`;
}
