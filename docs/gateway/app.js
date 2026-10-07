/* Gateway Warehousing & Transport · page UI (module v1.1)
   KPIs for the open site, the 3D site with a site card / selection card, shipment tracking,
   the docks · forklifts · trucks board and a live feed; then clients, flags and decisions,
   the management team, every role ("Show me" finds one in 3D), fleet and roadmap. */
import { createWorld, fmtClock, shiftAt, onShift, onBreak } from "./world.js";

const G = window.SHELLY_GATEWAY;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nz = n => Math.round(n).toLocaleString("en-NZ");
const money = n => "$" + nz(n);
if (!G) { $("#sub").textContent = "Gateway data is missing. Run python scripts/build_gateway.py and reload."; throw new Error("no SHELLY_GATEWAY"); }

const K = G.kpis, CL = Object.fromEntries(G.clients.map(c => [c.id, c]));
$("#modv").textContent = "v" + G.meta.module_version;
$("#sub").textContent = G.company.tagline + " Three Auckland sites, " + K.trucks + " trucks, " + K.forklifts + " forklifts and " + K.headcount + " people. Pick a site, then tap anything in it.";
$("#clientChips").innerHTML = G.clients.map(c => `<span><i style="background:${esc(c.colour)}"></i>${esc(c.name)}</span>`).join("");
$("#foot").textContent = `Gateway module v${G.meta.module_version} · week of ${G.meta.week_start} · synthetic demo data: every company, person and figure is fictional`;

