

const $ = s => document.querySelector(s);
const nz = v => v==null?"–":"$"+Math.round(v).toLocaleString("en-NZ");
const nzk = v => v>=1e6?"$"+(v/1e6).toFixed(2)+"M":v>=1e3?"$"+(v/1e3).toFixed(0)+"k":"$"+Math.round(v);
const pct = (v,d=0) => v==null?"–":(v*100).toFixed(d)+"%";
const sgn = v => v==null?"–":(v>=0?"+":"")+(v*100).toFixed(0)+"%";
const n0 = v => v==null?"–":Math.round(v).toLocaleString("en-NZ");
const dt = s => s?new Date(s+"T00:00").toLocaleDateString("en-NZ",{day:"2-digit",month:"short"}):"–";
const K = DATA.kpi;

$("#asof").textContent = new Date(DATA.generated+"T00:00").toLocaleDateString("en-NZ",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
$("#p1").textContent = `${K.suppliers} suppliers · ${DATA.inventory.length} SKUs · ${K.customers} customers`;
$("#p2").textContent = `SARIMA-X · WAPE ${pct(K.fc_wape)} vs naive ${pct(K.fc_wape_naive)}`;
$("#p3").textContent = `${DATA.escalate.length} judgements need a person`;
$("#p4").textContent = `approve · dismiss · note`;

// KPIs
const kp = [
 ["Revenue · 30d", nzk(K.revenue_30d), `${sgn(K.revenue_30d_delta)} vs prior 30d`, K.revenue_30d_delta<0?"warn":""],
 ["SKUs needing action", `${K.at_risk_skus}/${K.skus}`, `${K.stockouts} stocked out`, K.stockouts?"bad":"warn"],
 ["Sales at risk", nzk(K.revenue_at_risk), "gap before next arrival", "bad"],
 ["Supplier OTIF · 90d", pct(K.otif_90), `12-month ${pct(K.otif_12m)}`, K.otif_90<.85?"warn":"good"],
 ["Inbound pipeline", nzk(K.inbound_value), `${K.inbound_pos} open POs · ${K.holds} on hold`, ""],
 ["Expiry exposure", nzk(K.expiry_at_risk_value), `unsold by expiry · ${nzk(K.expiry_value_180)} ≤180d`, "warn"],
 ["Stock on hand", nzk(K.stock_value), `median cover ${K.median_cover} days`, ""],
 ["Sales vs plan · 12 wks", pct(DATA.vision.total.ach,1), `${nzk(DATA.vision.total.actual)} vs ${nzk(DATA.vision.total.plan)} plan`, DATA.vision.total.ach>=1?"good":"warn"],
];
$("#kpis").innerHTML = kp.map(([l,v,s,c])=>`<div class="kpi ${c}"><span class="eyebrow">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join("");

// Brief + escalations (decisions kept per viewer)
$("#brief").innerHTML = DATA.brief.map(b=>`<li>${b}</li>`).join("");
let decisions={}; try{decisions=JSON.parse(localStorage.getItem("shelly-sc-dec")||"{}")}catch(e){}
function renderEsc(){
  $("#esccount").textContent = `${DATA.escalate.filter((_,i)=>!decisions[i]).length} open`;
  $("#esc").innerHTML = DATA.escalate.map((e,i)=>`<div class="it" data-k="${e.kind}"><span class="pill ${e.kind==="Stock-out risk"?"p-bad":e.kind==="Expiry"?"p-warn":"p-info"}">${e.kind}</span><b>${e.title}</b><p>${e.text}</p>
   <div class="row">${decisions[i]?`<span class="done">${decisions[i]==="y"?"✓ Approved":"Dismissed"}</span><button class="btn" data-u="${i}">Undo</button>`:`<button class="btn yes" data-y="${i}">Approve action</button><button class="btn" data-n="${i}">Dismiss</button>`}</div></div>`).join("");
}
$("#esc").addEventListener("click",ev=>{const b=ev.target.closest("button");if(!b)return;
  const d=b.dataset; if(d.y)decisions[d.y]="y"; if(d.n)decisions[d.n]="n"; if(d.u)delete decisions[d.u];
  try{localStorage.setItem("shelly-sc-dec",JSON.stringify(decisions))}catch(e){} renderEsc();});
renderEsc();

// Tooltip
const tip=$("#tip");
function showTip(ev,html){tip.innerHTML=html;tip.hidden=false;const x=Math.min(ev.clientX+14,innerWidth-270);tip.style.left=x+"px";tip.style.top=(ev.clientY+14)+"px"}
function hideTip(){tip.hidden=true}

// ================= Vision board: supplier → product → client =================
(function(){
  const V = DATA.vision;
  const stage = $("#stage"), svgEl = $("#vis"), svg = d3.select(svgEl), lwEl = $("#lw");
  const byId = new Map(V.nodes.map(n => [n.id, n]));
  const kColor = {supplier: "--accent", product: "--info", client: "--plum"};
  const vColor = {Threat: "--bad", Watch: "--warn", Reliable: "--ok"};
  const typeName = {supplier: "Supplier", product: "Product", client: "Client"};
  const segOrder = ["Public hospital","Private hospital","Medical centre / GP","Aged care / institution","Sports organisation","High-injury industry"];
  const ratioCol = r => r == null ? "--muted" : r >= 1 ? "--ok" : r >= .9 ? "--warn" : "--bad";
  const delivCol = d => d.delay <= 2 && d.fill >= 1 ? "--ok" : d.delay <= 7 && d.fill >= .95 ? "--warn" : "--bad";
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  const links = V.links.map(l => ({...l, s: byId.get(l.source), t: byId.get(l.target)}));
  const adj = new Map(V.nodes.map(n => [n.id, []]));
  links.forEach(l => { adj.get(l.source).push(l); adj.get(l.target).push(l); });

  let WW, WH, kFit = 1, T = d3.zoomIdentity, sel = null, filter = "all", world, narrowMode;
  const narrow = () => stage.clientWidth < 700;

  // ---------- layout: three ordered columns, fixed so the map is learnable
  function layout(){
    narrowMode = narrow(); WW = narrowMode ? 900 : 1400; WH = narrowMode ? 1300 : 900;
    const X = narrowMode ? {supplier: .12, product: [.42, .58], client: .88} : {supplier: .15, product: [.44, .56], client: .85};
    const sup = V.nodes.filter(n => n.type === "supplier").sort((a, b) => b.value - a.value);
    const so = new Map(sup.map((s, i) => [s.id, i]));
    const pr = V.nodes.filter(n => n.type === "product").sort((a, b) => so.get(a.supplier) - so.get(b.supplier) || b.value - a.value);
    const cl = V.nodes.filter(n => n.type === "client").sort((a, b) => segOrder.indexOf(a.segment) - segOrder.indexOf(b.segment) || b.value - a.value);
    const top = 80, bot = WH - 40;
    const place = (arr, xf) => arr.forEach((n, i) => { n.x = WW * (Array.isArray(xf) ? xf[i % 2] : xf); n.y = top + (bot - top) * (i + .5) / arr.length; });
    place(sup, X.supplier); place(pr, X.product); place(cl, X.client);
    const rng = {supplier: [10, 22], product: [8, 16], client: [10, 20]};
    ["supplier", "product", "client"].forEach(t => {
      const arr = V.nodes.filter(n => n.type === t);
      const sc = d3.scaleSqrt().domain([0, d3.max(arr, n => n.value)]).range(rng[t]);
      arr.forEach(n => n.r = sc(n.value));
    });
    return X;
  }

  // ---------- ring colours per node (12 weeks or last 12 deliveries)
  function ring(n){
    if (n.type === "supplier") return n.deliveries.map(d => ({c: delivCol(d), r: d.plan ? d.actual / d.plan : null}));
    return n.actual.map((a, i) => { const r = n.plan[i] ? a / n.plan[i] : null; return {c: ratioCol(r), r}; });
  }

  // ---------- draw
  function build(){
    const X = layout();
    svg.selectAll("*").remove();
    world = svg.append("g");
    world.append("rect").attr("class", "bg").attr("x", -5000).attr("y", -5000).attr("width", 10000).attr("height", 10000).attr("fill", "transparent");
    const heads = [["SUPPLIERS", X.supplier, "supplier"], ["PRODUCTS", (X.product[0] + X.product[1]) / 2, "product"], ["CLIENTS", X.client, "client"]];
    if (narrowMode) heads.forEach(h => h[0] = h[0].slice(0, 1) + h[0].slice(1).toLowerCase());
    world.selectAll("text.col-h").data(heads).join("text").attr("class", "col-h").attr("x", (d, i) => narrowMode ? [14, WW / 2, WW - 14][i] : WW * d[1]).attr("y", 42).attr("text-anchor", (d, i) => narrowMode ? ["start", "middle", "end"][i] : "middle")
      .text(d => narrowMode ? d[0] : `${d[0]} · ${V.nodes.filter(n => n.type === d[2]).length}`);

    const wS = d3.scaleSqrt().domain([0, d3.max(links.filter(l => l.kind === "supply"), l => l.value)]).range([.8, 7]);
    const wC = d3.scaleSqrt().domain([0, d3.max(links.filter(l => l.kind === "sale"), l => l.value)]).range([.6, 6]);
    const path = l => { const mx = (l.s.x + l.t.x) / 2; return `M${l.s.x},${l.s.y}C${mx},${l.s.y} ${mx},${l.t.y} ${l.t.x},${l.t.y}`; };
    const lg = world.append("g");
    lg.selectAll("path.lk").data(links).join("path").attr("class", l => "lk " + l.kind).attr("d", path)
      .attr("stroke-width", l => l.kind === "supply" ? wS(l.value) : wC(l.value));
    lg.selectAll("path.lk-hit").data(links).join("path").attr("class", "lk-hit").attr("d", path)
      .attr("stroke-width", 14).attr("vector-effect", "non-scaling-stroke")
      .on("pointerenter", (e, l) => { if (!sel) hot(l); showTip(e, linkTip(l)); })
      .on("pointermove", (e, l) => showTip(e, linkTip(l)))
      .on("pointerleave", () => { hideTip(); if (!sel) paint(); })
      .on("click", (e, l) => { e.stopPropagation(); hideTip(); openLink(l); });

    const arc = d3.arc();
    const g = world.append("g").selectAll("g.nd").data(V.nodes).join("g").attr("class", "nd").attr("transform", n => `translate(${n.x},${n.y})`)
      .attr("tabindex", 0).attr("role", "button").attr("aria-label", n => `${typeName[n.type]} ${n.label}`)
      .on("click", (e, n) => { e.stopPropagation(); hideTip(); openNode(n); })
      .on("keydown", (e, n) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNode(n); } })
      .on("pointerenter", (e, n) => { if (!sel) focusSet(n); showTip(e, nodeTip(n)); })
      .on("pointermove", (e, n) => showTip(e, nodeTip(n)))
      .on("pointerleave", () => { hideTip(); if (!sel) paint(); });

    // dot ring: 12 dots, lit one after another like a loader
    g.append("g").attr("class", "dots").each(function(n){
      const R = ring(n), rr = n.r + 7;
      d3.select(this).selectAll("circle").data(R).join("circle").attr("class", "dot")
        .attr("cx", (d, i) => rr * Math.sin(i / 12 * 2 * Math.PI)).attr("cy", (d, i) => -rr * Math.cos(i / 12 * 2 * Math.PI))
        .attr("r", 2.6).attr("fill", d => `var(${d.c})`).style("animation-delay", (d, i) => `${i * .2}s`);
    });
    // mini radial bars (appear when zoomed in)
    g.append("g").attr("class", "mini").each(function(n){
      const R = ring(n), inner = n.r + 3, step = 2 * Math.PI / 12, L = Math.min(9, n.r * .6);
      const G = d3.select(this);
      G.append("circle").attr("r", inner + L).attr("fill", "none").attr("stroke", "var(--line)").attr("stroke-dasharray", "2 2");
      G.selectAll("path").data(R).join("path").attr("fill", d => `var(${d.c})`).attr("fill-opacity", .85)
        .attr("d", (d, i) => arc({innerRadius: inner, outerRadius: inner + L * Math.min(d.r ?? 0, 1.3), startAngle: i * step + .03, endAngle: (i + 1) * step - .03}));
    });
    g.append("circle").attr("r", n => n.r).attr("fill", "var(--panel)");
    g.append("circle").attr("class", "core").attr("r", n => n.r)
      .attr("fill", n => `var(${kColor[n.type]})`).attr("fill-opacity", .16)
      .attr("stroke", n => `var(${n.type === "supplier" ? vColor[n.verdict] : kColor[n.type]})`).attr("stroke-width", 1.6);
    g.append("text").attr("class", "pct").attr("text-anchor", "middle").attr("dy", "0.35em").attr("fill", "var(--fg)")
      .style("font-family", "var(--mono)").style("font-weight", 600).style("pointer-events", "none");
    g.append("text").attr("class", "lbl").attr("dy", "0.35em")
      .attr("text-anchor", n => n.type === "supplier" ? "end" : "start")
      .attr("x", n => n.type === "supplier" ? -(n.r + 14) : n.r + 14);

    const zoom = d3.zoom().scaleExtent([.12, 12]).clickDistance(5)
      .on("zoom", e => { T = e.transform; world.attr("transform", T); onZoom(); })
      .on("end", e => { if (e.sourceEvent) autoLand(); });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", e => { if (e.target === svgEl || e.target.classList.contains("bg")) closeAll(); });
    stage._zoom = zoom;
    const w = stage.clientWidth, h = stage.clientHeight;
    kFit = Math.min(w / WW, (h - 44) / WH) * .97;
    svg.call(zoom.transform, fitT());
    paint();
  }

  function fitT(){ const w = stage.clientWidth, h = stage.clientHeight; return d3.zoomIdentity.translate((w - WW * kFit) / 2, (h - 44 - WH * kFit) / 2).scale(kFit); }

  // ---------- semantic zoom
  function onZoom(){
    const k = T.k, kr = k / kFit;
    svgEl.classList.toggle("deep", kr >= 2.2);
    $("#kbadge").textContent = `${kr.toFixed(1)}×`;
    world.selectAll("text.col-h").style("font-size", `${11 / k}px`);
    world.selectAll("g.nd").each(function(n){
      const G = d3.select(this), on = sel && sel.set && sel.set.has(n.id);
      const showLbl = (n.type === "product" ? kr >= 1.7 : !narrowMode || kr >= 1.4) || on;
      const len = kr >= 2.4 ? 40 : narrowMode ? 15 : 22;
      G.select("text.lbl").style("font-size", `${11 / k}px`).style("stroke-width", `${3 / k}px`)
        .attr("x", n.type === "supplier" ? -(n.r + 12 + (kr >= 2.2 ? 12 : 0)) : n.r + 12 + (kr >= 2.2 ? 12 : 0))
        .text(showLbl ? trunc(n.label, len) : "");
      const pct = n.ach == null ? "" : Math.round(n.ach * 100) + "%";
      G.select("text.pct").style("font-size", `${Math.min(n.r * .62, 11 / k * 1.1)}px`).text(kr >= 2.2 ? pct : "");
    });
    placeWidget();
  }
  function autoLand(){
    if (sel || T.k / kFit < 3.2) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    let best = null, bd = 1e9;
    V.nodes.forEach(n => { const [x, y] = T.apply([n.x, n.y]); const d = Math.hypot(x - w / 2, y - h / 2); if (d < bd) { bd = d; best = n; } });
    if (best && bd < 140) openNode(best, {fly: false});
  }

  // ---------- highlight / filter
  function trace(n){
    const s = new Set([n.id]), L = new Set();
    const hop = (id, dir) => adj.get(id).forEach(l => {
      if (dir === "down" && l.source === id) { L.add(l); s.add(l.target); if (byId.get(l.target).type === "product") hop(l.target, "down"); }
      if (dir === "up" && l.target === id) { L.add(l); s.add(l.source); if (byId.get(l.source).type === "product") hop(l.source, "up"); }
    });
    hop(n.id, "down"); hop(n.id, "up");
    return {set: s, links: L};
  }
  function filterSet(){
    if (filter === "all") return null;
    const s = new Set();
    V.nodes.forEach(n => {
      if (filter === "behind" && n.ach != null && n.ach < .97) s.add(n.id);
      if (filter === "stock" && n.type === "product" && ["Stock-out", "Gap before ETA", "Reorder now"].includes(n.status)) { s.add(n.id); s.add(n.supplier); adj.get(n.id).forEach(l => s.add(l.target)); }
      if (filter === "threat" && n.type === "supplier" && n.verdict === "Threat") { s.add(n.id); adj.get(n.id).forEach(l => s.add(l.target)); }
    });
    return s;
  }
  function paint(focus){
    const f = focus || (sel && sel.set ? sel : null), fs = f ? null : filterSet();
    world.selectAll("g.nd").classed("fade", n => f ? !f.set.has(n.id) : fs ? !fs.has(n.id) : false)
      .classed("sel", n => sel && sel.kind === "node" && sel.id === n.id);
    world.selectAll("path.lk").classed("hot", l => !!(f && f.links.has(l)))
      .classed("fade", l => f ? !f.links.has(l) : fs ? !(fs.has(l.source) && fs.has(l.target)) : false);
    onZoom();
  }
  const focusSet = n => paint(trace(n));
  const hot = l => paint({set: new Set([l.source, l.target]), links: new Set([l])});

  // ---------- tooltips
  function nodeTip(n){
    if (n.type === "supplier") return `<b>${n.label}</b><br>${n.country} · ${n.mode} freight<br>OTIF ${pct(n.otif)} · risk ${n.risk}/100 · ${n.verdict}<br><span class="muted">Tap to open</span>`;
    const extra = n.type === "product" ? `<br>On hand ${n0(n.on_hand)} · ${n.cover_days >= 999 ? "–" : Math.round(n.cover_days)} days cover · ${n.status}` : `<br>${n.segment} · ${n.region}`;
    return `<b>${n.label}</b><br>Sales vs plan (12 wks) <b>${pct(n.ach)}</b>${extra}<br><span class="muted">Tap to open</span>`;
  }
  function linkTip(l){
    return l.kind === "supply"
      ? `<b>${l.s.label} → ${l.t.label}</b><br>Spend 12m ${nz(l.value)} · ${l.pos} POs · OTIF ${pct(l.otif)}`
      : `<b>${l.s.label} → ${l.t.label}</b><br>Sales 12m ${nz(l.value)} · vs plan ${pct(l.ach)}`;
  }

  // ---------- fly + open
  function flyTo(x, y, k){
    const w = stage.clientWidth, h = stage.clientHeight, cy = narrow() ? h * .24 : h / 2, cx = narrow() ? w / 2 : w * .4;
    svg.transition().duration(750).call(stage._zoom.transform, d3.zoomIdentity.translate(cx - x * k, cy - y * k).scale(k));
  }
  function openNode(n, {fly = true} = {}){
    const tr = trace(n); sel = {kind: "node", id: n.id, n, ...tr};
    paint(); renderWidget();
    if (fly) flyTo(n.x, n.y, Math.max(T.k, kFit * (narrowMode ? 3 : 2.4)));
  }
  function openLink(l){
    sel = {kind: "link", l, set: new Set([l.source, l.target]), links: new Set([l])};
    paint(); renderWidget();
    flyTo((l.s.x + l.t.x) / 2, (l.s.y + l.t.y) / 2, Math.max(T.k, kFit * 1.8));
  }
  function closeAll(){ sel = null; lwEl.hidden = true; paint(); }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sel) closeAll(); });

  // ---------- landing widget
  function placeWidget(){
    if (!sel || lwEl.hidden || narrow()) return;
    const [x, y] = sel.kind === "node" ? T.apply([sel.n.x, sel.n.y]) : T.apply([(sel.l.s.x + sel.l.t.x) / 2, (sel.l.s.y + sel.l.t.y) / 2]);
    const w = stage.clientWidth, h = stage.clientHeight, ww = lwEl.offsetWidth, wh = lwEl.offsetHeight;
    const off = sel.kind === "node" ? sel.n.r * T.k + 34 : 24;
    let left = x + off; if (left + ww > w - 10) left = x - off - ww; left = Math.max(10, Math.min(w - ww - 10, left));
    const top = Math.max(10, Math.min(h - wh - 10, y - wh / 2));
    lwEl.style.left = left + "px"; lwEl.style.top = top + "px";
  }
  const stat = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  function renderWidget(){
    let head, sub, stats, con = [], series, mode = "plan", centre, centreSub;
    if (sel.kind === "node"){
      const n = sel.n;
      head = n.label;
      if (n.type === "client"){
        sub = `${n.segment} · ${n.region}`;
        const a = d3.sum(n.actual), p = d3.sum(n.plan);
        stats = stat("Revenue 12m", nzk(n.value)) + stat("Last 12 wks", nzk(a)) + stat("Plan 12 wks", nzk(p)) + stat("Gap", `<span class="${a >= p ? "p-ok" : "p-bad"}">${a >= p ? "+" : "−"}${nzk(Math.abs(a - p))}</span>`);
        con = n.top.map(t => byId.get(t.sku)).filter(Boolean);
      } else if (n.type === "product"){
        sub = `${n.category} · ${n.subcategory}${n.cold_chain ? " · cold chain" : ""}`;
        stats = stat("On hand", n0(n.on_hand)) + stat("Days cover", n.cover_days >= 999 ? "–" : Math.round(n.cover_days))
          + stat("Status", `<span class="${statusPill(n.status)}">${n.status}</span>`) + stat("Next arrival", n.next_eta ? `${dt(n.next_eta)} · ${n0(n.next_qty)}` : "none open");
        con = [byId.get(n.supplier), ...adj.get(n.id).filter(l => l.source === n.id).map(l => l.t)];
      } else {
        sub = `${n.country} · ${n.mode} freight · ${n.verdict}`;
        stats = stat("OTIF 12m", pct(n.otif)) + stat("Risk", `${n.risk}/100`) + stat("Avg lead", `${Math.round(n.avg_lead)} days`) + stat("Shelf life left", pct(n.life_left));
        con = adj.get(n.id).map(l => l.t); mode = "deliv";
      }
      if (mode === "plan"){ series = n.actual.map((a, i) => ({a, p: n.plan[i], lab: "Wk ending " + V.weeks[i]})); centre = n.ach; centreSub = "sales vs plan · 12 wks"; }
      else { series = n.deliveries.map(d => ({a: d.actual, p: d.plan, lab: `${d.po} · ${d.date}`, d})); centre = n.otif; centreSub = "OTIF · last 12 deliveries"; }
    } else {
      const l = sel.l; head = `${l.s.label} → ${l.t.label}`;
      if (l.kind === "sale"){
        sub = "Product → client · weekly sales vs plan";
        const a = d3.sum(l.actual), p = d3.sum(l.plan);
        stats = stat("Sales 12m", nzk(l.value)) + stat("Last 12 wks", nzk(a)) + stat("Plan 12 wks", nzk(p)) + stat("Vs plan", pct(l.ach));
        series = l.actual.map((a, i) => ({a, p: l.plan[i], lab: "Wk ending " + V.weeks[i]})); centre = l.ach; centreSub = "sales vs plan · 12 wks";
      } else {
        sub = "Supplier → product · purchase flow";
        stats = stat("Spend 12m", nzk(l.value)) + stat("POs 12m", l.pos) + stat("OTIF", pct(l.otif)) + stat("Avg lead", l.avg_lead ? l.avg_lead + " days" : "–");
        const sp = l.s.deliveries.filter(d => d.sku === l.target);
        series = sp.map(d => ({a: d.actual, p: d.plan, lab: `${d.po} · ${d.date}`, d})); mode = "deliv"; centre = l.otif; centreSub = "OTIF · this product";
      }
      con = [l.s, l.t];
    }
    const kind = sel.kind === "node" ? sel.n.type : l2kind(sel.l);
    lwEl.innerHTML = `<div class="lw-h"><div><span class="pill ${kind === "supplier" ? "p-warn" : kind === "product" ? "p-info" : kind === "client" ? "p-plum" : "p-mut"}">${sel.kind === "node" ? typeName[kind] : sel.l.kind === "sale" ? "Sales flow" : "Supply flow"}</span><br><b>${head}</b><div class="lw-sub">${sub}</div></div><button class="lw-x" aria-label="Close">×</button></div>
      <svg class="lw-rad" viewBox="-110 -110 220 220" role="img" aria-label="${centreSub}"></svg>
      <div class="lw-wk" aria-live="polite">${mode === "plan" ? "Each wedge is a week. Outline = plan, fill = actual." : "Each wedge is a delivery. Colour = on time and in full."}</div>
      <div class="lw-stats">${stats}</div>
      ${con.length ? `<div class="lw-sub">Connected · tap to jump</div><div class="lw-con">${con.map(c => `<button data-id="${c.id}" title="${c.label}">${trunc(c.label, 26)}</button>`).join("")}</div>` : ""}`;
    lwEl.hidden = false;
    lwEl.querySelector(".lw-x").onclick = closeAll;
    lwEl.querySelectorAll(".lw-con button").forEach(b => b.onclick = () => openNode(byId.get(b.dataset.id)));
    radial(d3.select(lwEl.querySelector(".lw-rad")), series, mode, centre, centreSub);
    placeWidget();
  }
  const l2kind = l => l.kind;

  // radial "loading" chart: wedges sweep in one week at a time, then a scan line circles
  function radial(G, S, mode, centre, centreSub){
    const inner = 46, len = 52, n = Math.max(S.length, 1), step = 2 * Math.PI / n;
    const mx = d3.max(S, d => Math.max(d.a, d.p)) || 1;
    const arc = d3.arc();
    G.append("circle").attr("r", inner - 4).attr("fill", "var(--panel)").attr("stroke", "var(--line)");
    [.5, 1].forEach(f => G.append("circle").attr("r", inner + len * f).attr("fill", "none").attr("stroke", "var(--line)").attr("stroke-dasharray", "2 3"));
    const sweep = G.append("path").attr("class", "sweep").attr("fill", "var(--accent)").attr("fill-opacity", .10)
      .attr("d", arc({innerRadius: inner, outerRadius: inner + len + 4, startAngle: -.35, endAngle: 0}));
    const col = d => mode === "plan" ? ratioCol(d.p ? d.a / d.p : null) : delivCol(d.d);
    const w = G.selectAll("g.w").data(S).join("g").attr("class", "w").style("cursor", "pointer");
    w.append("path").attr("fill", "none").attr("stroke", "var(--muted)").attr("stroke-width", 1).attr("stroke-dasharray", "2 2")
      .attr("d", (d, i) => arc({innerRadius: inner, outerRadius: inner + len * d.p / mx, startAngle: i * step + .03, endAngle: (i + 1) * step - .03}));
    w.append("path").attr("class", "act").attr("fill", d => `var(${col(d)})`).attr("fill-opacity", .85)
      .attr("d", (d, i) => arc({innerRadius: inner, outerRadius: inner, startAngle: i * step + .03, endAngle: (i + 1) * step - .03}))
      .transition().delay((d, i) => 120 + i * 90).duration(420).ease(d3.easeCubicOut)
      .attrTween("d", (d, i) => { const it = d3.interpolate(inner, inner + len * d.a / mx); return t => arc({innerRadius: inner, outerRadius: it(t), startAngle: i * step + .03, endAngle: (i + 1) * step - .03}); });
    // hit wedges for hover/tap
    w.append("path").attr("fill", "transparent")
      .attr("d", (d, i) => arc({innerRadius: inner, outerRadius: inner + len + 6, startAngle: i * step, endAngle: (i + 1) * step}))
      .on("pointerenter click", (e, d) => {
        const r = d.p ? d.a / d.p : null;
        lwEl.querySelector(".lw-wk").innerHTML = mode === "plan"
          ? `${d.lab}: <b>${nzk(d.a)}</b> vs plan ${nzk(d.p)} <span class="${r >= 1 ? "p-ok" : r >= .9 ? "p-warn" : "p-bad"}">(${pct(r)})</span>`
          : `${d.lab}: ${d.d.delay > 2 ? `<span class="p-bad">${d.d.delay} days late</span>` : "on time"} · ${pct(d.d.fill)} filled · ${nzk(d.a)}`;
        G.selectAll("path.act").attr("fill-opacity", x => x === d ? 1 : .45);
      });
    const txt = G.append("text").attr("class", "ctr").attr("text-anchor", "middle").attr("dy", "0.1em").style("font-size", "22px").text("0%");
    G.append("text").attr("text-anchor", "middle").attr("dy", "1.9em").style("font-size", "7.5px").text(centreSub.split(" · ")[0]);
    G.append("text").attr("text-anchor", "middle").attr("dy", "3.1em").style("font-size", "7.5px").text(centreSub.split(" · ")[1] || "");
    if (centre != null) txt.transition().delay(120).duration(120 + n * 90).tween("t", () => { const it = d3.interpolate(0, centre * 100); return t => txt.text(Math.round(it(t)) + "%"); });
    else txt.text("–");
    txt.attr("fill", `var(${mode === "plan" ? ratioCol(centre) : centre >= .88 ? "--ok" : centre >= .75 ? "--warn" : "--bad"})`);
    sweep.style("opacity", 0).transition().delay(200 + n * 90).duration(300).style("opacity", 1);
  }

  // ---------- controls
  $("#vfilters").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.f; document.querySelectorAll("#vfilters .chip").forEach(c => c.setAttribute("aria-pressed", c === b));
    if (sel) closeAll(); else paint();
  });
  $("#vlist").innerHTML = V.nodes.map(n => `<option value="${n.label}">${typeName[n.type]}</option>`).join("");
  $("#vsearch").addEventListener("change", e => { const n = V.nodes.find(x => x.label.toLowerCase() === e.target.value.toLowerCase()); if (n) openNode(n); });
  $("#zin").onclick = () => svg.transition().duration(300).call(stage._zoom.scaleBy, 1.6);
  $("#zout").onclick = () => svg.transition().duration(300).call(stage._zoom.scaleBy, 1 / 1.6);
  $("#zfit").onclick = () => { closeAll(); svg.transition().duration(500).call(stage._zoom.transform, fitT()); };
  $("#vtotal").innerHTML = `Network sales vs plan · 12 wks <b class="${V.total.ach >= 1 ? "p-ok" : "p-warn"}">${pct(V.total.ach, 1)}</b>`;

  build();
  let lastW = stage.clientWidth;
  addEventListener("resize", () => { if (Math.abs(stage.clientWidth - lastW) > 40) { lastW = stage.clientWidth; const keep = sel; closeAll(); build(); if (keep && keep.kind === "node") openNode(keep.n); } });
  window.__vision = {openNode: id => openNode(byId.get(id)), zoomTo: k => svg.call(stage._zoom.scaleTo, kFit * k)};
})();


// Tabs
const statusPill = s => ({"Stock-out":"p-bad","Gap before ETA":"p-bad","Reorder now":"p-warn","Overstock":"p-plum","Healthy":"p-ok"}[s]||"p-mut");
const shipPill = s => ({"Customs / Medsafe hold":"p-bad","Arrived port":"p-ok","In transit":"p-info","Booked":"p-mut","Planned":"p-mut"}[s]||"p-mut");
function table(cols,rows,id){
  return `<div class="tw"><table id="${id}"><thead><tr>${cols.map((c,i)=>`<th class="${c.r?"r":""}" data-i="${i}">${c.h}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.r?"r":""}">${c.f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function sortable(id,cols,rows,render){
  const t=document.getElementById(id); if(!t)return; let dir=1;
  t.querySelectorAll("th").forEach(th=>th.onclick=()=>{const c=cols[+th.dataset.i]; if(!c.k)return; dir=-dir;
    rows.sort((a,b)=>{const x=a[c.k],y=b[c.k];return (x>y?1:x<y?-1:0)*dir}); render();});
}
const bar=(v,max,c)=>`<div class="bar"><i style="width:${Math.max(2,Math.min(100,v/max*100))}%;background:var(${c})"></i></div>`;

const views={
 "Inventory & reorder":()=>{
   const rows=DATA.inventory.slice(); const order={"Stock-out":0,"Gap before ETA":1,"Reorder now":2,"Overstock":4,"Healthy":3};
   rows.sort((a,b)=>order[a.status]-order[b.status]||a.cover_days-b.cover_days);
   const cols=[
    {h:"Status",k:"status",f:r=>`<span class="pill ${statusPill(r.status)}">${r.status}</span>`},
    {h:"SKU",k:"sku",f:r=>`<span class="mono">${r.sku}</span>`},
    {h:"Product",k:"product_name",f:r=>r.product_name+(r.cold_chain?` <span class="pill p-info">cold chain</span>`:"")},
    {h:"On hand",k:"on_hand",r:1,f:r=>n0(r.on_hand)},
    {h:"Days cover",k:"cover_days",r:1,f:r=>r.cover_days>=999?"–":r.cover_days.toFixed(0)},
    {h:"",f:r=>bar(Math.min(r.cover_days,120),120,r.cover_days<14?"--bad":r.cover_days<30?"--warn":"--ok")},
    {h:"Reorder pt",k:"reorder_point",r:1,f:r=>n0(r.reorder_point)},
    {h:"Next arrival",k:"next_eta",f:r=>r.next_eta?`${dt(r.next_eta)} <span class="muted">· ${n0(r.next_qty)}</span>`:`<span class="muted">none open</span>`},
    {h:"Sales at risk",k:"revenue_at_risk",r:1,f:r=>r.revenue_at_risk>0?`<span class="p-bad">${nz(r.revenue_at_risk)}</span>`:"–"},
    {h:"12-wk trend",k:"fc_trend",r:1,f:r=>sgn(r.fc_trend)},
   ];
   const draw=()=>{$("#view").innerHTML=table(cols,rows,"t-inv")+`<p class="note">Reorder point = average daily demand × lead time + safety stock at 95% service level (demand and lead-time variability). "Gap before ETA" means current stock runs out before the next PO lands.</p>`;sortable("t-inv",cols,rows,draw)};draw();
 },
 "Expiry (FEFO)":()=>{
   const bands=DATA.expiry_bands, mx=Math.max(...Object.values(bands));
   const rows=DATA.expiry.slice();
   const cols=[
    {h:"Days left",k:"days_left",r:1,f:r=>`<span class="${r.days_left<=90?"p-bad":r.days_left<=180?"p-warn":""}">${r.days_left}</span>`},
    {h:"Expiry",k:"expiry_date",f:r=>dt(r.expiry_date)+" "+r.expiry_date.slice(0,4)},
    {h:"Lot",k:"batch_id",f:r=>`<span class="mono">${r.batch_id}</span>`},
    {h:"Product",k:"product_name",f:r=>r.product_name},
    {h:"Qty",k:"qty_on_hand",r:1,f:r=>n0(r.qty_on_hand)},
    {h:"Won't sell",k:"at_risk_qty",r:1,f:r=>r.at_risk_qty>0?`<span class="p-bad">${n0(r.at_risk_qty)}</span>`:"0"},
    {h:"Value at risk",k:"at_risk_value",r:1,f:r=>r.at_risk_value>0?nz(r.at_risk_value):"–"},
    {h:"Note",f:r=>r.note?`<span class="muted">${r.note}</span>`:""},
   ];
   const draw=()=>{$("#view").innerHTML=`<div class="split"><div>${Object.entries(bands).map(([k,v])=>`<div style="display:grid;grid-template-columns:80px 1fr 90px;gap:10px;align-items:center;margin:6px 0"><span class="mono">${k}</span>${bar(v,mx,k.startsWith("≤")||k.startsWith("31")?"--bad":k.startsWith("91")?"--warn":"--accent")}<span class="mono r num" style="text-align:right">${nzk(v)}</span></div>`).join("")}<p class="note">Stock value on hand by time to expiry. Medicines and consumables only; equipment has no expiry.</p></div><div><p class="note" style="margin-top:0">"Won't sell" projects first-expiry-first-out consumption at the last 28 days' run-rate. Anything left at expiry is a write-off unless redistributed, discounted or returned to the supplier.</p></div></div>`+table(cols,rows,"t-exp");sortable("t-exp",cols,rows,draw)};draw();
 },
 "Inbound shipments":()=>{
   const rows=DATA.inbound.slice();
   const cols=[
    {h:"Status",k:"status",f:r=>`<span class="pill ${shipPill(r.status)}">${r.status}</span>`},
    {h:"PO",k:"po_id",f:r=>`<span class="mono">${r.po_id}</span>`},
    {h:"Product",k:"product_name",f:r=>r.product_name},
    {h:"Supplier",k:"supplier_name",f:r=>`${r.supplier_name} <span class="muted">· ${r.country}</span>`},
    {h:"Mode",k:"mode",f:r=>r.mode},
    {h:"Port",k:"port",f:r=>r.port},
    {h:"Planned ETA",k:"planned_eta",f:r=>dt(r.planned_eta)},
    {h:"Forecast ETA",k:"forecast_arrival",f:r=>dt(r.forecast_arrival)},
    {h:"Slip",k:"delay_days",r:1,f:r=>r.delay_days>2?`<span class="p-bad">+${r.delay_days}d</span>`:r.delay_days>0?`+${r.delay_days}d`:`${r.delay_days}d`},
    {h:"Value",k:"value",r:1,f:r=>nz(r.value)},
   ];
   const draw=()=>{$("#view").innerHTML=table(cols,rows,"t-ib")+`<p class="note">Sea freight lands at Ports of Auckland or Tauranga; air at Auckland Airport. Medicines need Medsafe consent and devices a WAND notification before clearance.</p>`;sortable("t-ib",cols,rows,draw)};draw();
 },
 "Supplier scorecard":()=>{
   const rows=DATA.suppliers.slice();
   const cols=[
    {h:"Verdict",k:"verdict",f:r=>`<span class="pill ${r.verdict==="Threat"?"p-bad":r.verdict==="Watch"?"p-warn":"p-ok"}">${r.verdict}</span>`},
    {h:"Supplier",k:"supplier_name",f:r=>`${r.supplier_name} <span class="muted">· ${r.country}</span>`},
    {h:"Risk",k:"risk",r:1,f:r=>r.risk},
    {h:"OTIF",k:"otif",r:1,f:r=>pct(r.otif)},
    {h:"",f:r=>bar(r.otif,1,r.otif<.75?"--bad":r.otif<.88?"--warn":"--ok")},
    {h:"On time",k:"on_time",r:1,f:r=>pct(r.on_time)},
    {h:"In full",k:"in_full",r:1,f:r=>pct(r.in_full)},
    {h:"Lead (d)",k:"avg_lead",r:1,f:r=>`${r.avg_lead.toFixed(0)} ± ${(r.lead_sd||0).toFixed(0)}`},
    {h:"Worst slip",k:"max_delay",r:1,f:r=>`${r.max_delay}d`},
    {h:"Shelf life left",k:"life_left_pct",r:1,f:r=>pct(r.life_left_pct)},
    {h:"Spend 12m",k:"spend",r:1,f:r=>nz(r.spend)},
   ];
   const draw=()=>{$("#view").innerHTML=table(cols,rows,"t-sup")+`<p class="note">OTIF = arrived within 2 days of planned ETA and in full. Risk (0–100) weights OTIF gap 45, lead-time volatility 25, short-dated stock 20, plus single-source dependency.</p>`;sortable("t-sup",cols,rows,draw)};draw();
 },
 "Demand forecast":()=>{
   const inv=DATA.inventory.slice().sort((a,b)=>a.product_name.localeCompare(b.product_name));
   let cur=(DATA.inventory.find(r=>r.status!=="Healthy")||inv[0]).sku;
   $("#view").innerHTML=`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><label for="fsku" class="eyebrow">SKU</label><select id="fsku">${inv.map(r=>`<option value="${r.sku}">${r.sku} · ${r.product_name}</option>`).join("")}</select><span class="mono muted" id="fmeta"></span></div><svg id="fc" width="100%" height="260"></svg><p class="note">Weekly units. SARIMA(1,0,1) with Fourier terms for NZ seasonality (winter illness, winter sport). Band = 80% interval. Accuracy is an 8-week holdout WAPE.</p>`;
   const sel=$("#fsku"); sel.value=cur; sel.onchange=()=>drawF(sel.value); drawF(cur);
   function drawF(sku){
     const F=DATA.forecast, s=F.series[sku], row=DATA.inventory.find(r=>r.sku===sku);
     $("#fmeta").textContent=`WAPE ${pct(row.wape)} · next 12 wks ${sgn(row.fc_trend)} vs last 12`;
     const svg=d3.select("#fc"); svg.selectAll("*").remove();
     const W=svg.node().clientWidth||800,H=260,m={l:44,r:12,t:10,b:24}; svg.attr("viewBox",`0 0 ${W} ${H}`);
     const dates=[...F.hist_weeks,...F.fc_weeks].map(d=>new Date(d));
     const x=d3.scaleTime().domain(d3.extent(dates)).range([m.l,W-m.r]);
     const y=d3.scaleLinear().domain([0,d3.max([...s.hist,...s.hi])*1.08]).nice().range([H-m.b,m.t]);
     svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(W<500?4:8).tickSizeOuter(0));
     svg.append("g").attr("class","axis").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.l-m.r))).call(g=>g.selectAll(".tick line").attr("stroke-opacity",.4)).call(g=>g.select(".domain").remove());
     const hx=F.hist_weeks.map(d=>new Date(d)), fx=F.fc_weeks.map(d=>new Date(d));
     svg.append("path").datum(fx.map((d,i)=>[d,s.lo[i],s.hi[i]])).attr("fill","var(--accent)").attr("fill-opacity",.15).attr("d",d3.area().x(d=>x(d[0])).y0(d=>y(d[1])).y1(d=>y(d[2])));
     svg.append("path").datum(hx.map((d,i)=>[d,s.hist[i]])).attr("fill","none").attr("stroke","var(--muted)").attr("stroke-width",1.5).attr("d",d3.line().x(d=>x(d[0])).y(d=>y(d[1])));
     svg.append("path").datum([[hx.at(-1),s.hist.at(-1)],...fx.map((d,i)=>[d,s.mean[i]])]).attr("fill","none").attr("stroke","var(--accent)").attr("stroke-width",2).attr("d",d3.line().x(d=>x(d[0])).y(d=>y(d[1])));
     svg.append("line").attr("x1",x(hx.at(-1))).attr("x2",x(hx.at(-1))).attr("y1",m.t).attr("y2",H-m.b).attr("stroke","var(--line)").attr("stroke-dasharray","3 3");
     svg.append("text").attr("x",x(hx.at(-1))+6).attr("y",m.t+10).text("forecast →");
     svg.append("circle").attr("cx",x(fx.at(-1))).attr("cy",y(s.mean.at(-1))).attr("r",3.5).attr("fill","var(--accent)");
   }
 },
 "Customers & segments":()=>{
   const seg=DATA.segments, mx=d3.max(seg,d=>d.rev);
   const rows=DATA.customers.slice();
   const cols=[
    {h:"Customer",k:"customer_name",f:r=>r.customer_name},
    {h:"Segment",k:"segment",f:r=>`<span class="muted">${r.segment}</span>`},
    {h:"Region",k:"region",f:r=>r.region},
    {h:"Revenue 12m",k:"rev12",r:1,f:r=>nz(r.rev12)},
    {h:"YoY",k:"growth",r:1,f:r=>`<span class="${r.growth<0?"p-bad":"p-ok"}">${sgn(r.growth)}</span>`},
    {h:"Medicine",k:"Medicine",r:1,f:r=>pct(r.Medicine/r.rev12)},
    {h:"Consumable",k:"Consumable",r:1,f:r=>pct(r.Consumable/r.rev12)},
    {h:"Equipment",k:"Equipment",r:1,f:r=>pct(r.Equipment/r.rev12)},
   ];
   const segHtml=seg.map(s=>{const t=s.Medicine+s.Consumable+s.Equipment;return `<div style="display:grid;grid-template-columns:minmax(0,190px) 1fr 110px;gap:10px;align-items:center;margin:7px 0"><span>${s.segment} <span class="muted mono">· ${s.n}</span></span>
     <div style="display:flex;height:12px;width:${Math.max(4,s.rev/mx*100)}%;border-radius:3px;overflow:hidden"><i style="flex:${s.Medicine/t};background:var(--accent)"></i><i style="flex:${s.Consumable/t};background:var(--info)"></i><i style="flex:${s.Equipment/t};background:var(--plum)"></i></div>
     <span class="mono num" style="text-align:right">${nzk(s.rev)} <span class="${s.growth<0?"p-bad":"p-ok"}">${sgn(s.growth)}</span></span></div>`}).join("");
   const draw=()=>{$("#view").innerHTML=`<div class="legend" style="margin-bottom:4px"><span><i style="background:var(--accent)"></i>medicine</span><span><i style="background:var(--info)"></i>consumable</span><span><i style="background:var(--plum)"></i>equipment</span></div>${segHtml}<div style="height:10px"></div>`+table(cols,rows,"t-cus")+`<p class="note">Sports organisations and high-injury industries (construction, forestry, adventure tourism) lean on wound care, strapping, cold therapy and first-response equipment, so their demand peaks with the winter sport season.</p>`;sortable("t-cus",cols,rows,draw)};draw();
 },
};
const names=Object.keys(views); let active=names[0];
try{const h=location.hash.slice(1);const i=+h;if(h&&names[i])active=names[i]}catch(e){}
function renderTabs(){$("#tabs").innerHTML=names.map((n,i)=>`<button class="tab" role="tab" aria-selected="${n===active}" data-t="${i}">${n}</button>`).join("");}
$("#tabs").addEventListener("click",e=>{const b=e.target.closest(".tab");if(!b)return;active=names[+b.dataset.t];renderTabs();views[active]();});
renderTabs(); views[active]();

