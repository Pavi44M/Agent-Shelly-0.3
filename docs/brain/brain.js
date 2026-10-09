/* Shelly Brain page: map, core, departments & agents, agent detail, "ask the brain". Data: window.SHELLY_BRAIN */
(function () {
  "use strict";
  const B = window.SHELLY_BRAIN, AP = window.SHELLY_APPROVALS || { items: [] };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!B) { document.querySelector(".wrap").innerHTML = "<p>Brain data missing. Run python scripts/build_brain.py.</p>"; return; }
  const BIZ = Object.fromEntries(B.businesses.map(b => [b.id, b]));
  const DEP = Object.fromEntries(B.departments.map(d => [d.id, d]));
  const AG = Object.fromEntries(B.agents.map(a => [a.id, a]));
  const AUTO_L = { auto: "Runs on its own", suggest: "Suggests", approve: "Needs approval" };
  const pendingOf = id => (window.ShellyKit ? window.ShellyKit.open() : AP.items).filter(i => i.agent === id);

  /* ---------------- boot */
  (async function boot() {
    const box = $("#boot"), log = $("#bootLog"); if (!box) return;
    const V = brainBoot($(".boot-cv"), B.departments);   // the living brain (canvas): assembles, fires, ignites each department
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let skip = false, quick = false;
    try { quick = sessionStorage.getItem("brain.booted") === "1"; sessionStorage.setItem("brain.booted", "1"); } catch (e) { /* */ }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
    $("#skipBoot").onclick = () => { skip = true; };
    const s = B.stats;
    const lines = [`› core online · ${B.core.map(c => c.name.toLowerCase()).join(" · ")}`,
      `› ${s.businesses} businesses · ${s.departments} departments, each with a head · ${s.agents} agents · ${s.skills} skills`,
      `› approvals · own head → Finance funds check → Pavi`,
      `› autonomy · ${s.auto} run on their own · ${s.suggest} suggest · ${s.approve} need approval`,
      `› memory · ${s.pending} proposals in the approvals queue`,
      `› store data to ${B.store_asof} · Tōtara data to ${B.totara_asof}`];
    const pc = $(".boot-pc"), bar = $(".boot-bar i"), setP = v => { pc.textContent = Math.round(v * 100) + "%"; bar.style.width = (v * 100) + "%"; V.progress(v); };
    for (let k = 0; k < lines.length; k++) { if (skip) break; log.insertAdjacentText("beforeend", lines[k] + "\n"); setP((k + 1) / (lines.length + 1)); await sleep(quick ? 60 : 520); }
    setP(1); V.ignite();
    const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = "✓ Brain awake."; log.appendChild(ok);
    await sleep(skip || quick ? 120 : 900); box.classList.add("done"); setTimeout(() => { V.stop(); box.remove(); }, 700);
  })();

  /* ---------------- stats + flow + core */
  function stats() {
    const s = B.stats, waiting = window.ShellyKit ? window.ShellyKit.open().length : s.pending;
    $("#stats").innerHTML = [[s.agents, "agents"], [s.departments, "departments"], [s.businesses, "businesses"], [s.skills, "skills"],
      [s.auto, "run on their own"], [s.approve, "need approval"], [waiting, "waiting for you", "wait"]]
      .map(([v, l, c]) => `<div class="stat ${c || ""}"><b>${v}</b><span>${l}</span></div>`).join("");
  }
  $("#flow").innerHTML = [["Data in", "Exports, databases and sheets, matched column by column (Knowledge)"],
    ["Orchestrator", "Routes each question or event to the agent that owns it"],
    ["Agents work", "Skills compute: forecasts, risks, orders, rosters, budgets"],
    ["Governance", "Rules decide: publish, suggest, or wait for approval"],
    ["You decide", "Approve or reject in one tap, from any page"],
    ["Memory & learning", "Answers are logged; thresholds and models improve"]]
    .map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join("");
  $("#core").innerHTML = B.core.map(c => `<details><summary><span class="ic" aria-hidden="true">${esc(c.icon)}</span><b>${esc(c.name)}</b></summary>
    <p>${esc(c.what)}</p><ul>${c.how.map(h => `<li>${esc(h)}</li>`).join("")}</ul><code>${esc(c.code)}</code></details>`).join("");
  $("#gen").textContent = `Brain built ${B.generated} · Shelly v${B.version}`;

  /* ---------------- map */
  const map = $("#map"), tip = $("#mapTip");
  function drawMap() {
    const agents = B.agents, n = agents.length, gap = 0.05;
    const order = B.departments.map(d => d.id);           // one arc per company-wide department
    const sorted = order.flatMap(d => agents.filter(a => a.department === d));
    const step = (2 * Math.PI - gap * order.length) / n;
    let ang = -Math.PI / 2, pos = {}, depAng = {}, bizArc = {};
    order.forEach(d => {
      const list = sorted.filter(a => a.department === d);
      bizArc[d] = [ang, ang + step * list.length];
      list.forEach(a => { pos[a.id] = ang + step / 2; (depAng[a.department] = depAng[a.department] || []).push(ang + step / 2); ang += step; });
      ang += gap;
    });
    const P = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
    let s = `<circle class="ring" r="200"/><circle class="ring" r="300"/>`;
    order.forEach(d => {   // department arc
      const [a0, a1] = bizArc[d], r = 150, [x0, y0] = P(r, a0), [x1, y1] = P(r, a1), big = a1 - a0 > Math.PI ? 1 : 0, col = DEP[d].colour;
      s += `<path d="M${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1}" stroke="${col}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".75"/>`;
      const [lx, ly] = P(124, (a0 + a1) / 2);
      s += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" style="fill:${col};font-size:10px;font-weight:700">${esc(DEP[d].icon)}</text>`;
    });
    Object.entries(depAng).forEach(([d, angs]) => {    // departments
      const t = angs.reduce((x, y) => x + y) / angs.length, [x, y] = P(205, t), col = DEP[d].colour;
      s += `<line class="spoke" x1="0" y1="0" x2="${x}" y2="${y}" stroke="${col}"/>`;
      angs.forEach(at => { const [ax, ay] = P(290, at); s += `<line class="spoke" x1="${x}" y1="${y}" x2="${ax}" y2="${ay}" stroke="${col}"/>`; });
      s += `<g class="node" tabindex="0" data-dep="${esc(d)}" role="button" aria-label="${esc(DEP[d].name)}"><circle class="dot" cx="${x}" cy="${y}" r="9" fill="#0f1622" stroke="${col}" stroke-width="2"/></g>`;
    });
    s += `<g class="core-c"><circle r="62" fill="#0f1a29" stroke="#63b6d8" stroke-width="1.5"/>
      <circle r="70" fill="none" stroke="#63b6d8" stroke-opacity=".25" stroke-dasharray="3 6"/>
      <text y="-6" text-anchor="middle" style="fill:#eaf0f6;font-size:15px;font-weight:600">Shelly</text>
      <text y="13" text-anchor="middle" style="fill:#63b6d8;font-size:11px;letter-spacing:.2em">BRAIN</text></g>`;
    B.core.forEach((c, i) => { const [x, y] = P(90, -Math.PI / 2 + i * 2 * Math.PI / B.core.length);
      s += `<g class="node" tabindex="0" data-core="${esc(c.id)}" role="button" aria-label="${esc(c.name)}"><circle class="dot" cx="${x}" cy="${y}" r="11" fill="#141e2c" stroke="#2a3a50"/><text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" style="fill:#b0bac8;font-size:11px">${esc(c.icon)}</text></g>`; });
    agents.forEach(a => {   // agents
      const t = pos[a.id], [x, y] = P(300, t), col = { auto: "#3fb87f", suggest: "#ffc466", approve: "#e66767" }[a.autonomy];
      const [lx, ly] = P(318, t), deg = t * 180 / Math.PI, flip = Math.cos(t) < 0;
      const pend = pendingOf(a.id).length;
      s += `<g class="node" tabindex="0" data-agent="${esc(a.id)}" role="button" aria-label="${esc(a.name)}, ${esc(AUTO_L[a.autonomy])}${pend ? ", " + pend + " waiting" : ""}">
        ${pend ? `<circle class="wait-ring" cx="${x}" cy="${y}" r="15"/>` : ""}
        <circle class="dot" cx="${x}" cy="${y}" r="9" fill="${col}" stroke="${BIZ[a.business].colour}" stroke-width="3"/>
        <text x="${lx}" y="${ly}" dominant-baseline="middle" text-anchor="${flip ? "end" : "start"}" transform="rotate(${flip ? deg + 180 : deg} ${lx} ${ly})">${esc(a.name.replace(/ agent$/, ""))}</text></g>`;
    });
    map.innerHTML = s;
    $$(".node", map).forEach(g => {
      const show = e => { const r = map.getBoundingClientRect(), box = $(".map").getBoundingClientRect();
        let h = "";
        if (g.dataset.agent) { const a = AG[g.dataset.agent]; h = `<b>${esc(a.name)}</b><small>${esc(DEP[a.department].name)} · ${esc(a.team)} · ${esc(AUTO_L[a.autonomy])}</small>${esc(a.mission)}`; }
        else if (g.dataset.dep) { const d = DEP[g.dataset.dep]; h = `<b>${esc(d.name)}</b><small>Head: ${esc(d.head)} · signs up to $${d.limit.toLocaleString("en-NZ")}</small>${esc(d.purpose)}`; }
        else { const c = B.core.find(c => c.id === g.dataset.core); h = `<b>${esc(c.name)}</b><small>Brain core</small>${esc(c.what)}`; }
        tip.innerHTML = h; tip.hidden = false;
        const pt = (e.touches ? e.touches[0] : e);
        const cx = pt && pt.clientX != null ? pt.clientX : g.getBoundingClientRect().left;
        const cy = pt && pt.clientY != null ? pt.clientY : g.getBoundingClientRect().top;
        tip.style.left = Math.min(cx - box.left + 12, box.width - 270) + "px"; tip.style.top = (cy - box.top + 12) + "px"; void r; };
      g.addEventListener("mousemove", show); g.addEventListener("focus", show);
      g.addEventListener("mouseleave", () => { tip.hidden = true; }); g.addEventListener("blur", () => { tip.hidden = true; });
      const act = () => { tip.hidden = true;
        if (g.dataset.agent) openAgent(g.dataset.agent);
        else if (g.dataset.dep) { const el = document.getElementById("dep-" + g.dataset.dep); el && el.scrollIntoView({ behavior: "smooth", block: "center" }); }
        else { const i = B.core.findIndex(c => c.id === g.dataset.core); const d = $$("#core details")[i]; if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); } } };
      g.addEventListener("click", act); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
  }

  /* ---------------- departments & agents */
  let fA = "all", fQ = "";
  function matches(a) {
    if (fA === "waiting" && !pendingOf(a.id).length) return false;
    if (fA !== "all" && fA !== "waiting" && a.autonomy !== fA) return false;
    if (!fQ) return true;
    const hay = [a.name, a.mission, a.skills.join(" "), a.inputs.join(" "), a.outputs.join(" "), a.triggers.join(" "), DEP[a.department].name, a.team, BIZ[a.business].name].join(" ").toLowerCase();
    return fQ.split(/\s+/).every(w => hay.includes(w));
  }
  function card(a) {
    const pend = pendingOf(a.id).length;
    const head = a.head_of ? `<span class="pill head">★ head</span>` : "";
    return `<button class="agent" data-agent="${esc(a.id)}"><span class="top"><b>${esc(a.name)}</b>${head}${pend ? `<span class="wait-b">${pend}</span>` : ""}<span class="pill ${a.autonomy}">${esc(AUTO_L[a.autonomy])}</span></span>
      <span class="tm">${esc(a.team)}</span><span class="m">${esc(a.mission)}</span>${a.live.length ? `<span class="lv">${a.live.map(l => `<span>${esc(l.label)} <b>${esc(l.value)}</b></span>`).join("")}</span>` : ""}</button>`;
  }
  function renderOrgs() {
    $("#orgs").innerHTML = `<div class="deps">` + B.departments.map(d => {
      const list = B.agents.filter(a => a.department === d.id && matches(a))
        .sort((x, y) => (y.id === d.head_agent) - (x.id === d.head_agent));
      if (!list.length && (fQ || fA !== "all")) return "";
      return `<div class="dep" id="dep-${esc(d.id)}" style="border-top:3px solid ${esc(d.colour)}"><div class="dep-h"><b><span style="color:${esc(d.colour)}">${esc(d.icon)}</span> ${esc(d.name)}</b>
        <span>${esc(d.purpose)}</span><em>Head: ${esc(d.head)} · signs up to $${d.limit.toLocaleString("en-NZ")}${d.budget ? ` · budget $${d.budget.toLocaleString("en-NZ")}/month` : ""}</em></div>
        ${list.map(card).join("") || '<span class="empty">No agent matches.</span>'}</div>`;
    }).join("") + `</div>` || '<p class="empty">No agents match these filters.</p>';
    $$("#orgs .agent").forEach(el => el.onclick = () => openAgent(el.dataset.agent));
  }
  $$(".filters [data-a]").forEach(b => b.onclick = () => { fA = b.dataset.a; $$(".filters [data-a]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderOrgs(); });
  $("#fq").addEventListener("input", e => { fQ = e.target.value.trim().toLowerCase(); renderOrgs(); });

  /* ---------------- agent drawer (the in-depth version) */
  const drawer = $("#drawer");
  let lastFocus = null, current = null;
  function list(h, arr) { return arr && arr.length ? `<div class="d-sec"><h3>${h}</h3><ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""; }
  function openAgent(id) {
    const a = AG[id]; if (!a) return; current = id;
    const d = DEP[a.department], b = BIZ[a.business], pend = pendingOf(id);
    const others = B.agents.filter(x => x.hands_off_to.includes(id)).map(x => x.id);
    $("#dBody").innerHTML = `<div class="crumb"><span style="color:${esc(d.colour)}">${esc(d.icon)}</span> ${esc(d.name)} › ${esc(a.team)} · serves ${esc(b.name)}</div><h2 id="dTitle">${esc(a.name)}${a.head_of ? " ★" : ""}</h2>
      <span class="pill ${a.autonomy}">${esc(AUTO_L[a.autonomy])}</span><p class="mission">${esc(a.mission)}</p>
      <div class="d-grid"><div><span>Answers to</span><b>${esc(a.owner)}</b></div><div><span>Department head</span><b>${esc(d.head)}</b></div><div><span>Head signs up to</span><b>$${d.limit.toLocaleString("en-NZ")}</b></div>
        <div><span>Schedule</span><b>${esc(a.schedule)}</b></div><div><span>Waiting for you</span><b>${pend.length}</b></div>
        ${a.live.map(l => `<div><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join("")}</div>
      <div class="d-sec"><h3>What it may do on its own</h3><p style="margin:0;font-size:13.5px">${esc(B.autonomy[a.autonomy])}</p></div>
      <div class="d-sec"><h3>Skills</h3>${a.skill_info.map(s => `<div class="skill"><code>${esc(s.name)}</code>${s.confirm ? ' <span class="pill approve">confirm</span>' : ""}<p>${esc(s.summary)}</p></div>`).join("")}</div>
      ${list("Data it reads", a.inputs)}${list("What it produces", a.outputs)}
      ${a.triggers.length ? `<div class="d-sec"><h3>Wakes up when you ask</h3><div class="chips">${a.triggers.map(t => `<span class="chip">“${esc(t)}”</span>`).join("")}</div></div>` : ""}
      ${list("Guardrails", a.guardrails)}${list("Hands over to a person when", a.escalates_when)}
      ${a.decision_areas.length ? `<div class="d-sec"><h3>Decision areas it raises</h3><div class="chips">${a.decision_areas.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>` : ""}
      ${a.hands_off_to.length ? `<div class="d-sec"><h3>Passes work to</h3><div class="chips">${a.hands_off_to.map(x => AG[x] ? `<button class="chip" data-go="${esc(x)}">${esc(AG[x].name)} ›</button>` : "").join("")}</div></div>` : ""}
      ${others.length ? `<div class="d-sec"><h3>Gets work from</h3><div class="chips">${others.map(x => `<button class="chip" data-go="${esc(x)}">${esc(AG[x].name)} ›</button>`).join("")}</div></div>` : ""}
      <div class="d-sec"><h3>Waiting for your approval (${pend.length})</h3>${pend.length ? pend.slice(0, 12).map(i => { const K = window.ShellyKit, ch = K ? K.chainOf(i) : [], at = K ? K.stepOf(i) : 0;
        return `<div class="ap-item"><b style="color:var(--ink)">${esc(i.title)}</b><div>${esc(i.area)}${i.text ? " · " + esc(i.text) : ""}</div>
        <div class="chainline">${ch.map((c, k) => `<span class="${k < at ? "ok" : k === at ? "now" : ""}">${k < at ? "✓" : k === at ? "●" : "○"} ${esc(c.role.replace(/ \(.*\)/, ""))}</span>`).join(" › ")}</div>
        <div class="r"><button class="yes" data-y="${esc(i.key)}">✓ ${at < ch.length - 1 ? "Approve as " + esc(ch[at].role.replace(/ \(.*\)/, "")) : "Approve"}</button><button class="no" data-n="${esc(i.key)}">✕ Reject</button></div></div>`; }).join("") + (pend.length > 12 ? `<p class="empty">+${pend.length - 12} more in the approvals tray.</p>` : "")
        : '<p class="empty" style="margin:0">Nothing waiting.</p>'}</div>
      <a class="d-open" href="${esc(a.page)}">Open its work ›</a>`;
    $$("[data-go]", drawer).forEach(x => x.onclick = () => openAgent(x.dataset.go));
    $$("[data-y],[data-n]", drawer).forEach(x => x.onclick = () => {
      const it = (window.ShellyKit ? window.ShellyKit.items() : AP.items).find(i => i.key === (x.dataset.y || x.dataset.n));
      if (it && window.ShellyKit) window.ShellyKit.sign(it, x.dataset.y ? "y" : "n");
    });
    if (drawer.hidden) lastFocus = document.activeElement;
    drawer.hidden = false; $("#dClose").focus(); $(".d-in").scrollTop = 0;
  }
  function closeDrawer() { drawer.hidden = true; current = null; if (lastFocus) lastFocus.focus(); }
  $("#dClose").onclick = closeDrawer;
  drawer.addEventListener("click", e => { if (e.target === drawer) closeDrawer(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

  /* ---------------- ask the brain (client-side orchestrator, mirrors shelly/brain/orchestrator.py) */
  const STOP = new Set("the a an and or of to for in on is are what which how do i we my our this that be it me need will can should with at by any".split(" "));
  const words = t => new Set((t.toLowerCase().match(/[a-zāēīōū0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  $("#askForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("#askQ").value.trim().slice(0, 200); if (!q) return;
    const qw = words(q);
    const hint = /medic|t[oō]tara|hospital|medsafe|wand|pharma|clinic/i.test(q) ? "totara" : /store|shop|uber|roster|liquor|bakery|dairy/i.test(q) ? "store" : null;
    let best = null, score = 0;
    B.agents.forEach(a => {
      const trig = words(a.triggers.join(" ")), body = words(a.name + " " + a.mission + " " + a.outputs.join(" "));
      let sc = 0; qw.forEach(w => { if (trig.has(w)) sc += 2; if (body.has(w)) sc += 0.5; });
      if (hint && a.business === hint) sc += 0.75;
      if (sc > score) { best = a; score = sc; }
    });
    $("#askOut").innerHTML = best && score >= 1.5
      ? `<div class="res">→ <b>${esc(best.name)}</b> in ${esc(DEP[best.department].name)} · ${esc(best.team)} · ${esc(AUTO_L[best.autonomy])} · answers to ${esc(best.owner)}<button id="askOpen">See agent ›</button></div>`
      : `<div class="res">No department agent owns that. If it's outside Shelly's skills (travel, email, writing, advice), the orchestrator points you to a connected agent in Settings.</div>`;
    const b = $("#askOpen"); if (b) b.onclick = () => openAgent(best.id);
  });

  function refresh() { stats(); drawMap(); renderOrgs(); if (current && !drawer.hidden) openAgent(current); }
  addEventListener("shelly:approvals", refresh);
  refresh();
  /* ---------------- tabs: Shelly HQ (3D office) | Brain map */
  function tab(k) {
    const hq = k === "hq";
    $("#tabHq").setAttribute("aria-selected", String(hq)); $("#tabMap").setAttribute("aria-selected", String(!hq));
    $("#paneHq").hidden = !hq; $("#paneMap").hidden = hq; $("#legHq").hidden = !hq; $("#legMap").hidden = hq;
    try { localStorage.setItem("shelly.brain.tab", k); } catch (e) { /* */ }
  }
  $("#tabHq").onclick = () => tab("hq"); $("#tabMap").onclick = () => tab("map");
  
  try { if (localStorage.getItem("shelly.brain.tab") === "map") tab("map"); } catch (e) { /* */ }

  window.ShellyBrain = { openAgent };
})();

/* ---------------- the boot brain: a brain drawn in light (canvas 2D, no libraries)
   ~700 particles fly in and settle into a side view of a brain (cerebrum folded into gyri, cerebellum,
   brain stem); neighbours link into a web and impulses race along it; as the boot log runs each
   department ignites in its own colour round the brain and wires itself in; at 100% a core spark
   flashes and a shockwave rolls out: Shelly Brain is awake. Reduced motion: drawn once, no movement. */
function brainBoot(cv, deps) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, x = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, P = [], links = [], pulses = [], prog = 0, shown = 0, ign = 0, raf = 0, t0 = performance.now();
  const rnd = (a, b) => a + Math.random() * (b - a);
  // brain silhouette (unit space: x -1..1 front→back, y -0.75..0.75)
  const inCere = (u, v) => (u / 1) ** 2 + ((v + .05) / .66) ** 2 < 1 && v < .5 - .25 * u * u;
  const inCereb = (u, v) => ((u - .62) / .3) ** 2 + ((v - .5) / .18) ** 2 < 1;
  const inStem = (u, v) => Math.abs(u - .3 + (v - .55) * .3) < .09 && v > .42 && v < .82;
  const inside = (u, v) => inCere(u, v) || inCereb(u, v) || inStem(u, v);
  const N = innerWidth < 700 ? 420 : 720;
  while (P.length < N) {
    let u, v, k = Math.random();
    if (k < .62) { const c = Math.floor(rnd(0, 9)); u = rnd(-1, 1); v = -.55 + c * .12 + Math.sin(u * 9 + c * 1.7) * .05 + rnd(-.012, .012); }   // gyri: folded ridges
    else { u = rnd(-1, 1); v = rnd(-.75, .85); }
    if (!inside(u, v)) continue;
    const cereb = inCereb(u, v) && !inCere(u, v);
    if (cereb && Math.random() < .5) v += Math.sin(u * 40) * .015;
    P.push({ u, v, x: 0, y: 0, sx: rnd(-1.6, 1.6), sy: rnd(-1.4, 1.4), d: rnd(0, .35), r: rnd(.7, 1.7), hue: [196, 262, 150][Math.floor(rnd(0, 3))], tw: rnd(0, 6.3), cereb });
  }
  // a web: each particle to its two nearest neighbours
  for (let i = 0; i < P.length; i++) { const a = P[i], best = [];
    for (let j = 0; j < P.length; j++) if (j !== i) { const d = (a.u - P[j].u) ** 2 + (a.v - P[j].v) ** 2; if (best.length < 2 || d < best[1][0]) { best.push([d, j]); best.sort((p, q) => p[0] - q[0]); best.length = Math.min(2, best.length); } }
    best.forEach(([d, j]) => { if (d < .02 && i < j) links.push([i, j]); }); }
  const D = deps.map((d, i) => { const a = -Math.PI * .92 + i / (deps.length - 1) * Math.PI * 1.84; return { name: d.name, col: d.colour, a, on: 0 }; });
  function size() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener("resize", size);
  const ease = q => q < 0 ? 0 : q > 1 ? 1 : 1 - Math.pow(1 - q, 3);
  function frame(now) {
    const t = (now - t0) / 1000; shown += (prog - shown) * (still ? 1 : .08);
    const S = Math.min(W * .24, H * .42), cx = W * .5, cy = H * .5;
    x.clearRect(0, 0, W, H);
    // a soft glow where the brain is forming
    const gl = x.createRadialGradient(cx, cy, 0, cx, cy, S * 1.1); gl.addColorStop(0, `rgba(99,182,216,${.06 + .14 * shown})`); gl.addColorStop(1, "rgba(99,182,216,0)");
    x.fillStyle = gl; x.fillRect(cx - S * 1.2, cy - S * 1.2, S * 2.4, S * 2.4);
    const asm = still ? 1 : ease(t / 1.6);   // particles fly in and settle
    P.forEach(p => { const k = ease((asm - p.d) / (1 - p.d)); p.x = cx + (p.sx * (1 - k) + p.u * k) * S; p.y = cy + (p.sy * (1 - k) + p.v * k) * S; });
    // the brain drawn in light: outline, folded gyri, the ridged cerebellum and the stem (fade in as it assembles)
    const X = u => cx + u * S, Y = v => cy + v * S, la = Math.max(0, (asm - .45) / .55) * (.55 + .45 * shown);
    if (la > 0) {
      const top = u => -.05 - .66 * Math.sqrt(Math.max(0, 1 - u * u)), bot = u => Math.min(.5 - .25 * u * u, -.05 + .66 * Math.sqrt(Math.max(0, 1 - u * u)));
      x.save(); x.beginPath(); for (let k = 0; k <= 60; k++) { const u = -1 + k / 30; k ? x.lineTo(X(u), Y(top(u))) : x.moveTo(X(u), Y(top(u))); } for (let k = 60; k >= 0; k--) { const u = -1 + k / 30; x.lineTo(X(u), Y(bot(u))); } x.closePath();
      const fill = x.createLinearGradient(X(-1), 0, X(1), 0); fill.addColorStop(0, `rgba(99,182,216,${.10 * la})`); fill.addColorStop(.5, `rgba(182,156,242,${.12 * la})`); fill.addColorStop(1, `rgba(127,209,168,${.10 * la})`);
      x.fillStyle = fill; x.fill(); x.shadowColor = "#63b6d8"; x.shadowBlur = 16 * la; x.strokeStyle = `rgba(150,215,240,${.75 * la})`; x.lineWidth = 1.6; x.stroke(); x.shadowBlur = 0;
      x.clip(); x.lineWidth = 1.1; x.strokeStyle = `rgba(170,200,255,${.32 * la})`;
      for (let c = 0; c < 9; c++) { x.beginPath(); for (let k = 0; k <= 80; k++) { const u = -1 + k / 40, v = -.55 + c * .12 + Math.sin(u * 9 + c * 1.7) * .05 + (still ? 0 : Math.sin(t * 1.5 + c + u * 3) * .006); k ? x.lineTo(X(u), Y(v)) : x.moveTo(X(u), Y(v)); } x.stroke(); }
      x.beginPath(); x.moveTo(X(-.15), Y(-.7)); x.bezierCurveTo(X(-.05), Y(-.3), X(.1), Y(-.1), X(.05), Y(.25)); x.lineWidth = 2; x.strokeStyle = `rgba(200,225,255,${.4 * la})`; x.stroke();   // central sulcus
      x.restore();
      x.save(); x.beginPath(); x.ellipse(X(.62), Y(.5), .3 * S, .18 * S, 0, 0, 7); x.fillStyle = `rgba(182,156,242,${.12 * la})`; x.fill(); x.strokeStyle = `rgba(190,170,250,${.7 * la})`; x.lineWidth = 1.4; x.stroke(); x.clip();
      x.lineWidth = .8; for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(X(.62), Y(.38 + k * .04), .3 * S, .05 * S, 0, 0, Math.PI); x.stroke(); } x.restore();
      x.beginPath(); x.moveTo(X(.24), Y(.45)); x.quadraticCurveTo(X(.2), Y(.65), X(.27), Y(.85)); x.lineTo(X(.4), Y(.85)); x.quadraticCurveTo(X(.36), Y(.62), X(.4), Y(.5));
      x.strokeStyle = `rgba(150,215,240,${.6 * la})`; x.lineWidth = 1.3; x.stroke(); x.fillStyle = `rgba(99,182,216,${.08 * la})`; x.fill();
    }
    // web
    x.lineWidth = .7; x.strokeStyle = `rgba(120,200,235,${.16 + .2 * shown})`; x.beginPath();
    links.forEach(([i, j]) => { x.moveTo(P[i].x, P[i].y); x.lineTo(P[j].x, P[j].y); }); x.stroke();
    // department ring: each lights up as the boot moves on and wires into the brain
    x.font = `600 ${Math.max(10, Math.min(13, W / 60))}px "Plus Jakarta Sans",system-ui`; x.textBaseline = "middle";
    D.forEach((d, i) => { const want = shown * (D.length + .5) > i + .5 ? 1 : 0; d.on += (want - d.on) * (still ? 1 : .07);
      const px = cx + Math.cos(d.a) * S * 1.36, py = cy + Math.sin(d.a) * S * 1.02;
      if (d.on > .02) { const q = P[(i * 97) % P.length], g = x.createLinearGradient(px, py, q.x, q.y); g.addColorStop(0, d.col); g.addColorStop(1, "rgba(99,182,216,0)");
        x.globalAlpha = d.on * .7; x.strokeStyle = g; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo((px + cx) / 2, (py + cy) / 2 - 20, q.x, q.y); x.stroke(); x.globalAlpha = 1; }
      x.fillStyle = d.on > .5 ? d.col : "#25344a"; x.shadowColor = d.col; x.shadowBlur = 18 * d.on;
      x.beginPath(); x.arc(px, py, 4 + 2.5 * d.on + (still ? 0 : Math.sin(t * 4 + i) * d.on), 0, 7); x.fill(); x.shadowBlur = 0;
      x.fillStyle = `rgba(234,240,246,${.25 + .7 * d.on})`; x.textAlign = Math.cos(d.a) < -.2 ? "right" : Math.cos(d.a) > .2 ? "left" : "center";
      x.fillText(d.name, px + Math.cos(d.a) * 12, py + (Math.abs(Math.cos(d.a)) <= .2 ? Math.sign(Math.sin(d.a)) * 14 : 0)); });
    // impulses racing along the web (more as the brain wakes)
    if (!still && asm > .6) for (let k = 0; k < 1 + shown * 4; k++) if (Math.random() < .5) pulses.push({ l: links[Math.floor(Math.random() * links.length)], f: 0, v: rnd(1.5, 3.5), c: D[Math.floor(Math.random() * D.length)].col });
    pulses = pulses.filter(q => (q.f += q.v / 60) < 1);
    pulses.forEach(q => { const a = P[q.l[0]], b = P[q.l[1]], px = a.x + (b.x - a.x) * q.f, py = a.y + (b.y - a.y) * q.f;
      x.fillStyle = q.c; x.shadowColor = q.c; x.shadowBlur = 10; x.beginPath(); x.arc(px, py, 1.6, 0, 7); x.fill(); }); x.shadowBlur = 0;
    // the particles, twinkling, brighter as the boot completes
    P.forEach(p => { const a = (.35 + .55 * shown) * (still ? 1 : .75 + .25 * Math.sin(t * 3 + p.tw));
      x.fillStyle = `hsla(${p.hue},85%,${66 + 18 * shown}%,${Math.min(1, a + .2)})`; x.beginPath(); x.arc(p.x, p.y, p.r * (p.cereb ? .95 : 1.15), 0, 7); x.fill(); });
    // ignition: a core spark, a flash and a shockwave
    if (ign) { const k = still ? 1 : Math.min(1, (now - ign) / 900), r = S * (.1 + 1.6 * ease(k));
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, S * .5); g.addColorStop(0, `rgba(255,236,170,${.9 * (1 - k * .6)})`); g.addColorStop(1, "rgba(255,236,170,0)");
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, S * .5, 0, 7); x.fill();
      x.strokeStyle = `rgba(255,236,170,${.8 * (1 - k)})`; x.lineWidth = 3 * (1 - k) + .5; x.beginPath(); x.ellipse(cx, cy, r * 1.2, r * .8, 0, 0, 7); x.stroke(); }
    if (!still) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { progress(v) { prog = v; if (still) requestAnimationFrame(frame); }, ignite() { ign = performance.now(); if (still) requestAnimationFrame(frame); }, stop() { cancelAnimationFrame(raf); } };
}
