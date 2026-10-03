/* Shelly Store Floor: the Neighbourhood store in 3D with this week's numbers on every shelf.
   Data: window.SHELLY_STORE (docs/data/store-floor.js, built by scripts/build_store.py from
   the planogram and the weekly run). Overview orbits the floor; Walk puts you at eye height
   with a joystick (or W A S D). Shelves are coloured by status, sales, change, margin or waste;
   gaps on a shelf mean low stock cover. Tap a shelf for its products, reasons and the actions
   waiting for sign-off (approved through the shared approvals queue in shelly-kit.js). */
import * as THREE from "../kit/vendor/three.module.min.js";

const ST = window.SHELLY_STORE;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
const K = () => window.ShellyKit;
const money = v => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1e4 ? (Math.abs(v) / 1e3).toFixed(1) + "k" : Math.round(Math.abs(v)).toLocaleString("en-NZ"));
const pct = (v, sign) => v == null ? "–" : (sign && v > 0 ? "+" : "") + v.toFixed(Math.abs(v) < 10 ? 1 : 0) + "%";

if (!ST) { $("#sub").textContent = "Store floor data is missing. Run python scripts/build_store.py and reload."; throw new Error("no SHELLY_STORE"); }
const FX = ST.fixtures, T = ST.targets || {}, M = ST.meta || {};
const STATUS_COL = { alert: "#ff6b6b", watch: "#ffc466", ok: "#3fb87f", empty: "#56657a", service: "#56657a" };
const STATUS_TXT = { alert: "Act today", watch: "Watch", ok: "On plan", empty: "No data", service: "Service point" };

/* ------------------------------------------------ colour modes */
const lerpHex = (a, b, k) => { const A = new THREE.Color(a), B = new THREE.Color(b); return "#" + A.lerp(B, Math.max(0, Math.min(1, k))).getHexString(); };
const ramp3 = (lo, mid, hi, k) => k < .5 ? lerpHex(lo, mid, k * 2) : lerpHex(mid, hi, (k - .5) * 2);
const maxSales = Math.max(1, ...FX.map(f => f.kpi.sales));
const gmT = T.gross_margin_pct ?? 38, wT = T.waste_pct_of_sales ?? 3;
const hasData = f => f.status !== "empty" && f.status !== "service";
const MODES = {
  status: { label: "Status", col: f => STATUS_COL[f.status], val: f => STATUS_TXT[f.status],
    legend: () => ["alert", "watch", "ok", "empty"].map(s => `<span><i style="background:${STATUS_COL[s]}"></i>${STATUS_TXT[s]}</span>`).join("") },
  sales: { label: "Sales", col: f => hasData(f) ? ramp3("#173247", "#3f8fb5", "#d8f1fb", Math.sqrt(f.kpi.sales / maxSales)) : STATUS_COL.empty,
    val: f => hasData(f) ? money(f.kpi.sales) : "–", legend: () => `<span>$0<i class="ramp" style="background:linear-gradient(90deg,#173247,#3f8fb5,#d8f1fb)"></i>${money(maxSales)} in 7 days</span>` },
  wow: { label: "vs last week", col: f => hasData(f) && f.kpi.wow_pct != null ? ramp3("#ff6b6b", "#8a94a3", "#3fb87f", (f.kpi.wow_pct + 25) / 50) : STATUS_COL.empty,
    val: f => hasData(f) ? pct(f.kpi.wow_pct, true) : "–", legend: () => `<span>−25%<i class="ramp" style="background:linear-gradient(90deg,#ff6b6b,#8a94a3,#3fb87f)"></i>+25% sales on last week</span>` },
  margin: { label: "Margin", col: f => hasData(f) && f.kpi.gm_pct != null ? ramp3("#ff6b6b", "#8a94a3", "#3fb87f", (f.kpi.gm_pct - gmT + 12) / 24) : STATUS_COL.empty,
    val: f => hasData(f) ? pct(f.kpi.gm_pct) : "–", legend: () => `<span>${gmT - 12}%<i class="ramp" style="background:linear-gradient(90deg,#ff6b6b,#8a94a3,#3fb87f)"></i>${gmT + 12}% gross margin (target ${gmT}%)</span>` },
  waste: { label: "Waste", col: f => hasData(f) && f.kpi.waste_pct != null ? ramp3("#3fb87f", "#ffc466", "#ff6b6b", f.kpi.waste_pct / (wT * 2)) : STATUS_COL.empty,
    val: f => hasData(f) ? pct(f.kpi.waste_pct) : "–", legend: () => `<span>0%<i class="ramp" style="background:linear-gradient(90deg,#3fb87f,#ffc466,#ff6b6b)"></i>${wT * 2}% of sales wasted (target ${wT}%)</span>` },
};
// added: stock cover, budget gap and 7-day forecast (the shelf's share of its categories)
const maxFc = Math.max(1, ...FX.map(f => f.kpi.forecast_7d || 0)), maxBud = Math.max(1, ...FX.map(f => Math.abs(f.kpi.vs_budget || 0)));
Object.assign(MODES, {
  cover: { label: "Stock", col: f => !hasData(f) ? STATUS_COL.empty : f.kpi.order_now ? "#ff6b6b" : f.kpi.to_order ? "#ffc466" : "#3fb87f",
    val: f => !hasData(f) ? "–" : f.kpi.order_now ? `${f.kpi.order_now} order now` : f.kpi.to_order ? `${f.kpi.to_order} to order` : `${f.kpi.min_cover ?? "–"}d cover`,
    legend: () => `<span><i style="background:#ff6b6b"></i>below lead-time cover</span><span><i style="background:#ffc466"></i>order today</span><span><i style="background:#3fb87f"></i>covered</span>` },
  budget: { label: "vs Budget", col: f => hasData(f) ? ramp3("#ff6b6b", "#8a94a3", "#3fb87f", ((f.kpi.vs_budget || 0) / maxBud + 1) / 2) : STATUS_COL.empty,
    val: f => hasData(f) ? (f.kpi.vs_budget >= 0 ? "+" : "") + money(f.kpi.vs_budget || 0) : "–", legend: () => `<span>−${money(maxBud)}<i class="ramp" style="background:linear-gradient(90deg,#ff6b6b,#8a94a3,#3fb87f)"></i>+${money(maxBud)} vs this week's budget (shelf's share of its categories)</span>` },
  forecast: { label: "Forecast 7d", col: f => hasData(f) ? ramp3("#173247", "#3f8fb5", "#d8f1fb", Math.sqrt((f.kpi.forecast_7d || 0) / maxFc)) : STATUS_COL.empty,
    val: f => hasData(f) ? money(f.kpi.forecast_7d || 0) : "–", legend: () => `<span>$0<i class="ramp" style="background:linear-gradient(90deg,#173247,#3f8fb5,#d8f1fb)"></i>${money(maxFc)} next 7 days (best model per category)</span>` },
});
let mode = "status";

