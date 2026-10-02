/* Shelly in real 3D: an original chrome android head (three.js, vendored so the site's CSP `script-src 'self'` holds).
   Liquid-chrome sculpted face, glowing ear discs, panel seams and a segmented neck.
   mount(wrapper) adds a WebGL canvas inside .sk-btn; the SVG stays as the fallback. */
import * as THREE from "./vendor/three.module.min.js";

const CYAN = 0x4fe3ff, AMBER = 0xffc466;

function envMap(renderer) {
  // high-contrast studio so the chrome reads as liquid metal: black room, big white softboxes, cool blue bounce
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x5d6878, side: THREE.BackSide })));
  const panel = (c, x, y, z, w, h, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  panel(0xffffff, 0, 5.8, 0.5, 7, 3, Math.PI / 2);           // top softbox
  panel(0xf2f6ff, -3.2, 1.2, 5.8, 2.2, 5);                   // front-left strip
  panel(0xcfe6ff, 3.6, 0.4, 5.8, 1.2, 4);                    // front-right strip
  panel(0x6fa8d8, 5.8, 0, -1, 4, 6, 0, -Math.PI / 2);        // right blue bounce
  panel(0x8a96a8, -5.8, -1.5, 0, 4, 3, 0, Math.PI / 2);      // left grey
  panel(0x22272f, 0, -5.8, 0, 8, 8, Math.PI / 2);            // floor
  panel(0x0c0f14, -1, 0.5, -5.8, 5, 4);                      // dark backdrop for contrast
  panel(0xe8eef8, 0, 2.5, 5.8, 6, 1.2);                      // front top strip
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture; pm.dispose();
  return tex;
}

const g = (v, c, w) => Math.exp(-((v - c) * (v - c)) / (2 * w * w));
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// sculpt: unit-sphere direction → point on the head surface (z is the face side)
function sculpt(d) {
  let x = d.x * 0.80, y = d.y * 1.06, z = d.z * 0.94;
  const front = smooth(0.15, 0.75, d.z);
  // jaw and chin taper
  const low = smooth(-0.15, -0.95, d.y);
  x *= 1 - 0.30 * low;
  if (d.z < 0) z *= 1 - 0.25 * low;
  z += 0.10 * front * smooth(-0.45, -0.85, d.y);                 // chin forward
  // flatten temples a touch
  x *= 1 - 0.06 * g(d.y, 0.35, 0.25);
  // face features (only on the front)
  const fx = d.x, fy = d.y;
  z += front * (
      0.22 * g(fx, 0, 0.07) * g(fy, -0.12, 0.13)                  // nose
    + 0.09 * g(fy, 0.20, 0.06) * smooth(0.55, 0.2, Math.abs(fx))   // brow ridge
    - 0.10 * (g(fx, -0.27, 0.09) + g(fx, 0.27, 0.09)) * g(fy, 0.07, 0.08)   // eye sockets
    + 0.05 * (g(fx, -0.43, 0.1) + g(fx, 0.43, 0.1)) * g(fy, -0.12, 0.1)     // cheekbones
    - 0.03 * g(fx, 0, 0.2) * g(fy, -0.40, 0.025)                   // mouth line
    + 0.025 * g(fx, 0, 0.16) * g(fy, -0.45, 0.06)                  // lips
  );
  return new THREE.Vector3(x, y, z);
}

function headGeometry() {
  const geo = new THREE.SphereGeometry(1, 120, 90);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const s = sculpt(v); p.setXYZ(i, s.x, s.y, s.z); }
  geo.computeVertexNormals();
  return geo;
}

function seam(dirs, mat, r = 0.009) {
  const pts = dirs.map(d => sculpt(d.clone().normalize()).multiplyScalar(1.004));
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, r, 6), mat);
}