/* ------------------------------------------------ static sections */
function spark(v) { const w = 90, h = 24, lo = Math.min(...v) - .2, hi = Math.max(...v) + .2;
  const pts = v.map((y, i) => `${(i * w / (v.length - 1)).toFixed(1)},${(h - 2 - (y - lo) / (hi - lo) * (h - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#63b6d8" stroke-width="1.6"/></svg>`; }
$("#cliTbl").innerHTML = `<thead><tr><th>Client</th><th>What Gateway does</th><th>Site</th><th class="n">Pallets</th><th class="n">Deliveries / wk</th><th class="n">OTIF 4 wk</th><th>Trend</th><th class="n">Fee / month</th><th>Status</th></tr></thead><tbody>` +
  G.clients.map(c => `<tr><td><span class="sw" style="background:${esc(c.colour)}"></span><b>${esc(c.name)}</b><div class="s">${esc(c.sector)} · ${esc(c.temp)}</div></td><td class="s">${esc(c.services.join(" · "))}</td>` +
    `<td>${esc(G.sites.find(s => s.id === c.site).name.replace("Gateway ", ""))}</td><td class="n">${nz(c.pallets_now)}</td><td class="n">${c.deliveries}</td>` +
    `<td class="n">${c.otif}%<div class="s">target ${c.otif_target}%</div></td><td>${spark(c.trend)}</td><td class="n">${money(c.fee_month)}</td><td><span class="st ${c.status}">${c.status === "ok" ? "on target" : c.status === "watch" ? "watch" : "act"}</span></td></tr>`).join("") + "</tbody>";
$("#cliNote").textContent = `${money(K.revenue_wk)} revenue this week · OTIF ${K.otif}% (last period ${K.otif_prev}%)`;
$("#flags").innerHTML = G.flags.map(f => `<div class="item ${f.sev}"><b>${esc(f.area)}</b>${esc(f.text)}</div>`).join("");
function renderDecs() {
  const kit = window.ShellyKit, items = kit ? kit.items().filter(i => i.business === "gateway") : [];
  $("#decs").innerHTML = G.decisions.map(d => { const it = items.find(i => i.id === d.id); const st = it && kit ? kit.stateOf(it) : "";
    const chain = it && kit ? kit.chainOf(it).map((c, i) => (i < kit.stepOf(it) ? "✓ " : i === kit.stepOf(it) ? "● " : "○ ") + c.role).join(" › ") : "";
    return `<div class="item ${st === "y" ? "low" : st === "n" ? "high" : "med"}"><b>Decision · ${esc(d.area)}${d.amount ? " · " + money(d.amount) : ""}</b>${esc(d.title)}<div class="s note">${esc(d.why)} Raised by ${esc(d.owner)}.</div>` +
      `<div class="row">${st === "y" ? "<span class='st ok'>approved</span>" : st === "n" ? "<span class='st alert'>rejected</span>" : `<button type="button" data-tray>Review in approvals</button>`}<span class="chain">${esc(chain)}</span></div></div>`; }).join("");
}
$("#decs").addEventListener("click", e => { if (e.target.closest("[data-tray]") && window.ShellyKit) window.ShellyKit.openTray(); });
addEventListener("shelly:approvals", renderDecs); setTimeout(renderDecs, 300);
// management: GM on top, then the people who report to the GM, then the rest
const M = G.management, gm = M.find(m => m.id === "gm");
const lvl2 = M.filter(m => m.reports_to === "General Manager"), lvl3 = M.filter(m => m !== gm && !lvl2.includes(m));
const mgr = m => `<div class="mgr" style="--c:${esc(m.colour)}"><span class="ic">${esc(m.icon)}</span><h4>${esc(m.title)}</h4><div class="nm">${esc(m.name)} <span class="rep">→ ${esc(m.reports_to)}</span></div><ul>${m.owns.map(o => `<li>${esc(o)}</li>`).join("")}</ul><div class="kp">KPIs · ${esc(m.kpis.join(" · "))}</div></div>`;
$("#org").innerHTML = `<div class="lvl">${mgr(gm)}</div><div class="lvl">${lvl2.map(mgr).join("")}</div><div class="lvl">${lvl3.map(mgr).join("")}</div>`;
$("#roleNote").textContent = `${nz(G.roles.reduce((a, r) => a + r.count, 0))} people in ${G.roles.length} roles, plus ${M.length} managers`;
$("#fleet").innerHTML = G.fleet_types.map(f => `<div class="fl"><svg viewBox="0 0 220 54" aria-hidden="true"><rect x="10" y="8" width="${f.code === "CS" ? 150 : f.code === "PV" ? 90 : 120}" height="30" rx="3" fill="${esc(f.colour)}"/><rect x="10" y="32" width="${f.code === "CS" ? 150 : f.code === "PV" ? 90 : 120}" height="5" fill="${esc(f.stripe)}"/>` +
  `<rect x="${f.code === "CS" ? 164 : f.code === "PV" ? 104 : 134}" y="14" width="34" height="24" rx="4" fill="#dfe5eb"/><circle cx="30" cy="42" r="6" fill="#13233a"/><circle cx="${f.code === "CS" ? 140 : 100}" cy="42" r="6" fill="#13233a"/><circle cx="${f.code === "CS" ? 184 : f.code === "PV" ? 118 : 154}" cy="42" r="6" fill="#13233a"/></svg>` +
  `<b>${esc(f.type)}</b><div class="s">${f.count} in the fleet · ${f.pallets} pallets${f.reefer ? " · refrigerated" : ""}</div></div>`).join("");
$("#road").innerHTML = G.roadmap.map(r => `<div class="rd"><span class="v">v${esc(r.v)}</span><h4>${esc(r.title)}</h4>${esc(r.text)}</div>`).join("");

/* ------------------------------------------------ site picker, KPIs */
let siteI = 0; try { siteI = Math.max(0, G.sites.findIndex(s => s.id === (sessionStorage.getItem("gw.site") || "WH-01"))); } catch (e) { /* */ }
$("#sites").innerHTML = G.sites.map((s, i) => `<button type="button" role="tab" data-site="${i}" aria-selected="${i === siteI}">${esc(s.name.replace("Gateway ", ""))}<small>${esc(s.id)} · ${s.docks} docks</small></button>`).join("");
const SPEEDS = [[1, "1×"], [30, "30×"], [60, "60×"], [180, "180×"]];
$("#speed").innerHTML = SPEEDS.map(([v, l]) => `<button type="button" data-sp="${v}" aria-pressed="${v === 60}">${l}</button>`).join("");

function kpis(st) {
  const s = G.sites[siteI], cs = G.clients.filter(c => c.site === s.id);
  const otif = cs.length ? (cs.reduce((a, c) => a + c.deliveries_4wk - c.late, 0) / cs.reduce((a, c) => a + c.deliveries_4wk, 0) * 100).toFixed(1) : K.otif;
  const live = st ? st.stats : { putaway: 0, picked: 0, in: 0, out: 0 };
  const stock = s.stock + (live.putaway || 0) - Math.round((live.picked || 0) / 4);
  const onSite = st ? st.trucks.filter(t => !["road", "leaving"].includes(t.st)).length : 0, occ = st ? st.docks.filter(d => d.state !== "free").length : 0;
  const T = [["Stock on hand", nz(stock), `of ${nz(s.pallet_positions)} pallets · ${(stock / s.pallet_positions * 100).toFixed(0)}% full`],
    ["Trucks on site", onSite, `${st ? st.trucks.filter(t => t.st === "road").length : 0} arriving · ${st ? st.trucks.filter(t => t.st === "waiting" || t.st === "staged").length : 0} waiting`],
    ["On-time delivery", otif + "%", `4 weeks · clients here`, +otif >= 98 ? "up" : "dn"],
    ["Dock use", `${occ}/${s.docks}`, `${s.dock_util_pct}% of the day this week`],
    ["Pallets moved", nz(s.putaway_today + (live.putaway || 0) + s.outbound_today + Math.round((live.picked || 0) / 3)), `put away ${nz(s.putaway_today + (live.putaway || 0))} · out ${nz(s.outbound_today + (live.out || 0))}`],
    ["Crew on shift", st ? `${st.people.filter(p => p.rid && !p.leaving).length + st.lifts.filter(l => l.crewed).length}` : "–", st && st.shift ? `${st.shift.name} shift · ${st.people.filter(p => p.onBreak).length} on break` : ""],
    ["Cold rooms", st && st.rooms.length ? st.rooms.map(r => (r.temp > 0 ? "+" : "") + r.temp.toFixed(1) + "°").join(" · ") : "–", st && st.rooms.length ? (st.rooms.every(r => r.temp >= r.low && r.temp <= r.high) ? "all in range ✓" : "check temperatures") : "", st && st.rooms.every(r => r.temp >= r.low && r.temp <= r.high) ? "up" : "dn"]];
  T.splice(4, 1);
  $("#kpis").innerHTML = T.map(([l, b, sm, cls]) => `<div class="kpi"><span class="l">${esc(l)}</span><b>${esc(b)}</b><small class="${cls || ""}">${esc(sm)}</small></div>`).join("");
}

/* ------------------------------------------------ 3D */
function glOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
let world = null, board = "docks", feedDirty = true;
const ON_FLOOR = new Set(["Shift Supervisor", "Team Leader", "Forklift Operator", "Order Picker", "Receiver / Checker", "Loader", "Inventory Controller", "Yard Marshal", "Gatehouse Officer", "Truck Driver", "Quality Officer (GDP)", "Cleaner / Hygiene"]);
if (glOK()) {
  world = createWorld($("#c"), G, { onSelect: () => { render(); }, onLog: () => { feedDirty = true; } });
  const p = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date());
  const g = k => (p.find(x => x.type === k) || {}).value; world.S.t = (+g("hour")) * 3600 + (+g("minute")) * 60; world.S.day = g("weekday");
  world.setSite(G.sites[siteI]); window.ShellyGateway = world;   // for the console and the tests
} else { $("#nogl").hidden = false; }
// rebuild roles now that ON_FLOOR exists
$("#roles").innerHTML = G.roles.map(r => `<div class="role" style="--c:${esc(r.colour)}"><span class="d">${esc(r.dept)}</span><h4>${esc(r.role)}<span>${r.count}</span></h4><div>${esc(r.does)}</div>${world && ON_FLOOR.has(r.role) ? `<button type="button" data-role="${esc(r.role)}">Show me</button>` : ""}</div>`).join("");
$("#roles").addEventListener("click", e => { const b = e.target.closest("[data-role]"); if (!b || !world) return;
  if (b.dataset.role === "Forklift Operator") { const st = world.state(); const L = st.lifts.find(l => l.busy) || st.lifts[0]; if (L) world.select({ kind: "lift", id: L.id }); }
  else if (b.dataset.role === "Truck Driver") { const st = world.state(); const t = st.trucks.find(x => x.st === "docked") || st.trucks[0]; if (t) world.select({ kind: "truck", id: t.id }); }
  else world.roleFilter(b.dataset.role);
  $("#s-floor").scrollIntoView({ behavior: "smooth", block: "start" }); });

