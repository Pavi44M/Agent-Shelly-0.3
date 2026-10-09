/* Shelly Tower · the 3D tower (module v1.3)
   One tower for the whole Shelly Group on the Auckland waterfront: a four-storey podium (lobby, the
   Neighbourhood Store flagship, events, food hall), office floors stacked above it, the business core
   and technology core at the top, and the crown with its sky garden. Every floor is a coloured band you
   can tap: it slides out like a drawer and shows who works there. Two looks: Today (2026) and the
   Shelly Business Centre in 2050: the tower twists, a living garden grows up it, satellite
   towers and sky bridges rise, garden platforms float and air taxis fly. Synthetic data from
   docs/data/tower.js. Units: metres; ground at y = 0, the tower centred on x = z = 0. */
import * as THREE from "../kit/vendor/three.module.min.js";
import { makePerson, pose } from "../store/v3/people.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch = matchMedia("(pointer: coarse)").matches;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, k) => a + (b - a) * k;

export function createTower(canvas, T, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const shadows = !touch; renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog("#f3c9a2", 520, 1500);
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 4000);
  const hemi = new THREE.HemisphereLight("#ffe9d2", "#5a6b80", 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd2a0", 2.4); sun.position.set(-160, 120, 140); scene.add(sun); scene.add(sun.target);
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -120; c.right = 120; c.top = 170; c.bottom = -60; c.near = 20; c.far = 520; sun.shadow.bias = -.0004; }
  const fill = new THREE.DirectionalLight("#9ec3ff", .55); fill.position.set(140, 60, -120); scene.add(fill);

  const MC = {}; const mat = (hex, o) => { const k = hex + JSON.stringify(o || {}); return MC[k] || (MC[k] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: .6, metalness: .05 }, o || {}))); };
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(.5, .5, 1, 20), EDGE = new THREE.EdgesGeometry(BOX);
  const INK = new THREE.LineBasicMaterial({ color: "#1b2a40", transparent: true, opacity: .35 });
  const box = (parent, w, h, d, x, y, z, m, cast = true, edge = false) => { const me = new THREE.Mesh(BOX, m); me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = cast && shadows; me.receiveShadow = shadows; parent.add(me);
    if (edge) { const e = new THREE.LineSegments(EDGE, INK); e.scale.copy(me.scale); e.position.copy(me.position); parent.add(e); } return me; };
  function textTex(draw, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function label(text, sub, col = "#2f6fd6") {
    const t = textTex((x, w, h) => { x.fillStyle = "rgba(255,255,255,.95)"; x.beginPath(); x.roundRect(3, 3, w - 6, h - 6, 16); x.fill(); x.strokeStyle = col; x.lineWidth = 6; x.stroke();
      x.fillStyle = "#0e1d33"; x.font = "800 34px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText(text, 20, sub ? 31 : h / 2);
      if (sub) { x.fillStyle = "#4b5d75"; x.font = "600 22px 'JetBrains Mono',monospace"; x.fillText(sub, 20, 68); } }, 420, sub ? 96 : 66);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(14, sub ? 3.2 : 2.2, 1); sp.renderOrder = 10; return sp;
  }

  /* ------------------------------------------------ the two skies */
  function skyTex(stops, stars) { return textTex((x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (stars) { for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .9})`; const s = Math.random() < .05 ? 2 : 1; x.fillRect(Math.random() * w, Math.random() * h * .55, s, s); }
      for (let i = 0; i < 5; i++) { const nx = Math.random() * w, ny = Math.random() * h * .35, r = rnd(60, 160), n = x.createRadialGradient(nx, ny, 0, nx, ny, r); n.addColorStop(0, pick(["rgba(255,90,210,.35)", "rgba(80,200,255,.33)", "rgba(160,110,255,.35)"])); n.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = n; x.fillRect(nx - r, ny - r, r * 2, r * 2); } } }, 1024, 512); }
  const skyGeo = new THREE.SphereGeometry(2600, 32, 16);
  const skyNow = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex([[0, "#1d2a4f"], [.3, "#4f5f98"], [.42, "#b07aa0"], [.48, "#f59a5e"], [.515, "#ffd08a"], [.56, "#d8dfe8"], [1, "#d8dfe8"]]), side: THREE.BackSide, fog: false, transparent: true, depthWrite: false }));
  const skyFut = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex([[0, "#05061a"], [.28, "#1a0f4a"], [.42, "#4a1f86"], [.48, "#b04aa8"], [.51, "#3fd0e6"], [.56, "#8fe3ee"], [1, "#8fe3ee"]], true), side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  skyFut.renderOrder = -1; skyNow.renderOrder = -2; scene.add(skyNow, skyFut);

  /* ------------------------------------------------ ground: plaza, roads, the harbour, the city */
  const root = new THREE.Group(); scene.add(root);
  const groundM = new THREE.MeshStandardMaterial({ color: "#c9cfd6", roughness: .95, transparent: true, opacity: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), groundM); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = shadows; root.add(ground);
  // the Waitematā Harbour: the waterfront runs along z ≈ 116, Wynyard Quarter on the west, finger wharves to the east
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1200), new THREE.MeshStandardMaterial({ color: "#2f8f9a", roughness: .2, metalness: .35 })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -.6, 716); root.add(sea);
  box(root, 1300, 1.2, 4, 0, -.1, 116, mat("#b9c2cc"), false);   // the waterfront edge
  ground.scale.set(1.45, .9, 1); ground.position.z = 116 - 585;
  const plaza = box(root, 120, .12, 100, 0, .06, 10, mat("#e6e1d8"), false);
  for (let i = -5; i <= 5; i++) box(root, .18, .13, 100, i * 11, .07, 10, mat("#d4cdc1"), false);
  const roadM = mat("#4f5864");
  box(root, 900, .1, 16, 0, .05, 74, roadM, false); box(root, 16, .1, 830, -78, .05, -305, roadM, false); box(root, 16, .1, 830, 78, .05, -305, roadM, false);
  for (let x = -440; x < 440; x += 10) box(root, 5, .12, .3, x, .06, 74, mat("#f4f4f4"), false);
  // promenade trees and benches
  const trees = []; for (let x = -55; x <= 55; x += 11) { trees.push([x, 52]); trees.push([x, -32]); } for (let z = -30; z <= 50; z += 10) { trees.push([-56, z]); trees.push([56, z]); }
  for (let x = -400; x < 400; x += rnd(14, 22)) if (Math.abs(x) > 90) trees.push([x, 86]);
  const tT = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .3, 2.6, 6), mat("#7a5a3a"), trees.length), tC = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 1), mat("#5fb85d"), trees.length);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  trees.forEach(([x, z], i) => { const s = rnd(.85, 1.25); tT.setMatrixAt(i, m4.compose(v3.set(x, 1.3, z), q0, s3.set(s, s, s))); tC.setMatrixAt(i, m4.compose(v3.set(x, 3.4 * s + .6, z), q0, s3.set(s, s * 1.15, s)));
    tC.setColorAt(i, new THREE.Color().setHSL(.3 + rnd(-.04, .04), .5, rnd(.38, .52))); });
  tT.castShadow = tC.castShadow = shadows; root.add(tT, tC);
  // Auckland city around it (a stylised massing model, not survey data): a grid of white blocks, the CBD towers to the
  // south-east, the Sky Tower, Albert Park and Victoria Park, the motorway, the Viaduct and the finger wharves.
  const cityTex = textTex((x, w, h) => { x.fillStyle = "#f2f4f7"; x.fillRect(0, 0, w, h); for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) { x.fillStyle = Math.random() < .2 ? "#ffe3b0" : "#c9d3de"; x.fillRect(c * 16 + 3, r * 16 + 4, 10, 9); } }, 128, 256);
  cityTex.wrapS = cityTex.wrapT = THREE.RepeatWrapping; cityTex.repeat.set(2, 3);
  const city = [], cityM = new THREE.MeshStandardMaterial({ color: "#ffffff", map: cityTex, roughness: .5, metalness: .1, emissive: "#3fd8ff", emissiveIntensity: 0 });
  const streetM = mat("#6b7480"), parkM = mat("#7cc26a"), lowM = new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: .7 });
  const SX = 62, SZ = 56, X0 = -620, X1 = 620, Z0 = -720, Z1 = 100;
  for (let x = X0; x <= X1; x += SX) if (Math.abs(x) > 100) box(root, 9, .08, Z1 - Z0, x, .04, (Z0 + Z1) / 2, streetM, false);
  for (let z = Z0; z <= -60; z += SZ) box(root, X1 - X0, .08, 9, 0, .04, z, streetM, false);
  box(root, 26, .1, 1100, -470, .05, -250, mat("#596270"), false);   // the motorway on the western edge
  const parks = [[300, -250, 120, 100, "Albert Park"], [-230, -150, 110, 80, "Victoria Park"], [-60, -560, 160, 120, "The Domain"]];
  const ptrees = [];
  parks.forEach(([x, z, w, d, n]) => { box(root, w, .14, d, x, .07, z, parkM, false); for (let k = 0; k < w * d / 140; k++) ptrees.push([x + rnd(-w / 2 + 3, w / 2 - 3), z + rnd(-d / 2 + 3, d / 2 - 3)]); });
  const pT = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 1), mat("#4f9e4a"), ptrees.length);
  ptrees.forEach(([x, z], i) => { const sc = rnd(.8, 1.4); pT.setMatrixAt(i, m4.compose(v3.set(x, 3 * sc, z), q0, s3.set(sc, sc * 1.1, sc))); pT.setColorAt(i, new THREE.Color().setHSL(.3 + rnd(-.04, .04), .48, rnd(.34, .5))); }); root.add(pT);
  const inPark = (x, z, m = 4) => parks.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 + m && Math.abs(z - pz) < d / 2 + m);
  const SKY = { x: 225, z: -175 };
  const near = (x, z) => (Math.abs(x) < 115 && z > -130) || Math.hypot(x - SKY.x, z - SKY.z) < 24 || inPark(x, z);
  const lows = [];
  for (let bx = X0; bx < X1; bx += SX) for (let bz = Z0; bz < -60 + (Math.abs(bx) > 140 ? 150 : 0); bz += SZ) {
    const cx = bx + SX / 2, cz = bz + SZ / 2; if (cz > 96) continue;
    const cbd = cx > 60 && cx < 470 && cz > -420 && cz < 40, n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) { const w = rnd(14, 24), d = rnd(14, 22), x = cx + (k % 2 ? 1 : -1) * rnd(4, 13), z = cz + (k > 1 ? 1 : -1) * rnd(4, 11);
      if (near(x, z) || z > 100) continue;
      if (cbd && Math.random() < .55) { const h = rnd(40, 150) * (1 - Math.hypot(x - 260, z + 150) / 700); const b = box(root, w, h, d, x, h / 2, z, cityM, true, true); city.push({ b, h }); }
      else lows.push([x, z, w, d, rnd(6, cbd ? 30 : 18)]); } }
  // Wynyard and Viaduct: low waterfront buildings, then the finger wharves out into the harbour
  for (let x = -300; x < 520; x += rnd(26, 40)) if (Math.abs(x) > 110) lows.push([x, rnd(92, 104), rnd(14, 22), 12, rnd(6, 16)]);
  [[170, 46, 150], [255, 40, 190], [345, 50, 170], [430, 36, 130]].forEach(([x, w, len]) => { box(root, w, 1.4, len, x, .2, 118 + len / 2, mat("#cfd6de"), false);
    for (let k = 0; k < 3; k++) lows.push([x + rnd(-w / 4, w / 4), 130 + k * len / 3.4, w * .55, len / 4.5, rnd(8, 14)]); });
  for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(BOX, mat("#ffffff")); m.scale.set(2.2, 1.6, 9); m.position.set(rnd(-60, 120), .4, rnd(132, 220)); m.rotation.y = rnd(-.3, .3); root.add(m); }   // boats in the marina
  const lowIM = new THREE.InstancedMesh(BOX, lowM, lows.length);
  lows.forEach(([x, z, w, d, h], i) => lowIM.setMatrixAt(i, m4.compose(v3.set(x, h / 2, z), q0, s3.set(w, h, d)))); lowIM.castShadow = lowIM.receiveShadow = shadows; root.add(lowIM);
  // the Sky Tower
  const skyT = new THREE.Group(); skyT.position.set(SKY.x, 0, SKY.z); root.add(skyT);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6, 190, 16), mat("#e9edf2")); shaft.position.y = 95; skyT.add(shaft);
  for (const r of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 190, 8), mat("#dfe5ee")); leg.position.set(Math.cos(r) * 7, 95, Math.sin(r) * 7); skyT.add(leg); }
  const podA = new THREE.Mesh(new THREE.CylinderGeometry(12, 9, 9, 24), mat("#f4f6f8")); podA.position.y = 194; skyT.add(podA);
  const podG = new THREE.Mesh(new THREE.CylinderGeometry(12.4, 12.4, 4, 24), new THREE.MeshStandardMaterial({ color: "#5f8fb0", metalness: .6, roughness: .2, emissive: "#ffd99a", emissiveIntensity: .1 })); podG.position.y = 192; skyT.add(podG);
  const podB = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 6, 20), mat("#f4f6f8")); podB.position.y = 216; skyT.add(podB);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.6, 2.2, 108, 10), mat("#e9edf2")); mast.position.y = 274; skyT.add(mast);
  const skyTip = new THREE.Mesh(new THREE.SphereGeometry(.9, 10, 8), new THREE.MeshBasicMaterial({ color: "#ff4d4d" })); skyTip.position.y = 329; skyT.add(skyTip);
  const placeLabels = [];
  [["Sky Tower", SKY.x, 345, SKY.z, "#e8692f"], ["Waitematā Harbour", 40, 18, 330, "#2f8f9a"], ["Viaduct Harbour", 300, 24, 260, "#2f8f9a"], ["Albert Park", 300, 30, -250, "#3fa34d"],
    ["Victoria Park", -230, 30, -150, "#3fa34d"], ["Auckland CBD", 200, 175, -330, "#2f6fd6"], ["Wynyard Quarter", -90, 40, 96, "#e8692f"]].forEach(([t, x, y, z, c]) => {
    const l = label(t, null, c); l.position.set(x, y, z); l.scale.multiplyScalar(t === "Sky Tower" || t === "Auckland CBD" ? 1.8 : 1.4); root.add(l); placeLabels.push(l); });
  // traffic
  const cars = [];
  for (let i = 0; i < 26; i++) { const g = new THREE.Group(), col = pick(["#d94a3d", "#3d7dd9", "#f4f6f8", "#2b2f36", "#e0a32e", "#2a9d8f"]);
    box(g, 1.9, .75, 4.3, 0, .55, 0, mat(col, { metalness: .4, roughness: .3 })); box(g, 1.65, .55, 2.2, 0, 1.15, -.2, mat("#1d2a38", { metalness: .5, roughness: .2 }));
    const glow = box(g, 1.6, .12, .1, 0, .2, 0, new THREE.MeshBasicMaterial({ color: "#5ff4ff", transparent: true, opacity: 0 }), false); glow.scale.set(2.2, .12, 4.6);
    const lane = i % 3, dir = i % 2 ? 1 : -1; root.add(g);
    cars.push({ g, glow, lane, dir, v: rnd(9, 14), s: lane ? rnd(-600, 90) : rnd(-500, 500) }); }

  /* ------------------------------------------------ the tower */
  const F = [], pick3 = [], TW = 34, TD = 26, PW = 62, PD = 48;
  const winTex = textTex((x, w, h) => { x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); x.fillStyle = "#b9c7d6"; for (let i = 0; i < w; i += 32) x.fillRect(i, 0, 3, h); x.fillRect(0, h - 10, w, 10); x.fillRect(0, 0, w, 4); }, 256, 64);
  winTex.wrapS = THREE.RepeatWrapping;
  const levelH = f => f.level === "G" ? 6.5 : f.order >= 1 && f.order <= 4 ? 5.2 : f.level === "R" ? 3 : f.order < 0 ? 4.2 : 4.2;
  let y = 0; const asc = [...T.floors].sort((a, b) => a.order - b.order);
  const below = asc.filter(f => f.order < 0).reverse();   // B1 then B2 going down
  let yb = 0; below.forEach(f => { const h = levelH(f); yb -= h; f._y = yb; f._h = h; });
  asc.filter(f => f.order >= 0).forEach(f => { f._y = y; f._h = levelH(f); y += f._h; });
  const topY = y;
  const kindGlass = { trade: "#ffd1f0", hospitality: "#fff0c2", "core-business": "#ffe3a3", "core-tech": "#a9e4ff", business: "#b9d3ff", new: "#e2c9ff", shared: "#c9f0dd", tenant: "#c7d6e6", available: "#cdeed9", amenity: "#ffd9b8", podium: "#ffd0b3", basement: "#a9b4c2" };
  for (const f of asc) {
    const pod = f.order >= 0 && f.order <= 4, base = f.order < 0, roof = f.level === "R";
    const w = pod || base ? PW : TW, d = pod || base ? PD : TD, h = f._h;
    const g = new THREE.Group(); g.position.set(0, f._y, 0); root.add(g);
    const inner = new THREE.Group(); g.add(inner);       // slides out when the floor is opened
    const slab = box(inner, w, .35, d, 0, .17, 0, mat(base ? "#8c96a3" : "#f4f6f9"));
    const band = box(inner, w + .25, .32, d + .25, 0, .2, 0, new THREE.MeshStandardMaterial({ color: f.colour, emissive: f.colour, emissiveIntensity: .12, roughness: .4 }), false);
    let glass = null;
    if (!roof) { const tx = winTex.clone(); tx.needsUpdate = true; tx.repeat.set(Math.round(w / 3), 1);
      const gm = new THREE.MeshStandardMaterial({ color: kindGlass[f.kind] || "#c7d6e6", map: tx, transparent: true, opacity: base ? .35 : .7, roughness: .08, metalness: .7, emissive: "#ffcf8a", emissiveIntensity: .05, depthWrite: false });
      glass = new THREE.Mesh(BOX, gm); glass.scale.set(w - .3, h - .35, d - .3); glass.position.y = .35 + (h - .35) / 2; glass.renderOrder = 2; inner.add(glass);
      const e = new THREE.LineSegments(EDGE, INK); e.scale.copy(glass.scale); e.position.copy(glass.position); inner.add(e); }
    else {   // roof: sky garden, helipad, solar canopy
      box(inner, w - 2, .6, d - 2, 0, .6, 0, mat("#7fbf6a"), false);
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, .3, 40), mat("#3b4350")); hp.position.set(-6, 1.05, 0); inner.add(hp);
      const H = textTex((x, cw, ch) => { x.clearRect(0, 0, cw, ch); x.strokeStyle = "#ffffff"; x.lineWidth = 10; x.beginPath(); x.arc(cw / 2, ch / 2, cw / 2 - 12, 0, TAU); x.stroke(); x.fillStyle = "#ffd23f"; x.font = "900 150px 'Plus Jakarta Sans',system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("H", cw / 2, ch / 2 + 8); }, 256, 256);
      const hpm = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: H, transparent: true })); hpm.rotation.x = -Math.PI / 2; hpm.position.set(-6, 1.22, 0); inner.add(hpm);
      for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), mat("#4fae55")); t.position.set(8 + (i % 3) * 3.5, 2.2, -8 + Math.floor(i / 3) * 7); inner.add(t); }
      box(inner, 12, .2, 9, 10, 4.6, 0, mat("#1d3557", { metalness: .6, roughness: .3 })); for (const sx of [5, 15]) for (const sz of [-4, 4]) box(inner, .25, 4.4, .25, sx, 2.4, sz, mat("#8995a3"));
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(.15, .5, 22, 8), mat("#c9d2dc", { metalness: .7, roughness: .25 })); sp.position.set(12, 11, 9); inner.add(sp);
      const tipM = new THREE.MeshBasicMaterial({ color: "#ff4d4d" }); const tip = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8), tipM); tip.position.set(12, 22.2, 9); inner.add(tip); }
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(w + .6, h, d + .6); hit.position.y = h / 2; g.add(hit);
    hit.userData = { level: f.level }; pick3.push(hit);
    F.push({ f, g, inner, slab, band, glass, hit, w, d, h, y: f._y, pod, base, roof, open: 0, want: 0, interior: null });
  }
  const FL = Object.fromEntries(F.map(x => [x.f.level, x]));
  F.filter(x => x.f.order >= 5).forEach((x, i) => { x.ti = i + 1; });   // twist index for 2050 (the roof turns with the top floor)
  // the core: lift and stair shaft through the middle of every floor
  const core = box(root, 9, topY - 3, 9, 0, (topY - 3) / 2, 0, mat("#7d8796", { roughness: .7 }), true); core.renderOrder = 1;
  // corner columns of the tower
  const towerFrom = F.find(x => x.f.order === 5).y;
  const cols = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) cols.push(box(root, .9, topY - towerFrom - 3, .9, sx * (TW / 2 - .2), towerFrom + (topY - towerFrom - 3) / 2, sz * (TD / 2 - .2), mat("#dfe5ee", { metalness: .4 }), true));
  // crown sign on all four faces of the top office floor
  const top = F.filter(x => !x.roof).slice(-1)[0];
  function signTex(a, b) { return textTex((x, cw, ch) => { x.fillStyle = "#0e1d33"; x.fillRect(0, 0, cw, ch); x.fillStyle = "#ffffff"; x.font = "900 92px 'Plus Jakarta Sans',system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(a, cw / 2, ch * .42);
    x.fillStyle = "#63b6d8"; x.font = "700 34px 'JetBrains Mono',monospace"; x.fillText(b, cw / 2, ch * .8); }, 1024, 192); }
  const signNow = signTex("SHELLY", "TOWER · GROUP HQ"), signFut = signTex("SHELLY", "BUSINESS CENTRE · 2050");
  const signs = [];
  [[0, TD / 2 + .3, 0], [0, -TD / 2 - .3, Math.PI], [TW / 2 + .3, 0, Math.PI / 2], [-TW / 2 - .3, 0, -Math.PI / 2]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x) ? TD - 6 : TW - 6, (Math.abs(x) ? TD - 6 : TW - 6) * .19), new THREE.MeshBasicMaterial({ map: signNow, toneMapped: false }));
    m.position.set(x, top.h / 2 + .2, z); m.rotation.y = r; top.inner.add(m); signs.push(m); });
  // podium canopy, entrance and the store front
  box(root, 26, .5, 6, 0, 6.8, PD / 2 + 3, mat("#2f6fd6", { metalness: .4, roughness: .3 }), true, true);
  const st = textTex((x, cw, ch) => { x.fillStyle = "#1f8a5b"; x.fillRect(0, 0, cw, ch); x.fillStyle = "#fff"; x.font = "800 56px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; x.fillText("Neighbourhood Store · Café · Pharmacy", 24, ch / 2); }, 1024, 96);
  const stm = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.8), new THREE.MeshBasicMaterial({ map: st })); stm.position.set(0, FL["2"].y + 3.6, PD / 2 + .2); root.add(stm);
  // external glass lifts on the east face, with cars that travel between floors
  const lifts = [];
  const stops = F.filter(x => x.f.order >= 0 && !x.roof).map(x => x.y);
  for (const z of [-5, 5]) {
    const shaft = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: "#bfe0f5", transparent: true, opacity: .22, roughness: .1, depthWrite: false })); shaft.scale.set(3.4, topY - 3, 3.4); shaft.position.set(TW / 2 + 2, (topY - 3) / 2, z); root.add(shaft); cols.push(shaft);
    const car = new THREE.Group(); box(car, 2.8, 2.9, 2.8, 0, 1.45, 0, new THREE.MeshStandardMaterial({ color: "#f2c14e", emissive: "#f2c14e", emissiveIntensity: .25, metalness: .3, roughness: .3 }), true, true); car.position.set(TW / 2 + 2, 0, z); root.add(car); cols.push(car);
    lifts.push({ car, y: pick(stops), to: pick(stops), wait: rnd(0, 3) }); }
  // facade detail modelled in Blender (blender/shelly_tower_05_web_detail.py): window frames for every
  // floor (they ride inside the floor, so they slide out and twist with it) and the aluminium fins
  const aluM = new THREE.MeshStandardMaterial({ color: "#dfe5ec", metalness: .55, roughness: .32, flatShading: true });
  loadGLB(new URL("model/shelly-tower-detail.glb", location.href).href).then(parts => {
    for (const [name, geo] of parts) {
      const me = new THREE.Mesh(geo, aluM); me.castShadow = shadows; me.name = name;
      if (name === "Fins") { me.receiveShadow = shadows; root.add(me); cols.push(me); }
      else { const x = FL[name.replace("Facade_", "")]; if (x) x.inner.add(me); }
    }
    lastM = -1;   // re-apply the current look so the fins follow it
  }).catch(e => console.warn("tower detail model not loaded", e));

  /* ------------------------------------------------ 2050: the Shelly Business Centre */
  const FUT = new THREE.Group(); root.add(FUT);
  // living garden spiralling up the tower (grows in)
  const helix = []; for (let i = 0; i <= 400; i++) { const t = i / 400, a = t * TAU * 4.2; helix.push(new THREE.Vector3(Math.cos(a) * 24, 24 + t * (topY - 26), Math.sin(a) * 20)); }
  const vineG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 600, 1.3, 10, false), vineIdx = vineG.index.count;
  const vine = new THREE.Mesh(vineG, new THREE.MeshStandardMaterial({ color: "#3fa34d", emissive: "#2aff7a", emissiveIntensity: .12, roughness: .7 })); FUT.add(vine);
  const leafPts = helix.filter((_, i) => i % 6 === 0);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 0), mat("#5cc461"), leafPts.length);
  leafPts.forEach((p, i) => leaves.setMatrixAt(i, m4.compose(v3.set(p.x * 1.05, p.y + rnd(-1, 1), p.z * 1.05), q0, s3.setScalar(rnd(.7, 1.4))))); FUT.add(leaves);
  // terraces: planters with trees on every third tower floor
  const terr = [];
  F.filter(x => x.f.order >= 6 && x.f.order % 3 === 0 && !x.roof).forEach(x => { const g = new THREE.Group(); x.inner.add(g); g.position.y = .3;
    box(g, TW + 3, .7, 2.2, 0, .35, TD / 2 + 1.1, mat("#d9d2c4")); box(g, 2.2, .7, TD + 3, -TW / 2 - 1.1, .35, 0, mat("#d9d2c4"));
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), mat("#4fae55")); t.position.set(-TW / 2 + 3 + i * 6, 1.6, TD / 2 + 1.2); g.add(t); }
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), mat("#62c06a")); t.position.set(-TW / 2 - 1.2, 1.6, -TD / 2 + 3 + i * 6.5); g.add(t); }
    g.scale.setScalar(.001); terr.push(g); });
  // satellite towers and sky bridges
  const sats = [];
  [[-92, -36, 104, "#9a7bff"], [96, -30, 118, "#43d6ff"]].forEach(([x, z, h, c]) => { const g = new THREE.Group(); g.position.set(x, 0, z); FUT.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 1, 6), new THREE.MeshStandardMaterial({ color: "#cfe3f5", metalness: .6, roughness: .15, emissive: c, emissiveIntensity: .25, transparent: true, opacity: .92 }));
    body.scale.y = h; body.position.y = h / 2; g.add(body);
    for (let k = 0; k < 9; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(11 - k * .35, .35, 6, 24), new THREE.MeshBasicMaterial({ color: c })); r.rotation.x = Math.PI / 2; r.position.y = 10 + k * h / 10; g.add(r); }
    g.scale.y = .001; sats.push({ g, x, z, h, c }); });
  const bridges = [];
  sats.forEach(s => [.45, .78].forEach(k => { const yy = topY * k, sg = Math.sign(s.x), ax = sg * (TW / 2 - 1), az = -4, bx = s.x - sg * 8, bz = s.z + 4, len = Math.hypot(bx - ax, bz - az);
    const b = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: "#e9f6ff", transparent: true, opacity: .55, roughness: .05, metalness: .4, emissive: s.c, emissiveIntensity: .35, depthWrite: false }));
    b.scale.set(.001, 3, 5); b.position.set((ax + bx) / 2, yy, (az + bz) / 2); b.rotation.y = -Math.atan2(bz - az, bx - ax); b.userData = { len }; FUT.add(b); bridges.push(b); }));
  // floating garden platforms under glass domes
  const pods = [];
  [[-52, 64, 34], [56, 82, 30], [-40, 112, -26], [44, 46, -40]].forEach(([x, yy, z], i) => { const g = new THREE.Group(); g.position.set(x, yy, z); FUT.add(g);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 4, 2.4, 24), mat("#d9e6ee", { metalness: .5, roughness: .2 })); g.add(disc);
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, .3, 24), mat("#6cc46a")); grass.position.y = 1.3; g.add(grass);
    for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), mat("#3f9d4a")); t.position.set(rnd(-5, 5), 2.6, rnd(-5, 5)); g.add(t); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8.7, 28, 14, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#bdefff", transparent: true, opacity: .22, roughness: 0, metalness: .2, depthWrite: false })); dome.position.y = 1.4; g.add(dome);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: .6 })); glow.rotation.x = Math.PI / 2; glow.position.y = -1.3; g.add(glow);
    g.scale.setScalar(.001); pods.push({ g, y: yy, ph: i * 1.7 }); });
  // holographic rings that show every business
  const ringTex = textTex((x, cw, ch) => { x.clearRect(0, 0, cw, ch); const items = T.floors.filter(f => ["business", "core-tech", "core-business", "new"].includes(f.kind));
    x.font = "800 40px 'Plus Jakarta Sans',system-ui"; x.textBaseline = "middle"; let px = 20; for (let r = 0; r < 2; r++) items.forEach(f => { x.fillStyle = f.colour; x.fillText("◆ " + f.occupant.toUpperCase(), px, ch / 2); px += x.measureText("◆ " + f.occupant.toUpperCase()).width + 60; }); }, 4096, 64);
  ringTex.wrapS = THREE.RepeatWrapping;
  const rings = [];
  [[topY * .62, 30, 1], [topY * .86, 25, -1]].forEach(([yy, r, dir]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3.2, 64, 1, true), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.y = yy; FUT.add(m); const halo = new THREE.Mesh(new THREE.TorusGeometry(r, .25, 6, 80), new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: 0 })); halo.rotation.x = Math.PI / 2; halo.position.y = yy - 1.8; FUT.add(halo); rings.push({ m, halo, dir }); });
  // air taxis and drones
  const flyers = [];
  for (let i = 0; i < 12; i++) { const g = new THREE.Group(), big = i < 7;
    if (big) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.9, 2.6, 6, 12), mat(pick(["#f4f6f8", "#2f6fd6", "#e8692f", "#1d2a38"]), { metalness: .6, roughness: .25 })); b.rotation.z = Math.PI / 2; g.add(b);
      const c = new THREE.Mesh(new THREE.SphereGeometry(.75, 12, 8), new THREE.MeshStandardMaterial({ color: "#1d2a38", metalness: .7, roughness: .1 })); c.position.set(1.2, .35, 0); g.add(c); }
    else { box(g, 1, .3, 1, 0, 0, 0, mat("#2b2f36")); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .05, 12), new THREE.MeshBasicMaterial({ color: "#9fe8f0", transparent: true, opacity: .6 })); r.position.set(sx * .8, .25, sz * .8); g.add(r); } }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(big ? .5 : .25, 8, 6), new THREE.MeshBasicMaterial({ color: "#5ff4ff" })); glow.position.set(big ? -1.9 : 0, big ? 0 : -.3, 0); g.add(glow);
    g.visible = false; FUT.add(g); flyers.push({ g, r: rnd(45, 140), y: rnd(30, topY + 20), a: rnd(0, TAU), v: rnd(.08, .2) * (Math.random() < .5 ? -1 : 1), bob: rnd(0, TAU), big }); }

  /* ------------------------------------------------ 2050 extras: world map, media screens, skyways linking the buildings on both sides, drones, flying cars */
  const F50 = new THREE.Group(); root.add(F50); F50.visible = false;
  const holoMat = tex => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  // the live world map that floats in front of the tower
  const mapTex = textTex((x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = "rgba(8,26,52,.62)"; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 28); x.fill(); x.strokeStyle = "rgba(111,247,255,.95)"; x.lineWidth = 6; x.stroke(); x.strokeStyle = "rgba(111,247,255,.5)"; x.lineWidth = 2;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.ellipse(w / 2, h / 2, w * .46, h * .44 * i / 6, 0, 0, TAU); x.stroke(); }
    for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(w / 2, h / 2, w * .46 * i / 7, h * .44, 0, 0, TAU); x.stroke(); }
    const land = [[.18, .3, .14, .13], [.27, .58, .07, .16], [.47, .3, .07, .09], [.52, .5, .09, .17], [.68, .32, .16, .15], [.82, .66, .07, .07], [.92, .78, .025, .04]];
    land.forEach(([cx, cy, rx, ry]) => { for (let k = 0; k < 420; k++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()); x.fillStyle = `rgba(80,220,255,${.35 + Math.random() * .5})`; x.fillRect(w * (cx + Math.cos(a) * rx * r), h * (cy + Math.sin(a) * ry * r), 3, 3); } });
    x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(w * .925, h * .79, 9, 0, TAU); x.fill(); x.strokeStyle = "#ffd23f"; x.lineWidth = 3; x.beginPath(); x.arc(w * .925, h * .79, 22, 0, TAU); x.stroke();
    x.fillStyle = "rgba(255,255,255,.9)"; x.font = "800 34px 'JetBrains Mono',monospace"; x.fillText("SHELLY GROUP · LIVE", 30, 50); x.font = "600 24px 'JetBrains Mono',monospace"; x.fillStyle = "#ffd23f"; x.fillText("◉ AUCKLAND HQ", w * .74, h * .93); }, 1024, 512);
  const worldMap = new THREE.Mesh(new THREE.PlaneGeometry(50, 25), new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); worldMap.renderOrder = 6; worldMap.position.set(0, topY * .5, TD / 2 + 16); F50.add(worldMap);
  const mapBeam = new THREE.Mesh(new THREE.ConeGeometry(12, 22, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); mapBeam.rotation.x = Math.PI; mapBeam.position.set(0, topY * .5 - 20, TD / 2 + 16); F50.add(mapBeam);
  // media screens on the podium corners, the plaza pylons and two neighbours
  const scr = (title, sub, c1, c2) => textTex((x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, rnd(20, 90), 0, TAU); x.fill(); }
    x.fillStyle = "#fff"; x.font = "900 54px 'Plus Jakarta Sans',system-ui"; x.textAlign = "center"; x.fillText(title, w / 2, h * .45); x.font = "600 26px 'JetBrains Mono',monospace"; x.fillText(sub, w / 2, h * .6); }, 256, 512);
  const SCR = [scr("SHELLY", "GROUP · 2050", "#2f6fd6", "#7a5cc4"), scr("STORE", "FRESH · 24/7", "#1f8a5b", "#2a9d8f"), scr("TŌTARA", "MEDICAL", "#7a5cc4", "#e85d9a"), scr("GATEWAY", "LIVE FLEET", "#2f6fd6", "#43d6ff")];
  const screens = [];
  [[-PW / 2 - .3, PD / 2 - 6, -Math.PI / 2, 0], [PW / 2 + .3, PD / 2 - 6, Math.PI / 2, 1], [-PW / 2 - .3, -PD / 2 + 6, -Math.PI / 2, 2], [PW / 2 + .3, -PD / 2 + 6, Math.PI / 2, 3]].forEach(([x, z, r, i]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshBasicMaterial({ map: SCR[i], transparent: true, opacity: 0, toneMapped: false })); m.position.set(x, 10.5, z); m.rotation.y = r; F50.add(m); screens.push(m); });
  [[-34, 46, 0], [34, 46, 1], [-46, 20, 2], [46, 20, 3]].forEach(([x, z, i]) => { const g = new THREE.Group(); g.position.set(x, 0, z); F50.add(g);
    box(g, .5, 7, .5, 0, 3.5, 0, mat("#2b2f36")); const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshBasicMaterial({ map: SCR[i], transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false })); m.position.y = 7.5; g.add(m); screens.push(m); });
  // glowing light strips up the tower corners and round the sky lobby
  const strips = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: 0, toneMapped: false })); s.scale.set(.35, topY - towerFrom - 4, .35); s.position.set(sx * (TW / 2 + .25), towerFrom + (topY - towerFrom - 4) / 2, sz * (TD / 2 + .25)); F50.add(s); strips.push(s); }
  // skyways: elevated roads behind the tower, with pods running along them, and a link bridge into the sky lobby
  const pods50 = [], sky = FL["18"] ? FL["18"].y + 1 : topY * .45;
  [[sky, -44, "#43d6ff"], [topY * .78, -58, "#9a7bff"]].forEach(([yy, z, c], j) => {
    box(F50, 560, 1.6, 8, 0, yy, z, mat("#3b4656", { metalness: .5, roughness: .3 }), true, true);
    box(F50, 560, .35, .35, 0, yy + .9, z - 3.8, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), false); box(F50, 560, .35, .35, 0, yy + .9, z + 3.8, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), false);
    box(F50, 560, .2, .2, 0, yy - .9, z, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), false);
    for (let x = -260; x <= 260; x += 65) if (Math.abs(x) > 40) box(F50, 2.2, yy, 2.2, x, yy / 2, z, mat("#8995a3", { metalness: .4 }), true);
    box(F50, 6, 3.4, Math.abs(z) - TD / 2, 0, yy + 1.4, (z - TD / 2) / 2, new THREE.MeshStandardMaterial({ color: "#e9f6ff", transparent: true, opacity: .55, emissive: c, emissiveIntensity: .3, depthWrite: false }), false);
    for (let i = 0; i < 4; i++) { const p = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 5, 6, 12), new THREE.MeshStandardMaterial({ color: "#f4f6f8", metalness: .5, roughness: .2, emissive: c, emissiveIntensity: .25 })); b.rotation.z = Math.PI / 2; b.position.y = 1.8; p.add(b); F50.add(p);
      pods50.push({ p, y: yy, z: z + (i % 2 ? 1.8 : -1.8), s: rnd(-270, 270), v: (i % 2 ? 1 : -1) * rnd(16, 24) }); } });
  // more towers on both sides: the skyways run through them, so the whole block is linked
  const outer = [];
  [[-190, -50, 96, "#43d6ff"], [190, -50, 88, "#9a7bff"], [-140, -128, 120, "#ff7ad9"], [150, -120, 108, "#43d6ff"]].forEach(([x, z, h, c]) => { const g = new THREE.Group(); g.position.set(x, 0, z); F50.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 1, 8), new THREE.MeshStandardMaterial({ color: "#d6e6f5", metalness: .55, roughness: .15, emissive: c, emissiveIntensity: .2 })); body.scale.y = h; body.position.y = h / 2; g.add(body);
    for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(13.4 - k * .5, .4, 6, 28), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); r.rotation.x = Math.PI / 2; r.position.y = 12 + k * h / 7; g.add(r); }
    const tp = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#bdefff", transparent: true, opacity: .35, roughness: 0, depthWrite: false })); tp.position.y = h; g.add(tp);
    const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), mat("#4fae55")); tr.position.y = h + 2; g.add(tr);
    g.scale.y = .001; outer.push({ g, z, x, c }); });
  // back-row towers link forward to the skyway with their own bridges
  [[-140, -128], [150, -120]].forEach(([x, z]) => [sky, topY * .78].forEach(yy => { const b = box(F50, 6, 3, Math.abs(z + 50) - 24, x, yy, (z - 50) / 2 + 6, new THREE.MeshStandardMaterial({ color: "#e9f6ff", transparent: true, opacity: .55, emissive: "#43d6ff", emissiveIntensity: .3, depthWrite: false }), false); outer.push({ bridge: b }); }));
  // drones round the tower and flying cars between the buildings
  const air50 = [];
  for (let i = 0; i < 14; i++) { const g = new THREE.Group(), car = i < 6;
    if (car) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.95, 2.8, 6, 12), mat(pick(["#f4f6f8", "#3d7dd9", "#d94a3d", "#2b2f36"]), { metalness: .6, roughness: .2 })); b.rotation.x = Math.PI / 2; g.add(b);
      const cb = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 8, 0, TAU, 0, Math.PI / 2), mat("#1d2a38", { metalness: .7, roughness: .1 })); cb.position.set(0, .45, .3); g.add(cb);
      const ul = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, 3.6), new THREE.MeshBasicMaterial({ color: "#5ff4ff", toneMapped: false })); ul.position.y = -.85; g.add(ul);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(1.4, .2, .1), new THREE.MeshBasicMaterial({ color: "#ff3b5c", toneMapped: false })); tl.position.set(0, 0, -2.4); g.add(tl); }
    else { box(g, 1.2, .35, 1.2, 0, 0, 0, mat("#2b2f36")); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(g, .9, .06, .08, sx * .55, .1, sz * .55, mat("#2b2f36"), false); const r = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .04, 12), new THREE.MeshBasicMaterial({ color: "#cfe8ff", transparent: true, opacity: .55 })); r.position.set(sx * 1, .22, sz * 1); g.add(r); }
      const lt = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), new THREE.MeshBasicMaterial({ color: "#5ff4ff" })); lt.position.y = -.3; g.add(lt); }
    g.scale.setScalar(car ? 1.9 : 1.8); F50.add(g);
    air50.push(car ? { g, car, y: rnd(26, topY * .9), z: Math.random() < .5 ? rnd(32, 70) : rnd(-110, -72), x: rnd(-300, 300), v: (Math.random() < .5 ? -1 : 1) * rnd(14, 22) } : { g, car, r: rnd(26, 55), y: rnd(20, topY + 10), a: rnd(0, TAU), v: rnd(.15, .35) * (Math.random() < .5 ? -1 : 1), bob: rnd(0, TAU) }); }

  /* ------------------------------------------------ people on the plaza */
  const people = [];
  for (let i = 0; i < (touch ? 14 : 26); i++) { const p = makePerson(THREE, { kind: "customer", seed: Math.random() }); p.g.scale.setScalar(1.35); root.add(p.g);
    const a = { p, x: rnd(-50, 50), z: rnd(30, 56), tx: 0, tz: 0, v: rnd(1.1, 1.6), wait: rnd(0, 4) }; a.tx = a.x; a.tz = a.z; people.push(a); }
  // today already: delivery drones from the rooftop hub, sidewalk robots and lockers at the entrances (from the architecture plan)
  const ddrones = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(); box(g, 1.1, .3, 1.1, 0, 0, 0, mat("#2b2f36")); box(g, .6, .5, .6, 0, -.45, 0, mat("#ffc466"));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .04, 12), new THREE.MeshBasicMaterial({ color: "#cfe8ff", transparent: true, opacity: .55 })); r.position.set(sx * .8, .2, sz * .8); g.add(r); }
    g.scale.setScalar(1.8); root.add(g); const home = { x: 8 + i * 4.5, y: topY + 2, z: 10 }; ddrones.push({ g, home, t: i * 6, dest: null }); }
  const sbots = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(); box(g, 1, .8, 1.3, 0, .55, 0, mat("#f4f6f8")); box(g, .9, .1, 1.2, 0, .98, 0, mat("#2f6fd6")); const fl = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.2, 4), mat("#ff9f1c")); fl.position.set(.35, 1.5, -.5); g.add(fl); root.add(g);
    sbots.push({ g, x: rnd(-20, 20), z: PD / 2 + 3, tx: 0, tz: 0, wait: rnd(0, 4) }); }
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) box(root, 1.1, 2.2, .7, sx * (16 + i * 1.2), 1.1, PD / 2 + 1.2, mat("#ffc466"), true);   // smart lockers
  const spots = [[0, PD / 2 + 4], [-40, 40], [40, 40], [-20, 55], [20, 55], [-48, 0], [48, 0], [0, 58]];

  /* ------------------------------------------------ a floor opens like a drawer */
  function buildInterior(x) {
    const f = x.f, g = new THREE.Group(); x.inner.add(g); g.position.y = .36;
    const w = x.w - 3, d = x.d - 3, desk = mat("#e9edf2"), chair = mat("#2b2f36"), col = f.colour;
    const tab = (px, pz, ww, dd) => box(g, ww, .72, dd, px, .36, pz, desk, false);
    const free = (px, pz) => Math.abs(px) > 6.2 || Math.abs(pz) > 6.2;   // keep clear of the core
    if (f.kind === "available") {
      const sg = label("TO LET", `${f.area_m2.toLocaleString("en-NZ")} m² · $${f.rent_m2}/m²`, "#3fb87f"); sg.position.set(0, 4.5, d / 2); sg.scale.multiplyScalar(.75); g.add(sg);
      for (let i = 0; i < 4; i++) box(g, 1, .05, 6, -w / 2 + 4 + i * 6, .03, d / 2 - 4, mat("#3fb87f", { transparent: true, opacity: .5 }), false);
    } else if (f.kind === "core-tech" && /Data/.test(f.name)) {
      const rk = new THREE.MeshStandardMaterial({ color: "#1d2a38", emissive: "#2fb7ff", emissiveIntensity: .45, metalness: .5, roughness: .3 });
      for (let r = 0; r < 5; r++) for (let k = 0; k < 9; k++) { const px = -w / 2 + 2 + k * (w - 4) / 8, pz = -d / 2 + 2.5 + r * (d - 5) / 4; if (free(px, pz)) box(g, 1.4, 2.2, .9, px, 1.1, pz, rk, false); }
    } else if (f.kind === "amenity" && /Food|Sky garden|Wellbeing/.test(f.name)) {
      for (let i = 0; i < 10; i++) { const px = rnd(-w / 2 + 2, w / 2 - 2), pz = rnd(-d / 2 + 2, d / 2 - 2); if (!free(px, pz)) continue; const t = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 1), mat("#4fae55")); t.position.set(px, 1.2, pz); g.add(t); tab(px + 1.5, pz, 1.2, 1.2); }
    } else if (f.kind === "podium" && f.level === "2") {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { const pz = -d / 2 + 5 + r * 5, px = (k ? 1 : -1) * (w / 4 + 3); box(g, 14, 1.8, 1.2, px, .9, pz, mat(pick(["#2a9d8f", "#e0a32e", "#d94a3d", "#3d7dd9"])), false); }
    } else if (f.level === "R") {   // drone pads on the roof (the vertiport is the H pad)
      for (let i = 0; i < 3; i++) { const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, .12, 24), mat("#2b2f36")); pad.position.set(8 + i * 4.5, .9, 10); g.add(pad);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, .12, 6, 24), new THREE.MeshBasicMaterial({ color: "#ffd23f" })); ring.rotation.x = Math.PI / 2; ring.position.set(8 + i * 4.5, 1, 10); g.add(ring); }
    } else if (f.kind === "trade") {   // round deal tables, a live globe and the customs desk
      for (let i = 0; i < 6; i++) { const px = -w / 2 + 4 + (i % 3) * 7, pz = (i < 3 ? -1 : 1) * (d / 2 - 4); const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, .1, 20), mat("#e9edf2")); t.position.set(px, .76, pz); g.add(t);
        box(g, .3, .72, .3, px, .36, pz, chair, false); for (let k = 0; k < 4; k++) box(g, .5, .85, .5, px + Math.cos(k * 1.57) * 2, .42, pz + Math.sin(k * 1.57) * 2, chair, false); }
      const globe = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 12), new THREE.MeshBasicMaterial({ color: "#ff7ad9", wireframe: true, transparent: true, opacity: .7 })); globe.position.set(w / 2 - 5, 2.6, 0); g.add(globe); x.holo = globe;
      box(g, 6, 1.1, 1, w / 2 - 5, .55, d / 2 - 3, mat("#ff7ad9"), false);
    } else if (f.kind === "hospitality") {   // hotel rooms: beds, partitions, a lounge by the windows
      for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { const px = -w / 2 + 2.5 + k * (w - 5) / 5, pz = (r ? 1 : -1) * (d / 2 - 3.2);
        box(g, 2, .55, 2.6, px, .28, pz, mat("#ffffff"), false); box(g, 2, .2, .5, px, .65, pz - (r ? -1 : 1) * 1.1, mat("#ffd27a"), false); box(g, .12, 2.6, 5, px + (w - 5) / 10, 1.3, pz, mat("#e3d8c4"), false); }
    } else if (f.level === "B1") {   // micro-fulfilment: a robotic storage grid with robots running on top
      const binM = mat("#9aa7b6"), bots = [];
      for (let i = -w / 2 + 4; i < w / 2 - 4; i += 1.6) for (let k = -d / 2 + 4; k < d / 2 - 4; k += 1.6) if (free(i, k)) box(g, 1.4, 2.6, 1.4, i, 1.3, k, binM, false);
      for (let i = 0; i < 8; i++) { const b = box(g, 1.3, .6, 1.3, rnd(-w / 2 + 5, w / 2 - 5), 2.9, -d / 2 + 4 + Math.floor(rnd(0, 10)) * 1.6, new THREE.MeshStandardMaterial({ color: "#2f6fd6", emissive: "#2f6fd6", emissiveIntensity: .4 }), false); bots.push({ b, v: rnd(2, 4) * (i % 2 ? 1 : -1), lim: w / 2 - 5 }); }
      x.bots = bots;
    } else if (f.level === "B2") {   // parking with robotic EV chargers
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) { const px = -w / 2 + 4 + k * (w - 8) / 8, pz = -d / 2 + 6 + r * (d - 12) / 2; if (!free(px, pz)) continue;
        box(g, 1.9, 1.1, 4.2, px, .55, pz, mat(pick(["#d94a3d", "#3d7dd9", "#f4f6f8", "#2b2f36", "#2a9d8f"]), { metalness: .4 }), false); box(g, .4, 1.4, .4, px + 1.4, .7, pz - 2, new THREE.MeshStandardMaterial({ color: "#3fb87f", emissive: "#3fb87f", emissiveIntensity: .5 }), false); }
    } else if (f.level === "B3") {   // loading dock and the battery microgrid
      for (let k = 0; k < 3; k++) { box(g, 2.5, 3.4, 10, -w / 2 + 6 + k * 5, 1.7, d / 2 - 6, mat("#f4f6f8"), false); box(g, 2.5, 2.4, 2.4, -w / 2 + 6 + k * 5, 1.2, d / 2 - .4, mat("#2f6fd6"), false); }
      for (let i = 0; i < 10; i++) box(g, 1.2, 2, 2.4, 6 + (i % 5) * 2.2, 1, -d / 2 + 4 + Math.floor(i / 5) * 4, new THREE.MeshStandardMaterial({ color: "#1d2a38", emissive: "#3fb87f", emissiveIntensity: .35 }), false);
    } else if (f.kind === "podium" && f.level === "3") {   // pop-up pods and AR try-on mirrors
      for (let i = 0; i < 6; i++) box(g, 5, 2.6, 4, -w / 2 + 6 + (i % 3) * 8, 1.3, (i < 3 ? -1 : 1) * (d / 2 - 5), new THREE.MeshStandardMaterial({ color: pick(["#ff7ad9", "#43d6ff", "#ffc466", "#7fd1a8"]), transparent: true, opacity: .45, depthWrite: false }), false);
      for (let i = 0; i < 4; i++) box(g, 1.6, 2.6, .12, w / 2 - 4 - i * 2.4, 1.3, 0, new THREE.MeshStandardMaterial({ color: "#bfefff", emissive: "#6ff7ff", emissiveIntensity: .5 }), false);
    } else if (f.level === "G") {   // lockers at the entrances and the concierge kiosk
      for (let i = 0; i < 8; i++) box(g, 1.2, 2.2, .7, -w / 2 + 3 + i * 1.3, 1.1, d / 2 - 1, mat("#ffc466"), false);
      for (let i = 0; i < 8; i++) box(g, 1.2, 2.2, .7, w / 2 - 3 - i * 1.3, 1.1, d / 2 - 1, mat("#ffc466"), false);
      box(g, 4, 1.1, 1.6, 0, .55, d / 2 - 6, mat("#2f6fd6"), false);
    } else if (/Shelly OS/.test(f.name)) {   // the operations centre: a video wall over rows of desks
      const vw = textTex((c, cw, ch) => { c.fillStyle = "#0d2240"; c.fillRect(0, 0, cw, ch); c.fillStyle = "#6ff7ff"; c.font = "800 40px 'JetBrains Mono',monospace"; c.fillText("SHELLY OS · ALL FLOORS", 24, 52);
        for (let i = 0; i < 8; i++) { c.fillStyle = ["#63b6d8", "#1f8a5b", "#2f6fd6", "#ff7ad9", "#9a7bff", "#ffc466", "#e66767", "#7fd1a8"][i]; c.fillRect(24 + i * 120, 90, 100, 40 + Math.random() * 120); } }, 1024, 300);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.1), new THREE.MeshBasicMaterial({ map: vw, toneMapped: false })); wall.position.set(0, 2.3, -d / 2 + .5); g.add(wall);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) { const px = -8 + k * 4, pz = -d / 2 + 4 + r * 2.4; if (free(px, pz)) { tab(px, pz, 3, 1); box(g, 1, .5, .05, px, 1.05, pz - .3, mat("#1d2228"), false); } }
    } else if (/boardroom/i.test(f.name)) {
      box(g, 12, .78, 4, 0, .39, d / 2 - 4.5, mat("#6b4a2f"), false);
      for (let i = 0; i < 12; i++) box(g, .55, .9, .55, -5.5 + (i % 6) * 2.2, .45, d / 2 - 4.5 + (i < 6 ? -2.6 : 2.6), chair, false);
      const holo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: .35, side: THREE.DoubleSide })); holo.position.set(0, 1.9, d / 2 - 4.5); g.add(holo); x.holo = holo;
    } else {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) { const px = -w / 2 + 3 + k * (w - 6) / 5, pz = -d / 2 + 3 + r * (d - 6) / 3; if (!free(px, pz)) continue;
        tab(px, pz, 2.6, 1.3); box(g, .7, .05, .45, px, .99, pz - .2, mat("#1d2228"), false); box(g, .55, .8, .55, px, .4, pz + 1, chair, false); }
      box(g, 6, 2.6, 4.5, w / 2 - 3.5, 1.3, -d / 2 + 2.8, new THREE.MeshStandardMaterial({ color: "#bfe0f5", transparent: true, opacity: .35, roughness: .1, depthWrite: false }), false);
      box(g, 3.2, .74, 1.6, w / 2 - 3.5, .37, -d / 2 + 2.8, mat("#6b4a2f"), false);
    }
    // the floor's colour on a feature wall + name label
    box(g, Math.min(10, w * .4), 2.6, .2, -w / 2 + 6, 1.3, -d / 2 + .4, mat(col), false);
    const n = Math.min(36, Math.round(f.here_now / (x.pod ? 2 : 1.4)));
    const P = [];
    for (let i = 0; i < n; i++) { const p = makePerson(THREE, { kind: "customer", seed: Math.random() }); p.g.scale.setScalar(.95); let px, pz; do { px = rnd(-w / 2 + 1.5, w / 2 - 1.5); pz = rnd(-d / 2 + 1.5, d / 2 - 1.5); } while (!free(px, pz));
      p.g.position.set(px, 0, pz); p.g.rotation.y = rnd(0, TAU); g.add(p.g); P.push({ p, x: px, z: pz, tx: px, tz: pz, wait: rnd(0, 6), walk: Math.random() < .35 }); }
    const lb = label(`L${f.level} · ${f.occupant}`, f.kind_label, col); lb.position.set(0, x.h + 3.5, 0); g.add(lb);
    x.interior = { g, P };
  }
  function dropInterior(x) { if (!x.interior) return; x.inner.remove(x.interior.g); x.interior.g.traverse(o => { if (o.geometry && o.geometry !== BOX) o.geometry.dispose?.(); if (o.material && o.material.map && o.isSprite) o.material.map.dispose(); }); x.interior = null; x.holo = null; x.bots = null; }

  /* ------------------------------------------------ camera: drag to orbit, wheel / pinch to zoom */
  const ov = { tx: 0, ty: topY * .42, tz: 0, dist: 300, theta: .62, phi: 1.2 };
  let anim = null, down = null, moved = 0, vel = { th: 0, ph: 0 }, zoomTo = null;
  const fly = (to, dur = 1.1) => { if (still) { Object.assign(ov, to); return; } anim = { t: 0, dur, f: { ...ov }, to }; };
  const ptrs = new Map(); let pinch0 = 0;
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY }; moved = 0; anim = null; vel = { th: 0, ph: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
  canvas.addEventListener("pointermove", e => { const p = ptrs.get(e.pointerId);
    if (!p) { hover(e); return; }
    if (ptrs.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) { ov.dist = Math.max(40, Math.min(700, ov.dist * pinch0 / d)); } pinch0 = d; moved += 5; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey || e.buttons === 2) { ov.ty = Math.max(-12, Math.min(topY + 20, ov.ty + dy * ov.dist * .002)); return; }
    vel.th = -dx * .006; vel.ph = -dy * .004; ov.theta += vel.th; ov.phi = Math.max(.25, Math.min(1.5, ov.phi + vel.ph)); });
  const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; if (down && moved < 6 && e.type === "pointerup") click(e); down = null; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => { e.preventDefault(); anim = null; zoomTo = Math.max(40, Math.min(700, (zoomTo ?? ov.dist) * (e.deltaY > 0 ? 1.12 : .89))); }, { passive: false });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitAt(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pick3, false).find(i => !String(i.object.userData.level).startsWith("B") || groundM.opacity < 1); return h ? h.object.userData.level : null; }
  let hov = null;
  function hover(e) { if (touch) return; const lv = hitAt(e); if (lv === hov) return; hov = lv; canvas.style.cursor = lv ? "pointer" : "grab"; hooks.onHover && hooks.onHover(lv); }
  function click(e) { const lv = hitAt(e); select(lv && S.sel === lv ? null : lv); }

  /* ------------------------------------------------ state, selection, era */
  const S = { sel: null, era: "now", m: 0, mTo: 0, n: 0, nTo: 0, tour: false, tourT: 0, real: 0 };
  function select(level, flyTo = true) {
    S.sel = level || null;
    F.forEach(x => { x.want = x.f.level === S.sel ? 1 : 0; });
    const x = level && FL[level];
    groundM.opacity = x && x.base ? .22 : 1; groundM.depthWrite = !(x && x.base); plaza.visible = !(x && x.base);
    if (x && flyTo) fly({ tx: canvas.clientWidth > 700 ? 14 : 0, ty: x.y + x.h / 2, tz: x.base ? 34 : 6, dist: x.pod ? 95 : x.base ? 90 : 78, phi: x.base ? .92 : 1.05, theta: ov.theta }, 1.0);
    hooks.onSelect && hooks.onSelect(S.sel);
  }
  function setEra(id) { S.era = id; S.mTo = id === "future" ? 1 : 0; S.nTo = S.mTo; if (still) { S.m = S.mTo; S.n = S.nTo; } hooks.onEra && hooks.onEra(id); }
  function home() { select(null, false); const th = .62, off = canvas.clientWidth > 700 ? 34 : 0; fly({ tx: off * Math.cos(th), ty: topY * .42, tz: -off * Math.sin(th), dist: Math.max(260, topY * 2.15), theta: th, phi: 1.18 }, 1.2); }

  /* ------------------------------------------------ the loop */
  const cBlue = new THREE.Color("#c7d6e6"), cFut = new THREE.Color("#b8fff4"), tmpC = new THREE.Color();
  function applyEra(m, n = 0) {
    const k = ease(m), q = ease(n);
    skyFut.material.opacity = k; skyNow.material.opacity = 1 - k * .999;
    scene.fog.color.set("#f3c9a2").lerp(tmpC.set("#4a3a8a"), k);
    hemi.color.set("#ffe9d2").lerp(tmpC.set("#bfe7ff"), k); hemi.groundColor.set("#5a6b80").lerp(tmpC.set("#3a2a6a"), k);
    sun.color.set("#ffd2a0").lerp(tmpC.set("#d6c2ff"), k); sun.intensity = lerp(2.4, 1.5, k); fill.intensity = lerp(.55, 1.2, k); fill.color.set("#9ec3ff").lerp(tmpC.set("#5ff4ff"), k);
    renderer.toneMappingExposure = lerp(1.05, 1.18, k);
    F.forEach(x => { if (x.ti > 0) x.g.rotation.y = k * .021 * x.ti;
      if (x.glass) { x.glass.material.emissive.set("#ffcf8a").lerp(tmpC.set("#6ff7ff"), k); x.glass.material.emissiveIntensity = (x.want ? .35 : .05) + k * .22; } });
    cols.forEach(c => { c.visible = k < .35; });   // straight columns and outside lifts give way to the twist
    core.material.color.set("#7d8796").lerp(tmpC.set("#3b3f7a"), k);
    vineG.setDrawRange(0, Math.floor(vineIdx * Math.max(0, Math.min(1, (m - .1) / .9)) / 3) * 3); vine.visible = leaves.visible = m > .02;
    leaves.scale.setScalar(Math.max(.001, k));
    terr.forEach(g => g.scale.setScalar(Math.max(.001, k, q)));
    sats.forEach(s => { s.g.scale.y = Math.max(.001, k); s.g.visible = k > .01; });
    bridges.forEach(b => { const kb = Math.max(0, (k - .65) / .35); b.scale.x = Math.max(.001, b.userData.len * kb); b.visible = kb > .01; });
    pods.forEach(p => { p.g.scale.setScalar(Math.max(.001, k)); p.g.visible = k > .01; });
    rings.forEach(r => { r.m.material.opacity = .9 * k; r.halo.material.opacity = .7 * k; r.m.visible = r.halo.visible = k > .01; });
    flyers.forEach(f => { f.g.visible = k > .5; });
    city.forEach(c => { c.b.scale.y = c.h * (1 + .6 * k); c.b.position.y = c.b.scale.y / 2; });
    cityM.emissiveIntensity = .35 * k; cityM.color.set("#a9b6c4").lerp(tmpC.set("#c9d8ff"), k);
    cars.forEach(c => { c.glow.material.opacity = .8 * k; });
    signs.forEach(s => { s.material.map = k > .5 ? signFut : signNow; });
    // 2050
    F50.visible = q > .01;
    outer.forEach(o => { if (o.g) { o.g.scale.y = Math.max(.001, q); } else o.bridge.visible = q > .7; });
    worldMap.material.opacity = .95 * q; mapBeam.material.opacity = .12 * q; screens.forEach(m => { m.material.opacity = q; }); strips.forEach(s => { s.material.opacity = .85 * q * Math.max(0, 1 - 2 * k); });
    if (q > 0) { cityM.emissiveIntensity = Math.max(cityM.emissiveIntensity, .12 * q); city.forEach(c => { c.b.scale.y = Math.max(c.b.scale.y, c.h * (1 + .3 * q)); c.b.position.y = c.b.scale.y / 2; }); }
    F.forEach(x => { if (x.glass && q > 0) x.glass.material.emissiveIntensity += .1 * q; });
    renderer.toneMappingExposure += .02 * q;
    if (q > 0 && k < .5) { scene.fog.color.lerp(tmpC.set("#d98a6a"), .5 * q); hemi.color.lerp(tmpC.set("#ffc79a"), .5 * q); hemi.groundColor.lerp(tmpC.set("#2a3550"), .6 * q); sun.color.lerp(tmpC.set("#ff9a5c"), .5 * q); fill.intensity += .5 * q; fill.color.lerp(tmpC.set("#43d6ff"), .6 * q); skyNow.material.color.set("#ffffff").lerp(tmpC.set("#c9a0b8"), .35 * q); }
    else skyNow.material.color.set("#ffffff");
  }
  let lastM = -1, lastN = -1;
  function step(dt) {
    S.real += dt;
    if (S.m !== S.mTo) { S.m += Math.sign(S.mTo - S.m) * Math.min(Math.abs(S.mTo - S.m), dt / 2.4); }
    if (S.n !== S.nTo) { S.n += Math.sign(S.nTo - S.n) * Math.min(Math.abs(S.nTo - S.n), dt / 2); }
    if (S.m !== lastM || S.n !== lastN) { applyEra(S.m, S.n); lastM = S.m; lastN = S.n; }
    const k = ease(S.m);
    // drawers
    F.forEach(x => { if (x.open !== x.want) { x.open += Math.sign(x.want - x.open) * Math.min(Math.abs(x.want - x.open), dt * 1.6);
        if (x.open > .01 && !x.interior) buildInterior(x); if (x.open <= .001 && x.interior) dropInterior(x); }
      const o = ease(x.open); x.inner.position.z = o * (x.base ? 22 : x.pod ? 10 : 16);
      if (x.glass) x.glass.material.opacity = lerp(x.base ? .35 : .7, .1, o);
      x.band.material.emissiveIntensity = (hov === x.f.level ? .9 : .12) + o * .6;
      if (x.interior) x.interior.P.forEach(a => { if (a.walk) { if (a.wait > 0) a.wait -= dt; else { const dx = a.tx - a.x, dz = a.tz - a.z, dd = Math.hypot(dx, dz);
          if (dd < .1) { a.wait = rnd(2, 6); a.tx = Math.max(-x.w / 2 + 2, Math.min(x.w / 2 - 2, a.x + rnd(-6, 6))); a.tz = Math.max(-x.d / 2 + 2, Math.min(x.d / 2 - 2, a.z + rnd(-4, 4))); if (Math.abs(a.tx) < 6.5 && Math.abs(a.tz) < 6.5) a.tx = 7 * Math.sign(a.tx || 1); }
          else { a.x += dx / dd * dt * 1.2; a.z += dz / dd * dt * 1.2; a.p.g.rotation.y = Math.atan2(dx, dz); } }
          a.p.g.position.set(a.x, 0, a.z); pose(a.p, a.wait > 0 ? "idle" : "walk", S.real, still); } else pose(a.p, "idle", S.real, still); });
      if (x.holo) x.holo.rotation.y += dt;
      if (x.bots) x.bots.forEach(b => { b.b.position.x += b.v * dt; if (Math.abs(b.b.position.x) > b.lim) { b.v *= -1; b.b.position.x = Math.sign(b.b.position.x) * b.lim; } }); });
    // lifts
    lifts.forEach(L => { if (L.wait > 0) { L.wait -= dt; return; } const d = L.to - L.y; if (Math.abs(d) < .05) { L.y = L.to; L.wait = rnd(1.5, 4); L.to = pick(stops); } else L.y += Math.sign(d) * Math.min(Math.abs(d), dt * (6 + 4 * k)); L.car.position.y = L.y; });
    // traffic (hovering a little higher in 2050)
    cars.forEach(c => { c.s += c.dir * c.v * dt; const lo = c.lane ? -700 : -560, hi = c.lane ? 100 : 560; if (c.s > hi) c.s = lo; if (c.s < lo) c.s = hi;
      if (c.lane === 0) { c.g.position.set(c.s, .1 + k * 1.2, 74 + c.dir * 3.5); c.g.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { const x = c.lane === 1 ? -78 : 78; c.g.position.set(x + c.dir * 3.5, .1 + k * 1.2, c.s); c.g.rotation.y = c.dir > 0 ? 0 : Math.PI; } });
    // drones out to the city and back; robots between the lockers and the street
    ddrones.forEach(d => { d.g.visible = k < .5; d.t -= dt; if (d.t > 0 && !d.dest) { d.g.position.set(d.home.x, d.home.y, d.home.z); return; }
      if (!d.dest) { const a = rnd(0, TAU), r = rnd(180, 420); d.dest = { x: Math.cos(a) * r, y: rnd(40, 70), z: Math.min(90, Math.sin(a) * r - 100) }; d.p = 0; d.back = false; }
      d.p += dt / 14; const e = ease(Math.min(1, d.p)), A = d.back ? d.dest : d.home, B = d.back ? d.home : d.dest;
      d.g.position.set(lerp(A.x, B.x, e), lerp(A.y, B.y, e) + Math.sin(e * Math.PI) * 30, lerp(A.z, B.z, e)); d.g.rotation.y += dt;
      if (d.p >= 1) { if (d.back) { d.dest = null; d.t = rnd(4, 10); } else { d.back = true; d.p = 0; } } });
    sbots.forEach(b => { if (b.wait > 0) { b.wait -= dt; return; } const dx = b.tx - b.x, dz = b.tz - b.z, dd = Math.hypot(dx, dz);
      if (dd < .3) { b.wait = rnd(2, 5); b.tx = pick([-18, 18, 0, -50, 50]); b.tz = b.tx === 0 ? PD / 2 + 3 : pick([PD / 2 + 3, 58]); } else { b.x += dx / dd * dt * 1.4; b.z += dz / dd * dt * 1.4; b.g.rotation.y = Math.atan2(dx, dz); } b.g.position.set(b.x, .12, b.z); });
    // plaza people
    people.forEach(a => { if (a.wait > 0) { a.wait -= dt; pose(a.p, "idle", S.real, still); } else { const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < .2) { a.wait = rnd(1, 6); const s = pick(spots); a.tx = s[0] + rnd(-6, 6); a.tz = s[1] + rnd(-3, 3); } else { a.x += dx / d * a.v * dt; a.z += dz / d * a.v * dt; a.p.g.rotation.y = Math.atan2(dx, dz); }
        pose(a.p, "walk", S.real, still); } a.p.g.position.set(a.x, .12, a.z); });
    // 2050 moves: skyway pods, drones, flying cars, the map turning
    if (S.n > .01) { const q = ease(S.n);
      pods50.forEach(p => { p.s += p.v * dt; if (p.s > 275) p.s = -275; if (p.s < -275) p.s = 275; p.p.position.set(p.s, p.y, p.z); });
      air50.forEach(a => { if (a.car) { a.x += a.v * dt; if (a.x > 320) a.x = -320; if (a.x < -320) a.x = 320; a.g.position.set(a.x, a.y + Math.sin(S.real + a.x * .02) * .6, a.z); a.g.rotation.y = a.v > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { a.a += a.v * dt; a.g.position.set(Math.cos(a.a) * a.r, a.y + Math.sin(S.real * 1.3 + a.bob) * .8, Math.sin(a.a) * a.r * .9); } });
      worldMap.material.opacity = (.85 + Math.sin(S.real * 3) * .08) * q; }
    // the future moves
    if (k > .01) { rings.forEach(r => { r.m.rotation.y += dt * .12 * r.dir; });
      pods.forEach(p => { p.g.position.y = p.y + Math.sin(S.real * .6 + p.ph) * 1.6; p.g.rotation.y += dt * .05; });
      flyers.forEach(f => { f.a += f.v * dt; f.g.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(S.real + f.bob) * 1.5, Math.sin(f.a) * f.r * .8); f.g.rotation.y = -f.a + (f.v > 0 ? 0 : Math.PI); }); }
    // auto tour: visit each Shelly floor in turn
    if (S.tour) { S.tourT -= dt; if (S.tourT <= 0) { S.tourT = 6; const L = T.floors.filter(f => !["tenant"].includes(f.kind) && f.level !== "R").map(f => f.level), i = (L.indexOf(S.sel) + 1) % L.length; select(L[i]); } }
  }
  function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.fov = r.width < r.height ? 58 : 42; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  let last = performance.now(), visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.min(.1, (now - last) / 1000); last = now; if (!visible || document.hidden) return;
    step(raw);
    if (anim) { anim.t += raw; const k = ease(Math.min(1, anim.t / anim.dur)); for (const key of ["tx", "ty", "tz", "dist", "theta", "phi"]) if (anim.to[key] != null) ov[key] = anim.f[key] + (anim.to[key] - anim.f[key]) * k; if (k >= 1) anim = null; }
    if (zoomTo != null) { ov.dist += (zoomTo - ov.dist) * Math.min(1, raw * 10); if (Math.abs(zoomTo - ov.dist) < .05) zoomTo = null; }
    if (!down && (vel.th || vel.ph)) { ov.theta += vel.th; ov.phi = Math.max(.25, Math.min(1.5, ov.phi + vel.ph)); vel.th *= .9; vel.ph *= .9; if (Math.abs(vel.th) + Math.abs(vel.ph) < 1e-4) vel.th = vel.ph = 0; }
    if (!down && !anim && !S.sel && !still) ov.theta += raw * .02;   // a slow drift when nothing is open
    const sp = Math.sin(ov.phi); camera.position.set(ov.tx + ov.dist * sp * Math.sin(ov.theta), ov.ty + ov.dist * Math.cos(ov.phi), ov.tz + ov.dist * sp * Math.cos(ov.theta)); camera.lookAt(ov.tx, ov.ty, ov.tz);
    renderer.render(scene, camera);
  }
  applyEra(0); home(); if (anim) { Object.assign(ov, anim.to); anim = null; }
  requestAnimationFrame(frame);

  return {
    S, select, setEra, home, topY,
    city() { select(null, false); fly({ tx: 120, ty: 40, tz: -180, dist: 1050, theta: .35, phi: .95 }, 1.4); },
    zoom(f) { anim = null; zoomTo = Math.max(40, Math.min(700, (zoomTo ?? ov.dist) * f)); },
    tour(on) { S.tour = on; S.tourT = 0; },
    advance(sec) { for (let i = 0; i < sec / .05; i++) step(.05); },
    _view(v) { anim = null; Object.assign(ov, v); },
  };
}

/* A tiny reader for the Blender export (.glb): mesh nodes with positions and indices only,
   which is all the facade model needs, so the page doesn't need the full GLTF loader. */
async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a GLB file");
  const jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const bin = 20 + jl + 8;
  const arr = i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = bin + (v.byteOffset || 0) + (a.byteOffset || 0),
    n = a.count * { SCALAR: 1, VEC3: 3 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    return new T(buf.slice(off, off + n * T.BYTES_PER_ELEMENT)); };
  return J.nodes.filter(n => n.mesh !== undefined).map(n => {
    const p = J.meshes[n.mesh].primitives[0], g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr(p.attributes.POSITION), 3));
    if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(arr(p.indices), 1));
    if (n.translation) g.translate(...n.translation);
    g.computeBoundingSphere(); return [n.name, g]; });
}
