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
  const SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><radialGradient id="skBody" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#9fdcf0"/><stop offset="1" stop-color="#3a8fb3"/></radialGradient>
      <radialGradient id="skShell" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#d9c9ff"/><stop offset="1" stop-color="#8b6fd6"/></radialGradient></defs>
    <ellipse cx="60" cy="110" rx="34" ry="5" fill="#000" opacity=".35"/>
    <circle cx="82" cy="62" r="26" fill="url(#skShell)"/>
    <path d="M82 62 m0 -3 a3 3 0 1 1 -3 3 a6 6 0 1 1 6 6 a10 10 0 1 1 -10 -10 a15 15 0 1 1 15 15" fill="none" stroke="#5b3fb0" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>
    <path d="M18 104 C14 80 22 52 44 44 C62 38 70 56 68 74 C66 92 58 104 40 106 Z" fill="url(#skBody)"/>
    <path d="M30 46 C26 34 22 28 18 24" stroke="#3a8fb3" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M44 42 C46 30 48 24 52 18" stroke="#3a8fb3" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle class="tip" cx="18" cy="23" r="4"/><circle class="tip" cx="52" cy="17" r="4"/>
    <g class="eye"><ellipse cx="36" cy="62" rx="6" ry="7.5" fill="#fff"/><circle cx="37.5" cy="63.5" r="3.6" fill="#0b1220"/><circle cx="38.8" cy="61.8" r="1.2" fill="#fff"/></g>
    <g class="eye"><ellipse cx="54" cy="61" rx="6" ry="7.5" fill="#fff"/><circle cx="55.5" cy="62.5" r="3.6" fill="#0b1220"/><circle cx="56.8" cy="60.8" r="1.2" fill="#fff"/></g>
    <ellipse cx="29" cy="74" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".55"/><ellipse cx="60" cy="73" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".55"/>
    <path class="mouth" d="M39 76 Q45 81 51 76" stroke="#0b1220" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth-o" cx="45" cy="78" rx="3.4" ry="2.6" fill="#0b1220" opacity="0"/>
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