$("#sites").addEventListener("click", e => { const b = e.target.closest("[data-site]"); if (!b) return; siteI = +b.dataset.site; try { sessionStorage.setItem("gw.site", G.sites[siteI].id); } catch (e2) { /* */ }
  $("#sites").querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", String(x === b))); if (world) { world.setSite(G.sites[siteI]); world.select(null, false); } roSite = G.sites[siteI].id; renderRoster(); render(); });
$("#speed").addEventListener("click", e => { const b = e.target.closest("[data-sp]"); if (!b || !world) return; world.S.speed = +b.dataset.sp; $("#speed").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
$("#play").onclick = () => { if (!world) return; world.S.playing = !world.S.playing; $("#play").textContent = world.S.playing ? "❚❚" : "▶"; $("#play").setAttribute("aria-label", world.S.playing ? "Pause" : "Play"); };
$("#zin").onclick = () => world && world.zoom(.75); $("#zout").onclick = () => world && world.zoom(1.33); $("#zhome").onclick = () => world && (world.roleFilter(null), world.select(null, false), world.home()); $("#ztop").onclick = () => world && world.top();
setTimeout(() => $("#hint").classList.add("fade"), 7000);

/* jump to a shift */
const J = [["day", "☀ Day", "06:20"], ["aft", "Afternoon", "14:20"], ["night", "☾ Night", "22:20"]];
$("#jump").innerHTML = J.map(([id, l, t]) => `<button type="button" data-jt="${t}">${l}<small>${G.shifts.find(s => s.id === id).start}</small></button>`).join("") + `<button type="button" data-jt="now">Now<small>NZ</small></button>`;
$("#jump").addEventListener("click", e => { const b = e.target.closest("[data-jt]"); if (!b || !world) return; let t;
  if (b.dataset.jt === "now") { const p = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); t = (+p.find(x => x.type === "hour").value) * 3600 + (+p.find(x => x.type === "minute").value) * 60; }
  else { const [h, m] = b.dataset.jt.split(":").map(Number); t = h * 3600 + m * 60; }
  world.jump(t); roShift = shiftAt(G, t).id; renderRoster(); render(); });

/* rosters & shifts */
let roSite = G.sites[siteI].id, roShift = world ? shiftAt(G, world.S.t).id : "day";
$("#roSite").innerHTML = G.sites.map(s => `<button type="button" role="tab" data-ros="${s.id}">${esc(s.name.replace("Gateway ", ""))}</button>`).join("");
$("#roShift").innerHTML = G.shifts.map(s => `<button type="button" role="tab" data-rsh="${s.id}">${esc(s.name)} <small>${s.start}</small></button>`).join("");
$("#roSite").addEventListener("click", e => { const b = e.target.closest("[data-ros]"); if (b) { roSite = b.dataset.ros; renderRoster(); } });
$("#roShift").addEventListener("click", e => { const b = e.target.closest("[data-rsh]"); if (b) { roShift = b.dataset.rsh; renderRoster(); } });
$("#roTbl").addEventListener("click", e => { const r = e.target.closest("[data-rid]"); if (!r || !world) return; const st = world.state(); const p = st.people.find(x => x.rid === r.dataset.rid);
  if (p) { world.select({ kind: "person", id: p.id }); $("#s-floor").scrollIntoView({ behavior: "smooth", block: "start" }); }
  else { const L = st.lifts.find(l => l.operator && r.dataset.name.startsWith(l.operator)); if (L) { world.select({ kind: "lift", id: L.id }); $("#s-floor").scrollIntoView({ behavior: "smooth", block: "start" }); } } });
const SHC = Object.fromEntries(G.shifts.map(s => [s.id, s.colour]));
function renderRoster() {
  const R = G.rosters[roSite], site = G.sites.find(s => s.id === roSite), sh = G.shifts.find(s => s.id === roShift), t = world ? world.S.t : 0;
  $("#roSite").querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.ros === roSite)));
  $("#roShift").querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.rsh === roShift)));
  const ppl = R.people.filter(p => p.shift === roShift), order = ["Shift Supervisor", "Team Leader", "Forklift Operator", "Order Picker", "Receiver / Checker", "Loader", "Inventory Controller", "Quality Officer (GDP)", "Yard Marshal", "Gatehouse Officer", "Cleaner / Hygiene"];
  ppl.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  $("#roTbl").innerHTML = `<thead><tr><th>Who</th><th>Role · station</th><th>Hours</th><th>Breaks</th><th>Licences</th></tr></thead><tbody>` + ppl.map(p => { const now = !p.leave && onShift(p, t, 0), br = now && onBreak(p, t);
    return `<tr class="${p.leave ? "leave" : ""} ${now ? "now" : ""}"><td class="ro-who" data-rid="${esc(p.id)}" data-name="${esc(p.name)}"><b>${esc(p.name)}</b><div class="s">${p.leave ? esc(p.leave) : now ? (br ? "on " + esc(br.name.toLowerCase()) : roSite === G.sites[siteI].id ? "on now · tap to find" : "on now") : ""}</div></td>` +
      `<td>${esc(p.role)}<div class="s">${esc(p.station)}</div></td><td class="n" style="text-align:left">${esc(p.start)}–${esc(p.end)}<div class="s">${p.hours} h${p.shift === "night" ? " · ×" + G.pay.night_rate : ""}</div></td>` +
      `<td class="s">${p.breaks.map(b => `${esc(b.at)} ${b.minutes}m`).join("<br>")}</td><td>${p.forklift_licence ? '<span class="badge fl">forklift</span>' : ""}${p.first_aid ? '<span class="badge fa">first aid</span>' : ""}${p.cold_trained ? '<span class="badge cd">cold</span>' : ""}</td></tr>`; }).join("") + "</tbody>";
  $("#roChecks").innerHTML = `<span class="t" style="color:var(--ink-3)">Roster checks · ${esc(site.name)}</span>` + R.checks.filter(c => c.shift === roShift).map(c => `<div class="chk ${c.ok ? "ok" : "bad"}"><b>${c.ok ? "✓" : "⚠"}</b><span>${esc(c.text)}</span></div>`).join("");
  $("#roNote").textContent = `${esc(site.name)}: ${R.by_shift.day} day · ${R.by_shift.aft} afternoon · ${R.by_shift.night} night · ${R.hours} hours a day · about $${Math.round(R.cost_day).toLocaleString("en-NZ")} a day in wages`;
  // 24 hours at this site: crew on site by shift (stacked) and trucks booked per hour
  const W = 480, H = 150, bk = G.bookings[roSite], mx = Math.max(...bk), bw = W / 24;
  const crew = Array.from({ length: 24 }, (_, h) => G.shifts.map(s => R.people.filter(p => p.shift === s.id && !p.leave && onShift(p, h * 3600 + 1800, 0)).length));
  const cm = Math.max(...crew.map(c => c.reduce((a, b) => a + b, 0)));
  let svg = "";
  crew.forEach((c, h) => { let y = H - 18; c.forEach((n, i) => { const hh = n / cm * (H - 40); svg += `<rect x="${(h * bw + 2).toFixed(1)}" y="${(y - hh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${hh.toFixed(1)}" fill="${G.shifts[i].colour}" opacity=".55"/>`; y -= hh; }); });
  svg += `<polyline fill="none" stroke="#63b6d8" stroke-width="2.4" points="${bk.map((v, h) => `${(h * bw + bw / 2).toFixed(1)},${(H - 18 - v / mx * (H - 40)).toFixed(1)}`).join(" ")}"/>`;
  for (let h = 0; h <= 24; h += 6) svg += `<text x="${(h * bw).toFixed(1)}" y="${H - 3}" fill="#7d8a9c" font-size="10" font-family="JetBrains Mono">${String(h).padStart(2, "0")}</text>`;
  if (world) { const x = (((t % 86400) + 86400) % 86400) / 86400 * W; svg += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="6" y2="${H - 16}" stroke="#eaf0f6" stroke-width="1.5" stroke-dasharray="3 3"/>`; }
  $("#roDay").innerHTML = `<span class="t" style="color:var(--ink-3)">24 hours at ${esc(site.name.replace("Gateway ", ""))}: crew on site and trucks booked</span><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Crew on site per hour by shift, and trucks booked per hour">${svg}</svg>` +
    `<div class="lg">${G.shifts.map(s => `<span><i style="background:${s.colour}"></i>${esc(s.name)}</span>`).join("")}<span><i style="background:#63b6d8"></i>trucks booked</span></div>`;
}
renderRoster(); setInterval(() => { if (document.getElementById("s-roster").getBoundingClientRect().top < innerHeight) renderRoster(); }, 4000);

