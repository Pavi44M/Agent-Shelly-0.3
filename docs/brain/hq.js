/* Shelly HQ: the brain as a 3D office. One floor per business, one desk per agent.
   Screens show live numbers, ⚠ marks work waiting for you, glows show agents working on their own,
   paper hand-offs fly between desks, data sources sit below with lines to the agents that read them.
   Data: window.SHELLY_BRAIN (+ ShellyKit for live approvals). Tap an agent → ShellyBrain.openAgent(id). */
import * as THREE from "../kit/vendor/three.module.min.js";

const B = window.SHELLY_BRAIN;
const host = document.getElementById("hq");
const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => host.clientWidth < 620;
const AG = Object.fromEntries(B.agents.map(a => [a.id, a]));
const BIZ = Object.fromEntries(B.businesses.map(b => [b.id, b]));
const pendingOf = id => (window.ShellyKit ? window.ShellyKit.open() : (window.SHELLY_APPROVALS || { items: [] }).items).filter(i => i.agent === id);

function glOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }

/* ---------- canvas textures */
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, text, max) { let t = text; while (g.measureText(t).width > max && t.length > 3) t = t.slice(0, -2); return t === text ? t : t + "…"; }

function screenTex(a, pend) {
  const col = BIZ[a.business].colour;
  return canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#151f30"; g.fillRect(0, 0, w, 34);
    ["#ff6b6b", "#ffc466", "#3fb87f"].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(20 + i * 20, 17, 6, 0, 7); g.fill(); });
    g.fillStyle = "#7d8a9c"; g.font = "500 17px monospace"; g.fillText(fit(g, "shelly://" + a.id, 380), 90, 23);
    g.fillStyle = col; g.font = "700 30px system-ui, sans-serif"; g.fillText(fit(g, a.name, 470), 22, 78);
    g.font = "500 22px system-ui, sans-serif";
    a.live.slice(0, 3).forEach((l, i) => {
      g.fillStyle = "#b0bac8"; g.fillText(fit(g, l.label, 290), 22, 124 + i * 40);
      g.fillStyle = "#eaf0f6"; g.font = "700 24px monospace"; g.textAlign = "right"; g.fillText(fit(g, String(l.value), 170), w - 22, 124 + i * 40);
      g.textAlign = "left"; g.font = "500 22px system-ui, sans-serif";
    });
    const s = pend ? ["#ffc466", `⚠ ${pend} waiting for you`] : a.status === "attention" ? ["#ffc466", "● suggestion ready"] : a.autonomy === "auto" ? ["#3fb87f", "● running on its own"] : ["#63b6d8", "✓ up to date"];
    g.fillStyle = s[0]; g.font = "600 21px monospace"; g.fillText(s[1], 22, h - 24);
  });
}
function iconTex(kind) {
  return canvasTex(128, 128, (g) => {
    if (kind === "warn") {
      g.fillStyle = "#ffc466"; g.strokeStyle = "#1a1206"; g.lineWidth = 7; g.lineJoin = "round";
      g.beginPath(); g.moveTo(64, 10); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#1a1206"; g.fillRect(58, 42, 12, 40); g.beginPath(); g.arc(64, 96, 7, 0, 7); g.fill();
    } else if (kind === "idea") {
      g.fillStyle = "rgba(255,196,102,.25)"; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
      g.fillStyle = "#ffc466"; g.beginPath(); g.arc(64, 54, 30, 0, 7); g.fill(); g.fillRect(50, 78, 28, 22);
      g.fillStyle = "#7a5a1e"; g.fillRect(50, 90, 28, 5); g.fillRect(54, 100, 20, 6);
    } else if (kind === "done") {
      g.fillStyle = "#3fb87f"; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill();
      g.strokeStyle = "#062014"; g.lineWidth = 12; g.lineCap = "round"; g.beginPath(); g.moveTo(38, 66); g.lineTo(56, 84); g.lineTo(92, 46); g.stroke();
    } else if (kind === "paper") {
      g.fillStyle = "#e9eef6"; rr(g, 26, 14, 76, 100, 8); g.fill();
      g.fillStyle = "#9aa7b8"; for (let i = 0; i < 5; i++) g.fillRect(38, 34 + i * 15, i === 4 ? 30 : 52, 6);
      g.fillStyle = "#63b6d8"; rr(g, 46, 6, 36, 16, 5); g.fill();
    }
  });
}
function tileTex(label, glyph, col) {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = "#f4f7fb"; rr(g, 8, 8, 240, 240, 46); g.fill();
    g.fillStyle = col; g.font = "700 96px system-ui, sans-serif"; g.textAlign = "center"; g.fillText(glyph, w / 2, 140);
    g.fillStyle = "#1b2433"; g.font = "700 34px system-ui, sans-serif"; g.fillText(label, w / 2, 206);
  });
}
function signTex(b) {
  return canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = b.colour; g.font = "700 72px system-ui, sans-serif"; g.fillText(`${b.icon}  ${b.name}`, 10, 100);
    g.fillStyle = "rgba(234,240,246,.55)"; g.font = "500 34px monospace"; g.fillText(b.kind, 14, 148);
  });
}

