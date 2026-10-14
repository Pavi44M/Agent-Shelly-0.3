/* Shelly OS page: the event bus and the data model (synthetic data from docs/data/os.js, built by scripts/build_os.py) */
(function () {
  "use strict";
  const D = window.SHELLY_OS, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const COL = { store: "#63b6d8", totara: "#b69cf2", gateway: "#8fb8ff", group: "#f2c14e" };
  const B = D.businesses, S = D.summary;
  $("#ver").textContent = D.version;
  const rows = D.tables.reduce((a, t) => a + t.rows, 0);
  $("#kpis").innerHTML = [[D.tables.length, "tables in one model", rows.toLocaleString("en-NZ") + " rows"], [S.events, "events today", "detected from the data"],
    [S.actions, "agent actions", "proposed or done"], [S.on_their_own, "ran on their own", "routine, within limits"], [S.waiting, "wait for a person", "money, people, customers"],
    [S.cross_business, "across businesses", "one business acts for another"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  /* ---- event bus */
  let biz = "all", shown = 12;
  const counts = { all: D.events.length }; D.events.forEach(e => { counts[e.business] = (counts[e.business] || 0) + 1; });
  $("#filters").innerHTML = ["all", ...Object.keys(B).filter(k => counts[k])].map(k => `<button type="button" data-b="${k}" aria-pressed="${k === biz}">${k === "all" ? "All" : esc(B[k])} · ${counts[k]}</button>`).join("");
  $("#filters").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; biz = b.dataset.b; shown = 12;
    $("#filters").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(); });
  function act(a, evBiz) {
    const other = a.business !== evBiz ? ` <span class="biz-tag">· for ${esc(B[a.business])}</span>` : "";
    return `<li><div><span class="who">${esc(a.agent_name)}</span>${other}<br>${esc(a.action)}</div>
      <span class="need ${a.status === "done" ? "done" : "wait"}">${a.status === "done" ? "✓ ran on its own" : "waits: " + esc(a.needs)}</span></li>`;
  }
  function draw() {
    const list = D.events.filter(e => biz === "all" || e.business === biz);
    $("#events").innerHTML = list.slice(0, shown).map(e => `<article class="ev" style="--c:${COL[e.business] || "#63b6d8"}">
      <div class="ev-h"><span class="sev ${esc(e.severity)}">${esc(e.severity)}</span><b>${esc(e.subject)}</b><code>${esc(e.type)}</code><span class="biz-tag">${esc(B[e.business])} · ${esc(e.ts)}</span></div>
      <ul class="acts">${e.actions.map(a => act(a, e.business)).join("") || `<li><div class="x">No agent subscribed yet</div></li>`}</ul></article>`).join("") +
      (list.length > shown ? `<button class="more" type="button" id="more">Show ${Math.min(12, list.length - shown)} more of ${list.length - shown}</button>` : "");
    const m = $("#more"); if (m) m.onclick = () => { shown += 12; draw(); };
  }
  draw();

  /* ---- across businesses */
  const cross = [];
  D.events.forEach(e => e.actions.forEach(a => { if (a.business !== e.business) cross.push([e, a]); }));
  $("#cross").innerHTML = cross.length ? cross.slice(0, 8).map(([e, a]) => `<div class="flow"><div><small>${esc(B[e.business])} · ${esc(e.type)}</small>${esc(e.subject)}</div><span class="arrow" aria-hidden="true">→</span>
      <div><small>${esc(B[a.business])} · ${esc(a.agent_name)}</small>${esc(a.action)}</div></div>`).join("") +
      (cross.length > 8 ? `<p class="note">and ${cross.length - 8} more today.</p>` : "") : `<p class="note">No cross-business actions today.</p>`;

  /* ---- data model */
  $("#tables").innerHTML = D.tables.map(t => `<div class="tb ${t.name === "events" || t.name === "actions" ? "live" : ""}"><span class="n">${t.rows.toLocaleString("en-NZ")}</span><b>${esc(t.name)}</b>
    <p>${esc(t.what)}</p>${t.cols.map(c => `<code>${esc(c)}</code>`).join("")}</div>`).join("");
  $("#foot").textContent = `Shelly OS v${D.version} · built ${D.generated} · synthetic data, no real people or businesses · real-data mode runs only on your own PC`;
})();
