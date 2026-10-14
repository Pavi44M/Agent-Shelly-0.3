/* Shelly's mind page: ask anything (typed or spoken), huddles, agent memory, the guided tour
   (synthetic data from docs/data/mind.js, built by scripts/build_mind.py). Answers are matched here in the browser;
   speech recognition is the browser's own service and only runs while the 🎙 button is on. */
(function () {
  "use strict";
  const D = window.SHELLY_MIND, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mood = (m, ms = 3000) => dispatchEvent(new CustomEvent("shelly:mood", { detail: { mood: m, ms } }));
  $("#ver").textContent = D.version;

  /* ---------------- matching a question to an answer (forgiving typos and other words) */
  const SYN = { takings: "sales", revenue: "sales", sold: "sales", turnover: "sales", earnings: "profit", ebitda: "profit", money: "cash", bank: "cash",
    staff: "people", employees: "people", workers: "people", team: "people", lateness: "late", delayed: "late", delay: "late",
    stockout: "short", "out-of-stock": "short", missing: "short", shortage: "short", expiring: "expiry", expire: "expiry", expired: "expiry",
    medicines: "medicine", meds: "medicine", drugs: "medicine", hospital: "medicine", trucks: "truck", lorry: "truck", docks: "dock",
    theft: "stolen", shoplifting: "stolen", thief: "stolen", stealing: "stolen", steal: "stolen", working: "roster", rostered: "roster", learned: "learn", learnt: "learn", learning: "learn", licence: "licence", license: "licence", certificates: "certificate", certs: "certificate",
    tomorrow: "tomorrow", tmrw: "tomorrow", weekend: "tomorrow", saturday: "tomorrow", fri: "friday", yesterday: "friday", decide: "decide", decisions: "decide",
    approvals: "approve", approve: "approve", save: "save", savings: "save", cheaper: "save", visitors: "visitors", footfall: "visitors", customers: "visitors" };
  const STOP = new Set("the a an is are was were do does did i we our my me you your of to in on at for and or it this that what whats what's how which who why when any much many there have has be can".split(" "));
  const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)).map(w => SYN[w] || (w.length >= 5 && !/ss$/.test(w) ? w.replace(/'s$/, "").replace(/s$/, "") : w.replace(/'s$/, "")));
  function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // swapped letters count as one typo
    }
    return d[a.length][b.length]; }
  const IDX = D.answers.map(a => ({ a, keys: [...new Set([...norm(a.keys.join(" ")), ...norm(a.q)])], main: norm(a.keys[0] || "")[0] }));
  const BIZ = { totara: ["totara", "medical", "medicine"], gateway: ["gateway", "warehouse", "truck", "dock"], group: ["group", "tower", "board"] };
  function match(q) {
    const w = norm(q); if (!w.length) return [];
    return IDX.map(({ a, keys, main }) => {
      let s = 0;
      if (main && w.some(t => t === main || (t.length >= 4 && lev(t, main) <= 1))) s += 0.5;   // the answer's own main word breaks ties
      w.forEach(t => { if (keys.includes(t)) s += 2; else if (t.length >= 4 && keys.some(k => k.length >= 4 && ((t.length >= 5 && k.startsWith(t.slice(0, 5))) || lev(k, t) <= 1))) s += 1.6; });
      Object.entries(BIZ).forEach(([b, ws]) => { const said = w.some(t => ws.includes(t)); const mine = a.id.startsWith(b === "totara" ? "tot" : b === "gateway" ? "gw" : "grp"); if (said && mine) s += 1.5; if (said && !mine && a.id.startsWith("store")) s -= 1; });
      return { a, s };
    }).filter(x => x.s >= 1.6).sort((x, y) => y.s - x.s);
  }

  /* ---------------- asking */
  const ansEl = $("#ans"), voiceOn = () => window.ShellyVoice && window.ShellyVoice.on;
  function answer(q, spoken) {
    q = q.trim(); if (!q) return;
    mood("thinking", 900);
    const r = match(q);
    setTimeout(() => {
      if (r.length) {
        const top = r[0].a;
        ansEl.innerHTML = `<div class="a"><span class="you">You asked: ${esc(q)}</span><p>${esc(top.a)}</p><a href="${esc(top.link)}">See it on the page →</a></div>` +
          (r.length > 1 ? `<p class="also">Also: ${r.slice(1, 3).map(x => `<button type="button" class="aq" data-q="${esc(x.a.q)}">${esc(x.a.q)}</button>`).join(" ")}</p>` : "");
        mood("happy", 1600);
        if (spoken || voiceOn()) say(top.a);
      } else {
        ansEl.innerHTML = `<div class="a miss"><span class="you">You asked: ${esc(q)}</span><p>I don't know that one yet. I can answer about sales, budget, waste, stock and orders, the forecast, staff and the handover, Tōtara's stock and suppliers, Gateway's docks and billing, profit, cash, people, licences, savings and what you need to decide.</p></div>`;
        mood("searching", 2000);
        if (spoken) say("I don't know that one yet. Try asking about sales, stock, cash, people or what you need to decide.");
      }
      try { const h = JSON.parse(localStorage.getItem("shelly.ask.recent") || "[]").filter(x => x !== q); h.unshift(q); localStorage.setItem("shelly.ask.recent", JSON.stringify(h.slice(0, 6))); } catch (e) { /* private mode */ }
    }, 450);
  }
  function say(t) { try { if (window.ShellyVoice && window.ShellyVoice.available) window.ShellyVoice.speak(t); } catch (e) { /* no voice */ } }
  $("#askF").addEventListener("submit", e => { e.preventDefault(); answer($("#q").value); });
  document.addEventListener("click", e => { const b = e.target.closest(".aq"); if (b) { $("#q").value = b.dataset.q; answer(b.dataset.q); } });
  let recent = []; try { recent = JSON.parse(localStorage.getItem("shelly.ask.recent") || "[]"); } catch (e) { /* private mode */ }
  const starters = ["Why was Friday down?", "What's short at Tōtara?", "Are we making money?", "How is cash?", "Any dock clashes?", "What do I need to decide?", "Any licences expiring?", "What do I need to order?"];
  $("#sugg").innerHTML = [...new Set([...recent.slice(0, 2), ...starters])].slice(0, 8).map(q => `<button type="button" class="aq" data-q="${esc(q)}">${esc(q)}</button>`).join("");

  /* ---------------- voice questions (browser speech recognition, only while the button is on) */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $("#mic");
  if (!SR) { mic.disabled = true; mic.title = "Voice questions need Chrome, Edge or Safari"; $("#micNote").textContent = "Voice questions work in Chrome, Edge and Safari; type here in other browsers."; }
  else {
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "en-NZ"; rec.interimResults = true; rec.maxAlternatives = 1;
      mic.setAttribute("aria-pressed", "true"); mic.classList.add("on"); mood("listening", 10000);
      $("#micNote").textContent = "Listening… (your browser's speech service turns your voice into text; nothing is kept here)";
      rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(" "); $("#q").value = t; if (e.results[e.results.length - 1].isFinal) answer(t, true); };
      rec.onerror = e => { $("#micNote").textContent = e.error === "not-allowed" ? "Microphone blocked: allow it in the browser to ask by voice." : "I didn't catch that. Try again or type."; };
      rec.onend = () => { rec = null; mic.setAttribute("aria-pressed", "false"); mic.classList.remove("on"); if (/Listening/.test($("#micNote").textContent)) $("#micNote").textContent = ""; };
      rec.start();
    };
  }

  /* ---------------- huddles */
  const ok = k => { try { return JSON.parse(localStorage.getItem("shelly.huddle.ok") || "{}")[k]; } catch (e) { return null; } };
  function drawH() {
    $("#huddles").innerHTML = D.huddles.map(h => { const st = ok(h.id);
      return `<div class="card hud"><div class="hh"><h3>${esc(h.title)}</h3><span class="from">${esc(h.from)}</span></div>
      <ol class="steps">${h.steps.map(s => `<li style="--c:#63b6d8"><span class="who">${esc(s.name)}</span><p>“${esc(s.says)}”</p><span class="gate">${esc(s.part)}</span></li>`).join("")}</ol>
      ${h.conflicts.length ? `<p class="conf">⚖ ${h.conflicts.map(esc).join(" · ")}</p>` : ""}${h.memory.length ? `<p class="memq">🧠 Last time: ${h.memory.map(esc).join(" ")}</p>` : ""}
      <div class="plan"><b>Plan:</b> ${esc(h.plan)}<div class="pa">${st ? `<span class="done">✓ ${st === "yes" ? "Approved" : "Sent back"} on this device</span> <button type="button" data-h="${h.id}" data-v="">Undo</button>` :
        `<span>One sign-off for all ${h.steps_approved_once} steps: <b>${esc(h.sign_off)}</b></span><button type="button" data-h="${h.id}" data-v="yes">Approve plan</button><button type="button" data-h="${h.id}" data-v="no" class="no">Send back</button>`}</div></div></div>`; }).join("");
  }
  $("#huddles").addEventListener("click", e => { const b = e.target.closest("[data-h]"); if (!b) return;
    try { const o = JSON.parse(localStorage.getItem("shelly.huddle.ok") || "{}"); if (b.dataset.v) o[b.dataset.h] = b.dataset.v; else delete o[b.dataset.h]; localStorage.setItem("shelly.huddle.ok", JSON.stringify(o)); } catch (x) { /* private mode */ }
    if (b.dataset.v === "yes") mood("happy", 1800); drawH(); });
  drawH();

  /* ---------------- memory */
  const TOP = { all: "All", forecast: "Forecast", stock: "Stock", shift: "Shift", suppliers: "Suppliers", docks: "Docks", finance: "Finance", vision: "Vision", loss: "Loss prevention", decisions: "Decisions" };
  let tf = "all";
  const topics = ["all", ...new Set(D.memory.map(m => m.topic))];
  $("#memF").innerHTML = topics.map(t => `<button type="button" data-t="${t}" aria-pressed="${t === tf}">${esc(TOP[t] || t)} · ${t === "all" ? D.memory.length : D.memory.filter(m => m.topic === t).length}</button>`).join("");
  $("#memF").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; tf = b.dataset.t; $("#memF").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawM(); });
  function drawM() {
    $("#mem").innerHTML = D.memory.filter(m => tf === "all" || m.topic === tf).map(m => `<div class="mm ${m.outcome === "rejected" ? "rej" : ""}"><span class="mw">${esc(m.when)} · ${esc(m.agent)} · ${esc(m.kind)}</span><b>${esc(m.what)}</b><small>${esc(m.outcome)}</small><p>${esc(m.lesson)}</p></div>`).join("");
  }
  drawM();

  /* ---------------- tour */
  $("#tourGo").onclick = () => { if (window.ShellyTour) window.ShellyTour.start(); };

  window.SHELLY_GUIDE = {
    "s-ask": "Type or tap 🎙 and ask in your own words: sales, stock, cash, people, suppliers, docks, or what you need to decide. Every answer links to where it lives.",
    "s-huddle": `${D.huddles.length} huddles today. Each one is a single plan across departments that you approve once, instead of signing every step.`,
    "s-memory": `${D.memory.length} things the agents remember, all from what Shelly really recorded: what they tried, what happened and the lesson they keep.`,
    "s-tour": "The 3-minute tour: I walk through nine stops and say what each one shows. Turn on Voice to hear me.",
  };
  $("#foot").textContent = `Shelly's mind v${D.version} · built ${D.generated} · answers worked out from synthetic data · voice questions use your browser's speech service`;
})();
