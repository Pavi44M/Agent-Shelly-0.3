/* Gateway Warehousing & Transport · the live 3D site (module v1.2)
   One site at a time: the warehouse (racks, cold rooms, staging lanes, office, charging bay), dock doors,
   the yard with light towers, the gatehouse and a busy road. Trucks arrive, check in at the gate, reverse
   onto a free dock, get unloaded or loaded by forklifts and leave. The crew comes from the roster: day,
   afternoon and night shifts clock in and out, take staggered breaks, and only licensed operators drive
   forklifts. Day turns to night with the clock. Synthetic data from docs/data/gateway.js.
   Units: metres; the building front (docks) is at z = 0. */
import * as THREE from "../kit/vendor/three.module.min.js";
import { makePerson, pose, bubbleSprite, tagSprite } from "../store/v3/people.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch = matchMedia("(pointer: coarse)").matches;
const TAU = Math.PI * 2;
const ang = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hm = s => { const [h, m] = String(s).split(":").map(Number); return h * 3600 + (m || 0) * 60; };
export const fmtClock = t => { t = ((t % 86400) + 86400) % 86400; return String(Math.floor(t / 3600)).padStart(2, "0") + ":" + String(Math.floor(t % 3600 / 60)).padStart(2, "0"); };
export function shiftAt(G, t) {   // the shift that owns this time of day (the later one during a handover)
  const d = ((t % 86400) + 86400) % 86400; let cur = null;
  for (const s of G.shifts) { const a = hm(s.start), b = a + s.hours * 3600; if ((d >= a && d < b) || (b > 86400 && d < b - 86400)) cur = s; }
  return cur || G.shifts[0];
}
export function onShift(p, t, early = 900) {   // is this roster person at work at time t (seconds of day)?
  const d = ((t % 86400) + 86400) % 86400, a = hm(p.start) - early, b = hm(p.start) + p.hours * 3600;
  return (d >= a && d < b) || (d + 86400 >= a && d + 86400 < b) || (a < 0 && d >= a + 86400);
}
export function onBreak(p, t) { const d = ((t % 86400) + 86400) % 86400; return (p.breaks || []).find(b => { const a = hm(b.at); return (d >= a && d < a + b.minutes * 60) || (d + 86400 >= a && d + 86400 < a + b.minutes * 60); }); }

