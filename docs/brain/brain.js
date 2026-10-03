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
    const svg = $(".boot-brain"); let g = "";
    for (let i = 0; i < 9; i++) { const x = 20 + i * 20, y = 30 + Math.sin(i) * 16; g += `<circle cx="${x}" cy="${y}" r="4" fill="${["#63b6d8", "#b69cf2", "#7fd1a8"][i % 3]}" style="animation-delay:${i * .12}s"/>`;
      if (i) g += `<line x1="${x - 20}" y1="${30 + Math.sin(i - 1) * 16}" x2="${x}" y2="${y}"/>`; }
    svg.innerHTML = g;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let skip = false, quick = false;
    try { quick = sessionStorage.getItem("brain.booted") === "1"; sessionStorage.setItem("brain.booted", "1"); } catch (e) { /* */ }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) quick = true;
    $("#skipBoot").onclick = () => { skip = true; };
    const s = B.stats;
    const lines = [`› core online · ${B.core.map(c => c.name.toLowerCase()).join(" · ")}`,
      `› ${s.businesses} businesses · ${s.departments} departments · ${s.agents} agents · ${s.skills} skills`,
      `› autonomy · ${s.auto} run on their own · ${s.suggest} suggest · ${s.approve} need approval`,
      `› memory · ${s.pending} proposals in the approvals queue`,
      `› store data to ${B.store_asof} · Tōtara data to ${B.totara_asof}`];
    for (const t of lines) { if (skip) break; log.insertAdjacentText("beforeend", t + "\n"); await sleep(quick ? 50 : 380); }
    const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = "✓ Brain awake."; log.appendChild(ok);
    await sleep(skip || quick ? 80 : 450); box.classList.add("done"); setTimeout(() => box.remove(), 700);
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
    const agents = B.agents, n = agents.length, gap = 0.06;
    const order = ["store", "totara", "group"];
    const sorted = order.flatMap(b => agents.filter(a => a.business === b));
    const step = (2 * Math.PI - gap * order.length) / n;
    let ang = -Math.PI / 2, pos = {}, depAng = {}, bizArc = {};
    order.forEach(b => {
      const list = sorted.filter(a => a.business === b);
      bizArc[b] = [ang, ang + step * list.length];
      list.forEach(a => { pos[a.id] = ang + step / 2; (depAng[a.department] = depAng[a.department] || []).push(ang + step / 2); ang += step; });
      ang += gap;
    });
    const P = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
    let s = `<circle class="ring" r="200"/><circle class="ring" r="300"/>`;
    order.forEach(b => {   // business arc
      const [a0, a1] = bizArc[b], r = 150, [x0, y0] = P(r, a0), [x1, y1] = P(r, a1), big = a1 - a0 > Math.PI ? 1 : 0;
      s += `<path d="M${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1}" stroke="${BIZ[b].colour}" stroke-width="10" stroke-linecap="round" fill="none" opacity=".75"/>`;
      const [lx, ly] = P(118, (a0 + a1) / 2);
      s += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="${BIZ[b].colour}" style="fill:${BIZ[b].colour};font-size:11px;font-weight:600">${esc(BIZ[b].icon)}</text>`;
    });
    Object.entries(depAng).forEach(([d, angs]) => {    // departments
      const t = angs.reduce((x, y) => x + y) / angs.length, [x, y] = P(205, t), col = BIZ[DEP[d].business].colour;
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
        if (g.dataset.agent) { const a = AG[g.dataset.agent]; h = `<b>${esc(a.name)}</b><small>${esc(BIZ[a.business].name)} · ${esc(DEP[a.department].name)} · ${esc(AUTO_L[a.autonomy])}</small>${esc(a.mission)}`; }
        else if (g.dataset.dep) { const d = DEP[g.dataset.dep]; h = `<b>${esc(d.name)}</b><small>${esc(BIZ[d.business].name)} · head: ${esc(d.head)}</small>${esc(d.purpose)}`; }
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
    const hay = [a.name, a.mission, a.skills.join(" "), a.inputs.join(" "), a.outputs.join(" "), a.triggers.join(" "), DEP[a.department].name, BIZ[a.business].name].join(" ").toLowerCase();
    return fQ.split(/\s+/).every(w => hay.includes(w));
  }
  function card(a) {
    const pend = pendingOf(a.id).length;
    return `<button class="agent" data-agent="${esc(a.id)}"><span class="top"><b>${esc(a.name)}</b>${pend ? `<span class="wait-b">${pend}</span>` : ""}<span class="pill ${a.autonomy}">${esc(AUTO_L[a.autonomy])}</span></span>
      <span class="m">${esc(a.mission)}</span>${a.live.length ? `<span class="lv">${a.live.map(l => `<span>${esc(l.label)} <b>${esc(l.value)}</b></span>`).join("")}</span>` : ""}</button>`;
  }
  function renderOrgs() {
    $("#orgs").innerHTML = B.businesses.map(b => {
      const deps = B.departments.filter(d => d.business === b.id).map(d => {
        const list = B.agents.filter(a => a.department === d.id && matches(a));
        if (!list.length && (fQ || fA !== "all")) return "";
        return `<div class="dep" id="dep-${esc(d.id)}"><div class="dep-h"><b>${esc(d.name)}</b><span>${esc(d.purpose)}</span><em>Head: ${esc(d.head)}</em></div>
          ${list.map(card).join("") || '<span class="empty">No agent matches.</span>'}</div>`;
      }).join("");
      return deps ? `<div class="biz-block"><div class="biz-h"><span class="ic" style="background:${b.colour}" aria-hidden="true">${esc(b.icon)}</span>
        <div><h3>${esc(b.name)}</h3><p>${esc(b.kind)} · ${esc(b.tagline)}</p></div><a href="${esc(b.page)}">Open ›</a></div><div class="deps">${deps}</div></div>` : "";
    }).join("") || '<p class="empty">No agents match these filters.</p>';
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
    $("#dBody").innerHTML = `<div class="crumb">${esc(b.icon)} ${esc(b.name)} › ${esc(d.name)}</div><h2 id="dTitle">${esc(a.name)}</h2>
      <span class="pill ${a.autonomy}">${esc(AUTO_L[a.autonomy])}</span><p class="mission">${esc(a.mission)}</p>
      <div class="d-grid"><div><span>Answers to</span><b>${esc(a.owner)}</b></div><div><span>Department head</span><b>${esc(d.head)}</b></div>
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
      <div class="d-sec"><h3>Waiting for your approval (${pend.length})</h3>${pend.length ? pend.slice(0, 12).map(i => `<div class="ap-item"><b style="color:var(--ink)">${esc(i.title)}</b><div>${esc(i.area)}${i.text ? " · " + esc(i.text) : ""}</div>
        <div class="r"><button class="yes" data-y="${esc(i.key)}">✓ Approve</button><button class="no" data-n="${esc(i.key)}">✕ Reject</button></div></div>`).join("") + (pend.length > 12 ? `<p class="empty">+${pend.length - 12} more in the approvals tray.</p>` : "")
        : '<p class="empty" style="margin:0">Nothing waiting.</p>'}</div>
      <a class="d-open" href="${esc(a.page)}">Open its work ›</a>`;
    $$("[data-go]", drawer).forEach(x => x.onclick = () => openAgent(x.dataset.go));
    $$("[data-y],[data-n]", drawer).forEach(x => x.onclick = () => {
      const it = AP.items.find(i => i.key === (x.dataset.y || x.dataset.n));
      if (it && window.ShellyKit) window.ShellyKit.answer(it, x.dataset.y ? "y" : "n");
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
      ? `<div class="res">→ <b>${esc(best.name)}</b> in ${esc(DEP[best.department].name)} (${esc(BIZ[best.business].name)}) · ${esc(AUTO_L[best.autonomy])} · answers to ${esc(best.owner)}<button id="askOpen">See agent ›</button></div>`
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
  document.addEventListener("shelly:hq-unavailable", () => { $("#tabHq").hidden = true; tab("map"); });
  try { if (localStorage.getItem("shelly.brain.tab") === "map") tab("map"); } catch (e) { /* */ }

  window.ShellyBrain = { openAgent };
})();