/* cards: inside the stage on wide screens, under it on phones */
const narrow = matchMedia("(max-width:980px)");
function placeCards() { const host = narrow.matches ? $("#stageCards") : $("#stage"); ["#panel", "#track", "#board"].forEach(s => host.appendChild($(s))); }
narrow.addEventListener("change", placeCards); placeCards();

/* ------------------------------------------------ live cards */
const IN_STAGES = ["Booked", "At gate", "Docked", "Unloading", "Put away"], OUT_STAGES = G.stages;
const TXT = { road: "on the road in", gate: "at the gate", staged: "to the waiting bay", waiting: "waiting for a dock", toDock: "reversing onto a dock", docked: "at the dock", closing: "closing up", leaving: "leaving" };
function stageIdx(t) {
  if (t.dir === "in") return t.st === "road" ? 0 : ["gate", "staged", "waiting", "toDock"].includes(t.st) ? 1 : t.st === "docked" ? (t.moves ? 3 : 2) : 4;
  return ["road", "gate", "staged", "waiting", "toDock"].includes(t.st) ? 0 : t.st === "docked" ? (t.prog < .5 ? 1 : 2) : t.st === "closing" ? 3 : 3;
}
function track(st) {
  const sel = world && world.S.sel, t = (sel && sel.kind === "truck" && st.trucks.find(x => x.id === sel.id)) || st.trucks.find(x => x.st === "docked") || st.trucks[0];
  if (!t) { $("#track").innerHTML = `<span class="t">Shipment tracking</span><p class="k">No trucks on site right now.</p>`; return; }
  const L = t.dir === "in" ? IN_STAGES : OUT_STAGES, idx = stageIdx(t), clk = world.S.t;
  const eta = t.dir === "out" ? fmtClock(clk + (t.st === "leaving" ? 1500 : 3600)) : "";
  $("#track").innerHTML = `<div class="rowk" style="border:0;padding:0"><span class="t">Shipment tracking · ${esc(t.id)} · ${esc(t.client || "")}</span><span class="t">${esc(t.ship ? t.ship.id : "")}</span></div>` +
    `<div class="steps">${L.map((s, i) => `<div class="step ${i < idx ? "done" : i === idx ? "cur" : ""}"><i></i><b>${esc(s)}</b>${i === L.length - 1 && t.dir === "out" ? "ETA " + eta : i <= idx ? "✓" : ""}</div>`).join("")}</div>` +
    `<div class="k" style="margin-top:6px;font-size:11.5px">${t.dir === "out" ? "To " + esc(t.ship ? t.ship.to : "client") : "Inbound for " + esc(t.client || "")} · ${t.moves}/${t.need} pallets · ${esc(TXT[t.st] || t.st)}</div>`;
}
function siteCard(st) {
  const s = st.site, cs = G.clients.filter(c => c.site === s.id), docked = st.trucks.filter(t => t.st === "docked" || t.st === "closing").length;
  const arriving = st.trucks.filter(t => ["road", "gate", "toDock"].includes(t.st)).length, staged = st.trucks.filter(t => ["staged", "waiting"].includes(t.st)).length;
  const busy = st.lifts.filter(l => l.busy).length, stock = s.stock + st.stats.putaway - Math.round(st.stats.picked / 4);
  return `<span class="t">${esc(s.id)} · ${esc(s.kind)}</span><h3>${esc(s.name)}</h3><div class="k">${esc(s.address)} · ${esc(s.temp)}</div>` +
    `<div style="margin-top:6px"><span class="pill">operational</span> <span class="k">${docked} docked · ${arriving} arriving · ${staged} waiting</span></div>` +
    `<div class="grid3"><div><b>${nz(stock)}</b><span>pallets stored</span></div><div><b>${st.docks.filter(d => d.state !== "free").length}/${s.docks}</b><span>docks in use</span></div><div><b>${busy}/${st.lifts.length}</b><span>forklifts working</span></div></div>` +
    `<span class="t">Stock vs capacity</span><div class="bar"><i style="width:${Math.min(100, stock / s.pallet_positions * 100).toFixed(0)}%"></i></div>` +
    `<span class="t">Outbound today · putaway today</span><div class="rowk"><span>${nz(s.outbound_today + st.stats.out)} trucks out</span><b>${nz(s.putaway_today + st.stats.putaway)} pallets put away</b></div>` +
    `<span class="t" style="display:block;margin-top:8px">Clients stored here</span>` + cs.map(c => `<div class="rowk"><span><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(c.colour)};margin-right:6px"></span>${esc(c.name)}</span><b>${nz(c.pallets_now)} <span class="pill ${c.status}">${c.status === "ok" ? "on target" : c.status}</span></b></div>`).join("") +
    (st.rooms.length ? `<span class="t" style="display:block;margin-top:8px">Cold storage</span>` + st.rooms.map(r => { const bad = r.temp < r.low || r.temp > r.high;
      return `<div class="room ${r.kind}" data-room="${r.i}"><span>❄ <b style="font:600 12.5px 'Plus Jakarta Sans'">${esc(r.name)}</b></span><b class="${bad ? "warn" : ""}">${r.temp > 0 ? "+" : ""}${r.temp.toFixed(1)}°C</b><small>set ${r.set}°C · range ${r.low} to ${r.high}°C · ${(r.fill * 100).toFixed(0)}% full${r.open ? " · door open" : ""}</small></div>`; }).join("") : "") +
    `<span class="t" style="display:block;margin-top:8px">${st.shift ? esc(st.shift.name) + " shift" : "Crew"} on the floor</span><div class="crew">${Object.entries(st.people.filter(p => p.rid && !p.leaving).reduce((a, p) => (a[p.role] = (a[p.role] || 0) + 1, a), { "Forklift Operator": st.lifts.filter(l => l.crewed).length })).filter(([, n]) => n).map(([r, n]) => `<span>${n} ${esc(r.replace(" / Checker", "").replace(" (GDP)", ""))}</span>`).join("")}</div>`;
}
function selCard(st) {
  const sel = world.S.sel, close = `<button type="button" class="x" data-close aria-label="Close">×</button>`, fol = `<button type="button" class="mini-btn ${world.S.follow ? "on" : ""}" data-follow>${world.S.follow ? "◉ Following" : "◎ Follow"}</button>`;
  if (sel.kind === "truck") { const t = st.trucks.find(x => x.id === sel.id); if (!t) return null;
    return close + `<span class="t">${esc(t.type)} · ${t.dir === "in" ? "inbound" : "outbound"}</span><h3>${esc(t.id)}</h3><div class="k">Driver ${esc(t.driver)} · ${esc(TXT[t.st] || t.st)}</div>` +
      `<div class="bar ${t.prog >= 1 ? "g" : ""}"><i style="width:${(t.prog * 100).toFixed(0)}%"></i></div>` +
      [["Shipment", t.ship ? t.ship.id : "–"], ["Client", t.client || "–"], [t.dir === "in" ? "From" : "Destination", t.dir === "in" ? "Supplier / client stock" : (t.ship ? t.ship.to : "–")], ["Bay", t.dock != null ? "Bay " + (t.dock + 1) : "–"],
        ["Cargo", `${t.moves}/${t.need} pallets ${t.dir === "in" ? "unloaded" : "loaded"}`], ["Temperature", t.reefer ? t.temp + "°C ✓ (2–8°C)" : "ambient"], ["Delivery window", t.ship ? t.ship.window : "–"]].map(([a, b]) => `<div class="rowk"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("") +
      fol + `<span class="t" style="display:block;margin-top:8px">Today</span>` + t.events.slice(0, 5).map(e => `<div class="ev">${fmtClock(e.t)} · ${esc(e.txt)}</div>`).join(""); }
  if (sel.kind === "lift") { const L = st.lifts.find(x => x.id === sel.id); if (!L) return null;
    return close + `<span class="t">${esc(L.type)}</span><h3>${esc(L.id)}</h3><div class="k">Operator ${esc(L.operator)} · licence F endorsement ✓</div><span class="t">Battery</span><div class="bar ${L.battery < 45 ? "a" : "g"}"><i style="width:${L.battery}%"></i></div>` +
      `<div class="rowk"><span>Now</span><b>${esc(L.task)}</b></div>` + fol; }
  if (sel.kind === "person") { const p = st.people.find(x => x.id === sel.id); if (!p) return null; const r = G.roles.find(x => x.role === p.role) || G.management.find(m => p.role.startsWith(m.title.split(" (")[0])) || {};
    const rp = p.rid && Object.values(G.rosters).flatMap(x => x.people).find(x => x.id === p.rid);
    return close + `<span class="t">${esc(p.role)}</span><h3>${esc(rp ? rp.name : p.name)}</h3><div class="rowk"><span>Now</span><b>${esc(p.doing || "–")}</b></div>` +
      (rp ? `<div class="rowk"><span>Shift</span><b>${esc(rp.start)}–${esc(rp.end)} · ${esc(rp.station)}</b></div><div class="rowk"><span>Breaks</span><b>${rp.breaks.map(b => esc(b.at)).join(" · ")}</b></div>` : "") + `<p class="k" style="margin:8px 0 0">${esc(r.does || (r.owns ? r.owns.join(" · ") : ""))}</p>` + fol; }
  if (sel.kind === "room") { const r = st.rooms[sel.id]; if (!r) return null; const bad = r.temp < r.low || r.temp > r.high, R = (st.site.cold_rooms || []).find(c => c.id === r.id) || {};
    return close + `<span class="t">${r.kind === "freezer" ? "Freezer" : "Chiller"} · ${esc(r.id)}</span><h3>❄ ${esc(r.name)}</h3><div class="room ${r.kind}"><span>Now</span><b class="${bad ? "warn" : ""}">${r.temp > 0 ? "+" : ""}${r.temp.toFixed(2)}°C</b><small>set point ${r.set}°C · alarm below ${r.low}°C or above ${r.high}°C</small></div>` +
      `<span class="t">Full</span><div class="bar"><i style="width:${(r.fill * 100).toFixed(0)}%"></i></div>` +
      [["Door", r.open ? "open: forklift passing" : "closed"], ["Door opens per hour", R.door_opens_h ?? "–"], ["Clients here", (R.clients || []).map(id => (G.clients.find(c => c.id === id) || {}).name).join(", ")], ["Logger", "every minute → Cold chain agent"]].map(([a, b]) => `<div class="rowk"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join(""); }
  if (sel.kind === "dock") { const d = st.docks[sel.id]; if (!d) return null;
    return close + `<span class="t">Dock door</span><h3>Bay ${d.i + 1}</h3><span class="pill ${d.state}">${d.state === "free" ? "free" : d.state === "reserved" ? "truck on its way" : d.dir === "in" ? "unloading" : "loading"}</span>` +
      (d.truck ? `<div class="rowk"><span>Truck</span><b>${esc(d.truck)}</b></div><div class="rowk"><span>Client</span><b>${esc(d.client || "")}</b></div><div class="bar"><i style="width:${(d.prog * 100).toFixed(0)}%"></i></div>` : `<p class="k">Ready for the next booking.</p>`); }
  return null;
}
$("#panel").addEventListener("click", e => { if (!world) return; const rm = e.target.closest("[data-room]"); if (rm) { world.select({ kind: "room", id: +rm.dataset.room }); return; } if (e.target.closest("[data-close]")) { world.select(null, false); world.roleFilter(null); world.follow(false); render(); } if (e.target.closest("[data-follow]")) { world.follow(!world.S.follow); render(); } });
$("#board").addEventListener("click", e => { const b = e.target.closest("[data-b]"); if (b) { board = b.dataset.b; $("#board").querySelectorAll("[data-b]").forEach(x => x.setAttribute("aria-selected", String(x === b))); render(); return; }
  const r = e.target.closest("[data-sel]"); if (r && world) { const [kind, id] = r.dataset.sel.split("|"); world.select({ kind, id: kind === "dock" ? +id : id }); } });
function boardList(st) {
  if (board === "docks") return st.docks.map(d => `<div class="brow" data-sel="dock|${d.i}"><b>Bay ${d.i + 1}</b><div><small>${d.truck ? esc(d.truck) + " · " + esc(d.client || "") : "—"}</small>${d.truck ? `<div class="bar" style="margin:2px 0 0"><i style="width:${(d.prog * 100).toFixed(0)}%"></i></div>` : ""}</div><span class="pill ${d.state === "occupied" ? (d.dir === "in" ? "unload" : "load") : d.state}">${d.state === "free" ? "free" : d.state === "reserved" ? "booked" : d.dir === "in" ? "unloading" : "loading"}</span></div>`).join("");
  if (board === "lifts") return st.lifts.map(L => `<div class="brow" data-sel="lift|${esc(L.id)}"><b>${esc(L.id)}</b><small>${esc(L.operator)} · ${esc(L.task)}</small><span class="pill ${L.busy ? "load" : ""}">${L.battery}%</span></div>`).join("");
  if (board === "team") return st.people.filter(p => p.rid || p.role === "Warehouse Manager").sort((a, b) => a.role.localeCompare(b.role)).map(p => `<div class="brow ${p.onBreak ? "brk" : ""}" data-sel="person|${esc(p.id)}"><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc(p.doing || "")}</small><span class="pill ${p.onBreak ? "watch" : p.leaving ? "" : "load"}">${p.onBreak ? "break" : p.leaving ? "home" : "on"}</span></div>`).join("") +
    st.lifts.map(L => `<div class="brow" data-sel="lift|${esc(L.id)}"><b>${esc(L.operator)}</b><small>Forklift Operator · ${esc(L.id)} · ${esc(L.task)}</small><span class="pill ${L.crewed ? "load" : ""}">${L.crewed ? "on" : "—"}</span></div>`).join("");
  return st.trucks.map(t => `<div class="brow" data-sel="truck|${esc(t.id)}"><b>${esc(t.id)}</b><small>${esc(t.client || "")} · ${esc(TXT[t.st] || t.st)}</small><span class="pill ${t.dir}">${t.dir === "in" ? "in" : "out"}</span></div>`).join("") || `<p class="k">No trucks on site.</p>`;
}
function render() {
  if (!world) { kpis(null); return; }
  const st = world.state(); if (!st) return;
  kpis(st);
  $("#clk").textContent = fmtClock(world.S.t); $("#clkDay").textContent = (world.S.day || "") + (st.dayK > .5 ? " · ☀ day" : " · ☾ night");
  if (st.shift) { $("#shChip").textContent = st.shift.name + " shift"; $("#shChip").className = "sh " + st.shift.id; }
  $("#panel").innerHTML = (world.S.sel && selCard(st)) || siteCard(st);
  track(st);
  $("#boardList").innerHTML = boardList(st);
  if (feedDirty) { feedDirty = false; $("#feed").innerHTML = `<span class="t" style="color:var(--ink-3)">Live feed</span>` + world.S.log.slice(0, 14).map(l => `<div class="ev"><b>${fmtClock(l.t)}</b>${esc(l.txt)}</div>`).join(""); }
}
render(); setInterval(render, 500);
window.addEventListener("hashchange", fromHash); setTimeout(fromHash, 1200);
function fromHash() { const h = location.hash.slice(1); const i = G.sites.findIndex(s => s.id === h); if (i >= 0) { const b = $(`#sites [data-site="${i}"]`); if (b) b.click(); } }
