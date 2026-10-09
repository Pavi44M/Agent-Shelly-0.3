/* Shelly Tower · page UI (module v1.3)
   KPIs, the 3D tower with a floor card and the floor directory, the two looks (Today and 2050),
   the business and technology cores, every floor, the floors to let, what Shelly flagged and the roadmap. */
import { createTower } from "./world.js";

const T = window.SHELLY_TOWER;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nz = n => Math.round(n).toLocaleString("en-NZ");
const money = n => "$" + nz(n);
if (!T) { $("#sub").textContent = "Tower data is missing. Run python scripts/build_tower.py and reload."; throw new Error("no SHELLY_TOWER"); }

const K = T.kpis, FL = Object.fromEntries(T.floors.map(f => [f.level, f])), KIND = T.kinds;
$("#modv").textContent = "v" + T.meta.module_version;
$("#sub").textContent = `${T.tower.tagline} ${K.floors} floors in Auckland city, on the ${T.tower.address}: ${K.shelly_floors} for Shelly, a trade centre, a hotel, a mall, a micro-fulfilment centre, ${K.tenants} tenants and ${K.available} floors to let. Tap a floor to look inside.`;
$("#kindChips").innerHTML = Object.entries(KIND).filter(([k]) => k !== "basement").map(([, v]) => `<span><i style="background:${esc(v.colour)}"></i>${esc(v.label)}</span>`).join("");
$("#foot").textContent = `Shelly Tower module v${T.meta.module_version} · week of ${T.meta.week_start} · synthetic demo data: the tower, every tenant, person and rent are fictional`;
const lv = f => f.level === "R" ? "Roof" : f.level === "G" ? "Ground" : f.level.startsWith("B") ? f.level : "Level " + f.level;
const short = f => f.level === "R" ? "R" : f.level;

$("#kpis").innerHTML = [["Floors", K.floors, `${K.height_m} m · podium + ${K.floors - 4} office floors`],
  ["Shelly floors", K.shelly_floors, `${K.businesses} businesses + the cores`],
  ["Let", K.occupancy_pct + "%", `${K.tenants} tenants · ${K.available} floors free`, K.occupancy_pct >= 80 ? "up" : "dn"],
  ["Income", money(K.revenue_year), `a year · ${K.non_rent_pct}% beyond rent · rent ${money(K.rent_roll)}`],
  ["In the tower now", nz(K.here_now), `of ${nz(K.people)} people · ${nz(K.visitors_today)} visitors today`],
  ["Shelly OS", K.mesh_agents + " agents", `${nz(K.decisions_today)} decisions today · ${K.asked_people_today} asked a person`]]
  .map(([l, b, s, c]) => `<div class="kpi"><span class="l">${esc(l)}</span><b>${esc(b)}</b><small class="${c || ""}">${esc(s)}</small></div>`).join("");