function buildHead() {
  const head = new THREE.Group();
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdfe7f2, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
  const darkChrome = new THREE.MeshPhysicalMaterial({ color: 0x5a6270, metalness: 1, roughness: 0.22, envMapIntensity: 1 });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, metalness: 0.4, roughness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });

  head.add(new THREE.Mesh(headGeometry(), chrome));

  // panel seams: one over the crown (off-centre), one around the face, one along the jaw
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const crown = []; for (let k = 0; k <= 40; k++) { const a = -0.15 + k / 40 * 2.6; crown.push(V(0.18, Math.sin(a), Math.cos(a))); }
  head.add(seam(crown, seamMat));
  for (const s of [-1, 1]) { const jaw = []; for (let k = 0; k <= 20; k++) { const t = k / 20; jaw.push(V(s * (0.95 - t * 0.3), -0.15 - t * 0.55, -0.2 + t * 0.55)); } head.add(seam(jaw, seamMat, 0.007)); }

  // forehead plate (the raised brow panel)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.07, 0.06, 4, 2, 2), darkChrome);
  const pp = sculpt(V(0, 0.36, 0.93).normalize()); plate.position.copy(pp).multiplyScalar(1.01); plate.lookAt(pp.clone().multiplyScalar(2)); head.add(plate);

  // eyes: glowing irises set in the sockets
  const eyes = [];
  for (const s of [-1, 1]) {
    const d = V(s * 0.27, 0.07, 0.96).normalize(), p = sculpt(d);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), darkChrome); white.position.copy(p).multiplyScalar(0.975); head.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14), glow); iris.position.copy(p).add(new THREE.Vector3(0, 0, 0.035));
    iris.lookAt(p.clone().multiplyScalar(2)); head.add(iris); eyes.push(iris);
  }
  // mouth: a thin light slit that opens while Shelly talks
  const mp = sculpt(V(0, -0.40, 0.92).normalize());
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.02), glow); mouth.position.copy(mp).multiplyScalar(1.005);
  mouth.lookAt(mp.clone().multiplyScalar(2)); head.add(mouth);

  // ear discs with a glowing ring and segmented bezel
  const rings = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.8, 0.02, -0.06); ear.rotation.y = s * Math.PI / 2; head.add(ear);
    ear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.12, 48).rotateX(Math.PI / 2), darkChrome));
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.018, 12, 64), chrome); bezel.position.z = 0.06; ear.add(bezel);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 48).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2a1622, metalness: 0.9, roughness: 0.15, clearcoat: 1 }));
    disc.position.z = 0.065; ear.add(disc);
    for (let k = 0; k < 8; k++) {   // bezel segments
      const a = k / 8 * Math.PI * 2, seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), seamMat);
      seg.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.078); seg.rotation.z = a + Math.PI / 2; ear.add(seg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 14, 64), glow.clone()); ring.position.z = 0.08; ear.add(ring); rings.push(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.04, 32).rotateX(Math.PI / 2), darkChrome); hub.position.z = 0.085; ear.add(hub);
  }

  // segmented neck
  const neck = new THREE.Group(); neck.position.set(0, -0.95, -0.12); head.add(neck);
  for (let k = 0; k < 3; k++) {
    const r = 0.36 + k * 0.05, seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.03, 0.13, 48), k % 2 ? darkChrome : chrome);
    seg.position.y = -k * 0.13; neck.add(seg);
    const gap = new THREE.Mesh(new THREE.TorusGeometry(r + 0.012, 0.012, 8, 48), seamMat); gap.rotation.x = Math.PI / 2; gap.position.y = -k * 0.13 - 0.065; neck.add(gap);
  }
  return { head, eyes, mouth, rings, glow };
}

export function mount(wrap) {
  const btn = wrap.querySelector(".sk-btn");
  const canvas = document.createElement("canvas");
  canvas.className = "sk-canvas";
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" }); }
  catch (e) { return false; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.environment = envMap(renderer);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 2.2); rim.position.set(3, 1, -3); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50); camera.position.set(0, -0.1, 6.6);
  const H = buildHead(); H.head.position.y = 0.12; scene.add(H.head);

  btn.insertBefore(canvas, btn.firstChild);
  wrap.classList.add("sk-3d");
  const size = () => { const r = canvas.getBoundingClientRect(); if (r.width) { renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); } };
  size(); new ResizeObserver(size).observe(btn);

  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = 0, ty = 0, last = 0, nextBlink = 2.5, blinkUntil = 0;
  window.addEventListener("pointermove", e => {
    const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tx = Math.max(-0.8, Math.min(0.8, (e.clientX - cx) / innerWidth * 1.8));
    ty = Math.max(-0.3, Math.min(0.35, (e.clientY - cy) / innerHeight * 1.0));
    last = performance.now();
  }, { passive: true });

  const col = new THREE.Color();
  function frame(ms) {
    const t = ms / 1000, alert = wrap.classList.contains("alert"), talk = wrap.classList.contains("talk");
    const pulse = alert && !still ? 0.65 + 0.35 * Math.sin(t * 4.5) : 1;
    col.set(alert ? AMBER : CYAN); H.glow.color.copy(col);
    H.rings.forEach(r => r.material.color.copy(col).multiplyScalar(pulse));
    // motion: three-quarter turn at rest, follows the pointer when it moves
    const idle = performance.now() - last > 2500;
    const gy = still ? 0.22 : (idle ? 0.22 + Math.sin(t * 0.5) * 0.2 : tx * 0.6 + 0.1), gx = still ? 0.12 : (idle ? 0.12 + Math.sin(t * 0.4) * 0.05 : ty);
    H.head.rotation.y += (gy - H.head.rotation.y) * 0.07;
    H.head.rotation.x += (gx - H.head.rotation.x) * 0.07;
    H.head.position.y = 0.12 + (still ? 0 : Math.sin(t * 1.7) * 0.035);
    if (!still && t > nextBlink) { blinkUntil = t + 0.12; nextBlink = t + 3 + Math.random() * 3; }
    H.eyes.forEach(e => { e.scale.y = t < blinkUntil ? 0.1 : 1; });
    H.mouth.scale.y = talk && !still ? 1 + Math.abs(Math.sin(t * 15)) * 3.5 : 1;
    renderer.render(scene, camera);
  }
  let raf = 0;
  const loop = ms => { frame(ms); raf = requestAnimationFrame(loop); };
  const go = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", go);
  go();
  return true;
}