export function createWorld(canvas, G, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const shadows = !touch; renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const DAY = new THREE.Color("#e6edf5"), NIGHT = new THREE.Color("#0a1322"), DUSK = new THREE.Color("#f2c9a0");
  const scene = new THREE.Scene(); scene.background = DAY.clone(); scene.fog = new THREE.Fog(DAY.clone(), 200, 460);
  const camera = new THREE.PerspectiveCamera(40, 1, .5, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d3dd, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(-60, 110, 70); scene.add(sun);
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -110; c.right = 110; c.top = 90; c.bottom = -90; c.near = 10; c.far = 340; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; }
  scene.add(sun.target);

  const MC = {}; const mat = (hex, o) => { const k = hex + JSON.stringify(o || {}); return MC[k] || (MC[k] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: .62, metalness: .05 }, o || {}))); };
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(.5, .5, 1, 16), EDGE = new THREE.EdgesGeometry(BOX);
  const INK = new THREE.LineBasicMaterial({ color: "#1b2a40", transparent: true, opacity: .45 });
  const box = (parent, w, h, d, x, y, z, m, cast = true, edge = false) => { const me = new THREE.Mesh(BOX, m); me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = cast && shadows; me.receiveShadow = shadows; parent.add(me);
    if (edge) { const e = new THREE.LineSegments(EDGE, INK); e.scale.copy(me.scale); e.position.copy(me.position); parent.add(e); } return me; };
  const BLUE = "#245fd0", WALL = "#f6f8fb";
  // night-time materials that glow
  const GLOW = { lamp: new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffe2a8", emissiveIntensity: 0 }), panel: new THREE.MeshStandardMaterial({ color: "#f3f6fa", emissive: "#ffffff", emissiveIntensity: 0 }),
    window: new THREE.MeshStandardMaterial({ color: "#9fd3ea", emissive: "#ffd99a", emissiveIntensity: 0, transparent: true, opacity: .6 }), head: new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#fff2c0", emissiveIntensity: .4 }),
    tail: new THREE.MeshStandardMaterial({ color: "#d22", emissive: "#ff2222", emissiveIntensity: .3 }) };

  /* ------------------------------------------------ state */
  let W = null;
  const S = { t: 0, speed: 60, playing: true, log: [], sel: null, follow: false, roleFilter: null, real: 0, shift: null, dayK: 1 };
  function log(txt, tone = "info") { S.log.unshift({ t: S.t, txt, tone }); S.log.length = Math.min(S.log.length, 60); hooks.onLog && hooks.onLog(); }

  function textTex(draw, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function label(text, sub, col = BLUE) {
    const t = textTex((x, w, h) => { x.fillStyle = "rgba(255,255,255,.95)"; x.beginPath(); x.roundRect(3, 3, w - 6, h - 6, 16); x.fill(); x.strokeStyle = col; x.lineWidth = 6; x.stroke();
      x.fillStyle = "#0e1d33"; x.font = "800 36px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText(text, 20, sub ? 31 : h / 2);
      if (sub) { x.fillStyle = "#4b5d75"; x.font = "600 23px 'JetBrains Mono',monospace"; x.fillText(sub, 20, 68); } }, 340, sub ? 96 : 66);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(5.4, sub ? 1.52 : 1.05, 1); sp.renderOrder = 8; return sp;
  }
  function liveLabel(col) {   // a label whose text changes (cold-room temperatures)
    const c = document.createElement("canvas"); c.width = 380; c.height = 100; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(6, 1.58, 1); sp.renderOrder = 9;
    sp.set = (a, b, warn) => { const x = c.getContext("2d"); x.clearRect(0, 0, 380, 100); x.fillStyle = warn ? "rgba(255,236,236,.97)" : "rgba(235,246,255,.97)"; x.beginPath(); x.roundRect(3, 3, 374, 94, 16); x.fill();
      x.strokeStyle = warn ? "#e05050" : col; x.lineWidth = 6; x.stroke(); x.fillStyle = "#0e1d33"; x.font = "800 34px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText(a, 20, 32);
      x.fillStyle = warn ? "#b53030" : "#1d5fb0"; x.font = "700 28px 'JetBrains Mono',monospace"; x.fillText(b, 20, 70); t.needsUpdate = true; };
    return sp;
  }
  function makePallet(col) { const g = new THREE.Group(); box(g, 1.1, .14, 1.1, 0, .07, 0, mat("#b88a52")); box(g, 1.0, .95, 1.0, 0, .62, 0, mat(col)); box(g, 1.02, .05, 1.02, 0, 1.1, 0, mat("#e9eef3", { transparent: true, opacity: .6 }), false); return g; }
  const cargoCols = () => ["#c9a26b", "#c9a26b", "#d8b88a", "#bfa07a", "#ffffff", ...G.clients.filter(c => c.site === W.site.id).map(c => c.colour)];
  function dockX(i) { const usable = W.w - 22; return -usable / 2 + 6 + (usable / Math.max(1, W.ND - 1)) * i; }

  /* ------------------------------------------------ build one site */
  function build(site) {
    if (W) { scene.remove(W.root); W.lights.forEach(l => scene.remove(l)); W.root.traverse(o => { if (o.geometry && o.geometry !== BOX && o.geometry !== CYL && o.geometry !== EDGE) o.geometry.dispose(); }); }
    const root = new THREE.Group(); scene.add(root);
    const B = site.building, w = B.w, d = B.d, H = B.h, ND = site.docks;
    const yardD = 36, roadZ = yardD + 8, gateX = w / 2 + 10;
    W = { site, root, w, d, H, ND, yardD, roadZ, gateX, docks: [], trucks: [], lifts: [], people: [], pick: [], slots: [], aisles: [], rooms: [], lights: [], traffic: [], spawnT: 0,
      stats: { in: 0, out: 0, putaway: 0, picked: 0 }, roster: (G.rosters && G.rosters[site.id] ? G.rosters[site.id].people : []), present: {} };
    const m4 = new THREE.Matrix4();

    // ground, concrete apron, road, access lane, markings
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat("#d5e2c9")); ground.rotation.x = -Math.PI / 2; ground.position.y = -.02; ground.receiveShadow = shadows; root.add(ground);
    box(root, w + 34, .04, d + yardD + 10, 4, 0, (yardD - d) / 2 + 2, mat("#eceff3"), false);
    box(root, 900, .05, 12, 0, .01, roadZ + 2, mat("#4f5864"), false);
    for (let x = -440; x < 440; x += 9) box(root, 4.5, .06, .25, x, .03, roadZ + 2, mat("#ffffff"), false);
    box(root, 900, .06, .22, 0, .03, roadZ - 3.6, mat("#f4f4f4"), false); box(root, 900, .06, .22, 0, .03, roadZ + 7.6, mat("#f4f4f4"), false);
    box(root, 900, .02, 3, 0, .005, roadZ + 9.8, mat("#c9ced4"), false);   // footpath
    box(root, 9, .05, 10, gateX, .015, yardD + 2, mat("#5f6873"), false);
    for (let i = 0; i < ND; i++) { const x = dockX(i); box(root, .24, .05, 16, x - 1.9, .03, 8.5, mat("#ffcc1f"), false); box(root, .24, .05, 16, x + 1.9, .03, 8.5, mat("#ffcc1f"), false);
      const num = textTex((c, cw, ch) => { c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, cw, ch); c.fillStyle = "#ffffff"; c.font = "900 150px 'Plus Jakarta Sans',system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(i + 1).padStart(2, "0"), cw / 2, ch / 2); }, 256, 192);
      const np = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), new THREE.MeshBasicMaterial({ map: num, transparent: true, depthWrite: false })); np.rotation.x = -Math.PI / 2; np.position.set(x, .05, 14.5); root.add(np); }
    box(root, w + 20, .05, .2, 2, .03, 18, mat("#ffffff"), false);
    for (let x = -w / 2 - 6; x < w / 2 + 14; x += 4) box(root, 2, .05, .3, x, .03, 30, mat("#ffffff"), false);
    box(root, 2.4, .05, yardD - 1, -w / 2 - 4, .03, yardD / 2, mat("#2fae6f"), false);   // pedestrian walkway
    for (let z = 2; z < yardD - 2; z += 1.6) box(root, 2.2, .055, .5, -w / 2 - 4, .04, z, mat("#ffffff"), false);

    // fence, trees
    const fz = yardD + 2.5, posts = [];
    for (let x = -w / 2 - 14; x <= w / 2 + 22; x += 3) if (Math.abs(x - gateX) > 6) posts.push([x, fz]);
    for (let z = -d - 6; z <= fz; z += 3) { posts.push([-w / 2 - 14, z]); posts.push([w / 2 + 22, z]); }
    const pIM = new THREE.InstancedMesh(BOX, mat("#8995a3"), posts.length);
    posts.forEach(([x, z], i) => pIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, .9, z), new THREE.Quaternion(), new THREE.Vector3(.12, 1.8, .12)))); root.add(pIM);
    box(root, gateX - 6 - (-w / 2 - 14), .08, .06, (-w / 2 - 14 + gateX - 6) / 2, 1.6, fz, mat("#8995a3"), false);
    box(root, w / 2 + 22 - (gateX + 6), .08, .06, (w / 2 + 22 + gateX + 6) / 2, 1.6, fz, mat("#8995a3"), false);
    const trees = []; for (let x = -w / 2 - 12; x < w / 2 + 22; x += rnd(6, 10)) if (Math.abs(x - gateX) > 8) trees.push([x, fz + 1.6]);
    for (let z = -d; z < fz; z += rnd(7, 11)) { trees.push([-w / 2 - 16, z]); trees.push([w / 2 + 24, z]); }
    for (let i = 0; i < 16; i++) trees.push([rnd(-140, 140), roadZ + rnd(13, 44)]);
    const tT = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .26, 2, 6), mat("#7a5a3a"), trees.length);
    const tC = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1), mat("#5fb85d"), trees.length);
    trees.forEach(([x, z], i) => { const s = rnd(.8, 1.3); tT.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 1, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      tC.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 2.4 * s + 1, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.25, s))); tC.setColorAt(i, new THREE.Color().setHSL(.3 + rnd(-.03, .03), .5, rnd(.42, .55))); });
    tT.castShadow = tC.castShadow = shadows; root.add(tT, tC);

    // staff car park: cars follow how many people are on site
    box(root, 18, .05, 24, -w / 2 - 6, .02, -d / 2 + 2, mat("#4f5864"), false);
    for (let i = 0; i < 8; i++) box(root, .12, .05, 4.6, -w / 2 - 13.5 + (i % 2) * 15, .04, -d + 4 + Math.floor(i / 2) * 6.2, mat("#ffffff"), false);
    W.cars = [];
    for (let i = 0; i < 12; i++) { const c = new THREE.Group(); const col = pick(["#d94a3d", "#3d7dd9", "#f4f6f8", "#2b2f36", "#9aa3ae", "#2a9d8f", "#e0a32e"]);
      box(c, 1.8, .7, 4.2, 0, .55, 0, mat(col, { metalness: .4, roughness: .35 }), true, true); box(c, 1.6, .55, 2.2, 0, 1.15, -.2, mat("#1d2a38", { metalness: .5, roughness: .2 }));
      c.position.set(-w / 2 - 12 + (i % 3) * 5.6, 0, -d + 6 + Math.floor(i / 3) * 6); c.rotation.y = Math.PI / 2; c.visible = false; root.add(c); W.cars.push(c); }

    // gatehouse with a boom barrier
    const gh = new THREE.Group(); gh.position.set(gateX + 6.5, 0, yardD + 1); root.add(gh);
    box(gh, 3.2, 2.8, 3.2, 0, 1.4, 0, mat(WALL), true, true); box(gh, 3.6, .3, 3.6, 0, 2.95, 0, mat(BLUE), true, true);
    const ghw = new THREE.Mesh(BOX, GLOW.window); ghw.scale.set(2.6, 1.1, .05); ghw.position.set(0, 1.7, 1.62); gh.add(ghw);
    const boomP = new THREE.Group(); boomP.position.set(gateX + 4.4, 1.1, yardD + 1); root.add(boomP);
    box(boomP, .3, 1.1, .3, 0, -.55, 0, mat("#e8692f")); W.boom = new THREE.Group(); boomP.add(W.boom);
    for (let i = 0; i < 12; i++) box(W.boom, .7, .12, .12, -.35 - i * .7, 0, 0, mat(i % 2 ? "#e8692f" : "#ffffff"), false);
    W.boomUp = 0;
    const gl = label("Gatehouse", "check-in · seals"); gl.position.set(gateX + 6.5, 5.2, yardD + 1); root.add(gl);

    // yard light towers (glow and light the yard at night)
    const towers = [[-w / 2 - 8, 22], [-w / 6, 33], [w / 6, 33], [w / 2 + 12, 22]];
    towers.forEach(([x, z]) => { box(root, .25, 9, .25, x, 4.5, z, mat("#8995a3")); box(root, 1.6, .3, .7, x, 9.1, z, mat("#2b2f36"));
      const lamp = new THREE.Mesh(BOX, GLOW.lamp); lamp.scale.set(1.4, .12, .5); lamp.position.set(x, 8.92, z); root.add(lamp);
      const pl = new THREE.PointLight("#ffd9a0", 0, 48, 1.6); pl.position.set(x, 8.6, z); scene.add(pl); W.lights.push(pl); });
    const inside = new THREE.PointLight("#fff1d6", 0, w * 1.2, 1.2); inside.position.set(0, H - 1.5, -d / 2); scene.add(inside); W.lights.push(inside);

    // the building: ribbed walls, bold blue fascia, dock doors, roof that lifts as you zoom in
    const bw = new THREE.Group(); root.add(bw);
    const front = [], doorW = 3.2, doorH = 4.0; let cx = -w / 2;
    for (let i = 0; i < ND; i++) { const x = dockX(i); front.push([cx, x - doorW / 2]); cx = x + doorW / 2; } front.push([cx, w / 2]);
    front.forEach(([a, b]) => { if (b - a > .05) box(bw, b - a, H, .3, (a + b) / 2, H / 2, 0, mat(WALL)); });
    for (let i = 0; i < ND; i++) box(bw, doorW, H - doorH, .3, dockX(i), doorH + (H - doorH) / 2, 0, mat(WALL));
    box(bw, .3, H, d, -w / 2, H / 2, -d / 2, mat(WALL)); box(bw, .3, H, d, w / 2, H / 2, -d / 2, mat(WALL)); box(bw, w, H, .3, 0, H / 2, -d, mat(WALL));
    const ribs = []; for (let x = -w / 2 + 2; x < w / 2; x += 2.5) { ribs.push([x, -d - .2, 0]); } for (let z = -d + 2; z < 0; z += 2.5) { ribs.push([-w / 2 - .2, z, 1]); ribs.push([w / 2 + .2, z, 1]); }
    const rIM = new THREE.InstancedMesh(BOX, mat("#dfe5ee"), ribs.length);
    ribs.forEach(([x, z, s], i) => rIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, H / 2, z), new THREE.Quaternion(), new THREE.Vector3(s ? .12 : .4, H - .8, s ? .4 : .12)))); root.add(rIM);
    box(bw, w + .5, .9, .55, 0, H - .2, .05, mat(BLUE), true, true); box(bw, .55, .9, d + .5, -w / 2 - .05, H - .2, -d / 2, mat(BLUE), true, true); box(bw, .55, .9, d + .5, w / 2 + .05, H - .2, -d / 2, mat(BLUE), true, true);
    box(bw, w + .5, .9, .55, 0, H - .2, -d - .05, mat(BLUE), true, true);
    box(bw, w + .4, .5, .45, 0, .25, .12, mat("#1b3f8a"), true, true);
    const ol0 = new THREE.LineSegments(EDGE, INK); ol0.scale.set(w, H, d); ol0.position.set(0, H / 2, -d / 2); root.add(ol0);
    const nt = textTex((x, cw, ch) => { x.fillStyle = BLUE; x.fillRect(0, 0, cw, ch); x.fillStyle = "#fff"; x.font = "900 76px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText("GATEWAY", 30, ch / 2); x.font = "700 42px 'Plus Jakarta Sans',system-ui"; x.fillText("· " + site.name.replace("Gateway ", ""), 390, ch / 2); }, 1024, 120);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.75), new THREE.MeshBasicMaterial({ map: nt })); nm.position.set(-w / 2 + 9.5, H - .2, .34); bw.add(nm);
    const roofM = new THREE.MeshStandardMaterial({ color: "#f7f9fb", roughness: .8, transparent: true, opacity: 1 });
    W.roof = new THREE.Group(); bw.add(W.roof);
    const rf = new THREE.Mesh(BOX, roofM); rf.scale.set(w, .3, d); rf.position.set(0, H + .15, -d / 2); rf.castShadow = shadows; W.roof.add(rf);
    for (let i = 0; i < Math.floor(w / 9); i++) for (let j = 0; j < 2; j++) { const u = new THREE.Mesh(BOX, roofM); u.scale.set(2.4, 1, 1.8); u.position.set(-w / 2 + 5 + i * 9, H + .8, -d * (.3 + j * .4)); W.roof.add(u);
      const f = new THREE.Mesh(CYL, roofM); f.scale.set(1.2, .2, 1.2); f.position.set(u.position.x, H + 1.35, u.position.z); W.roof.add(f); }
    for (let i = 0; i < Math.floor(w / 6); i++) { const sk = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: "#bcd6ea", roughness: .3, transparent: true })); sk.scale.set(1.6, .12, d * .7); sk.position.set(-w / 2 + 3 + i * 6, H + .32, -d / 2); W.roof.add(sk); W.skyM = sk.material; }
    W.roofM = roofM;

    // inside: floor, lane markings, light panels, office, charging bay, staging lanes
    box(root, w - .4, .04, d - .4, 0, .03, -d / 2, mat("#d2d8df"), false);
    box(root, w - 1, .05, .16, 0, .06, -10.1, mat("#ffcc1f"), false); box(root, w - 1, .05, .16, 0, .06, -6.9, mat("#ffcc1f"), false);
    for (let x = -w / 2 + 4; x < w / 2 - 2; x += 8) for (let z = -6; z > -d + 2; z -= 7) { const p = new THREE.Mesh(BOX, GLOW.panel); p.scale.set(2.4, .08, .5); p.position.set(x, H - .45, z); root.add(p); }
    W.staging = [];
    for (let i = 0; i < ND; i++) { const x = dockX(i);
      box(root, 2.8, .05, .12, x, .06, -1.2, mat("#ffffff"), false); box(root, 2.8, .05, .12, x, .06, -6.2, mat("#ffffff"), false);
      const hz = textTex((c, cw, ch) => { for (let k = -2; k < 12; k++) { c.fillStyle = k % 2 ? "#1d2228" : "#ffcc1f"; c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 + 32, 0); c.lineTo(k * 32 + 16, ch); c.lineTo(k * 32 - 16, ch); c.fill(); } }, 256, 32);
      const hzm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .4), new THREE.MeshBasicMaterial({ map: hz })); hzm.rotation.x = -Math.PI / 2; hzm.position.set(x, .07, -.35); root.add(hzm);
      const lane = { x, pallets: [] }; W.staging.push(lane);
      for (let k = 0; k < 4; k++) { const p = makePallet(pick(cargoCols())); p.position.set(x + (k % 2 ? .7 : -.7), 0, -2.4 - Math.floor(k / 2) * 1.6); p.visible = Math.random() < .5; root.add(p); lane.pallets.push(p); } }
    const off = new THREE.Group(); off.position.set(-w / 2 + 5, 0, -5); root.add(off);
    box(off, 9, 3, 7, 0, 1.5, 0, mat("#e3ecf6"), true, true); box(off, 9.1, .25, 7.1, 0, 3.05, 0, mat(BLUE), true, true);
    const ow = new THREE.Mesh(BOX, GLOW.window); ow.scale.set(6, 1.4, .06); ow.position.set(0, 1.8, 3.52); off.add(ow);
    for (let i = 0; i < 3; i++) { box(off, 1.4, .75, .7, -2.6 + i * 2.4, .38, -1.5, mat("#cfd6de")); box(off, .6, .4, .05, -2.6 + i * 2.4, 1.0, -1.7, mat("#27466a")); }
    const ol = label("Office · staff room", "manager · planners · breaks"); ol.position.set(-w / 2 + 5, 4.7, -5); root.add(ol);
    W.office = { x: -w / 2 + 5, z: -5 }; W.staffDoor = { x: -w / 2 - 1.2, z: -8.5 };
    const chg = new THREE.Group(); chg.position.set(w / 2 - 4, 0, -4.5); root.add(chg);
    box(chg, 6, .05, 5, 0, .05, 0, mat("#2fae6f", { transparent: true, opacity: .35 }), false);
    for (let i = 0; i < 3; i++) box(chg, .5, 1.4, .4, -2 + i * 2, .7, -2.3, mat("#2b2f36"), true, true);
    const cl = label("Charging", "forklifts", "#2fae6f"); cl.position.set(w / 2 - 4, 3.4, -4.5); root.add(cl);
    W.charge = { x: w / 2 - 4, z: -4 };

    // racks: double rows along z, aisles between them; pallet loads instanced, filled to the site's fill %
    const R = site.rack_rows, rowLen = d - 13, z0 = -11, levels = H >= 10 ? 5 : 4, bay = 2.8, nb = Math.floor(rowLen / bay);
    const span = w - 18, gap = span / R, rowX = r => -span / 2 + gap * (r + .5) + 3;
    // cold rooms: an insulated box around their rack rows (and the aisles inside), strip-curtain openings on the main lane
    const roomOfRow = {};
    (site.cold_rooms || []).forEach((c, k) => { const xs = c.rows.filter(r => r < R).map(rowX); if (!xs.length) return;
      const prevCold = c.rows.some(r => roomOfRow[r - 1] !== undefined);
      const x0 = Math.min(...xs) - (prevCold ? 1.05 : gap - 1.1), x1 = Math.max(...xs) + gap - 1.1;
      const room = { ...c, x0: Math.max(-w / 2 + .4, x0), x1: Math.min(w / 2 - .4, x1), z0: z0 + 1.6, z1: z0 - rowLen - 1.2, i: k, temp: c.temp ?? c.set, opens: 0 };
      c.rows.forEach(r => { roomOfRow[r] = k; }); W.rooms.push(room); });
    const upr = [], beams = [], loads = [];
    for (let r = 0; r < R; r++) {
      const rx = rowX(r);
      for (const side of [-.65, .65]) for (let b = 0; b <= nb; b++) upr.push([rx + side, z0 - b * bay]);
      for (let b = 0; b < nb; b++) for (let l = 0; l < levels; l++) {
        const y = .15 + l * 1.75, zc = z0 - b * bay - bay / 2;
        beams.push([rx - .65, y + 1.2, zc]); beams.push([rx + .65, y + 1.2, zc]);
        for (const side of [-.33, .33]) {
          let ax = side < 0 ? rx - gap / 2 + .2 : rx + gap / 2 - .2; ax = Math.max(-w / 2 + 2.5, Math.min(w / 2 - 2.5, ax));
          const roomA = W.rooms.findIndex(m => ax > m.x0 && ax < m.x1), roomR = roomOfRow[r] ?? -1;
          const slot = { x: rx + side, y: y + .05, z: zc, row: r, side, aisleX: ax, idx: loads.length, room: roomR, ok: roomA === roomR };
          slot.filled = slot.ok && Math.random() * 100 < site.fill_pct + 8; loads.push(slot);
        }
      }
    }
    const aisleSet = [...new Set(loads.filter(s => s.ok).map(s => +s.aisleX.toFixed(2)))]; W.aisles = aisleSet;
    const uIM = new THREE.InstancedMesh(BOX, mat(BLUE), upr.length);
    upr.forEach(([x, z], i) => uIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, levels * 1.75 / 2 + .4, z), new THREE.Quaternion(), new THREE.Vector3(.11, levels * 1.75 + .8, .11))));
    const bIM = new THREE.InstancedMesh(BOX, mat("#f07f1a"), beams.length);
    beams.forEach(([x, y, z], i) => bIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y - 1.2, z), new THREE.Quaternion(), new THREE.Vector3(.09, .14, bay - .1))));
    const CARGO = cargoCols();
    const lIM = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ roughness: .75 }), loads.length);
    loads.forEach((s, i) => { s.m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + .7, s.z), new THREE.Quaternion(), new THREE.Vector3(1.0, 1.25, 1.15));
      lIM.setMatrixAt(i, s.filled ? s.m : m4.makeScale(0, 0, 0)); lIM.setColorAt(i, new THREE.Color(s.room >= 0 ? pick(["#e9f3fb", "#cfe3f3", ...CARGO]) : pick(CARGO))); });
    uIM.castShadow = lIM.castShadow = shadows; lIM.receiveShadow = shadows; root.add(uIM, bIM, lIM);
    W.slots = loads.filter(s => s.ok); W.loadIM = lIM; W.rowLen = rowLen; W.z0 = z0;
    W.setSlot = (s, on) => { s.filled = on; lIM.setMatrixAt(s.idx, on ? s.m : m4.makeScale(0, 0, 0)); lIM.instanceMatrix.needsUpdate = true; };
    // the cold-room boxes
    const COLD = { chiller: { wall: "#e4f1fb", tint: "#7cc4f0", col: "#2f8fd6" }, freezer: { wall: "#dfe9ff", tint: "#8aa8ff", col: "#3d5bd9" } };
    W.rooms.forEach(m => {
      const cc = COLD[m.kind] || COLD.chiller, hgt = levels * 1.75 + 1.4, cw = m.x1 - m.x0, cz = (m.z0 + m.z1) / 2, cd = m.z0 - m.z1, wm = mat(cc.wall, { roughness: .4 });
      box(root, .25, hgt, cd, m.x0, hgt / 2, cz, wm, true, true); box(root, .25, hgt, cd, m.x1, hgt / 2, cz, wm, true, true); box(root, cw, hgt, .25, (m.x0 + m.x1) / 2, hgt / 2, m.z1, wm, true, true);
      const open = W.aisles.filter(a => a > m.x0 && a < m.x1).sort((a, b) => a - b); let px = m.x0;
      open.forEach(a => { if (a - 1.4 - px > .05) box(root, a - 1.4 - px, hgt, .25, (px + a - 1.4) / 2, hgt / 2, m.z0, wm, true, true); box(root, 2.8, hgt - 3.2, .25, a, 3.2 + (hgt - 3.2) / 2, m.z0, wm, true, true);
        for (let s = -1.2; s <= 1.21; s += .3) { const st = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: cc.tint, transparent: true, opacity: .35, roughness: .2 })); st.scale.set(.26, 3.1, .02); st.position.set(a + s, 1.6, m.z0 + .14); root.add(st); }
        px = a + 1.4; });
      if (m.x1 - px > .05) box(root, m.x1 - px, hgt, .25, (px + m.x1) / 2, hgt / 2, m.z0, wm, true, true);
      const top = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: cc.wall, transparent: true, opacity: .55, roughness: .3 })); top.scale.set(cw, .2, cd); top.position.set((m.x0 + m.x1) / 2, hgt, cz); root.add(top);
      const fl = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: cc.tint, emissive: cc.tint, emissiveIntensity: .25, transparent: true, opacity: .3 })); fl.scale.set(cw - .3, .02, cd - .3); fl.position.set((m.x0 + m.x1) / 2, .07, cz); root.add(fl);
      for (let k = 0; k < 2; k++) { const u = box(root, 1.6, .7, .9, m.x0 + 1.4 + k * (cw - 2.8), hgt + .45, cz, mat("#c9d2dc"), true, true); u.userData.unit = true; }
      m.sign = liveLabel(cc.col); m.sign.position.set((m.x0 + m.x1) / 2, hgt + 2.2, m.z0 + .5); root.add(m.sign);
      m.mist = []; open.forEach(a => { const ms = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })); ms.scale.set(2.6, 1.4, 1); ms.position.set(a, .9, m.z0 + .9); root.add(ms); m.mist.push(ms); });
      const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(cw, hgt, .8); hit.position.set((m.x0 + m.x1) / 2, hgt / 2, m.z0 + .4); hit.userData = { kind: "room", id: m.i }; root.add(hit); W.pick.push(hit);
      paintRoom(m);
    });

    // dock doors: roller doors, bumpers, dock lights and bold numbers
    for (let i = 0; i < ND; i++) {
      const x = dockX(i), g = new THREE.Group(); g.position.set(x, 0, 0); root.add(g);
      box(g, doorW + .6, .45, .55, 0, doorH + .12, .2, mat(BLUE), true, true); box(g, .3, doorH, .55, -doorW / 2 - .14, doorH / 2, .2, mat(BLUE), true, true); box(g, .3, doorH, .55, doorW / 2 + .14, doorH / 2, .2, mat(BLUE), true, true);
      const door = new THREE.Group(); door.position.set(0, doorH, .05); g.add(door);
      const panel = box(door, doorW, 1, .08, 0, -.5, 0, mat("#c3cbd6"), false);
      for (const sx of [-1.1, 1.1]) box(g, .35, .6, .3, sx, 1.1, .45, mat("#1d2228"));
      const lamp = box(g, .32, .32, .14, doorW / 2 + .6, 2.6, .35, new THREE.MeshBasicMaterial({ color: "#3fb87f" }), false);
      const lb = label("Bay " + (i + 1)); lb.position.set(0, doorH + 1.5, .9); lb.scale.multiplyScalar(.62); g.add(lb);
      const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(doorW + .6, doorH + 1, 1.6); hit.position.set(0, doorH / 2, .4); hit.userData = { kind: "dock", id: i }; g.add(hit); W.pick.push(hit);
      W.docks.push({ i, x, state: "free", truck: null, open: 0, panel, lamp, door });
    }

    // road traffic: cars, vans and other companies' trucks passing both ways
    for (let i = 0; i < 9; i++) { const c = new THREE.Group(), big = i % 3 === 0, col = pick(["#d94a3d", "#3d7dd9", "#f4f6f8", "#2b2f36", "#e0a32e", "#2a9d8f", "#7a5cc4"]);
      if (big) { box(c, 2.4, 3.2, 8, 0, 2.1, -1, mat(pick(["#f4f6f8", "#e8e2d4", "#d9e4ef"])), true, true); box(c, 2.4, 2.4, 2.2, 0, 1.6, 4, mat(col), true, true); }
      else { box(c, 1.8, .7, 4.2, 0, .55, 0, mat(col, { metalness: .4, roughness: .35 }), true, true); box(c, 1.6, .55, 2.2, 0, 1.15, -.2, mat("#1d2a38", { metalness: .5, roughness: .2 })); }
      const hl = new THREE.Mesh(BOX, GLOW.head); hl.scale.set(1.5, .15, .05); hl.position.set(0, .7, big ? 5.12 : 2.12); c.add(hl);
      const tl = new THREE.Mesh(BOX, GLOW.tail); tl.scale.set(1.5, .15, .05); tl.position.set(0, .7, big ? -5.02 : -2.12); c.add(tl);
      const dir = i % 2 ? 1 : -1; c.userData = { dir, v: rnd(9, 15), x: rnd(-260, 260), lane: dir > 0 ? roadZ + 3.6 : roadZ + .4 }; c.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; root.add(c); W.traffic.push(c); }

    // forklifts (crewed by licensed operators on the roster) and the crew
    G.forklifts.filter(f => f.site === site.id).forEach((f, k) => { const L = makeLift(f); L.home = { x: W.charge.x - 2 + (k % 3) * 2, z: W.charge.z + Math.floor(k / 3) * 2 }; L.x = L.home.x; L.z = L.home.z; L.h = Math.PI; addLift(L); });
    W.manager = person("Warehouse Manager", (G.management.find(m => m.id === "whm") || { name: "Sione" }).name.split(" ")[0], W.office.x, W.office.z, "manager");
    crewTick(true);
    for (let k = 0; k < Math.min(ND - 1, 5); k++) spawnTruck(true);
    W.spawnT = 6;
    paintRooms();
    return W;
  }

  /* ------------------------------------------------ cold rooms */
  function paintRoom(m) { const warn = m.temp > m.high || m.temp < m.low; m.sign.set(`❄ ${m.name}`, `${m.temp > 0 ? "+" : ""}${m.temp.toFixed(1)}°C · set ${m.set > 0 ? "+" : ""}${m.set}°C`, warn); }
  function paintRooms() { W.rooms.forEach(paintRoom); }
  function stepRooms(dt) {
    W.rooms.forEach(m => {
      const busy = W.lifts.some(L => L.path.length && L.slot && L.slot.room === m.i && Math.abs(L.z - m.z0) < 3);
      if (busy) m.opens = 1.5; m.opens = Math.max(0, m.opens - dt);
      const target = m.set + (m.opens > 0 ? (m.kind === "freezer" ? 1.6 : .9) : 0) + Math.sin(S.real * .2 + m.i) * .25;
      m.temp += (target - m.temp) * Math.min(1, dt * .25);
      m.mist.forEach(ms => { ms.material.opacity += ((m.opens > 0 ? .55 : 0) - ms.material.opacity) * Math.min(1, dt * 3); });
      if ((m.tick = (m.tick || 0) + dt) > 2) { m.tick = 0; paintRoom(m); }
    });
  }

  /* ------------------------------------------------ trucks */
  function makeTruck(T) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const semi = T.code === "CS", van = T.code === "PV";
    const boxL = semi ? 12.4 : van ? 3.4 : T.code === "EV" ? 6 : 7.2, cabL = van ? 2 : 2.5, H = van ? 2.5 : 3.7, Wd = van ? 2 : 2.5;
    const L = boxL + cabL + (semi ? .6 : .3);
    const side = textTex((x, cw, ch) => { x.fillStyle = T.colour; x.fillRect(0, 0, cw, ch); x.fillStyle = T.stripe; x.fillRect(0, ch * .72, cw, ch * .16); x.fillRect(0, ch * .9, cw, ch * .04);
      x.fillStyle = "#0e1d33"; x.font = `900 ${van ? 66 : 76}px 'Plus Jakarta Sans',system-ui`; x.textBaseline = "middle"; x.fillText("GATEWAY", 40, ch * .36);
      x.fillStyle = T.stripe; x.font = "700 36px 'Plus Jakarta Sans',system-ui"; x.fillText(T.reefer ? "❄ Cold chain · " + (T.temp ?? "") + "°C" : "Warehousing & Transport", 42, ch * .57); }, 1024, 256);
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: .5 });
    const bodyM = mat(T.colour, { roughness: .4 });
    const bx = new THREE.Mesh(BOX, [sideM, sideM, bodyM, bodyM, bodyM, mat("#dfe5eb")]); bx.scale.set(Wd, H - .9, boxL); bx.position.set(0, .9 + (H - .9) / 2, -L / 2 + boxL / 2); bx.castShadow = shadows; body.add(bx);
    const be = new THREE.LineSegments(EDGE, INK); be.scale.copy(bx.scale); be.position.copy(bx.position); body.add(be);
    box(body, Wd + .02, .2, boxL, 0, .95, -L / 2 + boxL / 2, mat(T.stripe));
    if (T.reefer && !van) box(body, 1.6, .9, .5, 0, H - .6, -L / 2 + boxL + .25, mat("#c9d2dc"), true, true);
    const cz = L / 2 - cabL / 2;
    box(body, Wd, van ? 1.8 : 2.4, cabL, 0, .9 + (van ? .9 : 1.2), cz, bodyM, true, true);
    box(body, Wd - .1, .9, .05, 0, van ? 2.2 : 2.6, L / 2 + .01, mat("#1d2a38", { metalness: .5, roughness: .15 }));
    for (const sx of [1, -1]) box(body, .05, .7, 1, sx * (Wd / 2 + .01), van ? 2.2 : 2.6, cz + .3, mat("#1d2a38", { metalness: .5, roughness: .15 }));
    box(body, Wd + .1, .3, .2, 0, .75, L / 2 + .05, mat("#2b2f36"));
    for (const sx of [-.8, .8]) { const hl = new THREE.Mesh(BOX, GLOW.head); hl.scale.set(.32, .2, .05); hl.position.set(sx, 1.1, L / 2 + .13); body.add(hl);
      const tl = new THREE.Mesh(BOX, GLOW.tail); tl.scale.set(.25, .2, .05); tl.position.set(sx, 1.05, -L / 2 - .03); body.add(tl); }
    const wz = [cz - .2, -L / 2 + 1.4, ...(semi || boxL > 6 ? [-L / 2 + 2.6] : [])], wheels = [];
    for (const z of wz) for (const sx of [-Wd / 2 + .1, Wd / 2 - .1]) { const wh = new THREE.Group(); wh.position.set(sx, .48, z); body.add(wh); const tyre = new THREE.Mesh(CYL, mat("#1d2228")); tyre.scale.set(.95, .35, .95); tyre.rotation.z = Math.PI / 2; wh.add(tyre);
      const hub = new THREE.Mesh(BOX, mat("#c9d2dc")); hub.scale.set(.37, .5, .14); wh.add(hub); wheels.push(wh); }
    const cargo = []; const nP = Math.min(T.pallets, van ? 2 : 8);
    for (let k = 0; k < nP; k++) { const p = makePallet(pick(cargoCols())); p.scale.setScalar(.85); p.position.set(k % 2 ? .55 : -.55, .95, -L / 2 + .8 + Math.floor(k / 2) * 1.05); p.visible = false; body.add(p); cargo.push(p); }
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(Wd + .4, H + .4, L + .4); hit.position.y = H / 2; g.add(hit);
    hit.userData = { kind: "truck", id: T.id }; W.pick.push(hit);
    const pin = label(T.id, null, T.stripe); pin.scale.multiplyScalar(.6); pin.position.y = H + 1.5; pin.visible = false; g.add(pin);
    W.root.add(g);
    return { T, g, body, L, H, cargo, pin, hit, wheels, x: 0, z: 0, h: 0, path: [], st: "", wait: 0, dock: null, dir: "in", moves: 0, need: 0, prog: 0, stage: 0, events: [], driver: null };
  }
  // smooth a forward run of waypoints into a dense curve, so trucks turn like trucks instead of pivoting
  function curve(from, pts, step = .9) {
    const P = [new THREE.Vector3(from.x, 0, from.z), ...pts.map(p => new THREE.Vector3(p.x, 0, p.z))];
    if (P.length < 3) return pts;
    const c = new THREE.CatmullRomCurve3(P, false, "centripetal", .5), n = Math.max(8, Math.ceil(c.getLength() / step)), out = [];
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    for (let i = 1; i <= n; i++) { const q = c.getPoint(i / n), along = cum[cum.length - 1] * i / n; let seg = cum.findIndex(v => v >= along); seg = Math.max(1, seg); out.push({ x: q.x, z: q.z, v: pts[seg - 1].v || 4 }); }
    return out;
  }
  function spawnTruck(warm) {
    const site = W.site, busy = id => W.trucks.some(k => k.T.id === id) || (W.recent || []).includes(id), cands = G.trucks.filter(t => t.site === site.id && !busy(t.id));
    const T = pick(cands.length ? cands : G.trucks.filter(t => !busy(t.id)));
    if (!T) return;
    const k = makeTruck(T), ship = G.shipments.find(s => s.truck === T.id);
    k.ship = ship; k.dir = Math.random() < .5 ? "in" : "out"; k.client = G.clients.find(c => c.id === T.client);
    k.need = Math.min(k.cargo.length, 4 + Math.floor(Math.random() * 4));
    k.cold = T.reefer && W.rooms.length ? (W.rooms.find(m => m.kind === (k.client && /−?frozen|freez/i.test(k.client.temp) && Math.random() < .4 ? "freezer" : "chiller")) || W.rooms[0]).i : -1;
    if (k.dir === "in") k.cargo.forEach((p, i) => p.visible = i < k.need); else k.cargo.forEach(p => p.visible = false);
    W.trucks.push(k);
    const free = W.docks.filter(d => d.state === "free");
    if (warm && free.length) {
      const dk = pick(free); dk.state = "occupied"; dk.truck = k; k.dock = dk; k.x = dk.x; k.z = k.L / 2 + .25; k.h = 0; k.st = "docked"; k.moves = Math.floor(Math.random() * k.need * .6);
      if (k.dir === "in") k.cargo.forEach((p, i) => p.visible = i >= k.moves && i < k.need); else k.cargo.forEach((p, i) => p.visible = i < k.moves);
      k.stage = 2; ev(k, "Docked at Bay " + (dk.i + 1)); spawnDriver(k); return;
    }
    const fromLeft = Math.random() < .6; k.x = fromLeft ? -230 : 230; k.z = W.roadZ + (fromLeft ? 3.6 : .4); k.h = fromLeft ? Math.PI / 2 : -Math.PI / 2; k.st = "road";
    k.path = [{ x: W.gateX - 14 * (fromLeft ? 1 : -1), z: k.z, v: 12 }, ...curve({ x: W.gateX - 14 * (fromLeft ? 1 : -1), z: k.z }, [{ x: W.gateX - 4 * (fromLeft ? 1 : -1), z: k.z, v: 6 }, { x: W.gateX - 1.8, z: W.roadZ - 4, v: 4 }, { x: W.gateX - 1.8, z: W.yardD + 4.5, v: 3 }])];
    k.then = () => { k.st = "gate"; k.wait = 7; ev(k, "At the gate · booking " + (k.ship ? k.ship.id : "") + " checked"); if (W.gateOfficer) say(W.gateOfficer, "Booking " + (k.ship ? k.ship.id : "") + " ✓", "done"); };
    k.stage = 0;
  }
  function ev(k, txt) { k.events.unshift({ t: S.t, txt }); log(`${k.T.id} · ${txt}`); }
  function goDock(k, dk) {
    dk.state = "reserved"; dk.truck = k; k.dock = dk; const x = dk.x;
    k.path = [...curve({ x: k.x, z: k.z }, [{ x: W.gateX - 2.5, z: 28, v: 5 }, { x: x + 10, z: 27.5, v: 5 }, { x: x + 4, z: 30.5, v: 3.4 }, { x: x + .4, z: 32, v: 2.6 }]),
      { x, z: 20, v: 2.4, rev: true }, { x, z: k.L / 2 + .25, v: 1.5, rev: true }];
    k.st = "toDock"; ev(k, `Heading to Bay ${dk.i + 1}`);
    k.then = () => { k.st = "docked"; dk.state = "occupied"; k.stage = 2; ev(k, `Docked at Bay ${dk.i + 1}${k.T.reefer ? " · seal checked, " + k.T.temp + "°C" : ""}`); spawnDriver(k); };
    if (W.marshal) marshalTo(dk);
  }
  function depart(k) {
    const dk = k.dock; k.st = "leaving"; k.stage = k.dir === "out" ? 3 : 4; ev(k, k.dir === "out" ? `Loaded ${k.need} pallets · in transit to ${k.ship ? k.ship.to : "client"}` : `Unloaded ${k.need} pallets · leaving empty`);
    if (k.dir === "out") W.stats.out++; else W.stats.in++;
    const right = Math.random() < .5;
    k.path = [...curve({ x: k.x, z: k.z }, [{ x: dk.x, z: 16, v: 3 }, { x: dk.x + 5, z: 26, v: 4 }, { x: W.gateX + 1.8, z: 30, v: 5 }, { x: W.gateX + 1.8, z: W.roadZ - 4, v: 4 }, { x: W.gateX + 1.8 + (right ? 6 : -6), z: W.roadZ + (right ? 3.6 : .4), v: 6 }]),
      { x: right ? 240 : -240, z: W.roadZ + (right ? 3.6 : .4), v: 12 }];
    k.then = () => { k.gone = true; W.recent = [k.T.id, ...(W.recent || [])].slice(0, 8); }; dk.state = "free"; dk.truck = null; k.dock = null;
  }
  function stepTruck(k, dt) {
    if (k.st === "gate") { k.wait -= dt; if (k.wait <= 0) { const dk = W.docks.find(d => d.state === "free"); if (dk) goDock(k, dk);
      else { k.st = "staged"; const n = W.trucks.filter(t => t.st === "staged" || t.st === "waiting").length; k.path = curve({ x: k.x, z: k.z }, [{ x: W.gateX - 1.8, z: 31, v: 4 }, { x: W.gateX + 5 + (n % 4) * 3.8, z: 22 - Math.floor(n / 4) * 1, v: 3 }]); k.then = () => { k.st = "waiting"; ev(k, "Waiting in the yard for a free dock"); }; } } }
    else if (k.st === "waiting") { const dk = W.docks.find(d => d.state === "free"); if (dk) goDock(k, dk); }
    else if (k.st === "docked") { k.prog = k.moves / Math.max(1, k.need); if (k.moves >= k.need) { k.st = "closing"; k.wait = 3; } }
    else if (k.st === "closing") { k.wait -= dt; if (k.wait <= 0 && (!k.driver || k.driver.inCab || k.driver.gone)) depart(k); }
    const x0 = k.x, z0 = k.z;
    if (k.path.length) moveAlong(k, dt, 1);
    const moved = Math.hypot(k.x - x0, k.z - z0) * (k.rev ? -1 : 1); k.wheels.forEach(w => { w.rotation.x += moved / .48; });
    k.g.position.set(k.x, 0, k.z); k.g.rotation.y = k.h;
    k.pin.visible = !!(S.sel && S.sel.kind === "truck" && S.sel.id === k.T.id);
  }
  function moveAlong(a, dt, turn) {
    let budget = (a.path[0].v || 3) * dt;
    while (budget > 0 && a.path.length) {
      const p = a.path[0], dx = p.x - a.x, dz = p.z - a.z, dist = Math.hypot(dx, dz);
      if (dist > .001) { const dir = Math.atan2(dx, dz), want = p.rev ? dir + Math.PI : dir; a.h += ang(a.h, want) * Math.min(1, dt * (p.rev ? 2.6 : 7) * turn); }
      a.rev = !!p.rev;
      if (dist <= budget) { a.x = p.x; a.z = p.z; budget -= dist; a.path.shift(); if (!a.path.length && a.then) { const f = a.then; a.then = null; f(); } }
      else { a.x += dx / dist * budget; a.z += dz / dist * budget; budget = 0; }
    }
  }

  /* ------------------------------------------------ forklifts */
  function makeLift(f) {
    const g = new THREE.Group(); const o = "#f5a623";
    box(g, 1.2, .9, 1.9, 0, .7, -.2, mat(o), true, true); box(g, 1.25, .6, .5, 0, .85, -1.05, mat("#2b2f36"), true, true);
    for (const [x, z] of [[-.55, .55], [.55, .55], [-.55, -.85], [.55, -.85]]) box(g, .07, 1.4, .07, x, 1.85, z, mat("#2b2f36"));
    box(g, 1.2, .07, 1.5, 0, 2.55, -.15, mat("#2b2f36"));
    box(g, .1, 2.6, .12, -.4, 1.3, .95, mat("#3a4048")); box(g, .1, 2.6, .12, .4, 1.3, .95, mat("#3a4048"));
    const car = new THREE.Group(); car.position.set(0, .12, 1.05); g.add(car);
    box(car, .9, .6, .08, 0, .3, 0, mat("#3a4048")); box(car, .12, .05, 1.1, -.3, 0, .55, mat("#5b636d")); box(car, .12, .05, 1.1, .3, 0, .55, mat("#5b636d"));
    for (const [x, z] of [[-.55, .7], [.55, .7], [-.55, -.8], [.55, -.8]]) { const wh = new THREE.Mesh(CYL, mat("#1d2228")); wh.scale.set(.5, .25, .5); wh.rotation.z = Math.PI / 2; wh.position.set(x, .25, z); g.add(wh); }
    const beacon = box(g, .16, .12, .16, 0, 2.66, -.6, new THREE.MeshBasicMaterial({ color: "#ffb020" }), false);
    const hl = new THREE.Mesh(BOX, GLOW.head); hl.scale.set(.18, .12, .05); hl.position.set(.5, 2.4, .65); g.add(hl);
    const drv = makePerson(THREE, { kind: "staff", role: "Forklift Operator", seed: Math.random() }); dress(drv, "Forklift Operator"); drv.g.position.set(0, .3, -.3); drv.g.scale.setScalar(.95); g.add(drv.g); pose(drv, "sit", 0, true);
    const load = makePallet(pick(["#c9a26b", "#d8b88a"])); load.position.set(0, .05, .5); load.visible = false; car.add(load);
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(1.6, 2.8, 3.2); hit.position.y = 1.4; hit.userData = { kind: "lift", id: f.id }; g.add(hit);
    return { f, g, car, load, beacon, drv, hit, x: 0, z: 0, h: 0, path: [], st: "idle", job: null, lift: 0, wantLift: 0, wait: 0, task: "Parked at the charger", op: null };
  }
  function addLift(L) { W.root.add(L.g); W.pick.push(L.hit); W.lifts.push(L); }
  const LANE = -8.5;
  function parkLift(L, why) { L.st = "idle"; L.task = why || `Charging · battery ${L.f.battery}%`; go(L, [{ x: L.x, z: LANE, v: 2.6 }, { x: L.home.x, z: LANE, v: 3 }, { x: L.home.x, z: L.home.z, v: 1.4, rev: true }]); }
  function liftTask(L) {
    if (!L.op) { if (L.st !== "idle" || L.x !== L.home.x) parkLift(L, "Parked: no licensed driver on this shift"); L.drv.g.visible = false; return; }
    L.drv.g.visible = true;
    const k = W.trucks.find(t => t.st === "docked" && t.moves + (t.busy || 0) < t.need && (t.busy || 0) < 2);
    if (!k) { if (L.st !== "idle") parkLift(L); else if (Math.random() < .3 && W.slots.length) { relocate(L); } return; }
    k.busy = (k.busy || 0) + 1; L.job = k; L.st = "job";
    const dk = k.dock, x = dk.x, wantRoom = k.cold;
    const pool = W.slots.filter(s => (k.dir === "in" ? !s.filled : s.filled) && !s.claim && (wantRoom >= 0 ? s.room === wantRoom : s.room < 0));
    const slot = pick(pool.length ? pool : W.slots.filter(s => !s.claim)); slot.claim = true; L.slot = slot;
    const where = slot.room >= 0 ? W.rooms[slot.room].name.toLowerCase() : `row ${slot.row + 1}`;
    const toRack = [{ x, z: LANE, v: 2.4, rev: true }, { x: slot.aisleX, z: LANE, v: 3.2 }, { x: slot.aisleX, z: slot.z, v: 2.8 }];
    const toDock = [{ x: slot.aisleX, z: LANE, v: 2.4, rev: true }, { x, z: LANE, v: 3.2 }, { x, z: -1.2, v: 1.8 }, { x, z: 1.6, v: 1.1 }];
    if (k.dir === "in") {
      L.task = `Unloading ${k.T.id} at Bay ${dk.i + 1}`;
      go(L, [{ x: L.x, z: LANE, v: 2.8 }, { x, z: LANE, v: 3.2 }, { x, z: -1.2, v: 1.8 }, { x, z: 1.6, v: 1.1 }], () => {
        L.wantLift = .3; L.wait = 1.1; L.after = () => { const p = k.cargo.find(c => c.visible); if (p) p.visible = false; L.load.visible = true; L.task = `Putting away · ${where}`;
          go(L, [{ x, z: -2.5, v: 1.2, rev: true }, ...toRack], () => { L.face = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = slot.y + .1; L.wait = 2;
            L.after = () => { W.setSlot(slot, true); slot.claim = false; L.load.visible = false; L.wantLift = 0; W.stats.putaway++; k.moves++; k.busy--; L.job = null; L.st = "back"; L.wait = .6; L.after = () => liftTask(L); }; }); };
      });
    } else {
      L.task = `Picking for ${k.T.id} · ${where}`;
      go(L, [{ x: L.x, z: LANE, v: 2.8 }, { x: slot.aisleX, z: LANE, v: 3.2 }, { x: slot.aisleX, z: slot.z, v: 2.8 }], () => {
        L.face = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = slot.y + .1; L.wait = 2;
        L.after = () => { W.setSlot(slot, false); slot.claim = false; L.load.visible = true; L.wantLift = .3; L.task = `Loading ${k.T.id} at Bay ${dk.i + 1}`;
          go(L, toDock, () => { L.wait = 1.1; L.after = () => { const p = k.cargo.find(c => !c.visible); if (p) p.visible = true; L.load.visible = false; L.wantLift = 0; W.stats.picked++; k.moves++; k.busy--; L.job = null;
            go(L, [{ x, z: -2.5, v: 1.2, rev: true }], () => liftTask(L)); }; }); };
      });
    }
  }
  function relocate(L) {   // quiet time: replenishment moves between rack slots keep the floor busy
    const a = pick(W.slots.filter(s => s.filled && !s.claim)), b = pick(W.slots.filter(s => !s.filled && !s.claim && s.room === (a && a.room)));
    if (!a || !b) return; a.claim = b.claim = true; L.st = "job"; L.slot = a; L.task = "Replenishing pick faces";
    go(L, [{ x: L.x, z: LANE, v: 2.6 }, { x: a.aisleX, z: LANE, v: 3 }, { x: a.aisleX, z: a.z, v: 2.6 }], () => { L.face = a.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = a.y + .1; L.wait = 1.8;
      L.after = () => { W.setSlot(a, false); a.claim = false; L.load.visible = true; L.wantLift = .3; L.slot = b;
        go(L, [{ x: a.aisleX, z: LANE, v: 2.4, rev: true }, { x: b.aisleX, z: LANE, v: 3 }, { x: b.aisleX, z: b.z, v: 2.6 }], () => { L.face = b.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = b.y + .1; L.wait = 1.8;
          L.after = () => { W.setSlot(b, true); b.claim = false; L.load.visible = false; L.wantLift = 0; L.st = "back"; go(L, [{ x: b.aisleX, z: LANE, v: 2.4, rev: true }], () => liftTask(L)); }; }); }; });
  }
  function go(a, pts, then) { a.path = pts; a.then = then || null; a.face = null; }
  function stepLift(L, dt) {
    L.lift += (L.wantLift - L.lift) * Math.min(1, dt * 2.4); L.car.position.y = .12 + L.lift;
    if (L.wait > 0) { L.wait -= dt; if (L.face != null) L.h += ang(L.h, L.face) * Math.min(1, dt * 4); if (L.wait <= 0 && L.after) { const f = L.after; L.after = null; f(); } }
    else if (L.path.length) moveAlong(L, dt, 1);
    else if (L.st === "idle" && Math.random() < dt * .6) liftTask(L);
    L.g.position.set(L.x, 0, L.z); L.g.rotation.y = L.h;
    L.beacon.material.color.set(L.path.length && !still && Math.floor(S.real * 3) % 2 ? "#ffb020" : "#8a6a20");
  }

  /* ------------------------------------------------ people: hi-vis, hard hats, the roster */
  const ROLE_COL = {}; (G.roles || []).forEach(r => { ROLE_COL[r.role] = r.colour; });
  const BEH = { "Shift Supervisor": "supervisor", "Team Leader": "leader", "Order Picker": "picker", "Inventory Controller": "picker", "Receiver / Checker": "receiver", "Loader": "loader",
    "Yard Marshal": "marshal", "Gatehouse Officer": "gate", "Cleaner / Hygiene": "cleaner", "Quality Officer (GDP)": "quality" };
  function dress(p, role) {
    const vest = /Manager|Lead|Quality|Supervisor/.test(role) ? "#ffe066" : /Driver|Courier/.test(role) ? "#ff7a1a" : "#ff9f1c";
    const v = new THREE.Mesh(new THREE.CapsuleGeometry(.178, .26, 4, 10), mat(vest, { roughness: .5, emissive: vest, emissiveIntensity: .05 })); v.position.y = 1.15; v.scale.set(1.02, .9, 1.04); p.body.add(v);
    for (const y of [1.02, 1.18]) { const s = new THREE.Mesh(new THREE.TorusGeometry(.18, .013, 4, 18), mat("#e9eef3", { metalness: .6, roughness: .2, emissive: "#ffffff", emissiveIntensity: .15 })); s.rotation.x = Math.PI / 2; s.position.y = y; p.body.add(s); }
    const hat = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 8, 0, TAU, 0, Math.PI / 2), mat(/Supervisor|Manager|Lead|Quality/.test(role) ? "#ffffff" : /Driver|Courier/.test(role) ? "#2f6fd6" : "#ffd23f", { roughness: .35 }));
    hat.position.y = 1.58; p.body.add(hat); const brim = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .02, 16), hat.material); brim.position.y = 1.585; p.body.add(brim);
    if (/Quality|cold/.test(role)) { const jk = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .3, 4, 10), mat("#2a4a8a")); jk.position.y = 1.13; p.body.add(jk); }
  }
  let pid = 0;
  function person(role, name, x, z, beh, rid) {
    const p = makePerson(THREE, { kind: "staff", role, seed: Math.random() }); dress(p, role);
    const tag = tagSprite(THREE, name, role, ROLE_COL[role] || "#ffd27a"); tag.scale.multiplyScalar(1.7); tag.position.y = 2.25; tag.visible = false; p.g.add(tag);
    const a = { id: rid || "w" + (pid++), p, role, name, x, z, h: rnd(0, TAU), path: [], act: "idle", wait: rnd(0, 2), beh, doing: "", tag, bubble: null };
    p.hit.userData = { kind: "person", id: a.id }; W.pick.push(p.hit); p.g.position.set(x, 0, z); W.root.add(p.g); W.people.push(a); return a;
  }
  function say(a, txt, tone = "say", secs = 3) { if (!a || a.gone || still && tone === "say") return; if (a.bubble) a.p.g.remove(a.bubble.sp); const sp = bubbleSprite(THREE, txt, tone); sp.position.y = 2.5; a.p.g.add(sp); a.bubble = { sp, until: S.real + secs }; }
  function walk(a, pts, then) { a.path = pts.map(p => ({ ...p, v: p.v || 1.5 })); a.then = then || null; }
  // who should be here now, from the roster: arrivals walk in from the car park, the outgoing shift walks out
  function crewTick(warm) {
    const sh = shiftAt(G, S.t); if (!S.shift || S.shift.id !== sh.id) { if (S.shift && !warm) shiftChange(sh); S.shift = sh; }
    const want = W.roster.filter(p => !p.leave && onShift(p, S.t));
    const cap = { "Order Picker": 7, "Loader": 3, "Inventory Controller": 1 }; const used = {};
    const show = want.filter(p => { if (p.role === "Forklift Operator") return false; used[p.role] = (used[p.role] || 0) + 1; return used[p.role] <= (cap[p.role] ?? 9); });
    // forklifts: one per licensed operator on shift and not on a break
    const ops = want.filter(p => p.role === "Forklift Operator");
    W.lifts.forEach((L, i) => { const op = ops[i]; const brk = op && onBreak(op, S.t); const nop = op && !brk ? op : null;
      if ((L.op && L.op.id) !== (nop && nop.id)) { L.op = nop; L.f.operator = nop ? nop.name.split(" ")[0] : (op ? op.name.split(" ")[0] + " (break)" : "—"); if (!nop && L.st === "idle") liftTask(L); } });
    show.forEach(p => { if (W.present[p.id]) return; const beh = BEH[p.role] || "picker";
      const a = person(p.role, p.name.split(" ")[0], warm ? spot(beh).x : -W.w / 2 - 8, warm ? spot(beh).z : -W.d / 2 + 2, beh, p.id); a.r = p; W.present[p.id] = a;
      if (p.role === "Yard Marshal") W.marshal = a; if (p.role === "Gatehouse Officer") W.gateOfficer = a;
      if (!warm) { a.doing = `Clocking in for the ${S.shift.name.toLowerCase()} shift`; walk(a, [{ x: -W.w / 2 - 4, z: -8.5 }, { x: W.staffDoor.x + 2.4, z: -8.5 }], () => { a.wait = .5; }); } });
    Object.values(W.present).forEach(a => { if (!a.r || a.leaving) return; if (!want.includes(a.r) || !show.includes(a.r)) { a.leaving = true; a.doing = "Shift finished · heading home"; a.path = [];
      walk(a, [{ x: W.staffDoor.x + 2.4, z: -8.5 }, { x: -W.w / 2 - 4, z: -8.5 }, { x: -W.w / 2 - 8 + rnd(-2, 2), z: -W.d / 2 + rnd(-6, 6) }], () => { a.gone = true; }); } });
    const n = Object.values(W.present).filter(a => !a.leaving).length + W.lifts.filter(L => L.op).length;
    W.cars.forEach((c, i) => { c.visible = i < Math.min(W.cars.length, Math.ceil(n / 2.2)); });
  }
  function spot(beh) { if (beh === "marshal") return { x: W.w / 2 + 6, z: 14 }; if (beh === "gate") return { x: W.gateX + 6.5, z: W.yardD + 1 }; if (beh === "supervisor" || beh === "leader") return { x: rnd(-W.w / 3, W.w / 3), z: LANE + 1.5 };
    if (beh === "loader" || beh === "receiver" || beh === "quality") return { x: dockX(Math.floor(Math.random() * W.ND)), z: -3 }; return { x: pick(W.aisles), z: -14 - rnd(0, W.rowLen - 4) }; }
  function shiftChange(sh) {
    const n = W.roster.filter(p => p.shift === sh.id && !p.leave).length;
    log(`${sh.name} shift: ${n} people clocking in · handover at the dock board`, "shift");
    const sup = Object.values(W.present).find(a => a.role === "Shift Supervisor"); if (sup) say(sup, `Handover to ${sh.name.toLowerCase()} shift ✓`, "radio", 4);
    hooks.onShift && hooks.onShift(sh);
  }
  function marshalTo(dk) { const m = W.marshal; if (!m || m.gone || m.leaving || m.onBreak) return; m.target = dk; walk(m, [{ x: dk.x + 3.6, z: 11 }], () => { m.act = "work"; m.doing = `Guiding a truck onto Bay ${dk.i + 1}`; say(m, "Back… back… stop! ✋", "radio", 4); }); }
  function spawnDriver(k) {
    const d = person("Truck Driver", k.T.driver, k.x + 1.6, k.z + k.L / 2 - 1.8, "driver"); d.truck = k; k.driver = d; d.inCab = false;
    d.doing = `Driving ${k.T.id} · ${k.dir === "in" ? "delivering in" : "collecting"} for ${k.client ? k.client.name : ""}`;
    walk(d, [{ x: k.x + 2.4, z: 6 }, { x: -W.w / 2 - 3, z: 4 }], () => { d.act = "idle"; d.doing = `Waiting in the drivers' room while ${k.T.id} is ${k.dir === "in" ? "unloaded" : "loaded"}`; say(d, "Paperwork signed ✓", "done", 2.5); });
  }
  function think(a, dt) {
    if (a.path.length || a.wait > 0) { if (a.wait > 0) a.wait -= dt; return; }
    if (a.leaving || a.gone) return;
    // breaks from the roster: walk to the staff room, sit, come back
    const brk = a.r && onBreak(a.r, S.t);
    if (brk && !a.onBreak) { a.onBreak = brk; a.p.carry.visible = false; a.carry = false; a.doing = `${brk.name} until ${fmtClock(hm(brk.at) + brk.minutes * 60)}`; walk(a, [{ x: a.x, z: LANE + .8 }, { x: W.office.x + 4.6, z: W.office.z + 2 }, { x: W.office.x + rnd(-2.5, 2.5), z: W.office.z + rnd(-1, 1.5) }], () => { a.act = "sit"; }); return; }
    if (a.onBreak) { if (brk) { a.act = "sit"; a.wait = 2; return; } a.onBreak = null; walk(a, [{ x: W.office.x + 4.6, z: W.office.z + 2 }, { x: W.office.x + 6, z: LANE + .8 }]); return; }
    const B = a.beh;
    if (B === "picker") {
      if (a.carry) { a.p.carry.visible = false; a.carry = false; a.p.carryHeld = false; const lane = pick(W.staging); const free = lane.pallets.find(p => !p.visible); if (free && Math.random() < .5) free.visible = true; W.stats.picked++; a.act = "work"; a.wait = rnd(1.5, 3); a.doing = `Building a pallet at Bay ${W.staging.indexOf(lane) + 1}`; return; }
      if (a.atSlot) { a.atSlot = false; a.carry = true; a.p.carry.visible = true; a.p.carryHeld = true; const lane = pick(W.staging); a.doing = `Taking the pick to Bay ${W.staging.indexOf(lane) + 1}`;
        walk(a, [{ x: a.x, z: LANE + .8 }, { x: lane.x + rnd(-1, 1), z: -3.8 }]); return; }
      const s = pick(W.slots), room = s.room >= 0 ? W.rooms[s.room] : null; const cs = G.clients.filter(c => c.site === W.site.id);
      a.doing = room ? `Picking in the ${room.name.toLowerCase()} (${room.temp.toFixed(0)}°C) for ${(pick(cs) || {}).name || "a client"}` : `Picking ${(pick(cs) || {}).name || ""} order in row ${s.row + 1}`;
      walk(a, [{ x: a.x, z: LANE + .8 }, { x: s.aisleX, z: LANE + .8 }, { x: s.aisleX, z: s.z }], () => { a.atSlot = true; a.act = "work"; a.wait = rnd(2.5, 5); if (Math.random() < .25) say(a, pick(room ? ["Cold room in ❄", "Batch OK · FEFO ✓", `${room.temp.toFixed(1)}°C ✓`] : ["Scan ✓", "Pick 4 of 9", "Short-dated: skip ✓"]), "say", 2.2); });
    } else if (B === "loader") {
      const k = pick(W.trucks.filter(t => t.st === "docked"));
      if (k) { a.doing = `${k.dir === "in" ? "Unloading" : "Loading"} ${k.T.id} at Bay ${k.dock.i + 1}`; walk(a, [{ x: k.dock.x + (Math.random() < .5 ? -1.9 : 1.9), z: -1.6 }], () => { a.act = "work"; a.wait = rnd(4, 8); if (Math.random() < .3) say(a, pick(["Seal on ✓", "Load secured", k.T.reefer ? `Probe ${k.T.temp}°C ✓` : "Straps on"]), "say", 2.4); }); }
      else { a.act = "work"; a.wait = rnd(3, 5); a.doing = "Wrapping pallets in the staging lane"; }
    } else if (B === "receiver" || B === "quality") {
      const k = pick(W.trucks.filter(t => t.st === "docked" && t.dir === "in" && (B !== "quality" || t.T.reefer)));
      if (k) { a.doing = B === "quality" ? `Checking ${k.T.id}'s temperature log` : `Checking ${k.T.id} against the ASN`; walk(a, [{ x: k.dock.x + 1.2, z: -.9 }], () => { a.act = "work"; a.wait = rnd(4, 7); say(a, k.T.reefer ? `Arrival ${k.T.temp}°C ✓` : `ASN matches · ${k.need} pallets ✓`, "done", 3); }); }
      else if (B === "quality" && W.rooms.length) { const m = pick(W.rooms); a.doing = `Temperature round: ${m.name} ${m.temp.toFixed(1)}°C`; walk(a, [{ x: (m.x0 + m.x1) / 2, z: LANE + 1 }], () => { a.act = "work"; a.wait = 4; say(a, `${m.name} ${m.temp.toFixed(1)}°C ✓`, "done", 2.6); }); }
      else { a.act = "idle"; a.wait = rnd(3, 6); a.doing = "At the receiving desk"; }
    } else if (B === "supervisor" || B === "leader") {
      const dk = pick(W.docks); a.doing = B === "leader" ? `Team leader · checking Bay ${dk.i + 1} and the pick waves` : `Walking the dock line · Bay ${dk.i + 1}`;
      walk(a, [{ x: dk.x, z: LANE + 1.6 }], () => { a.act = "idle"; a.wait = rnd(2.5, 5); if (Math.random() < .45) { const k = dk.truck; say(a, k && k.st === "docked" ? `Bay ${dk.i + 1}: ${Math.max(1, Math.round((k.need - k.moves) * 3))} min to go` : pick(["Lane clear ✓", "Break rota on time", `${W.lifts.filter(l => l.st === "job").length} forklifts working`, `${S.shift ? S.shift.name : ""} shift on plan`]), "radio", 3); } });
    } else if (B === "manager") {
      const h = ((S.t % 86400) + 86400) % 86400 / 3600;
      if (h < 7.5 || h > 17.5) { a.act = "sit"; a.wait = 6; a.doing = "Off site · on call for the night shift"; a.p.g.visible = false; return; }
      a.p.g.visible = true;
      if (a.back) { a.back = false; walk(a, [{ x: W.office.x + 5, z: W.office.z + 1 }, { x: W.office.x, z: W.office.z }]); return; }
      if (Math.random() < .55) { a.act = "sit"; a.wait = rnd(10, 18); a.doing = "In the office: today's plan and client calls"; }
      else { const dk = pick(W.docks); a.doing = `Floor walk at Bay ${dk.i + 1}`; walk(a, [{ x: W.office.x + 5, z: W.office.z + 1 }, { x: dk.x, z: LANE + 2 }], () => { a.act = "idle"; a.wait = 4; a.back = true; say(a, pick(["Good pace today 👍", "Keep the lanes clear", "Client visit at 2pm"]), "say", 2.6); }); }
    } else if (B === "marshal") {
      if (a.target && a.target.truck && a.target.truck.st === "toDock") { a.act = "work"; return; }
      a.target = null; a.act = "idle"; a.wait = rnd(3, 6); a.doing = "Watching the yard: one-way traffic, people out of truck lanes";
      if (Math.random() < .4) walk(a, [{ x: rnd(-W.w / 2, W.w / 2), z: rnd(12, 16) }]);
    } else if (B === "gate") { a.act = "idle"; a.wait = rnd(4, 8); a.doing = "Checking trucks in and out at the gate"; if (Math.abs(a.x - (W.gateX + 6.5)) > .5) walk(a, [{ x: W.gateX + 6.5, z: W.yardD + 1 }]); }
    else if (B === "cleaner") { a.doing = W.rooms.length && Math.random() < .3 ? "Food-safe clean in the chilled zone" : "Floor scrub along the main lane"; walk(a, [{ x: rnd(-W.w / 2 + 3, W.w / 2 - 3), z: LANE + rnd(-1, 1), v: .9 }], () => { a.act = "work"; a.wait = rnd(2, 4); }); }
    else if (B === "driver") {
      const k = a.truck; if (!k || k.gone) { a.gone = true; return; }
      if (k.st === "closing" && !a.inCab && !a.returning) { a.returning = true; a.doing = `Back to ${k.T.id}`; walk(a, [{ x: k.x + 2.4, z: 6 }, { x: k.x + 1.6, z: k.z + k.L / 2 - 1.8 }], () => { a.inCab = true; a.gone = true; }); }
    }
  }
  function stepPerson(a, dt) {
    think(a, dt);
    if (a.path.length) { const p = a.path[0], dx = p.x - a.x, dz = p.z - a.z, dist = Math.hypot(dx, dz), v = p.v * dt;
      if (dist <= v) { a.x = p.x; a.z = p.z; a.path.shift(); if (!a.path.length) { if (a.act === "walk") a.act = "idle"; if (a.then) { const f = a.then; a.then = null; f(); } } }
      else { a.x += dx / dist * v; a.z += dz / dist * v; a.h += ang(a.h, Math.atan2(dx, dz)) * Math.min(1, dt * 9); a.act = "walk"; } }
    if (a.beh === "marshal" && a.act === "work" && a.target) a.h += ang(a.h, Math.atan2(a.target.x - a.x, 12 - a.z)) * Math.min(1, dt * 5);
    a.p.g.position.set(a.x, 0, a.z); a.p.g.rotation.y = a.h; pose(a.p, a.act, S.real, still);
    if (a.bubble && S.real > a.bubble.until) { a.p.g.remove(a.bubble.sp); a.bubble.sp.material.map.dispose(); a.bubble = null; }
    const camD = Math.hypot(camera.position.x - a.x, camera.position.z - a.z);
    a.tag.visible = (S.sel && S.sel.kind === "person" && S.sel.id === a.id) || (S.roleFilter ? S.roleFilter === a.role : camD < 40);
  }

  /* ------------------------------------------------ day and night */
  const sunCol = new THREE.Color(), tmp = new THREE.Color();
  function lightFor(t) {
    const h = ((t % 86400) + 86400) % 86400 / 3600;
    const k = smooth(5.6, 7.4, h) * (1 - smooth(18.9, 20.6, h)), dusk = Math.max(0, 1 - Math.abs(h - 19.6) / 1.2) + Math.max(0, 1 - Math.abs(h - 6.4) / 1.1);
    S.dayK = k;
    scene.background.copy(NIGHT).lerp(DAY, k).lerp(DUSK, Math.min(.35, dusk * .35) * (1 - Math.abs(k - .5) * 2 + .3)); scene.fog.color.copy(scene.background);
    const a = (h - 6) / 13.6 * Math.PI; sun.position.set(-Math.cos(a) * 90, 30 + Math.sin(Math.max(0, a)) * 100, 70);
    sunCol.set("#ffffff").lerp(tmp.set("#ffb36b"), Math.min(1, dusk * .7)); sun.color.copy(sunCol); sun.intensity = .08 + 2.0 * k;
    hemi.intensity = .42 + 1.1 * k; hemi.color.set("#ffffff").lerp(tmp.set("#6d8ad0"), 1 - k); hemi.groundColor.set("#c9d3dd").lerp(tmp.set("#1b2433"), 1 - k);
    const n = 1 - k; renderer.toneMappingExposure = 1.08;
    GLOW.lamp.emissiveIntensity = 2.4 * n; GLOW.panel.emissiveIntensity = .6 + 1.4 * n; GLOW.window.emissiveIntensity = 1.6 * n; GLOW.head.emissiveIntensity = .4 + 3 * n; GLOW.tail.emissiveIntensity = .3 + 1.5 * n;
    if (W) W.lights.forEach((l, i) => { l.intensity = (i === W.lights.length - 1 ? 90 : 160) * n; });
  }

  /* ------------------------------------------------ camera */
  const ov = { tx: 0, tz: 4, dist: 110, theta: .55, phi: .92 };
  let anim = null;
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  function fly(to, dur = 1) { const f = { ...ov }; if (still) { Object.assign(ov, to); return; } anim = { t: 0, dur, f, to }; }
  function home() { W.homeDist = W.w * 1.5 + 30; fly({ tx: 2, tz: 2, dist: W.homeDist, theta: .55, phi: .92 }, 1.1); S.follow = false; }
  const ptrs = new Map(); let down = null, pinch = null; const vel = { th: 0, ph: 0 };
  const pinchState = () => { const p = [...ptrs.values()]; return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 }; };
  function pan(dx, dy) { const k = ov.dist * .0016, rx = Math.cos(ov.theta), rz = -Math.sin(ov.theta), fx = -Math.sin(ov.theta), fz = -Math.cos(ov.theta);
    ov.tx = Math.max(-120, Math.min(120, ov.tx - rx * dx * k + fx * dy * k)); ov.tz = Math.max(-90, Math.min(90, ov.tz - rz * dx * k + fz * dy * k)); S.follow = false; }
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) down = { t: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey }; else if (down) down.moved = 99; if (ptrs.size === 2) pinch = pinchState(); anim = null; vel.th = vel.ph = 0; });
  canvas.addEventListener("pointermove", e => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { if (down && down.pan) pan(dx, dy); else { vel.th = -dx * .005; vel.ph = -dy * .004; ov.theta += vel.th; ov.phi = Math.max(.25, Math.min(1.42, ov.phi + vel.ph)); } }
    else if (ptrs.size === 2 && pinch) { const n = pinchState(); ov.dist = Math.max(14, Math.min(260, ov.dist * pinch.d / n.d)); pan(n.mx - pinch.mx, n.my - pinch.my); pinch = n; } });
  const endP = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size && down) { if (e.type === "pointerup" && down.moved < 8 && performance.now() - down.t < 500) { doPick(e.clientX, e.clientY); vel.th = vel.ph = 0; } down = null; } };
  canvas.addEventListener("pointerup", endP); canvas.addEventListener("pointercancel", endP); canvas.addEventListener("contextmenu", e => e.preventDefault());
  let zoomTo = null;
  canvas.addEventListener("wheel", e => { e.preventDefault(); anim = null; zoomTo = Math.max(14, Math.min(260, (zoomTo ?? ov.dist) * Math.exp(e.deltaY * .0011))); }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function doPick(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(W.pick, false).find(h => { let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
    select(hit ? hit.object.userData : null, false); }
  function select(sel, flyTo = true) {
    S.sel = sel && sel.kind ? sel : null; hooks.onSelect && hooks.onSelect(S.sel);
    if (!S.sel || !flyTo) return; const o = find(S.sel); if (o) fly({ tx: o.x, tz: o.z, dist: S.sel.kind === "dock" || S.sel.kind === "room" ? 32 : 24, phi: .85, theta: ov.theta }, .9);
  }
  function find(sel) { if (!sel || !W) return null;
    if (sel.kind === "truck") { const k = W.trucks.find(t => t.T.id === sel.id); return k && { x: k.x, z: k.z, k }; }
    if (sel.kind === "lift") { const L = W.lifts.find(l => l.f.id === sel.id); return L && { x: L.x, z: L.z, L }; }
    if (sel.kind === "person") { const a = W.people.find(p => p.id === sel.id); return a && { x: a.x, z: a.z, a }; }
    if (sel.kind === "room") { const m = W.rooms[sel.id]; return m && { x: (m.x0 + m.x1) / 2, z: m.z0 - 6, m }; }
    if (sel.kind === "dock") { const d = W.docks[sel.id]; return d && { x: d.x, z: 6, d }; } return null; }

  /* ------------------------------------------------ loop */
  let crewT = 0;
  function simStep(dt) {
    const h = Math.floor(((S.t % 86400) + 86400) % 86400 / 3600), bk = (G.bookings && G.bookings[W.site.id]) || [], mean = bk.length ? bk.reduce((a, b) => a + b, 0) / bk.length : 1, f = Math.max(.35, (bk[h] || mean) / (mean || 1));
    W.spawnT -= dt; const onSite = W.trucks.filter(t => !t.gone && t.st !== "road" && t.st !== "leaving").length;
    if (W.spawnT <= 0) { W.spawnT = rnd(6, 12) / f; if (onSite < W.ND + 3 && W.trucks.length < W.ND + 7) spawnTruck(false); }
    W.trucks.forEach(k => stepTruck(k, dt));
    W.trucks.filter(k => k.gone).forEach(k => { W.root.remove(k.g); const i = W.pick.indexOf(k.hit); if (i >= 0) W.pick.splice(i, 1); if (S.sel && S.sel.id === k.T.id) select(null, false); });
    W.trucks = W.trucks.filter(k => !k.gone);
    const gateBusy = W.trucks.some(k => k.st === "gate" || (k.st === "leaving" || k.st === "road") && Math.abs(k.x - W.gateX) < 5 && Math.abs(k.z - W.yardD) < 9);
    W.boomUp += ((gateBusy ? 1 : 0) - W.boomUp) * Math.min(1, dt * 1.5); W.boom.rotation.z = -W.boomUp * 1.45;
    W.docks.forEach(dk => { const want = dk.state === "occupied" && dk.truck && dk.truck.st !== "leaving" ? 1 : 0; dk.open += (want - dk.open) * Math.min(1, dt * 1.6);
      dk.panel.scale.y = Math.max(.05, (1 - dk.open) * 4); dk.panel.position.y = -dk.panel.scale.y / 2; dk.lamp.material.color.set(dk.state === "free" ? "#3fb87f" : dk.state === "reserved" ? "#ffc466" : "#e66767"); });
    W.lifts.forEach(L => stepLift(L, dt));
    W.people.forEach(a => stepPerson(a, dt));
    W.people.filter(a => a.gone).forEach(a => { W.root.remove(a.p.g); const i = W.pick.indexOf(a.p.hit); if (i >= 0) W.pick.splice(i, 1); if (a.r) delete W.present[a.r.id]; if (W.marshal === a) W.marshal = null; if (W.gateOfficer === a) W.gateOfficer = null; if (S.sel && S.sel.id === a.id) select(null, false); });
    W.people = W.people.filter(a => !a.gone);
    W.traffic.forEach(c => { const u = c.userData; u.x += u.dir * u.v * dt; if (u.x > 260) u.x = -260; if (u.x < -260) u.x = 260; c.position.set(u.x, 0, u.lane); });
    stepRooms(dt);
    crewT -= dt; if (crewT <= 0) { crewT = 1.5; crewTick(false); if (!W.marshal) W.marshal = Object.values(W.present).find(a => a.role === "Yard Marshal" && !a.leaving) || null; if (!W.gateOfficer) W.gateOfficer = Object.values(W.present).find(a => a.role === "Gatehouse Officer" && !a.leaving) || null; }
  }
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.fov = r.width < r.height ? 55 : 40; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  let last = performance.now(), visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.min(.1, (now - last) / 1000); last = now; if (!visible || document.hidden) return;
    S.real += raw; const dt = S.playing ? raw * Math.min(4, Math.max(.5, S.speed / 30)) : 0;
    if (S.playing) S.t += raw * S.speed;
    if (W && dt > 0) simStep(dt);
    if (anim) { anim.t += raw; const k = ease(Math.min(1, anim.t / anim.dur)); for (const key of ["tx", "tz", "dist", "theta", "phi"]) if (anim.to[key] != null) ov[key] = anim.f[key] + (anim.to[key] - anim.f[key]) * k; if (k >= 1) anim = null; }
    if (zoomTo != null) { ov.dist += (zoomTo - ov.dist) * Math.min(1, raw * 10); if (Math.abs(zoomTo - ov.dist) < .05) zoomTo = null; }
    if (!down && (vel.th || vel.ph)) { ov.theta += vel.th; ov.phi = Math.max(.25, Math.min(1.42, ov.phi + vel.ph)); vel.th *= .9; vel.ph *= .9; if (Math.abs(vel.th) + Math.abs(vel.ph) < 1e-4) vel.th = vel.ph = 0; }
    if (S.follow && S.sel) { const o = find(S.sel); if (o) { ov.tx += (o.x - ov.tx) * Math.min(1, raw * 3); ov.tz += (o.z - ov.tz) * Math.min(1, raw * 3); } }
    const sp = Math.sin(ov.phi); camera.position.set(ov.tx + ov.dist * sp * Math.sin(ov.theta), ov.dist * Math.cos(ov.phi) + 1, ov.tz + ov.dist * sp * Math.cos(ov.theta)); camera.lookAt(ov.tx, 0, ov.tz);
    if (W) { const hd = W.homeDist || 110, o = Math.max(0, Math.min(1, (ov.dist - hd * .55) / (hd * .3))); W.roofM.opacity = o; W.roof.visible = o > .02; W.roofM.depthWrite = o > .95; if (W.skyM) W.skyM.opacity = o; }
    lightFor(S.t);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    S, advance(sec) { for (let k = 0; k < sec / .05; k++) { S.real += .05; S.t += .05 * S.speed; simStep(.05 * Math.min(4, Math.max(.5, S.speed / 30))); } },
    setSite(site) { build(site); home(); log(`Opened ${site.name} · ${S.shift ? S.shift.name + " shift on" : ""}`); },
    jump(t) { S.t = t; if (W) { crewTick(false); } },
    select, home, zoom(f) { anim = null; zoomTo = Math.max(14, Math.min(260, (zoomTo ?? ov.dist) * f)); }, top() { fly({ phi: ov.phi > .5 ? .26 : .92 }, .8); },
    follow(v) { S.follow = v; }, find, roleFilter(r) { S.roleFilter = r; if (r && W) { const a = W.people.find(p => p.role === r && !p.leaving); if (a) select({ kind: "person", id: a.id }); } },
    state() {
      if (!W) return null;
      return { site: W.site, shift: S.shift, dayK: S.dayK, docks: W.docks.map(d => ({ i: d.i, state: d.state, truck: d.truck && d.truck.T.id, client: d.truck && d.truck.client && d.truck.client.name, dir: d.truck && d.truck.dir, prog: d.truck ? d.truck.moves / Math.max(1, d.truck.need) : 0 })),
        trucks: W.trucks.map(k => ({ id: k.T.id, type: k.T.type, st: k.st, dir: k.dir, client: k.client && k.client.name, dock: k.dock && k.dock.i, prog: k.moves / Math.max(1, k.need), driver: k.T.driver, ship: k.ship, temp: k.T.temp, reefer: k.T.reefer, events: k.events, need: k.need, moves: k.moves, stage: k.stage, cold: k.cold >= 0 ? W.rooms[k.cold].name : null })),
        lifts: W.lifts.map(L => ({ id: L.f.id, type: L.f.type, operator: L.f.operator || "—", battery: L.f.battery, task: L.task, busy: L.st === "job", crewed: !!L.op })),
        people: W.people.map(a => ({ id: a.id, rid: a.r && a.r.id, name: a.name, role: a.role, doing: a.doing, act: a.act, onBreak: !!a.onBreak, leaving: !!a.leaving })),
        rooms: W.rooms.map(m => ({ i: m.i, id: m.id, name: m.name, kind: m.kind, temp: m.temp, set: m.set, low: m.low, high: m.high, fill: W.slots.filter(s => s.room === m.i && s.filled).length / Math.max(1, W.slots.filter(s => s.room === m.i).length), open: m.opens > 0 })),
        stock: W.slots.filter(s => s.filled).length, slots: W.slots.length, stats: W.stats };
    },
  };
}