/* ------------------------------------------------ directory and cards */
function dir(sel) {
  const groups = [["Crown & cores", f => ["core-business", "core-tech"].includes(f.kind) || f.level === "R"], ["Shelly businesses", f => ["business", "new", "shared"].includes(f.kind)],
    ["Tenants & floors to let", f => ["tenant", "available"].includes(f.kind) || (f.kind === "amenity" && f.order >= 6 && f.level !== "R")], ["Podium & basements", f => f.order <= 5 && f.level !== "R"]];
  const seen = new Set();
  $("#dir").innerHTML = groups.map(([h, fn]) => { const L = T.floors.filter(f => !seen.has(f.level) && fn(f)); L.forEach(f => seen.add(f.level));
    return `<div class="dh">${esc(h)}</div>` + L.map(f => `<button type="button" class="fl" data-lv="${esc(f.level)}" style="--c:${esc(f.colour)}" ${f.level === sel ? 'aria-current="true"' : ""}><span class="lv">${esc(short(f))}</span><span>${esc(f.name)}<small>${esc(f.occupant)}</small></span><span class="k">${f.kind === "available" ? "to let" : f.people ? f.people : ""}</span></button>`).join(""); }).join("");
}
function card(level) {
  const f = level && FL[level];
  if (!f) {
    return `<span class="t">Shelly Group · ${esc(T.tower.address)}</span><h3>${esc(T.tower.name)}</h3><div class="k">${esc(T.tower.tagline)}</div>` +
      `<div class="grid3"><div><b>${K.floors}</b><span>floors</span></div><div><b>${K.occupancy_pct}%</b><span>let</span></div><div><b>${nz(K.here_now)}</b><span>here now</span></div></div>` +
      Object.entries(KIND).filter(([k]) => k !== "basement").map(([k, v]) => { const n = T.floors.filter(f => f.kind === k).length; return n ? `<div class="rowk"><span><span class="ktile" style="--c:${esc(v.colour)}">${esc(v.label)}</span></span><b>${n} floor${n > 1 ? "s" : ""}</b></div>` : ""; }).join("") +
      `<p class="k" style="margin:8px 0 0">Tap any floor, or pick one from the directory.</p>`;
  }
  const close = `<button type="button" class="x" data-close aria-label="Close">×</button>`, era = tw && tw.S.era === "future";
  const rows = [["Who", f.occupant], ["What", f.kind_label], ["People", f.people ? `${f.here_now} here now of ${f.people}` : "—"], ["Area", nz(f.area_m2) + " m²"]];
  if (f.agents) rows.push(["Shelly agents", f.agents + " for this business"]);
  if (f.kind === "tenant") rows.push(["Rent", `$${f.rent_m2}/m² · ${money(f.rent_year)} a year`], ["Lease to", f.lease_to]);
  if (f.kind === "available") rows.push(["Asking", `$${f.rent_m2}/m² a year`], ["Ready", f.available_from]);
  return close + `<span class="t">${esc(lv(f))} · ${esc(f.kind_label)}</span><h3><span class="ktile" style="--c:${esc(f.colour)};margin-right:6px">${esc(short(f))}</span>${esc(f.name)}</h3>` +
    `<p class="k" style="margin:6px 0 8px">${esc(era && f.future ? f.future : f.about)}</p>` +
    rows.map(([a, b]) => `<div class="rowk"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("") +
        (f.future && !era ? `<p class="k" style="margin:8px 0 0"><b>In 2050:</b> ${esc(f.future)}</p>` : "") +
    ((f.enquiries || []).length ? `<span class="t" style="display:block;margin-top:8px">Enquiries</span>` + f.enquiries.map(e => `<div class="rowk"><span>${esc(e.from)}</span><b>${esc(e.status)}</b></div>`).join("") : "") +
    (f.page ? `<p style="margin:10px 0 0"><a href="${esc(f.page)}">Open ${esc(f.occupant)} →</a></p>` : "");
}

/* ------------------------------------------------ the 3D tower */
let tw = null;
const hovtag = $("#hovtag");
function render() { const s = tw ? tw.S.sel : null; $("#panel").innerHTML = card(s); dir(s); }
try {
  tw = createTower($("#cv"), T, {
    onSelect: () => render(),
    onHover: l => { const f = l && FL[l]; hovtag.hidden = !f; if (f) hovtag.textContent = `${short(f)} · ${f.name}`; },
    onEra: () => { $("#eras").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.era === tw.S.era))); render(); },
  });
  window.ShellyTower = tw;
} catch (e) { console.error(e); $("#stage").insertAdjacentHTML("beforeend", `<p class="k" style="position:absolute;inset:auto 16px 16px;color:#fff">3D needs WebGL: the directory and cards below still work.</p>`); }
$("#eras").innerHTML = T.eras.map(e => `<button type="button" data-era="${esc(e.id)}" aria-pressed="${e.id === "now"}">${esc(e.name)}<small>${esc(e.year)}</small></button>`).join("");
$("#eras").addEventListener("click", e => { const b = e.target.closest("[data-era]"); if (b && tw) tw.setEra(b.dataset.era); });
$("#tour").addEventListener("click", () => { if (!tw) return; const on = $("#tour").getAttribute("aria-pressed") !== "true"; $("#tour").setAttribute("aria-pressed", String(on)); $("#tour").textContent = on ? "■ Stop the tour" : "▶ Tour the floors"; tw.tour(on); });
$("#zin").onclick = () => tw && tw.zoom(.8); $("#zout").onclick = () => tw && tw.zoom(1.25); $("#home").onclick = () => tw && tw.home(); $("#cityv").onclick = () => tw && tw.city();
const pickLv = l => { if (tw) { tw.select(l); $("#s-tower").scrollIntoView({ behavior: "smooth", block: "start" }); } };
$("#dir").addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (b && tw) tw.select(b.dataset.lv); });
$("#panel").addEventListener("click", e => { if (e.target.closest("[data-close]") && tw) tw.select(null); });
// small screens: the floor card goes under the 3D view instead of over it
const narrow = matchMedia("(max-width: 640px)");
const place = () => { const p = $("#panel"); if (narrow.matches) $("#stage").after(p); else $("#stage").appendChild(p); };
narrow.addEventListener("change", place); place();
render();

/* ------------------------------------------------ sections */
$("#looks").innerHTML = T.eras.map(e => `<div class="look ${esc(e.id)}"><span class="yr">${esc(e.year)}</span><span class="tag">${esc(e.name)}</span><h3>${esc(e.title)}</h3><ul>${e.look.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` +
  `<button type="button" data-era="${esc(e.id)}">Show ${esc(e.name)} in 3D</button></div>`).join("");
$("#looks").addEventListener("click", e => { const b = e.target.closest("[data-era]"); if (b && tw) { tw.setEra(b.dataset.era); tw.home(); $("#s-tower").scrollIntoView({ behavior: "smooth", block: "start" }); } });
const CORES = [["core-business", "Business core", "Pavi and the board, the management team and Finance: the departments every Shelly business reports into."],
  ["core-tech", "Technology core", "The Shelly Brain, the data centre and the Launchpad lab: the agents and systems that run every business and the tower itself."],
  ["business", "Shelly businesses", "Each business has its own floors, people and agents, one lift ride from the cores."],
  ["new", "New businesses", "Shelly Ventures: room for the next businesses to start, grow and move up to their own floors."]];
$("#cores").innerHTML = CORES.map(([k, h, p]) => `<div class="coreb" style="--c:${esc(KIND[k].colour)}"><h3>${esc(h)}</h3><p>${esc(p)}</p>` +
  T.floors.filter(f => f.kind === k).map(f => `<button type="button" data-lv="${esc(f.level)}"><b>${esc(short(f))}</b>${esc(f.name)}</button>`).join("") + `</div>`).join("");
$("#cores").addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (b) pickLv(b.dataset.lv); });
$("#floorNote").textContent = `${T.floors.length} levels · tap a row to open the floor`;
$("#floorTbl").innerHTML = `<thead><tr><th>Level</th><th>Floor</th><th>Who</th><th>Type</th><th class="n">People</th><th class="n">Area m²</th><th class="n">Rent / year</th><th>Lease</th></tr></thead><tbody>` +
  T.floors.map(f => `<tr data-lv="${esc(f.level)}"><td><b>${esc(short(f))}</b></td><td><span class="sw" style="background:${esc(f.colour)}"></span><b>${esc(f.name)}</b></td><td class="s">${esc(f.occupant)}</td><td><span class="ktile" style="--c:${esc(KIND[f.kind].colour)}">${esc(f.kind_label)}</span></td>` +
    `<td class="n">${f.people || "—"}</td><td class="n">${nz(f.area_m2)}</td><td class="n">${f.rent_year ? money(f.rent_year) : f.kind === "available" ? "$" + f.rent_m2 + "/m² asked" : "—"}</td><td class="s">${esc(f.lease_to || (f.kind === "available" ? "ready " + f.available_from : ""))}</td></tr>`).join("") + "</tbody>";
$("#floorTbl").addEventListener("click", e => { const r = e.target.closest("[data-lv]"); if (r) pickLv(r.dataset.lv); });
const av = T.floors.filter(f => f.kind === "available");
$("#letNote").textContent = `${av.length} floors · ${nz(K.available_m2)} m² · ${T.leasing.terms}`;
$("#lets").innerHTML = av.map(f => `<div class="let"><span class="tag">${esc(lv(f))}</span><h3>${esc(f.name)}</h3><div class="big">$${f.rent_m2}/m²</div><div class="note">${nz(f.area_m2)} m² · about ${money(f.rent_m2 * f.area_m2)} a year · ready ${esc(f.available_from)}</div>` +
  `<p style="margin:8px 0 0;font-size:13px">${esc(f.about)}</p>` + ((f.enquiries || []).length ? `<ul>${f.enquiries.map(e => `<li><b>${esc(e.from)}</b> · ${esc(e.status)}${e.note ? ": " + esc(e.note) : ""}</li>`).join("")}</ul>` : `<p class="note" style="margin:8px 0 0">No enquiries yet.</p>`) +
  `<button type="button" data-lv="${esc(f.level)}">Look inside</button></div>`).join("");
$("#lets").addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (b) pickLv(b.dataset.lv); });
$("#flags").innerHTML = T.flags.map(f => `<div class="item ${f.sev}"><b>${esc(f.area)}</b>${esc(f.text)}</div>`).join("");
$("#road").innerHTML = T.roadmap.map(r => `<div><span>v${esc(r.v)}</span><b>${esc(r.title)}</b>${esc(r.text)}</div>`).join("");

/* ------------------------------------------------ the integrated architecture (Shelly OS, mesh, sectors, trust, money, phases) */
$("#vision").textContent = T.tower.vision; $("#positioning").textContent = T.tower.positioning;
$("#principles").innerHTML = T.principles.map((p, i) => `<div class="pr"><span>${i + 1}</span><b>${esc(p.name)}</b><p>${esc(p.text)}</p></div>`).join("");
$("#stack").innerHTML = T.layers.map(l => `<div class="layer ${l.core ? "core" : ""}"><span class="ln">${l.n}</span><div><b>${esc(l.name)}</b><p>${esc(l.text)}</p><div class="chips2">${l.items.map(i => `<span>${esc(i)}</span>`).join("")}</div></div></div>`).join("") +
  `<div class="flow"><span>↑ data flows up</span><span>decisions flow down ↓</span></div>`;
$("#trustband").innerHTML = `<b>Trust &amp; governance</b>` + T.trust_band.map(t => `<span>${esc(t)}</span>`).join("");
$("#elevTbl").innerHTML = `<thead><tr><th>Capability</th><th>Defined</th><th>Elevated</th></tr></thead><tbody>` + T.os_elevated.map(r => `<tr><td><b>${esc(r.cap)}</b></td><td class="s">${esc(r.original)}</td><td>${esc(r.elevated)}</td></tr>`).join("") + "</tbody>";
$("#osNew").innerHTML = T.os_new.map(c => `<div><b>${esc(c.name)}</b>${esc(c.text)}</div>`).join("");
// agent mesh: the orchestrator in the middle, eight agents round it; a live feed of their negotiations
$("#meshNote").textContent = `${T.mesh.length} specialist agents · ${nz(K.decisions_today)} decisions today · ${K.asked_people_today} asked a person · ${K.decisions_logged_pct}% logged with a reason`;
(function mesh() {
  const W = 520, H = 400, cx = W / 2, cy = H / 2, R = 132, pos = T.mesh.map((m, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / T.mesh.length; return [cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R]; });
  const lines = pos.map(([x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`).join("");
  const nodes = T.mesh.map((m, i) => `<g class="ag" data-ag="${esc(m.name)}" transform="translate(${pos[i][0].toFixed(1)},${pos[i][1].toFixed(1)})"><circle r="30" style="fill:${esc(m.colour)}"/><text y="5" class="ic">${esc(m.icon)}</text><text y="46" class="nm">${esc(m.name)}</text><title>${esc(m.does)}</title></g>`).join("");
  $("#mesh").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The orchestrator and eight agents"><g class="ln">${lines}</g><path class="pulse" id="pulse" d=""/>` +
    `<g transform="translate(${cx},${cy})"><circle r="44" class="orc"/><text y="-2" class="ot">Shelly OS</text><text y="15" class="os">orchestrator</text></g>${nodes}</svg>`;
  let i = 0; const P = Object.fromEntries(T.mesh.map((m, k) => [m.name, pos[k]]));
  const show = () => { const n = T.negotiations[i % T.negotiations.length], a = P[n.from], b = P[n.to]; i++;
    $("#pulse").setAttribute("d", a && b ? `M${a[0]},${a[1]} L${cx},${cy} L${b[0]},${b[1]}` : "");
    document.querySelectorAll("#mesh .ag").forEach(g => g.classList.toggle("on", g.dataset.ag === n.from || g.dataset.ag === n.to));
    $("#nego").innerHTML = `<span class="t">Agents negotiating through the orchestrator</span><p><b>${esc(n.from)} → ${esc(n.to)}</b></p><p>${esc(n.text)}</p><span class="pill ${n.result === "done" ? "free" : "out"}">${esc(n.result)}</span>` +
      `<div class="k" style="margin-top:10px">${T.negotiations.map((x, j) => `<i class="dot ${j === (i - 1) % T.negotiations.length ? "on" : ""}"></i>`).join("")}</div>`; };
  show(); if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(show, 4200);
})();
$("#tiers").innerHTML = T.decision_tiers.map(t => `<div class="tier ${t.tier.toLowerCase()}"><b>${esc(t.tier)} impact</b><span>${esc(t.rule)}</span><small>${esc(t.examples)}</small></div>`).join("");
$("#ledgerTbl").innerHTML = `<thead><tr><th>Agent</th><th>Tier</th><th>Action</th><th>Outcome</th><th>Status</th></tr></thead><tbody>` +
  T.ledger.map(l => `<tr><td><b>${esc(l.agent)}</b></td><td><span class="ktile" style="--c:${l.tier === "Low" ? "#7fd1a8" : l.tier === "Medium" ? "#ffc466" : "#ff8f8f"}">${esc(l.tier)}</span></td><td>${esc(l.action)}</td><td class="s">${esc(l.outcome)}</td>` +
    `<td>${l.status === "waiting" ? `<button type="button" class="mini" data-tray>In approvals</button>` : `<span class="pill ${l.status === "done" ? "free" : "out"}">${esc(l.status)}</span>`}</td></tr>`).join("") + "</tbody>";
