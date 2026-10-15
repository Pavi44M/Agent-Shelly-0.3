/* Shelly Tower floor by floor (synthetic data from docs/data/floors.js, built by scripts/build_floors.py) */
(function () {
  "use strict";
  const D = window.SHELLY_FLOORS, $ = s => document.querySelector(s);
  if (!D) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const F = D.floors, n = F.length;        // top (R) first, basement last
  $("#ver").textContent = D.version;
  const T = D.totals;
  $("#kpis").innerHTML = [[T.floors, "levels", "B3 to the rooftop"], [T.here_now, "people in now", "counted, never identified"], [T.washrooms, "washrooms", "accessible and all-gender on every floor"],
    [(T.energy_kwh / 1000).toFixed(1) + " MWh", "energy today", "by floor, below"]].map(([v, l, s]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(s)}</small></div>`).join("");

  // one colour per kind of room, so a plan reads at a glance
  const ZC = { work: "#2f6fd6", meet: "#7a5cc4", social: "#e0a32e", guest: "#ffd27a", clinic: "#3fb87f", retail: "#e8692f", tech: "#63b6d8", logistics: "#8a99ad", public: "#ff7ad9", outdoor: "#7fd1a8", empty: "#3a4658" };
  const zk = nm => /workspace|desks|trade floor|offices|control room|lab|maker|agent review|deal/i.test(nm) ? "work" : /meeting|boardroom|focus|team rooms|conference|breakout|translation|demo/i.test(nm) ? "meet"
    : /kitchen|café|cafe|lounge|seating|social|servery|food|quiet|restaurant|ballroom/i.test(nm) ? "social" : /guest|suite|apartment|housekeeping|laundry/i.test(nm) ? "guest"
    : /consult|treatment|waiting|pharmacy|gym|studio|changing|x-ray|ultrasound|lab and|ward|physio|family|urgent|triage|procedures|utility|staff base/i.test(nm) ? "clinic" : /aisles|fresh|chiller|checkout|locker|pods|showroom|media|retail/i.test(nm) ? "retail"
    : /server|security op|battery|cooling|control wall|operations|plant|AV/i.test(nm) ? "tech" : /robot|dispatch|returns|chilled store|parking|EV|valet|dock|waste|bike|scooter/i.test(nm) ? "logistics"
    : /lobby|plaza|reception|check-in|desk|entry/i.test(nm) ? "public" : /drone|vertiport|solar|garden/i.test(nm) ? "outdoor" : /shell|viewing/i.test(nm) ? "empty" : "work";
  const ZL = { work: "Work", meet: "Meet", social: "Eat and rest", guest: "Guests", clinic: "Care and wellbeing", retail: "Shop", tech: "Technology", logistics: "Logistics", public: "Welcome", outdoor: "Outdoor", empty: "To let" };

  let cur = F.findIndex(f => f.level === "2"); if (cur < 0) cur = 0;
  $("#levels").innerHTML = F.map((f, i) => `<li><button type="button" data-i="${i}" style="--c:${f.colour}"><span class="lv">${esc(f.level)}</span><span class="nm">${esc(f.name)}</span><span class="pp">${f.here_now}</span></button></li>`).join("");

  function draw() {
    const f = F[cur], P = f.plan, S = 14, pad = 24, W = P.w * S + pad * 2, H = P.h * S + pad * 2 + 18;
    [...$("#levels").querySelectorAll("button")].forEach((b, i) => { b.classList.toggle("on", i === cur); b.setAttribute("aria-current", i === cur ? "true" : "false"); });
    const on = $("#levels").querySelector("button.on"); if (on) on.scrollIntoView({ block: "nearest" });
    $("#flH").innerHTML = `<span class="lvb" style="--c:${f.colour}">${esc(f.level === "R" ? "Roof" : f.level.startsWith("B") ? f.level : "L" + f.level)}</span><div><h3>${esc(f.name)}</h3><small>${esc(f.occupant)} · ${esc(f.kind_label)} · ${f.area_m2.toLocaleString("en-NZ")} m²${f.page ? ` · <a href="${esc(f.page)}">open its workspace →</a>` : ""}</small><p>${esc(f.about)}</p></div>`;
    const X = v => pad + v * S, Y = v => pad + v * S;
    let s = `<rect x="${pad}" y="${pad}" width="${P.w * S}" height="${P.h * S}" rx="10" class="slab"/>`;
    const used = new Set();
    P.rooms.forEach(r => { const k = zk(r.name); used.add(k);
      s += `<g class="room"><rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * S}" height="${r.h * S}" rx="4" fill="${ZC[k]}" fill-opacity=".22" stroke="${ZC[k]}" stroke-opacity=".7"><title>${esc(r.name)} · about ${Math.round(r.w * r.h)} m²</title></rect>` +
        (r.label && r.w * S > 60 && r.h * S > 26 ? `<text x="${X(r.x + r.w / 2)}" y="${Y(r.y + r.h / 2) + 4}" text-anchor="middle" class="rl">${esc(r.name.length * 6.6 > r.w * S - 8 ? r.name.split(" ").slice(0, 2).join(" ") : r.name)}</text>` : "") + `</g>`; });
    P.core.forEach(c => { const wash = c.wash, lift = c.name === "Lifts", stair = /Stair/.test(c.name);
      s += `<g><rect x="${X(c.x)}" y="${Y(c.y)}" width="${c.w * S}" height="${c.h * S}" class="${wash ? "wash" : lift ? "liftc" : stair ? "stair" : "core"}"><title>${esc(c.name)}</title></rect>` +
        (c.w * S > 17 ? `<text x="${X(c.x + c.w / 2)}" y="${Y(c.y + c.h / 2) + 3}" text-anchor="middle" class="cl">${esc(wash ? ({ "Women's": "W", "Men's": "M", "All-gender": "AG", "Accessible": "♿", "Parents' room": "P" })[c.name] || c.name : lift ? "Lifts" : stair ? "Exit" : c.name === "Risers" ? "R" : "C")}</text>` : "") + `</g>`; });
    // people at work: one dot per person in now, spread over the rooms they work in (roles only)
    let seed = cur * 97 + 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spots = P.rooms.filter(r => r.roles && r.roles.length), dots = [];
    const total = f.here_now;
    for (let i = 0; i < total && spots.length; i++) { const r = spots[i % spots.length]; dots.push(`<circle cx="${X(r.x + .8 + rnd() * (r.w - 1.6))}" cy="${Y(r.y + .8 + rnd() * (r.h - 1.6))}" r="3.2" class="pd" style="animation-delay:${(rnd() * 3).toFixed(2)}s"/>`); }
    s += `<g aria-hidden="true">${dots.join("")}</g>`;
    s += `<text x="${pad}" y="${H - 6}" class="cl">${P.w} m × ${P.h} m · ● one dot per person on the floor now</text>`;
    const svg = $("#plan"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("aria-label", `Plan of ${f.name}`); svg.innerHTML = s;
    $("#legend").innerHTML = [...used].map(k => `<span><i style="background:${ZC[k]}"></i>${ZL[k]}</span>`).join("") + `<span><i class="lg-wash"></i>Washrooms</span><span><i class="lg-lift"></i>Lifts</span><span><i class="lg-stair"></i>Fire stairs</span>`;
    const R = Object.entries(f.roles).sort((a, b) => b[1] - a[1]);
    $("#roles").innerHTML = R.length ? R.map(([r, k]) => `<div class="rr"><span>${esc(r[0].toUpperCase() + r.slice(1))}${k > 1 ? "s" : ""}</span><b>${k}</b></div>`).join("") : `<p class="note">No one works here right now.</p>`;
    $("#tech").innerHTML = f.tech.map(t => `<li><b>${esc(t.name)}</b><span>${esc(t.does)}</span></li>`).join("");
    const y = f.systems;
    $("#sys").innerHTML = [[`${y.occupancy_pct}%`, "of the floor's people in now"], [`${y.energy_kwh.toLocaleString("en-NZ")} kWh`, "energy today"], [`${y.co2_ppm} ppm`, "CO₂, fresh-air guide"],
      [`${y.lift_wait_s} s`, "average lift wait"], [y.washroom_visits, "washroom visits today"], [y.cleaning_rounds, "cleaning rounds booked"]].map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
    $("#future").innerHTML = f.future ? `<b>Next for this floor:</b> ${esc(f.future)}` : "";
    try { history.replaceState(null, "", "#L" + f.level); } catch (e) { /* file:// */ }
  }
  const go = i => { cur = Math.max(0, Math.min(n - 1, i)); draw(); };
  $("#levels").addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { stop(); go(+b.dataset.i); } });
  $("#up").onclick = () => { stop(); go(cur - 1); }; $("#down").onclick = () => { stop(); go(cur + 1); };
  // the lift ride: from the basement up to the roof, a few seconds a floor
  let timer = null;
  function stop() { if (timer) { clearInterval(timer); timer = null; $("#ride").textContent = "▶ Ride the lift"; } }
  $("#ride").onclick = () => { if (timer) return stop(); if (cur === 0) cur = n - 1; else cur = Math.min(cur, n - 1); draw(); $("#ride").textContent = "■ Stop";
    dispatchEvent(new CustomEvent("shelly:mood", { detail: { mood: "happy", ms: 1500 } }));
    timer = setInterval(() => { if (cur === 0) return stop(); go(cur - 1); }, 4500); };
  const h = (location.hash.match(/^#L(.+)$/) || [])[1]; if (h) { const i = F.findIndex(f => f.level === decodeURIComponent(h)); if (i >= 0) cur = i; }
  draw();
  $("#foot").textContent = `Shelly v${D.version} · built ${D.generated} · plans drawn from each floor's area · people are counts by role · synthetic data`;
  window.SHELLY_GUIDE = {
    "s-tour": `<b>Floor by floor.</b> Pick a level or press ▶ to ride the lift from the dock to the roof. Every dot is a person at work: a count, never a face.`,
    "s-core": `<b>The same core on every floor.</b> Lifts in the middle, two fire stairs, and accessible and all-gender washrooms on every level.`,
  };
})();