// Bottom strips
function stack(id,dates,series,colors){
  const svg=d3.select(id), W=svg.node().clientWidth||600, H=170, m={l:40,r:8,t:8,b:22}; svg.attr("viewBox",`0 0 ${W} ${H}`);
  const X=d3.scaleBand().domain(dates).range([m.l,W-m.r]).padding(.25);
  const tot=dates.map((_,i)=>series.reduce((a,s)=>a+s[i],0));
  const Y=d3.scaleLinear().domain([0,d3.max(tot)]).nice().range([H-m.b,m.t]);
  svg.append("g").attr("class","axis").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(Y).ticks(4).tickFormat(v=>nzk(v)).tickSize(-(W-m.l-m.r))).call(g=>g.selectAll(".tick line").attr("stroke-opacity",.35)).call(g=>g.select(".domain").remove());
  const every=Math.ceil(dates.length/(W<500?4:8));
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(X).tickValues(dates.filter((_,i)=>i%every===0)).tickFormat(d=>dt(d)).tickSizeOuter(0));
  dates.forEach((d,i)=>{let y0=0;series.forEach((s,j)=>{if(!s[i])return;svg.append("rect").attr("x",X(d)).attr("width",X.bandwidth()).attr("y",Y(y0+s[i])).attr("height",Y(y0)-Y(y0+s[i])).attr("fill",`var(${colors[j]})`).attr("fill-opacity",.85)
     .on("mousemove",e=>showTip(e,`${dt(d)}<br>${nz(tot[i])}`)).on("mouseleave",hideTip);y0+=s[i]})});
}
const R=DATA.daily_revenue; stack("#rev",R.dates,[R.Medicine,R.Consumable,R.Equipment],["--accent","--info","--plum"]);
const A=DATA.arrivals; stack("#arr",A.dates,[A.received,A.due],["--muted","--warn"]);
