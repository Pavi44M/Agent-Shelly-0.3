/* Shelly Intelligence · Loss Prevention page (synthetic data from docs/data/lp.js, built by scripts/build_lp.py) */
(function () {
  "use strict";
  const D = window.SHELLY_LP, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = D.sites, SITES = Object.keys(S);
  $("#modv").textContent = D.version;

  /* ---------------- scope lock + KPIs */
  $("#lock").innerHTML = `<b>🔒 Scope locked</b> to Shelly's own businesses: ${SITES.map(k => esc(S[k].name)).join(" · ")}. Opening it to anyone else needs: ${D.scope.expansion_needs.map(esc).join(", ")}.`;
  const st = S.store.week, all = SITES.map(k => S[k].week);
  const T = a => a.reduce((x, y) => x + y, 0);
  const iaDay = (S.store.week.rules.find(r => r.rule === "unpaid_exit") || {}).innocent_assists / 7;
  $("#kpis").innerHTML = [[T(all.map(w => w.cases)), "cases for a person to check", "7 days · 4 sites"], [`${T(all.map(w => w.true))}/${T(all.map(w => w.losses))}`, "real losses flagged", "checked against the truth"],
    [st.false_per_camera_day, "false aisle cases / camera / day", `budget ${D.human.alert_budget_per_camera_day}`], [Math.round(iaDay * 10) / 10, "\"can I help?\" prompts / day", "to shoppers who did nothing wrong"],
    [money(T(all.map(w => w.value))), "value flagged", "real losses, 7 days"], ["0", "people identified", "no faces, no names, no scores"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---------------- the aisle camera: skeletons only */
  const SC = D.scene, cv = $("#aisle"), g = cv.getContext("2d");
  const CATN = { spirits: "Spirits", razors: "Razors & health", formula: "Infant formula", vapes: "Vapes" };
  const CATC = { spirits: ["#7a4b2a", "#c98a4a", "#e9d7a8", "#3d6b4f"], razors: ["#2c5d8f", "#9fb8d0", "#e0e6ee", "#6a7b8c"], formula: ["#e8d9b0", "#f4efe2", "#c9a96b", "#8bb0c9"], vapes: ["#5b3f8f", "#b69cf2", "#2b2f36", "#63b6d8"] };
  const base = document.createElement("canvas"); base.width = 1280; base.height = 720;
  (function drawAisle(b) {
    const fl = b.createLinearGradient(0, 560, 0, 720); fl.addColorStop(0, "#3a4352"); fl.addColorStop(1, "#262d38");
    b.fillStyle = "#1a2029"; b.fillRect(0, 0, 1280, 720); b.fillStyle = fl; b.fillRect(0, 560, 1280, 160);
    b.strokeStyle = "rgba(255,255,255,.05)"; for (let x = -400; x < 1700; x += 80) { b.beginPath(); b.moveTo(640 + (x - 640) * .55, 560); b.lineTo(x, 720); b.stroke(); }
    b.fillStyle = "#11161e"; b.fillRect(60, 70, 1160, 500);
    const r = new (function () { let s = 7; this.n = () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    Object.entries(SC.shelves).forEach(([cat, x]) => {
      const x0 = x - 120, w = 240;
      b.fillStyle = "#222a35"; b.fillRect(x0, 80, w, 480);
      for (let row = 0; row < 5; row++) {
        const y = 120 + row * 90; b.fillStyle = "#56606e"; b.fillRect(x0 + 6, y + 64, w - 12, 8);
        let px = x0 + 12;
        while (px < x0 + w - 24) { const pw = 14 + r.n() * 18, ph = cat === "spirits" ? 46 + r.n() * 14 : 26 + r.n() * 30; b.fillStyle = CATC[cat][Math.floor(r.n() * 4)]; b.fillRect(px, y + 64 - ph, pw, ph); b.fillStyle = "rgba(255,255,255,.18)"; b.fillRect(px + 2, y + 64 - ph + 3, 3, ph - 6); px += pw + 3; }
      }
      b.fillStyle = "rgba(9,14,22,.85)"; b.fillRect(x0 + 8, 88, 150, 26); b.fillStyle = "#ffc466"; b.font = "600 15px 'Plus Jakarta Sans',system-ui"; b.fillText(CATN[cat], x0 + 16, 106);
      b.strokeStyle = "rgba(255,196,102,.35)"; b.setLineDash([6, 6]); b.strokeRect(x0 + 2, 82, w - 4, 476); b.setLineDash([]);
    });
    b.fillStyle = "rgba(9,14,22,.82)"; b.fillRect(1018, 18, 244, 30); b.fillStyle = "#b0bac8"; b.font = "500 13px 'JetBrains Mono',monospace"; b.fillText("CAM AISLE 3 · SKELETON ONLY", 1030, 38);
  })(base.getContext("2d"));

  const COL = ["#63b6d8", "#7fd1a8", "#b69cf2", "#ffc466"];
  function person(p, t, glow) {
    const [i, cx, foot, H, lex, ley, lwx, lwy, lwv, rex, rey, rwx, rwy, rwv, walking] = p;
    const th = .3 * H, tw = .26 * H, ysh = foot - .8 * H, yhip = ysh + th, x0 = cx - tw / 2, x1 = cx + tw / 2, c = COL[i % 4];
    const sw = walking ? Math.sin(t * 7 + i) * .09 * H : 0;
    const J = { ls: [x0, ysh], rs: [x1, ysh], lh: [x0 + .08 * tw, yhip], rh: [x1 - .08 * tw, yhip], lk: [x0 + .1 * tw + sw * .5, yhip + .25 * H], rk: [x1 - .1 * tw - sw * .5, yhip + .25 * H],
      la: [x0 + .1 * tw + sw, foot], ra: [x1 - .1 * tw - sw, foot], le: [lex, ley], re: [rex, rey], lw: [lwx, lwy], rw: [rwx, rwy] };
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(cx, foot + 4, tw * .7, tw * .16, 0, 0, 7); g.fill();
    g.lineCap = "round"; g.lineJoin = "round";
    const bone = (a, b, w, alpha) => { g.globalAlpha = alpha; g.lineWidth = w; g.beginPath(); g.moveTo(...J[a]); g.lineTo(...J[b]); g.stroke(); g.globalAlpha = 1; };
    g.strokeStyle = c + "55"; [["ls", "rs"], ["ls", "lh"], ["rs", "rh"], ["lh", "rh"]].forEach(([a, b]) => bone(a, b, tw * .35, 1));
    g.fillStyle = c + "33"; g.beginPath(); g.moveTo(...J.ls); g.lineTo(...J.rs); g.lineTo(...J.rh); g.lineTo(...J.lh); g.closePath(); g.fill();
    g.strokeStyle = c; [["lh", "lk"], ["lk", "la"], ["rh", "rk"], ["rk", "ra"], ["ls", "le"], ["rs", "re"]].forEach(([a, b]) => bone(a, b, 5, 1));
    [["le", "lw", lwv], ["re", "rw", rwv]].forEach(([a, b, v]) => { g.setLineDash(v ? [] : [4, 6]); bone(a, b, 5, v ? 1 : .55); g.setLineDash([]); });
    g.fillStyle = "#eaf0f6"; Object.entries(J).forEach(([k, q]) => { if ((k === "lw" && !lwv) || (k === "rw" && !rwv)) return; g.beginPath(); g.arc(q[0], q[1], 4.5, 0, 7); g.fill(); });
    const hs = tw * .62, hx = cx - hs / 2, hy = ysh - hs * 1.15, n = 4;     // the head: a plain pixel block, no face points
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { g.fillStyle = ["#4a5566", "#5d6878", "#3d4757", "#566273"][(a + b + i) % 4]; g.fillRect(hx + a * hs / n, hy + b * hs / n, hs / n + .5, hs / n + .5); }
    if (glow) { g.strokeStyle = glow; g.lineWidth = 2; g.setLineDash([5, 5]); g.strokeRect(x0 - tw * .5, hy - 10, tw * 2, foot - hy + 20); g.setLineDash([]); }
    return { x: cx, top: hy };
  }

  const letters = ["A", "B", "C", "D"], cast = SC.cast;
  const evBy = {}; SC.events.forEach(e => (evBy[e.who] = evBy[e.who] || []).push(e));
  const AC = (D.tuning.knobs || {})["rule.assist_conf"] || 0;
  const pickT = i => (evBy[i] || []).find(e => e.kind === "reach"), concT = i => (evBy[i] || []).find(e => e.kind === "conceal" && e.conf >= AC);
  const outcome = c => c.kind.startsWith("thief") ? "unpaid" : (c.kind === "basket" || c.kind === "own_bag") ? "paid" : "none";
  let fi = 0, playing = !still, acc = 0, last = 0, logged = new Set();
  function feedAdd(cls, txt, t) { const f = $("#feed"); f.insertAdjacentHTML("afterbegin", `<div class="${cls}"><time>${t.toFixed(1)}s</time> ${txt}</div>`); }
  function steps(t) {
    $("#steps").innerHTML = `<div class="st-h"><span></span><span>Pick</span><span>Conceal</span><span>Unpaid exit</span><span>Shelly does</span></div>` + cast.map(c => {
      if (t < c.t0) return "";
      const p = pickT(c.i), q = concT(c.i), gone = t >= c.leaves, o = outcome(c);
      const on1 = p && t >= p.t, on2 = q && t >= q.t && on1, on3 = gone && o === "unpaid" && on2;
      const does = on3 ? `<b class="r">Case → Duty Manager</b>` : on2 ? (gone && o === "paid" ? `<b class="ok">Paid · closed</b>` : `<b class="w">Offer help</b>`) : gone ? (o === "paid" ? `<b class="ok">Paid</b>` : "Nothing") : "Watching";
      return `<div class="st-r"><span class="who" style="color:${COL[c.i]}">Visit ${letters[c.i]}</span><i class="${on1 ? "on" : ""}"></i><i class="${on2 ? "on w" : ""}"></i><i class="${on3 ? "on r" : ""}"></i><span>${does}</span></div>`;
    }).join("") + `<p class="note">Visit letters are random and forgotten when the visit ends.</p>`;
  }
  function log(t) {
    cast.forEach(c => {
      const p = pickT(c.i), q = concT(c.i), k = c.i;
      if (p && t >= p.t && !logged.has("p" + k)) { logged.add("p" + k); feedAdd("in", `Visit ${letters[k]}: picks from <b>${esc(CATN[c.cat])}</b> (high-risk shelf)`, t); }
      if (q && t >= q.t && !logged.has("c" + k)) { logged.add("c" + k); feedAdd("w", `Visit ${letters[k]}: hand ${q.conf >= .7 ? "and item out of view" : "near the body"} (${q.conf}) → floor staff: <b>offer help in Aisle 3</b>`, t); }
      if (t >= c.leaves && !logged.has("x" + k)) { logged.add("x" + k); const o = outcome(c);
        feedAdd(o === "unpaid" && q ? "r" : "out", o === "unpaid" && q ? `Visit ${letters[k]}: door camera, <b>left without paying for ${esc(CATN[c.cat])}</b> → case for the Duty Manager (20 s clip, faces pixelated)` :
          o === "paid" ? `Visit ${letters[k]}: paid at the till incl. ${esc(CATN[c.cat])} → nothing kept` : `Visit ${letters[k]}: left · nothing kept`, t); }
    });
  }
  function frame(n) {
    const t = n / SC.fps; g.drawImage(base, 0, 0);
    const rows = SC.frames[n] || [];
    rows.slice().sort((a, b) => a[2] - b[2]).forEach(p => {
      const c = cast[p[0]], q = concT(p[0]), on2 = q && t >= q.t && t < q.t + 3;
      const pt = person(p, t, on2 ? "#ffc466" : null);
      if (on2) { g.fillStyle = "rgba(9,14,22,.88)"; g.fillRect(pt.x - 92, pt.top - 40, 184, 26); g.fillStyle = "#ffc466"; g.font = "600 13px 'JetBrains Mono',monospace"; g.fillText("step 2 of 3 · offer help", pt.x - 82, pt.top - 22); }
    });
    $("#clock").textContent = `16:42:${String(Math.floor(t) + 10).padStart(2, "0")}`;
    steps(t); log(t);
  }
  function loop(ts) {
    if (playing) { acc += Math.min(.1, (ts - last) / 1000 || 0); while (acc >= 1 / SC.fps) { acc -= 1 / SC.fps; fi++; if (fi >= SC.frames.length) { fi = SC.frames.length - 1; playing = false; $("#play").textContent = "▶ Play"; $("#play").setAttribute("aria-pressed", "false"); } frame(fi); } }
    last = ts; requestAnimationFrame(loop);
  }
  $("#play").addEventListener("click", () => { if (fi >= SC.frames.length - 1) restart(); playing = !playing; $("#play").textContent = playing ? "❚❚ Pause" : "▶ Play"; $("#play").setAttribute("aria-pressed", String(playing)); });
  function restart() { fi = 0; logged = new Set(); $("#feed").innerHTML = ""; frame(0); }
  $("#again").addEventListener("click", () => { restart(); playing = true; $("#play").textContent = "❚❚ Pause"; });
  if (still) { fi = SC.frames.length - 1; frame(fi); } else frame(0);
  requestAnimationFrame(loop);
  $("#cast").innerHTML = cast.map(c => `<div class="cc"><b style="color:${COL[c.i]}">Visit ${letters[c.i]}</b> ${esc(c.story)}</div>`).join("");

  /* ---------------- lookalikes */
  const LK = D.lookalike, kinds = Object.keys(LK.names), thief = new Set(LK.thief);
  $("#look").innerHTML = `<table class="tbl"><tr><th>What the shopper does</th><th>Visits</th><th colspan="2">Factory: assist · case</th><th colspan="2">Tuned: assist · case</th></tr>
    ${kinds.map(k => `<tr class="${thief.has(k) ? "th" : ""}"><td>${thief.has(k) ? "⚠ " : ""}${esc(LK.names[k])}</td><td>${LK.factory[k].visits}</td><td class="${LK.factory[k].assist ? "w" : ""}">${LK.factory[k].assist}</td><td class="${LK.factory[k].review ? (thief.has(k) ? "ok" : "r") : ""}">${LK.factory[k].review}</td>
      <td class="${LK.tuned[k].assist ? "w" : ""}">${LK.tuned[k].assist}</td><td class="${LK.tuned[k].review ? (thief.has(k) ? "ok" : "r") : ""}">${LK.tuned[k].review}</td></tr>`).join("")}</table>
    <p class="note">⚠ rows are the simulated losses; every other row is an innocent shopper. Red = a case about someone who did nothing wrong, which a person would close as "no issue". A case needs all three steps, so a phone, crossed arms or an own bag on their own never become one.</p>`;

  /* ---------------- tuning */
  const TU = D.tuning, a = TU.start.held, b = TU.final.held;
  $("#tuneTop").innerHTML = `<div class="tiles">${[["Losses caught", Math.round(a.recall * 100) + "%", Math.round(b.recall * 100) + "%"], ["False cases / day", a.false_per_day, b.false_per_day], ["Innocent help prompts / day", a.innocent_assists_per_day, b.innocent_assists_per_day]]
      .map(([l, x, y]) => `<div class="tile"><span>${l}</span><b>${x} → ${y}</b></div>`).join("")}</div>
    <p class="note">${TU.within_budget ? "Inside" : "Outside"} the budget of ${TU.budget} false case per camera per day on days it never trained on. Settings: ${Object.entries(TU.knobs).map(([k, v]) => `${k.split(".")[1].replace(/_/g, " ")} <b>${v}</b>`).join(" · ")}.</p>
    <div class="go" id="go"></div>`;
  const goKey = "shelly.lp.golive";
  function paintGo() { let v = null; try { v = localStorage.getItem(goKey); } catch (e) { /* */ }
    $("#go").innerHTML = v ? `<p class="note">Your call on this device: <b>${v === "approved" ? "approved, put live" : "kept in suggest-only"}</b>. The real switch is <code>python -m shelly lp approve</code> or the Brain approvals.</p>` :
      `<button type="button" data-go="approved">Approve tuned settings</button><button type="button" class="no" data-go="rejected">Not yet</button> <span class="note">Until then the aisle runs on prompts only.</span>`; }
  paintGo(); $("#go").addEventListener("click", e => { const x = e.target.closest("[data-go]"); if (!x) return; try { localStorage.setItem(goKey, x.dataset.go); } catch (er) { /* */ } paintGo(); });
  $("#tuneLog").innerHTML = TU.log.map(l => `<div class="chg"><b>${esc(l.name)}</b> ${l.from} → ${l.to} <span class="${l.kept ? "k" : "x"}">${l.kept ? "kept" : "not kept"}</span><br><small class="note">${esc(l.why)} · held-out: caught ${Math.round(l.held.recall * 100)}%, ${l.held.false_per_day} false/day, ${l.held.innocent_assists_per_day} help prompts/day</small></div>`).join("") || `<p class="note">No change beat the held-out check.</p>`;

  /* ---------------- sites */
  const decided = (() => { try { return JSON.parse(localStorage.getItem("shelly.lp.review") || "{}"); } catch (e) { return {}; } })();
  let cur = "store";
  const stepsTxt = st => { const out = []; st.forEach(x => { const l = out[out.length - 1]; if (l && l.k === x.kind) l.n++; else out.push({ k: x.kind, at: x.at.slice(0, 5), n: 1 }); });
    return out.map(o => esc(`${o.at} ${o.n > 1 ? o.n + "× " : ""}${o.k}`)).join(" → "); };
  $("#tabs").innerHTML = SITES.map(k => `<button type="button" role="tab" data-s="${k}">${esc(S[k].name)}</button>`).join("");
  function bars(obj, col) { const tot = Object.values(obj).reduce((x, y) => x + y, 0) || 1, mx = Math.max(...Object.values(obj));
    return Object.entries(obj).map(([k, v]) => `<div class="zrow b2"><b>${esc(k)}</b><span class="m">${money(v)}</span><span class="m">${Math.round(v / tot * 100)}%</span><span class="bar"><i style="width:${v / mx * 100}%;background:${col}"></i></span></div>`).join(""); }
  function paintSite() {
    document.querySelectorAll("#tabs button").forEach(x => x.setAttribute("aria-selected", String(x.dataset.s === cur)));
    const s = S[cur], w = s.week, sh = s.shrink;
    $("#site").innerHTML = `<div class="grid2">
      <div class="card"><h3>Rules <small>${esc(s.cameras.map(c => c.name).join(" · "))}</small></h3>
        <table class="tbl"><tr><th>Rule</th><th>Cases</th><th>Real</th><th>Explained by</th></tr>${w.rules.map(r => `<tr><td><b>${esc(r.what)}</b>${r.assists ? `<small>${r.assists} help prompts first</small>` : ""}</td><td>${r.reviews}</td><td class="ok">${r.true}${r.losses ? "/" + r.losses : ""}</td>
          <td><small>${Object.entries(r.explained).map(([k, v]) => `${esc(k.replace(/_/g, " "))} ×${v}`).join(", ") || "–"}</small></td></tr>`).join("")}</table>
        <p class="note">Owners: ${[...new Set(s.rules.map(r => r.owner).filter(Boolean))].map(esc).join(", ") || esc(D.human.review_by)}. A case is a question for a person, never a verdict.</p></div>
      <div class="card"><h3>Case queue <small>latest · your review stays on this device</small></h3><div class="queue">${s.queue.map(c => { const d = decided[c.id];
        return `<div class="case"><div><b>${esc(c.what)}</b><small>${esc(c.id)} · ${esc(c.at)} · ${esc(c.where)}${c.value ? " · " + money(c.value) : ""}${c.confidence ? " · confidence " + c.confidence : ""}</small>
          <small>${stepsTxt(c.steps)}</small></div>
          <div class="rv">${d ? `<span class="dec ${d === "loss" ? "r" : "ok"}">${d === "loss" ? "Loss confirmed" : d === "assist" ? "Assist only" : "No issue"}</span>` :
          `<button type="button" data-c="${esc(c.id)}" data-d="none">No issue</button><button type="button" data-c="${esc(c.id)}" data-d="assist">Assist only</button><button type="button" class="r" data-c="${esc(c.id)}" data-d="loss">Loss</button>`}</div></div>`; }).join("") || `<p class="note">No cases this week.</p>`}</div></div></div>
      <div class="grid2"><div class="card"><h3>Step 1 · where the loss is <small>no camera needed · ${esc(sh.label)} ${money(sh.sales)} · loss ${money(sh.loss)} (${sh.rate}%)</small></h3>${bars(sh.by_cause, "#ff6b6b")}<h3 style="margin-top:12px">By place</h3>${bars(sh.by_place, "#ffc466")}</div>
      <div class="card"><h3>Privacy impact checklist <small>${esc(s.name)}</small></h3><div class="pia">${s.pia.map(r => `<div class="pr"><span class="${r.status === "done by Shelly" ? "ok" : "w"}">${r.status === "done by Shelly" ? "✓" : "○"}</span><span><b>${esc(r.area)}</b> ${esc(r.question)}<small>${esc(r.answer)} · ${esc(r.status)}</small></span></div>`).join("")}</div></div></div>`;
  }
  $("#tabs").addEventListener("click", e => { const x = e.target.closest("[data-s]"); if (x) { cur = x.dataset.s; paintSite(); } });
  $("#site").addEventListener("click", e => { const x = e.target.closest("[data-c]"); if (!x) return; decided[x.dataset.c] = x.dataset.d; try { localStorage.setItem("shelly.lp.review", JSON.stringify(decided)); } catch (er) { /* */ } paintSite(); });
  const fromHash = () => { const h = location.hash.replace("#s-", ""); if (S[h] && h !== "store") { cur = h; paintSite(); $("#s-cases").scrollIntoView(); } };
  paintSite(); fromHash(); addEventListener("hashchange", fromHash);

  /* ---------------- evidence pack */
  const P = D.pack;
  $("#pack").innerHTML = `<div class="ph"><b>Evidence pack ${esc(P.case)}</b><span>${esc(P.site)} · ${esc(P.where)} · first seen ${esc(P.first_seen)}</span></div>
    <div class="grid2 in"><div><h3>What happened</h3><ol>${P.steps.map(x => `<li><code>${esc(x)}</code></li>`).join("")}</ol>
      <p>Incident confidence <b>${esc(P.incident_confidence ?? "system record")}</b> · value at risk <b>${money(P.value_estimate)}</b></p>
      ${(P.clips || []).length ? `<p>${P.clips.map(c => `Clip <b>${esc(c.from)}–${esc(c.to)}</b> (${c.seconds} s)`).join(" · ")}, faces pixelated. Original: ${esc(P.original_clip)}.</p>` : ""}
      <p class="note">${esc(P.privacy)} Keep until ${esc(P.keep_until)}.</p></div>
    <div><h3>The Duty Manager fills in</h3><ul class="todo">${P.to_fill.map(x => `<li>☐ ${esc(x)}</li>`).join("")}</ul></div></div>`;

  /* ---------------- ladder, never, sign, checks */
  $("#ladder").innerHTML = D.ladder.map(l => `<li><b>${esc(l.step)}</b> <span class="who">${esc(l.who)}</span><br>${esc(l.what)}</li>`).join("");
  $("#never").innerHTML = D.human.never.map(x => `<li>${esc(x.charAt(0).toUpperCase() + x.slice(1))}</li>`).join("");
  $("#sign").textContent = D.sign;
  $("#checks").innerHTML = D.checks.map(x => `<li>✓ ${esc(x)}</li>`).join("");
  $("#nobuild").innerHTML = ["Facial recognition, watchlists or \"Identified / Unknown\" labels", "A threat meter over anyone's head", "Age, gender, ethnicity or \"type of person\"",
    "Tracking a person across visits or days", "Attention tracking of individuals (shelf-level heat only, in Store Vision)", "Automatic accusations, bans or public posting of footage"].map(x => `<li>✗ ${esc(x)}</li>`).join("");
  $("#lawnote").innerHTML = `Built to follow the NZ Privacy Act 2020 and the Privacy Commissioner's CCTV guidance, and to stay outside the Biometric Processing Privacy Code by not processing biometrics at all. Before real cameras go live at a site: complete its privacy impact checklist, put up the signs, give staff the written notice, and get a quick legal check. This page is information, not legal advice.`;
  $("#foot").textContent = `Shelly Intelligence · Loss Prevention v${D.version} · data built ${D.generated} · synthetic data, no real people · ${D.pose ? "pose: 17 body points, face points dropped" : ""}`;
})();
