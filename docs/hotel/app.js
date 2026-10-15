/* Shelly Tower Hotel page (synthetic data from docs/data/hotel.js, built by scripts/build_tower_biz.py). No guest names. */
(function () {
  "use strict";
  const D = window.SHELLY_HOTEL, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $$ = v => "$" + Math.round(v).toLocaleString("en-NZ");
  const K = D.kpis;
  $("#ver").textContent = D.version;
  $("#kpis").innerHTML = [[`${K.occ_pct}%`, "occupancy", "last 30 nights"], [$$(K.adr), "average daily rate", "ADR"], [$$(K.revpar), "revenue per available room", "RevPAR"],
    [`${K.on_books_30d_pct}%`, "on the books", "next 30 nights"], [`${D.repeat_pct}%`, "repeat guests", "of recent bookings"], [K.rooms, "rooms and apartments", "L16 and L17"]]
    .map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");
  $("#acts").innerHTML = D.actions.map(a => `<li>${esc(a)}</li>`).join("");
  // occupancy by night: past solid, future on the books, event nights marked
  (function () {
    const N = D.nights, W = 960, L = 40, R = 16, t0 = 20, b0 = 240, bw = (W - L - R) / N.length, y = v => b0 - v / 100 * (b0 - t0);
    let s = [50, 75, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#1f2a38"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}%</text>`).join("");
    const ti = N.findIndex(n => !n.past);
    s += `<line x1="${L + ti * bw}" x2="${L + ti * bw}" y1="${t0}" y2="${b0}" stroke="#ffd27a" stroke-dasharray="4 4"/><text x="${L + ti * bw + 6}" y="${t0 + 10}" class="ax">today · on the books →</text>`;
    s += N.map((n, i) => `<rect x="${L + i * bw + .8}" y="${y(n.occ_pct)}" width="${Math.max(1, bw - 1.6)}" height="${b0 - y(n.occ_pct)}" fill="${n.event ? "#ffd27a" : n.past ? "#63b6d8" : "#5b6b80"}" fill-opacity="${n.past ? .75 : .6}"><title>${n.dow} ${n.date}: ${n.occ_pct}% · ADR ${$$(n.adr)} · RevPAR ${$$(n.revpar)}${n.event ? " · event night" : ""}</title></rect>`).join("");
    N.forEach((n, i) => { if (n.date.endsWith("-01")) s += `<text x="${L + i * bw}" y="${b0 + 16}" class="ax">${n.date.slice(0, 7)}</text>`; });
    s += `<g transform="translate(${L},${b0 + 40})"><rect y="-9" width="10" height="10" fill="#63b6d8"/><text x="16" class="ax">sold</text><rect x="90" y="-9" width="10" height="10" fill="#ffd27a"/><text x="106" class="ax">event night</text><rect x="230" y="-9" width="10" height="10" fill="#5b6b80"/><text x="246" class="ax">on the books</text></g>`;
    $("#occ").innerHTML = s;
    const ev = N.filter(n => n.past && n.event), nv = N.filter(n => n.past && !n.event);
    const avg = a => a.reduce((x, n) => x + n.revpar, 0) / Math.max(1, a.length);
    $("#occN").innerHTML = `Event nights earn <b>${$$(avg(ev))}</b> RevPAR against ${$$(avg(nv))} on other nights: the events diary is the hotel's best pricing signal.`;
  })();
  $("#seg").innerHTML = `<thead><tr><th>Segment</th><th>Bookings</th><th>Books ahead</th><th>Nights</th><th>Repeat</th></tr></thead><tbody>` +
    D.segments.map(s => `<tr><td>${esc(s.segment)}</td><td>${s.bookings}</td><td>${s.avg_lead} days</td><td>${s.avg_nights}</td><td>${s.repeat_pct}%</td></tr>`).join("") + "</tbody>";
  const bar = (rows, key) => rows.map(r => `<div class="hb"><span>${esc(r[key])}</span><i style="width:${r.pct}%"></i><b>${r.pct}%</b></div>`).join("");
  $("#ch").innerHTML = bar(D.channels, "name"); $("#lead").innerHTML = `<h3 class="mt2">Booked how far ahead</h3>` + bar(D.lead, "band");
  const ST = { "Occupied": "occ", "Check-out, to clean": "out", "Being cleaned": "cln", "Clean and ready": "rdy", "Out of order": "ooo" };
  $("#hkl").innerHTML = Object.entries(ST).map(([k, c]) => `<span class="${c}"><i></i>${esc(k)} <b>${D.housekeeping[k] || 0}</b></span>`).join("");
  $("#hk").innerHTML = ["L17", "L16"].map(lv => `<div><h3>Level ${lv.slice(1)}</h3><div class="rooms">${D.rooms.filter(r => r.level === lv).map(r => `<span class="rm ${ST[r.status]}" title="${esc(r.room)} · ${esc(r.type)} · ${esc(r.status)}">${esc(r.room)}</span>`).join("")}</div></div>`).join("");
  $("#cov").innerHTML = D.covers.map(c => `<div class="hb"><span>${esc(c.sitting)}</span><i style="width:${(c.booked + c.walk_in) / c.seats * 100}%"></i><b>${c.booked + c.walk_in}/${c.seats}</b></div><small class="note">${c.booked} booked · ${c.walk_in} walk-in</small>`).join("");
  const CC = { "Star": "pos", "Plough-horse": "", "Puzzle": "", "Dog": "neg" };
  $("#menu").innerHTML = `<thead><tr><th>Dish</th><th>Sold 7d</th><th>Profit a plate</th><th>Class</th><th>Shelly suggests</th></tr></thead><tbody>` +
    D.menu.slice().sort((a, b) => b.sold_7d * b.gp_each - a.sold_7d * a.gp_each).map(m => `<tr><td>${esc(m.item)} <small>$${m.price}</small></td><td>${m.sold_7d}</td><td>$${m.gp_each.toFixed(2)}</td><td class="${CC[m.class]}"><b>${esc(m.class)}</b></td><td>${esc(m.action)}</td></tr>`).join("") + "</tbody>";
  $("#ev").innerHTML = `<thead><tr><th>Date</th><th>Event</th><th>Room</th><th>Layout</th><th>Guests</th><th>Food and drink</th><th>Rooms blocked</th></tr></thead><tbody>` +
    D.events.map(e => `<tr><td>${esc(e.date)}</td><td><b>${esc(e.event)}</b></td><td>${esc(e.room)}</td><td>${esc(e.layout)}</td><td>${e.guests}</td><td>${$$(e.guests * e.fnb_per_head)}</td><td>${e.rooms_blocked}</td></tr>`).join("") + "</tbody>";
  $("#gxN").textContent = D.note;
  $("#gx").innerHTML = D.guest_experience.map(g => `<div class="gxr"><span>${esc(g.measure)}</span><div class="gxb"><i style="width:${g.score}%" class="${g.gap < 0 ? "lo" : "ok"}"></i><em style="left:${g.target}%" title="target ${g.target}%"></em></div><b class="${g.gap < 0 ? "neg" : "pos"}">${g.score}%</b><small>target ${g.target}%</small></div>`).join("");
  $("#foot").textContent = `Shelly v${D.version} · built ${D.generated} · as of ${D.asof} · synthetic data · bookings are counts and room numbers, never guest names`;
  window.SHELLY_GUIDE = {
    "s-act": `<b>Today's actions.</b> What the numbers point to; the general manager decides.`,
    "s-rev": `<b>Revenue management.</b> ${K.occ_pct}% occupancy at ${$$(K.adr)} a night. Gold bars are event nights: they earn the most.`,
    "s-res": `<b>Reservations.</b> Who books, through which channel and how far ahead. Corporate guests come back most often.`,
    "s-hk": `<b>Housekeeping.</b> Every room this morning. Clean the check-outs first so rooms are ready by two.`,
    "s-dine": `<b>Dining.</b> Covers per sitting and every dish scored: stars, plough-horses, puzzles and dogs.`,
    "s-events": `<b>Events.</b> The function diary for the next month; each one tells the store, the kitchen and housekeeping.`,
    "s-gx": `<b>Guest experience.</b> Synthetic survey scores against what a five-star stay needs. Room readiness is the gap.`,
  };
})();
