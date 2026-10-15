/* Shelly quality page (synthetic data from docs/data/quality.js, built by scripts/build_quality.py) */
(function () {
  "use strict";
  const D = window.SHELLY_QUALITY, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const L = D.league, A = D.anomalies, B = D.build;
  $("#ver").textContent = D.version;
  $("#kpis").innerHTML = [[L.overall[0].wape + "%", "best weekly forecast error", L.overall[0].model], [L.overall.length, "models compared", "on weeks they never saw"],
    [A.flags.length, "unusual days", `last ${A.days} days`], [D.data_checks.filter(c => c.found > 0).length + "/" + D.data_checks.length, "data checks with findings", "all handled"],
    [B.test_functions, "automated tests", `${B.test_files} test files`], [B.pages_rendered, "pages rendered on every release", "desktop and phone"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");
  const mx = Math.max(...L.overall.map(m => m.wape));
  $("#lg").innerHTML = L.overall.map((m, i) => `<div class="lgr${i === 0 ? " top" : ""}"><span>${i + 1}. ${esc(m.model)}</span><i style="width:${m.wape / mx * 100}%"></i><b>${m.wape}%</b><small>MAPE ${m.mape}%</small></div>`).join("");
  $("#lgN").textContent = L.finding;
  $("#lgc").innerHTML = `<thead><tr><th>Category</th><th>Best model</th><th>Error</th></tr></thead><tbody>` + L.by_category.map(c => `<tr><td>${esc(c.category)}</td><td>${esc(c.model)}</td><td>${c.wape}%</td></tr>`).join("") + "</tbody>";
  if (L.daily_exam) { const w = L.daily_exam.wape_14d; $("#lgD").innerHTML = `<b>Day-ahead forecast (Shift Pilot):</b> on the last 14 days, naive ${w.naive}%, weekday average ${w.weekday}%, demand sensing ${w.sensing}%. ${esc(L.daily_exam.why[0].toUpperCase() + L.daily_exam.why.slice(1))}.`; }
  $("#anN").textContent = `Daily sales against the same weekday's last four weeks · flagged beyond ${A.threshold_z} standard deviations`;
  (function () {
    const S = A.series, W = 960, Lx = 50, R = 16, t0 = 16, b0 = 240, n = S.length, x = i => Lx + i / (n - 1) * (W - Lx - R);
    const vals = S.flatMap(s => [s.sales, s.expected].filter(v => v != null)), lo = Math.min(...vals) * .95, hi = Math.max(...vals) * 1.03, y = v => b0 - (v - lo) / (hi - lo) * (b0 - t0);
    const fl = new Map(A.flags.map(f => [f.date, f]));
    let s = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${Lx}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#1f2a38"/><text x="${Lx - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${$$(v)}</text>`).join("");
    s += `<polyline fill="none" stroke="#5b6b80" stroke-width="1.5" stroke-dasharray="4 3" points="${S.map((p, i) => p.expected == null ? "" : `${x(i)},${y(p.expected)}`).join(" ")}"/>`;
    s += `<polyline fill="none" stroke="#63b6d8" stroke-width="1.6" points="${S.map((p, i) => `${x(i)},${y(p.sales)}`).join(" ")}"/>`;
    S.forEach((p, i) => { const f = fl.get(p.date); if (f) s += `<circle cx="${x(i)}" cy="${y(p.sales)}" r="6" fill="${f.diff_pct < 0 ? "#ff8a7a" : "#ffd27a"}"><title>${f.dow} ${f.date}: ${$$(f.sales)} vs ${$$(f.expected)} expected (${f.diff_pct > 0 ? "+" : ""}${f.diff_pct}%) · ${esc(f.why)}</title></circle>`; });
    S.forEach((p, i) => { if (p.date.endsWith("-01")) s += `<text x="${x(i)}" y="${b0 + 18}" class="ax">${p.date.slice(0, 7)}</text>`; });
    s += `<g transform="translate(${Lx},${b0 + 36})"><line x2="18" stroke="#63b6d8" stroke-width="2"/><text x="24" y="4" class="ax">sales</text><line x1="90" x2="108" stroke="#5b6b80" stroke-dasharray="4 3" stroke-width="2"/><text x="114" y="4" class="ax">expected</text><circle cx="200" r="5" fill="#ffd27a"/><text x="210" y="4" class="ax">unusually high</text><circle cx="330" r="5" fill="#ff8a7a"/><text x="340" y="4" class="ax">unusually low</text></g>`;
    $("#an").innerHTML = s;
  })();
  $("#anT").innerHTML = `<thead><tr><th>Day</th><th>Sales</th><th>Expected</th><th>Off by</th><th>Likely reason</th><th>How sure</th></tr></thead><tbody>` +
    A.flags.map(f => `<tr><td>${esc(f.dow)} ${esc(f.date)}</td><td>${$$(f.sales)}</td><td>${$$(f.expected)}</td><td class="${f.diff_pct < 0 ? "neg" : "pos"}">${f.diff_pct > 0 ? "+" : ""}${f.diff_pct}%</td><td>${esc(f.why)}</td><td>${esc(f.sure)}</td></tr>`).join("") + "</tbody>";
  $("#dc").innerHTML = `<thead><tr><th>Check</th><th>Found</th><th>What was done</th></tr></thead><tbody>` +
    D.data_checks.map(c => `<tr><td>${esc(c.check)}</td><td class="${c.found ? "" : "pos"}"><b>${c.found.toLocaleString("en-NZ")}</b></td><td>${esc(c.action)}</td></tr>`).join("") + "</tbody>";
  $("#bh").innerHTML = `<div class="dk"><div><b>${B.test_functions}</b><span>automated tests in ${B.test_files} files</span></div><div><b>${B.pages_rendered}</b><span>pages opened in a real browser at desktop and phone width on every release</span></div></div>
    <p>${esc(B.ci[0].toUpperCase() + B.ci.slice(1))}.</p><p class="note">Recent releases: ${B.releases.map(esc).join(" · ")}</p>`;
  $("#foot").textContent = `Shelly v${D.version} · built ${D.generated} · synthetic data`;
  window.SHELLY_GUIDE = {
    "s-league": `<b>Forecast league table.</b> ${esc(L.finding)}`,
    "s-anom": `<b>Anomaly radar.</b> ${A.flags.length} days in the last ${A.days} look unusual. Each comes with the likely reason and how sure I am.`,
    "s-data": `<b>Data checks.</b> What I found in the raw data before any model ran, and what was done about it.`,
    "s-build": `<b>Build health.</b> ${B.test_functions} automated tests and ${B.pages_rendered} page checks guard every release.`,
  };
})();