/* ------------------------------------------------ plan geometry (pixels on the plan -> metres) */
const S = ST.plan.px_to_m, [CX, CY] = ST.plan.centre_px;
const wx = p => (p - CX) * S, wz = p => (p - CY) * S;
const POLY = ST.plan.sales_floor.map(([x, y]) => [wx(x), wz(y)]);
function inside(x, z) { let c = false; for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) { const [xi, zi] = POLY[i], [xj, zj] = POLY[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
const MAXD = { wall: .6, chiller: 1, multideck: 1, freezer: .8 };
FX.forEach(f => {
  let cx, cz, rot, L, rD;
  if (f.seg) { const [a, ya, b, yb] = f.seg, x1 = wx(a), z1 = wz(ya), x2 = wx(b), z2 = wz(yb); cx = (x1 + x2) / 2; cz = (z1 + z2) / 2; L = Math.hypot(x2 - x1, z2 - z1); rot = -Math.atan2(z2 - z1, x2 - x1); rD = 1; f.face = "S"; }
  else {
    const [x1, y1, x2, y2] = f.rect, w = (x2 - x1) * S, d = (y2 - y1) * S; cx = wx((x1 + x2) / 2); cz = wz((y1 + y2) / 2);
    if (f.face === "E") { rot = Math.PI / 2; L = d; rD = w; } else if (f.face === "W") { rot = -Math.PI / 2; L = d; rD = w; }
    else if (f.face === "N") { rot = Math.PI; L = w; rD = d; } else if (f.face === "S") { rot = 0; L = w; rD = d; }
    else if (w >= d) { rot = 0; L = w; rD = d; } else { rot = Math.PI / 2; L = d; rD = w; }
  }
  let Dp = rD; const md = f.max_depth || MAXD[f.type];
  if (f.face && md && rD > md) { Dp = md; const sh = (rD - Dp) / 2; cx -= Math.sin(rot) * sh; cz -= Math.cos(rot) * sh; }
  Object.assign(f, { cx, cz, rot, L, Dp, H: f.height || 1.6 });
});

/* ------------------------------------------------ UI that works without WebGL */
const order = { alert: 0, watch: 1, ok: 2, empty: 3, service: 4 };
const ranked = FX.map((f, i) => i).sort((a, b) => order[FX[a].status] - order[FX[b].status] || FX[b].kpi.sales - FX[a].kpi.sales);
function renderStats() {
  const c = ST.counts, first = s => ranked.find(i => FX[i].status === s);
  $("#stats").innerHTML =
    `<button class="stat alert" type="button" data-go="${first("alert") ?? ""}"><b>${c.alert}</b><span>act today</span></button>` +
    `<button class="stat watch" type="button" data-go="${first("watch") ?? ""}"><b>${c.watch}</b><span>to watch</span></button>` +
    `<div class="stat ok"><b>${c.ok}</b><span>on plan</span></div>` +
    `<div class="stat"><b>${money(M.store_sales || 0)}</b><span>store sales, 7 days</span></div>` +
    `<div class="stat"><b>${FX.filter(hasData).length}/${FX.length}</b><span>shelves with data</span></div>`;
  $("#stats").addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b && b.dataset.go !== "") { select(+b.dataset.go, true); $("#stage").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" }); } });
}
function renderList() {
  const tb = $("#list tbody");
  tb.innerHTML = ranked.map(i => {
    const f = FX[i], k = f.kpi, where = f.aisle ? "Aisle " + f.aisle : f.zone;
    return `<tr data-i="${i}" id="row-${esc(f.id)}"><td class="nm"><i style="background:${STATUS_COL[f.status]}"></i>${esc(f.name)}</td><td>${esc(where)}</td>` +
      `<td class="n">${hasData(f) ? money(k.sales) : "–"}</td><td class="n">${hasData(f) ? pct(k.wow_pct, true) : "–"}</td>` +
      `<td class="n">${hasData(f) ? pct(k.gm_pct) : "–"}</td><td class="n">${hasData(f) ? money(k.waste) : "–"}</td>` +
      `<td class="why-c">${f.status === "ok" ? "On plan" : esc(f.reasons[0] || "")}</td></tr>`;
  }).join("");
  tb.addEventListener("click", e => { const r = e.target.closest("tr[data-i]"); if (!r) return; select(+r.dataset.i, true); $("#stage").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" }); });
  $("#listNote").textContent = ST.unplaced.length ? `${ST.unplaced.length} products not placed on the plan: ${ST.unplaced.map(p => p.name).join(", ")}` : "Every product in the data is placed on a shelf";
  $("#foot").textContent = `Shelly v${M.version || ""} · week ending ${M.asof_label || M.asof || ""}` + (M.synthetic ? " · synthetic demo data" : "");
}
function renderModes() {
  $("#modes").innerHTML = Object.entries(MODES).map(([k, m]) => `<button type="button" data-m="${k}" aria-pressed="${k === mode}">${m.label}</button>`).join("");
  $("#modes").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (!b) return; mode = b.dataset.m;
    $("#modes").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === mode))); recolour(); });
  recolourLegend();
}
function recolourLegend() { $("#legend").innerHTML = MODES[mode].legend() + (gl ? `<span>· gaps on a shelf = low stock cover</span>` : ""); }