/* ---------- data sources (generic tiles, no brand logos) */
const SOURCES = [
  { id: "pos", label: "POS", glyph: "🧾", col: "#63b6d8", agents: ["store-briefing", "store-forecast", "store-category", "store-ordering", "store-waste", "store-channels"] },
  { id: "xlsx", label: "Excel", glyph: "▦", col: "#2e9e5b", agents: ["store-budget", "group-reports", "totara-demand", "store-roster"] },
  { id: "bi", label: "Power BI", glyph: "▮▮", col: "#e2b13c", agents: ["group-reports", "store-briefing", "totara-brief"] },
  { id: "erp", label: "ERP / POs", glyph: "⇄", col: "#b69cf2", agents: ["totara-suppliers", "totara-inbound", "totara-stock", "totara-clients"] },
  { id: "reg", label: "Medsafe", glyph: "✚", col: "#e66767", agents: ["totara-regulatory", "store-compliance"] },
  { id: "news", label: "News", glyph: "◉", col: "#7fd1a8", agents: ["group-td", "group-electronics", "group-wholesale"] },
  { id: "mail", label: "Email", glyph: "✉", col: "#ff7b72", agents: ["group-td", "group-governance"] },
];

function build() {
  host.classList.add("on");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !small(); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b12, 70, 140);
  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x0b0f18, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(18, 30, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 }); sun.shadow.bias = -0.0005;
  scene.add(sun);
  const world = new THREE.Group(); scene.add(world);

  const M = {
    desk: new THREE.MeshStandardMaterial({ color: 0x9c9488, roughness: 0.7 }),
    leg: new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.6 }),
    mon: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.4, metalness: 0.3 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x5b3a2a, roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 0.8 }),
  };
  const ICON = { warn: iconTex("warn"), idea: iconTex("idea"), done: iconTex("done"), paper: iconTex("paper") };
  const box = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

  /* floors */
  const order = ["store", "totara", "group"];
  const COLS = 3, SX = 4.6, SZ = 5.2;
  const desks = {}, pick = [];
  const narrow = () => host.clientWidth / host.clientHeight < 0.9;
  const floors = [];
  order.forEach((bid, fi) => {
    const b = BIZ[bid], list = B.agents.filter(a => a.business === bid);
    const rows = Math.ceil(list.length / COLS), W = COLS * SX + 2.2, D = rows * SZ + 2.6;
    const fl = new THREE.Group(); world.add(fl); floors.push({ fl, W, D });
    const tint = new THREE.Color(b.colour).lerp(new THREE.Color(0x0e1424), 0.78);
    const slab = box(W, 0.6, D, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85 }), 0, -0.3, 0, fl); slab.castShadow = false;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.6, D)), new THREE.LineBasicMaterial({ color: b.colour, transparent: true, opacity: 0.55 }));
    edge.position.y = -0.3; fl.add(edge);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: signTex(b), transparent: true, depthWrite: false }));
    sign.rotation.x = -Math.PI / 2; sign.position.set(-W / 2 + 4.6, 0.02, D / 2 - 0.85); fl.add(sign);
    // plant
    const plant = new THREE.Group(); plant.position.set(W / 2 - 0.8, 0, -D / 2 + 0.8); fl.add(plant);
    box(0.6, 0.6, 0.6, M.pot, 0, 0.3, 0, plant);
    [[0, 1.0, 0, 0.45], [0.25, 1.35, 0.1, 0.32], [-0.2, 1.3, -0.1, 0.3]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M.leaf); s.position.set(x, y, z); s.castShadow = true; plant.add(s); });

    list.forEach((a, i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      const g = new THREE.Group(); g.position.set((c - (COLS - 1) / 2) * SX, 0, (r - (rows - 1) / 2) * SZ - 0.3); fl.add(g);
      // desk, monitor facing the viewer, chair and agent in front of it (back to the viewer)
      box(3.2, 0.14, 1.5, M.desk, 0, 1.45, 0, g);
      box(0.12, 1.4, 1.3, M.leg, -1.45, 0.72, 0, g); box(0.12, 1.4, 1.3, M.leg, 1.45, 0.72, 0, g);
      box(0.12, 0.5, 0.12, M.mon, 0, 1.75, -0.45, g);
      box(2.5, 1.5, 0.1, M.mon, 0, 2.6, -0.5, g);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.38), new THREE.MeshBasicMaterial({ map: screenTex(a, pendingOf(a.id).length), toneMapped: false }));
      scr.position.set(0, 2.6, -0.44); g.add(scr);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.22, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour) }));
      mug.position.set(1.15, 1.63, 0.3); mug.castShadow = true; g.add(mug);
      const chair = new THREE.Group(); chair.position.set(0, 0, 1.25); g.add(chair);
      box(1.0, 0.14, 0.95, M.chair, 0, 0.95, 0, chair); box(1.0, 1.0, 0.12, M.chair, 0, 1.5, 0.48, chair);
      box(0.12, 0.85, 0.12, M.leg, 0, 0.45, 0, chair);
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 40), new THREE.MeshBasicMaterial({ color: 0x3fb87f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      glowRing.rotation.x = -Math.PI / 2; glowRing.position.set(0, 0.02, 1.25); g.add(glowRing);
      const body = new THREE.Group(); body.position.set(0, 0, 1.15); g.add(body);
      const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour).multiplyScalar(0.65), roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 6, 14), shirt); torso.position.y = 1.62; torso.castShadow = true; body.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), M.skin); head.position.y = 2.5; head.castShadow = true; body.add(head);
      const arms = [];
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), shirt);
        arm.position.set(s * 0.42, 1.68, -0.38); arm.rotation.x = Math.PI / 2.4; arm.castShadow = true; body.add(arm); arms.push(arm);
      }
      // status icon
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON.done, transparent: true, depthTest: false, toneMapped: false }));
      icon.scale.set(0.9, 0.9, 1); icon.position.set(0, 3.5, 1.15); icon.renderOrder = 5; g.add(icon);
      // invisible hit box for tapping
      const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 1.8, 0.5); hit.userData.agent = a.id; g.add(hit); pick.push(hit);
      desks[a.id] = { a, g, scr, icon, arms, head, glowRing, phase: Math.random() * 6, pend: -1 };
    });
  });

  /* data source tiles on a ground strip, with lines up to the agents that read them */
  const srcGroup = new THREE.Group(); world.add(srcGroup);
  const srcTiles = SOURCES.map(s => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 2.6), [
      M.leg, M.leg, new THREE.MeshStandardMaterial({ map: tileTex(s.label, s.glyph, s.col), roughness: 0.4 }), M.leg, M.leg, M.leg]);
    t.castShadow = true; srcGroup.add(t); return { s, t };
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x5a7aa8, transparent: true, opacity: 0.18 });
  let srcLines = [];

  function layout() {
    const nar = narrow(), dir = nar ? new THREE.Vector3(0.62, 0, 0.62) : new THREE.Vector3(0.72, 0, -0.72);
    const gap = nar ? 21 : 22;
    floors.forEach((f, i) => { f.fl.position.copy(dir.clone().multiplyScalar((i - 1) * gap)); f.fl.position.y = (1 - i) * 1.2; });
    // a row of tiles in front of the floors (desktop) or down the left side (phone)
    const base = nar ? new THREE.Vector3(-12, -4, 12) : new THREE.Vector3(10, -4, 10);
    const step = nar ? new THREE.Vector3(2.3, 0, 2.3) : new THREE.Vector3(2.35, 0, -2.35);
    srcTiles.forEach(({ t }, i) => t.position.copy(base.clone().add(step.clone().multiplyScalar(i - (SOURCES.length - 1) / 2))));
    srcLines.forEach(l => { world.remove(l); l.geometry.dispose(); }); srcLines = [];
    world.updateMatrixWorld(true);
    srcTiles.forEach(({ s, t }) => s.agents.forEach(id => {
      const d = desks[id]; if (!d) return;
      const p = new THREE.Vector3(); d.g.getWorldPosition(p); world.worldToLocal(p); p.y += 0.05;
      const q = t.position.clone(); q.y += 0.2;
      const mid = q.clone().lerp(p, 0.5); mid.y = Math.min(p.y, q.y) - 0.5;
      const pts = new THREE.QuadraticBezierCurve3(q, mid, p).getPoints(24);
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat); world.add(l); srcLines.push(l);
    }));
  }

  /* camera: orthographic, isometric */
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  let yaw = Math.PI / 4, pitch = 0.62, zoom = 1, userYaw = 0, userZoom = 1;
  // fit: measure the whole office in camera space at the resting angle, then size the view to it
  let fitHalf = 20; const target = new THREE.Vector3(0, -1, 0);
  function frameCam(refit) {
    const w = host.clientWidth, h = host.clientHeight, a = w / h; renderer.setSize(w, h, false);
    if (refit !== false) {
      const keep = userYaw; userYaw = 0; target.set(0, 0, 0); placeCam(); cam.updateMatrixWorld();
      // tight fit: real corners of each floor (with desk height) and each tile, in view space
      const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const add = (o, lx, ly, lz) => { v.set(lx, ly, lz); o.localToWorld(v); v.applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); };
      world.updateMatrixWorld(true);
      floors.forEach(f => { for (let i = 0; i < 8; i++) add(f.fl, (i & 1 ? 1 : -1) * f.W / 2, i & 2 ? 4.2 : -0.6, (i & 4 ? 1 : -1) * f.D / 2); });
      srcTiles.forEach(({ t }) => { for (let i = 0; i < 4; i++) add(t, (i & 1 ? 1 : -1) * 1.3, 0.2, (i & 2 ? 1 : -1) * 1.3); });
      // centre of the box in view space → world target
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0); const r = new THREE.Vector3(), u = new THREE.Vector3();
      cam.matrixWorld.extractBasis(r, u, new THREE.Vector3());
      target.copy(r.multiplyScalar(c.x)).add(u.multiplyScalar(c.y));
      fitHalf = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / a) * 1.04;   // corners of the slabs can bleed slightly
      userYaw = keep;
    }
    const half = fitHalf / userZoom;
    cam.left = -half * a; cam.right = half * a; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
  }
  function placeCam() {
    const y = yaw + userYaw, R = 90;
    cam.position.set(target.x + Math.sin(y) * Math.cos(pitch) * R, target.y + Math.sin(pitch) * R, target.z + Math.cos(y) * Math.cos(pitch) * R);
    cam.lookAt(target);
  }

  /* speech bubbles + tooltip (HTML overlays) */
  const tip = document.createElement("div"); tip.className = "hq-tip"; tip.hidden = true; host.appendChild(tip);
  const bubbles = [0, 1].map(() => { const e = document.createElement("div"); e.className = "hq-bub"; e.hidden = true; host.appendChild(e); return { e, id: null, until: 0 }; });
  function events() {
    const ev = [];
    B.agents.forEach(a => {
      const p = pendingOf(a.id);
      if (p.length) ev.push({ id: a.id, text: `${short(p[0].title, 46)}: needs you` });
      else if (a.autonomy === "auto" && a.live[0]) ev.push({ id: a.id, text: `${a.live[0].label}: ${a.live[0].value}` });
      else if (a.status === "attention") ev.push({ id: a.id, text: "I have a suggestion ready" });
    });
    return ev;
  }
  const short = (t, n) => { t = String(t).split(/[:(—]/)[0].trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  let evI = 0;
  function nextBubble(b, t) {
    const ev = events(); if (!ev.length) return;
    let k = 0; do { evI = (evI + 1) % ev.length; k++; } while (bubbles.some(x => x !== b && x.id && !x.e.hidden && AG[x.id].business === AG[ev[evI].id].business) && k < ev.length);
    const e = ev[evI]; b.id = e.id; b.until = t + 5.5;
    b.e.innerHTML = `<b>${AG[e.id].name.replace(/ agent$/, "")}</b> ${e.text.replace(/[<>&]/g, "")}`; b.e.hidden = false;
    b.e.classList.remove("in"); void b.e.offsetWidth; b.e.classList.add("in");
  }
  const v3 = new THREE.Vector3();
  function project(id, yOff) {
    const d = desks[id]; v3.set(0, yOff, 1.15); d.g.localToWorld(v3); v3.project(cam);
    return [(v3.x * 0.5 + 0.5) * host.clientWidth, (-v3.y * 0.5 + 0.5) * host.clientHeight];
  }

  /* hand-offs: paper flying between desks */
  const pairs = []; B.agents.forEach(a => a.hands_off_to.forEach(t => { if (desks[t]) pairs.push([a.id, t]); }));
  const flights = [];
  function launch(t) {
    if (!pairs.length) return;
    const [f, to] = pairs[Math.floor(Math.random() * pairs.length)];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON.paper, transparent: true, depthTest: false, toneMapped: false }));
    s.scale.set(0.8, 0.8, 1); s.renderOrder = 6; world.add(s);
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    desks[f].g.localToWorld(p0.set(0, 2.2, 0.4)); desks[to].g.localToWorld(p1.set(0, 2.2, 0.4)); world.worldToLocal(p0); world.worldToLocal(p1);
    const mid = p0.clone().lerp(p1, 0.5); mid.y += 4 + p0.distanceTo(p1) * 0.15;
    flights.push({ s, curve: new THREE.QuadraticBezierCurve3(p0, mid, p1), t0: t, dur: 1.4 + p0.distanceTo(p1) * 0.03 });
  }

  /* status refresh (screens + icons) */
  function refreshStatus() {
    Object.values(desks).forEach(d => {
      const n = pendingOf(d.a.id).length;
      if (n !== d.pend) { d.pend = n; d.scr.material.map.dispose(); d.scr.material.map = screenTex(d.a, n); d.scr.material.needsUpdate = true; }
      d.mode = n ? "warn" : d.a.status === "attention" ? "idea" : d.a.autonomy === "auto" ? "work" : "done";
      d.icon.visible = d.mode !== "work";
      if (d.icon.visible) d.icon.material.map = ICON[d.mode];
      d.icon.material.needsUpdate = true;
    });
  }
  refreshStatus();
  addEventListener("shelly:approvals", refreshStatus);

  /* input: drag to turn, wheel / pinch to zoom, tap to open */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let drag = null, lastInput = -1e9, moved = 0;
  const pts = new Map();
  const el = renderer.domElement; el.style.touchAction = "pan-y";
  function hitAt(e) {
    const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam); const h = ray.intersectObjects(pick, false)[0]; return h && h.object.userData.agent;
  }
  el.addEventListener("pointerdown", e => { pts.set(e.pointerId, e); drag = { x: e.clientX, yaw: userYaw }; moved = 0; lastInput = performance.now(); });
  el.addEventListener("pointermove", e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, e);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (drag.pinch) userZoom = Math.max(0.8, Math.min(2.6, drag.z * d / drag.pinch)); else { drag.pinch = d; drag.z = userZoom; } frameCam(false); moved = 99; return; }
    if (drag && e.buttons) { const dx = e.clientX - drag.x; moved = Math.max(moved, Math.abs(dx)); if (e.pointerType === "mouse" || Math.abs(dx) > 8) userYaw = drag.yaw - dx * 0.006; lastInput = performance.now(); return; }
    const id = hitAt(e); el.style.cursor = id ? "pointer" : "grab";
    if (id) { const a = AG[id], n = pendingOf(id).length, r = host.getBoundingClientRect();
      tip.innerHTML = `<b>${a.name}</b><span>${BIZ[a.business].name} · ${(B.departments.find(x => x.id === a.department) || {}).name || ""}</span><span>${n ? `⚠ ${n} waiting for you` : a.autonomy === "auto" ? "runs on its own" : a.autonomy === "suggest" ? "suggests, you decide" : "needs your approval"}</span>`;
      tip.style.left = Math.min(e.clientX - r.left + 14, host.clientWidth - 230) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px"; tip.hidden = false; }
    else tip.hidden = true;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2 && drag) drag.pinch = 0;
    if (pts.size === 0) { if (moved < 6) { const id = hitAt(e); if (id && window.ShellyBrain) window.ShellyBrain.openAgent(id); } drag = null; } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", e => { pts.delete(e.pointerId); drag = null; });
  el.addEventListener("pointerleave", () => { tip.hidden = true; });
  el.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey && !e.altKey) return; e.preventDefault(); userZoom = Math.max(0.8, Math.min(2.6, userZoom * (e.deltaY < 0 ? 1.1 : 0.9))); frameCam(false); }, { passive: false });
  host.querySelectorAll("[data-hq]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.hq; if (k === "in") userZoom = Math.min(2.6, userZoom * 1.2); if (k === "out") userZoom = Math.max(0.8, userZoom / 1.2); if (k === "reset") { userZoom = 1; userYaw = 0; }
    frameCam(false); lastInput = performance.now();
  }));

  /* loop */
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(host);
  const resize = () => { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2)); renderer.shadowMap.enabled = !small(); layout(); frameCam(); };
  new ResizeObserver(resize).observe(host); resize();
  let nextLaunch = 1, bubbleT = [1.2, 3.8];
  function frame(ms) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || host.offsetParent === null) return;
    const t = ms / 1000;
    if (!still && performance.now() - lastInput > 4000) userYaw += (Math.sin(t * 0.12) * 0.32 - userYaw) * 0.01;
    placeCam();
    Object.values(desks).forEach(d => {
      const work = d.mode === "work" && !still;
      d.arms.forEach((a, i) => { a.rotation.x = Math.PI / 2.4 + (work ? Math.sin(t * 14 + d.phase + i * 1.7) * 0.12 : 0); });
      d.head.position.y = 2.5 + (still ? 0 : Math.sin(t * 1.3 + d.phase) * 0.03);
      d.glowRing.material.opacity = d.mode === "work" ? 0.35 + (still ? 0 : 0.25 * Math.sin(t * 3 + d.phase)) : 0;
      if (d.icon.visible) { d.icon.position.y = 3.5 + (still ? 0 : Math.sin(t * 2.2 + d.phase) * 0.12); const k = d.mode === "warn" && !still ? 0.9 + 0.12 * Math.sin(t * 5 + d.phase) : 0.9; d.icon.scale.set(k, k, 1); }
    });
    if (!still && t > nextLaunch) { launch(t); nextLaunch = t + 1.6 + Math.random() * 1.4; }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], u = (t - f.t0) / f.dur;
      if (u >= 1) { world.remove(f.s); f.s.material.dispose(); flights.splice(i, 1); continue; }
      f.s.position.copy(f.curve.getPoint(u)); f.s.material.rotation = Math.sin(u * 6) * 0.3;
    }
    bubbles.forEach((b, i) => {
      if (t > bubbleT[i]) { nextBubble(b, t); bubbleT[i] = t + 5.6; }
      if (b.id && !b.e.hidden) { const [x, y] = project(b.id, 3.3); b.e.style.left = x + "px"; b.e.style.top = y + "px"; if (t > b.until) b.e.hidden = true; }
    });
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  document.dispatchEvent(new CustomEvent("shelly:hq-ready"));
}

if (!host || !B || !glOK()) { document.dispatchEvent(new CustomEvent("shelly:hq-unavailable")); }
else build();
