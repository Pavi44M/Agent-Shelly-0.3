/* Store Floor v3 panels, in the style of Shelly HQ v2:
   a clock bar (day, time, speed, play/pause, jump to NZ now), a live card over the
   stage, and the side panel tabs: Shelf (from store.js) · Tasks · Team · Day. */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = s => document.querySelector(s);

export function initUI(ctx, S, { fmt, hm, DAYS }) {
  const ops = $("#ops"), live = $("#live");
  ops.hidden = false; live.hidden = false;
  const SPEEDS = [[1, "1×"], [30, "30×"], [60, "60×"], [180, "180×"]];
  ops.innerHTML =
    `<div class="clock"><b id="clk">--:--</b><span id="clkDay"></span><span class="chip" id="openChip"></span></div>` +
    `<button type="button" class="ctl" id="play" aria-label="Pause">❚❚</button>` +
    `<div class="seg" role="group" aria-label="Speed">${SPEEDS.map(([v, l]) => `<button type="button" data-sp="${v}" aria-pressed="${v === S.speed}">${l}</button>`).join("")}</div>` +
    `<label class="daypick"><span class="tag">Day</span><select id="dayPick" aria-label="Day of the week">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select></label>` +
    `<div class="seg" role="group" aria-label="Jump to"><button type="button" data-jump="05:50">6am shift</button><button type="button" data-jump="12:00">Midday</button><button type="button" data-jump="17:00">5pm rush</button><button type="button" data-jump="20:50">Close</button><button type="button" id="nowBtn">Now (NZ)</button></div>`;
  ops.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sp) { S.setSpeed(+b.dataset.sp); ops.querySelectorAll("[data-sp]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); }
    else if (b.id === "play") { S.toggle(); }
    else if (b.dataset.jump) S.setTime(S.day, hm(b.dataset.jump));
    else if (b.id === "nowBtn") { const n = S.nzNow(); S.setTime(n.day, n.t); S.setSpeed(1); ops.querySelectorAll("[data-sp]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.sp === "1"))); }
    update();
  });
  $("#dayPick").addEventListener("change", e => { S.setTime(+e.target.value, hm("05:50")); update(); });

  /* tabs */
  const tabs = $("#tabs");
  tabs.hidden = false;
  const show = k => { tabs.querySelectorAll("[role=tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === k)));
    ["shelf", "tasks", "team", "day"].forEach(n => { const p = $("#pane-" + n); if (p) p.hidden = n !== k; }); cur = k; update(); };
  let cur = "tasks";
  tabs.addEventListener("click", e => { const t = e.target.closest("[role=tab]"); if (t) show(t.dataset.tab); });
  window.addEventListener("store:shelf", () => show("shelf"));
  let filt = "all", personId = null;
  $("#pane-tasks").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b) { filt = b.dataset.f; update(); } });
  $("#pane-team").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) { personId = b.dataset.p === personId ? null : b.dataset.p; update(); } });

  const staffA = () => S.agents.filter(a => a.kind === "staff");
  const stateOf = m => {
    const a = S.agents.find(x => x.id === m.id);
    if (!a) return S.t < m.start - 8 ? ["off", `Starts ${fmt(m.start)}`] : S.t >= m.end ? ["off", `Finished ${fmt(m.end)}`] : ["off", "Off today"];
    if (a.state === "arriving") return ["walk", "Arriving for shift"];
    if (a.state === "leaving") return ["off", "Heading home"];
    if (a.state === "break" || a.state === "toBreak" || a.state === "rest") return ["brk", `${a.brk ? a.brk.name : "Break"} until ${fmt((a.brk?.started ?? S.t) + (a.brk?.minutes ?? 10))}`];
    if (a.task) return [a.task.kind === "till" || a.task.kind === "cafe" ? "till" : "work", a.task.title];
    return a.role === "Store Manager" ? ["work", "Admin at the desk"] : ["work", "Looking for the next job"];
  };
  function liveCard() {
    const cust = S.agents.filter(a => a.kind === "customer").length, team = staffA(), onBreak = team.filter(a => ["break", "toBreak", "rest"].includes(a.state)).length;
    const dm = team.find(a => a.role === "Duty Manager");
    live.innerHTML = `<span class="tag">In store now</span><div class="lv"><div><b>${cust}</b><span>customers</span></div><div><b>${S.queue.length}</b><span>in queue</span></div>` +
      `<div><b>${team.length}</b><span>team${onBreak ? ` · ${onBreak} on break` : ""}</span></div><div><b>${S.stats.served}</b><span>served today</span></div></div>` +
      `<div class="lv2"><span>Self-checkouts <b>${S.agents.filter(a => a.kind === "customer" && ["scanning", "help", "toKiosk"].includes(a.state)).length}/${(S.OPS.self_checkouts || {}).count || 0}</b></span>` +
      `<span>Café <b class="${S.cafeTill && S.cafeTill.status === "progress" ? "on" : ""}">${S.cafeTill && S.t < (S.OPS.cafe ? hm(S.OPS.cafe.close) : 0) && S.t >= (S.OPS.cafe ? hm(S.OPS.cafe.open) : 0) ? "open" : "closed"}</b></span>` +
      `<span>Trolleys <b>${S.trolleys ? S.trolleys.bay : 0}</b></span><span>Baskets <b>${S.baskets ? S.baskets.door : 0}</b></span></div>` +
      (dm ? `<p>★ ${esc(dm.name)} is Duty Manager · ${esc(stateOf(dm.m)[1])}</p>` : "");
  }
  function tasksPane() {
    const list = S.tasks.filter(t => !t.filler || t.status !== "scheduled");
    const c = k => list.filter(t => t.status === k).length;
    const F = [["all", "All", list.length], ["scheduled", "Scheduled", c("scheduled")], ["waiting", "Waiting", c("waiting")], ["progress", "In progress", c("progress")], ["done", "Done", c("done")]];
    let rows = list.filter(t => filt === "all" || t.status === filt);
    const ord = { progress: 0, waiting: 1, scheduled: 2, done: 3 };
    rows = rows.sort((a, b) => ord[a.status] - ord[b.status] || (a.status === "done" ? (b.doneAt - a.doneAt) : a.due - b.due)).slice(0, 60);
    const next = S.tasks.filter(t => t.status === "scheduled" && !t.filler).sort((a, b) => a.due - b.due)[0];
    $("#pane-tasks").innerHTML = `<div class="ts-h"><h3>Task status</h3><span class="tag">whole store</span></div>` +
      `<div class="fchips">${F.map(([k, l, n]) => `<button type="button" data-f="${k}" aria-pressed="${filt === k}" class="${k}">${l} ${n}</button>`).join("")}</div>` +
      (next ? `<p class="next">Next · ${fmt(next.due)} · ${esc(next.title)}</p>` : "") +
      rows.map(t => {
        const who = t.who ? (S.agents.find(a => a.id === t.who) || {}).name : t.doneBy;
        const pctv = Math.round((t.status === "done" ? 1 : t.progress) * 100);
        return `<div class="tk ${t.status}"><span class="st ${t.status}">${t.status === "progress" ? (t.kind === "till" || t.kind === "cafe" ? "LIVE" : pctv + "%") : t.status === "done" ? "DONE" : t.status === "waiting" ? "WAIT" : fmt(t.due)}</span>` +
          `<div><b>${esc(t.title)}</b><small>${esc(t.area || "")}${who ? " · " + esc(who) : ""}${t.status === "done" ? " · done " + fmt(t.doneAt) : t.status === "waiting" ? " · due " + fmt(t.due) : ""}${t.shelly ? " · from Shelly" : ""}</small>` +
          (t.status === "progress" && t.kind !== "till" && t.kind !== "cafe" ? `<i class="bar"><i style="width:${pctv}%"></i></i>` : "") + `</div></div>`;
      }).join("");
  }
  function teamPane() {
    const rows = S.staff.map(m => { const [k, txt] = stateOf(m); const sel = m.id === personId;
      const brk = m.breaks.map(b => `<span class="${b.done ? "ok" : S.t >= b.at ? "now" : ""}">${esc(b.name)} ${fmt(b.at)}</span>`).join("");
      return `<button type="button" class="tm ${sel ? "sel" : ""}" data-p="${esc(m.id)}"><i class="dot ${k}"></i><div><b>${m.role === "Duty Manager" ? "★ " : ""}${esc(m.name)}</b>` +
        `<small>${esc(m.role)}${m.station ? " · " + (m.station === "till" ? "main checkout" : "café till") : ""} · ${esc(m.shiftName)} ${fmt(m.start)}–${fmt(m.end)}</small><span class="now">${esc(txt)}</span>` +
        (sel ? `<span class="brks">${brk}</span>` : "") + `</div></button>`; }).join("");
    const cust = S.agents.filter(a => a.kind === "customer").length;
    $("#pane-team").innerHTML = `<div class="ts-h"><h3>Team on ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][S.day]}</h3><span class="tag">${S.staff.length} rostered</span></div>${rows}` +
      `<p class="note">Breaks: ${S.OPS.breaks.map(b => `${b.minutes} min after ${b.after_h}h`).join(" · ")}, staggered ${S.OPS.break_stagger_minutes} min so the till stays covered. ${cust} customers in store, ${S.stats.entered} came in today (peak ${S.stats.peak} at once).</p>`;
  }
  function dayPane() {
    const x0 = hm("05:30"), x1 = hm("22:00"), W = 320, X = t => 70 + (t - x0) / (x1 - x0) * (W - 74);
    const rowH = 16, top = 26;
    let svg = `<svg viewBox="0 0 ${W} ${top + S.staff.length * rowH + 110}" class="tl" role="img" aria-label="Today's roster, breaks and footfall">`;
    svg += `<rect x="${X(S.OPEN)}" y="14" width="${X(S.CLOSE) - X(S.OPEN)}" height="${S.staff.length * rowH + 14}" class="open"/>`;
    for (let h = 6; h <= 22; h += 2) svg += `<line x1="${X(h * 60)}" x2="${X(h * 60)}" y1="12" y2="${top + S.staff.length * rowH + 92}" class="gl"/><text x="${X(h * 60)}" y="9" class="ax">${h > 12 ? h - 12 + "p" : h + (h === 12 ? "p" : "a")}</text>`;
    S.staff.forEach((m, i) => { const y = top + i * rowH;
      svg += `<text x="0" y="${y + 9}" class="nm">${esc(m.name)}</text><rect x="${X(m.start)}" y="${y}" width="${X(m.end) - X(m.start)}" height="11" rx="3" class="sh ${m.role === "Duty Manager" ? "dm" : m.role === "Store Manager" ? "smg" : ""}"/>`;
      m.breaks.forEach(b => { svg += `<rect x="${X(b.at)}" y="${y}" width="${Math.max(2, X(b.at + b.minutes) - X(b.at))}" height="11" class="bk"/>`; }); });
    const fy = top + S.staff.length * rowH + 20, F = S.OPS.footfall, mx = Math.max(...Object.values(F));
    const pts = Object.entries(F).map(([h, v]) => [X(+h * 60 + 30), fy + 60 - v / mx * 56]);
    svg += `<text x="0" y="${fy + 34}" class="nm">Customers</text><polygon points="${X(S.OPEN)},${fy + 60} ${pts.map(p => p.join(",")).join(" ")} ${X(S.CLOSE)},${fy + 60}" class="ff"/>`;
    if (S.delivery) svg += `<line x1="${X(hm(S.OPS.deliveries.arrive))}" x2="${X(hm(S.OPS.deliveries.arrive))}" y1="14" y2="${fy + 60}" class="dl"/><text x="${X(hm(S.OPS.deliveries.arrive)) + 3}" y="${fy + 74}" class="ax dlt">delivery</text>`;
    svg += `<line x1="${X(S.t)}" x2="${X(S.t)}" y1="10" y2="${fy + 64}" class="nowl"/></svg>`;
    const done = S.tasks.filter(t => t.status === "done" && !t.filler).length, all = S.tasks.filter(t => !t.filler).length;
    $("#pane-day").innerHTML = `<div class="ts-h"><h3>${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][S.day]}</h3><span class="tag">${S.delivery ? "delivery day" : "no delivery"}</span></div>${svg}` +
      `<div class="legend"><span><i class="lg sh"></i>shift</span><span><i class="lg dm"></i>duty manager</span><span><i class="lg bk"></i>break</span><span><i class="lg op"></i>open ${fmt(S.OPEN)}–${fmt(S.CLOSE)}</span>${S.OPS.cafe ? `<span>café ${S.OPS.cafe.open}–${S.OPS.cafe.close}</span>` : ""}</div>` +
      `<p class="note">${done} of ${all} planned jobs done · ${S.stats.served} customers served (${S.stats.self || 0} at self-checkouts, ${S.stats.cafe || 0} at the café). Deliveries ${S.OPS.deliveries.days.join(", ")} at ${S.OPS.deliveries.arrive}. About ${S.OPS.customers_per_day} customers a day from average sales of $${S.OPS.avg_daily_sales.toLocaleString("en-NZ")} at a $${S.OPS.avg_basket_nzd} basket.</p>` +
      `<div class="logl"><p class="sub-h">What's happening</p>${S.log.slice(0, 14).map(l => `<div><span>${fmt(l.t)}</span>${esc(l.s)}</div>`).join("")}</div>`;
  }
  let holding = false;                                   // don't redraw a panel under a finger or mouse
  $("#side").addEventListener("pointerdown", () => { holding = true; });
  window.addEventListener("pointerup", () => setTimeout(() => { holding = false; }, 120));
  function update() {
    if (holding) return;
    $("#clk").textContent = fmt(S.t); $("#clkDay").textContent = DAYS[S.day] + (S.delivery ? " · delivery" : "");
    const open = S.doorsOpen && S.t < S.CLOSE; const oc = $("#openChip"); oc.textContent = open ? "OPEN" : "CLOSED"; oc.className = "chip " + (open ? "on" : "off");
    $("#play").textContent = S.playing ? "❚❚" : "▶"; $("#play").setAttribute("aria-label", S.playing ? "Pause" : "Play");
    $("#dayPick").value = String(S.day);
    liveCard();
    if (cur === "tasks") tasksPane(); else if (cur === "team") teamPane(); else if (cur === "day") dayPane();
  }
  show("tasks");
  return { update, showPerson: id => { if (id.startsWith("c")) return; personId = id; show("team"); } };
}