function spark(v) {
  if (!v || v.length < 2) return "";
  const w = 300, h = 46, lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((y, i) => [i * w / (v.length - 1), h - 4 - (y - lo) / ((hi - lo) || 1) * (h - 8)]);
  const line = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), e = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polygon class="sa" points="0,${h} ${line} ${w},${h}"/><polyline class="sl" points="${line}"/><circle class="se" cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3"/></svg>`;
}
const REPORTS = [["category", "Category review"], ["stock", "Stock & reorder"], ["waste", "Waste & shrink"], ["forecast", "13-week forecast", "&h=13"]];
function actionHtml(a) {
  const it = a.decision_id && K() ? K().items().find(x => x.key === "s:" + a.decision_id) : null;
  let ctl = "";
  if (it) {
    const st = K().stateOf(it), chain = K().chainOf(it), step = K().stepOf(it);
    ctl = st === "y" ? `<span class="st">✓ approved</span><button type="button" data-undo="${esc(it.key)}">Undo</button>`
      : st === "n" ? `<span class="st">✗ rejected</span><button type="button" data-undo="${esc(it.key)}">Undo</button>`
      : `<button type="button" class="yes" data-yes="${esc(it.key)}">Approve as ${esc(chain[step].role)}</button><button type="button" data-no="${esc(it.key)}">Reject</button>` +
        `<span class="st">${chain.map((c, i) => (i < step ? "✓ " : i === step ? "● " : "○ ") + esc(c.role)).join(" › ")}</span>`;
  } else if (a.owner) ctl = `<span class="st">${esc(a.owner)} · ${esc(a.when || "")}</span>`;
  return `<div class="act ${esc(a.priority)}"><b>${esc(a.priority)} · ${esc(a.action)}</b><small>${esc(a.why)}</small><div class="row">${ctl}</div></div>`;
}
function renderDetail() {
  const d = $("#detail");
  if (sel < 0) {
    const top = ranked.filter(i => FX[i].status === "alert").slice(0, 4);
    d.innerHTML = `<div><span class="tag">Store floor · week ending ${esc(M.asof_label || M.asof || "")}</span><h3 style="margin:6px 0 0;font-size:21px;font-weight:600;color:var(--ink)">Tap a shelf to see its week</h3></div>` +
      `<p class="empty-d">Red shelves need something today, amber ones are worth a look. Start with these:</p>` +
      top.map(i => `<button type="button" class="act P1" style="text-align:left;cursor:pointer;color:inherit;font:inherit" data-pick="${i}"><b>${esc(FX[i].name)}</b><small>${esc(FX[i].reasons[0])}</small></button>`).join("");
    return;
  }
  window.dispatchEvent(new CustomEvent("store:shelf"));
  const f = FX[sel], k = f.kpi;
  const cats = [...new Set(f.products.map(p => p.category))];
  const cls = (v, good) => v == null ? "" : good(v) ? "good" : "bad";
  let h = `<div class="d-h"><span class="sw" style="background:${f.colour}"></span><div><span class="tag">${esc(f.aisle ? "Aisle " + f.aisle + " · " : "")}${esc(f.zone)}</span><h3>${esc(f.name)}</h3></div><span class="pill ${f.status}">${STATUS_TXT[f.status]}</span></div>`;
  if (hasData(f)) {
    h += `<div class="kpis"><div><b>${money(k.sales)}</b><span>sales 7d</span></div><div><b class="${cls(k.wow_pct, v => v >= 0)}">${pct(k.wow_pct, true)}</b><span>vs last wk</span></div>` +
      `<div><b class="${cls(k.gm_pct, v => v >= gmT)}">${pct(k.gm_pct)}</b><span>margin</span></div><div><b class="${cls(k.waste_pct, v => v <= wT)}">${money(k.waste)}</b><span>waste</span></div>` +
      `<div><b class="${cls(k.min_cover, v => v >= 2)}">${k.min_cover == null ? "–" : k.min_cover.toFixed(1) + "d"}</b><span>lowest cover</span></div><div><b>${k.share_pct}%</b><span>of store</span></div></div>`;
    h += `<div>${spark(f.trend)}<div class="spark-l"><span>14 days ago</span><span>daily sales</span><span>${esc(M.asof_label ? "week end" : "")}</span></div></div>`;
  }
  h += `<div><p class="sub-h">${f.status === "ok" ? "Why it's green" : "Why"}</p><ul class="why ${f.status}">${f.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
  if (f.actions.length) h += `<div><p class="sub-h">Actions for this shelf</p><div style="display:grid;gap:8px">${f.actions.map(actionHtml).join("")}</div></div>`;
  if (f.products.length) {
    h += `<div><p class="sub-h">Products on this shelf</p><table class="pr"><thead><tr><th>Product</th><th class="n">7d</th><th class="n">wk</th><th class="n">Cover</th></tr></thead><tbody>` +
      f.products.map(p => `<tr><td>${esc(p.name)}<small>${esc([p.reorder_status && p.reorder_status !== "OK" ? p.reorder_status : "", ...(p.flags || [])].filter(Boolean).join(" · ") || (p.abc ? "Class " + p.abc : ""))}</small></td>` +
        `<td class="n">${money(p.sales_7d || 0)}</td><td class="n">${pct(p.wow_pct, true)}</td><td class="n">${p.days_cover == null ? "–" : p.days_cover.toFixed(1) + "d"}</td></tr>`).join("") + `</tbody></table></div>`;
    h += `<div class="links">${cats.flatMap(c => REPORTS.map(([t, l, x]) => `<a href="../report.html?type=${t}&cat=${encodeURIComponent(c)}${x || ""}">${esc(l)}${cats.length > 1 ? " · " + esc(c) : ""}</a>`)).join("")}</div>`;
  } else if (f.items.length) {
    h += `<div><p class="sub-h">Typical range here</p><ul class="chips">${f.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    if (f.status === "empty") h += `<p class="empty-d">To see numbers here, add SKUs or categories to <code>${esc(f.id)}</code> in planogram.yaml.</p>`;
  }
  if (gl) h += `<button type="button" class="go" id="walkHere">🚶 Walk to this shelf</button>`;
  d.innerHTML = h;
}
$("#detail").addEventListener("click", e => {
  const p = e.target.closest("[data-pick]"); if (p) { select(+p.dataset.pick, true); return; }
  if (e.target.id === "walkHere" && sel >= 0) { walkTo(sel); return; }
  const kit = K(); if (!kit) return;
  const key = e.target.dataset.yes || e.target.dataset.no || e.target.dataset.undo;
  const it = key && kit.items().find(x => x.key === key); if (!it) return;
  kit.sign(it, e.target.dataset.yes ? "y" : e.target.dataset.no ? "n" : null);
  renderDetail();
});
window.addEventListener("shelly:approvals", () => renderDetail());

/* ------------------------------------------------ 3D */
function glOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
const gl = glOK();
let sel = -1;
let select = (i) => { sel = i; renderDetail(); markRow(); };
let walkTo = () => {};
function markRow() { document.querySelectorAll("#list tr.sel").forEach(r => r.classList.remove("sel")); if (sel >= 0) { const r = $("#row-" + CSS.escape(FX[sel].id)); if (r) r.classList.add("sel"); } }
let recolour = () => { recolourLegend(); };

renderStats(); renderList(); renderModes(); renderDetail();