$("#ledgerTbl").addEventListener("click", e => { if (e.target.closest("[data-tray]") && window.ShellyKit) window.ShellyKit.openTray(); });
$("#sectors").innerHTML = T.sectors.map(x => { const b = T.businesses[x.business] || {};
  return `<div class="sector" style="--c:${esc(b.colour || "#63b6d8")}"><span class="tag">Sector ${x.n}</span><h3>${esc(x.name)}</h3><div class="by">${esc(b.icon || "")} ${esc(x.lead)}</div><p>${esc(x.text)}</p>` +
    `<div class="fls">${x.floors.map(l => FL[l] ? `<button type="button" data-lv="${esc(l)}" title="${esc(FL[l].name)}">${esc(short(FL[l]))}</button>` : "").join("")}<span class="k">${x.people} people</span></div>` +
    `<details><summary>${x.caps.length} capabilities</summary><ul>${x.caps.map(c => `<li>${esc(c)}</li>`).join("")}</ul></details></div>`; }).join("");
$("#sectors").addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (b) pickLv(b.dataset.lv); });
$("#green").innerHTML = `<div class="gk"><div><b>${K.solar_kw} kW</b><span>solar now</span></div><div><b>${K.onsite_energy_pct}%</b><span>energy made or stored on site (target 30%+)</span></div><div><b>${K.energy_mwh_wk} MWh</b><span>used this week</span></div></div>` +
  T.sustainability.map(x => `<div class="gi"><b>${esc(x.name)}</b>${esc(x.text)}</div>`).join("");
