/* Shelly kit: the mascot and one approvals queue across every business.
   Include after data/approvals.js:
     <script src="kit/shelly-kit.js" data-page="store|medical|launchpad|brain|report" data-base="./"></script>
   Approvals share state with the store page (localStorage shelly.decisions.<asof>) and the
   Tōtara page (localStorage shelly-sc-dec), so answering here or there is the same answer. */
(function () {
  "use strict";
  const me = document.currentScript;
  const PAGE = (me && me.dataset.page) || "launchpad";
  const BASE = (me && me.dataset.base) || "";
  const AP = window.SHELLY_APPROVALS || { items: [], store_asof: "" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const SKEY = "shelly.decisions." + AP.store_asof, TKEY = "shelly-sc-dec";
  const money = v => (v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-NZ");

  /* ------------------------------------------------ approvals state */
  function stateOf(it) {
    if (it.source === "store") { const s = ls.get(SKEY, {})[it.id]; return s ? (s.status === "confirmed" ? "y" : "n") : null; }
    const s = ls.get(TKEY, {})[it.id]; return s || null;
  }
  function answer(it, v) {          // v: "y" | "n" | null (undo)
    if (it.source === "store") {
      const s = ls.get(SKEY, {});
      if (v) s[it.id] = { status: v === "y" ? "confirmed" : "rejected", at: new Date().toISOString() }; else delete s[it.id];
      ls.set(SKEY, s);
    } else {
      const s = ls.get(TKEY, {});
      if (v) s[it.id] = v; else delete s[it.id];
      ls.set(TKEY, s);
    }
    window.dispatchEvent(new CustomEvent("shelly:approvals"));
  }
  const open = () => AP.items.filter(it => !stateOf(it));

  /* ------------------------------------------------ badge in the business switch */
  const badge = document.getElementById("apBadge");
  function paintBadge() {
    const n = open().length;
    if (badge) { badge.hidden = false; document.getElementById("apCount").textContent = n; badge.classList.toggle("zero", !n);
      badge.setAttribute("aria-label", `${n} approvals waiting`); }
    const mb = document.querySelector(".sk-badge");
    if (mb) { mb.textContent = n; mb.hidden = !n; }
    const m = document.querySelector(".sk-mascot"); if (m) m.classList.toggle("alert", n > 0);
  }

  /* ------------------------------------------------ tray */
  let filter = "open", tray = null;
  const BIZ = { store: "Neighbourhood store", totara: "Tōtara Medical", group: "Industry packs" };
  function buildTray() {
    tray = document.createElement("div");
    tray.className = "sk-tray"; tray.hidden = true; tray.setAttribute("role", "dialog"); tray.setAttribute("aria-modal", "true"); tray.setAttribute("aria-label", "Approvals");
    tray.innerHTML = `<div class="sk-panel" style="position:relative"><button class="sk-close" aria-label="Close">×</button>
      <div class="sk-head"><h2>Approvals</h2><p>Every proposal from every Shelly agent, in one place. Nothing happens until you approve it.</p>
      <div class="sk-filters" role="group" aria-label="Filter">
        <button data-f="open" aria-pressed="true">Waiting</button><button data-f="store" aria-pressed="false">🛒 Store</button>
        <button data-f="totara" aria-pressed="false">✚ Tōtara</button><button data-f="group" aria-pressed="false">◎ Packs</button>
        <button data-f="done" aria-pressed="false">Answered</button></div></div>
      <div class="sk-list" id="skList"></div>
      <div class="sk-foot">Answers are kept on this device and shared by every Shelly page. To let Shelly learn from them, use “⬇ Download” under Decisions on the store page and import it on your computer.</div></div>`;
    document.body.appendChild(tray);
    tray.addEventListener("click", e => {
      if (e.target === tray || e.target.closest(".sk-close")) return closeTray();
      const f = e.target.closest("[data-f]"); if (f) { filter = f.dataset.f; renderTray(); return; }
      const b = e.target.closest("[data-a]"); if (!b) return;
      const it = AP.items.find(x => x.key === b.dataset.k); if (!it) return;
      answer(it, b.dataset.a === "u" ? null : b.dataset.a);
    });
    tray.addEventListener("keydown", e => { if (e.key === "Escape") closeTray(); });
  }
  function renderTray() {
    if (!tray) return;
    tray.querySelectorAll("[data-f]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
    let list = AP.items;
    if (filter === "open") list = open();
    else if (filter === "done") list = AP.items.filter(stateOf);
    else list = AP.items.filter(it => it.business === filter && !stateOf(it));
    tray.querySelector("#skList").innerHTML = list.length ? list.map(it => {
      const st = stateOf(it);
      return `<div class="sk-item ${st ? "done" : ""}"><div class="k"><span class="sk-pill ${esc(it.business)}">${esc(BIZ[it.business] || it.business)}</span>
        <span>${esc(it.area)}</span><span>· ${esc(String(it.agent).replace(/^(store|totara|group)-/, "").replace(/-/g, " "))} agent</span></div>
        <div class="t">${esc(it.title)}</div>${it.text ? `<div class="x">${esc(it.text)}</div>` : ""}
        <div class="r">${st ? `<span class="st ${st}">${st === "y" ? "✓ Approved" : "✕ Rejected"}</span><button data-a="u" data-k="${esc(it.key)}">Undo</button>`
          : `<button class="yes" data-a="y" data-k="${esc(it.key)}">✓ Approve</button><button class="no" data-a="n" data-k="${esc(it.key)}">✕ Reject</button>`}
          <a href="${esc(BASE + it.link)}">Open ›</a>${typeof it.impact === "number" ? `<span class="imp">${esc(money(it.impact))}/wk</span>` : ""}</div></div>`;
    }).join("") : `<p class="sk-empty">${filter === "done" ? "Nothing answered yet." : "Nothing waiting. Nice work."}</p>`;
  }
  let lastFocus = null;
  function openTray(f) { if (!tray) buildTray(); filter = f || "open"; renderTray(); tray.hidden = false; lastFocus = document.activeElement; tray.querySelector(".sk-close").focus(); }
  function closeTray() { if (tray) tray.hidden = true; if (lastFocus) lastFocus.focus(); }
  if (badge) badge.addEventListener("click", () => openTray());

  /* ------------------------------------------------ mascot */
  /* Shelly Mk-II: original helmet head (teal shell, purple crest, one wide visor, spiral emblem) */
  /* static bulb (shown until the live canvas character takes over) */
  const SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><radialGradient id="skG" cx="42%" cy="35%" r="70%"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#ffd76a"/></radialGradient></defs>
    <path d="M46 84 L41 70 A33 33 0 1 1 79 70 L74 84 Z" fill="url(#skG)" stroke="#fff" stroke-opacity=".4"/>
    <rect x="45" y="84" width="30" height="16" rx="4" fill="#9aa3ae"/><path d="M52 100 h16 l-3 6 h-10z" fill="#2b2f36"/>
    <ellipse cx="50" cy="46" rx="4" ry="5.5" fill="#2b2114"/><ellipse cx="70" cy="46" rx="4" ry="5.5" fill="#2b2114"/>
    <path d="M54 58 Q60 63 66 58" stroke="#2b2114" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`;
  function greeting() {
    const h = new Date().getHours();
    const part = h >= 5 && h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Hello";
    let name = "Pavi"; try { const n = JSON.parse(localStorage.getItem("shelly.callMe") || '"Pavi"'); if (/^[\p{L} .'-]{1,20}$/u.test(n)) name = n; } catch (e) { /* */ }
    return `${part}, ${esc(name)}`;
  }
  function messages() {
    const n = open().length, by = b => open().filter(i => i.business === b).length;
    const ask = n ? `I've got <b>${n} approvals</b> waiting: ${by("store")} store, ${by("totara")} Tōtara, ${by("group")} packs.` : "Nothing is waiting for your approval.";
    const M = {
      launchpad: [`${greeting()}! I'm Shelly. ${ask}`, "Tap 🛒 or ✚ at the top to switch business. 🧠 Brain shows every agent I run."],
      store: [`${greeting()}! ${ask}`, "Ask me for any report: “make a budget for the next 3 months”."],
      medical: [`${greeting()}! Welcome to Tōtara Medical. ${ask}`, "Tap any tile or pipeline step to open the detail behind the number."],
      brain: [`This is my brain: every department and agent, and what each may do on its own. ${ask}`, "Tap an agent to see its skills, data, schedule, rules and who it reports to."],
      report: [ask, "Print for white paper, Dark for the Shelly look, Present for one section per screen."],
    };
    return M[PAGE] || M.launchpad;
  }
  let hidden = false; try { hidden = sessionStorage.getItem("shelly.kit.quiet") === "1"; } catch (e) { /* */ }
  function mascot() {
    const w = document.createElement("div");
    w.className = "sk-mascot";
    w.innerHTML = `<button class="sk-btn" type="button" aria-label="Shelly: tap for approvals and tips">${SVG}<span class="sk-badge" hidden>0</span></button>
      <div class="sk-bubble" role="status" aria-live="polite" ${hidden ? "hidden" : ""}><button class="sk-x" aria-label="Hide message">×</button><div class="sk-msg"></div><div class="sk-acts"></div></div>`;
    document.body.appendChild(w);
    // live light-bulb character (Canvas 2D, drawn every frame); the static SVG bulb is the fallback
    const btn0 = w.querySelector(".sk-btn");
    const cv = document.createElement("canvas"); cv.className = "sk-bulb"; btn0.insertBefore(cv, btn0.firstChild);
    const bubble = w.querySelector(".sk-bubble"), msg = w.querySelector(".sk-msg"), acts = w.querySelector(".sk-acts");
    const L = life(w, btn0, bubble);
    try { bulb(cv, w, btn0, L); } catch (e) { cv.remove(); }
    try {   // real 3D bulb when WebGL2 is available; the 2D bulb above stays as the fallback
      const c3 = document.createElement("canvas"); c3.className = "sk-bulb sk-bulb3d"; c3.hidden = true; btn0.insertBefore(c3, btn0.firstChild);
      import(new URL(BASE + "kit/shelly-bulb3d.js", location.href).href)
        .then(m => { if (m.mount(c3, w, btn0, L)) c3.hidden = false; else c3.remove(); })
        .catch(() => c3.remove());
    } catch (e) { /* 2D bulb */ }
    let i = 0, timer = null;
    function say(k) {
      const list = messages(); i = (k ?? i) % list.length;
      msg.innerHTML = list[i];
      acts.innerHTML = (open().length ? `<button data-k="tray">Review approvals</button>` : "") +
        (PAGE !== "brain" ? `<a href="${esc(BASE)}brain/">🧠 Brain</a>` : `<a href="${esc(BASE)}launchpad/">⌘ Launchpad</a>`) + `<button data-k="next">Next tip</button><button data-k="snd" aria-pressed="${L.soundOn()}">${L.soundOn() ? "🔊" : "🔈"} Sound</button>`;
      w.classList.add("talk"); clearTimeout(timer); timer = setTimeout(() => w.classList.remove("talk"), 1600);
      L.react("talk");
    }
    acts.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; if (b.dataset.k === "tray") openTray(); else if (b.dataset.k === "snd") { L.toggleSound(); b.setAttribute("aria-pressed", String(L.soundOn())); b.textContent = (L.soundOn() ? "🔊" : "🔈") + " Sound"; } else say(i + 1); });
    w.querySelector(".sk-x").onclick = () => { bubble.hidden = true; try { sessionStorage.setItem("shelly.kit.quiet", "1"); } catch (e) { /* */ } };
    let pendingClick = 0;
    w.querySelector(".sk-btn").onclick = () => {
      // squish now; act a moment later so a fast triple-click can make her dizzy instead
      clearTimeout(pendingClick);
      if (L.click()) return;
      pendingClick = setTimeout(() => {
        if (bubble.hidden) { bubble.hidden = false; try { sessionStorage.removeItem("shelly.kit.quiet"); } catch (e) { /* */ } say(0); }
        else if (open().length) openTray(); else say(i + 1);
      }, 300);
    };
    const boot = document.getElementById("boot");
    const start = () => { if (!bubble.hidden) say(0); };
    if (boot && !boot.classList.contains("done")) { w.style.visibility = "hidden";
      const t = setInterval(() => { const b = document.getElementById("boot"); if (!b || b.classList.contains("done")) { clearInterval(t); w.style.visibility = ""; start(); } }, 250);
    } else start();
  }


  /* ------------------------------------------------ life: reactions with spring physics (idea from Coucou's Mochi; own code + sounds)
     breathe · hover → peek out and wave · click → squish · fast triple-click → dizzy · approval answered → happy jump
     new approval → alert hop · long idle → sleepy, tucks down · file dropped on her → gulp · emotes above her head */
  function life(w, btn, bubble) {
    const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = { y: 0, vy: 0, sx: 1, vsx: 0, sy: 1, vsy: 0, r: 0, vr: 0 };   // springs: offset px, scale x/y, rotation rad
    let moodN = "", moodUntil = 0; const setMood = (n, ms) => { moodN = n; moodUntil = performance.now() + ms; };
    let tuck = 0, dizzyUntil = 0, sleepy = false, lastAct = performance.now(), clicks = [], lastWave = -1e9;
    const emo = document.createElement("span"); emo.className = "sk-emote"; emo.setAttribute("aria-hidden", "true"); btn.appendChild(emo);
    let emoT = 0;
    function emote(t, ms = 1500) { emo.textContent = t; emo.classList.remove("pop"); void emo.offsetWidth; emo.classList.add("pop"); clearTimeout(emoT); emoT = setTimeout(() => emo.classList.remove("pop"), ms); }

    /* sounds: tiny synthesized blips (no files), off until the viewer turns them on */
    let ac = null, snd = false; try { snd = localStorage.getItem("shelly.kit.sound") === "1"; } catch (e) { /* */ }
    function tone(seq) {
      if (!snd) return;
      try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t0 = ac.currentTime;
        seq.forEach(([f0, f1, d, at = 0, type = "sine", vol = 0.06]) => { const o = ac.createOscillator(), g = ac.createGain();
          o.type = type; o.frequency.setValueAtTime(f0, t0 + at); o.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
          g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
          o.connect(g).connect(ac.destination); o.start(t0 + at); o.stop(t0 + at + d + 0.02); });
      } catch (e) { /* no audio */ }
    }
    const SND = {
      pop: [[520, 880, 0.12]], squish: [[300, 170, 0.14, 0, "triangle"]], happy: [[660, 990, 0.1], [880, 1320, 0.14, 0.1]],
      alert: [[880, 880, 0.07, 0, "square", 0.03], [880, 880, 0.07, 0.12, "square", 0.03]], dizzy: [[700, 300, 0.5, 0, "sine", 0.05]],
      gulp: [[240, 120, 0.16, 0, "triangle"], [500, 760, 0.1, 0.18]], wave: [[740, 980, 0.09], [980, 740, 0.09, 0.1]],
    };

    function kick(o) { Object.keys(o).forEach(k => { S[k] += o[k]; }); }
    function wake() { lastAct = performance.now(); if (sleepy) { sleepy = false; w.classList.remove("sleepy"); kick({ vy: -260, vsy: 2 }); setMood("alert", 900); emote("❗", 900); } }
    const R = {
      talk: () => kick({ vy: -120, vsy: 1.2, vsx: -0.8 }),
      squish: () => { kick({ vsx: 4.5, vsy: -5 }); setMood("annoyed", 450); tone(SND.squish); },
      happy: () => { kick({ vy: -520, vsy: 3, vsx: -2 }); setMood("happy", 1700); emote(open().length ? "✨" : "🎉", 1600); tone(SND.happy); },
      alert: () => { kick({ vy: -260, vr: 6 }); setMood("alert", 1300); emote("❗", 1300); tone(SND.alert); },
      dizzy: () => { dizzyUntil = performance.now() + 3200; emote("😵‍💫", 3200); tone(SND.dizzy); w.classList.add("dizzy"); setTimeout(() => w.classList.remove("dizzy"), 3200); },
      wave: () => { kick({ vy: -200, vr: -5 }); setMood("wink", 1300); emote("👋", 1400); tone(SND.wave); },
      gulp: () => { kick({ vsx: 6, vsy: -7 }); setMood("gulp", 700); setTimeout(() => { kick({ vy: -380, vsy: 3 }); setMood("happy", 1300); emote("😋", 1500); }, 260); tone(SND.gulp); },
    };
    function react(k) { if (still && k !== "dizzy") { if (k === "happy") emote("🎉"); if (k === "alert") emote("❗"); return; } if (R[k]) R[k](); }

    /* events */
    btn.addEventListener("pointerenter", () => { wake(); const now = performance.now(); if (tuck > 0.2 || now - lastWave > 20000) { lastWave = now; react("wave"); } });
    addEventListener("pointermove", wake, { passive: true }); addEventListener("keydown", wake); addEventListener("scroll", wake, { passive: true });
    let prevOpen = open().length;
    addEventListener("shelly:approvals", () => { const n = open().length; if (n < prevOpen) react("happy"); else if (n > prevOpen) react("alert"); prevOpen = n; });
    ["dragenter", "dragover"].forEach(ev => btn.addEventListener(ev, e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); w.classList.add("hungry"); } }));
    btn.addEventListener("dragleave", () => w.classList.remove("hungry"));
    btn.addEventListener("drop", e => {
      e.preventDefault(); w.classList.remove("hungry");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
      react("gulp");   // the file is never read or uploaded: the public site only uses synthetic data
      const m = w.querySelector(".sk-msg"); if (m) { bubble.hidden = false;
        m.innerHTML = `Yum, <b>${esc(f.name)}</b>! I don't read files on the public site (synthetic data only). On your PC run <code>python -m shelly check "${esc(f.name)}"</code> and I'll map its columns and build reports from it.`; }
    });

    /* loop */
    let last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
      const idle = now - lastAct;
      if (!sleepy && idle > 60000 && !open().length) { sleepy = true; w.classList.add("sleepy"); }
      if (sleepy && Math.floor(t) % 4 === 0 && !emo.classList.contains("pop")) emote("💤", 1800);
      const wantTuck = sleepy && bubble.hidden ? 0.55 : 0; tuck += (wantTuck - tuck) * Math.min(1, dt * 3);
      const breathe = still ? 0 : Math.sin(t * (sleepy ? 1.2 : 2.2)) * (sleepy ? 0.03 : 0.018);
      const dz = now < dizzyUntil && !still;
      const tr = dz ? Math.sin(t * 11) * 0.28 : 0;
      // spring toward rest (stiffness k, damping c)
      const k = 170, c = 11;
      S.vy += (k * (0 - S.y) - c * S.vy) * dt; S.y += S.vy * dt;
      S.vsx += (k * (1 - breathe - S.sx) - c * S.vsx) * dt; S.sx += S.vsx * dt;
      S.vsy += (k * (1 + breathe - S.sy) - c * S.vsy) * dt; S.sy += S.vsy * dt;
      S.vr += (k * (tr - S.r) - c * S.vr) * dt; S.r += S.vr * dt;
      const h = btn.offsetHeight || 64;
      btn.style.transform = `translateY(${(S.y + tuck * h).toFixed(1)}px) rotate(${S.r.toFixed(3)}rad) scale(${S.sx.toFixed(3)},${S.sy.toFixed(3)})`;
    }
    requestAnimationFrame(frame);

    return {
      react, emote, soundOn: () => snd, mood: () => (performance.now() < moodUntil ? moodN : ""),
      toggleSound() { snd = !snd; try { localStorage.setItem("shelly.kit.sound", snd ? "1" : "0"); } catch (e) { /* */ } if (snd) tone(SND.pop); },
      click() {   // returns true when the click was used up by a reaction
        wake(); const now = performance.now(); clicks = clicks.filter(x => now - x < 650); clicks.push(now);
        if (clicks.length >= 3) { clicks = []; react("dizzy"); return true; }
        react("squish"); return false;
      },
    };
  }

  /* ------------------------------------------------ Shelly the light bulb: drawn live (eyes follow the cursor, blinks, moods; light shows status) */
  function bulb(cv, w, btn, L) {
    const g = cv.getContext("2d"); if (!g) throw new Error("no 2d");
    const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    w.classList.add("sk-drawn");
    let lx = 0, ly = 0, tx = 0, ty = 0, blinkAt = 2500, blinkEnd = 0, light = 0.8, last = 0;
    addEventListener("pointermove", e => { const r = btn.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 260)); ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 260)); }, { passive: true });
    const COL = { warm: [255, 215, 106], amber: [255, 165, 58], bright: [255, 246, 190], green: [127, 209, 168], cool: [120, 220, 255] };
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const INK = "#2b2114";
    function eye(x, y, kind, t, blink) {
      g.save(); g.translate(x, y); g.lineCap = "round"; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.6;
      if (kind === "happy") { g.beginPath(); g.arc(0, 2, 4.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      else if (kind === "closed") { g.beginPath(); g.arc(0, -1, 4.4, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
      else if (kind === ">" || kind === "<") { const s = kind === ">" ? 1 : -1; g.beginPath(); g.moveTo(-3.5 * s, -4); g.lineTo(3.5 * s, 0); g.lineTo(-3.5 * s, 4); g.stroke(); }
      else if (kind === "spiral") { g.rotate(t * 9); g.lineWidth = 1.8; g.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 4, r = k / 40 * 5.2; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(0, 0); } g.stroke(); }
      else { const big = kind === "big" ? 1.22 : 1;
        g.beginPath(); g.ellipse(lx * 2.4, ly * 2.2, 4.2 * big, 5.6 * big * blink, 0, 0, Math.PI * 2); g.fill();
        if (blink > 0.5) { g.fillStyle = "#fff"; g.beginPath(); g.arc(lx * 2.4 + 1.5, ly * 2.2 - 2.1 * big, 1.4 * big, 0, 7); g.fill(); } }
      g.restore();
    }
    function frame(now) {
      requestAnimationFrame(frame);
      if (w.classList.contains("sk-3d")) return;   // the 3D bulb has taken over
      const css = btn.clientWidth || 64, dpr = Math.min(devicePixelRatio || 1, 3), px = Math.round(css * 1.5 * dpr);
      if (cv.width !== px) { cv.width = cv.height = px; }
      const t = now / 1000, dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      lx += (tx - lx) * Math.min(1, dt * 8); ly += (ty - ly) * Math.min(1, dt * 8);
      const cls = w.classList, mood = L.mood(), sleepy = cls.contains("sleepy"), dizzy = cls.contains("dizzy"), talk = cls.contains("talk");
      const alert = cls.contains("alert"), hungry = cls.contains("hungry");
      // light level and colour = status
      let want = 0.78 + (still ? 0 : Math.sin(t * 2.2) * 0.04), col = COL.warm;
      if (alert) { col = COL.amber; want = 0.72 + (still ? 0.1 : 0.22 * (0.5 + 0.5 * Math.sin(t * 4))); }
      if (talk) want = Math.max(want, 0.95);
      if (mood === "happy") { col = COL.bright; want = 1.25; }
      if (hungry) { col = COL.green; want = 1; }
      if (dizzy) want = still ? 0.6 : (Math.random() < 0.18 ? 0.25 : 0.95);
      if (sleepy) { want = 0.06; }
      light += (want - light) * Math.min(1, dt * (dizzy ? 30 : 6));
      if (!still && now > blinkAt) { blinkEnd = now + 130; blinkAt = now + 2600 + Math.random() * 3200; }
      const blink = now < blinkEnd ? 0.12 : 1;

      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      const k = cv.width / 150; g.setTransform(k, 0, 0, k, cv.width / 2, cv.width / 2 + 4 * k);
      // halo
      const L0 = Math.max(0, Math.min(1.3, light));
      const halo = g.createRadialGradient(0, -12, 10, 0, -12, 72); halo.addColorStop(0, rgba(col, 0.5 * L0)); halo.addColorStop(1, rgba(col, 0));
      g.fillStyle = halo; g.beginPath(); g.arc(0, -12, 72, 0, 7); g.fill();
      // glass
      g.beginPath(); g.moveTo(-14, 24); g.lineTo(-19, 10); g.arc(0, -12, 33, 2.284, 0.858, false); g.lineTo(14, 24); g.closePath();
      const lit = Math.min(1, L0), gl = g.createRadialGradient(-9, -22, 3, 0, -10, 42);
      const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
      gl.addColorStop(0, rgba(mix([92, 100, 112], [255, 252, 236], lit), 0.97)); gl.addColorStop(1, rgba(mix([40, 46, 56], col, lit), 0.95));
      g.fillStyle = gl; g.fill(); g.lineWidth = 1.4; g.strokeStyle = "rgba(255,255,255,.38)"; g.stroke();
      // highlight
      g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 3.4; g.lineCap = "round"; g.beginPath(); g.arc(-4, -14, 24, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
      g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.arc(-21, -21, 1.8, 0, 7); g.fill();
      // filament
      g.save(); g.lineWidth = 1.5; g.strokeStyle = lit > 0.3 ? "#fff6c8" : "#7a7f88"; if (lit > 0.3) { g.shadowColor = rgba(col, 1); g.shadowBlur = 8 * lit; }
      g.beginPath(); g.moveTo(-5, 24); g.lineTo(-6, 15); for (let q = 0; q <= 12; q++) g.lineTo(-6 + q, 15 + (q % 2 ? -2.2 : 0)); g.lineTo(5, 24); g.stroke(); g.restore();
      // base (screw)
      const mb = g.createLinearGradient(-14, 0, 14, 0); mb.addColorStop(0, "#6c7480"); mb.addColorStop(0.45, "#d7dce3"); mb.addColorStop(1, "#5b626d");
      g.fillStyle = mb; g.beginPath(); g.roundRect ? g.roundRect(-14.5, 23, 29, 17, 4) : g.rect(-14.5, 23, 29, 17); g.fill();
      g.strokeStyle = "rgba(30,34,40,.55)"; g.lineWidth = 1.3; [28.5, 33.5].forEach(y => { g.beginPath(); g.moveTo(-14, y); g.lineTo(14, y + 1.2); g.stroke(); });
      g.fillStyle = "#2b2f36"; g.beginPath(); g.moveTo(-8, 40); g.lineTo(8, 40); g.lineTo(5, 46); g.lineTo(-5, 46); g.closePath(); g.fill();
      // face
      const fy = -15;
      let le = "dot", re = "dot";
      if (sleepy) le = re = "closed";
      else if (dizzy) le = re = "spiral";
      else if (mood === "happy" || mood === "gulp") le = re = "happy";
      else if (mood === "annoyed") { le = ">"; re = "<"; }
      else if (mood === "alert" || hungry) le = re = "big";
      else if (mood === "wink") re = "happy";
      eye(-10, fy, le, t, blink); eye(10, fy, re, t, blink);
      // cheeks
      g.fillStyle = `rgba(255,120,140,${mood === "happy" || mood === "gulp" ? 0.5 : 0.28})`;
      [[-17, -6], [17, -6]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, mood === "gulp" ? 5.5 : 4, mood === "gulp" ? 4 : 2.6, 0, 0, 7); g.fill(); });
      // mouth
      g.save(); g.translate(lx * 1.5, -4 + ly * 1.2); g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.4; g.lineCap = "round";
      if (sleepy) { g.beginPath(); g.ellipse(0, 1, 2.2, 1.6 + (still ? 0 : Math.abs(Math.sin(t * 1.2))), 0, 0, 7); g.fill(); }
      else if (dizzy || mood === "annoyed") { g.beginPath(); for (let q = -6; q <= 6; q++) g[q === -6 ? "moveTo" : "lineTo"](q, Math.sin(q * 1.3 + t * (dizzy ? 10 : 0)) * 1.4); g.stroke(); }
      else if (hungry) { g.beginPath(); g.ellipse(0, 1, 6, 5, 0, 0, 7); g.fill(); }
      else if (mood === "gulp") { g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.stroke(); }
      else if (mood === "alert") { g.beginPath(); g.ellipse(0, 1, 2.6, 3, 0, 0, 7); g.fill(); }
      else if (talk && !still) { g.beginPath(); g.ellipse(0, 1, 4, 1.2 + 2.6 * Math.abs(Math.sin(t * 13)), 0, 0, 7); g.fill(); }
      else if (mood === "happy") { g.beginPath(); g.arc(0, -1, 6.2, 0.05 * Math.PI, 0.95 * Math.PI); g.closePath(); g.fill();
        g.fillStyle = "#ff8fa3"; g.beginPath(); g.ellipse(0, 3.2, 2.6, 1.4, 0, 0, 7); g.fill(); }
      else { g.beginPath(); g.arc(0, -2.5, 5, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke(); }
      g.restore();
      // sleepy z
      if (sleepy && !still) { g.fillStyle = `rgba(200,210,230,${0.4 + 0.4 * Math.sin(t * 1.5)})`; g.font = "bold 11px system-ui"; g.fillText("z", 26 + Math.sin(t) * 2, -40 - (t * 6 % 12)); }
    }
    requestAnimationFrame(frame);
  }

  function refresh() { paintBadge(); renderTray(); }
  window.addEventListener("shelly:approvals", refresh);
  window.addEventListener("storage", e => { if (e.key === SKEY || e.key === TKEY) refresh(); });
  window.ShellyKit = { openTray, open, answer };
  mascot();
  paintBadge();
  window.dispatchEvent(new CustomEvent("shelly:approvals"));
})();
