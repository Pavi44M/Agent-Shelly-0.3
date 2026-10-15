/* Tōtara Clinic page (synthetic counts from docs/data/clinic.js, built by scripts/build_tower_biz.py). No patient records; not medical advice. */
(function () {
  "use strict";
  const D = window.SHELLY_CLINIC, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const K = D.kpis, SC = { "GP appointment": "#63b6d8", "Nurse clinic": "#8fe3c8", "Urgent care walk-in": "#ff8a7a", "Physio": "#ffd27a" };
  $("#ver").textContent = D.version; $("#day").textContent = D.day;
  $("#kpis").innerHTML = [[K.patients, "patients today", "counts, never records"], [`${K.within_target_pct}%`, "seen within target", "all streams"], [`${K.peak_hour}:00`, "busiest hour", `${K.peak_arrivals} arrivals`],
    [`${K.ward_peak}/8`, "day-ward beds at peak", ""], [K.imaging + K.lab, "imaging and lab tests", `${K.imaging} imaging · ${K.lab} lab`], [K.scripts, "prescriptions", "filled at the Tōtara pharmacy"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");
  $("#acts").innerHTML = D.actions.map(a => `<li>${esc(a)}</li>`).join("");
  $("#flow").innerHTML = D.flow.map((f, i) => `<li><span>${i + 1}</span>${esc(f)}</li>`).join("");
  // arrivals by hour, stacked by stream
  (function () {
    const H = D.hours, W = 960, L = 40, R = 16, t0 = 20, b0 = 230, bw = (W - L - R) / H.length, mx = Math.max(...H.map(h => h.arrivals)), y = v => b0 - v / mx * (b0 - t0);
    let s = `<line x1="${L}" x2="${W - R}" y1="${b0}" y2="${b0}" stroke="#3d4a5c"/>`;
    H.forEach((h, i) => { let acc = 0; Object.entries(h.streams).forEach(([k, v]) => { if (!v.arrivals) return; const y1 = y(acc + v.arrivals), y2 = y(acc); acc += v.arrivals;
      s += `<rect x="${L + i * bw + 4}" y="${y1}" width="${bw - 8}" height="${y2 - y1}" fill="${SC[k]}" fill-opacity=".7"><title>${h.hour}:00 · ${esc(k)}: ${v.arrivals} arrivals, wait about ${v.wait_min} min</title></rect>`; });
      s += `<text x="${L + i * bw + bw / 2}" y="${b0 + 16}" text-anchor="middle" class="ax">${h.hour}</text><text x="${L + i * bw + bw / 2}" y="${y(h.arrivals) - 5}" text-anchor="middle" class="ax">${h.arrivals}</text>`; });
    s += `<g transform="translate(${L},${b0 + 40})">` + Object.keys(SC).map((k, i) => `<rect x="${i * 200}" y="-9" width="10" height="10" fill="${SC[k]}"/><text x="${i * 200 + 16}" y="0" class="ax">${esc(k)}</text>`).join("") + `</g>`;
    $("#arr").innerHTML = s;
  })();
  $("#streams").innerHTML = `<thead><tr><th>Stream</th><th>Patients</th><th>Median wait</th><th>Target</th><th>Within target</th><th>Worst hour</th><th>No-shows</th></tr></thead><tbody>` +
    D.streams.map(s => `<tr><td><i class="dot" style="background:${SC[s.stream]}"></i>${esc(s.stream)}</td><td>${s.patients}</td><td>${s.median_wait} min</td><td>${s.target_min} min</td><td class="${s.within_target_pct < 90 ? "neg" : "pos"}"><b>${s.within_target_pct}%</b></td><td>${s.worst_hour}:00 · ${s.worst_wait} min</td><td>${s.no_show_pct == null ? "walk-in" : s.no_show_pct + "%"}</td></tr>`).join("") + "</tbody>";
  const LV = { L7: "Level 7 · imaging and lab", L6: "Level 6 · GP and urgent care", L5: "Level 5 · day ward and physio" };
  $("#rooms").innerHTML = Object.entries(LV).map(([lv, t]) => `<h3>${esc(t)}</h3><ul class="rl">${D.rooms.filter(r => r.level === lv).map(r => `<li><b>${r.count}</b> ${esc(r.room)}</li>`).join("")}</ul>`).join("") +
    `<p class="note">Every clinic floor also has the tower's shared core: lifts, two fire stairs, accessible and all-gender washrooms.</p>`;
  (function () {
    const Wd = D.ward, W = 480, L = 30, t0 = 16, b0 = 180, bw = (W - L - 10) / Wd.length, y = v => b0 - v / 8 * (b0 - t0);
    $("#ward").innerHTML = `<line x1="${L}" x2="${W - 10}" y1="${y(8)}" y2="${y(8)}" stroke="#ff8a7a" stroke-dasharray="4 4"/><text x="${W - 12}" y="${y(8) - 5}" text-anchor="end" class="ax">8 beds</text>` +
      Wd.map((w, i) => `<rect x="${L + i * bw + 3}" y="${y(w.beds_used)}" width="${bw - 6}" height="${b0 - y(w.beds_used)}" rx="2" fill="${w.beds_used >= 8 ? "#ff8a7a" : "#8fe3c8"}" fill-opacity=".7"><title>${w.hour}:00 · ${w.beds_used} of 8 beds</title></rect><text x="${L + i * bw + bw / 2}" y="${b0 + 15}" text-anchor="middle" class="ax">${w.hour}</text>`).join("");
  })();
  const hrs = D.hours.map(h => h.hour);
  $("#staff").innerHTML = `<thead><tr><th>Role</th>${hrs.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
    D.staff.map(s => `<tr><td>${esc(s.role)}</td>${s.hours.map(x => `<td class="${x.on < x.need ? "short" : x.on > x.need + 1 ? "spare" : "ok"}" title="${x.hour}:00 · ${x.on} on, ${x.need} needed">${x.on}<small>/${x.need}</small></td>`).join("")}</tr>`).join("") + "</tbody>";
  $("#sup").innerHTML = `<thead><tr><th>Item</th><th>Type</th><th>Used a day</th><th>At Tōtara Medical</th></tr></thead><tbody>` +
    D.supplies.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${s.use_day}</td><td class="${/gap|out|reorder/i.test(s.status_at_totara) ? "neg" : ""}">${esc(s.status_at_totara)}</td></tr>`).join("") + "</tbody>";
  $("#foot").textContent = `Shelly v${D.version} · built ${D.generated} · one simulated day · counts only, no patient records · not medical advice`;
  window.SHELLY_GUIDE = {
    "s-act": `<b>Today's actions.</b> The few changes the numbers point to; the clinic manager decides.`,
    "s-flow": `<b>Patient flow.</b> ${K.patients} patients today, busiest at ${K.peak_hour}:00. Urgent care is where the waits build up.`,
    "s-rooms": `<b>Rooms and beds.</b> Three floors, eight day-ward beds. Red bars mean the ward was full.`,
    "s-staff": `<b>Staffing by role.</b> On shift against need, hour by hour. Red is short. Roles only, never names.`,
    "s-supply": `<b>Supplies.</b> What the clinic uses a day, and whether Tōtara Medical has it in stock.`,
  };
})();