$("#trust").innerHTML = [["Privacy", T.trust.privacy], ["AI governance", T.trust.governance], ["Cyber security & resilience", T.trust.resilience]].map(([h, L]) => `<div class="coreb" style="--c:#e66767"><h3>${esc(h)}</h3><ul>${L.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("");
const maxR = Math.max(...T.revenue.map(r => r.year));
$("#moneyNote").textContent = `${money(K.revenue_year)} a year in run rate (synthetic) · ${K.non_rent_pct}% comes from beyond rent`;
$("#moneyTbl").innerHTML = `<thead><tr><th>Income stream</th><th>Who pays</th><th>How it works</th><th class="n">A year</th><th style="width:22%"></th></tr></thead><tbody>` +
  T.revenue.map(r => `<tr><td><b>${esc(r.stream)}</b></td><td class="s">${esc(r.who)}</td><td class="s">${esc(r.how)}</td><td class="n">${r.year ? money(r.year) : "phase 4"}</td><td><div class="bar"><i style="width:${(r.year / maxR * 100).toFixed(0)}%"></i></div></td></tr>`).join("") + "</tbody>";
$("#phases").innerHTML = T.phases.map(p => `<div class="ph ${p.n === T.current_phase ? "cur" : p.n < T.current_phase ? "done" : ""}"><span class="tag">Phase ${p.n} · ${esc(p.years)}</span><b>${esc(p.name)}</b><p>${esc(p.text)}</p>${p.gate ? `<div class="gate">Gate · ${esc(p.gate)}</div>` : ""}</div>`).join("");
$("#kpiTbl").innerHTML = `<thead><tr><th>Area</th><th>Success measure</th><th>Target</th><th>Now (phase ${T.current_phase})</th><th style="width:20%">Progress</th></tr></thead><tbody>` +
  T.kpis_targets.map(k => `<tr><td><b>${esc(k.area)}</b></td><td>${esc(k.kpi)}</td><td class="s">${esc(k.target)}</td><td>${esc(k.now)}</td><td><div class="bar ${k.pct >= 100 ? "g" : k.pct < 70 ? "a" : ""}"><i style="width:${Math.min(100, k.pct)}%"></i></div></td></tr>`).join("") + "</tbody>";

/* ------------------------------------------------ Blender renders */
const RENDERS = [
  { id: "today", era: "now", title: "Today · golden hour", text: "Shelly Tower on the Wynyard Quarter waterfront: the coloured floor bands, the SHELLY crown, the podium with the Neighbourhood Store flagship, the CBD and the Sky Tower behind." },
  { id: "dusk", era: "now", title: "Today · dusk", text: "Evening: every floor lit, the crown sign glowing and the spire light on." },
  { id: "2050", era: "future", title: "2050 · Shelly Business Centre", text: "The twisting garden tower with its holographic rings, the satellite towers and skyways linking the buildings on both sides, garden domes and air taxis." },
];
$("#thumbs").innerHTML = RENDERS.map((r, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-r="${r.id}"><img src="img/render-${r.id}-sm.jpg" width="640" height="360" alt="" loading="lazy"><span>${esc(r.title)}</span></button>`).join("");
function showRender(id) { const r = RENDERS.find(x => x.id === id) || RENDERS[0]; $("#heroImg").src = `img/render-${r.id}.jpg`; $("#heroImg").alt = `Shelly Tower, ${r.title}, rendered in Blender`;
  $("#heroCap").innerHTML = `<b>${esc(r.title)}</b> ${esc(r.text)} <button type="button" class="mini" data-era3d="${r.era}">Open this look in 3D</button>`;
  $("#thumbs").querySelectorAll("[data-r]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.r === r.id))); }
$("#thumbs").addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) showRender(b.dataset.r); });
$("#heroCap").addEventListener("click", e => { const b = e.target.closest("[data-era3d]"); if (b && tw) { tw.setEra(b.dataset.era3d); tw.home(); $("#s-tower").scrollIntoView({ behavior: "smooth", block: "start" }); } });
showRender("today");
