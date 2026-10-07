/* Shelly guide: move the bulb anywhere, or let her follow you through the page.
   - Drag her anywhere (mouse or finger). She stays there ("Stay here" mode) until you call her back.
   - 🧭 Guide me: as you scroll she glides beside the section you're reading and tells you what it is,
     with this week's numbers where she has them. Rest the pointer on a section, chart, tile or report
     for a moment and she flies over, looks at it and explains it. "Ask Shelly" sends a question to the
     chat on the store page; elsewhere "More" shows the section's own "What is this?" text.
   - 🏠 Home puts her back in the corner. Everything is remembered on this device only. */
const askFn = () => (window.Shelly && typeof window.Shelly.ask === "function" ? window.Shelly.ask : null);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const trimTo = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const cut = s.slice(0, n); const p = cut.lastIndexOf(". "); return (p > n * .5 ? cut.slice(0, p + 1) : cut.replace(/\s+\S*$/, "") + "…"); };

/* store page: a live line and a question that the chat answers well, per section */
function storeLines() {
  const D = window.SHELLY_DATA; if (!D) return {};
  const K = D.kpis || {}, money = v => "$" + Math.round(Math.abs(v)).toLocaleString("en-NZ"), pc = v => (v > 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  const cats = [...(D.categories || [])].sort((a, b) => (a.vs_budget ?? 0) - (b.vs_budget ?? 0));
  const top = (D.actions || [])[0], exc = D.exceptions || [], best = (D.models || [])[0] || {};
  return {
    "chat": ["Type or say anything about the store: sales, stock, waste, roster, any product or category.", "What should I do today?"],
    "s-kpi": [`Sales were <b>${money(K.sales || 0)}</b> this week (${pc(K.wow_pct ?? 0)} on last week), margin ${K.gm_pct ?? "–"}%. Tap any number and I'll explain it.`, "How did sales go this week?"],
    "s-reports": ["Every report opens on screen, as a PDF and as an Excel workbook. Just ask in words, like “make a budget for the next 3 months”.", "Make a weekly trading report"],
    "s-act": [top ? `Start with <b>${top.action}</b>${top.weekly_impact_nzd ? ` (about ${money(top.weekly_impact_nzd)} a week)` : ""}. ${(D.actions || []).length} actions are ranked by urgency and $ impact.` : "Today's to-do list, ranked.", "What should I do today?"],
    "s-dec": [`${(D.decisions || []).length} big calls wait for you here: confirm or reject each one, I only suggest.`, "What should I do today?"],
    "s-perf": ["The daily sales line with next week's forecast dashed, what moved sales against last week, and the delivery apps day by day.", "How did sales go this week?"],
    "s-cat": [cats[0] ? `<b>${cats[0].category}</b> is furthest behind budget (${money(cats[0].vs_budget)} short); tap a bar to ask about any category.` : "Each category against budget.", cats[0] ? `How is ${cats[0].category} doing?` : "How are categories doing?"],
    "s-exc": [`${exc.length} things look unusual this week${exc[0] ? `, starting with <b>${exc[0].item.replace(/_/g, " ")}</b>: ${exc[0].detail}` : ""}.`, "Any problems this week?"],
    "s-ops": ["What to order today (reorder point = lead-time demand + safety stock) and the roster for the next 7 days.", "What do I need to order?"],
    "s-whatif": ["Move the sliders to see what a price change, less waste or fewer delivery outages would do to margin.", "What if we raise prices 2%?"],
    "s-packs": ["The same engine on other industries: electronics, wholesale, warehousing and production.", "How is the wholesale pack doing?"],
    "s-seg": ["Products grouped by how they behave: speed, margin, volatility, waste, delivery share and promo response.", "Tell me about product segments"],
    "s-mod": [`Five models compete on every category; ${best.model || "the best"} wins overall with ${best.wape ?? "–"}% average error (WAPE).`, "How accurate are the forecasts?"],
    "s-method": ["How I work end to end, and the data checks I run before any number reaches you.", "How good is the data?"],
  };
}

export function start(K) {
  const { w, btn, bubble, msg, acts, L, esc, PAGE } = K;
  const fine = matchMedia("(pointer: fine)").matches, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = LS.get("shelly.kit.mode", "guide");          // "guide" follows you · "stay" keeps her where you put her
  const LINES = PAGE === "store" ? storeLines() : {};
  const quiet = () => { try { return sessionStorage.getItem("shelly.kit.quiet") === "1"; } catch (e) { return false; } };

  /* ---------- placing her */
  const SZ = () => btn.offsetWidth || 64;
  function place(x, y, glide) {
    const s = SZ(); x = clamp(x, 8, innerWidth - s - 8); y = clamp(y, 64, innerHeight - s - 12);
    w.classList.add("sk-placed"); w.classList.toggle("sk-flip", x > innerWidth / 2); w.classList.toggle("sk-low", y < 230);
    w.style.transition = glide && !still ? "left .7s cubic-bezier(.3,.8,.25,1), top .7s cubic-bezier(.3,.8,.25,1)" : "none";
    w.style.left = x + "px"; w.style.top = y + "px"; w.style.bottom = "auto";
    if (glide && !still) { L.react("talk"); }
    cur = { x, y };
  }
  let cur = null;
  function home() { w.classList.remove("sk-placed", "sk-flip", "sk-low"); w.style.left = w.style.top = w.style.bottom = w.style.transition = ""; cur = null; }
  function look(el) {   // turn her eyes toward something (the bulbs follow the pointer; give them a point)
    const r = el.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 160), y = r.top + Math.min(r.height / 2, 60);
    try { dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y })); } catch (e) { /* old browser */ }
  }

  /* ---------- dragging */
  let drag = null, dragged = 0;
  btn.style.touchAction = "none";
  btn.addEventListener("pointerdown", e => { if (e.button) return; drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, ox: 0, oy: 0 }; });
  addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) {
      drag.on = true; btn.setPointerCapture(e.pointerId); const r = btn.getBoundingClientRect(); drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top;
      w.classList.add("sk-drag"); L.emote("✋", 900);
    }
    if (drag.on) place(e.clientX - drag.ox, e.clientY - drag.oy, false);
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return; const was = drag.on; drag = null; w.classList.remove("sk-drag");
    if (!was) return;
    dragged = performance.now(); mode = "stay"; LS.set("shelly.kit.mode", mode); LS.set("shelly.kit.pos", { x: cur.x / innerWidth, y: cur.y / innerHeight });
    L.react("happy"); show(`I'll stay here. Drag me anywhere, or tap <b>🧭 Guide me</b> and I'll follow you through the page.`, [["guide", "🧭 Guide me"], ["home", "🏠 Home"]]);
  };
  addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);
  btn.addEventListener("click", e => { if (performance.now() - dragged < 400) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  // keyboard: arrows move her when she has focus
  btn.addEventListener("keydown", e => { const d = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key]; if (!d) return;
    e.preventDefault(); const r = btn.getBoundingClientRect(); place(r.left + d[0], r.top + d[1], false); mode = "stay"; LS.set("shelly.kit.mode", mode); LS.set("shelly.kit.pos", { x: cur.x / innerWidth, y: cur.y / innerHeight }); });

  /* ---------- speaking in the bubble */
  let pending = null;
  function show(html, buttons) {
    bubble.hidden = false; msg.innerHTML = html;
    acts.innerHTML = buttons.map(([k, label, q]) => `<button type="button" data-g="${k}"${q ? ` data-q="${esc(q)}"` : ""}>${label}</button>`).join("");
    w.classList.add("talk"); clearTimeout(show.t); show.t = setTimeout(() => w.classList.remove("talk"), 1500);
  }
  acts.addEventListener("click", e => {
    const b = e.target.closest("[data-g]"); if (!b) return; const k = b.dataset.g;
    if (k === "guide") { mode = "guide"; LS.set("shelly.kit.mode", mode); lastSec = null; follow(true); }
    else if (k === "stay") { mode = "stay"; LS.set("shelly.kit.mode", mode); show("OK, I'll stay put. Drag me wherever you like.", [["guide", "🧭 Guide me"], ["home", "🏠 Home"]]); }
    else if (k === "home") { mode = "stay"; LS.set("shelly.kit.mode", mode); LS.set("shelly.kit.pos", null); home(); show("Back in my corner. Tap <b>🧭 Guide me</b> any time.", [["guide", "🧭 Guide me"]]); }
    else if (k === "ask" && askFn()) { const chat = document.getElementById("chat"); if (chat) chat.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }); askFn()(b.dataset.q); }
    else if (k === "more" && pending) { const el = pending.querySelector("details.about"); if (el) { el.open = true; el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" }); } }
  });

  /* ---------- what's on the page */
  const SKIP = el => el.closest(".sk-mascot, .sk-tray, #boot, nav.biz, footer");
  const sections = () => [...document.querySelectorAll("section, [data-guide]")].filter(s => !SKIP(s) && s.offsetHeight > 90);
  const titleOf = el => (el.dataset && el.dataset.guide) || (el.querySelector(":scope > h2, :scope > h3, :scope > .ph .t, :scope > header h2, .sec-h h2, h2, h3") || {}).textContent || el.getAttribute("aria-label") || "";
  const aboutOf = el => { const a = el.querySelector("details.about p") || el.querySelector(".sub, p.note, p.small, p");
    return a ? trimTo(a.textContent, 230) : ""; };
  function explain(el, sec) {
    sec = sec || el.closest("section") || el; pending = sec;
    const id = sec.id, line = LINES[id], isSec = el === sec;
    const name = trimTo(titleOf(el), 60) || trimTo(titleOf(sec), 60) || "this part";
    let html;
    if (isSec) html = `<b>${esc(name)}</b>${/[.?!]$/.test(name) ? "" : "."} ${line ? line[0] : esc(aboutOf(sec)) || "Tap around and I'll explain what you're looking at."}`;
    else { const own = trimTo((el.querySelector(".small, .note, p") || {}).textContent || "", 180);
      html = `<b>${esc(name)}</b>${own ? `: ${esc(own)}` : ""}${!own && line ? ` ${line[0]}` : ""}${!own && !line ? ` (part of ${esc(trimTo(titleOf(sec), 40))}). ${esc(aboutOf(sec))}` : ""}`; }
    const btns = [];
    if (line && askFn()) btns.push(["ask", "💬 Ask Shelly", line[1]]);
    if (sec.querySelector("details.about")) btns.push(["more", "📖 More"]);
    btns.push(mode === "guide" ? ["stay", "📌 Stay here"] : ["guide", "🧭 Guide me"]);
    show(html, btns);
  }
  function besideEl(el) {   // park next to an element: in the margin if there is one, else at the right edge level with its top
    const r = el.getBoundingClientRect(), s = SZ();
    const right = innerWidth - r.right > s + 30, left = r.left > s + 30;
    const x = right ? r.right + 12 : left ? r.left - s - 12 : innerWidth - s - 10;
    const y = clamp(r.top + 12, 70, innerHeight - s - 120);
    place(x, y, true);
  }

  /* ---------- following the page as you scroll */
  let lastSec = null, scrollT = 0;
  function follow(force) {
    if (mode !== "guide") return;
    const band = innerHeight * 0.35;
    const sec = sections().find(s => { const r = s.getBoundingClientRect(); return r.top <= band && r.bottom > band; });
    if (!sec) { if (scrollY < 40 && cur) { home(); } return; }
    if (sec === lastSec && !force) return;
    lastSec = sec; besideEl(sec); look(sec);
    if (!quiet() || force) explain(sec, sec);
  }
  addEventListener("scroll", () => { clearTimeout(scrollT); scrollT = setTimeout(follow, 650); }, { passive: true });
  addEventListener("resize", () => { if (mode === "stay") restore(); else { lastSec = null; follow(); } });

  /* ---------- pointing: rest the pointer on something for a moment */
  if (fine) {
    const PICK = "[data-guide], .panel, .facts > *, #repList > *, .acts > *, .stat, .card, section";
    let hov = null, hovT = 0, hx = 0, hy = 0;
    addEventListener("pointermove", e => {
      if (drag || e.pointerType !== "mouse") return;
      if (Math.hypot(e.clientX - hx, e.clientY - hy) < 10 && hov) return;
      hx = e.clientX; hy = e.clientY; clearTimeout(hovT);
      const t = e.target.closest && e.target.closest(PICK); if (!t || SKIP(t) || t.closest("#chat") && t.id !== "chat") { hov = null; return; }
      hov = t;
      hovT = setTimeout(() => { if (hov !== t || mode !== "guide") return; besideEl(t); look(t); explain(t); }, 1100);
    }, { passive: true });
  }

  /* ---------- start */
  function restore() { const p = LS.get("shelly.kit.pos", null); if (p) place(p.x * innerWidth, p.y * innerHeight, false); else home(); }
  if (mode === "stay") restore();
  return {
    acts: () => mode === "guide" ? `<button type="button" data-g="stay">📌 Stay here</button>` : `<button type="button" data-g="guide">🧭 Guide me</button>`,
    begin() { if (mode === "guide" && scrollY > 120) follow(); },
  };
}
