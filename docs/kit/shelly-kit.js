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
  const SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <linearGradient id="skHelm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd8ee"/><stop offset=".55" stop-color="#3a8fb3"/><stop offset="1" stop-color="#1d5470"/></linearGradient>
      <linearGradient id="skCrest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c9ff"/><stop offset="1" stop-color="#7a5bd0"/></linearGradient>
      <linearGradient id="skVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16243a"/><stop offset="1" stop-color="#05080f"/></linearGradient>
      <linearGradient id="skPod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b6f8f"/><stop offset="1" stop-color="#5fb3d3"/></linearGradient>
      <clipPath id="skVclip"><path d="M24 58 Q60 46 96 58 L92 76 Q60 86 28 76 Z"/></clipPath>
    </defs>
    <ellipse cx="60" cy="112" rx="30" ry="4.5" fill="#000" opacity=".35"/>
    <!-- antenna masts with status lights -->
    <path d="M22 50 L14 28" stroke="#5fb3d3" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M98 50 L106 28" stroke="#5fb3d3" stroke-width="2.6" stroke-linecap="round"/>
    <circle class="tip" cx="14" cy="26" r="4"/><circle class="tip" cx="106" cy="26" r="4"/>
    <!-- neck ring -->
    <path d="M38 96 Q60 104 82 96 L80 106 Q60 112 40 106 Z" fill="#1d5470"/>
    <path d="M40 100 Q60 107 80 100" stroke="#8fd8ee" stroke-width="1.2" fill="none" opacity=".5"/>
    <!-- helmet shell -->
    <path d="M60 12 C88 12 102 34 102 58 C102 80 90 98 60 100 C30 98 18 80 18 58 C18 34 32 12 60 12 Z" fill="url(#skHelm)"/>
    <path d="M60 15 C84 15 97 33 98 52" stroke="#c8f1ff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>
    <!-- side pods -->
    <rect x="10" y="50" width="14" height="26" rx="7" fill="url(#skPod)"/><rect x="96" y="50" width="14" height="26" rx="7" fill="url(#skPod)" transform="rotate(180 103 63)"/>
    <circle cx="17" cy="63" r="3" fill="#0b1220"/><circle cx="103" cy="63" r="3" fill="#0b1220"/>
    <circle class="pod" cx="17" cy="63" r="1.6"/><circle class="pod" cx="103" cy="63" r="1.6"/>
    <!-- purple crest fin -->
    <path d="M52 13 Q60 6 68 13 L66 40 Q60 43 54 40 Z" fill="url(#skCrest)"/>
    <path d="M60 10 L60 40" stroke="#5b3fb0" stroke-width="1.2" opacity=".55"/>
    <!-- one wide visor -->
    <path d="M24 58 Q60 46 96 58 L92 76 Q60 86 28 76 Z" fill="url(#skVisor)" stroke="#0b1220" stroke-width="1.6"/>
    <g clip-path="url(#skVclip)">
      <rect class="scan" x="20" y="44" width="80" height="5" fill="#63e0ff" opacity=".22"/>
      <g class="eye"><circle class="eyeglow" cx="45" cy="65" r="5.2"/><circle cx="46.3" cy="63.6" r="1.4" fill="#fff" opacity=".9"/></g>
      <g class="eye"><circle class="eyeglow" cx="75" cy="65" r="5.2"/><circle cx="76.3" cy="63.6" r="1.4" fill="#fff" opacity=".9"/></g>
      <path class="mouth" d="M52 75 L68 75" stroke="#63e0ff" stroke-width="2" stroke-linecap="round" opacity=".8"/>
      <g class="mouth-o" opacity="0" fill="#63e0ff"><rect x="51" y="72" width="2.4" height="6" rx="1"/><rect x="55" y="70" width="2.4" height="10" rx="1"/><rect x="59" y="71" width="2.4" height="8" rx="1"/><rect x="63" y="70" width="2.4" height="10" rx="1"/><rect x="67" y="72" width="2.4" height="6" rx="1"/></g>
      <path d="M30 56 Q50 50 70 52" stroke="#fff" stroke-width="2" fill="none" opacity=".18" stroke-linecap="round"/>
    </g>
    <!-- spiral badge on the brow -->
    <circle cx="60" cy="47" r="5.5" fill="#1d5470" stroke="#d9c9ff" stroke-width="1"/>
    <path d="M60 47 m0 -1 a1 1 0 1 1 -1 1 a2 2 0 1 1 2 2 a3.2 3.2 0 1 1 -3.2 -3.2" fill="none" stroke="#d9c9ff" stroke-width="1.1" stroke-linecap="round"/>
    <!-- chin vents -->
    <path d="M50 90 L70 90 M52 94 L68 94" stroke="#0b1220" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
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
    // portrait avatar (chrome android); the SVG head stays as fallback if the image can't load
    const face = document.createElement("span"); face.className = "sk-face";
    face.innerHTML = `<img alt="" src="${esc(BASE)}kit/shelly-face.png"><i class="sk-ear"></i><i class="sk-shine"></i>`;
    const btn0 = w.querySelector(".sk-btn"); btn0.insertBefore(face, btn0.firstChild);
    face.querySelector("img").addEventListener("load", () => w.classList.add("sk-img"));
    face.querySelector("img").addEventListener("error", () => face.remove());
    if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      window.addEventListener("pointermove", e => {   // gentle tilt toward the cursor
        const r = btn0.getBoundingClientRect();
        const ry = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (innerWidth / 2))) * 16;
        const rx = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (innerHeight / 2))) * -10;
        face.style.setProperty("--ry", ry.toFixed(1) + "deg"); face.style.setProperty("--rx", rx.toFixed(1) + "deg");
      }, { passive: true });
    }
    const bubble = w.querySelector(".sk-bubble"), msg = w.querySelector(".sk-msg"), acts = w.querySelector(".sk-acts");
    let i = 0, timer = null;
    function say(k) {
      const list = messages(); i = (k ?? i) % list.length;
      msg.innerHTML = list[i];
      acts.innerHTML = (open().length ? `<button data-k="tray">Review approvals</button>` : "") +
        (PAGE !== "brain" ? `<a href="${esc(BASE)}brain/">🧠 Brain</a>` : `<a href="${esc(BASE)}launchpad/">⌘ Launchpad</a>`) + `<button data-k="next">Next tip</button>`;
      w.classList.add("talk"); clearTimeout(timer); timer = setTimeout(() => w.classList.remove("talk"), 1600);
    }
    acts.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; if (b.dataset.k === "tray") openTray(); else say(i + 1); });
    w.querySelector(".sk-x").onclick = () => { bubble.hidden = true; try { sessionStorage.setItem("shelly.kit.quiet", "1"); } catch (e) { /* */ } };
    w.querySelector(".sk-btn").onclick = () => {
      if (bubble.hidden) { bubble.hidden = false; try { sessionStorage.removeItem("shelly.kit.quiet"); } catch (e) { /* */ } say(0); }
      else if (open().length) openTray(); else say(i + 1);
    };
    const boot = document.getElementById("boot");
    const start = () => { if (!bubble.hidden) say(0); };
    if (boot && !boot.classList.contains("done")) { w.style.visibility = "hidden";
      const t = setInterval(() => { const b = document.getElementById("boot"); if (!b || b.classList.contains("done")) { clearInterval(t); w.style.visibility = ""; start(); } }, 250);
    } else start();
  }

  function refresh() { paintBadge(); renderTray(); }
  window.addEventListener("shelly:approvals", refresh);
  window.addEventListener("storage", e => { if (e.key === SKEY || e.key === TKEY) refresh(); });
  window.ShellyKit = { openTray, open, answer };
  mascot();
  paintBadge();
  window.dispatchEvent(new CustomEvent("shelly:approvals"));
})();
