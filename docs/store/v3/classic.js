/* Store Floor · Classic look (the default): the same live store, drawn the way the first floor view was.
   - one card per category over its shelves: this week's sales and the change on last week (RECALL badge when one is open)
   - a header card with the colour mode ("Sales heat") and a big clock
   - the hourly timeline: customers expected each hour (live POS when connected), floor cover per hour,
     Now / Play the day, tap or drag to jump the store to any time
   "Detailed" switches back to the signs on every shelf. Everything else (team, tasks, Improve, walk) is shared. */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = s => document.querySelector(s);
const kmoney = v => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + "k" : Math.round(Math.abs(v)));
const FLOOR_ROLES = new Set(["Store Team", "Duty Manager"]);
const HEAD = { status: ["Shelf status", "What needs doing today, shelf by shelf"], sales: ["Sales heat", "This week's sales by shelf; arrow = vs last week"],
  wow: ["Change on last week", "Sales growth by shelf"], margin: ["Margin", "Gross margin by shelf against target"], waste: ["Waste", "Waste as a share of each shelf's sales"],
  cover: ["Stock cover", "Lines below lead-time cover or on today's order"], budget: ["vs Budget", "This week against budget"], forecast: ["Forecast", "Next 7 days by shelf"] };

export function initClassic(ctx, S, { fmt, hm }) {
  const { THREE, ST, FX, camera, canvas } = ctx;
  const stage = $("#stage"), tl = $("#tl"), OPS = ST.operations || {};
  if (!stage || !tl) return { update() {}, frame() {} };

  /* ---------- category cards */
  const catOf = {}; FX.forEach(f => (f.products || []).forEach(p => { catOf[p.name] = p.category; }));
  const recalled = new Set();
  FX.forEach(f => (f.reasons || []).filter(r => /recall/i.test(r)).forEach(r => { const c = catOf[r.split(":")[0].trim()]; if (c) recalled.add(c); }));
  const cards = (ST.categories || []).map(c => {
    let w = 0, x = 0, z = 0, h = 0, best = -1, bs = -1;
    FX.forEach((f, i) => { const v = (f.products || []).filter(p => p.category === c.category).reduce((a, p) => a + (p.sales_7d || 0), 0);
      if (v > 0) { w += v; x += f.cx * v; z += f.cz * v; h = Math.max(h, f.H || 1.6); if (v > bs) { bs = v; best = i; } } });
    return w ? { c, x: x / w, z: z / w, y: h + .5, fx: best } : null;
  }).filter(Boolean);
  const fxId = id => FX.findIndex(f => f.id === id);
  const svc = [];
  const ck = fxId("checkout");
  if (ck >= 0) svc.push({ name: "Checkout", line: `${OPS.customers_per_day || "–"} baskets/day`, x: FX[ck].cx, z: FX[ck].cz, y: 1.9, fx: ck });
  const dl = OPS.delivery || {};
  const sc = fxId("selfcheck");
  if (dl.share_pct != null && sc >= 0) svc.push({ name: "Delivery pickup", line: `${dl.share_pct}% of sales`, x: FX[sc].cx, z: FX[sc].cz, y: 2.1, fx: ck, amber: true });
  const room = (ST.backroom?.rooms || []).find(r => r.id === "storeroom");
  if (room) svc.push({ name: "Stockroom", line: "", x: ctx.wx((room.rect[0] + room.rect[2]) / 2), z: ctx.wz((room.rect[1] + room.rect[3]) / 2), y: 2.2, fx: -1 });

  const layer = document.createElement("div"); layer.className = "ccards"; layer.setAttribute("aria-label", "Categories on the floor"); stage.appendChild(layer);
  const head = document.createElement("div"); head.className = "chead"; head.setAttribute("aria-hidden", "true"); stage.appendChild(head);
  const all = [...cards.map(k => ({ ...k, kind: "cat" })), ...svc.map(k => ({ ...k, kind: "svc" }))];
  all.forEach(k => { const b = document.createElement("button"); b.type = "button"; b.className = "ccard" + (k.kind === "svc" ? " svc" : "") + (k.amber ? " amber" : ""); k.el = b; layer.appendChild(b);
    b.addEventListener("click", () => { if (k.fx >= 0) ctx.select(k.fx, true); }); });
  let cardsFor = "";
  function drawCards() {
    const m = ctx.mode ? ctx.mode() : "sales"; if (m === cardsFor) return; cardsFor = m;
    all.forEach(k => {
      if (k.kind === "svc") { k.el.innerHTML = `<b>${esc(k.name)}</b>${k.line ? `<span>${esc(k.line)}</span>` : ""}`; return; }
      const c = k.c, up = (c.wow_pct || 0) >= 0;
      const line = m === "margin" ? `GM ${c.gm_pct}%` : m === "waste" ? `${kmoney(c.waste)} waste · ${c.sales ? (c.waste / c.sales * 100).toFixed(1) : 0}%`
        : m === "budget" ? `${c.vs_budget >= 0 ? "+" : ""}${kmoney(c.vs_budget)} vs budget` : `${kmoney(c.sales)} <i class="${up ? "up" : "dn"}">${up ? "▲" : "▼"}${Math.abs(c.wow_pct || 0).toFixed(1)}%</i>`;
      const bad = m === "budget" ? c.vs_budget < 0 : m === "waste" ? c.sales && c.waste / c.sales * 100 > (ST.targets?.waste_pct_of_sales ?? 3) : m === "margin" ? c.gm_pct < (ST.targets?.gross_margin_pct ?? 38) : false;
      k.el.classList.toggle("bad", !!bad); k.el.classList.toggle("rc", recalled.has(c.category));
      k.el.innerHTML = (recalled.has(c.category) ? `<em>⚠ RECALL</em>` : "") + `<b>${esc(c.category)}</b><span>${line}</span>`;
      k.el.setAttribute("aria-label", `${c.category}: ${kmoney(c.sales)} this week, ${c.wow_pct >= 0 ? "up" : "down"} ${Math.abs(c.wow_pct || 0).toFixed(1)}% on last week${recalled.has(c.category) ? ", product recall open" : ""}`);
    });
  }
  const v = new THREE.Vector3();
  let on = true;
  function frame() {
    const show = on && ctx.view() === "over";
    layer.hidden = !show; head.hidden = !on;
    if (!show) return;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const placed = [];
    all.forEach(k => { v.set(k.x, k.y, k.z).project(camera);
      k.vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      k.sx = (v.x + 1) / 2 * W; k.sy = (1 - v.y) / 2 * H; k.w = k.el.offsetWidth || 90; k.h = k.el.offsetHeight || 34; });
    // nearest cards first; a card that would cover one already placed moves up just enough to clear it
    all.filter(k => k.vis).sort((a, b) => b.sy - a.sy).forEach(k => {
      let y = k.sy;
      for (let n = 0; n < 8; n++) { const hit = placed.find(p => Math.abs(p.x - k.sx) < (p.w + k.w) / 2 + 2 && y > p.y - p.h - 2 && y - k.h < p.y + 2);
        if (!hit) break; y = hit.y - hit.h - 3; }
      placed.push({ x: k.sx, y, w: k.w, h: k.h });
      k.el.style.transform = `translate(${k.sx.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`; });
    all.forEach(k => { k.el.style.visibility = k.vis ? "visible" : "hidden"; });
  }

  /* ---------- look switch: Classic (default) or Detailed */
  let look = "classic"; try { look = localStorage.getItem("shelly.floor.look") || "classic"; } catch (e) { /* private mode */ }
  const top = $(".fx-top");
  const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Look");
  seg.innerHTML = `<button type="button" data-look="classic">✦ Classic</button><button type="button" data-look="detailed">▤ Detailed</button>`;
  top.insertBefore(seg, top.children[1] || null);
  function setLook(l) {
    look = l; on = l === "classic"; try { localStorage.setItem("shelly.floor.look", l); } catch (e) { /* */ }
    seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.look === l)));
    stage.classList.toggle("classic", on); FX.forEach(f => { if (f.sprite) f.sprite.visible = !on; });
    if (ctx.setLook) ctx.setLook(l);
    frame();
  }
  seg.addEventListener("click", e => { const b = e.target.closest("[data-look]"); if (b) setLook(b.dataset.look); });
  setLook(look);
  // classic opens on Sales heat unless a link asked for a view
  if (on && !/[#&]m=/.test(location.hash)) { const b = document.querySelector('#modes [data-m="sales"]'); if (b && ctx.mode && ctx.mode() === "status") b.click(); }

  /* ---------- hourly timeline */
  const H0 = 6, H1 = 22, span = (H1 - H0) * 60;
  const FOOT = OPS.footfall || {}, FS = Object.values(FOOT).reduce((a, b) => a + b, 0) || 1, CPD = OPS.customers_per_day || 150;
  const OPEN = hm(OPS.trading_hours?.open || "07:00"), CLOSE = hm(OPS.trading_hours?.close || "21:00");
  tl.hidden = false;
  tl.innerHTML = `<div class="tl-top"><button type="button" class="tl-b now" id="tlNow">● Now</button><button type="button" class="tl-b" id="tlPlay">▶ Play the day</button>` +
    `<b class="tl-clk" id="tlClk">--:--</b><span class="tl-st" id="tlSt"></span><span class="tl-src" id="tlSrc"></span></div>` +
    `<div class="tl-bars" id="tlBars" role="slider" tabindex="0" aria-label="Time of day: tap or drag to jump the store there" aria-valuemin="${H0 * 60}" aria-valuemax="${H1 * 60}"></div>` +
    `<div class="tl-ax">${Array.from({ length: (H1 - H0) / 2 + 1 }, (_, i) => `<span>${String(H0 + i * 2).padStart(2, "0")}</span>`).join("")}</div>`;
  const bars = $("#tlBars");
  let drawnFor = "";
  function drawBars() {
    const L = window.SHELLY_LIVE, key = S.day + "|" + (L ? L.asof : "");
    if (key === drawnFor) return; drawnFor = key;
    const rows = [];
    for (let h = H0; h < H1; h++) {
      const live = L && L.by_hour && L.by_hour.find(x => x.h === h);
      const cust = live && live.baskets != null ? live.baskets : (FOOT[h] ? CPD * FOOT[h] / FS : 0);
      const staff = (S.staff || []).filter(m => FLOOR_ROLES.has(m.role) && m.start <= h * 60 + 30 && m.end > h * 60 + 30).length;
      rows.push({ h, cust, staff, trading: h * 60 >= OPEN && h * 60 < CLOSE });
    }
    const mx = Math.max(1, ...rows.map(r => r.cust));
    bars.innerHTML = rows.map(r => `<div class="tl-h" title="${String(r.h).padStart(2, "0")}:00 · about ${Math.round(r.cust)} customers · ${r.staff} on the floor">` +
      `<i style="height:${(r.cust / mx * 100).toFixed(1)}%"></i><u class="${!r.trading ? "off" : r.staff < 2 ? "thin" : "ok"}"></u></div>`).join("") + `<s id="tlMark"></s>`;
    $("#tlSrc").innerHTML = L ? `<b class="lvpos">● LIVE POS ${esc(L.asof || "")}</b>` : `typical day profile · <a href="https://github.com/Pavi44M/Agent-Shelly-0.3#whats-new-in-v15-store-floor-points-to-improve-and-live-trade">connect hourly POS</a>`;
  }
  const tAt = e => { const r = bars.getBoundingClientRect(); return Math.round(H0 * 60 + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * span); };
  let drag = null;
  const mark = t => { const m = $("#tlMark"); if (m) m.style.left = (Math.max(0, Math.min(1, (t - H0 * 60) / span)) * 100).toFixed(2) + "%"; };
  bars.addEventListener("pointerdown", e => { bars.setPointerCapture(e.pointerId); drag = tAt(e); mark(drag); $("#tlClk").textContent = fmt(drag); });
  bars.addEventListener("pointermove", e => { if (drag == null) return; drag = tAt(e); mark(drag); $("#tlClk").textContent = fmt(drag); });
  const end = () => { if (drag == null) return; const t = drag; drag = null; S.setTime(S.day, t); update(); };
  bars.addEventListener("pointerup", end); bars.addEventListener("pointercancel", () => { drag = null; });
  bars.addEventListener("keydown", e => { const d = e.key === "ArrowRight" ? 30 : e.key === "ArrowLeft" ? -30 : 0; if (!d) return; e.preventDefault(); S.setTime(S.day, Math.max(H0 * 60, Math.min(H1 * 60 - 1, S.t + d))); update(); });
  const speedBtn = v => document.querySelectorAll("#ops [data-sp]").forEach(x => x.setAttribute("aria-pressed", String(+x.dataset.sp === v)));
  $("#tlNow").addEventListener("click", () => { const b = $("#nowBtn"); if (b) b.click(); else { const n = S.nzNow(); S.setTime(n.day, n.t); S.setSpeed(1); } update(); });
  $("#tlPlay").addEventListener("click", () => { S.setTime(S.day, hm("05:50")); S.setSpeed(180); speedBtn(180); if (!S.playing) S.toggle(); update(); });

  function update() {
    drawBars(); drawCards();
    if (drag == null) { mark(S.t); $("#tlClk").textContent = fmt(S.t); }
    const cust = S.agents.filter(a => a.kind === "customer").length, team = S.agents.filter(a => a.kind === "staff").length;
    const open = S.t >= OPEN && S.t < CLOSE;
    $("#tlSt").innerHTML = open ? `${cust} in store · ${team} staff · queue ${S.queue.length}` : `<b class="closed">Closed</b>${team ? ` · ${team} staff` : ""}`;
    bars.setAttribute("aria-valuenow", String(Math.round(S.t))); bars.setAttribute("aria-valuetext", fmt(S.t));
    if (on) { const m = ctx.mode ? ctx.mode() : "sales", [t, sub] = HEAD[m] || HEAD.sales;
      head.innerHTML = `<div><b>${esc(t)}</b><span>${esc(sub)}</span></div><strong>${fmt(S.t)}</strong><i class="bar ${esc(m)}"></i>`; }
  }
  window.addEventListener("shelly:day", () => { drawnFor = ""; });
  update();
  return { update, frame };
}
