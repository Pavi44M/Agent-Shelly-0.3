/* Shelly Store Shift Pilot page (synthetic data from docs/data/shift.js, built by scripts/build_shift.py) */
(function () {
  "use strict";
  const D = window.SHELLY_SHIFT, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const B = D.brief, C = D.closing, M = D.model;
  const hm = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const h = s => { const [a, b] = s.split(":").map(Number); return a + b / 60; };
  const MODEL = { naive: "Same day last week", weekday: "Weekday average", sensing: "Demand sensing" };
  const dname = new Date(D.day + "T12:00:00").toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });
  $("#ver").textContent = D.version; $("#dayName").textContent = dname;

  /* ---- KPIs */
  const need = B.staffing.reduce((a, g) => a + g.need, 0), on = B.staffing.reduce((a, g) => a + g.on, 0);
  $("#kpis").innerHTML = [[$$(B.forecast), "forecast today", `${$$(B.low)}–${$$(B.high)} · ${MODEL[B.model].toLowerCase()}`],
    [$$(C.actual), "actual takings", `${C.error_pct > 0 ? "+" : ""}${C.error_pct}% vs forecast`],
    [`${C.tasks.done + C.tasks.late}/${C.tasks.total}`, "tasks done", `${C.tasks.late} late · ${C.tasks.open} to hand over`],
    [`${on}/${need}`, "staff-hours on / needed", on >= need ? `${on - need} spare hours` : `${need - on} short`],
    [`${C.waste_pct}%`, "waste of sales", "target under 3%"],
    [`${M.exam14.wape[M.live]}%`, "forecast error, 14 days", "the honest exam"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---- opening brief */
  $("#wx").textContent = `${B.weather.temp_c}°C · ${B.weather.rain_mm ? B.weather.rain_mm + " mm rain" : "dry"}${B.delivery ? " · delivery day" : ""}`;
  $("#today").innerHTML = `<p class="big">${$$(B.forecast)} <small>forecast · range ${$$(B.low)}–${$$(B.high)}</small></p>
    <p>Same day last week: <b>${$$(B.last_week)}</b>. Why: ${B.why.map(esc).join(", ")}.</p>
    <p class="note">Forecast by <b>${esc(MODEL[B.model])}</b> (${esc(M.why)}). Demand sensing alone says ${$$(B.forecast_sensing)}.</p>
    ${B.recalls.length ? `<p class="warn">Recall: ${B.recalls.map(r => `${esc(r.product)} (${esc(r.reason)})`).join("; ")}. Pull before trading.</p>` : ""}
    <p>${B.orders_waiting} purchase orders (${$$(B.orders_value)}) are waiting for sign-off in the approvals queue.</p>`;
  $("#top3").innerHTML = B.top3.map(t => `<li>${esc(t)}</li>`).join("");
  // staff chart: bars of staff on, a step line of staff needed
  (function () {
    const S = B.staffing, W = 640, H = 230, x0 = 34, y0 = 16, w = W - x0 - 10, hh = H - y0 - 30, mx = Math.max(...S.map(g => Math.max(g.on, g.need))) + 1;
    const bw = w / S.length, Y = v => y0 + hh - v / mx * hh;
    let s = "";
    for (let v = 0; v <= mx; v += 2) s += `<line x1="${x0}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1f2a38"/><text x="${x0 - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    S.forEach((g, i) => { const x = x0 + i * bw; const c = g.gap < 0 ? "#ff6b6b" : g.gap >= 2 ? "#ffc466" : "#63b6d8";
      s += `<rect x="${x + 4}" y="${Y(g.on)}" width="${bw - 8}" height="${Y(0) - Y(g.on)}" rx="3" fill="${c}" opacity=".75"><title>${g.hour}:00 · ${g.on} on, ${g.need} needed · ${$$(g.sales)} forecast</title></rect>
        <text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${g.hour}</text>`; });
    s += `<path d="${S.map((g, i) => `${i ? "L" : "M"}${x0 + i * bw} ${Y(g.need)}H${x0 + (i + 1) * bw}`).join("")}" fill="none" stroke="#eaf0f6" stroke-width="2"/>`;
    $("#staff").innerHTML = s;
  })();
  $("#team").innerHTML = `<p class="note"><span class="sw" style="background:#63b6d8"></span>on, about right <span class="sw" style="background:#ffc466"></span>2+ spare <span class="sw" style="background:#ff6b6b"></span>short <span class="sw ln"></span>needed</p>` +
    B.team.map(t => `<span class="mate"><b>${esc(t.name)}</b> ${esc(t.role)} · ${hm(t.from)}–${hm(t.to)}</span>`).join("");

  /* ---- live to-do */
  const SRC = { Routine: "#7d8a9c", Compliance: "#b69cf2", Forecast: "#63b6d8", "Event bus": "#ffc466" };
  const fsum = Object.entries(C.hourly_actual);
  function live(t) {
    $("#tmL").textContent = hm(t);
    $("#todo").innerHTML = D.tasks.map(x => {
      const due = h(x.at), dn = x.done_at ? h(x.done_at) : null;
      let st, cls;
      if (dn !== null && dn <= t) { st = x.status === "late" ? `done ${x.done_at} · late` : `done ${x.done_at}`; cls = x.status === "late" ? "late" : "done"; }
      else if (due > t) { st = "coming up"; cls = "next"; }
      else if (x.status === "open" && t >= 21.5) { st = "not done · handed over"; cls = "open"; }
      else { st = t - due > 0.5 ? "overdue" : "due now"; cls = t - due > 0.5 ? "late" : "now"; }
      return `<li class="${cls}"><time>${esc(x.at)}</time><div><b>${esc(x.title)}</b><small><span class="src" style="color:${SRC[x.source] || "#7d8a9c"}">${esc(x.source)}</span> · ${esc(x.role)}${x.why ? " · " + esc(x.why) : ""}</small></div><span class="st">${st}</span></li>`;
    }).join("");
    let sold = 0, fc = 0; fsum.forEach(([hr, v]) => { if (+hr + 1 <= t) { sold += v; } });
    B.staffing.forEach(g => { if (g.hour + 1 <= t) fc += g.sales; });
    $("#till").innerHTML = `<span>Takings so far <b>${$$(sold)}</b></span><span>Forecast so far <b>${$$(fc)}</b></span><span>${fc ? `<b class="${sold >= fc ? "up" : "down"}">${((sold - fc) / fc * 100).toFixed(1)}%</b> vs forecast` : "doors open at 07:00"}</span>`;
  }
  const tm = $("#tm"); tm.addEventListener("input", () => live(+tm.value)); live(+tm.value);
  let timer = null;
  $("#playDay").onclick = e => { const b = e.currentTarget;
    if (timer) { clearInterval(timer); timer = null; b.textContent = "▶ Play the day"; b.setAttribute("aria-pressed", "false"); return; }
    if (+tm.value >= 21.5) tm.value = 6;
    b.textContent = "❚❚ Pause"; b.setAttribute("aria-pressed", "true");
    timer = setInterval(() => { tm.value = Math.min(21.5, +tm.value + 0.25); live(+tm.value); if (+tm.value >= 21.5) { clearInterval(timer); timer = null; b.textContent = "▶ Play the day"; b.setAttribute("aria-pressed", "false"); } }, 350); };

  /* ---- closing */
  $("#closeNums").innerHTML = [["Takings", $$(C.actual), `forecast ${$$(C.forecast)} (${C.error_pct > 0 ? "+" : ""}${C.error_pct}%)`], ["Demand sensing", `${C.sensing_error_pct > 0 ? "+" : ""}${C.sensing_error_pct}%`, "its error today, for comparison"],
    ["Waste and markdowns", $$(C.waste), `${C.waste_pct}% of sales`], ["Cash variance", (C.cash_variance < 0 ? "−$" : "+$") + Math.abs(C.cash_variance).toFixed(2), "across all tills"],
    ["Tasks", `${C.tasks.done} on time · ${C.tasks.late} late · ${C.tasks.open} open`, `${C.tasks.total} in the day`]]
    .map(([a, b, c]) => `<div class="row"><span>${esc(a)}</span><b>${esc(b)}</b><small>${esc(c)}</small></div>`).join("");
  $("#hand").innerHTML = C.handover.map(t => `<li>${esc(t)}</li>`).join("");
  $("#copyHand").onclick = e => { const txt = `Handover · ${dname}\n` + C.handover.map((t, i) => `${i + 1}. ${t}`).join("\n");
    try { navigator.clipboard.writeText(txt).then(() => { e.target.textContent = "Copied ✓"; setTimeout(() => e.target.textContent = "Copy handover", 1600); }); } catch (x) { /* no clipboard */ } };

  /* ---- demand sensing */
  const E = M.exam14;
  $("#decide").innerHTML = `<b>Who runs the roster: ${esc(MODEL[M.live])}.</b> ${esc(M.why.charAt(0).toUpperCase() + M.why.slice(1))}.
    Over the last 8 weeks the best was <b>${esc(MODEL[M.exam56.champion])}</b>; over the last 14 days it was <b>${esc(MODEL[E.champion])}</b>. A new model takes over only when it wins both, so one lucky fortnight can't change the roster.`;
  (function () {
    const W = 640, H = 260, x0 = 48, y0 = 14, w = W - x0 - 12, hh = H - y0 - 32;
    const all = [...E.actual, ...E.naive, ...E.weekday, ...E.sensing], lo = Math.min(...all) * 0.95, hi = Math.max(...all) * 1.03;
    const X = i => x0 + i / (E.days.length - 1) * w, Y = v => y0 + hh - (v - lo) / (hi - lo) * hh;
    let s = "";
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; s += `<line x1="${x0}" x2="${W - 12}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1f2a38"/><text x="${x0 - 6}" y="${Y(v) + 4}" text-anchor="end">${$$(v)}</text>`; }
    E.days.forEach((d, i) => { if (i % 2 === 0) s += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>`; });
    const L = { naive: "#7d8a9c", weekday: "#ffc466", sensing: "#63b6d8" };
    Object.entries(L).forEach(([k, c]) => { s += `<path d="${E[k].map((v, i) => `${i ? "L" : "M"}${X(i)} ${Y(v)}`).join("")}" fill="none" stroke="${c}" stroke-width="1.8" ${k === M.live ? "" : 'stroke-dasharray="4 3"'}/>`; });
    s += `<path d="${E.actual.map((v, i) => `${i ? "L" : "M"}${X(i)} ${Y(v)}`).join("")}" fill="none" stroke="#eaf0f6" stroke-width="2.4"/>` + E.actual.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="#eaf0f6"><title>${E.days[i]} · actual ${$$(v)}</title></circle>`).join("");
    $("#exam").innerHTML = s;
    $("#examLeg").innerHTML = `<span><i style="background:#eaf0f6"></i>Actual</span>` + Object.entries(L).map(([k, c]) => `<span><i style="background:${c}"></i>${MODEL[k]}</span>`).join("");
  })();
  $("#wape").innerHTML = `<table class="tb"><thead><tr><th>Model</th><th>14 days</th><th>8 weeks</th></tr></thead><tbody>` +
    ["naive", "weekday", "sensing"].map(k => `<tr${k === M.live ? ' class="pick"' : ""}><td>${MODEL[k]}${k === M.live ? " <small>· runs the roster</small>" : ""}</td><td>${E.wape[k]}%</td><td>${M.exam56.wape[k]}%</td></tr>`).join("") + "</tbody></table>";
  const mxE = Math.max(...D.effects.map(e => Math.max(Math.abs(e.learned_pct), Math.abs(e.true_pct)))) || 1;
  $("#effects").innerHTML = D.effects.map(e => `<div class="eff"><span>${esc(e.name)}</span>
    <div class="ebar"><i class="l ${e.learned_pct < 0 ? "neg" : ""}" style="width:${Math.abs(e.learned_pct) / mxE * 50}%"></i></div><b>${e.learned_pct > 0 ? "+" : ""}${e.learned_pct}%</b><small>truth ${e.true_pct > 0 ? "+" : ""}${e.true_pct}%</small></div>`).join("") +
    `<p class="note">${esc(D.truth_note)}</p>`;
  $("#next7").innerHTML = D.next7.map(d => `<div class="day"><b>${new Date(d.date + "T12:00:00").toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}</b>
    <span class="fc">${$$(d.forecast)}</span><small>${$$(d.low)}–${$$(d.high)}</small><small>${d.temp_c}°C · ${d.rain_mm ? d.rain_mm + " mm" : "dry"}</small><p>${d.why.map(esc).join(" · ")}</p></div>`).join("");

  /* ---- Skill Lab */
  const LC = ["", "#ff6b6b", "#ffc466", "#63b6d8", "#7fd1a8", "#b69cf2"];
  $("#skills").innerHTML = Object.entries(D.lab.skills).map(([k, v]) => {
    const sc = v.scores, mn = Math.min(...sc, 80), W = 220, H = 46;
    const pts = sc.map((x, i) => `${(i / (sc.length - 1) * W).toFixed(1)},${(H - (x - mn) / (100 - mn) * H).toFixed(1)}`).join(" ");
    const extra = k === "shift.roster" ? `${v.short_hours} hours short, ${v.over_hours} over in 14 days` : k === "shift.forecast" ? `ran the roster these 14 days: ${[...new Set(v.models)].map(m => MODEL[m]).join(", ")}` + (v.models.at(-1) !== M.live ? `; from today, ${MODEL[M.live]}` : "") : `safety setting ${D.lab.reorder_chosen} (chosen by the lab)`;
    return `<div class="sk"><span class="lv" style="color:${LC[v.level]}">Level ${v.level} · ${esc(v.level_name)}</span><h3>${esc(v.name)}</h3><b class="avg">${v.avg}</b><small>average score, 14 days</small>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${LC[v.level]}" stroke-width="2"/></svg><p class="note">${esc(extra)}</p></div>`;
  }).join("");
  $("#tfill").textContent = D.target_fill;
  $("#trials").innerHTML = `<table class="tb"><thead><tr><th>Safety setting</th><th>On the shelf</th><th>Average stock held</th><th></th></tr></thead><tbody>` +
    D.lab.reorder_trials.map(t => `<tr${t.k === D.lab.reorder_chosen ? ' class="pick"' : ""}><td>${t.k}</td><td>${t.fill}%</td><td>${$$(t.avg_stock_value)}</td><td>${t.k === D.lab.reorder_chosen ? "chosen" : t.fill < D.target_fill ? "too many empty shelves" : "more stock than needed"}</td></tr>`).join("") + "</tbody></table>";
  /* ---- what Shelly says about each section (the guide reads these as you scroll) */
  window.SHELLY_GUIDE = {
    "s-open": `Today's forecast is <b>${$$(B.forecast)}</b> (${$$(B.low)}–${$$(B.high)}), ${B.why.join(", ").toLowerCase()}. First up: ${esc(B.top3[0])}.`,
    "s-live": `${D.tasks.length} tasks today from the routine, compliance, the forecast and the event bus. Press <b>▶ Play the day</b> to watch them tick off; ${C.tasks.late} ran late and ${C.tasks.open} went to the handover.`,
    "s-close": `Takings came in at <b>${$$(C.actual)}</b>, ${C.error_pct > 0 ? "+" : ""}${C.error_pct}% against the forecast. The handover has ${C.handover.length} notes for tomorrow's Duty Manager; tap Copy to send them.`,
    "s-sense": `${esc(MODEL[M.live])} runs the roster. Over the last 14 days the best was ${esc(MODEL[E.champion])}; over 8 weeks it was ${esc(MODEL[M.exam56.champion])}. A new model only takes over when it wins both.`,
    "s-lab": `Three shift skills sit an exam every day: forecasting ${D.lab.skills["shift.forecast"].avg}, reorder ${D.lab.skills["shift.reorder"].avg} and rostering ${D.lab.skills["shift.roster"].avg} out of 100.`,
  };
  $("#foot").textContent = `Shift Pilot v${D.version} · built ${D.generated} · synthetic store and invented team names; real data stays on your own PC`;
})();
