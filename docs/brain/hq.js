/* Shelly HQ v2: the company as a 3D campus.
   Eight department islands around the brain plaza; one desk per agent (★ = department head).
   Island colour = department, shirt colour = the business the agent serves.
   Cards over each island show agents, KPIs, doing/next/done and what waits for that head.
   Tap an island (or its card) to go in: the camera flies there, desks get labels, and the left panel
   becomes that department's head. Paper flies along hand-offs; a gold sheet flies when an approval
   moves to the next signer. Panels (tasks, calendar, funds, opportunities) live in hq-panels.js. */
import * as THREE from "../kit/vendor/three.module.min.js";
import { S, DEP, AG, on, focus, deptStats, initPanels } from "./hq-panels.js";

const B = window.SHELLY_BRAIN;
const host = document.getElementById("hq");
const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => host.clientWidth < 620;
const BIZ = Object.fromEntries(B.businesses.map(b => [b.id, b]));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const K = () => window.ShellyKit;
const openItems = () => (K() ? K().open() : (window.SHELLY_APPROVALS || { items: [] }).items);
const pendingOf = id => openItems().filter(i => i.agent === id);

function glOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }

/* ---------- canvas textures */
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, text, max) { let t = text; while (g.measureText(t).width > max && t.length > 3) t = t.slice(0, -2); return t === text ? t : t + "…"; }
function screenTex(a, pend, col) {
  return canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h); g.fillStyle = "#151f30"; g.fillRect(0, 0, w, 34);
    ["#ff6b6b", "#ffc466", "#3fb87f"].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(20 + i * 20, 17, 6, 0, 7); g.fill(); });
    g.fillStyle = "#7d8a9c"; g.font = "500 17px monospace"; g.fillText(fit(g, "shelly://" + a.id, 380), 90, 23);
    g.fillStyle = col; g.font = "700 30px system-ui, sans-serif"; g.fillText(fit(g, (a.head_of ? "★ " : "") + a.name, 470), 22, 76);
    const work = (a.work || []).find(x => x[0] === "doing") || (a.work || [])[0];
    const rows = a.live.length ? a.live.slice(0, 2).map(l => [l.label, String(l.value)]) : work ? [[work[1], ""]] : [];
    g.font = "500 22px system-ui, sans-serif";
    rows.forEach(([l, v], i) => { g.fillStyle = "#b0bac8"; g.fillText(fit(g, l, v ? 300 : 470), 22, 122 + i * 40);
      if (v) { g.fillStyle = "#eaf0f6"; g.font = "700 24px monospace"; g.textAlign = "right"; g.fillText(fit(g, v, 160), w - 22, 122 + i * 40); g.textAlign = "left"; g.font = "500 22px system-ui, sans-serif"; } });
    const s = pend ? ["#ffc466", `⚠ ${pend} waiting for sign-off`] : a.status === "attention" ? ["#ffc466", "● suggestion ready"] : a.autonomy === "auto" ? ["#3fb87f", "● running on its own"] : ["#63b6d8", "✓ up to date"];
    g.fillStyle = s[0]; g.font = "600 21px monospace"; g.fillText(s[1], 22, h - 24);
  });
}
function iconTex(kind) {
  return canvasTex(128, 128, g => {
    if (kind === "warn") { g.fillStyle = "#ffc466"; g.strokeStyle = "#1a1206"; g.lineWidth = 7; g.lineJoin = "round";
      g.beginPath(); g.moveTo(64, 10); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#1a1206"; g.fillRect(58, 42, 12, 40); g.beginPath(); g.arc(64, 96, 7, 0, 7); g.fill(); }
    else if (kind === "idea") { g.fillStyle = "rgba(255,196,102,.25)"; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
      g.fillStyle = "#ffc466"; g.beginPath(); g.arc(64, 54, 30, 0, 7); g.fill(); g.fillRect(50, 78, 28, 22); g.fillStyle = "#7a5a1e"; g.fillRect(50, 90, 28, 5); g.fillRect(54, 100, 20, 6); }
    else if (kind === "done") { g.fillStyle = "#3fb87f"; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill();
      g.strokeStyle = "#062014"; g.lineWidth = 12; g.lineCap = "round"; g.beginPath(); g.moveTo(38, 66); g.lineTo(56, 84); g.lineTo(92, 46); g.stroke(); }
    else if (kind === "star") { g.fillStyle = "#f2c14e"; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 24 : 56, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fill();
      g.strokeStyle = "#5a4310"; g.lineWidth = 5; g.stroke(); }
    else if (kind === "paper" || kind === "gold") { g.fillStyle = kind === "gold" ? "#ffe39a" : "#e9eef6"; rr(g, 26, 14, 76, 100, 8); g.fill();
      g.fillStyle = kind === "gold" ? "#b8862b" : "#9aa7b8"; for (let i = 0; i < 5; i++) g.fillRect(38, 34 + i * 15, i === 4 ? 30 : 52, 6);
      g.fillStyle = kind === "gold" ? "#f2c14e" : "#63b6d8"; rr(g, 46, 6, 36, 16, 5); g.fill(); }
  });
}

function build() {
  host.classList.add("on");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = window.innerWidth >= 900; renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // decided once: toggling later breaks compiled materials
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x0b0f18, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 50, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 }); sun.shadow.bias = -0.0006;
  scene.add(sun);
  const world = new THREE.Group(); scene.add(world);

  const M = {
    desk: new THREE.MeshStandardMaterial({ color: 0x9c9488, roughness: 0.7 }), leg: new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.6 }),
    mon: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.4, metalness: 0.3 }), chair: new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5 }), pot: new THREE.MeshStandardMaterial({ color: 0x5b3a2a, roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 0.8 }), walk: new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.9 }),
  };
  const shirts = Object.fromEntries(B.businesses.map(b => [b.id, new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour).multiplyScalar(0.7), roughness: 0.6 })]));
  const ICON = { warn: iconTex("warn"), idea: iconTex("idea"), done: iconTex("done"), star: iconTex("star"), paper: iconTex("paper"), gold: iconTex("gold") };
  const box = (w, h, d, m, x, y, z, parent, shadow = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = shadow; parent.add(o); return o; };

  /* ---- brain plaza */
  const plaza = new THREE.Group(); world.add(plaza);
  box(13, 0.6, 13, new THREE.MeshStandardMaterial({ color: 0x141b29, roughness: 0.85 }), 0, -0.3, 0, plaza).castShadow = false;
  const pe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(13, 0.6, 13)), new THREE.LineBasicMaterial({ color: 0x63b6d8, transparent: true, opacity: 0.5 }));
  pe.position.y = -0.3; plaza.add(pe);
  const brain = new THREE.Group(); brain.position.y = 1.6; plaza.add(brain);
  const N = 90, pts = [], rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < N; i++) { const a = rnd(i) * Math.PI * 2, r = Math.sqrt(rnd(i + 99)) * 5.2; pts.push(new THREE.Vector3(Math.cos(a) * r, (rnd(i + 7) - 0.5) * 1.6, Math.sin(a) * r)); }
  const pg = new THREE.BufferGeometry().setFromPoints(pts);
  brain.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.22, transparent: true, opacity: 0.95, toneMapped: false })));
  const lp = []; pts.forEach((p, i) => pts.forEach((q, j) => { if (j > i && p.distanceTo(q) < 1.45) lp.push(p, q); }));
  brain.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lp), new THREE.LineBasicMaterial({ color: 0x63b6d8, transparent: true, opacity: 0.35, toneMapped: false })));

  /* ---- department islands in a ring */
  const R = 29, COLS = 3, SX = 4.6, SZ = 5.2;
  const islands = {}, desks = {}, pick = [];
  B.departments.forEach((d, i) => {
    const ang = Math.PI / 4 * i + Math.PI / 8 + Math.PI;   // start top-left, go round
    const list = d.agents.map(id => AG[id]).sort((x, y) => (y.id === d.head_agent) - (x.id === d.head_agent));
    const rows = Math.ceil(list.length / COLS), W = COLS * SX + 2.2, D = rows * SZ + 2.6;
    const g = new THREE.Group(); g.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R); g.rotation.y = 0; world.add(g);
    const tint = new THREE.Color(d.colour).lerp(new THREE.Color(0x0e1424), 0.72);
    const slab = box(W, 0.6, D, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85 }), 0, -0.3, 0, g); slab.castShadow = false;
    slab.userData.dept = d.id; pick.push(slab);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.6, D)), new THREE.LineBasicMaterial({ color: d.colour, transparent: true, opacity: 0.6 }));
    edge.position.y = -0.3; g.add(edge);
    // walkway to the plaza
    const from = new THREE.Vector3(Math.cos(ang) * 6.5, 0, Math.sin(ang) * 6.5), to = new THREE.Vector3(Math.cos(ang) * (R - Math.min(W, D) / 2), 0, Math.sin(ang) * (R - Math.min(W, D) / 2));
    const len = from.distanceTo(to), walk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, len), M.walk);
    walk.position.copy(from.clone().lerp(to, 0.5)).setY(-0.45); walk.lookAt(to.clone().setY(-0.45)); walk.receiveShadow = true; world.add(walk);
    // plant
    const plant = new THREE.Group(); plant.position.set(W / 2 - 0.8, 0, -D / 2 + 0.8); g.add(plant);
    box(0.6, 0.6, 0.6, M.pot, 0, 0.3, 0, plant);
    [[0, 1.0, 0, 0.45], [0.25, 1.35, 0.1, 0.32], [-0.2, 1.3, -0.1, 0.3]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M.leaf); s.position.set(x, y, z); s.castShadow = true; plant.add(s); });
    islands[d.id] = { d, g, W, D };
    list.forEach((a, k) => {
      const c = k % COLS, r = Math.floor(k / COLS);
      const dg = new THREE.Group(); dg.position.set((c - (COLS - 1) / 2) * SX, 0, (r - (rows - 1) / 2) * SZ - 0.3); g.add(dg);
      box(3.2, 0.14, 1.5, M.desk, 0, 1.45, 0, dg); box(0.12, 1.4, 1.3, M.leg, -1.45, 0.72, 0, dg); box(0.12, 1.4, 1.3, M.leg, 1.45, 0.72, 0, dg);
      box(0.12, 0.5, 0.12, M.mon, 0, 1.75, -0.45, dg); box(2.5, 1.5, 0.1, M.mon, 0, 2.6, -0.5, dg);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.38), new THREE.MeshBasicMaterial({ map: screenTex(a, pendingOf(a.id).length, d.colour), toneMapped: false }));
      scr.position.set(0, 2.6, -0.44); dg.add(scr);
      const chair = new THREE.Group(); chair.position.set(0, 0, 1.25); dg.add(chair);
      box(1.0, 0.14, 0.95, M.chair, 0, 0.95, 0, chair); box(1.0, 1.0, 0.12, M.chair, 0, 1.5, 0.48, chair); box(0.12, 0.85, 0.12, M.leg, 0, 0.45, 0, chair);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 40), new THREE.MeshBasicMaterial({ color: 0x3fb87f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.02, 1.25); dg.add(ring);
      const body = new THREE.Group(); body.position.set(0, 0, 1.15); dg.add(body);
      const shirt = shirts[a.business] || shirts.group;
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 6, 14), shirt); torso.position.y = 1.62; torso.castShadow = true; body.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), M.skin); head.position.y = 2.5; head.castShadow = true; body.add(head);
      const arms = [];
      for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), shirt); arm.position.set(s * 0.42, 1.68, -0.38); arm.rotation.x = Math.PI / 2.4; arm.castShadow = true; body.add(arm); arms.push(arm); }
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON.done, transparent: true, depthTest: false, toneMapped: false }));
      icon.scale.set(0.9, 0.9, 1); icon.position.set(0, 3.5, 1.15); icon.renderOrder = 5; dg.add(icon);
      if (a.id === d.head_agent) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON.star, transparent: true, depthTest: false, toneMapped: false }));
        st.scale.set(0.8, 0.8, 1); st.position.set(-1.1, 3.25, 1.15); st.renderOrder = 6; dg.add(st); }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 1.8, 0.5); hit.userData.agent = a.id; dg.add(hit); pick.push(hit);
      desks[a.id] = { a, d, g: dg, scr, icon, arms, head, ring, phase: rnd(k + i * 9) * 6, pend: -1 };
    });
  });

  /* ---- cables from the sky to each department (data in) */
  const cables = new THREE.Group(); world.add(cables);
  B.departments.forEach((d, i) => {
    const I = islands[d.id], p = I.g.position.clone(), top = new THREE.Vector3(p.x * 0.25, 22, p.z * 0.25 - 4);
    const c = new THREE.QuadraticBezierCurve3(top, top.clone().lerp(p, 0.5).add(new THREE.Vector3(0, 6, 0)), p.clone().setY(3.5));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(40)), new THREE.LineDashedMaterial({ color: d.colour, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.45 }));
    l.computeLineDistances(); cables.add(l);
  });

  /* ---- HTML overlays: department cards, brain label, desk labels, bubbles, tooltip */
  const ov = document.createElement("div"); ov.className = "hq-ov"; host.appendChild(ov);
  const cards = {};
  B.departments.forEach(d => { const e = document.createElement("button"); e.type = "button"; e.className = "hq-card"; e.style.setProperty("--c", d.colour);
    e.onclick = () => focus(d.id); ov.appendChild(e); cards[d.id] = e; });
  const brainL = document.createElement("div"); brainL.className = "hq-brainl"; ov.appendChild(brainL);
  const labels = {};
  Object.values(desks).forEach(k => { const e = document.createElement("button"); e.type = "button"; e.className = "hq-dl"; e.hidden = true;
    e.onclick = () => window.ShellyBrain && window.ShellyBrain.openAgent(k.a.id); ov.appendChild(e); labels[k.a.id] = e; });
  const tip = document.createElement("div"); tip.className = "hq-tip"; tip.hidden = true; host.appendChild(tip);
  const bub = document.createElement("div"); bub.className = "hq-bub"; bub.hidden = true; host.appendChild(bub);

  function paintCards() {
    B.departments.forEach(d => {
      const st = deptStats(d.id), e = cards[d.id], sm = small();
      e.innerHTML = sm ? `<i></i>${esc(d.name)}${st.waitHere.length ? ` <span class="w">⚠${st.waitHere.length}</span>` : ""}`
        : `<span class="h"><i></i>${esc(d.name.toUpperCase())}</span><span class="n">${d.agents.length}<small>AGENTS</small></span>
          ${S.focus === d.id ? d.kpis.map(k => `<span class="k"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></span>`).join("") : ""}
          <span class="dnd">DOING <b>${st.doing}</b> NEXT <b>${st.next}</b> DONE <b>${st.done}</b></span>
          ${st.waitHere.length ? `<span class="w">⚠ ${st.waitHere.length} waiting approval</span>` : ""}`;
      e.classList.toggle("compact", sm); e.classList.toggle("sel", S.focus === d.id);
      e.setAttribute("aria-label", `${d.name}: ${d.agents.length} agents, ${st.waitHere.length} waiting for the head. Open department.`);
    });
    brainL.innerHTML = `● THE BRAIN <b>${B.routines.length}</b> routines · <b>${openItems().length}</b> in approval`;
    Object.values(desks).forEach(k => { const n = pendingOf(k.a.id).length;
      labels[k.a.id].innerHTML = `${k.a.id === k.d.head_agent ? "★ " : ""}${esc(k.a.name.toUpperCase())}${n ? ` <b>●${n}</b>` : ""}`; });
  }

  /* ---- status refresh */
  function refreshStatus() {
    Object.values(desks).forEach(k => {
      const n = pendingOf(k.a.id).length;
      if (n !== k.pend) { k.pend = n; k.scr.material.map.dispose(); k.scr.material.map = screenTex(k.a, n, k.d.colour); k.scr.material.needsUpdate = true; }
      k.mode = n ? "warn" : k.a.status === "attention" ? "idea" : k.a.autonomy === "auto" ? "work" : "done";
      k.icon.visible = k.mode !== "work"; if (k.icon.visible) k.icon.material.map = ICON[k.mode]; k.icon.material.needsUpdate = true;
      k.g.visible = !S.biz || k.a.business === S.biz || k.a.business === "group";
    });
    paintCards();
  }

  /* ---- camera: orthographic iso, fits the campus or one island */
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const yaw0 = Math.PI / 4, pitch = 0.62;
  let userYaw = 0, userZoom = 1;
  const view = { target: new THREE.Vector3(), half: 30 }, goal = { target: new THREE.Vector3(), half: 30 };
  function placeCam(t, yaw) { const R0 = 140; cam.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * R0, t.y + Math.sin(pitch) * R0, t.z + Math.cos(yaw) * Math.cos(pitch) * R0); cam.lookAt(t); }
  function fitTo(objs) {   // returns {target, half} that frames the given islands at the resting angle
    const w = host.clientWidth, h = host.clientHeight, a = w / h;
    placeCam(new THREE.Vector3(), yaw0); cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    world.updateMatrixWorld(true);
    objs.forEach(I => { for (let i = 0; i < 8; i++) { v.set((i & 1 ? 1 : -1) * I.W / 2, i & 2 ? 4.4 : -0.6, (i & 4 ? 1 : -1) * I.D / 2); I.g.localToWorld(v); v.applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } });
    const r = new THREE.Vector3(), u = new THREE.Vector3(); cam.matrixWorld.extractBasis(r, u, new THREE.Vector3());
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pad = objs.length > 1 ? (small() ? 1.0 : 1.08) : 1.18;   // room for cards in the overview
    return { target: r.multiplyScalar(cx).add(u.multiplyScalar(cy)), half: Math.max((y1 - y0) / 2, (x1 - x0) / 2 / a) * pad + (objs.length > 1 && !small() ? 9 : objs.length > 1 ? 3 : 0) };
  }
  function setGoal(instant) {
    const all = Object.values(islands);
    const f = S.focus ? fitTo([islands[S.focus]]) : fitTo(all);
    goal.target.copy(f.target); goal.half = f.half; if (S.focus) userYaw = 0;
    if (instant) { view.target.copy(goal.target); view.half = goal.half; }
    document.getElementById("hqOver").hidden = !S.focus;
  }
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false); setGoal(true); paintCards();
  }

  /* ---- hand-offs and approval flights */
  const pairs = []; B.agents.forEach(a => a.hands_off_to.forEach(t => { if (desks[t] && desks[a.id]) pairs.push([a.id, t]); }));
  const flights = [];
  function fly(f, to, kind, t) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON[kind], transparent: true, depthTest: false, toneMapped: false }));
    s.scale.set(kind === "gold" ? 1.4 : 0.9, kind === "gold" ? 1.4 : 0.9, 1); s.renderOrder = 7; world.add(s);
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    desks[f].g.localToWorld(p0.set(0, 2.4, 0.4)); desks[to].g.localToWorld(p1.set(0, 2.4, 0.4)); world.worldToLocal(p0); world.worldToLocal(p1);
    const mid = p0.clone().lerp(p1, 0.5); mid.y += 4 + p0.distanceTo(p1) * 0.22;
    flights.push({ s, curve: new THREE.QuadraticBezierCurve3(p0, mid, p1), t0: t, dur: 1.2 + p0.distanceTo(p1) * 0.035 });
  }
  let nowT = 0;
  addEventListener("shelly:approvals", e => {
    refreshStatus();
    const k = e.detail && e.detail.key; if (!k || still || !K()) return;
    const it = K().items().find(x => x.key === k); if (!it) return;
    const ch = K().chainOf(it), at = K().stepOf(it);
    if (e.detail.step && ch[at - 1] && ch[at] && desks[ch[at - 1].head] && desks[ch[at].head]) fly(ch[at - 1].head, ch[at].head, "gold", nowT);
    if (e.detail.added && desks[it.agent] && ch[0] && desks[ch[0].head] && ch[0].head !== it.agent) fly(it.agent, ch[0].head, "gold", nowT);
  });

  /* ---- input */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement; el.style.touchAction = "pan-y";
  let drag = null, moved = 0, lastInput = -1e9; const ptrs = new Map();
  function hitAt(e) { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam); const h = ray.intersectObjects(pick, false).find(x => x.object.parent.visible !== false); return h && h.object.userData; }
  el.addEventListener("pointerdown", e => { ptrs.set(e.pointerId, e); drag = { x: e.clientX, yaw: userYaw }; moved = 0; lastInput = performance.now(); });
  el.addEventListener("pointermove", e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (drag.pinch) userZoom = Math.max(0.7, Math.min(3, drag.z * dd / drag.pinch)); else { drag.pinch = dd; drag.z = userZoom; } moved = 99; return; }
    if (drag && e.buttons) { const dx = e.clientX - drag.x; moved = Math.max(moved, Math.abs(dx)); if (e.pointerType === "mouse" || Math.abs(dx) > 8) userYaw = drag.yaw - dx * 0.005; lastInput = performance.now(); return; }
    const h = hitAt(e); el.style.cursor = h ? "pointer" : "grab";
    if (h && h.agent) { const a = AG[h.agent], n = pendingOf(h.agent).length, r = host.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(a.name)}${a.head_of ? " ★" : ""}</b><span>${esc(DEP[a.department].name)} · ${esc(a.team)}</span><span>${n ? `⚠ ${n} waiting for sign-off` : a.autonomy === "auto" ? "runs on its own" : a.autonomy === "suggest" ? "suggests, a person decides" : "needs approval"}</span>`;
      tip.style.left = Math.min(e.clientX - r.left + 14, host.clientWidth - 230) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px"; tip.hidden = false; }
    else tip.hidden = true;
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2 && drag) drag.pinch = 0;
    if (!ptrs.size) { if (moved < 6) { const h = hitAt(e);
      if (h && h.agent) { if (S.focus !== AG[h.agent].department) focus(AG[h.agent].department); else window.ShellyBrain && window.ShellyBrain.openAgent(h.agent); }
      else if (h && h.dept) focus(h.dept); } drag = null; } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); drag = null; });
  el.addEventListener("pointerleave", () => { tip.hidden = true; });
  el.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey && !e.altKey) return; e.preventDefault(); userZoom = Math.max(0.7, Math.min(3, userZoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
  host.querySelectorAll("[data-hq]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.hq; if (k === "in") userZoom = Math.min(3, userZoom * 1.25); if (k === "out") userZoom = Math.max(0.7, userZoom / 1.25);
    if (k === "reset") { userZoom = 1; userYaw = 0; focus(null); } lastInput = performance.now(); }));
  document.getElementById("hqOver").onclick = () => focus(null);
  on(w => { if (w === "focus") { userZoom = 1; setGoal(false); paintCards(); } if (w === "biz") refreshStatus(); if (w === "task") paintCards(); });

  /* ---- loop */
  let visible = true; new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(host);
  new ResizeObserver(resize).observe(host);
  refreshStatus(); resize();
  let nextLaunch = 1, bubT = 3, bubUntil = 0, bubId = null;
  const v3 = new THREE.Vector3();
  const project = (o, x, y, z) => { v3.set(x, y, z); o.localToWorld(v3); v3.project(cam); return [(v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight, v3.z]; };
  function frame(ms) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || host.offsetParent === null) return;
    const t = ms / 1000; nowT = t;
    if (!still && !S.focus && performance.now() - lastInput > 5000) userYaw += (Math.sin(t * 0.1) * 0.25 - userYaw) * 0.008;
    view.target.lerp(goal.target, still ? 1 : 0.08); view.half += (goal.half / userZoom - view.half) * (still ? 1 : 0.08);
    const w = host.clientWidth, h = host.clientHeight, a = w / h;
    cam.left = -view.half * a; cam.right = view.half * a; cam.top = view.half; cam.bottom = -view.half; cam.updateProjectionMatrix();
    placeCam(view.target, yaw0 + userYaw);
    if (!still) brain.rotation.y = t * 0.15;
    Object.values(desks).forEach(k => {
      const work = k.mode === "work" && !still;
      k.arms.forEach((m, i) => { m.rotation.x = Math.PI / 2.4 + (work ? Math.sin(t * 14 + k.phase + i * 1.7) * 0.12 : 0); });
      k.head.position.y = 2.5 + (still ? 0 : Math.sin(t * 1.3 + k.phase) * 0.03);
      k.ring.material.opacity = k.mode === "work" ? 0.35 + (still ? 0 : 0.25 * Math.sin(t * 3 + k.phase)) : 0;
      if (k.icon.visible) { k.icon.position.y = 3.5 + (still ? 0 : Math.sin(t * 2.2 + k.phase) * 0.12); const s = k.mode === "warn" && !still ? 0.9 + 0.12 * Math.sin(t * 5 + k.phase) : 0.9; k.icon.scale.set(s, s, 1); }
    });
    if (!still && t > nextLaunch && pairs.length) { const [f, to] = pairs[Math.floor(Math.random() * pairs.length)]; if (desks[f].g.visible && desks[to].g.visible) fly(f, to, "paper", t); nextLaunch = t + 1.4 + Math.random() * 1.4; }
    for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i], u = (t - f.t0) / f.dur;
      if (u >= 1) { world.remove(f.s); f.s.material.dispose(); flights.splice(i, 1); continue; }
      f.s.position.copy(f.curve.getPoint(u)); f.s.material.rotation = Math.sin(u * 6) * 0.3; }
    renderer.render(scene, cam);
    // overlays
    const sm = small();
    const [px, py] = project(plaza, 0, 0, 0);
    B.departments.forEach(d => { const I = islands[d.id], e = cards[d.id];
      const show = !S.focus || S.focus === d.id; e.hidden = !show || (S.focus === d.id && sm); if (e.hidden) return;
      if (S.focus === d.id) { const [x, y] = project(I.g, -I.W / 2, 4.5, -I.D / 2); e.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%)`; return; }
      // anchor on the island's outer edge, then push the card outward from the plaza so it never covers the desks
      const dir = I.g.position.clone().setY(0).normalize(), ext = Math.max(I.W, I.D) / 2;
      const [x, y] = project(world, I.g.position.x + dir.x * ext, 1, I.g.position.z + dir.z * ext);
      let ux = x - px, uy = y - py; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      const cw = e.offsetWidth, ch = e.offsetHeight;
      let cx = x + ux * (cw / 2 + 6), cy = y + uy * (ch / 2 + 6);
      cx = Math.max(cw / 2 + 4, Math.min(host.clientWidth - cw / 2 - 4, cx)); cy = Math.max(ch / 2 + 4, Math.min(host.clientHeight - ch / 2 - 4, cy));
      e.style.transform = `translate(${cx.toFixed(0)}px,${cy.toFixed(0)}px) translate(-50%,-50%)`; });
    { const [x, y] = project(plaza, 0, 3.6, 0); brainL.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%)`; brainL.hidden = !!S.focus; }
    Object.values(desks).forEach(k => { const e = labels[k.a.id], show = S.focus === k.d.id && k.g.visible; e.hidden = !show; if (!show) return;
      const [x, y] = project(k.g, 0, 3.55, -0.5); e.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%)`; });
    // one speech bubble at a time from a desk with something to say
    if (t > bubT) {
      const cand = Object.values(desks).filter(k => k.g.visible && (!S.focus || k.d.id === S.focus) && (pendingOf(k.a.id).length || k.a.head_of));
      const k = cand[Math.floor(Math.random() * cand.length)];
      if (k) { const st = k.a.head_of ? deptStats(k.a.head_of) : null, n = pendingOf(k.a.id).length;
        bub.innerHTML = `<b>${esc(k.a.name.replace(/ agent$/, ""))}</b> ` + esc(st ? (st.waitHere.length ? `${st.waitHere.length} waiting for my sign-off` : `${st.doing} in progress, ${st.next} scheduled`) : `${n} waiting for sign-off`);
        bub.hidden = false; bub.classList.remove("in"); void bub.offsetWidth; bub.classList.add("in"); bubId = k.a.id; bubUntil = t + 5; }
      bubT = t + (sm ? 9 : 6.5);
    }
    if (bubId && !bub.hidden) { const k = desks[bubId], [x, y] = project(k.g, 0, 3.3, 1.15); bub.style.left = x + "px"; bub.style.top = y + "px"; if (t > bubUntil || !k.g.visible) bub.hidden = true; }
  }
  requestAnimationFrame(frame);
  document.dispatchEvent(new CustomEvent("shelly:hq-ready"));
}

/* panels always; the campus when WebGL is available */
initPanels();
if (host && B && glOK()) build();
else { if (host) host.classList.add("flat"); document.dispatchEvent(new CustomEvent("shelly:hq-flat")); }
