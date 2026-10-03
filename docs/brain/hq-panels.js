/* Shelly HQ v2: panels (works with or without 3D).
   Left: departments overview, or the focused department with its head ("ask the head"), approvals and agents.
   Right: task composer + Task status (scheduled · backlog · in progress · waiting · done).
   Sheets: Calendar (routines + tasks), Funds (Finance's funds control), Opportunities (future businesses).
   Shared state on this device: approvals via ShellyKit; tasks "shelly.hq.tasks"; opportunities "shelly.hq.opps". */

const B = window.SHELLY_BRAIN;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const money = v => (v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v || 0)).toLocaleString("en-NZ");
export const DEP = Object.fromEntries(B.departments.map(d => [d.id, d]));
export const AG = Object.fromEntries(B.agents.map(a => [a.id, a]));
const BIZ = Object.fromEntries(B.businesses.map(b => [b.id, b]));
const K = () => window.ShellyKit;
const items = () => (K() ? K().items() : (window.SHELLY_APPROVALS || { items: [] }).items);
const openItems = () => (K() ? K().open() : items());
const stepOf = it => (K() ? K().stepOf(it) : 0);
const chainOf = it => (K() ? K().chainOf(it) : it.chain || []);
const stateOf = it => (K() ? K().stateOf(it) : null);
const curDept = it => { const c = chainOf(it)[stepOf(it)]; return c ? c.dept : it.dept; };
const curRole = it => { const c = chainOf(it)[stepOf(it)]; return c ? c.role.replace(/ \(.*\)/, "") : "Pavi"; };
const STATUS_L = { next: "Scheduled", backlog: "Backlog", doing: "In progress", waiting: "Waiting", done: "Done" };

/* ---------------- state shared with the 3D scene */
export const S = { focus: null, biz: "", filter: "all", listeners: [] };
export function on(fn) { S.listeners.push(fn); }
function emit(what) { S.listeners.forEach(f => { try { f(what); } catch (e) { /* */ } }); }
export function focus(id) { S.focus = id && DEP[id] ? id : null; renderLeft(); renderRight(); emit("focus"); }

/* ---------------- approvals policy in the browser (mirrors shelly/brain/registry.approval_chain) */
function chainFor(dept, area, amount) {
  const P = B.policy, amt = Math.abs(amount || 0), al = area.toLowerCase();
  let steps;
  if (area === "Pay run") steps = ["office", "finance"];
  else {
    const toM = amt > DEP.finance.limit || P.always_mgmt.some(k => al.includes(k.toLowerCase()));
    const toF = toM || amt > DEP[dept].limit || P.always_finance.some(k => al.includes(k.toLowerCase()));
    steps = [dept]; if (toF && dept !== "finance") steps.push("finance"); if (toM) steps.push("pavi");
  }
  return steps.map(x => x === "pavi" ? { dept: "mgmt", role: "Pavi (Managing Director)", head: "mgmt-head", final: true }
    : { dept: x, role: x === "mgmt" ? "Chief of Staff" : DEP[x].head, head: DEP[x].head_agent });
}

/* ---------------- tasks: built-in work + tasks added here + approvals waiting */
function localTasks() { return ls.get("shelly.hq.tasks", []) || []; }
function saveLocal(list) { ls.set("shelly.hq.tasks", list); }
export function allTasks() {
  const base = B.tasks.map(t => ({ ...t, src: "brain" }));
  const loc = localTasks().map(t => ({ ...t, src: "local" }));
  const wait = items().filter(it => !stateOf(it) || stateOf(it)).map(it => {
    const st = stateOf(it);
    return { id: "ap:" + it.key, agent: it.agent, dept: it.dept || (AG[it.agent] || {}).department, business: it.business,
      status: st ? "done" : "waiting", text: it.title, src: "approval", key: it.key, amount: it.amount,
      sub: st ? (st === "y" ? "Approved" : "Rejected") : `Waiting for ${curRole(it)}` + (chainOf(it).length > 1 ? ` · step ${stepOf(it) + 1}/${chainOf(it).length}` : "") };
  });
  return [...loc, ...wait, ...base];
}
function visible(t) {
  if (S.biz && t.business !== S.biz && !(S.biz === "group" && t.business === "group")) return false;
  if (S.focus && t.dept !== S.focus) return false;
  return true;
}

