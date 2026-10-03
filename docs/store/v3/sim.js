/* Store Floor v3: the store team at work.
   A day simulation driven by `operations` in planogram.yaml:
   - trading hours, two 8-hour shifts, staggered breaks (10 min, 30 min lunch, 10 min)
   - deliveries on set days: unload at the dock, put away in the storeroom, top up shelves
   - the Duty Manager works and directs the team (in person or by radio), keeps the till covered
   - jobs come from Shelly's weekly data: recalls, likely stock-outs, shrinkage, waste, reorders
   - customers arrive through the day (busier after 5pm), browse, queue, pay and leave
   Sim time runs faster than walking: people walk at a capped pace while the clock races,
   so a whole trading day fits in a few minutes. */
import { makeNav } from "./nav.js";
import { makePerson, pose, bubbleSprite, tagSprite, makeTrolley, makeBasket } from "./people.js";
import { buildBackroom } from "./backroom.js";
import { initUI } from "./ui.js";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const hm = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
export const fmt = t => { t = Math.max(0, t); return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0"); };

export function startSim(ctx) {
  const { THREE, scene, ST, FX, wx, wz, inside, still } = ctx;
  const OPS = ST.operations, BRC = ST.backroom;
  if (!OPS || !OPS.team || !BRC || !BRC.area) return;
  const BR = buildBackroom(ctx);
  const OPEN = hm(OPS.trading_hours.open), CLOSE = hm(OPS.trading_hours.close);
  const CAFE = OPS.cafe ? { open: hm(OPS.cafe.open), close: hm(OPS.cafe.close), share: OPS.cafe.share || .12 } : null;
  const SELF = OPS.self_checkouts || null, TROL = OPS.trolleys || { total: 0, low: 0 }, BASK = OPS.baskets || { total: 0, low: 0 };
  const isStation = t => t && (t.kind === "till" || t.kind === "cafe");

  /* ---------- navigation grid */
  const A = BRC.area;
  const inBack = (x, z) => x > wx(A[0]) && x < wx(A[2]) && z > wz(A[1]) && z < wz(A[3]);
  const outside = BRC.spots.outside, entrance = BRC.spots.entrance;
  const inFront = (x, z) => z > wz(1645) && z < wz(outside[1] + 60) && x > wx(entrance[0] - 110) && x < wx(1120);
  const blockedR = (x, z, R) => ctx.colliders.some(c => { const dx = x - c.cx, dz = z - c.cz, co = Math.cos(c.rot), si = Math.sin(c.rot); return Math.abs(dx * co - dz * si) < c.hw + R && Math.abs(dx * si + dz * co) < c.hd + R; });
  const nav = makeNav({ bounds: [wx(40), wz(230), wx(1345), wz(outside[1] + 70)], walkable: (x, z) => inside(x, z) || inBack(x, z) || inFront(x, z), blocked: (x, z) => blockedR(x, z, .24) });

  /* ---------- places */
  const SP = k => { const p = BR.spot(k); return p ? nav.snap(p[0], p[1]) : null; };
  const PL = {
    outside: SP("outside"), entrance: SP("entrance"), staffDoor: SP("staff_door"), dock: SP("dock"), cooler: SP("cooler"),
    desk: SP("desk_chair"), till: SP("till_staff"), queue: SP("queue"), restA: SP("restroom_a"), restB: SP("restroom_b"),
    kitchen: SP("kitchen"), cafeTill: SP("cafe_till"), selfQueue: SP("self_queue"), trolleyBay: SP("trolley_bay"), basketStack: SP("basket_stack"),
    basketDrop: SP("basket_drop"), carPark: SP("car_park"),
  };
  const cafeFx = FX.findIndex(f => f.id === "hotfood"), selfFx = FX.findIndex(f => f.type === "kiosks");
  /* self-checkout kiosks: where the shopper stands and where a helper stands */
  const KIOSKS = [];
  if (selfFx >= 0) { const f = FX[selfFx], n = f.count || 4, co = Math.cos(f.rot), si = Math.sin(f.rot);
    for (let i = 0; i < n; i++) { const lx = -f.L / 2 + (i + .5) * f.L / n, at = lz => nav.snap(f.cx + lx * co + lz * si, f.cz - lx * si + lz * co);
      const [x, z] = at(f.Dp / 2 + .45), [hx, hz] = at(f.Dp / 2 + .95);
      KIOSKS.push({ n: i + 1, x, z, face: Math.atan2(f.cx + lx * co - x, f.cz - lx * si - z), hx, hz, who: null, lamp: f.lamps ? f.lamps[i] : null }); } }
  const deskFace = BR.spot("desk"); const tillFx = FX.findIndex(f => f.id === "checkout");
  const workSpot = (i, side) => {                         // where to stand to work on fixture i, and which way to face
    const f = FX[i], nx = Math.sin(f.rot), nz = Math.cos(f.rot), sides = f.face ? [1] : side ? [side, -side] : [1, -1];
    for (const s of sides) for (const d of [f.Dp / 2 + .5, f.Dp / 2 + .7, f.Dp / 2 + 1]) {
      const along = (Math.random() - .5) * Math.max(0, f.L - 1);
      const px = f.cx + nx * s * d + Math.cos(f.rot) * along, pz = f.cz + nz * s * d - Math.sin(f.rot) * along;
      if (nav.isOpen(px, pz)) return { x: px, z: pz, face: Math.atan2(f.cx - px, f.cz - pz) };
    }
    const [x, z] = nav.snap(f.cx + nx * (f.Dp / 2 + .6), f.cz + nz * (f.Dp / 2 + .6)); return { x, z, face: Math.atan2(f.cx - x, f.cz - z) };
  };
  const fxIdx = id => FX.findIndex(f => f.id === id);
  const placeOf = (where) => {                            // where: fixture id | place key | {x,z}
    if (where && typeof where === "object") return where;
    if (where === "till") return { x: PL.till[0], z: PL.till[1], face: Math.PI };
    if (where === "cafeTill" && PL.cafeTill) return { x: PL.cafeTill[0], z: PL.cafeTill[1], face: -Math.PI / 2 };
    if (where === "desk") return { x: PL.desk[0], z: PL.desk[1], face: Math.PI, sit: true };
    if (where === "rack") { const r = BR.rackSpots[Math.floor(Math.random() * BR.rackSpots.length)]; const [x, z] = nav.snap(r[0], r[1]); return { x, z, face: null }; }
    if (PL[where]) return { x: PL[where][0], z: PL[where][1], face: null };
    const i = fxIdx(where); if (i >= 0) return workSpot(i);
    return { x: PL.entrance[0], z: PL.entrance[1] };
  };
  const COLD = new Set(["chiller", "multideck", "freezer"]);

  /* ---------- people */
  const agents = [];
  let simT = 0;                                           // render clock (s)
  function spawn(kind, opts, at) {
    const p = makePerson(THREE, { kind, role: opts.role, id: opts.id, seed: opts.seed });
    p.g.position.set(at[0], 0, at[1]); scene.add(p.g); ctx.people.push(p.hit);
    p.hit.userData.personId = opts.id; p.g.userData.personId = opts.id;
    const a = Object.assign({ kind, p, x: at[0], z: at[1], ry: Math.PI, path: [], act: "idle", bubble: null, face: null }, opts);
    if (kind === "staff") { a.tag = tagSprite(THREE, a.name, a.role, p.shirtHex); a.tag.position.y = 1.95; p.g.add(a.tag); }
    agents.push(a); return a;
  }
  function despawn(a) {
    scene.remove(a.p.g); const k = ctx.people.indexOf(a.p.hit); if (k >= 0) ctx.people.splice(k, 1);
    a.p.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    agents.splice(agents.indexOf(a), 1);
  }
  function say(a, text, tone = "say", secs = 3.2) {
    if (!a || !a.p) return;
    if (a.bubble) { a.p.g.remove(a.bubble.sp); a.bubble.sp.material.map.dispose(); a.bubble.sp.material.dispose(); }
    const sp = bubbleSprite(THREE, text, tone); sp.position.y = a.kind === "staff" ? 2.28 : 2.0; a.p.g.add(sp);
    a.bubble = { sp, until: simT + secs };
    if (a.kind === "staff") log(`${a.name}: ${text}`);
  }
  function goTo(a, where, then) {
    const pl = placeOf(where); a.dest = pl;
    a.path = nav.find(a.x, a.z, pl.x, pl.z); a.act = "walk"; a.onArrive = then;
  }

  /* ---------- the day plan */
  const S = { day: 0, t: 0, speed: 60, playing: true, tasks: [], staff: [], log: [], stats: { served: 0, entered: 0, peak: 0 }, OPEN, CLOSE, OPS, FX };
  function log(s) { S.log.unshift({ t: S.t, s }); if (S.log.length > 60) S.log.pop(); }
  let tid = 0;
  const task = o => { const t = Object.assign({ id: "T" + (++tid), status: "scheduled", progress: 0, priority: 2, minutes: 15, deps: [], who: null, steps: null }, o);
    if (!t.steps) t.steps = [{ where: t.where, minutes: t.minutes }]; t.total = t.steps.reduce((s, x) => s + (isFinite(x.minutes) ? x.minutes : 0), 0) || 1; S.tasks.push(t); return t; };
  const shiftOf = m => {
    if (m.start) return { start: hm(m.start), end: hm(m.start) + (m.hours || 8) * 60, shiftName: "Office" };
    const sh = OPS.shifts.find(s => s.id === m.shift); return { start: hm(sh.start), end: hm(sh.start) + sh.hours * 60, shiftName: sh.name };
  };
  function planDay(day) {
    S.tasks = []; tid = 0; S.log = []; S.stats = { served: 0, entered: 0, peak: 0 };
    const dname = DAYS[day], delivery = (OPS.deliveries?.days || []).includes(dname);
    S.delivery = delivery;
    // team on today, breaks staggered within each shift (Duty Manager last so the floor stays covered)
    const groups = {};
    S.staff = OPS.team.filter(m => !m.days || m.days.includes(dname)).map(m => ({ ...m, ...shiftOf(m) }));
    S.staff.forEach(m => { const k = m.shift || "office"; (groups[k] = groups[k] || []).push(m); });
    Object.values(groups).forEach(g => { g.sort((a, b) => (a.role === "Duty Manager") - (b.role === "Duty Manager"));
      g.forEach((m, i) => { m.breaks = (OPS.breaks || []).map(b => ({ name: b.name, at: m.start + b.after_h * 60 + i * (OPS.break_stagger_minutes || 15), minutes: b.minutes, done: false })); }); });
    // the till is staffed from just before opening to close
    S.till = task({ title: "Serve at the main checkout", kind: "till", where: "till", minutes: Infinity, due: OPEN - 5, priority: 0, role: "Store Team", area: "Checkout" });
    // fixed routines
    (OPS.routines || []).forEach(r => task({ title: r.task, due: hm(r.at), minutes: r.minutes, where: r.where, role: r.role, priority: r.role === "Duty Manager" ? 0 : 2,
      area: r.role === "Cook" ? "Kitchen" : r.role === "Café" ? "Café" : "Routine",
      steps: r.steps ? r.steps.map(([w, m, c]) => ({ where: w, minutes: m, carryNext: c === "carry" })) : null }));
    // the café till has its own person from opening to 4pm
    S.cafeTill = CAFE && PL.cafeTill ? task({ title: "Serve at the café till", kind: "cafe", where: "cafeTill", minutes: Infinity, due: CAFE.open - 5, priority: 0, role: "Café", area: "Café" }) : null;
    // trolleys and baskets back where shoppers pick them up
    S.trolleys = { bay: TROL.total, car: 0 }; S.baskets = { door: BASK.total, drop: 0 };
    KIOSKS.forEach(k => { k.who = null; });
    // deliveries: unload (two people), put away, then top up the shelves that are on the order
    const onOrder = FX.map((f, i) => i).filter(i => FX[i].kpi && FX[i].kpi.to_order > 0).sort((a, b) => (FX[a].kpi.min_cover ?? 9) - (FX[b].kpi.min_cover ?? 9));
    if (delivery) {
      const arr = hm(OPS.deliveries.arrive), n = OPS.deliveries.pallets || 6;
      const u = [1, 2].map(k => task({ title: `Unload delivery (${n} pallets) and check the invoice`, due: arr, minutes: 30, where: "dock", priority: 1, area: "Delivery", delivery: true }));
      const pa = [1, 2].map(k => task({ title: "Put the delivery away in the storeroom", due: arr + 25, deps: u.map(t => t.id), priority: 1, area: "Delivery",
        steps: [0, 1, 2, 3, 4, 5].map(j => j % 2 ? { where: "rack", minutes: 4 } : { where: "dock", minutes: 2, carryNext: true }) }));
      onOrder.forEach((i, k) => task({ title: `Top up ${FX[i].name} from the delivery`, due: arr + 45 + k * 4, deps: pa.map(t => t.id), priority: 2, area: "Top up", fx: i,
        steps: [{ where: COLD.has(FX[i].type) ? "cooler" : "rack", minutes: 2, carryNext: true }, { where: FX[i].id, minutes: 15 }] }));
    } else {
      onOrder.filter(i => (FX[i].kpi.min_cover ?? 9) < 2).forEach((i, k) => task({ title: `Top up ${FX[i].name} from the storeroom`, due: hm("06:30") + k * 6, priority: 2, area: "Top up", fx: i,
        steps: [{ where: COLD.has(FX[i].type) ? "cooler" : "rack", minutes: 2, carryNext: true }, { where: FX[i].id, minutes: 12 }] }));
    }
    // jobs from Shelly's weekly results
    FX.forEach((f, i) => (f.reasons || []).forEach(r => {
      const prod = r.split(":")[0];
      if (/recalled/.test(r)) task({ title: `Pull recalled ${prod} off the shelf and quarantine it`, due: hm("06:10"), minutes: 15, where: f.id, role: "Duty Manager", priority: 1, area: "Recall", fx: i, shelly: true });
      else if (/stock-out/.test(r)) task({ title: `Check ${prod} on shelf: possible stock-out`, due: OPEN + 15, priority: 1, area: "Availability", fx: i, shelly: true,
        steps: [{ where: COLD.has(f.type) ? "cooler" : "rack", minutes: 2, carryNext: true }, { where: f.id, minutes: 12 }] });
      else if (/shrinkage/.test(r)) task({ title: `Re-count ${prod} and check the shelf position`, due: hm("09:30"), minutes: 15, where: f.id, priority: 2, area: "Shrinkage", fx: i, shelly: true });
      else if (/waste/.test(r)) task({ title: `Cut the ${prod} display and mark down short-dated`, due: hm("14:45"), minutes: 12, where: f.id, priority: 2, area: "Waste", fx: i, shelly: true });
    }));
    // busiest shelves get topped up through the day, and before the after-5pm rush
    const busiest = FX.map((f, i) => i).filter(i => FX[i].kpi && FX[i].kpi.sales > 0 && FX[i].type !== "counter").sort((a, b) => FX[b].kpi.sales - FX[a].kpi.sales).slice(0, 5);
    ["11:30", "14:15", "16:40", "19:10"].forEach((at, w) => busiest.forEach((i, k) => {
      if ((w + k) % 2) return;
      task({ title: `Top up ${FX[i].name}` + (at === "16:40" ? " before the evening rush" : ""), due: hm(at) + k * 5, priority: 2, area: "Top up", fx: i,
        steps: [{ where: COLD.has(FX[i].type) ? "cooler" : "rack", minutes: 2, carryNext: true }, { where: FX[i].id, minutes: 10 }] });
    }));
    S.tasks.sort((a, b) => a.due - b.due);
    BR.pallets.visible = false;
  }
  const depsDone = t => t.deps.every(id => { const d = S.tasks.find(x => x.id === id); return !d || d.status === "done"; });
  function refreshStatus() {
    S.tasks.forEach(t => {
      if (t.status === "done" || t.status === "progress") return;
      t.status = S.t >= t.due && depsDone(t) && !(t.kind === "till" && (S.t >= CLOSE)) && !(t.kind === "cafe" && S.t >= CAFE.close) ? "waiting" : "scheduled";
    });
    if (S.cafeTill && S.cafeTill.status !== "done" && S.t >= CAFE.close + 1 && !S.cafeTill.holder) { S.cafeTill.status = "done"; S.cafeTill.doneAt = S.t; }
    if (S.till.status !== "done" && S.t >= CLOSE + 2 && !(S.till.holder)) { S.till.status = "done"; S.till.doneAt = S.t; }
  }

  /* ---------- staff behaviour */
  const staffAgents = () => agents.filter(a => a.kind === "staff");
  const dmOnSite = () => staffAgents().find(a => a.role === "Duty Manager" && ["free", "toTask", "task"].includes(a.state));
  const onShift = m => S.t >= m.start - 8 && S.t < m.end;
  /* who may take which job: stations have their own person; cooks and café hands keep to their own work */
  const stationOf = k => k === "till" ? S.till : k === "cafe" ? S.cafeTill : null;
  const ownerOnSite = kind => staffAgents().some(b => b.m.station === kind && ["free", "task", "toTask"].includes(b.state) && !nextBreak(b) && S.t < b.m.end);
  function canTake(a, t) {
    if (t.kind === "till") return (a.role === "Store Team" && (a.m.station === "till" || !ownerOnSite("till") || S.t - t.due > 3)) || (a.role === "Duty Manager" && S.t - t.due > 4);
    if (t.kind === "cafe") return (a.role === "Café" && (a.m.station === "cafe" || !ownerOnSite("cafe"))) || ((a.role === "Cook" || a.role === "Duty Manager") && S.t - t.due > 4);
    if (a.role === "Store Manager" || a.role === "Cook" || a.role === "Café") return t.role === a.role;
    if (a.role === "Duty Manager") return !t.role || t.role === "Duty Manager" || t.role === "Store Team";
    return !t.role || t.role === a.role;
  }
  function pickTask(a) {
    const ok = S.tasks.filter(t => t.status === "waiting" && !t.who && canTake(a, t));
    // nobody starts a long job in the last minutes of their shift
    const fits = ok.filter(t => isStation(t) || S.t + Math.min(t.total, 30) < a.m.end - 5);
    const own = a.m.station && fits.find(t => t.kind === a.m.station); if (own) return own;
    fits.sort((x, y) => x.priority - y.priority || x.due - y.due);
    return fits[0] || null;
  }
  function assign(a, t) {
    t.who = a.id; t.status = "progress"; t.started = t.started ?? S.t; a.task = t; a.step = t.stepAt || 0;
    if (isStation(t)) t.holder = a.id;
    const dm = dmOnSite();
    if (dm && dm !== a && a.role !== "Store Manager" && !t.quiet) {
      const far = Math.hypot(dm.x - a.x, dm.z - a.z) > 7;
      say(dm, `${far ? "📻 " : ""}${a.name}, ${t.title.charAt(0).toLowerCase() + t.title.slice(1)} please`, far ? "radio" : "say", 3.4);
      setTimeout(() => say(a, t.kind === "till" ? "Heading to the till" : t.kind === "cafe" ? "Heading to the café till" : "On it!", "say", 2.2), 600);
    }
    startStep(a);
  }
  function holding(a, carry) {                            // what is in their hands: a carton, or a trolley being pushed
    const t = a.task, trolley = carry && t && t.carryType === "trolley";
    a.p.carry.visible = carry && !trolley; a.p.carryHeld = carry;
    if (trolley && !a.p.trolley) { a.p.trolley = makeTrolley(THREE); a.p.trolley.position.set(0, 0, .62); a.p.g.add(a.p.trolley); }
    if (a.p.trolley && a.kind === "staff") a.p.trolley.visible = !!trolley;
  }
  function startStep(a) {
    const t = a.task, st = t.steps[a.step];
    a.state = "toTask"; holding(a, !!(a.step > 0 && t.steps[a.step - 1].carryNext));
    goTo(a, st.where, () => { a.state = "task"; a.act = (placeOf(st.where).sit ? "sit" : "work"); a.stepLeft = st.minutes - (t.stepDone || 0); t.stepDone = 0;
      if (a.dest && a.dest.face != null) a.face = a.dest.face; if (st.where === "desk" && deskFace) a.face = Math.PI; });
  }
  function finishTask(a) {
    const t = a.task; t.status = "done"; t.doneAt = S.t; t.progress = 1; t.doneBy = a.name; t.holder = null;
    a.task = null; a.state = "free"; holding(a, false);
    if (t.onDone) t.onDone(a);
    if (t.fx != null && /Top up|stock-out/.test(t.title)) { FX[t.fx].topped = true; say(a, `${FX[t.fx].name} topped up ✓`, "done", 2.4); }
    if (t.title.startsWith("Unload")) BR.pallets.visible = S.tasks.some(x => x.title.startsWith("Unload") && x.status !== "done");
    if (t.title.startsWith("Put the delivery away") && S.tasks.filter(x => x.title.startsWith("Put the delivery")).every(x => x.status === "done")) BR.pallets.visible = false;
    if (/open the store/.test(t.title)) { S.doorsOpen = true; say(a, "Doors open, good morning!", "done"); }
    if (/close the store/.test(t.title)) S.doorsOpen = false;
    if (t.kind === "cafe") say(a, "Café closed, cleaning up now", "done", 2.4);
  }
  function pauseTask(a) {                                  // put a job back for someone else (keeps progress)
    const t = a.task; if (!t) return;
    t.who = null; t.status = "waiting"; t.stepAt = a.step; t.stepDone = a.state === "task" ? Math.max(0, t.steps[a.step].minutes - a.stepLeft) : 0;
    if (isStation(t)) t.holder = null;
    a.task = null; holding(a, false);
  }
  function dropOrPause(a) {                              // fillers are simply dropped; real jobs go back on the list
    const t = a.task; if (!t) return;
    if (t.filler) { S.tasks.splice(S.tasks.indexOf(t), 1); a.task = null; holding(a, false); a.state = "free"; }
    else { pauseTask(a); a.state = "free"; }
  }
  function nextBreak(a) { return a.m.breaks.find(b => !b.done && S.t >= b.at); }
  function startBreak(a, b) {
    if (a.task) pauseTask(a);
    a.state = "toBreak"; a.brk = b; b.started = S.t;
    const seat = BR.seats[Math.floor(Math.random() * BR.seats.length)];
    const toSeat = () => goTo(a, { x: seat[0], z: seat[1], face: seat[2], sit: true }, () => { a.state = "break"; a.act = "sit"; a.face = seat[2]; });
    if (b.minutes <= 10 && Math.random() < .35) goTo(a, Math.random() < .5 ? "restA" : "restB", () => { a.act = "idle"; a.restUntil = S.t + 3; a.state = "rest"; a.afterRest = toSeat; });
    else toSeat();
    if (a.role !== "Duty Manager") { const dm = dmOnSite(); if (dm && Math.random() < .5) say(dm, `Enjoy your ${b.name.toLowerCase()}, ${a.name}`, "say", 2.2); }
    say(a, `${b.name}: ${b.minutes} min`, "say", 2);
  }
  function filler(a) {                                    // something useful when nothing is waiting
    const m = a.m;
    if (!(S.t > m.start + 5 && S.t < m.end - 10)) return null;
    const pickFx = ids => { const xs = FX.map((f, i) => i).filter(i => ids ? ids.includes(FX[i].id) : !["counter", "kiosks"].includes(FX[i].type)); return xs[Math.floor(Math.random() * xs.length)]; };
    if (a.role === "Cook") return task({ title: "Kitchen prep and dishes", due: S.t, minutes: 12, where: "kitchen", area: "Kitchen", filler: true, role: "Cook", quiet: true });
    if (a.role === "Café") {
      if (CAFE && S.t < CAFE.close) return task({ title: "Café: restock cups and wipe the counter", due: S.t, minutes: 8, where: "hotfood", area: "Café", filler: true, role: "Café", quiet: true });
      const i = pickFx(["fruit", "veg", "seasonal", "roots"]); return task({ title: `Face up ${FX[i].name}`, due: S.t, minutes: 10, where: FX[i].id, area: "Face up", filler: true, fx: i, role: "Café", quiet: true });
    }
    const i = pickFx(); return task({ title: `Face up ${FX[i].name}`, due: S.t, minutes: 8 + Math.floor(Math.random() * 6), where: FX[i].id, area: "Face up", filler: true, fx: i, quiet: true });
  }
  function thinkStaff(a, dt) {
    const m = a.m;
    if (a.state === "rest") { if (S.t >= a.restUntil) { a.state = "toBreak"; a.afterRest(); } return; }
    if (a.state === "break") { if (S.t >= a.brk.started + a.brk.minutes) { a.brk.done = true; a.brk = null; a.state = "free"; a.act = "idle"; } return; }
    if (a.state === "leaving" || a.state === "arriving" || a.state === "toBreak") return;
    // end of shift: hand over and go home
    if (S.t >= m.end && !(a.task && !isStation(a.task) && a.state === "task" && a.stepLeft < 6 && a.task.steps.length - 1 === a.step)) {
      if (a.task) pauseTask(a);
      a.state = "leaving"; say(a, "See you tomorrow!", "say", 2);
      goTo(a, "staffDoor", () => goTo(a, "outside", () => { a.state = "gone"; })); return;
    }
    // break due?
    const b = nextBreak(a);
    if (b) {
      if (isStation(a.task)) {                              // ask for cover, keep serving until someone arrives
        const kind = a.task.kind, where = kind === "till" ? "the till" : "the café till";
        if (!a.coverAsked) { a.coverAsked = true; const dm = dmOnSite(); if (dm && dm !== a) say(dm, `📻 Who can cover ${where} for ${a.name}'s ${b.name.toLowerCase()}?`, "radio", 3); }
        const fits = c => kind === "till" ? (c.role === "Store Team" || (c.role === "Duty Manager" && S.t - b.at > 6)) : (c.role === "Cook" || c.role === "Café" || (c.role === "Duty Manager" && S.t - b.at > 6));
        const canCover = c => c !== a && fits(c) && ["free", "task", "toTask"].includes(c.state) && !nextBreak(c) && S.t < c.m.end - 15 && (!c.task || c.task.filler || c.task.priority >= 2);
        const cover = staffAgents().filter(canCover).sort((x, y) => (x.role === "Duty Manager") - (y.role === "Duty Manager"))[0];
        const st = a.task;
        if (cover) { if (cover.task) dropOrPause(cover); a.coverAsked = false; pauseTask(a); assign(cover, st); startBreak(a, b); return; }
        if (S.t - b.at > 20) { a.coverAsked = false; startBreak(a, b); return; }   // never skip a break
      } else if (!(a.task && a.state === "task" && a.stepLeft < 4)) { startBreak(a, b); return; }
    }
    // urgent work (till cover, open/close, recalls, stock-outs, help at self-checkout) takes over from fillers and routine jobs
    if ((a.state === "task" || a.state === "toTask") && a.task && !isStation(a.task) && (a.task.filler || a.task.priority >= 2)) {
      const u = pickTask(a);
      if (u && u.priority <= (a.task.filler ? 2 : 0) && u !== a.task) { dropOrPause(a); assign(a, u); return; }
    }
    if (a.state === "free") {
      // back from a break: take my station back from whoever covered it
      const mine = stationOf(a.m.station);
      if (mine && mine.status === "progress" && mine.holder && mine.holder !== a.id) {
        const h = agents.find(x => x.id === mine.holder);
        if (h && h.m.station !== a.m.station && h.state === "task") { pauseTask(h); h.state = "free"; say(a, "Thanks, I'll take it from here", "say", 2); assign(a, mine); return; }
      }
      const t = pickTask(a);
      if (t) { assign(a, t); return; }
      if (a.role === "Store Manager") { if (a.act !== "sit" || a.idleTo !== "desk") { a.idleTo = "desk"; a.state = "toTask"; goTo(a, "desk", () => { a.state = "free"; a.act = "sit"; a.face = Math.PI; }); } return; }
      if (a.role === "Duty Manager" && (!a.lastWalk || S.t - a.lastWalk > 40)) {
        a.lastWalk = S.t; const alerts = FX.map((f, i) => i).filter(i => FX[i].status === "alert" || FX[i].status === "watch");
        const i = alerts[Math.floor(Math.random() * alerts.length)] ?? 0;
        assign(a, task({ title: `Walk the floor: check ${FX[i].name}`, due: S.t, minutes: 6, where: FX[i].id, area: "Floor walk", filler: true, role: "Duty Manager" })); return;
      }
      const f2 = filler(a); if (f2) assign(a, f2);
      return;
    }
    if (a.state === "task" && a.task) {
      const t = a.task;
      if (t.kind === "till") { a.face = Math.PI; if (S.t >= CLOSE + 2 && !S.queue.length) finishTask(a); else t.progress = Math.min(.99, (S.t - OPEN) / (CLOSE - OPEN)); return; }
      if (t.kind === "cafe") { a.face = -Math.PI / 2; if (S.t >= CAFE.close && !S.cafeQueue.length) finishTask(a); else t.progress = Math.min(.99, (S.t - CAFE.open) / (CAFE.close - CAFE.open)); return; }
      a.stepLeft -= dt;
      const doneBefore = t.steps.slice(0, a.step).reduce((s, x) => s + x.minutes, 0);
      t.progress = Math.min(.99, (doneBefore + t.steps[a.step].minutes - Math.max(0, a.stepLeft)) / t.total);
      if (a.stepLeft <= 0) { a.step++; if (a.step >= t.steps.length) finishTask(a); else startStep(a); }
    }
  }

  /* ---------- trolleys and baskets (the team brings them back when they run low) */
  const stock = { bay: [], car: [], door: [], drop: [] };
  (function buildStock() {
    const add = (arr, mk, at, dx, dy, dz, rot) => { if (!at) return; for (let i = 0; i < arr.n; i++) { const m = mk(THREE); m.position.set(at[0] + dx * i, dy * i, at[1] + dz * i); m.rotation.y = rot; scene.add(m); arr.push(m); } };
    stock.bay.n = stock.car.n = TROL.total; stock.door.n = stock.drop.n = BASK.total;
    add(stock.bay, makeTrolley, PL.trolleyBay, .28, 0, 0, -Math.PI / 2);
    add(stock.car, makeTrolley, PL.carPark && [PL.carPark[0] - 1, PL.carPark[1]], .32, 0, 0, Math.PI / 2 - .3);
    add(stock.door, makeBasket, PL.basketStack, 0, .07, 0, 0);
    add(stock.drop, makeBasket, PL.basketDrop, 0, .07, 0, .3);
  })();
  function drawStock() {
    if (!S.trolleys) return;
    stock.bay.forEach((m, i) => { m.visible = i < S.trolleys.bay; }); stock.car.forEach((m, i) => { m.visible = i < S.trolleys.car; });
    stock.door.forEach((m, i) => { m.visible = i < S.baskets.door; }); stock.drop.forEach((m, i) => { m.visible = i < S.baskets.drop; });
  }
  function restockCheck() {
    if (!S.trolleys || S.t < OPEN - 20 || S.t > CLOSE + 20) return;
    const open = k => S.tasks.some(t => t[k] && t.status !== "done");
    if (TROL.total && S.trolleys.bay <= TROL.low && S.trolleys.car >= 2 && !open("trolleyRun"))
      task({ title: `Bring ${S.trolleys.car} trolleys in from the car park`, due: S.t, priority: 1, area: "Trolleys", role: "Store Team", trolleyRun: true, carryType: "trolley",
        steps: [{ where: "carPark", minutes: 2, carryNext: true }, { where: "trolleyBay", minutes: 1 }], onDone: () => { S.trolleys.bay += S.trolleys.car; S.trolleys.car = 0; drawStock(); } });
    if (BASK.total && S.baskets.door <= BASK.low && S.baskets.drop >= 3 && !open("basketRun"))
      task({ title: `Return ${S.baskets.drop} baskets to the entrance`, due: S.t, priority: 1, area: "Baskets", role: "Store Team", basketRun: true,
        steps: [{ where: "basketDrop", minutes: 1, carryNext: true }, { where: "basketStack", minutes: 1 }], onDone: () => { S.baskets.door += S.baskets.drop; S.baskets.drop = 0; drawStock(); } });
  }

  /* ---------- customers */
  const CPD = OPS.customers_per_day || 150, FOOT = OPS.footfall || {}, FSUM = Object.values(FOOT).reduce((s, v) => s + v, 0) || 1;
  const shelves = FX.map((f, i) => i).filter(i => !["counter", "kiosks"].includes(FX[i].type));
  const LIQ = new Set(["wine", "beer", "rtd", "mixers"]);
  const weight = i => Math.max(.4, (FX[i].kpi?.share_pct || 0) + .8);
  const wsum = shelves.reduce((s, i) => s + weight(i), 0);
  const pickShelf = () => { let r = Math.random() * wsum; for (const i of shelves) { r -= weight(i); if (r <= 0) return i; } return shelves[0]; };
  S.queue = []; S.selfQueue = []; S.cafeQueue = [];
  let cid = 0, owed = 0;
  const ratePerMin = () => { if (!S.doorsOpen || S.t < OPEN || S.t >= CLOSE) return 0; const h = String(Math.floor(S.t / 60));
    const L = window.SHELLY_LIVE, r = L && L.by_hour && L.by_hour.find(x => String(x.h) === h);
    if (r && r.baskets != null) return r.baskets / 60;                        // live POS: real baskets this hour
    return CPD * (FOOT[h] || 0) / FSUM / 60; };
  // delivery-app drivers (Uber Eats / On-Demand) collect bagged orders at the checkout
  const DLV = OPS.delivery || { share_pct: 0, uber_share: .7 };
  function spawnDriver() {
    const uber = Math.random() < (DLV.uber_share ?? .7);
    const c = spawn("customer", { id: "d" + (++cid), seed: Math.random(), plan: [], state: "enter", driver: uber ? "Uber Eats" : "On-Demand" }, [PL.outside[0] + (Math.random() - .5) * 2, PL.outside[1]]);
    c.p.g.traverse(o => { if (o.isMesh && o.material && o.material.color && "#" + o.material.color.getHexString() === c.p.shirtHex.toLowerCase()) o.material.color.set(uber ? "#06c167" : "#3d7bff"); });
    c.p.carry.visible = false; c.cart = "hands"; S.stats.drivers = (S.stats.drivers || 0) + 1;
    goTo(c, "entrance", () => { joinQueue(c); if (Math.random() < .5) say(c, `${uber ? "Uber Eats" : "On-Demand"} pickup`, "say", 2); });
  }
  // café customers queue on the shop side of the café counter
  const cafeFront = (() => { if (cafeFx < 0 || !PL.cafeTill) return null; const f = FX[cafeFx]; const [x, z] = nav.snap(f.cx - (f.Dp / 2 + .45), PL.cafeTill[1]); return { x, z }; })();
  function giveCart(c, kind) {
    c.cart = kind;
    if (kind === "trolley") { c.p.carry.visible = false; c.p.trolley = makeTrolley(THREE); c.p.trolley.position.set(0, 0, .62); c.p.g.add(c.p.trolley); c.p.carryHeld = true; }
    else if (kind === "basket") { c.p.carry.visible = true; c.p.carry.scale.set(.9, .55, .7); c.p.carry.position.set(.27, .78, .05); }
    else c.p.carry.visible = false;
  }
  function spawnCustomer(atShelf) {
    const cafeOnly = atShelf == null && CAFE && cafeFront && S.t >= CAFE.open && S.t < CAFE.close - 5 && Math.random() < CAFE.share;
    const plan = cafeOnly ? [] : Array.from({ length: 1 + Math.floor(Math.random() * 3) }, pickShelf);
    const start = atShelf != null ? workSpot(atShelf) : { x: PL.outside[0] + (Math.random() - .5) * 2, z: PL.outside[1] };
    const c = spawn("customer", { id: "c" + (++cid), seed: Math.random(), plan, state: "enter", cafeOnly, liquor: plan.some(i => LIQ.has(FX[i].id)) }, [start.x, start.z]);
    c.p.carry.visible = false;
    S.stats.entered++;
    if (atShelf != null) { giveCart(c, Math.random() < .3 && S.trolleys.bay > 0 ? (S.trolleys.bay--, "trolley") : S.baskets.door > 0 ? (S.baskets.door--, "basket") : "hands"); c.state = "browse"; c.act = "work"; c.until = S.t + Math.random() * 3; c.face = start.face; return c; }
    if (cafeOnly) { goTo(c, "entrance", () => joinCafe(c)); return c; }
    // trolley, basket or just hands
    const wantTrolley = Math.random() < (OPS.trolley_share ?? .3) && plan.length > 1;
    if (wantTrolley && S.trolleys.bay > 0) { S.trolleys.bay--; drawStock(); goTo(c, "trolleyBay", () => { giveCart(c, "trolley"); nextShelf(c); }); }
    else if (S.baskets.door > 0 && Math.random() < .75) { S.baskets.door--; drawStock(); goTo(c, "basketStack", () => { giveCart(c, "basket"); nextShelf(c); }); }
    else { giveCart(c, "hands"); goTo(c, "entrance", () => nextShelf(c)); }
    return c;
  }
  function nextShelf(c) {
    const i = c.plan.shift();
    if (i == null || S.t >= CLOSE) { chooseCheckout(c); return; }
    c.state = "toShelf"; const sp = workSpot(i);
    goTo(c, sp, () => {
      c.state = "browse"; c.act = "work"; c.face = sp.face; c.until = S.t + 1.5 + Math.random() * 4;
      const f = FX[i]; const so = (f.reasons || []).find(r => /stock-out|order now \(0/.test(r));
      if (so && !f.topped && Math.random() < .5) say(c, `No ${so.split(":")[0]}? 😕`, "warn", 2.6);
      else if (Math.random() < .06) say(c, ["Found it!", "Ooh, specials", "Where's the bread?", "Just this one"][Math.floor(Math.random() * 4)], "say", 2);
    });
  }
  function chooseCheckout(c) {
    const share = c.cart === "trolley" ? (SELF?.trolley_share ?? .2) : (SELF?.basket_share ?? .55);
    const useSelf = KIOSKS.length && (Math.random() < share || S.queue.length > S.selfQueue.length + 2);
    if (useSelf) { c.state = "selfq"; S.selfQueue.push(c); goTo(c, selfSpot(S.selfQueue.length - 1), () => { c.act = "idle"; c.face = Math.PI; }); }
    else joinQueue(c);
  }
  const gap = c => c.cart === "trolley" ? 1.25 : .8;
  function lineSpot(base, list, k) { let d = 0; for (let j = 0; j < k; j++) d += gap(list[j]); return { x: base[0] - .08 * k, z: base[1] - d, face: 0 }; }
  const queueSpot = k => lineSpot(PL.queue, S.queue, k);
  const selfSpot = k => lineSpot(PL.selfQueue, S.selfQueue, k);
  const cafeSpot = k => ({ x: cafeFront.x, z: cafeFront.z - .9 * k, face: Math.PI / 2 });
  function joinQueue(c) { c.state = "queue"; S.queue.push(c); goTo(c, queueSpot(S.queue.length - 1), () => { c.act = "idle"; c.face = 0; }); }
  function joinCafe(c) { c.state = "cafeq"; S.cafeQueue.push(c); goTo(c, cafeSpot(S.cafeQueue.length - 1), () => { c.act = "idle"; c.face = Math.PI / 2; }); }
  function leave(c) {
    c.state = "leave"; if (Math.random() < .12) say(c, "Thanks!", "say", 1.6);
    if (c.cart === "basket") { c.p.carry.visible = false; S.baskets.drop++; drawStock(); }
    if (c.cart === "trolley") goTo(c, "entrance", () => goTo(c, "carPark", () => {   // trolley left in the car park bay
      c.p.trolley.visible = false; c.p.carryHeld = false; S.trolleys.car++; drawStock(); goTo(c, "outside", () => { c.state = "gone"; }); }));
    else goTo(c, "entrance", () => goTo(c, "outside", () => { c.state = "gone"; }));
  }
  function moveUp(list, spotFn, c, face) { const k = list.indexOf(c), q = spotFn(k); if (!c.path.length && Math.hypot(q.x - c.x, q.z - c.z) > .3) goTo(c, q, () => { c.act = "idle"; c.face = face; }); }
  function thinkCustomer(c) {
    if (c.state === "browse" && S.t >= c.until) nextShelf(c);
    if (c.state === "queue") {
      const k = S.queue.indexOf(c);
      if (k === 0 && !c.path.length) { const server = staffAgents().find(a => a.task && a.task.kind === "till" && a.state === "task");
        if (server) { c.state = "paying"; c.until = S.t + .8 + Math.random() * 1.2 + (c.cart === "trolley" ? 1.2 : 0); c.act = "work"; c.face = 0; } }
      else if (k > 0) moveUp(S.queue, queueSpot, c, 0);
    }
    if (c.state === "paying" && S.t >= c.until) { S.queue.shift(); S.stats.served++; leave(c); }
    // self-checkouts: next free kiosk; liquor needs an ID check and some scans need a hand
    if (c.state === "selfq") {
      const k = S.selfQueue.indexOf(c), free = KIOSKS.find(x => !x.who);
      if (k === 0 && free && !c.path.length) { S.selfQueue.shift(); free.who = c.id; c.kiosk = free; c.state = "toKiosk";
        goTo(c, free, () => { c.state = "scanning"; c.act = "work"; c.face = free.face; c.until = S.t + 1.5 + Math.random() * 1.8 + (c.cart === "trolley" ? 1.5 : 0);
          const needs = c.liquor ? "ID check for alcohol" : Math.random() < (SELF.help_rate || .1) ? ["Unexpected item in the bagging area", "Weigh the loose fruit", "Card declined, try again"][Math.floor(Math.random() * 3)] : null;
          if (needs) { c.needHelp = needs; c.state = "help"; if (free.lamp) free.lamp.material = ctx.glow("#ff6b6b"); say(c, c.liquor ? "Need someone to check my ID" : "Can someone help?", "warn", 2.4);
            task({ title: `Help at self-checkout ${free.n}: ${needs}`, due: S.t, minutes: 1, priority: 0, area: "Self-checkout", quiet: false,
              where: { x: free.hx, z: free.hz, face: free.face }, onDone: a => { c.state = "scanning"; c.until = S.t + .8; if (free.lamp) free.lamp.material = ctx.glow("#3fb87f"); say(a, c.liquor ? "ID checked, thanks!" : "All sorted", "done", 1.8); } }); }
        }); }
      else if (k > 0) moveUp(S.selfQueue, selfSpot, c, Math.PI);
    }
    if (c.state === "scanning" && S.t >= c.until) { c.kiosk.who = null; S.stats.served++; S.stats.self = (S.stats.self || 0) + 1; leave(c); }
    // café: order and pay at the café till, wait for the coffee, go
    if (c.state === "cafeq") {
      const k = S.cafeQueue.indexOf(c);
      if (k === 0 && !c.path.length) { const server = staffAgents().find(a => a.task && a.task.kind === "cafe" && a.state === "task");
        if (server) { c.state = "ordering"; c.until = S.t + 1 + Math.random() * 1.5; c.act = "work"; c.face = Math.PI / 2; } }
      else if (k > 0) moveUp(S.cafeQueue, cafeSpot, c, Math.PI / 2);
      if (CAFE && S.t >= CAFE.close + 2 && c.state === "cafeq") { S.cafeQueue.splice(S.cafeQueue.indexOf(c), 1); say(c, "Oh, the café's closed", "warn", 2); joinQueue(c); }
    }
    if (c.state === "ordering" && S.t >= c.until) { S.cafeQueue.shift(); S.stats.served++; S.stats.cafe = (S.stats.cafe || 0) + 1; if (Math.random() < .2) say(c, "Flat white, thanks ☕", "say", 2); leave(c); }
  }

  /* ---------- time control */
  function warp(day, t) {
    [...agents].forEach(despawn); S.queue = []; S.selfQueue = []; S.cafeQueue = [];
    S.day = day; S.t = t; FX.forEach(f => { f.topped = false; }); planDay(day);
    S.doorsOpen = t >= OPEN && t < CLOSE;
    // everything due well before now is already done by whoever was on
    S.tasks.forEach(k => { if (isStation(k)) return; if (isFinite(k.total) && k.due + k.total + 10 < t) { k.status = "done"; k.progress = 1; k.doneAt = k.due + k.total;
      const who = S.staff.find(m => m.start <= k.due && m.end > k.due && (!k.role || k.role === m.role)); k.doneBy = who ? who.name : "Team"; if (k.fx != null && /Top up|stock-out/.test(k.title)) FX[k.fx].topped = true; } });
    S.staff.forEach(m => m.breaks.forEach(b => { if (b.at + b.minutes < t) b.done = true; }));
    // staff already on shift start where the work is
    S.staff.filter(m => t >= m.start && t < m.end).forEach(m => {
      const spot = m.role === "Store Manager" ? placeOf("desk") : placeOf(FX[Math.floor(Math.random() * FX.length)].id);
      const a = spawn("staff", { id: m.id, name: m.name, role: m.role, m, state: "free", seed: (m.id.charCodeAt(0) * 7 % 13) / 13 }, [spot.x, spot.z]);
      a.face = spot.face ?? Math.PI;
    });
    // customers in the store now
    drawStock();
    if (S.doorsOpen) { const n = Math.round(ratePerMin() * 7); for (let i = 0; i < n; i++) spawnCustomer(pickShelf()); }
    refreshStatus(); log(`${DAYS[day]} ${fmt(t)}: ${S.delivery ? "delivery day" : "no delivery today"}`);
  }
  S.setTime = (day, t) => warp(day, t);
  S.setSpeed = v => { S.speed = v; };
  S.toggle = () => { S.playing = !S.playing; };
  S.agents = agents;
  S.nzNow = () => {
    const p = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const g = k => (p.find(x => x.type === k) || {}).value; return { day: Math.max(0, DAYS.indexOf(g("weekday"))), t: +g("hour") * 60 + +g("minute") };
  };

  /* ---------- frame */
  const walkMul = () => S.speed <= 1 ? 1 : Math.min(4, 1 + Math.log10(S.speed) * 1.4);
  function step(dtReal) {
    simT += dtReal;
    if (S.playing) {
      const dt = dtReal * S.speed / 60;                    // sim minutes this frame
      S.t += dt;
      if (S.t > hm("22:10") && !agents.length) { warp((S.day + 1) % 7, hm("05:45")); return; }
      refreshStatus();
      if (!S.doorsOpen && S.t >= OPEN + 10 && S.t < CLOSE) { S.doorsOpen = true; log("Doors opened"); }
      if (S.doorsOpen && S.t >= CLOSE + 10) S.doorsOpen = false;
      // staff arrive for their shift
      S.staff.forEach(m => { if (onShift(m) && !m.arrived && !agents.some(a => a.id === m.id)) { m.arrived = true;
        const a = spawn("staff", { id: m.id, name: m.name, role: m.role, m, state: "arriving", seed: (m.id.charCodeAt(0) * 7 % 13) / 13 }, [PL.outside[0] + (Math.random() - .5), PL.outside[1]]);
        goTo(a, "entrance", () => goTo(a, "staffDoor", () => { a.state = "free"; say(a, "Clocked in 👋", "say", 2); })); } });
      if (S.delivery && !BR.pallets.visible && S.t >= hm(OPS.deliveries.arrive) && S.tasks.some(x => x.title.startsWith("Unload") && x.status !== "done")) { BR.pallets.visible = true; log(`Delivery from ${OPS.deliveries.from} at the dock`); }
      // customers arrive
      owed += ratePerMin() * dt; while (owed >= 1) { owed -= 1; if (agents.filter(a => a.kind === "customer").length < 45) { if (Math.random() < (DLV.share_pct || 0) / 100 * .45) spawnDriver(); else spawnCustomer(); } }
      restockCheck();
      agents.filter(a => a.kind === "staff").forEach(a => thinkStaff(a, dt));
      agents.filter(a => a.kind === "customer").forEach(a => thinkCustomer(a, dt));
      S.stats.peak = Math.max(S.stats.peak, agents.filter(a => a.kind === "customer").length);
    }
    // movement and poses (real time)
    const sp = 1.35 * walkMul() * (S.playing ? 1 : 0);
    [...agents].forEach(a => {
      if (a.state === "gone") { despawn(a); return; }
      if (a.path.length) {
        let left = sp * dtReal;
        while (left > 0 && a.path.length) {
          const [tx, tz] = a.path[0], dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
          if (d <= left) { a.x = tx; a.z = tz; a.path.shift(); left -= d; } else { a.x += dx / d * left; a.z += dz / d * left; a.ry = Math.atan2(dx, dz); left = 0; }
        }
        a.act = "walk";
        if (!a.path.length) { a.act = "idle"; const f = a.onArrive; a.onArrive = null; if (f) f(); }
      } else if (a.face != null && a.act !== "walk") a.ry = a.face;
      const g = a.p.g; g.position.set(a.x, 0, a.z);
      let d = a.ry - g.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; g.rotation.y += d * Math.min(1, dtReal * 10);
      pose(a.p, S.playing ? a.act : (a.act === "walk" ? "idle" : a.act), simT, still);
      if (a.bubble && simT > a.bubble.until) { g.remove(a.bubble.sp); a.bubble.sp.material.map.dispose(); a.bubble.sp.material.dispose(); a.bubble = null; }
      if (a.tag) a.tag.visible = ctx.view() === "walk" || Math.hypot(ctx.camera.position.x - a.x, ctx.camera.position.z - a.z) < 18;
    });
  }

  const now = S.nzNow();
  warp(now.day, now.t >= hm("05:45") && now.t < hm("21:40") ? now.t : hm("05:50"));
  if (!(now.t >= hm("05:45") && now.t < hm("21:40"))) log("Store is closed right now: replaying the next trading day from 5:50am");
  const ui = initUI(ctx, S, { fmt, hm, DAYS });
  let acc = 0;
  ctx.hooks.push((dtReal) => { step(dtReal); acc += dtReal; if (acc > .25) { acc = 0; ui.update(); } });
  ctx.onPerson = id => ui.showPerson(id);
}