if (!gl) { $("#nogl").hidden = false; $("#c").hidden = true; $("#vWalk").disabled = true;
  const m0 = location.hash.match(/^#fx-([\w-]+)$/); if (m0) { const i = FX.findIndex(f => f.id === m0[1]); if (i >= 0) select(i); } }
else (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(start3d);

function start3d() {
  const stage = $("#stage"), canvas = $("#c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, .05, 400); camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7ae9f, 1.9));
  scene.add(new THREE.AmbientLight(0xffffff, .55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(-8, 20, 12); scene.add(sun);

  const MC = {};
  const mat = (hex, o) => { const k = hex + (o ? JSON.stringify(o) : ""); return MC[k] || (MC[k] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, o || {}))); };
  const glow = hex => MC["b" + hex] || (MC["b" + hex] = new THREE.MeshBasicMaterial({ color: hex }));
  const GLASS = new THREE.MeshLambertMaterial({ color: 0xcfe6ef, transparent: true, opacity: .2, depthWrite: false });
  const FROST = new THREE.MeshLambertMaterial({ color: 0xdff2ff, transparent: true, opacity: .32, depthWrite: false });
  const PICK = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const box = (g, w, h, d, x, y, z, m) => { const me = new THREE.Mesh(BOXG, m); me.scale.set(w, h, d); me.position.set(x, y, z); g.add(me); return me; };

  let seed = 20261003;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const PKG = ["#d94a3d", "#f2c14e", "#3d7dd9", "#2e9e6a", "#f08a24", "#8a4fd6", "#f7f7f2", "#22313a", "#e85d9a", "#5fbfb8", "#b8322a", "#ffd23f"];
  const PAL = { bottle: ["#d62d2d", "#1f3c88", "#151515", "#2fa84f", "#f2c230", "#e9e9e9", "#f08a24", "#5a1f2b", "#cfe8f5"],
    fruit: ["#f4d03f", "#d63a2f", "#f39c12", "#7b9a3a", "#6b4a2f", "#3e6b2c", "#e8573c", "#4f9a3a", "#c9a26b"] };
  const pick = a => a[Math.floor(rnd() * a.length)];

  /* instanced stock */
  const INST = { box: [], bottle: [], fruit: [] };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function place(kind, g, x, y, z, sx, sy, sz, col) {
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)); m.premultiply(g.matrixWorld);
    const c = new THREE.Color(col); c.offsetHSL(0, 0, (rnd() - .5) * .06); INST[kind].push([m, c]);
  }
  function fillShelf(g, f, x0, x1, y, zb, depth, maxH, dir) {
    const pal = PAL[f.kind] || [f.colour, ...PKG];
    let x = x0;
    while (x < x1 - .06) {
      const col = pick(pal), fac = 1 + Math.floor(rnd() * 4), gap = rnd() > f.fill;
      if (f.kind === "bottle") {
        const r = .03 + rnd() * .017, h = Math.min(maxH * .9, .17 + rnd() * .17), rows = Math.max(1, Math.min(3, Math.floor(depth / (2 * r + .02))));
        for (let i = 0; i < fac && x + 2 * r < x1; i++) { if (!gap) for (let row = 0; row < rows; row++) place("bottle", g, x + r, y + h / 2, zb + dir * (depth - r - .02 - row * (2 * r + .015)), 2 * r, h, 2 * r, col); x += 2 * r + .008; }
      } else {
        const w = .07 + rnd() * .14, h = Math.min(maxH * .9, .09 + rnd() * .24), d = depth * .86;
        for (let i = 0; i < fac && x + w < x1; i++) { if (!gap) place("box", g, x + w / 2, y + h / 2, zb + dir * (depth * .5 + .01), w, h, d, col); x += w + .006; }
      }
      x += .012;
    }
  }
  function fillFruit(g, f, x0, x1, y, zb, depth, dir) {
    for (let bx = x0; bx < x1 - .12; bx += .5) {
      const bw = Math.min(.5, x1 - bx), col = pick(PAL.fruit), s = .07 + rnd() * .035;
      place("box", g, bx + bw / 2, y + .025, zb + dir * depth / 2, bw - .02, .05, depth * .96, "#8a6a45");
      if (rnd() > f.fill) continue;
      const nx = Math.floor((bw - .04) / s), nz = Math.max(1, Math.floor(depth * .9 / s));
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nx - layer; i++) for (let j = 0; j < nz - layer; j++)
        place("fruit", g, bx + .02 + s / 2 + (i + layer * .5) * s + (rnd() - .5) * .01, y + .05 + s * .45 + layer * s * .7, zb + dir * (.02 + s / 2 + (j + layer * .5) * s), s, s * .92, s, col);
    }
  }
  const METAL = mat("#eceeed"), BACK = mat("#d6dcd8"), PLINTH = mat("#39423e"), BODY = mat("#2c3539");
  function bWall(g, f) {
    const L = f.L, D = f.Dp, H = f.H;
    box(g, L, H, .04, 0, H / 2, -D / 2 + .02, BACK);
    box(g, .04, H, D, -L / 2 + .02, H / 2, 0, METAL); box(g, .04, H, D, L / 2 - .02, H / 2, 0, METAL);
    box(g, L, .12, D, 0, .06, 0, PLINTH);
    f.strip = box(g, L - .06, .16, .03, 0, H - .1, -D / 2 + .06, new THREE.MeshLambertMaterial({ color: f.colour }));
    const lv = H >= 1.7 ? 5 : 4, top = H - .3, step = (top - .12) / lv, zb = -D / 2 + .04;
    for (let i = 0; i < lv; i++) {
      const y = .12 + i * step, sd = f.kind === "fruit" ? (D - .06) * (1 - i * .16) : D - .06;
      box(g, L - .06, .025, sd, 0, y, zb + sd / 2, METAL);
      if (f.kind === "fruit") fillFruit(g, f, -L / 2 + .05, L / 2 - .05, y + .0125, zb, sd, 1); else fillShelf(g, f, -L / 2 + .05, L / 2 - .05, y + .0125, zb, sd, step - .04, 1);
    }
  }
  function bGondola(g, f) {
    const L = f.L, D = f.Dp, H = f.H, ec = f.no_endcaps ? 0 : .3, Lb = L - 2 * ec;
    box(g, Lb, H, .05, 0, H / 2, 0, BACK); box(g, Lb, .12, D, 0, .06, 0, PLINTH);
    if (ec) { box(g, ec, H, D, -L / 2 + ec / 2, H / 2, 0, mat("#5a3d86")); box(g, ec, H, D, L / 2 - ec / 2, H / 2, 0, mat("#8fb7d6")); }
    const lv = 4, top = H - .18, step = (top - .12) / lv, sd = D / 2 - .05;
    for (let i = 0; i < lv; i++) { const y = .12 + i * step; for (const s of [1, -1]) { box(g, Lb - .02, .025, sd, 0, y, s * (.025 + sd / 2), METAL); fillShelf(g, f, -Lb / 2 + .03, Lb / 2 - .03, y + .0125, s * .025, sd, step - .04, s); } }
    f.strip = box(g, Lb, .12, .08, 0, H + .06, 0, new THREE.MeshLambertMaterial({ color: f.colour }));
  }
  function bChiller(g, f, doors, frost) {
    const L = f.L, D = f.Dp, H = f.H;
    box(g, L, H, .04, 0, H / 2, -D / 2 + .02, glow(frost ? "#eaf6ff" : "#f3f7f8"));
    box(g, .05, H, D, -L / 2 + .025, H / 2, 0, BODY); box(g, .05, H, D, L / 2 - .025, H / 2, 0, BODY);
    box(g, L, .2, D, 0, .1, 0, BODY); box(g, L, .3, D, 0, H - .15, 0, BODY);
    f.strip = box(g, L - .1, .13, .02, 0, H - .15, D / 2 + .012, new THREE.MeshLambertMaterial({ color: f.colour }));
    const lv = doors ? 5 : 4, bottom = .22, top = H - .36, step = (top - bottom) / lv;
    for (let i = 0; i < lv; i++) {
      const y = bottom + i * step, sd = doors ? D - .16 : (D - .12) * (1 - i * .12);
      box(g, L - .1, .02, sd, 0, y, -D / 2 + .04 + sd / 2, mat("#c9d2d6"));
      if (f.kind === "fruit") fillFruit(g, f, -L / 2 + .07, L / 2 - .07, y + .01, -D / 2 + .04, sd, 1); else fillShelf(g, f, -L / 2 + .07, L / 2 - .07, y + .01, -D / 2 + .04, sd, step - .04, 1);
    }
    if (doors) {
      const gh = H - .52, gy = .2 + gh / 2, z = D / 2 - .03;
      box(g, L - .08, gh, .02, 0, gy, z, frost ? FROST : GLASS);
      const n = Math.max(1, Math.round(L / .72)), dw = (L - .08) / n;
      for (let i = 0; i <= n; i++) box(g, .045, gh, .05, -L / 2 + .04 + i * dw, gy, z, BODY);
      for (let i = 0; i < n; i++) box(g, .025, .5, .04, -L / 2 + .04 + i * dw + dw - .09, 1.15, z + .04, mat("#9aa3a7"));
    } else box(g, L - .1, .22, .06, 0, .31, D / 2 - .04, BODY);
  }
  function bIsland(g, f) {
    box(g, f.L, .72, f.Dp, 0, .36, 0, mat("#9b7048")); box(g, f.L + .04, .05, f.Dp + .04, 0, .745, 0, mat("#7a5534"));
    for (const s of [1, -1]) fillFruit(g, f, -f.L / 2 + .03, f.L / 2 - .03, .77, 0, f.Dp / 2 - .03, s);
  }
  function bCounter(g, f) {
    const L = f.L, D = f.Dp;
    box(g, L, .95, D, 0, .475, 0, mat("#24543f")); box(g, L + .04, .04, D + .04, 0, .97, 0, mat("#e7e1d4"));
    box(g, .36, .08, .3, L / 4, 1.03, 0, mat("#26292b"));
    const sc = box(g, .32, .22, .02, L / 4, 1.2, -.06, glow("#2c4a5c")); sc.rotation.x = -.25;
    if (f.id === "hotfood") { box(g, .6, .55, .45, -L / 4, 1.27, -D / 4, mat("#b8bec0")); box(g, .8, .45, .5, 0, 1.22, -D / 4, FROST);
      for (let i = 0; i < 10; i++) place("box", g, -.3 + (i % 5) * .15, 1.04, -D / 4 + (i < 5 ? -.1 : .1), .12, .05, .12, "#d8a050"); }
  }
  function bKiosks(g, f) {                               // self-checkout kiosks: bagging shelf, scanner and screen
    const n = f.count || 4, w = f.L / n;
    for (let i = 0; i < n; i++) { const x = -f.L / 2 + (i + .5) * w;
      box(g, w - .18, .85, f.Dp * .8, x, .425, -.05, mat("#24543f")); box(g, w - .14, .04, f.Dp * .85, x, .87, -.05, mat("#e7e1d4"));
      box(g, .05, .55, .05, x - w / 2 + .2, 1.15, -.15, mat("#26292b"));
      const sc = box(g, .34, .26, .03, x - w / 2 + .2, 1.45, -.12, glow("#3f8fb5")); sc.rotation.x = -.3;
      box(g, .16, .05, .2, x + .12, .91, .05, mat("#26292b")); box(g, .12, .02, .14, x + .12, .94, .05, glow("#ff5a5a"));
      const lamp = box(g, .06, .06, .06, x - w / 2 + .2, 1.75, -.15, glow(i % 2 ? "#3fb87f" : "#3fb87f")); f.lamps = f.lamps || []; f.lamps.push(lamp); }
  }
  function bTable(g, f) {
    box(g, f.L, .7, f.Dp, 0, .35, 0, mat("#6b4a2f"));
    for (let layer = 0; layer < 4; layer++) { const nx = 6 - layer, nz = 3 - Math.min(layer, 2), cw = (f.L - .2) / 6, cd = (f.Dp - .2) / 3;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) place("box", g, -((nx - 1) * cw) / 2 + i * cw, .83 + layer * .26, -((nz - 1) * cd) / 2 + j * cd, cw - .02, .25, cd - .02, pick(PKG)); }
  }

  /* signs: name + this mode's figure, redrawn when the colour mode changes */
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function drawSign(c, f) {
    const x = c.getContext("2d"), W = c.width, H = c.height, col = MODES[mode].col(f), val = MODES[mode].val(f);
    x.clearRect(0, 0, W, H);
    x.fillStyle = "rgba(9,14,22,.94)"; rr(x, 4, 4, W - 8, H - 8, 26); x.fill();
    x.strokeStyle = col; x.lineWidth = 6; rr(x, 4, 4, W - 8, H - 8, 26); x.stroke();
    x.fillStyle = f.colour; x.fillRect(4, 34, 18, H - 68);
    x.textBaseline = "middle";
    x.fillStyle = "#8fa0b4"; x.font = "600 26px 'JetBrains Mono', monospace"; x.fillText((f.aisle ? "AISLE " + f.aisle : f.zone.toUpperCase()).slice(0, 28), 44, 46);
    let fs = 50; x.fillStyle = "#eaf0f6";
    do { x.font = `700 ${fs}px 'Plus Jakarta Sans', sans-serif`; fs -= 2; } while (x.measureText(f.name).width > W - 80 && fs > 22);
    x.fillText(f.name, 44, 104);
    x.font = "700 34px 'JetBrains Mono', monospace"; const tw = x.measureText(val).width + 40;
    x.fillStyle = col; rr(x, 44, 146, tw, 54, 27); x.fill();
    x.fillStyle = "#07131c"; x.fillText(val, 64, 174);
    if (hasData(f) && mode === "status" && f.status !== "ok") { x.fillStyle = "#b0bac8"; x.font = "500 24px 'Plus Jakarta Sans', sans-serif"; let r = f.reasons[0]; while (x.measureText(r).width > W - tw - 80 && r.length > 4) r = r.slice(0, -2); x.fillText(r === f.reasons[0] ? r : r + "…", 44 + tw + 16, 174); }
  }

  const pickables = [], colliders = [], groups = [];
  /* ground, back of house, sales floor */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), mat("#151c25")); ground.rotation.x = -Math.PI / 2; ground.position.y = -.03; scene.add(ground);
  const bb = [wx(45), wz(220), wx(1340), wz(1640)];
  const boh = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0], bb[3] - bb[1]), mat("#2a333d")); boh.rotation.x = -Math.PI / 2; boh.position.set((bb[0] + bb[2]) / 2, -.01, (bb[1] + bb[3]) / 2); scene.add(boh);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(bb[2] - bb[0] + 2, 3.2), mat("#3a434d")); path.rotation.x = -Math.PI / 2; path.position.set((bb[0] + bb[2]) / 2, -.02, bb[3] + 1.7); scene.add(path);
  const tc = document.createElement("canvas"); tc.width = tc.height = 128; const tx = tc.getContext("2d");
  tx.fillStyle = "#ebe8e1"; tx.fillRect(0, 0, 128, 128); tx.fillStyle = "#e2ded5"; tx.fillRect(64, 0, 64, 64); tx.fillRect(0, 64, 64, 64);
  tx.strokeStyle = "#d3cec4"; tx.lineWidth = 2; tx.strokeRect(0, 0, 128, 128);
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace; tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(1 / 1.2, 1 / 1.2); tt.anisotropy = 8;
  const shape = new THREE.Shape(POLY.map(([x, z]) => new THREE.Vector2(x, -z)));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ map: tt })); floor.rotation.x = -Math.PI / 2; floor.position.y = .002; scene.add(floor);

  /* walls: doorways (entrance, staff door) leave a walkable gap; colliders only on the solid parts */
  const WM = mat("#f1eee7");
  function buildWall(a, b, kind, WH = 2.9, wm = WM) {
    const x1 = wx(a[0]), z1 = wz(a[1]), x2 = wx(b[0]), z2 = wz(b[1]), len = Math.hypot(x2 - x1, z2 - z1), rot = -Math.atan2(z2 - z1, x2 - x1), Tk = .15;
    const g = new THREE.Group(); g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2); g.rotation.y = rot;
    const solid = (from, to) => { const l = to - from; if (l <= .01) return; const c = (from + to) / 2, co = Math.cos(rot), si = Math.sin(rot);
      colliders.push({ cx: g.position.x + c * co, cz: g.position.z - c * si, hw: l / 2, hd: Tk / 2 + .02, rot }); };
    if (kind === "glass") { box(g, len, .5, Tk, 0, .25, 0, wm); box(g, len, 1.9, .04, 0, 1.45, 0, GLASS); box(g, len, .5, Tk, 0, 2.65, 0, wm);
      const n = Math.max(1, Math.round(len / 1.6)); for (let i = 0; i <= n; i++) box(g, .07, 1.9, .08, -len / 2 + i * len / n, 1.45, 0, BODY); solid(-len / 2, len / 2); }
    else if (kind === "door" || kind === "staff") {
      const gap = kind === "door" ? Math.min(1.6, len - .3) : Math.min(1.1, len - .3), side = (len - gap) / 2;
      box(g, len, WH - 2.2, Tk, 0, 2.2 + (WH - 2.2) / 2, 0, wm);
      if (side > .02) { box(g, side, 2.2, Tk, -len / 2 + side / 2, 1.1, 0, wm); box(g, side, 2.2, Tk, len / 2 - side / 2, 1.1, 0, wm); }
      if (kind === "door") { box(g, gap / 2, 2.15, .04, -len / 2 + side + gap / 4 - gap / 2 + .05, 1.08, .12, GLASS); box(g, gap / 2, 2.15, .04, len / 2 - side - gap / 4 + gap / 2 - .05, 1.08, .12, GLASS);
        [-gap / 2, gap / 2].forEach(p => box(g, .07, 2.2, .1, p, 1.1, 0, BODY)); }
      else { const d = box(g, gap - .05, 2.1, .05, 0, 1.05, 0, mat("#8a6a48")); d.geometry = BOXG; d.position.set(-gap / 2 + .03, 1.05, (gap - .05) / 2); d.rotation.y = Math.PI / 2; }
      solid(-len / 2, -gap / 2); solid(gap / 2, len / 2);
    }
    else { box(g, len, WH, Tk, 0, WH / 2, 0, wm); solid(-len / 2, len / 2);
      const pk = new THREE.Mesh(BOXG, PICK); pk.scale.set(len, WH, Tk + .1); pk.position.y = WH / 2; pk.userData.fi = -1; g.add(pk); pickables.push(pk); }
    scene.add(g); return g;
  }
  ST.plan.walls.forEach(([a, b, kind]) => buildWall(a, b, kind));
  /* storefront fascia */
  const fx1 = wx(795), fx2 = wx(1330), fz = wz(1640);
  box(scene, fx2 - fx1, .75, .25, (fx1 + fx2) / 2, 3.2, fz + .05, mat("#1d6b48"));
  const fcv = document.createElement("canvas"); fcv.width = 1400; fcv.height = 150; const fxx = fcv.getContext("2d");
  fxx.fillStyle = "#f4d35e"; fxx.font = "700 92px 'Plus Jakarta Sans', sans-serif"; fxx.textBaseline = "middle"; fxx.fillText("Neighbourhood Store", 40, 78);
  const ft = new THREE.CanvasTexture(fcv); ft.colorSpace = THREE.SRGBColorSpace;
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(7.5, .8), new THREE.MeshBasicMaterial({ map: ft, transparent: true })); fp.position.set((fx1 + fx2) / 2 - 1.2, 3.2, fz + .19); scene.add(fp);

  /* ceiling + light panels (walk view only) */
  const ceil = new THREE.Group();
  const cp = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat("#f4f4f1", { side: THREE.DoubleSide })); cp.rotation.x = -Math.PI / 2; cp.position.y = 2.9; ceil.add(cp);
  for (let x = wx(420); x < wx(1320); x += 2.6) for (let z = wz(420); z < wz(1620); z += 3) if (inside(x, z)) { const lp = new THREE.Mesh(BOXG, glow("#ffffff")); lp.scale.set(1.2, .03, .3); lp.position.set(x, 2.88, z); ceil.add(lp); }
  ceil.visible = false; scene.add(ceil);

  /* fixtures */
  const RING = new THREE.RingGeometry(.92, 1, 48);
  FX.forEach((f, i) => {
    f.fill = hasData(f) ? Math.max(.45, Math.min(1, .45 + (f.kpi.min_cover ?? 7) / 6)) : .92;
    const g = new THREE.Group(); g.position.set(f.cx, 0, f.cz); g.rotation.y = f.rot; g.updateMatrixWorld(true);
    ({ wall: bWall, gondola: bGondola, island: bIsland, counter: bCounter, table: bTable, kiosks: bKiosks }[f.type] || ((g, f) => bChiller(g, f, f.type !== "multideck", f.type === "freezer")))(g, f);
    const tall = f.type === "table" ? 1.9 : f.H;
    const pk = new THREE.Mesh(BOXG, PICK); pk.scale.set(f.L, tall, f.Dp); pk.position.y = tall / 2; pk.userData.fi = i; g.add(pk); pickables.push(pk);
    // halo plate on the floor in the mode colour
    f.halo = new THREE.Mesh(BOXG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false }));
    f.halo.scale.set(f.L + .5, .01, f.Dp + .5); f.halo.position.y = .008; g.add(f.halo);
    // alert beacon: a ring pulsing on the floor
    if (f.status === "alert") { f.ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: STATUS_COL.alert, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
      f.ring.rotation.x = -Math.PI / 2; f.ring.position.y = .02; f.ringR = Math.max(f.L, f.Dp) / 2 + .6; scene.add(f.ring); f.ring.position.x = f.cx; f.ring.position.z = f.cz; }
    // sign
    f.signC = document.createElement("canvas"); f.signC.width = 640; f.signC.height = 220;
    f.signT = new THREE.CanvasTexture(f.signC); f.signT.colorSpace = THREE.SRGBColorSpace; f.signT.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: f.signT, transparent: true })); const sw = f.L < 1.6 ? 1.8 : 2.4;
    sp.scale.set(sw, sw * 220 / 640, 1); sp.position.set(0, (f.face ? f.H + .5 : Math.max(f.H, 1.2) + .85), f.face ? .1 : 0); sp.renderOrder = 5; g.add(sp); f.sprite = sp;
    scene.add(g); groups.push(g);
    colliders.push({ cx: f.cx, cz: f.cz, hw: f.L / 2, hd: f.Dp / 2, rot: f.rot });
  });
  const geos = { box: BOXG, bottle: new THREE.CylinderGeometry(.5, .5, 1, 10), fruit: new THREE.IcosahedronGeometry(.5, 1) };
  for (const k in INST) {
    const arr = INST[k]; if (!arr.length) continue;
    const im = new THREE.InstancedMesh(geos[k], new THREE.MeshLambertMaterial({ color: 0xffffff }), arr.length);
    arr.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; scene.add(im);
  }

  /* v3: hand the built world to the store-team simulation (docs/store/v3/) */
  const ctx = { THREE, scene, camera, canvas, ST, FX, wx, wz, inside, colliders, box, mat, glow, BOXG, buildWall,
    hooks: [], people: [], view: () => view, select: (i, fly) => select(i, fly), onPerson: null, still, mode: () => mode };
  /* Classic look (docs/store/v3/classic.js): glass walls and a darker floor so the category cards read; Detailed = the store as built */
  const LOOK0 = { wall: WM.color.getHex(), floor: floor.material.color.getHex(), boh: boh.material.color.getHex() };
  ctx.setLook = l => { const c = l === "classic";
    WM.transparent = c; WM.opacity = c ? .28 : 1; WM.color.set(c ? "#7fc6e6" : LOOK0.wall); WM.depthWrite = !c; WM.needsUpdate = true;
    floor.material.color.set(c ? "#6f7d8c" : LOOK0.floor); boh.material.color.set(c ? "#1b232d" : LOOK0.boh); };
  import("./v3/sim.js").then(m => m.startSim(ctx)).catch(e => { console.error("store team simulation failed", e); });

  recolour = () => {
    FX.forEach(f => { const c = MODES[mode].col(f); f.halo.material.color.set(c); f.halo.material.opacity = hasData(f) ? .6 : .25; drawSign(f.signC, f); f.signT.needsUpdate = true;
      if (f.strip) f.strip.material.color.set(mode === "status" ? f.colour : c);
      if (f.ring) f.ring.visible = mode === "status"; });
    recolourLegend();
  };
  recolour();

  /* collision */
  const R = .3;
  const blocked = ctx.blocked = (x, z) => colliders.some(c => { const dx = x - c.cx, dz = z - c.cz, co = Math.cos(c.rot), si = Math.sin(c.rot); return Math.abs(dx * co - dz * si) < c.hw + R && Math.abs(dx * si + dz * co) < c.hd + R; });

  /* camera state */
  let view = "over";
  const [ex, ey] = ST.plan.entrance_px;
  const pos = { x: wx(ex), z: wz(ey) }; let yaw = -.35, pitch = -.04;
  const ov = { tx: wx(840), tz: wz(1000), dist: 30, theta: .25, phi: .82 };
  let anim = null; const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const tween = (dur, fn) => { if (still) { fn(1); anim = null; } else anim = { t: 0, dur, fn }; };
  const keys = {}, joy = { x: 0, y: 0 };
  const WALK_BG = new THREE.Color("#d9dcd8");
  function setView(v) {
    if (v === view) return;
    if (v === "over") { ov.tx = pos.x - Math.sin(yaw) * 4; ov.tz = pos.z - Math.cos(yaw) * 4; ov.theta = yaw; ov.dist = 24; ov.phi = .8; }
    view = v; anim = null;
    $("#vWalk").setAttribute("aria-pressed", String(v === "walk")); $("#vOver").setAttribute("aria-pressed", String(v === "over"));
    $("#joy").hidden = v !== "walk"; ceil.visible = v === "walk";
    scene.background = v === "walk" ? WALK_BG : null; scene.fog = v === "walk" ? new THREE.Fog(WALK_BG, 22, 60) : null;
    showHint();
  }
  $("#vWalk").onclick = () => setView("walk"); $("#vOver").onclick = () => setView("over");

  /* selection outline */
  let selLine = null;
  select = (i, fly) => {
    if (selLine) { selLine.parent.remove(selLine); selLine.geometry.dispose(); selLine = null; }
    sel = i; renderDetail(); markRow();
    if (i < 0) return;
    const f = FX[i], h = f.type === "table" ? 1.9 : f.H;
    selLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(f.L + .1, h + .1, f.Dp + .1)), new THREE.LineBasicMaterial({ color: 0x63b6d8, depthTest: false, transparent: true }));
    selLine.position.y = h / 2; selLine.renderOrder = 10; groups[i].add(selLine);
    if (fly) { if (view === "walk") walkTo(i); else focusOver(i); }
    try { history.replaceState(null, "", "#fx-" + f.id); } catch (e) { /* file:// */ }
  };
  function focusOver(i) {
    const f = FX[i], t0 = { ...ov }, d1 = Math.max(9, f.L * 1.5 + 6);
    tween(.8, k => { ov.tx = t0.tx + (f.cx - t0.tx) * k; ov.tz = t0.tz + (f.cz - t0.tz) * k; ov.dist = t0.dist + (d1 - t0.dist) * k; ov.phi = t0.phi + (.78 - t0.phi) * k; });
  }
  walkTo = i => {
    const f = FX[i], nx = Math.sin(f.rot), nz = Math.cos(f.rot); let best = null;
    for (const dist of [f.Dp / 2 + 1.1, f.Dp / 2 + 1.6, f.Dp / 2 + .8]) { for (const s of (f.face ? [1] : [1, -1])) {
      const px = f.cx + nx * s * dist, pz = f.cz + nz * s * dist;
      if (inside(px, pz) && !blocked(px, pz)) { const dd = Math.hypot(px - pos.x, pz - pos.z); if (!best || dd < best.dd) best = { px, pz, dd }; } } if (best) break; }
    if (!best) { setView("over"); focusOver(i); return; }
    if (view !== "walk") setView("walk");
    const x0 = pos.x, z0 = pos.z, y0 = yaw, p0 = pitch; let y1 = Math.atan2(-(f.cx - best.px), -(f.cz - best.pz));
    while (y1 - y0 > Math.PI) y1 -= 2 * Math.PI; while (y1 - y0 < -Math.PI) y1 += 2 * Math.PI;
    tween(.9, k => { pos.x = x0 + (best.px - x0) * k; pos.z = z0 + (best.pz - z0) * k; yaw = y0 + (y1 - y0) * k; pitch = p0 + (-.12 - p0) * k; });
  };

  /* input */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function doPick(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
    const ph = ctx.people.length ? ray.intersectObjects(ctx.people, true)[0] : null;
    if (ph && ctx.onPerson) { let o = ph.object; while (o && !o.userData.personId) o = o.parent; if (o) { ctx.onPerson(o.userData.personId); return; } }
    const hit = ray.intersectObjects(pickables, false)[0]; select(hit ? hit.object.userData.fi : -1, false); }
  const ptrs = new Map(); let down = null, pinch = null;
  const pinchState = () => { const p = [...ptrs.values()]; return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 }; };
  function pan(dx, dy) { const k = ov.dist * .0018, rx = Math.cos(ov.theta), rz = -Math.sin(ov.theta), fx = -Math.sin(ov.theta), fz = -Math.cos(ov.theta);
    ov.tx = Math.max(-14, Math.min(20, ov.tx - rx * dx * k + fx * dy * k)); ov.tz = Math.max(-16, Math.min(20, ov.tz - rz * dx * k + fz * dy * k)); }
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { t: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey }; else if (down) down.moved = 99;
    if (ptrs.size === 2) pinch = pinchState(); anim = null; hideHint(); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { if (view === "walk") { yaw += dx * .0045; pitch = Math.max(-1.2, Math.min(1.1, pitch + dy * .0035)); }
      else if (down && down.pan) pan(dx, dy); else { ov.theta -= dx * .006; ov.phi = Math.max(.12, Math.min(1.35, ov.phi - dy * .005)); } }
    else if (ptrs.size === 2 && pinch && view === "over") { const n = pinchState(); ov.dist = Math.max(5, Math.min(48, ov.dist * pinch.d / n.d)); pan(n.mx - pinch.mx, n.my - pinch.my); pinch = n; }
  });
  const endPtr = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0 && down) { if (e.type === "pointerup" && down.moved < 8 && performance.now() - down.t < 500) doPick(e.clientX, e.clientY); down = null; } };
  canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => { if (view !== "over") return; e.preventDefault(); anim = null; ov.dist = Math.max(5, Math.min(48, ov.dist * Math.exp(e.deltaY * .0012))); }, { passive: false });
  const KM = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", KeyD: "r", ArrowLeft: "tl", ArrowRight: "tr", ShiftLeft: "shift", ShiftRight: "shift" };
  canvas.addEventListener("keydown", e => { const k = KM[e.code]; if (k) { if (view !== "walk" && k !== "shift") setView("walk"); keys[k] = true; e.preventDefault(); hideHint(); } if (e.code === "Escape") select(-1); });
  canvas.addEventListener("keyup", e => { const k = KM[e.code]; if (k) keys[k] = false; });
  canvas.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  const joyEl = $("#joy"), knob = $("#knob"); let joyId = null;
  function joyMove(e) { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const Rr = r.width / 2 - 20, m = Math.hypot(dx, dy); if (m > Rr) { dx *= Rr / m; dy *= Rr / m; } joy.x = dx / Rr; joy.y = dy / Rr; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  joyEl.addEventListener("pointerdown", e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); hideHint(); });
  joyEl.addEventListener("pointermove", e => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; knob.style.transform = ""; };
  joyEl.addEventListener("pointerup", joyEnd); joyEl.addEventListener("pointercancel", joyEnd);

  /* hint */
  let hintT = null;
  function showHint() { const h = $("#hint");
    h.textContent = view === "walk" ? (touch ? "Drag to look · joystick to walk · tap a shelf" : "Drag to look · W A S D to walk · click a shelf")
      : (touch ? "Drag to turn · pinch to zoom · two fingers to pan · tap a shelf" : "Drag to turn · scroll to zoom · right-drag to pan · click a shelf");
    h.classList.remove("fade"); clearTimeout(hintT); hintT = setTimeout(hideHint, 6000); }
  function hideHint() { $("#hint").classList.add("fade"); }

  /* minimap */
  const mini = $("#mini"), mx = mini.getContext("2d");
  const MB = { x0: wx(345), x1: wx(1340), z0: wz(345), z1: wz(1650) };
  let mW = 0, mH = 0, mK = 1;
  function sizeMini() { mW = mini.clientWidth || 112; mK = mW / (MB.x1 - MB.x0); mH = (MB.z1 - MB.z0) * mK; const dpr = Math.min(devicePixelRatio || 1, 2);
    mini.style.height = mH + "px"; mini.width = mW * dpr; mini.height = mH * dpr; mx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const m2 = (x, z) => [(x - MB.x0) * mK, (z - MB.z0) * mK];
  function drawMini() {
    mx.clearRect(0, 0, mW, mH);
    mx.beginPath(); POLY.forEach(([x, z], i) => { const [a, b] = m2(x, z); i ? mx.lineTo(a, b) : mx.moveTo(a, b); }); mx.closePath();
    mx.fillStyle = "#1c2633"; mx.fill(); mx.strokeStyle = "#7d8a9c"; mx.lineWidth = 1.2; mx.stroke();
    FX.forEach((f, i) => { const co = Math.cos(f.rot), si = Math.sin(f.rot); mx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], j) => { const lx = a * f.L / 2, lz = b * f.Dp / 2, [p, q] = m2(f.cx + lx * co + lz * si, f.cz - lx * si + lz * co); j ? mx.lineTo(p, q) : mx.moveTo(p, q); });
      mx.closePath(); mx.fillStyle = MODES[mode].col(f); mx.fill(); if (i === sel) { mx.strokeStyle = "#ffffff"; mx.lineWidth = 2; mx.stroke(); } });
    const [a, b] = m2(view === "walk" ? pos.x : ov.tx, view === "walk" ? pos.z : ov.tz);
    mx.save(); mx.translate(a, b); mx.rotate(-(view === "walk" ? yaw : ov.theta));
    if (view === "walk") { mx.fillStyle = "rgba(99,182,216,.3)"; mx.beginPath(); mx.moveTo(0, 0); mx.arc(0, 0, 20, -Math.PI / 2 - .55, -Math.PI / 2 + .55); mx.closePath(); mx.fill(); }
    mx.fillStyle = "#63b6d8"; mx.beginPath(); mx.moveTo(0, -6); mx.lineTo(4.5, 4.5); mx.lineTo(0, 2.5); mx.lineTo(-4.5, 4.5); mx.closePath(); mx.fill(); mx.restore();
  }
  mini.addEventListener("pointerdown", e => { const r = mini.getBoundingClientRect(), x = MB.x0 + (e.clientX - r.left) / mK, z = MB.z0 + (e.clientY - r.top) / mK;
    if (view === "walk") { if (inside(x, z) && !blocked(x, z)) { const x0 = pos.x, z0 = pos.z; tween(.6, k => { pos.x = x0 + (x - x0) * k; pos.z = z0 + (z - z0) * k; }); } }
    else { const t0 = { tx: ov.tx, tz: ov.tz }; tween(.6, k => { ov.tx = t0.tx + (x - t0.tx) * k; ov.tz = t0.tz + (z - t0.tz) * k; }); } });

  /* loop */
  function update(dt, t) {
    if (anim) { anim.t += dt; const k = Math.min(1, anim.t / anim.dur); anim.fn(ease(k)); if (k >= 1) anim = null; }
    if (view === "walk") {
      if (keys.tl) yaw += 1.8 * dt; if (keys.tr) yaw -= 1.8 * dt;
      let fw = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) - joy.y, st = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + joy.x; const m = Math.hypot(fw, st); if (m > 1) { fw /= m; st /= m; }
      if (m > .02) { anim = null; const sp = (keys.shift ? 4 : 2.3) * dt, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const dx = (fx * fw + rx * st) * sp, dz = (fz * fw + rz * st) * sp; if (!blocked(pos.x + dx, pos.z)) pos.x += dx; if (!blocked(pos.x, pos.z + dz)) pos.z += dz; }
      camera.position.set(pos.x, 1.6, pos.z); camera.rotation.set(pitch, yaw, 0);
    } else { const sp = Math.sin(ov.phi); camera.position.set(ov.tx + ov.dist * sp * Math.sin(ov.theta), ov.dist * Math.cos(ov.phi), ov.tz + ov.dist * sp * Math.cos(ov.theta)); camera.lookAt(ov.tx, 0, ov.tz); }
    if (!still) FX.forEach(f => { if (f.ring && f.ring.visible) { const k = (t / 1600 + f.cx * .1) % 1; const s = f.ringR * (.75 + k * .6); f.ring.scale.set(s, s, 1); f.ring.material.opacity = .85 * (1 - k); } });
    else FX.forEach(f => { if (f.ring) f.ring.scale.set(f.ringR, f.ringR, 1); });
  }
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix(); sizeMini(); }
  new ResizeObserver(resize).observe(stage); resize();
  let last = performance.now(), visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
  function loop(t) { const raw = Math.min(.5, Math.max(0, (t - last) / 1000)), dt = Math.min(.05, raw); last = t; ctx.hooks.forEach(h => h(raw, t, visible)); if (visible) { update(dt, t); renderer.render(scene, camera); drawMini(); } requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  showHint();
  const m = location.hash.match(/^#fx-([\w-]+)$/); if (m) { const i = FX.findIndex(f => f.id === m[1]); if (i >= 0) select(i, true); }
}

/* ------------------------------------------------ links into the floor (from the store app, Improve tab, HQ)
   #fx-<fixture id> · #cat=<category>&m=<mode> · #m=<mode>                                                   */
function fromHash() {
  const h = location.hash.slice(1); if (!h) return;
  if (/^fx-/.test(h)) { const i = FX.findIndex(f => f.id === h.slice(3)); if (i >= 0) select(i, true); return; }
  const q = new URLSearchParams(h), m = q.get("m"), cat = q.get("cat");
  if (m && MODES[m]) { const b = document.querySelector(`#modes [data-m="${m}"]`); if (b) b.click(); }
  if (cat) { let best = -1, bs = -1; FX.forEach((f, i) => { const v = (f.products || []).filter(p => p.category === cat).reduce((a, p) => a + (p.sales_7d || 0), 0); if (v > bs) { bs = v; best = i; } });
    if (best >= 0 && bs > 0) select(best, true); }
}
addEventListener("hashchange", fromHash);
setTimeout(fromHash, 1600);   // after the 3D view has started

/* Live POS (optional): `python -m shelly live <till export>` writes docs/data/live.json (git-ignored, never published).
   Only asked for with store/?live=1 (remembered on this device), so the public site never requests a file it doesn't have. */
async function pollLive() {
  let on = /[?&]live=1/.test(location.search);
  try { if (on) localStorage.setItem("shelly.floor.live", "1"); else on = localStorage.getItem("shelly.floor.live") === "1"; } catch (e) { /* private mode */ }
  if (!on) return;
  try { const r = await fetch("../data/live.json", { cache: "no-store" }); if (!r.ok) return; const d = await r.json();
    if (d && Array.isArray(d.by_hour)) window.SHELLY_LIVE = d; } catch (e) { /* no feed: typical day from the footfall profile */ }
}
pollLive(); setInterval(pollLive, 60000);