/* ---------------- department figures */
export function deptStats(id) {
  const ts = allTasks().filter(t => t.dept === id);
  const waitHere = openItems().filter(it => curDept(it) === id);
  const raised = openItems().filter(it => (it.dept || (AG[it.agent] || {}).department) === id);
  const fs = funds().find(f => f.id === id);
  return { doing: ts.filter(t => t.status === "doing").length, next: ts.filter(t => t.status === "next").length,
    done: ts.filter(t => t.status === "done").length, backlog: ts.filter(t => t.status === "backlog").length,
    waitHere, raised, funds: fs };
}

/* ---------------- funds control (Finance) */
export function funds() {
  return B.departments.map(d => {
    let committed = 0, pending = 0;
    items().forEach(it => {
      if ((it.dept || (AG[it.agent] || {}).department) !== d.id || !it.amount || !it.spend) return;   // only real spend requests use budget
      const st = stateOf(it); if (st === "y") committed += it.amount; else if (!st) pending += it.amount;
    });
    const used = d.spent + committed;
    return { id: d.id, name: d.name, colour: d.colour, budget: d.budget, spent: d.spent, committed, pending, left: d.budget - used,
      pct: d.budget ? used / d.budget : 0 };
  });
}

/* ---------------- ask the department head */
function intentOf(q) {
  q = q.toLowerCase();
  if (/issue|problem|risk|block|stall|wrong|late/.test(q)) return "issues";
  if (/approv|sign|waiting|pending/.test(q)) return "waiting";
  if (/next|tomorrow|today|schedule|plan|upcoming/.test(q)) return "next";
  if (/budget|fund|money|spend|cost/.test(q)) return "budget";
  if (/status|how are|how is|update|progress|doing/.test(q)) return "status";
  return "route";
}
function nextRoutines(dept, hours = 48) {
  const now = new Date(), out = [];
  for (let h = 0; h < hours; h += 24) {
    const day = new Date(now.getTime() + h * 3600e3), dn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()];
    B.routines.filter(r => r.dept === dept && (r.days ? r.days.includes(dn) : day.getDate() === r.monthday)).forEach(r => {
      const [hh, mm] = r.time.split(":").map(Number), at = new Date(day); at.setHours(hh, mm, 0, 0);
      if (at > now) out.push({ at, r });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
const when = d => { const n = new Date(), t = d.toTimeString().slice(0, 5); return d.toDateString() === n.toDateString() ? `today ${t}` : `${d.toLocaleDateString("en-NZ", { weekday: "short" })} ${t}`; };
export function headAnswer(dept, q) {
  const d = DEP[dept], st = deptStats(dept), f = st.funds, head = AG[d.head_agent], it = intentOf(q);
  const kp = d.kpis.map(k => `${k.label} ${k.value}`).join(" · ");
  if (it === "status") return `${d.name} status: ${d.agents.length} agents · ${st.doing} in progress, ${st.next} scheduled, ${st.done} done.`
    + ` ${st.waitHere.length ? `${st.waitHere.length} waiting for my sign-off.` : "Nothing waiting for my sign-off."}`
    + (st.raised.length ? ` ${st.raised.length} of our requests are in approval.` : "")
    + (d.budget ? ` Budget ${Math.round(f.pct * 100)}% used (${money(f.left)} left).` : "") + (kp ? ` ${kp}.` : "");
  if (it === "issues") {
    const iss = [];
    const att = d.agents.map(id => AG[id]).filter(a => a.status === "attention");
    if (st.waitHere.length) iss.push(`${st.waitHere.length} request${st.waitHere.length > 1 ? "s" : ""} waiting for me: ${st.waitHere.slice(0, 2).map(x => "“" + x.title.slice(0, 60) + "”").join(", ")}`);
    const stuck = st.raised.filter(x => curDept(x) !== dept); if (stuck.length) iss.push(`${stuck.length} of ours waiting elsewhere (${[...new Set(stuck.map(curRole))].join(", ")})`);
    if (d.budget && f.pct > 0.8) iss.push(`budget at ${Math.round(f.pct * 100)}%`);
    if (att.length) iss.push(`${att.map(a => a.name).join(", ")} need${att.length > 1 ? "" : "s"} a person's decision on escalations`);
    d.kpis.forEach(k => { if (/^-|−/.test(String(k.value))) iss.push(`${k.label} is ${k.value}`); });
    return iss.length ? `Open issues in ${d.name}: ` + iss.join("; ") + "." : `No open issues in ${d.name}.`;
  }
  if (it === "waiting") {
    if (!st.waitHere.length && !st.raised.length) return "Nothing waiting for approval in this department.";
    return (st.waitHere.length ? `Waiting for me (${d.head}): ` + st.waitHere.slice(0, 4).map(x => `“${x.title.slice(0, 70)}”${x.amount ? " " + money(x.amount) : ""}`).join("; ") + "." : "")
      + (st.raised.filter(x => curDept(x) !== dept).length ? ` With others: ` + st.raised.filter(x => curDept(x) !== dept).slice(0, 3).map(x => `“${x.title.slice(0, 50)}” → ${curRole(x)}`).join("; ") + "." : "");
  }
  if (it === "next") {
    const r = nextRoutines(dept).slice(0, 4), nx = allTasks().filter(t => t.dept === dept && t.status === "next").slice(0, 3);
    return `Next in ${d.name}: ` + [...r.map(x => `${when(x.at)} ${AG[x.r.agent].name}: ${x.r.what}`), ...nx.map(t => t.text)].slice(0, 5).join("; ") + ".";
  }
  if (it === "budget") return d.budget ? `${d.name} budget ${money(d.budget)}/month: spent ${money(f.spent)}, approved ${money(f.committed)}, pending ${money(f.pending)}, ${money(f.left)} left. I sign up to ${money(d.limit)}; above that Finance checks funds.`
    : `${d.name} has no monthly budget of its own; spend is approved case by case (I sign up to ${money(d.limit)}).`;
  // route to an agent inside the department
  const words = new Set((q.toLowerCase().match(/[a-zāēīōū]{3,}/g) || []));
  let best = head, sc = 0;
  d.agents.map(id => AG[id]).forEach(a => {
    const hay = (a.triggers.join(" ") + " " + a.name + " " + a.mission).toLowerCase(); let s = 0; words.forEach(w => { if (hay.includes(w)) s++; });
    if (s > sc && s >= 2) { sc = s; best = a; } });
  const w = (best.work || []).find(x => x[0] === "doing") || (best.work || [])[0];
  return `That's for ${best.name}${best.id === head.id ? " (me)" : ""}: ${best.mission}${w ? ` Right now: ${w[1]}.` : ""}`;
}

/* ---------------- left panel */
let chat = {};
export function renderLeft() {
  const el = $("#hqLeft"); if (!el) return;
  if (!S.focus) {
    const waitP = openItems().filter(it => chainOf(it)[stepOf(it)] && chainOf(it)[stepOf(it)].final).length;
    const fs = funds(), tb = fs.reduce((a, f) => a + f.budget, 0), tu = fs.reduce((a, f) => a + f.spent + f.committed, 0);
    el.innerHTML = `<div class="pnl"><div class="pnl-k">Shelly Group</div><div class="big">${B.departments.length} <small>departments</small></div>
      <div class="kv"><span>Agents</span><b>${B.agents.length}</b></div><div class="kv"><span>Waiting for you (final sign-off)</span><b class="warn">${waitP}</b></div>
      <div class="kv"><span>Waiting with department heads</span><b>${openItems().length - waitP}</b></div>
      <div class="kv"><span>Budgets used this month</span><b>${Math.round(tu / tb * 100)}%</b></div></div>
      <div class="pnl-k" style="margin:14px 0 6px">Departments · tap to go in</div>
      ${B.departments.map(d => { const st = deptStats(d.id); return `<button class="dep-row" data-dep="${esc(d.id)}" style="--c:${esc(d.colour)}">
        <i style="background:${esc(d.colour)}"></i><span><b>${esc(d.name)}</b><small>★ ${esc(AG[d.head_agent].name)} · ${esc(d.head)}</small></span>
        <em>${d.agents.length}</em>${st.waitHere.length ? `<span class="w">⚠ ${st.waitHere.length}</span>` : ""}</button>`; }).join("")}
      <p class="pnl-note">Approvals: ${esc(B.policy.summary[0])} ${esc(B.policy.summary[1])} ${esc(B.policy.summary[2])}</p>`;
    $$(".dep-row", el).forEach(b => b.onclick = () => focus(b.dataset.dep));
    return;
  }
  const d = DEP[S.focus], st = deptStats(d.id), head = AG[d.head_agent], f = st.funds;
  const log = chat[d.id] || (chat[d.id] = [{ who: "head", t: headAnswer(d.id, "status") + " What would you like to know?" }]);
  el.innerHTML = `<div class="pnl" style="--c:${esc(d.colour)}"><div class="pnl-k"><i class="dot" style="background:${esc(d.colour)}"></i>${esc(d.name)}</div>
      <div class="big">${d.agents.length} <small>agents</small></div>
      ${d.kpis.map(k => `<div class="kv"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join("")}
      <div class="dnd"><span>Doing <b>${st.doing}</b></span><span>Next <b>${st.next}</b></span><span>Done <b>${st.done}</b></span></div>
      ${st.waitHere.length ? `<div class="wpill">⚠ ${st.waitHere.length} waiting for ${esc(d.head)}</div>` : ""}</div>
    <div class="pnl head-card" style="--c:${esc(d.colour)}"><div class="hc-t">★ ${esc(head.name)}</div>
      <div class="hc-s">${esc(d.name)} head · ${esc(d.head)} · signs up to ${money(d.limit)}${d.budget ? ` · budget ${money(d.budget)}/mo (${Math.round(f.pct * 100)}% used)` : ""}</div>
      <p class="hc-m">${esc(head.mission)}</p>
      <div class="chat" id="hqChat" aria-live="polite">${log.map(m => `<div class="msg ${m.who}">${esc(m.t)}</div>`).join("")}</div>
      <div class="chips">${["Status", "Issues", "Waiting approvals", "What's next", "Budget"].map(c => `<button data-q="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <form class="ask-head" id="hqAsk"><input id="hqAskQ" maxlength="160" placeholder="Message ${esc(head.name)}…" aria-label="Message the department head"><button>Send</button></form></div>
    ${st.waitHere.length ? `<div class="pnl"><div class="pnl-k">Waiting for ${esc(d.head)}</div>${st.waitHere.slice(0, 6).map(apRow).join("")}</div>` : ""}
    <div class="pnl"><div class="pnl-k">Team</div>${d.agents.map(id => AG[id]).map(a => `<button class="ag-row" data-agent="${esc(a.id)}">
      <i style="background:${esc(BIZ[a.business].colour)}"></i><span><b>${a.id === d.head_agent ? "★ " : ""}${esc(a.name)}</b><small>${esc(a.team)}</small></span>
      ${a.pending ? `<em class="w">${a.pending}</em>` : ""}</button>`).join("")}</div>`;
  const box = $("#hqChat", el); box.scrollTop = box.scrollHeight;
  const ask = q => { log.push({ who: "me", t: q }, { who: "head", t: headAnswer(d.id, q) }); renderLeft(); };
  $$("[data-q]", el).forEach(b => b.onclick = () => ask(b.dataset.q));
  $("#hqAsk", el).onsubmit = e => { e.preventDefault(); const q = $("#hqAskQ", el).value.trim(); if (q) ask(q); };
  $$(".ag-row", el).forEach(b => b.onclick = () => window.ShellyBrain && window.ShellyBrain.openAgent(b.dataset.agent));
  bindAp(el);
}
function apRow(it) {
  const ch = chainOf(it), at = stepOf(it);
  return `<div class="ap-mini"><b>${esc(it.title)}</b><small>${esc(it.area)}${it.amount ? " · " + money(it.amount) : ""} · ${esc((AG[it.agent] || {}).name || it.agent)}</small>
    <div class="steps">${ch.map((c, i) => `<span class="${i < at ? "ok" : i === at ? "now" : ""}">${i < at ? "✓" : i === at ? "●" : "○"} ${esc(c.role.replace(/ \(.*\)/, ""))}</span>`).join("<i>›</i>")}</div>
    <div class="r"><button class="yes" data-sign="y" data-k="${esc(it.key)}">✓ ${at < ch.length - 1 ? "Approve as " + esc(curRole(it)) : "Approve"}</button><button class="no" data-sign="n" data-k="${esc(it.key)}">✕</button></div></div>`;
}
function bindAp(el) {
  $$("[data-sign]", el).forEach(b => b.onclick = () => { const it = items().find(x => x.key === b.dataset.k); if (it && K()) K().sign(it, b.dataset.sign); });
}

/* ---------------- right panel: composer + task status */
export function renderRight() {
  const el = $("#hqRight"); if (!el) return;
  const ts = allTasks().filter(visible);
  const cnt = k => k === "all" ? ts.length : ts.filter(t => t.status === k).length;
  const list = ts.filter(t => S.filter === "all" || t.status === S.filter)
    .sort((a, b) => ["waiting", "doing", "next", "backlog", "done"].indexOf(a.status) - ["waiting", "doing", "next", "backlog", "done"].indexOf(b.status));
  const nx = (S.focus ? nextRoutines(S.focus, 30) : B.departments.flatMap(d => nextRoutines(d.id, 30)).sort((a, b) => a.at - b.at))[0];
  const dsel = S.focus || "office";
  el.innerHTML = `<form class="pnl compose" id="hqNew"><div class="row"><select id="hqNewDep" aria-label="Department">${B.departments.map(d => `<option value="${esc(d.id)}" ${d.id === dsel ? "selected" : ""}>● ${esc(d.name)}</option>`).join("")}</select></div>
      <input id="hqNewT" maxlength="140" placeholder="Type a task for ${esc(DEP[dsel].name)}…" aria-label="New task">
      <div class="row"><select id="hqNewW" aria-label="When"><option value="now">Now</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="backlog">Backlog</option></select>
      <select id="hqNewR" aria-label="Repeat"><option value="">Once</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select>
      <label class="amt"><span>$</span><input id="hqNewA" inputmode="numeric" placeholder="spend" aria-label="Spend needing sign-off (optional)"></label><button class="add">Add</button></div>
      <p class="hint" id="hqNewHint">${esc(S.hint || "The task goes to the best agent in that department. Add a spend and it joins the approval chain.")}</p></form>
    <div class="pnl ts"><div class="ts-h"><b>Task status</b><span>${S.focus ? esc(DEP[S.focus].name) : "Whole office"}${S.biz ? " · " + esc(BIZ[S.biz].name) : ""}</span></div>
      <div class="ts-f">${["all", "next", "backlog", "doing", "waiting", "done"].map(k => `<button data-tf="${k}" aria-pressed="${S.filter === k}" class="${k}">${k === "all" ? "All" : STATUS_L[k]} ${cnt(k)}</button>`).join("")}</div>
      ${nx ? `<div class="ts-next">Next ● ${esc(when(nx.at))} · ${esc(AG[nx.r.agent].name)}: ${esc(nx.r.what)}</div>` : ""}
      <div class="ts-list">${list.slice(0, 60).map(t => {
        const a = AG[t.agent] || {}, d = DEP[t.dept] || {};
        return `<div class="tcard ${t.status}"><span class="st ${t.status}">${STATUS_L[t.status]}</span><b>${esc(t.text)}</b>
          <small>${esc(a.name || "")} · <span style="color:${esc(d.colour || "#7d8a9c")}">${esc(d.name || "")}</span>${t.sub ? " · " + esc(t.sub) : ""}${t.when ? " · " + esc(t.when) : ""}${t.repeat ? " · repeats " + esc(t.repeat) : ""}</small>
          ${t.src === "approval" && t.status === "waiting" ? `<div class="r"><button class="yes" data-sign="y" data-k="${esc(t.key)}">✓ Approve as ${esc(curRole(items().find(x => x.key === t.key)))}</button><button class="no" data-sign="n" data-k="${esc(t.key)}">✕</button></div>` : ""}
          ${t.src === "local" ? `<div class="r">${t.status !== "done" ? `<button data-done="${esc(t.id)}">✓ Done</button>` : ""}<button data-del="${esc(t.id)}">Cancel</button></div>` : ""}</div>`;
      }).join("") || '<p class="empty">Nothing here.</p>'}</div></div>`;
  $$("[data-tf]", el).forEach(b => b.onclick = () => { S.filter = b.dataset.tf; renderRight(); });
  bindAp(el);
  $$("[data-done]", el).forEach(b => b.onclick = () => { saveLocal(localTasks().map(t => t.id === b.dataset.done ? { ...t, status: "done" } : t)); refreshAll(); });
  $$("[data-del]", el).forEach(b => b.onclick = () => { saveLocal(localTasks().filter(t => t.id !== b.dataset.del)); refreshAll(); });
  $("#hqNewDep", el).onchange = e => { $("#hqNewT", el).placeholder = `Type a task for ${DEP[e.target.value].name}…`; };
  $("#hqNew", el).onsubmit = e => {
    e.preventDefault();
    const dep = $("#hqNewDep", el).value, text = $("#hqNewT", el).value.trim().slice(0, 140); if (!text) return;
    const w = $("#hqNewW", el).value, rep = $("#hqNewR", el).value, amt = Math.abs(parseFloat(($("#hqNewA", el).value || "").replace(/[^\d.]/g, "")) || 0);
    // route inside the department (same scoring as asking the head)
    const words = new Set((text.toLowerCase().match(/[a-zāēīōū]{3,}/g) || []));
    let best = AG[DEP[dep].head_agent], sc = 0;
    DEP[dep].agents.map(id => AG[id]).forEach(a => { const hay = (a.triggers.join(" ") + " " + a.name + " " + a.mission + " " + a.outputs.join(" ")).toLowerCase();
      let s = 0; words.forEach(x => { if (hay.includes(x)) s++; }); if (s > sc && s >= 2) { sc = s; best = a; } });   // weak matches stay with the head
    const id = "t" + Date.now().toString(36);
    const t = { id, agent: best.id, dept: dep, business: best.business, status: w === "now" ? "doing" : w === "backlog" ? "backlog" : "next",
      text, when: w === "today" ? "today" : w === "tomorrow" ? "tomorrow" : "", repeat: rep };
    if (amt > 0 && K()) {
      const area = /pay ?run|payroll|wage/i.test(text) ? "Pay run" : /hire|hiring|recruit/i.test(text) ? "Hiring" : "Spend request";
      K().addItem({ key: "o:" + id, source: "org", id, business: best.business, agent: best.id, dept: dep, area, amount: amt,
        title: text, text: `Added in Shelly HQ · ${money(amt)}`, impact: null, spend: true, link: "brain/#hq", chain: chainFor(dep, area, amt) });
      t.status = "waiting"; t.sub = "in approval";
    }
    saveLocal([t, ...localTasks()]);
    S.hint = `✓ Added for ${best.name}${amt ? ` · approval chain: ${chainFor(dep, "Spend request", amt).map(c => c.role.replace(/ \(.*\)/, "")).join(" › ")}` : ""}.`;
    refreshAll(); emit("task");
  };
}

/* ---------------- sheets: calendar · funds · opportunities */
let calMonth = new Date(); calMonth.setDate(1);
let calDeps = new Set(B.departments.map(d => d.id));
function sheetShell(title, body) {
  return `<div class="sh-h"><b id="hqSheetT">${title}</b><button class="sh-x" aria-label="Close">×</button></div><div class="sh-b">${body}</div>`;
}
export function openSheet(kind) {
  const el = $("#hqSheet"); if (!el) return;
  el.hidden = false; el.dataset.kind = kind;
  if (kind === "calendar") {
    const y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], today = new Date();
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cd out"></div>`;
    for (let dd = 1; dd <= days; dd++) {
      const date = new Date(y, m, dd), dn = DN[(date.getDay() + 6) % 7];
      const ev = B.routines.filter(r => calDeps.has(r.dept) && (r.days ? r.days.includes(dn) : r.monthday === dd))
        .sort((a, b) => a.time.localeCompare(b.time));
      const isT = date.toDateString() === today.toDateString(), past = date < new Date(today.toDateString());
      const loc = localTasks().filter(t => calDeps.has(t.dept) && ((t.when === "today" && isT) || (t.when === "tomorrow" && date.toDateString() === new Date(today.getTime() + 864e5).toDateString())));
      const all = [...loc.map(t => ({ c: DEP[t.dept].colour, t: t.text, x: "task" })), ...ev.map(r => ({ c: DEP[r.dept].colour, t: `${r.time} ${AG[r.agent].name.replace(/ agent$/, "")}: ${r.what}`, x: past ? "done" : "" }))];
      cells += `<div class="cd ${isT ? "today" : ""}"><span class="dn">${dd}</span>${all.slice(0, 3).map(e => `<span class="ev ${e.x}" style="--c:${esc(e.c)}">${e.x === "done" ? "✓ " : ""}${esc(e.t)}</span>`).join("")}${all.length > 3 ? `<span class="more">+${all.length - 3} more</span>` : ""}</div>`;
    }
    el.innerHTML = sheetShell(`📅 Calendar <small>${first.toLocaleDateString("en-NZ", { month: "long", year: "numeric" })}</small>`,
      `<div class="cal-top"><button data-cm="-1" aria-label="Previous month">‹</button><button data-cm="0">Today</button><button data-cm="1" aria-label="Next month">›</button>
        <span class="cal-deps">${B.departments.map(d => `<button data-cd="${esc(d.id)}" aria-pressed="${calDeps.has(d.id)}" style="--c:${esc(d.colour)}">● ${esc(d.name)}</button>`).join("")}</span></div>
       <div class="cal"><aside class="routines"><div class="pnl-k">Routines ${B.routines.filter(r => calDeps.has(r.dept)).length}</div>
         ${B.routines.filter(r => calDeps.has(r.dept)).map(r => `<div class="rt" style="--c:${esc(DEP[r.dept].colour)}"><b>${esc(r.what)}</b><small>${r.days ? (r.days.length === 7 ? "every day" : r.days.length === 5 && r.days[0] === "Mon" && r.days[4] === "Fri" ? "every weekday" : "every " + r.days.join(", ")) : "monthly, day " + r.monthday} · ${esc(r.time)} · ${esc(AG[r.agent].name)}</small></div>`).join("")}</aside>
         <div class="grid">${DN.map(x => `<div class="dh">${x}</div>`).join("")}${cells}</div></div>`);
    $$("[data-cm]", el).forEach(b => b.onclick = () => { const v = +b.dataset.cm; if (!v) { calMonth = new Date(); calMonth.setDate(1); } else calMonth.setMonth(calMonth.getMonth() + v); openSheet("calendar"); });
    $$("[data-cd]", el).forEach(b => b.onclick = () => { const k = b.dataset.cd; calDeps.has(k) && calDeps.size > 1 ? calDeps.delete(k) : calDeps.add(k); openSheet("calendar"); });
  } else if (kind === "funds") {
    const fs = funds(), tb = fs.reduce((a, f) => a + f.budget, 0), tu = fs.reduce((a, f) => a + f.spent + f.committed, 0), tp = fs.reduce((a, f) => a + f.pending, 0);
    const fin = AG[DEP.finance.head_agent];
    el.innerHTML = sheetShell("$ Funds control <small>Finance</small>",
      `<p class="sh-p">★ ${esc(fin.name)} (${esc(DEP.finance.head)}) holds every department's monthly budget. Each approved spend is committed against it; anything over a head's limit gets a funds check here first, and over ${money(DEP.finance.limit)} goes to Pavi.</p>
       <div class="fund-tot"><div><span>Budgets</span><b>${money(tb)}</b></div><div><span>Spent + approved</span><b>${money(tu)}</b></div><div><span>Pending approval</span><b>${money(tp)}</b></div><div><span>Left</span><b>${money(tb - tu)}</b></div></div>
       <table class="fund"><thead><tr><th>Department</th><th>Head signs to</th><th>Budget</th><th>Spent</th><th>Approved</th><th>Pending</th><th>Left</th><th></th></tr></thead><tbody>
       ${fs.map(f => { const d = DEP[f.id], p = Math.min(1.2, f.pct); return `<tr><td><i class="dot" style="background:${esc(f.colour)}"></i>${esc(f.name)}</td><td>${d.id === "mgmt" ? "final (Pavi)" : money(d.limit)}</td><td>${f.budget ? money(f.budget) : "—"}</td><td>${money(f.spent)}</td><td>${money(f.committed)}</td><td>${f.pending ? money(f.pending) : "—"}</td><td class="${f.left < 0 ? "neg" : ""}">${f.budget ? money(f.left) : "case by case"}</td>
         <td class="bar">${f.budget ? `<span style="width:${Math.round(p * 100 / 1.2)}%;background:${p > 1 ? "#ff7b72" : p > 0.8 ? "#ffc466" : esc(f.colour)}"></span><em>${Math.round(f.pct * 100)}%</em>` : ""}</td></tr>`; }).join("")}</tbody></table>
       <div class="pnl-k" style="margin-top:14px">Waiting for a funds check</div>
       ${openItems().filter(it => curDept(it) === "finance").map(apRow).join("") || '<p class="empty">Nothing waiting for Finance.</p>'}
       <p class="sh-p">Wages are outside department budgets. Payroll: Office Manager confirms the shifts → Payroll agent builds the run → Finance head approves. Pay runs never send money from here: they are drafts for your banking system.</p>`);
    bindAp(el);
  } else if (kind === "opps") {
    const loc = ls.get("shelly.hq.opps", []) || [], opps = [...B.opportunities, ...loc];
    const STAGES = ["Idea", "Market check", "Scoring", "Funding request", "Funded", "Launched"];
    const req = o => items().find(it => it.key === "o:" + o.id || it.id === o.id);
    el.innerHTML = sheetShell("✦ Opportunities <small>future businesses</small>",
      `<p class="sh-p">New businesses and new revenue come in here. The Opportunities agent scores each one; funding runs through the chain: Chief of Staff › Finance (funds check) › Pavi. A funded new business is added to the brain with one line in <code>shelly/brain/registry.py</code> (BUSINESSES) and every department starts serving it.</p>
       <div class="opps">${opps.map(o => { const r = req(o), st = r ? stateOf(r) : null;
         const stage = st === "y" ? "Funded" : st === "n" ? "Declined" : r ? "Funding request" : o.stage, si = STAGES.indexOf(stage);
         return `<div class="opp"><div class="opp-h"><b>${esc(o.name)}</b><span>${esc(o.business)}</span></div>
           <div class="stages">${STAGES.map((x, i) => `<span class="${i < si ? "ok" : i === si ? "now" : ""} ${stage === "Declined" && i === 3 ? "no" : ""}">${esc(x)}</span>`).join("")}</div>
           <p>${esc(o.why)}</p><div class="opp-k"><span>Ask <b>${money(o.ask)}</b></span><span>Score <b>${o.score}/100</b></span><span>Payback <b>${o.payback_months} mo</b></span></div>
           <div class="score"><span style="width:${o.score}%"></span></div>
           ${r ? (st ? `<div class="r"><span class="st ${st}">${st === "y" ? "✓ Funded" : "✕ Declined"}</span></div>` : apRow(r))
             : `<div class="r"><button class="yes" data-fund="${esc(o.id)}">Request funding ${money(o.ask)}</button></div>`}</div>`; }).join("")}</div>
       <form class="pnl opp-new" id="oppNew"><div class="pnl-k">＋ New opportunity</div>
         <input id="onName" maxlength="70" placeholder="Name, e.g. Pharmacy click-and-collect" required>
         <div class="row"><input id="onAsk" inputmode="numeric" placeholder="Funds needed ($)" required><input id="onPay" inputmode="numeric" placeholder="Payback months"></div>
         <input id="onWhy" maxlength="200" placeholder="Why it works (one line)"><button class="add">Add and send to Opportunities agent</button></form>`);
    bindAp(el);
    $$("[data-fund]", el).forEach(b => b.onclick = () => {
      const o = opps.find(x => x.id === b.dataset.fund); if (!o || !K()) return;
      K().addItem({ key: "o:" + o.id, source: "org", id: o.id, business: "group", agent: "mgmt-opps", dept: "mgmt", area: "Opportunity funding", amount: o.ask,
        title: `Fund '${o.name}': ${money(o.ask)}`, text: `Score ${o.score}/100 · payback ${o.payback_months} months`, impact: null, spend: true, link: "brain/#hq", chain: chainFor("mgmt", "Opportunity funding", o.ask) });
      openSheet("opps");
    });
    $("#oppNew", el).onsubmit = e => {
      e.preventDefault();
      const name = $("#onName", el).value.trim().slice(0, 70), ask = Math.abs(parseFloat($("#onAsk", el).value.replace(/[^\d.]/g, "")) || 0);
      if (!name || !ask) return;
      const pay = Math.abs(parseFloat($("#onPay", el).value) || 12), why = $("#onWhy", el).value.trim().slice(0, 200) || "New idea added in Shelly HQ.";
      const score = Math.max(20, Math.min(90, Math.round(80 - pay * 1.2 - Math.log10(ask) * 4 + 10)));   // simple first score; the agent refines it
      loc.push({ id: "opp-" + Date.now().toString(36), name, business: "New business", stage: "Scoring", ask, score, payback_months: pay, owner: "Opportunities agent", why });
      ls.set("shelly.hq.opps", loc); openSheet("opps");
    };
  }
  $(".sh-x", el).onclick = closeSheet;
}
export function closeSheet() { const el = $("#hqSheet"); if (el) { el.hidden = true; el.innerHTML = ""; } }

/* ---------------- top bar */
const SOURCES = [["🧾", "POS"], ["▦", "Excel"], ["▮▮", "Power BI"], ["⇄", "ERP / POs"], ["✚", "Medsafe"], ["◉", "News"], ["✉", "Email"], ["⌗", "SQL"]];
export function renderTop() {
  const sel = $("#hqBiz");
  if (sel && !sel.options.length) {
    sel.innerHTML = `<option value="">All businesses</option>` + B.businesses.map(b => `<option value="${esc(b.id)}">${esc(b.icon)} ${esc(b.name)}</option>`).join("");
    sel.onchange = () => { S.biz = sel.value; refreshAll(); emit("biz"); };
  }
  const c = $("#hqConn"); if (c && !c.innerHTML) c.innerHTML = `<span class="lbl">● connected to</span>` + SOURCES.map(([g, n]) => `<span class="src" title="${esc(n)}">${esc(g)}</span>`).join("");
  const n = openItems().length; const ap = $("#hqApN"); if (ap) ap.textContent = n;
}
export function refreshAll() {
  renderTop(); renderLeft(); renderRight();
  const sh = $("#hqSheet"); if (sh && !sh.hidden) openSheet(sh.dataset.kind);
}

export function initPanels() {
  refreshAll();
  $$("[data-sheet]").forEach(b => b.onclick = () => { const sh = $("#hqSheet"); if (!sh.hidden && sh.dataset.kind === b.dataset.sheet) closeSheet(); else openSheet(b.dataset.sheet); });
  const ap = $("#hqAp"); if (ap) ap.onclick = () => K() && K().openTray();
  const full = $("#hqFull"), frame = $("#hqx");
  if (full && frame) full.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => frame.classList.toggle("max")); else frame.classList.toggle("max"); };
  const clk = $("#hqClock"); const tick = () => { if (clk) clk.textContent = new Date().toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  tick(); setInterval(tick, 1000);
  addEventListener("shelly:approvals", refreshAll);
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#hqSheet").hidden) closeSheet(); });
}
