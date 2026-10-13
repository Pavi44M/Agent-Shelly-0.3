/* Shelly Intelligence · Store Vision page (synthetic camera; data from docs/data/vision.js, built by scripts/build_vision.py) */
(function () {
  "use strict";
  const V = window.SHELLY_VISION, $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = V.day, Z = Object.fromEntries(V.zones.map(z => [z.id, z])), ZC = { dwell: "#63b6d8", queue: "#ffc466", restricted: "#ff6b6b" };
  const fmtS = s => s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`;
  const pct = (a, b) => b ? (100 - Math.abs(a - b) / b * 100) : 100;
  $("#modv").textContent = V.version;

  /* ---------------- KPIs */
  const conv = Math.round(Z.checkout ? D.zones.find(z => z.id === "checkout").visits / Math.max(1, D.visitors - D.truth.staff) * 100 : 0);
  const busiest = D.hours.reduce((a, h) => (h.in || 0) > (a.in || 0) ? h : a, {});
  const dw = D.zones.filter(z => z.kind === "dwell"), top = dw.reduce((a, z) => z.heat_s > a.heat_s ? z : a, dw[0]);
  $("#kpis").innerHTML = [[D.visitors, "unique visitors", `${pct(D.visitors, D.truth.people).toFixed(1)}% of the truth`], [D.in, "in through the door", `${D.out} out`],
    [D.occupancy_peak, "peak people inside", `busiest hour ${busiest.hour || "-"}`], [conv + "%", "reached the till", "floor-to-till conversion"],
    [top ? top.name : "-", "hot zone", top ? `${fmtS(top.avg_dwell_s)} average` : ""], [D.alert_counts.queue + D.alert_counts.restricted, "prompts for the team", `${D.alert_counts.queue} queue · ${D.alert_counts.restricted} staff-only`]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---------------- the store camera (a drawn floor seen from a high corner) */
  function drawFloor(g, W, H) {
    g.fillStyle = "#1a2230"; g.fillRect(0, 0, W, H);
    const fl = g.createLinearGradient(0, 0, 0, H); fl.addColorStop(0, "#2a3442"); fl.addColorStop(1, "#3a4555"); g.fillStyle = fl; g.fillRect(30, 20, W - 60, H - 40);
    g.strokeStyle = "rgba(255,255,255,.04)"; g.lineWidth = 1; for (let x = 30; x < W - 30; x += 40) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, H - 20); g.stroke(); } for (let y = 20; y < H - 20; y += 40) { g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y); g.stroke(); }
    const shelf = (x, y, w, h, c) => { g.fillStyle = "#151b24"; g.fillRect(x + 4, y + 6, w, h); g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x, y, w, 4); };
    for (let i = 0; i < 4; i++) shelf(470 + i * 105, 170, 40, 220, "#5c6b80");
    shelf(930, 130, 270, 34, "#8fb8d8"); shelf(130, 290, 60, 150, "#6fae5a"); shelf(260, 270, 120, 40, "#c98a4a"); shelf(260, 360, 120, 40, "#c98a4a");
    shelf(980, 430, 90, 60, "#8a5a3b"); shelf(1110, 520, 90, 60, "#8a5a3b"); shelf(560, 500, 260, 26, "#24543f");
    g.fillStyle = "#11161e"; g.fillRect(60, 40, 340, 170); g.fillStyle = "#3d4a5c"; for (let i = 0; i < 5; i++) g.fillRect(80 + i * 62, 60, 44, 120);
    g.fillStyle = "#0e141c"; g.fillRect(450, 660, 390, 40); g.fillStyle = "#9fd3ea55"; g.fillRect(470, 662, 350, 8);
  }
  function drawZones(g) {
    V.zones.forEach(z => { const c = ZC[z.kind] || "#aaa"; g.beginPath(); z.poly.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      g.fillStyle = c + "14"; g.fill(); g.setLineDash(z.kind === "restricted" ? [8, 6] : []); g.strokeStyle = c + "cc"; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
      const x0 = Math.min(...z.poly.map(p => p[0])), y0 = Math.min(...z.poly.map(p => p[1]));
      g.font = "600 15px 'Plus Jakarta Sans',system-ui"; const w = g.measureText(z.name).width + 16; g.fillStyle = "rgba(9,14,22,.8)"; g.fillRect(x0 + 6, y0 + 6, w, 24); g.fillStyle = c; g.fillText(z.name, x0 + 14, y0 + 23); });
    V.lines.forEach(L => { g.strokeStyle = "#7fd1a8"; g.lineWidth = 4; g.beginPath(); g.moveTo(...L.a); g.lineTo(...L.b); g.stroke(); });
  }
  function heatInto(g, grid, w, h, cell, alpha) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"), im = x.createImageData(w, h);
    const sorted = grid.filter(v => v > 0).sort((a, b) => a - b), top = sorted.length ? sorted[Math.floor(sorted.length * .99)] : 1;
    for (let i = 0; i < grid.length; i++) { const k = Math.min(1, grid[i] / top); const [r, gg, b] = inferno(k); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = k < .02 ? 0 : 255 * Math.min(1, .25 + k) * alpha; }
    x.putImageData(im, 0, 0); g.save(); g.imageSmoothingEnabled = true; g.filter = "blur(10px)"; g.drawImage(c, 0, 0, w * cell, h * cell); g.restore(); return top;
  }
  function inferno(k) { const S = [[0, 0, 4], [66, 10, 104], [147, 38, 103], [221, 81, 58], [252, 165, 10], [252, 255, 164]], f = k * 5, i = Math.min(4, Math.floor(f)), t = f - i;
    return S[i].map((v, j) => Math.round(v + (S[i + 1][j] - v) * t)); }

  /* ---------------- live view: 90 s of the rush, people pixelated (privacy), engine counters */
  const cam = $("#cam"), g = cam.getContext("2d"), P = V.play, base = document.createElement("canvas"); base.width = 1280; base.height = 720;
  const bg = base.getContext("2d"); drawFloor(bg, 1280, 720); drawZones(bg);
  const hp = P.heat, hw = D.heat.w, hh = D.heat.h;
  let fi = 0, playing = !still, showHeat = true, acc = 0, last = 0, feed = [];
  const COLS = ["#d94a3d", "#3d7dd9", "#e0a32e", "#2a9d8f", "#7a5cc4", "#e85d9a", "#556070", "#c9b48a", "#f4f1ea", "#1f8a5b"];
  function person(b) {   // an anonymous figure: body, pixelated head, the foot point the engine uses
    const [id, x1, y1, x2, y2] = b, w = x2 - x1, h = y2 - y1, c = COLS[id % COLS.length];
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse((x1 + x2) / 2, y2, w * .55, w * .18, 0, 0, 7); g.fill();
    g.fillStyle = c; g.beginPath(); g.roundRect(x1 + w * .12, y1 + h * .22, w * .76, h * .5, w * .25); g.fill();
    g.fillStyle = "#2b3442"; g.fillRect(x1 + w * .2, y1 + h * .68, w * .25, h * .32); g.fillRect(x1 + w * .55, y1 + h * .68, w * .25, h * .32);
    const s = Math.max(3, w / 4); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.fillStyle = ["#c68c5f", "#e0ac84", "#a26a42", "#7a5a44"][(i + j + id) % 4]; g.fillRect(x1 + w * .5 - s * 1.5 + i * s, y1 + j * s * .8, s, s * .8); }
    g.strokeStyle = "#63b6d8aa"; g.lineWidth = 1.5; g.strokeRect(x1, y1, w, h);
    g.fillStyle = "#fff"; g.beginPath(); g.arc((x1 + x2) / 2, y2, 3, 0, 7); g.fill();
  }
  function side(c) {
    const [vis, inn, out, occ, q] = c, qz = Z.checkout, warn = q >= (qz ? qz.alert_len : 4);
    $("#liveSide").innerHTML = `<div class="tile"><b>${occ}</b><span>in the store now</span></div>
      <div class="tile"><b>${inn} <small style="font-size:14px;color:var(--ink-3)">in</small> · ${out} <small style="font-size:14px;color:var(--ink-3)">out</small></b><span>door, this clip</span></div>
      <div class="tile q ${warn ? "warn" : ""}"><b>${q}</b><span>in the checkout queue · about ${Math.round(q * (qz ? qz.service_s : 45) / 60 * 10) / 10} min${warn ? " · open a till" : ""}</span></div>
      <div class="feed" aria-live="polite">${feed.slice(0, 9).map(f => `<div class="${f[1]}">${f[0]} · ${f[2]}</div>`).join("") || "<div>Watching the door…</div>"}</div>`;
  }
  let prev = null;
  function draw(i) {
    const f = P.frames[i]; g.drawImage(base, 0, 0);
    if (showHeat) heatInto(g, hp, hw, hh, D.heat.cell, .55);
    f.b.slice().sort((a, b) => a[4] - b[4]).forEach(person);
    if (prev && i > 0) { if (f.c[1] > prev[1]) feed.unshift([clk(f.t), "in", "came in"]); if (f.c[2] > prev[2]) feed.unshift([clk(f.t), "out", "went out"]); }
    if (i === 0) feed = [];
    prev = f.c; side(f.c); $("#clock").textContent = clk(f.t);
  }
  const clk = t => { const s = 17 * 3600 + 600 + t; return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
  function loop(now) { requestAnimationFrame(loop); if (!playing) { last = now; return; } acc += Math.min(.2, (now - (last || now)) / 1000); last = now;
    while (acc >= 1 / P.fps) { acc -= 1 / P.fps; fi = (fi + 1) % P.frames.length; draw(fi); } }
  draw(0); requestAnimationFrame(loop);
  $("#play").onclick = e => { playing = !playing; e.currentTarget.setAttribute("aria-pressed", String(playing)); e.currentTarget.textContent = playing ? "❚❚ Pause" : "▶ Play"; };
  $("#heatBtn").onclick = e => { showHeat = !showHeat; e.currentTarget.setAttribute("aria-pressed", String(showHeat)); draw(fi); };

  /* ---------------- the day */
  (function hours() {
    const H = D.hours, W = 640, Ht = 240, L = 34, B = 26, bw = (W - L - 10) / H.length, mx = Math.max(...H.map(h => h.in || 0), 1);
    let s = ""; for (let k = 0; k <= 4; k++) { const y = Ht - B - (Ht - B - 14) * k / 4; s += `<line x1="${L}" x2="${W - 6}" y1="${y}" y2="${y}" stroke="#1f2a38"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${Math.round(mx * k / 4)}</text>`; }
    H.forEach((h, i) => { const x = L + i * bw + 3, v = h.in || 0, hgt = (Ht - B - 14) * v / mx, op = (Ht - B - 14) * (h.occ_peak || 0) / mx;
      s += `<rect x="${x}" y="${Ht - B - hgt}" width="${bw - 6}" height="${hgt}" rx="3" fill="#63b6d8"><title>${h.hour}: ${v} in, peak ${h.occ_peak} inside</title></rect>`;
      s += `<rect x="${x + (bw - 6) / 4}" y="${Ht - B - op}" width="${(bw - 6) / 2}" height="2.5" fill="#ffc466"/>`;
      if (i % 2 === 0) s += `<text x="${x + (bw - 6) / 2}" y="${Ht - 8}" text-anchor="middle">${h.hour.slice(0, 2)}</text>`; });
    s += `<rect x="${W - 200}" y="6" width="10" height="10" fill="#63b6d8"/><text x="${W - 186}" y="15">in</text><rect x="${W - 150}" y="10" width="14" height="3" fill="#ffc466"/><text x="${W - 130}" y="15">peak inside</text>`;
    $("#hours").innerHTML = s;
  })();
  const totHeat = dw.reduce((a, z) => a + z.heat_s, 0) || 1;
  $("#zones").innerHTML = D.zones.filter(z => z.kind !== "restricted").map(z => `<div class="zrow"><span><b>${esc(z.name)}</b>${z.kind === "queue" ? ` · max ${z.queue_max} waiting` : ""}</span>
    <span class="m">${z.visits}</span><span class="m">${fmtS(z.avg_dwell_s)}</span><span class="bar"><i style="width:${z.kind === "dwell" ? Math.round(z.heat_s / totHeat * 100) : 0}%;background:${ZC[z.kind]}"></i></span></div>`).join("")
    + `<p class="note" style="margin:8px 0 0">A visit counts after ${Z.produce ? Z.produce.min_dwell_s : 3}s in a zone; walking through doesn't. Bars: share of all time spent on the shop floor.</p>`;
  const hc = $("#heat"), hg = hc.getContext("2d"); drawFloor(hg, 1280, 720); const topS = heatInto(hg, D.heat.s, D.heat.w, D.heat.h, D.heat.cell, .85); drawZones(hg);
  $("#heatLeg").innerHTML = `<span>0</span><span class="g"></span><span>${fmtS(topS)}+ per spot</span>`;
  $("#alerts").innerHTML = D.alerts.slice(0, 12).map(a => `<div class="al ${a.kind === "restricted" ? "r" : ""}"><time>${a.time.slice(0, 5)}</time><span><b>${a.kind === "queue" ? "Queue" : "Staff-only area"}</b> · ${esc(a.note)}</span></div>`).join("")
    + `<p class="note" style="margin:8px 0 0">${D.alert_counts.queue + D.alert_counts.restricted} prompts today (latest shown). Staff-only prompts ask someone to check; they never judge a person.</p>`;
  const T = D.truth, Q = D.zones.find(z => z.kind === "queue");
  const rows = [["Unique visitors", D.visitors, T.people], ["In through the door", D.in, T.in], ["Out through the door", D.out, T.out], ["Joined the checkout queue", Q.visits, T.queued],
    ["Staff-only area entries", D.alert_counts.restricted, T.restricted]];
  $("#truth").innerHTML = `<table><tr><th>Measure</th><th>Shelly counted</th><th>Really happened</th><th>Accuracy</th></tr>${rows.map(([l, a, b]) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td><td class="acc">${pct(a, b).toFixed(1)}%</td></tr>`).join("")}</table>
    <p class="note" style="margin:8px 0 0">Camera noise in the simulation: missed detections, identity switches, false positives and jittery boxes, like a real tracker.</p>`;

  /* ---------------- Skill Lab */
  const LAB = V.lab, LC = ["", "#ff6b6b", "#ffc466", "#63b6d8", "#7fd1a8", "#b69cf2"];
  const lastDay = LAB.days[LAB.days.length - 1], firstDay = LAB.days[0];
  const avg = d => { const v = Object.entries(d.scores).filter(([k]) => !LAB.curriculum.some(c => c.id === k)).map(x => x[1]); return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length); };
  $("#labTop").innerHTML = `<div class="tile"><b>${LAB.days.length}</b><span>exam days</span></div><div class="tile"><b>${avg(firstDay).toFixed(0)} → ${avg(lastDay).toFixed(0)}</b><span>average score, day 1 → today</span></div>
    <div class="tile"><b>${esc(lastDay.difficulty)}</b><span>today's exam (gets harder as she improves)</span></div><div class="tile"><b>${LAB.unlocked.length}</b><span>new skills learned</span></div>
    <div class="tile"><b>${LAB.kept_total}</b><span>tunings kept · ${LAB.rejected_total} rejected (held-out check)</span></div>`;
  const decided = (() => { try { return JSON.parse(localStorage.getItem("shelly.vision.golive") || "{}"); } catch (e) { return {}; } })();
  function spark(h) { if (!h || h.length < 2) return ""; const w = 220, ht = 34, mn = Math.min(...h.map(x => x.score), 50), mx = 100;
    const pts = h.map((x, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(ht - 3 - (x.score - mn) / (mx - mn) * (ht - 6)).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--c)" stroke-width="2"/></svg>`; }
  function paintSkills() {
    $("#skills").innerHTML = Object.entries(LAB.skills).map(([id, s]) => {
      const pr = LAB.proposals.find(p => p.skill === id), dec = decided[id], status = dec === "approved" ? "live" : s.status;
      return `<div class="sk" style="--c:${LC[s.level]}"><span class="sc">${s.score != null ? Math.round(s.score) : "–"}</span><h4>${esc(s.name)}<span class="st ${status}">${status === "training" ? "in training" : "live"}</span></h4>
        <div class="lvl">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= s.level ? "on" : ""}"></i>`).join("")}</div><span class="lab">Level ${s.level} · ${esc(s.label)}${s.trend ? ` · ${s.trend > 0 ? "▲" : "▼"} ${Math.abs(s.trend)}` : ""}</span>
        <p>${esc(s.what)}</p>${spark(s.history)}<span class="who">${esc(s.agent)} · <code>${esc(id)}</code></span>
        ${pr && pr.status === "waiting" && !dec ? `<div><button type="button" data-go="${id}">Approve go-live</button><button type="button" class="no" data-no="${id}">Not yet</button></div>` : dec === "rejected" ? `<p>Kept in training (your call).</p>` : ""}</div>`; }).join("");
  }
  paintSkills();
  $("#skills").addEventListener("click", e => { const b = e.target.closest("[data-go],[data-no]"); if (!b) return; const id = b.dataset.go || b.dataset.no;
    decided[id] = b.dataset.go ? "approved" : "rejected"; try { localStorage.setItem("shelly.vision.golive", JSON.stringify(decided)); } catch (er) { /* */ } paintSkills(); });
  const F = LAB.factory || {};
  $("#changes").innerHTML = LAB.changes.slice().reverse().slice(0, 10).map(c => `<div class="chg"><b>${esc((LAB.skills[c.skill] || {}).name || c.skill)}</b> · <code>${esc(c.knob)}</code> ${c.from ?? "–"} → ${c.to}
    <span class="${c.kept ? "k" : "x"}">${c.kept ? "kept" : "rejected"}</span><br><small class="note">${esc(c.day)} · ${esc(c.why)} (held-out ${c.held_out})</small></div>`).join("")
    + `<p class="note" style="margin:8px 0 0">Day 1 started from factory settings (${Object.entries(F).map(([k, v]) => `${k.split(".")[1]} ${v}`).join(", ")}): the lab found the rest itself.</p>`;
  const have = new Set(Object.keys(LAB.skills));
  $("#curr").innerHTML = LAB.curriculum.map(c => { const u = LAB.unlocked.find(x => x.id === c.id);
    return `<div class="cur"><span>${u ? "✓" : "○"}</span><span><b>${esc(c.name)}</b>${u ? ` <small style="display:inline">· learned ${esc(u.day)}</small>` : ""}<small>${esc(c.what)} Needs: ${c.needs.map(n => esc((LAB.skills[n] || { name: n }).name)).join(" + ")}.</small></span></div>`; }).join("");

  /* ---------------- privacy + how */
  const pv = V.privacy;
  $("#priv").innerHTML = [`Everyone is <b>${pv.method === "blur" ? "blurred" : "pixelated"}</b> (${pv.anonymise === "body" ? "whole body" : "head"}) before a frame is shown or saved.`,
    `Frames and crops are <b>${pv.store_frames ? "kept" : "never kept"}</b>: only counts, times and an anonymous heat grid (seconds per spot).`,
    `Track numbers are random per visit: <b>no face recognition</b>, no re-identification across days, no scoring of individuals' behaviour.`,
    `Events are deleted after <b>${pv.retention_days} days</b> (<code>python -m shelly vision purge</code>).`,
    `For a real store: CCTV signage at the door that says what the camera is for, a named privacy officer, and answering access requests (NZ Privacy Act 2020; check the Privacy Commissioner's current guidance on CCTV and biometrics before going live).`,
    `This page uses a <b>synthetic camera</b>: every person here is simulated.`].map(x => `<li>${x}</li>`).join("");
  $("#how").innerHTML = `<p><b>Engine.</b> <code>shelly/vision/engine.py</code> turns tracked people (id + box + time) into numbers: unique visitors after a minimum life, IN/OUT across a line with a dead band and cooldown, zone visits with an exit grace, queue length and wait, staff-only prompts with a grace period and opening hours, and a time-spent heatmap (live map fades with a half-life, day map keeps, both in seconds). Identity switches are re-linked; a person first seen just inside the door counts as having walked in.</p>
    <p><b>Detector.</b> <code>python -m shelly vision run --source store.mp4 --show</code> runs YOLO (Ultralytics) with ByteTrack on any video, webcam or CCTV stream; zones scale to the camera; outputs <code>summary.json</code>, <code>events.jsonl</code>, <code>hourly.csv</code> and the heatmap.</p>
    <p><b>Brain.</b> Five agents in the Shelly Brain (Shelly Intelligence · Vision): Footfall (Sales), Floor (Sales), Queue (Office Manager), Safety &amp; privacy (Management) and the Skill Lab coach (Developers). Go-live of a new skill waits for Pavi.</p>
    <table><tr><th>Typical camera demo</th><th>Store Vision</th></tr>
    <tr><td>Counts boxes in every frame</td><td>Counts each person once (tracking, minimum life, re-linking)</td></tr>
    <tr><td>Heat that only grows ("someone was here")</td><td>Seconds spent, live map fades, day map keeps, absolute scale</td></tr>
    <tr><td>Paths and settings hard-coded, a window and nothing saved</td><td>Config file, any source, CSV/JSON outputs, a web page and a CLI</td></tr>
    <tr><td>No way to know if it's right</td><td>A daily exam against the truth, levels, held-out tuning</td></tr>
    <tr><td>"Suspicious behaviour" scoring of people</td><td>Only staff-only area prompts; no judging individuals</td></tr>
    <tr><td>Raw video on screen</td><td>Anonymised first, frames never stored, retention purge</td></tr></table>`;
  $("#foot").textContent = `Shelly Intelligence · Store Vision v${V.version} · data built ${V.generated} · synthetic camera, no real people`;
})();
