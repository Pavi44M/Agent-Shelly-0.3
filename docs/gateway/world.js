/* Gateway Warehousing & Transport · the live 3D site (module v1.1)
   One site at a time: the warehouse (racks, staging lanes, office, charging bay), its dock doors,
   the yard, the gatehouse and the road. Trucks arrive, check in at the gate, reverse onto a free
   dock, get unloaded or loaded by forklifts, and leave. Pickers, loaders, receivers, the shift
   supervisor, the yard marshal, the gatehouse officer, the manager and the drivers all move and work.
   Synthetic data from docs/data/gateway.js. Units: metres; the building front (docks) is at z = 0. */
import * as THREE from "../kit/vendor/three.module.min.js";
import { makePerson, pose, bubbleSprite, tagSprite } from "../store/v3/people.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch = matchMedia("(pointer: coarse)").matches;
const TAU = Math.PI * 2;
const ang = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
export const fmtClock = t => { t = ((t % 86400) + 86400) % 86400; return String(Math.floor(t / 3600)).padStart(2, "0") + ":" + String(Math.floor(t % 3600 / 60)).padStart(2, "0"); };

export function createWorld(canvas, G, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shadows = !touch; renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#e9eef4"); scene.fog = new THREE.Fog("#e9eef4", 180, 420);
  const camera = new THREE.PerspectiveCamera(40, 1, .5, 900);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d3dd, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-60, 110, 70); scene.add(sun);
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -110; c.right = 110; c.top = 90; c.bottom = -90; c.near = 10; c.far = 320; sun.shadow.bias = -.0004; }
  scene.add(sun.target);

  const MC = {}; const mat = (hex, o) => { const k = hex + JSON.stringify(o || {}); return MC[k] || (MC[k] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: .7, metalness: .05 }, o || {}))); };
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(.5, .5, 1, 14);
  const box = (parent, w, h, d, x, y, z, m, cast = true) => { const me = new THREE.Mesh(BOX, m); me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = cast && shadows; me.receiveShadow = shadows; parent.add(me); return me; };
  const BLUE = "#2f6fd6", WALL = "#f4f6f9";

  /* ------------------------------------------------ the world for one site */
  let W = null;                       // current site world
  const S = { t: 0, speed: 60, playing: true, log: [], sel: null, follow: false, roleFilter: null };
  function log(txt, tone = "info") { S.log.unshift({ t: S.t, txt, tone }); S.log.length = Math.min(S.log.length, 40); hooks.onLog && hooks.onLog(); }

  function textTex(draw, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function label(text, sub, col = "#2f6fd6") {   // floating site label (dock numbers, zones)
    const t = textTex((x, w, h) => { x.fillStyle = "rgba(255,255,255,.92)"; x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, 14); x.fill(); x.strokeStyle = col; x.lineWidth = 4; x.stroke();
      x.fillStyle = "#13233a"; x.font = "700 34px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText(text, 18, sub ? 30 : h / 2);
      if (sub) { x.fillStyle = "#5b6b80"; x.font = "500 22px 'JetBrains Mono',monospace"; x.fillText(sub, 18, 66); } }, 320, sub ? 92 : 64);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(5.2, sub ? 1.5 : 1.04, 1); sp.renderOrder = 8; return sp;
  }

  function build(site) {
    if (W) { scene.remove(W.root); W.root.traverse(o => { if (o.geometry && o.geometry !== BOX && o.geometry !== CYL) o.geometry.dispose(); }); }
    const root = new THREE.Group(); scene.add(root);
    const B = site.building, w = B.w, d = B.d, H = B.h, ND = site.docks;
    const yardD = 36, roadZ = yardD + 8, gateX = w / 2 + 10;
    W = { site, root, w, d, H, ND, yardD, roadZ, gateX, docks: [], trucks: [], lifts: [], people: [], pick: [], racks: [], slots: [], aisles: [], spawnT: 0, stats: { in: 0, out: 0, putaway: 0, picked: 0 } };

    // ground, grass, yard apron, road with lane markings, access road
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat("#dfe8d6")); ground.rotation.x = -Math.PI / 2; ground.position.y = -.02; ground.receiveShadow = shadows; root.add(ground);
    box(root, w + 34, .04, d + yardD + 10, 4, 0, (yardD - d) / 2 + 2, mat("#eef1f4"), false);                     // concrete
    box(root, 900, .05, 12, 0, .01, roadZ + 2, mat("#5f6873"), false);                                            // road
    for (let x = -440; x < 440; x += 9) box(root, 4.5, .06, .22, x, .03, roadZ + 2, mat("#ffffff"), false);
    box(root, 900, .06, .2, 0, .03, roadZ - 3.6, mat("#f4f4f4"), false); box(root, 900, .06, .2, 0, .03, roadZ + 7.6, mat("#f4f4f4"), false);
    box(root, 9, .05, 10, gateX, .015, yardD + 2, mat("#6c757f"), false);                                         // access lane
    // yard markings: truck lane and dock bays
    for (let i = 0; i < ND; i++) { const x = dockX(i); box(root, .16, .05, 16, x - 1.9, .03, 8.5, mat("#ffd23f"), false); box(root, .16, .05, 16, x + 1.9, .03, 8.5, mat("#ffd23f"), false); }
    box(root, w + 20, .05, .16, 2, .03, 18, mat("#ffffff"), false);
    for (let x = -w / 2 - 6; x < w / 2 + 14; x += 4) box(root, 2, .05, .3, x, .03, 30, mat("#ffffff"), false);   // centre line of the yard lane
    // pedestrian walkway (green) from the office to the gatehouse
    box(root, 2.2, .05, yardD - 1, -w / 2 - 4, .03, yardD / 2, mat("#3fb87f"), false);

    // fence and trees around the yard
    const fz = yardD + 2.5, posts = [];
    for (let x = -w / 2 - 14; x <= w / 2 + 22; x += 3) if (Math.abs(x - gateX) > 6) posts.push([x, fz]);
    for (let z = -d - 6; z <= fz; z += 3) { posts.push([-w / 2 - 14, z]); posts.push([w / 2 + 22, z]); }
    const pIM = new THREE.InstancedMesh(BOX, mat("#9aa5b1"), posts.length), m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => pIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, .9, z), new THREE.Quaternion(), new THREE.Vector3(.12, 1.8, .12)))); root.add(pIM);
    box(root, gateX - 6 - (-w / 2 - 14), .08, .06, (-w / 2 - 14 + gateX - 6) / 2, 1.6, fz, mat("#9aa5b1"), false);
    box(root, w / 2 + 22 - (gateX + 6), .08, .06, (w / 2 + 22 + gateX + 6) / 2, 1.6, fz, mat("#9aa5b1"), false);
    const trees = []; for (let x = -w / 2 - 12; x < w / 2 + 22; x += rnd(6, 10)) if (Math.abs(x - gateX) > 8) trees.push([x, fz + 1.6]);
    for (let z = -d; z < fz; z += rnd(7, 11)) { trees.push([-w / 2 - 16, z]); trees.push([w / 2 + 24, z]); }
    for (let i = 0; i < 14; i++) trees.push([rnd(-120, 120), roadZ + rnd(12, 40)]);
    const tT = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .26, 2, 6), mat("#7a5a3a"), trees.length);
    const tC = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 10, 8), mat("#6cc06a"), trees.length);
    trees.forEach(([x, z], i) => { const s = rnd(.8, 1.3); tT.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 1, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      tC.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 2.4 * s + 1, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.25, s))); tC.setColorAt(i, new THREE.Color().setHSL(.3 + rnd(-.03, .03), .45, rnd(.48, .6))); });
    tT.castShadow = tC.castShadow = shadows; root.add(tT, tC);

    // staff car park (left of the building) with a few cars
    box(root, 16, .05, 20, -w / 2 - 6, .02, -d / 2 + 2, mat("#5f6873"), false);
    for (let i = 0; i < 6; i++) { const c = new THREE.Group(); const col = pick(["#d94a3d", "#3d7dd9", "#f4f6f8", "#2b2f36", "#9aa3ae", "#2a9d8f"]);
      box(c, 1.8, .7, 4.2, 0, .55, 0, mat(col, { metalness: .4, roughness: .35 })); box(c, 1.6, .55, 2.2, 0, 1.15, -.2, mat("#1d2a38", { metalness: .5, roughness: .2 }));
      c.position.set(-w / 2 - 10 + (i % 2) * 7.5, 0, -d + 6 + Math.floor(i / 2) * 6.5); c.rotation.y = Math.PI / 2; root.add(c); }

    // gatehouse with a boom barrier
    const gh = new THREE.Group(); gh.position.set(gateX + 6.5, 0, yardD + 1); root.add(gh);
    box(gh, 3.2, 2.8, 3.2, 0, 1.4, 0, mat(WALL)); box(gh, 3.6, .25, 3.6, 0, 2.95, 0, mat(BLUE)); box(gh, 2.6, 1.1, .05, 0, 1.7, 1.62, mat("#9fd3ea", { transparent: true, opacity: .55 }));
    const boomP = new THREE.Group(); boomP.position.set(gateX + 4.4, 1.1, yardD + 1); root.add(boomP);
    box(boomP, .3, 1.1, .3, 0, -.55, 0, mat("#e8692f")); W.boom = new THREE.Group(); boomP.add(W.boom);
    for (let i = 0; i < 12; i++) box(W.boom, .7, .12, .12, -.35 - i * .7, 0, 0, mat(i % 2 ? "#e8692f" : "#ffffff"), false);
    W.boomUp = 0;
    const gl = label("Gatehouse", "check-in · seals"); gl.position.set(gateX + 6.5, 5.2, yardD + 1); root.add(gl);

    // the building: walls (front wall broken by dock doors), blue fascia, roof that fades as you zoom in
    const bw = new THREE.Group(); root.add(bw);
    const front = [], doorW = 3.2, doorH = 4.0;
    let cx = -w / 2;
    for (let i = 0; i < ND; i++) { const x = dockX(i); front.push([cx, x - doorW / 2]); cx = x + doorW / 2; } front.push([cx, w / 2]);
    front.forEach(([a, b]) => { if (b - a > .05) box(bw, b - a, H, .3, (a + b) / 2, H / 2, 0, mat(WALL)); });
    for (let i = 0; i < ND; i++) box(bw, doorW, H - doorH, .3, dockX(i), doorH + (H - doorH) / 2, 0, mat(WALL));
    box(bw, .3, H, d, -w / 2, H / 2, -d / 2, mat(WALL)); box(bw, .3, H, d, w / 2, H / 2, -d / 2, mat(WALL)); box(bw, w, H, .3, 0, H / 2, -d, mat(WALL));
    box(bw, w + .4, .7, .5, 0, H - .1, .05, mat(BLUE)); box(bw, .5, .7, d + .4, -w / 2 - .05, H - .1, -d / 2, mat(BLUE)); box(bw, .5, .7, d + .4, w / 2 + .05, H - .1, -d / 2, mat(BLUE));
    box(bw, w + .4, .35, .4, 0, .18, .1, mat(BLUE));
    // name on the fascia
    const nt = textTex((x, cw, ch) => { x.fillStyle = BLUE; x.fillRect(0, 0, cw, ch); x.fillStyle = "#fff"; x.font = "800 70px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText("GATEWAY", 30, ch / 2); x.font = "600 40px 'Plus Jakarta Sans',system-ui"; x.fillText("· " + site.name.replace("Gateway ", ""), 360, ch / 2); }, 1024, 110);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.5), new THREE.MeshBasicMaterial({ map: nt })); nm.position.set(-w / 2 + 9, H - .1, .32); bw.add(nm);
    const roofM = new THREE.MeshStandardMaterial({ color: "#f7f9fb", roughness: .8, transparent: true, opacity: 1 });
    W.roof = new THREE.Group(); bw.add(W.roof);
    const rf = new THREE.Mesh(BOX, roofM); rf.scale.set(w, .3, d); rf.position.set(0, H + .15, -d / 2); rf.castShadow = shadows; W.roof.add(rf);
    for (let i = 0; i < Math.floor(w / 9); i++) for (let j = 0; j < 2; j++) { const u = new THREE.Mesh(BOX, roofM); u.scale.set(2.4, 1, 1.8); u.position.set(-w / 2 + 5 + i * 9, H + .8, -d * (.3 + j * .4)); W.roof.add(u);
      const f = new THREE.Mesh(CYL, new THREE.MeshStandardMaterial({ color: "#c9d2dc", transparent: true })); f.scale.set(1.2, .2, 1.2); f.position.set(u.position.x, H + 1.35, u.position.z); W.roof.add(f); }
    W.roofM = roofM;

    // inside: floor, aisle markings, office, charging bay, staging lanes
    box(root, w - .4, .04, d - .4, 0, .03, -d / 2, mat("#d9dee4"), false);
    box(root, w - 1, .05, .14, 0, .06, -8.5 - 1.6, mat("#ffd23f"), false); box(root, w - 1, .05, .14, 0, .06, -8.5 + 1.6, mat("#ffd23f"), false);
    W.staging = [];
    for (let i = 0; i < ND; i++) { const x = dockX(i);
      box(root, 2.8, .05, .1, x, .06, -1.2, mat("#ffffff"), false); box(root, 2.8, .05, .1, x, .06, -6.2, mat("#ffffff"), false);
      const lane = { x, pallets: [] }; W.staging.push(lane);
      for (let k = 0; k < 4; k++) { const p = makePallet(pick(cargoCols())); p.position.set(x + (k % 2 ? .7 : -.7), 0, -2.4 - Math.floor(k / 2) * 1.6); p.visible = Math.random() < .5; root.add(p); lane.pallets.push(p); } }
    const off = new THREE.Group(); off.position.set(-w / 2 + 5, 0, -5); root.add(off);
    box(off, 9, 3, 7, 0, 1.5, 0, mat("#e3ecf6")); box(off, 9.1, .2, 7.1, 0, 3.05, 0, mat(BLUE));
    box(off, 6, 1.4, .06, 0, 1.8, 3.52, mat("#9fd3ea", { transparent: true, opacity: .5 }));
    for (let i = 0; i < 3; i++) { box(off, 1.4, .75, .7, -2.6 + i * 2.4, .38, -1.5, mat("#cfd6de")); box(off, .6, .4, .05, -2.6 + i * 2.4, 1.0, -1.7, mat("#27466a")); }
    const ol = label("Office", "manager · planners"); ol.position.set(-w / 2 + 5, 4.6, -5); root.add(ol);
    W.office = { x: -w / 2 + 5, z: -5 };
    const chg = new THREE.Group(); chg.position.set(w / 2 - 4, 0, -4.5); root.add(chg);
    box(chg, 6, .05, 5, 0, .05, 0, mat("#3fb87f", { transparent: true, opacity: .35 }), false);
    for (let i = 0; i < 3; i++) box(chg, .5, 1.4, .4, -2 + i * 2, .7, -2.3, mat("#2b2f36"));
    const cl = label("Charging", "forklifts", "#3fb87f"); cl.position.set(w / 2 - 4, 3.4, -4.5); root.add(cl);
    W.charge = { x: w / 2 - 4, z: -4 };
    if (/Cold/.test(site.name)) { const cz = new THREE.Group(); cz.position.set(w / 4, 0, -d / 2 - 3); root.add(cz);
      box(cz, w / 2 - 6, .05, d - 14, 0, .07, 0, mat("#9fd3ea", { transparent: true, opacity: .3 }), false);
      const zl = label("2–8°C pharma", "GDP zone", "#8c6bdc"); zl.position.set(0, 7.5, 0); cz.add(zl); }

    // racks: double rows along z, aisles between them, pallet loads instanced (filled to the site's fill %)
    const R = site.rack_rows, rowLen = d - 13, z0 = -11, levels = H >= 10 ? 5 : 4, bay = 2.8, nb = Math.floor(rowLen / bay);
    const span = w - 18, gap = span / R;
    const upr = [], beams = [], loads = [];
    for (let r = 0; r < R; r++) {
      const rx = -span / 2 + gap * (r + .5) + 3;
      W.aisles.push(rx - gap / 2 + .2);
      for (const side of [-.65, .65]) for (let b = 0; b <= nb; b++) upr.push([rx + side, z0 - b * bay]);
      for (let b = 0; b < nb; b++) for (let l = 0; l < levels; l++) {
        const y = .15 + l * 1.75, zc = z0 - b * bay - bay / 2;
        beams.push([rx - .65, y + 1.2, zc]); beams.push([rx + .65, y + 1.2, zc]);
        for (const side of [-.33, .33]) { const slot = { x: rx + side, y: y + .05, z: zc, row: r, side, filled: Math.random() * 100 < site.fill_pct + 8, idx: loads.length, aisleX: side < 0 ? rx - gap / 2 + .2 : rx + gap / 2 - .2 };
          slot.aisleX = Math.max(-w / 2 + 2.5, Math.min(w / 2 - 2.5, slot.aisleX)); loads.push(slot); }
      }
    }
    W.aisles.push(span / 2 + 3 - .2);
    const uIM = new THREE.InstancedMesh(BOX, mat(BLUE), upr.length);
    upr.forEach(([x, z], i) => uIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, levels * 1.75 / 2 + .4, z), new THREE.Quaternion(), new THREE.Vector3(.1, levels * 1.75 + .8, .1))));
    const bIM = new THREE.InstancedMesh(BOX, mat("#f08a24"), beams.length);
    beams.forEach(([x, y, z], i) => bIM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y - 1.2, z), new THREE.Quaternion(), new THREE.Vector3(.08, .12, bay - .1))));
    const CARGO = cargoCols();
    const lIM = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ roughness: .8 }), loads.length);
    loads.forEach((s, i) => { s.m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + .7, s.z), new THREE.Quaternion(), new THREE.Vector3(1.0, 1.25, 1.15));
      lIM.setMatrixAt(i, s.filled ? s.m : m4.makeScale(0, 0, 0)); lIM.setColorAt(i, new THREE.Color(pick(CARGO))); });
    uIM.castShadow = lIM.castShadow = shadows; lIM.receiveShadow = shadows; root.add(uIM, bIM, lIM);
    W.slots = loads; W.loadIM = lIM; W.rowLen = rowLen; W.z0 = z0;
    W.setSlot = (s, on) => { s.filled = on; lIM.setMatrixAt(s.idx, on ? s.m : m4.makeScale(0, 0, 0)); lIM.instanceMatrix.needsUpdate = true; };

    // dock doors (roller doors that open when a truck is on), bumpers, dock lights and labels
    for (let i = 0; i < ND; i++) {
      const x = dockX(i), g = new THREE.Group(); g.position.set(x, 0, 0); root.add(g);
      box(g, doorW + .5, .4, .5, 0, doorH + .1, .2, mat(BLUE)); box(g, .25, doorH, .5, -doorW / 2 - .12, doorH / 2, .2, mat(BLUE)); box(g, .25, doorH, .5, doorW / 2 + .12, doorH / 2, .2, mat(BLUE));
      const door = new THREE.Group(); door.position.set(0, doorH, .05); g.add(door);
      const panel = box(door, doorW, 1, .08, 0, -.5, 0, mat("#cfd6de"), false);
      for (const sx of [-1.1, 1.1]) box(g, .35, .6, .3, sx, 1.1, .45, mat("#2b2f36"));
      const lamp = box(g, .3, .3, .12, doorW / 2 + .6, 2.6, .35, new THREE.MeshBasicMaterial({ color: "#3fb87f" }), false);
      const lb = label("Bay " + (i + 1)); lb.position.set(0, doorH + 1.4, .9); lb.scale.multiplyScalar(.6); g.add(lb);
      const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(doorW + .6, doorH + 1, 1.6); hit.position.set(0, doorH / 2, .4); hit.userData = { kind: "dock", id: i }; g.add(hit); W.pick.push(hit);
      W.docks.push({ i, x, state: "free", truck: null, open: 0, panel, lamp, door });
    }

    // forklifts, people
    const myLifts = G.forklifts.filter(f => f.site === site.id);
    myLifts.forEach((f, k) => { const L = makeLift(f); L.x = W.charge.x - 2 + (k % 3) * 2; L.z = W.charge.z + Math.floor(k / 3) * 2; L.h = Math.PI; addLift(L); });
    spawnTeam();
    // trucks already on site when you open the page (warm start)
    for (let k = 0; k < Math.min(ND - 1, 4); k++) spawnTruck(true);
    W.spawnT = 20;
    return W;
  }
  function dockX(i) { const w = W.w, ND = W.ND, usable = w - 22; return -usable / 2 + 6 + (usable / Math.max(1, ND - 1)) * i; }
  function cargoCols() { return ["#c9a26b", "#c9a26b", "#d8b88a", "#bfa07a", "#ffffff", ...G.clients.filter(c => c.site === W.site.id).map(c => c.colour)]; }
  function makePallet(col) { const g = new THREE.Group(); box(g, 1.1, .14, 1.1, 0, .07, 0, mat("#b88a52")); box(g, 1.0, .95, 1.0, 0, .62, 0, mat(col)); box(g, 1.02, .05, 1.02, 0, 1.1, 0, mat("#e9eef3", { transparent: true, opacity: .6 }), false); return g; }

  /* ------------------------------------------------ trucks */
  function makeTruck(T) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const semi = T.code === "CS", van = T.code === "PV";
    const boxL = semi ? 12.4 : van ? 3.4 : T.code === "EV" ? 6 : 7.2, cabL = van ? 2 : 2.5, H = van ? 2.5 : 3.7, Wd = van ? 2 : 2.5;
    const L = boxL + cabL + (semi ? .6 : .3);
    const side = textTex((x, cw, ch) => { x.fillStyle = T.colour; x.fillRect(0, 0, cw, ch); x.fillStyle = T.stripe; x.fillRect(0, ch * .74, cw, ch * .14);
      x.fillStyle = "#13233a"; x.font = `800 ${van ? 62 : 70}px 'Plus Jakarta Sans',system-ui`; x.textBaseline = "middle"; x.fillText("GATEWAY", 40, ch * .38);
      x.fillStyle = T.stripe; x.font = "600 34px 'Plus Jakarta Sans',system-ui"; x.fillText(T.reefer ? "❄ Cold chain · " + (T.temp ?? "") + "°C" : "Warehousing & Transport", 42, ch * .58); }, 1024, 256);
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: .6 });
    const bodyM = mat(T.colour, { roughness: .45 });
    // box/trailer: sides textured, rear doors at the back (−z local), cab at the front (+z local)
    const bx = new THREE.Mesh(BOX, [sideM, sideM, bodyM, bodyM, bodyM, mat("#dfe5eb")]); bx.scale.set(Wd, H - .9, boxL); bx.position.set(0, .9 + (H - .9) / 2, -L / 2 + boxL / 2); bx.castShadow = shadows; body.add(bx);
    box(body, Wd + .02, .18, boxL, 0, .95, -L / 2 + boxL / 2, mat(T.stripe));
    if (T.reefer && !van) box(body, 1.6, .9, .5, 0, H - .6, -L / 2 + boxL + .25, mat("#c9d2dc"));
    const cz = L / 2 - cabL / 2;
    box(body, Wd, van ? 1.8 : 2.4, cabL, 0, .9 + (van ? .9 : 1.2), cz, bodyM);
    box(body, Wd - .1, .9, .05, 0, van ? 2.2 : 2.6, L / 2 + .01, mat("#1d2a38", { metalness: .5, roughness: .15 }));
    box(body, .05, .7, 1, Wd / 2 + .01, van ? 2.2 : 2.6, cz + .3, mat("#1d2a38", { metalness: .5, roughness: .15 })); box(body, .05, .7, 1, -Wd / 2 - .01, van ? 2.2 : 2.6, cz + .3, mat("#1d2a38", { metalness: .5, roughness: .15 }));
    box(body, Wd + .1, .3, .2, 0, .75, L / 2 + .05, mat("#2b2f36"));
    for (const sx of [-.8, .8]) box(body, .3, .18, .05, sx, 1.1, L / 2 + .12, new THREE.MeshBasicMaterial({ color: "#fff6d8" }), false);
    const wz = [cz - .2, -L / 2 + 1.4, ...(semi || boxL > 6 ? [-L / 2 + 2.6] : [])];
    for (const z of wz) for (const sx of [-Wd / 2 + .1, Wd / 2 - .1]) { const wh = new THREE.Mesh(CYL, mat("#1d2228")); wh.scale.set(.95, .35, .95); wh.rotation.z = Math.PI / 2; wh.position.set(sx, .48, z); body.add(wh); }
    // cargo inside (shown through the open rear when docked)
    const cargo = []; const nP = Math.min(T.pallets, van ? 2 : 8);
    for (let k = 0; k < nP; k++) { const p = makePallet(pick(cargoCols())); p.scale.setScalar(.85); p.position.set(k % 2 ? .55 : -.55, .95, -L / 2 + .8 + Math.floor(k / 2) * 1.05); p.visible = false; body.add(p); cargo.push(p); }
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(Wd + .4, H + .4, L + .4); hit.position.y = H / 2; g.add(hit);
    hit.userData = { kind: "truck", id: T.id }; W.pick.push(hit);
    const pin = label(T.id, null, T.stripe); pin.scale.multiplyScalar(.55); pin.position.y = H + 1.4; pin.visible = false; g.add(pin);
    W.root.add(g);
    return { T, g, body, L, H, cargo, pin, x: 0, z: 0, h: 0, v: 0, path: [], st: "", wait: 0, dock: null, dir: "in", moves: 0, need: 0, prog: 0, stage: 0, events: [], driver: null };
  }
  function spawnTruck(warm) {
    const site = W.site, busy = id => W.trucks.some(k => k.T.id === id) || (W.recent || []).includes(id), cands = G.trucks.filter(t => t.site === site.id && !busy(t.id));
    const T = pick(cands.length ? cands : G.trucks.filter(t => !busy(t.id)));
    if (!T) return;
    const k = makeTruck(T), ship = G.shipments.find(s => s.truck === T.id);
    k.ship = ship; k.dir = Math.random() < .5 ? "in" : "out"; k.client = G.clients.find(c => c.id === T.client);
    k.need = Math.min(k.cargo.length, k.dir === "in" ? 4 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 2));
    if (k.dir === "in") k.cargo.forEach((p, i) => p.visible = i < k.need); else k.cargo.forEach(p => p.visible = false);
    W.trucks.push(k);
    const free = W.docks.filter(d => d.state === "free");
    if (warm && free.length) {               // already backed onto a dock
      const dk = pick(free); dk.state = "occupied"; dk.truck = k; k.dock = dk; k.x = dk.x; k.z = k.L / 2 + .25; k.h = 0; k.st = "docked"; k.moves = Math.floor(Math.random() * k.need * .6);
      if (k.dir === "in") k.cargo.forEach((p, i) => p.visible = i >= k.moves && i < k.need); else k.cargo.forEach((p, i) => p.visible = i < k.moves);
      k.stage = 2; ev(k, "Docked at Bay " + (dk.i + 1)); spawnDriver(k); return;
    }
    const fromLeft = Math.random() < .6; k.x = fromLeft ? -200 : 200; k.z = W.roadZ + (fromLeft ? 3.4 : .6); k.h = fromLeft ? Math.PI / 2 : -Math.PI / 2; k.st = "road";
    k.path = [{ x: W.gateX - 1.8, z: k.z, v: 11 }, { x: W.gateX - 1.8, z: W.yardD + 4.5, v: 4 }]; k.then = () => { k.st = "gate"; k.wait = 9; ev(k, "At the gate · booking " + (k.ship ? k.ship.id : "") + " checked"); say(W.gateOfficer, "Booking " + (k.ship ? k.ship.id : "") + " ✓", "done"); };
    k.stage = 0;
  }
  function ev(k, txt) { k.events.unshift({ t: S.t, txt }); log(`${k.T.id} · ${txt}`); }
  function goDock(k, dk) {
    dk.state = "reserved"; dk.truck = k; k.dock = dk; const x = dk.x;
    k.path = [{ x: W.gateX - 1.8, z: 26, v: 5 }, { x: x + 10, z: 27.5, v: 5 }, { x: x + 1.5, z: 31.5, v: 3 }, { x, z: 18, v: 2.4, rev: true }, { x, z: k.L / 2 + .25, v: 1.4, rev: true }];
    k.st = "toDock"; ev(k, `Heading to Bay ${dk.i + 1}`);
    k.then = () => { k.st = "docked"; dk.state = "occupied"; k.stage = 2; ev(k, `Docked at Bay ${dk.i + 1}${k.T.reefer ? " · seal checked, " + k.T.temp + "°C" : ""}`); spawnDriver(k); };
    if (W.marshal) marshalTo(dk);
  }
  function depart(k) {
    const dk = k.dock; k.st = "leaving"; k.stage = k.dir === "out" ? 3 : 4; ev(k, k.dir === "out" ? `Loaded ${k.need} pallets · in transit to ${k.ship ? k.ship.to : "client"}` : `Unloaded ${k.need} pallets · leaving empty`);
    if (k.dir === "out") W.stats.out++; else W.stats.in++;
    k.path = [{ x: dk.x, z: 20, v: 3 }, { x: dk.x + 6, z: 29, v: 4 }, { x: W.gateX + 1.8, z: 30, v: 5 }, { x: W.gateX + 1.8, z: W.roadZ + .6, v: 4 }, { x: 220, z: W.roadZ + .6, v: 12 }];
    k.then = () => { k.gone = true; W.recent = [k.T.id, ...(W.recent || [])].slice(0, 8); }; dk.state = "free"; dk.truck = null; k.dock = null; S.boomFor = 6;
  }
  function stepTruck(k, dt) {
    if (k.st === "gate") { W.boomUp = Math.min(1, W.boomUp + dt * .8); k.wait -= dt; if (k.wait <= 0) { const dk = W.docks.find(d => d.state === "free"); if (dk) goDock(k, dk); else { k.st = "staged"; k.path = [{ x: W.gateX - 1.8, z: 30, v: 4 }, { x: W.gateX + 4 + (W.trucks.filter(t => t.st === "staged").length) * 3.6, z: 22, v: 3 }]; k.then = () => { k.st = "waiting"; ev(k, "Waiting in the yard for a free dock"); }; } } }
    else if (k.st === "waiting") { const dk = W.docks.find(d => d.state === "free"); if (dk) goDock(k, dk); }
    else if (k.st === "docked") { k.prog = k.moves / Math.max(1, k.need); if (k.moves >= k.need && !k.lift) { k.st = "closing"; k.wait = 4; } }
    else if (k.st === "closing") { k.wait -= dt; if (k.wait <= 0 && (!k.driver || k.driver.inCab)) depart(k); }
    if (k.path.length) moveAlong(k, dt, 1);
    k.g.position.set(k.x, 0, k.z); k.g.rotation.y = k.h;
    k.pin.visible = !!(S.sel && S.sel.kind === "truck" && S.sel.id === k.T.id);
  }
  function moveAlong(a, dt, turn) {   // follow waypoints; reverse segments keep the vehicle facing away from the motion
    const p = a.path[0]; const dx = p.x - a.x, dz = p.z - a.z, dist = Math.hypot(dx, dz); const v = (p.v || 3) * dt * (still ? 1 : 1);
    if (dist < .05 || dist <= v) { a.x = p.x; a.z = p.z; a.path.shift(); if (!a.path.length && a.then) { const f = a.then; a.then = null; f(); } return; }
    const dir = Math.atan2(dx, dz), want = p.rev ? dir + Math.PI : dir;
    a.h += ang(a.h, want) * Math.min(1, dt * (p.rev ? 2.2 : 3.2) * turn);
    a.x += dx / dist * v; a.z += dz / dist * v; a.rev = !!p.rev;
  }

  /* ------------------------------------------------ forklifts */
  function makeLift(f) {
    const g = new THREE.Group(); const o = "#f5a623";
    box(g, 1.2, .9, 1.9, 0, .7, -.2, mat(o)); box(g, 1.25, .6, .5, 0, .85, -1.05, mat("#2b2f36"));
    for (const [x, z] of [[-.55, .55], [.55, .55], [-.55, -.85], [.55, -.85]]) box(g, .06, 1.4, .06, x, 1.85, z, mat("#2b2f36"));
    box(g, 1.2, .06, 1.5, 0, 2.55, -.15, mat("#2b2f36"));
    box(g, .1, 2.6, .12, -.4, 1.3, .95, mat("#3a4048")); box(g, .1, 2.6, .12, .4, 1.3, .95, mat("#3a4048"));
    const car = new THREE.Group(); car.position.set(0, .12, 1.05); g.add(car);
    box(car, .9, .6, .08, 0, .3, 0, mat("#3a4048")); box(car, .12, .05, 1.1, -.3, 0, .55, mat("#5b636d")); box(car, .12, .05, 1.1, .3, 0, .55, mat("#5b636d"));
    for (const [x, z] of [[-.55, .7], [.55, .7], [-.55, -.8], [.55, -.8]]) { const wh = new THREE.Mesh(CYL, mat("#1d2228")); wh.scale.set(.5, .25, .5); wh.rotation.z = Math.PI / 2; wh.position.set(x, .25, z); g.add(wh); }
    const beacon = box(g, .16, .12, .16, 0, 2.66, -.6, new THREE.MeshBasicMaterial({ color: "#ffb020" }), false);
    const drv = makePerson(THREE, { kind: "staff", role: "Forklift Operator", seed: Math.random() }); dress(drv, "Forklift Operator"); drv.g.position.set(0, .3, -.3); drv.g.scale.setScalar(.95); g.add(drv.g); pose(drv, "sit", 0, true);
    const load = makePallet(pick(["#c9a26b", "#d8b88a"])); load.position.set(0, .05, .5); load.visible = false; car.add(load);
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(1.6, 2.8, 3.2); hit.position.y = 1.4; hit.userData = { kind: "lift", id: f.id }; g.add(hit);
    return { f, g, car, load, beacon, drv, hit, x: 0, z: 0, h: 0, path: [], st: "idle", job: null, lift: 0, wantLift: 0, wait: 0, task: "Charging" };
  }
  function addLift(L) { W.root.add(L.g); W.pick.push(L.hit); W.lifts.push(L); }
  const LANE = -8.5;
  function liftTask(L) {   // find work: a docked truck that still needs pallet moves and has no forklift
    const k = W.trucks.find(t => t.st === "docked" && t.moves + (t.busy || 0) < t.need && (t.busy || 0) < 2);
    if (!k) { if (L.st !== "idle") { L.st = "idle"; L.task = "Charging · battery " + L.f.battery + "%"; go(L, [{ x: L.x, z: LANE, v: 2.6 }, { x: W.charge.x - 2 + (W.lifts.indexOf(L) % 3) * 2, z: LANE, v: 2.6 }, { x: W.charge.x - 2 + (W.lifts.indexOf(L) % 3) * 2, z: W.charge.z, v: 1.4, rev: true }]); } return; }
    k.busy = (k.busy || 0) + 1; L.job = k; L.st = "job";
    const dk = k.dock, x = dk.x;
    let slot;
    if (k.dir === "in") slot = pick(W.slots.filter(s => !s.filled && !s.claim)) || W.slots[0]; else slot = pick(W.slots.filter(s => s.filled && !s.claim)) || W.slots[0];
    slot.claim = true; L.slot = slot;
    const toRack = [{ x, z: LANE, v: 2.4, rev: true }, { x: slot.aisleX, z: LANE, v: 3 }, { x: slot.aisleX, z: slot.z + (slot.z < -30 ? 0 : 0), v: 2.6 }];
    const toDock = s => [{ x: s.aisleX, z: LANE, v: 2.4, rev: true }, { x, z: LANE, v: 3 }, { x, z: -1.2, v: 1.8 }, { x, z: 1.6, v: 1.1 }];
    if (k.dir === "in") {
      L.task = `Unloading ${k.T.id} at Bay ${dk.i + 1}`;
      go(L, [{ x: L.x, z: LANE, v: 2.6 }, { x, z: LANE, v: 3 }, { x, z: -1.2, v: 1.8 }, { x, z: 1.6, v: 1.1 }], () => {
        L.wantLift = .3; L.wait = 1.2; L.after = () => { const p = k.cargo.find(c => c.visible); if (p) p.visible = false; L.load.visible = true; L.task = `Putting away to row ${slot.row + 1}`;
          go(L, [{ x, z: -2.5, v: 1.2, rev: true }, ...toRack], () => { L.face = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = slot.y + .1; L.wait = 2.2;
            L.after = () => { W.setSlot(slot, true); slot.claim = false; L.load.visible = false; L.wantLift = 0; W.stats.putaway++; k.moves++; k.busy--; L.job = null; L.st = "back"; L.wait = .8; L.after = () => liftTask(L); }; }); };
      });
    } else {
      L.task = `Picking for ${k.T.id} from row ${slot.row + 1}`;
      go(L, [{ x: L.x, z: LANE, v: 2.6 }, { x: slot.aisleX, z: LANE, v: 3 }, { x: slot.aisleX, z: slot.z, v: 2.6 }], () => {
        L.face = slot.side < 0 ? Math.PI / 2 : -Math.PI / 2; L.wantLift = slot.y + .1; L.wait = 2.2;
        L.after = () => { W.setSlot(slot, false); slot.claim = false; L.load.visible = true; L.wantLift = .3; L.task = `Loading ${k.T.id} at Bay ${dk.i + 1}`;
          go(L, toDock(slot), () => { L.wait = 1.2; L.after = () => { const p = k.cargo.find(c => !c.visible); if (p) p.visible = true; L.load.visible = false; L.wantLift = 0; W.stats.picked++; k.moves++; k.busy--; L.job = null;
            go(L, [{ x, z: -2.5, v: 1.2, rev: true }], () => liftTask(L)); }; }); };
      });
    }
  }
  function go(a, pts, then) { a.path = pts; a.then = then || null; a.face = null; }
  function stepLift(L, dt) {
    L.lift += (L.wantLift - L.lift) * Math.min(1, dt * 2.2); L.car.position.y = .12 + L.lift;
    if (L.wait > 0) { L.wait -= dt; if (L.face != null) L.h += ang(L.h, L.face) * Math.min(1, dt * 4); if (L.wait <= 0 && L.after) { const f = L.after; L.after = null; f(); } }
    else if (L.path.length) moveAlong(L, dt, 1.4);
    else if (L.st === "idle" && Math.random() < dt * .5) liftTask(L);
    L.g.position.set(L.x, 0, L.z); L.g.rotation.y = L.h;
    L.beacon.material.color.set(L.path.length && !still && Math.floor(S.real * 3) % 2 ? "#ffb020" : "#8a6a20");
  }

  /* ------------------------------------------------ people (hi-vis, hard hats, role tags) */
  const ROLE_COL = {}; (G.roles || []).forEach(r => { ROLE_COL[r.role] = r.colour; });
  function dress(p, role) {
    const vest = /Manager|Lead|Quality|Coordinator/.test(role) ? "#ffe066" : /Driver|Courier/.test(role) ? "#ff7a1a" : "#ff9f1c";
    const v = new THREE.Mesh(new THREE.CapsuleGeometry(.178, .26, 4, 10), mat(vest, { roughness: .5 })); v.position.y = 1.15; v.scale.set(1.02, .9, 1.04); p.body.add(v);
    for (const y of [1.02, 1.18]) { const s = new THREE.Mesh(new THREE.TorusGeometry(.18, .012, 4, 18), mat("#e9eef3", { metalness: .6, roughness: .2 })); s.rotation.x = Math.PI / 2; s.position.y = y; p.body.add(s); }
    const hat = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 8, 0, TAU, 0, Math.PI / 2), mat(/Supervisor|Manager|Lead/.test(role) ? "#ffffff" : /Driver|Courier/.test(role) ? "#2f6fd6" : "#ffd23f", { roughness: .35 }));
    hat.position.y = 1.58; p.body.add(hat); const brim = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .02, 16), hat.material); brim.position.y = 1.585; p.body.add(brim);
  }
  let pid = 0;
  function person(role, name, x, z, beh) {
    const p = makePerson(THREE, { kind: "staff", role, seed: Math.random() }); dress(p, role);
    const tag = tagSprite(THREE, name, role, ROLE_COL[role] || "#ffd27a"); tag.scale.multiplyScalar(1.7); tag.position.y = 2.25; tag.visible = false; p.g.add(tag);
    const a = { id: "w" + (pid++), p, role, name, x, z, h: rnd(0, TAU), path: [], act: "idle", wait: rnd(0, 3), beh, doing: "", tag, bubble: null };
    p.hit.userData = { kind: "person", id: a.id }; W.pick.push(p.hit); p.g.position.set(x, 0, z); W.root.add(p.g); W.people.push(a); return a;
  }
  function say(a, txt, tone = "say", secs = 3) { if (!a || still && tone === "say") return; if (a.bubble) { a.p.g.remove(a.bubble.sp); } const sp = bubbleSprite(THREE, txt, tone); sp.position.y = 2.45; a.p.g.add(sp); a.bubble = { sp, until: S.real + secs }; }
  function walk(a, pts, then) { a.path = pts.map(p => ({ ...p, v: p.v || 1.45 })); a.then = then || null; }
  const names = () => pick(["Hemi", "Ana", "Losa", "Ben", "Mere", "Raj", "Sina", "Kahu", "Tama", "Lily", "Josh", "Ella", "Tevita", "Maia", "Chloe", "Manu", "Isla", "Tane", "Ruby", "Kiri", "Jun", "Zara", "Pita", "Hana", "Vai"]);
  const MG = () => (G.management || []);
  function spawnTeam() {
    const w = W.w, cold = /Cold/.test(W.site.name);
    const mgr = MG().find(m => m.id === "whm"); person("Warehouse Manager", mgr ? mgr.name.split(" ")[0] : "Sione", W.office.x, W.office.z, "manager");
    person("Shift Supervisor", names(), 0, LANE, "supervisor");
    person("Team Leader", names(), W.aisles[1] || 0, -14, "picker");
    const np = Math.min(6, 2 + Math.round(W.site.staff_on_shift / 8));
    for (let i = 0; i < np; i++) person("Order Picker", names(), pick(W.aisles), -12 - rnd(0, W.rowLen), "picker");
    for (let i = 0; i < 2; i++) person("Loader", names(), dockX(i * 2 % W.ND), -3, "loader");
    person("Receiver / Checker", names(), dockX(1), -4, "receiver");
    person("Inventory Controller", names(), pick(W.aisles), -20, "picker");
    W.marshal = person("Yard Marshal", names(), W.w / 2 + 6, 14, "marshal");
    W.gateOfficer = person("Gatehouse Officer", names(), W.gateX + 6.5, W.yardD + 1, "gate");
    if (cold) person("Quality Officer (GDP)", MG().find(m => m.id === "ccq") ? "Priya" : names(), dockX(2), -3.5, "receiver");
    person("Cleaner / Hygiene", names(), -w / 4, LANE + 1, "cleaner");
  }
  function marshalTo(dk) { const m = W.marshal; if (!m) return; m.target = dk; walk(m, [{ x: dk.x + 3.6, z: 11 }], () => { m.act = "work"; m.doing = `Guiding a truck onto Bay ${dk.i + 1}`; say(m, "Back… back… stop! ✋", "radio", 4); }); }
  function spawnDriver(k) {
    const d = person("Truck Driver", k.T.driver, k.x + 1.6, k.z + k.L / 2 - 1.8, "driver"); d.truck = k; k.driver = d; d.inCab = false;
    d.doing = `Driving ${k.T.id} · ${k.dir === "in" ? "delivering in" : "collecting"} for ${k.client ? k.client.name : ""}`;
    walk(d, [{ x: k.x + 2.4, z: 6 }, { x: -W.w / 2 - 3, z: 4 }], () => { d.act = "idle"; d.doing = `Waiting in the drivers' room while ${k.T.id} is ${k.dir === "in" ? "unloaded" : "loaded"}`; say(d, "Paperwork signed ✓", "done", 2.5); });
  }
  function aisleSpot() { const s = pick(W.slots); return { x: s.aisleX, z: s.z, row: s.row }; }
  function think(a, dt) {
    if (a.path.length || a.wait > 0) { if (a.wait > 0) a.wait -= dt; return; }
    const B = a.beh;
    if (B === "picker") {
      if (a.carry) { a.p.carry.visible = false; a.carry = false; a.p.carryHeld = false; const lane = pick(W.staging); const free = lane.pallets.find(p => !p.visible); if (free && Math.random() < .5) free.visible = true; W.stats.picked++; a.act = "work"; a.wait = rnd(1.5, 3); a.doing = `Building a pallet at Bay ${W.staging.indexOf(lane) + 1}`; return; }
      if (a.atSlot) { a.atSlot = false; a.carry = true; a.p.carry.visible = true; a.p.carryHeld = true; const lane = pick(W.staging); a.doing = `Taking the pick to Bay ${W.staging.indexOf(lane) + 1}`;
        walk(a, [{ x: a.x, z: LANE + .8 }, { x: lane.x + rnd(-1, 1), z: -3.8 }]); return; }
      const s = aisleSpot(); a.doing = `Picking ${pick(G.clients.filter(c => c.site === W.site.id)).name} order in row ${s.row + 1}`;
      walk(a, [{ x: a.x, z: LANE + .8 }, { x: s.x, z: LANE + .8 }, { x: s.x, z: s.z }], () => { a.atSlot = true; a.act = "work"; a.wait = rnd(3, 6); if (Math.random() < .25) say(a, pick(["Scan ✓", "Batch OK · FEFO ✓", "Pick 4 of 9", "Short-dated: skip ✓"]), "say", 2.2); });
    } else if (B === "loader") {
      const k = pick(W.trucks.filter(t => t.st === "docked")) ;
      if (k) { a.doing = `${k.dir === "in" ? "Unloading" : "Loading"} ${k.T.id} at Bay ${k.dock.i + 1}`; walk(a, [{ x: k.dock.x + (Math.random() < .5 ? -1.9 : 1.9), z: -1.6 }], () => { a.act = "work"; a.wait = rnd(5, 9); if (Math.random() < .3) say(a, pick(["Seal on ✓", "Load secured", k.T.reefer ? `Probe ${k.T.temp}°C ✓` : "Straps on"]), "say", 2.4); }); }
      else { a.act = "work"; a.wait = rnd(3, 5); a.doing = "Wrapping pallets in the staging lane"; }
    } else if (B === "receiver") {
      const k = pick(W.trucks.filter(t => t.st === "docked" && t.dir === "in"));
      if (k) { a.doing = `Checking ${k.T.id} against the ASN`; walk(a, [{ x: k.dock.x + 1.2, z: -.9 }], () => { a.act = "work"; a.wait = rnd(5, 8); say(a, k.T.reefer ? `Arrival temp ${k.T.temp}°C ✓` : `ASN matches · ${k.need} pallets ✓`, "done", 3); }); }
      else { a.act = "idle"; a.wait = rnd(3, 6); a.doing = "At the receiving desk"; }
    } else if (B === "supervisor") {
      const dk = pick(W.docks); a.doing = `Walking the dock line · Bay ${dk.i + 1}`;
      walk(a, [{ x: dk.x, z: LANE + 1.6 }], () => { a.act = "idle"; a.wait = rnd(2.5, 5); if (Math.random() < .45) { const k = dk.truck; say(a, k && k.st === "docked" ? `Bay ${dk.i + 1}: ${Math.max(1, Math.round((k.need - k.moves) * 3))} min to go` : pick(["Lane clear ✓", "Break rota on time", `${W.lifts.filter(l => l.st === "job").length} forklifts working`]), "radio", 3); } });
    } else if (B === "manager") {
      if (Math.random() < .55) { a.act = "sit"; a.wait = rnd(10, 18); a.doing = "In the office: today's plan and client calls"; }
      else { const dk = pick(W.docks); a.doing = `Floor walk with the supervisor at Bay ${dk.i + 1}`; walk(a, [{ x: W.office.x + 5, z: W.office.z + 1 }, { x: dk.x, z: LANE + 2 }], () => { a.act = "idle"; a.wait = 4; say(a, pick(["Good pace today 👍", "Keep the lanes clear", "Client visit at 2pm"]), "say", 2.6); a.after = 1; }); }
      if (a.after) { a.after = 0; walk(a, [{ x: W.office.x + 5, z: W.office.z + 1 }, { x: W.office.x, z: W.office.z }]); }
    } else if (B === "marshal") {
      const m = a; if (m.target && m.target.truck && m.target.truck.st === "toDock") { m.act = "work"; return; }
      m.target = null; m.act = "idle"; m.wait = rnd(3, 6); m.doing = "Watching the yard: one-way traffic, people out of truck lanes";
      if (Math.random() < .4) walk(m, [{ x: rnd(-W.w / 2, W.w / 2), z: rnd(12, 16) }]);
    } else if (B === "gate") { a.act = "idle"; a.wait = rnd(4, 8); a.doing = "Checking trucks in and out at the gate"; }
    else if (B === "cleaner") { a.doing = "Floor scrub along the main lane"; walk(a, [{ x: rnd(-W.w / 2 + 3, W.w / 2 - 3), z: LANE + rnd(-1, 1), v: .9 }], () => { a.act = "work"; a.wait = rnd(2, 4); }); }
    else if (B === "driver") {
      const k = a.truck; if (!k || k.gone) { a.gone = true; return; }
      if ((k.st === "closing") && !a.inCab && !a.returning) { a.returning = true; a.doing = `Back to ${k.T.id}`; walk(a, [{ x: k.x + 2.4, z: 6 }, { x: k.x + 1.6, z: k.z + k.L / 2 - 1.8 }], () => { a.inCab = true; a.gone = true; }); }
    }
  }
  function stepPerson(a, dt) {
    think(a, dt);
    if (a.path.length) { const p = a.path[0], dx = p.x - a.x, dz = p.z - a.z, dist = Math.hypot(dx, dz), v = p.v * dt;
      if (dist <= v) { a.x = p.x; a.z = p.z; a.path.shift(); if (!a.path.length) { a.act = a.act === "walk" ? "idle" : a.act; if (a.then) { const f = a.then; a.then = null; f(); } } }
      else { a.x += dx / dist * v; a.z += dz / dist * v; a.h += ang(a.h, Math.atan2(dx, dz)) * Math.min(1, dt * 8); a.act = "walk"; } }
    if (a.beh === "marshal" && a.act === "work" && a.target) a.h += ang(a.h, Math.atan2(a.target.x - a.x, 12 - a.z)) * Math.min(1, dt * 5);
    a.p.g.position.set(a.x, 0, a.z); a.p.g.rotation.y = a.h; pose(a.p, a.act, S.real, still);
    if (a.bubble && S.real > a.bubble.until) { a.p.g.remove(a.bubble.sp); a.bubble.sp.material.map.dispose(); a.bubble = null; }
    const camD = Math.hypot(camera.position.x - a.x, camera.position.z - a.z);
    a.tag.visible = (S.sel && S.sel.kind === "person" && S.sel.id === a.id) || (S.roleFilter ? S.roleFilter === a.role : camD < 38);
    a.p.g.visible = !S.roleFilter || S.roleFilter === a.role || a.beh === "driver" ? true : true;
  }

  /* ------------------------------------------------ camera: orbit, pan, zoom, fly to */
  const ov = { tx: 0, tz: 4, dist: 110, theta: .55, phi: .92 };
  let anim = null;
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  function fly(to, dur = 1) { const f = { ...ov }; if (still) { Object.assign(ov, to); return; } anim = { t: 0, dur, f, to }; }
  function home() { W.homeDist = W.w * 1.55 + 30; fly({ tx: 2, tz: 2, dist: W.homeDist, theta: .55, phi: .92 }, 1.1); S.follow = false; }
  const ptrs = new Map(); let down = null, pinch = null;
  const pinchState = () => { const p = [...ptrs.values()]; return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 }; };
  function pan(dx, dy) { const k = ov.dist * .0016, rx = Math.cos(ov.theta), rz = -Math.sin(ov.theta), fx = -Math.sin(ov.theta), fz = -Math.cos(ov.theta);
    ov.tx = Math.max(-120, Math.min(120, ov.tx - rx * dx * k + fx * dy * k)); ov.tz = Math.max(-90, Math.min(90, ov.tz - rz * dx * k + fz * dy * k)); S.follow = false; }
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) down = { t: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey }; else if (down) down.moved = 99; if (ptrs.size === 2) pinch = pinchState(); anim = null; });
  canvas.addEventListener("pointermove", e => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { if (down && down.pan) pan(dx, dy); else { ov.theta -= dx * .005; ov.phi = Math.max(.25, Math.min(1.42, ov.phi - dy * .004)); } }
    else if (ptrs.size === 2 && pinch) { const n = pinchState(); ov.dist = Math.max(14, Math.min(260, ov.dist * pinch.d / n.d)); pan(n.mx - pinch.mx, n.my - pinch.my); pinch = n; } });
  const endP = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size && down) { if (e.type === "pointerup" && down.moved < 8 && performance.now() - down.t < 500) doPick(e.clientX, e.clientY); down = null; } };
  canvas.addEventListener("pointerup", endP); canvas.addEventListener("pointercancel", endP); canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => { e.preventDefault(); anim = null; ov.dist = Math.max(14, Math.min(260, ov.dist * Math.exp(e.deltaY * .0011))); }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function doPick(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(W.pick, false).find(h => h.object.parent && h.object.parent.visible !== false);
    select(hit ? hit.object.userData : null, false); }
  function select(sel, flyTo = true) {
    S.sel = sel && sel.kind ? sel : null; hooks.onSelect && hooks.onSelect(S.sel);
    if (!S.sel || !flyTo) return; const o = find(S.sel); if (o) fly({ tx: o.x, tz: o.z, dist: S.sel.kind === "dock" ? 30 : 24, phi: .85, theta: ov.theta }, .9);
  }
  function find(sel) { if (!sel || !W) return null;
    if (sel.kind === "truck") { const k = W.trucks.find(t => t.T.id === sel.id); return k && { x: k.x, z: k.z, k }; }
    if (sel.kind === "lift") { const L = W.lifts.find(l => l.f.id === sel.id); return L && { x: L.x, z: L.z, L }; }
    if (sel.kind === "person") { const a = W.people.find(p => p.id === sel.id); return a && { x: a.x, z: a.z, a }; }
    if (sel.kind === "dock") { const d = W.docks[sel.id]; return d && { x: d.x, z: 6, d }; } return null; }

  /* ------------------------------------------------ loop */
  function simStep(dt) {
      W.spawnT -= dt; const onSite = W.trucks.filter(t => !t.gone && t.st !== "road" && t.st !== "leaving").length;
      if (W.spawnT <= 0) { W.spawnT = rnd(14, 26); if (onSite < W.ND + 2 && W.trucks.length < W.ND + 5) spawnTruck(false); }
      W.trucks.forEach(k => stepTruck(k, dt)); W.trucks.filter(k => k.gone).forEach(k => { W.root.remove(k.g); W.pick.splice(W.pick.indexOf(k.g.children.find(c => c.userData.kind)), 1); });
      W.trucks = W.trucks.filter(k => !k.gone);
      const gateBusy = W.trucks.some(k => k.st === "gate" || (k.st === "leaving" || k.st === "road") && Math.abs(k.x - W.gateX) < 5 && Math.abs(k.z - W.yardD) < 9) || (S.boomFor > 0); S.boomFor = Math.max(0, (S.boomFor || 0) - dt);
      W.boomUp += ((gateBusy ? 1 : 0) - W.boomUp) * Math.min(1, dt * 1.5); W.boom.rotation.z = -W.boomUp * 1.45;
      W.docks.forEach(dk => { const want = dk.state === "occupied" && dk.truck && dk.truck.st !== "leaving" ? 1 : 0; dk.open += (want - dk.open) * Math.min(1, dt * 1.6);
        dk.panel.scale.y = Math.max(.05, (1 - dk.open) * 4); dk.panel.position.y = -dk.panel.scale.y / 2; dk.lamp.material.color.set(dk.state === "free" ? "#3fb87f" : dk.state === "reserved" ? "#ffc466" : "#e66767"); });
      W.lifts.forEach(L => stepLift(L, dt));
      W.people.forEach(a => stepPerson(a, dt)); W.people.filter(a => a.gone).forEach(a => { W.root.remove(a.p.g); const i = W.pick.indexOf(a.p.hit); if (i >= 0) W.pick.splice(i, 1); if (S.sel && S.sel.id === a.id) select(null, false); }); W.people = W.people.filter(a => !a.gone);
    }

  function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.fov = r.width < r.height ? 55 : 40; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  let last = performance.now(), visible = true, raf = 0; S.real = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = Math.min(.1, (now - last) / 1000); last = now; if (!visible || document.hidden) return;
    S.real += raw; const dt = S.playing ? raw * Math.min(4, Math.max(.5, S.speed / 30)) : 0;   // movement pace follows the speed control (capped so it stays readable)
    if (S.playing) S.t += raw * S.speed;
    if (W && dt > 0) simStep(dt);
    if (anim) { anim.t += raw; const k = ease(Math.min(1, anim.t / anim.dur)); for (const key of ["tx", "tz", "dist", "theta", "phi"]) if (anim.to[key] != null) ov[key] = anim.f[key] + (anim.to[key] - anim.f[key]) * k; if (k >= 1) anim = null; }
    if (S.follow && S.sel) { const o = find(S.sel); if (o) { ov.tx += (o.x - ov.tx) * Math.min(1, raw * 3); ov.tz += (o.z - ov.tz) * Math.min(1, raw * 3); } }
    const sp = Math.sin(ov.phi); camera.position.set(ov.tx + ov.dist * sp * Math.sin(ov.theta), ov.dist * Math.cos(ov.phi) + 1, ov.tz + ov.dist * sp * Math.cos(ov.theta)); camera.lookAt(ov.tx, 0, ov.tz);
    if (W) { const hd = W.homeDist || 110, o = Math.max(0, Math.min(1, (ov.dist - hd * .55) / (hd * .3))); W.roofM.opacity = o; W.roof.visible = o > .02; W.roofM.depthWrite = o > .95; }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    S, advance(sec) { for (let k = 0; k < sec / .05; k++) { S.real += .05; S.t += .05 * S.speed; simStep(.05 * Math.min(4, Math.max(.5, S.speed / 30))); } },
    setSite(site) { build(site); home(); log(`Opened ${site.name}`); },
    select, home, zoom(f) { anim = null; ov.dist = Math.max(14, Math.min(260, ov.dist * f)); }, top() { fly({ phi: ov.phi > .5 ? .26 : .92 }, .8); },
    follow(v) { S.follow = v; }, find, roleFilter(r) { S.roleFilter = r; if (r && W) { const a = W.people.find(p => p.role === r); if (a) select({ kind: "person", id: a.id }); } },
    state() {
      if (!W) return null;
      return { site: W.site, docks: W.docks.map(d => ({ i: d.i, state: d.state, truck: d.truck && d.truck.T.id, client: d.truck && d.truck.client && d.truck.client.name, dir: d.truck && d.truck.dir, prog: d.truck ? d.truck.moves / Math.max(1, d.truck.need) : 0 })),
        trucks: W.trucks.map(k => ({ id: k.T.id, type: k.T.type, st: k.st, dir: k.dir, client: k.client && k.client.name, dock: k.dock && k.dock.i, prog: k.moves / Math.max(1, k.need), driver: k.T.driver, ship: k.ship, temp: k.T.temp, reefer: k.T.reefer, events: k.events, need: k.need, moves: k.moves, stage: k.stage })),
        lifts: W.lifts.map(L => ({ id: L.f.id, type: L.f.type, operator: L.f.operator, battery: L.f.battery, task: L.task, busy: L.st === "job" })),
        people: W.people.map(a => ({ id: a.id, name: a.name, role: a.role, doing: a.doing, act: a.act })),
        stock: W.slots.filter(s => s.filled).length, slots: W.slots.length, stats: W.stats };
    },
  };
}
