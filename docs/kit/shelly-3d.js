/* Shelly Mk-II in real 3D (three.js, vendored so the site's CSP `script-src 'self'` still holds).
   Original design: teal helmet, purple crest fin, one wide visor, spiral brow badge, side pods, antenna lights.
   mount(wrapper) adds a WebGL canvas inside .sk-btn; the SVG stays as the fallback. */
import * as THREE from "./vendor/three.module.min.js";

const CYAN = 0x63e0ff, AMBER = 0xffc466, GREEN = 0x3fb87f;

function envMap(renderer) {
  // a small studio: dark room, soft top light, teal and purple side panels → reflections on the helmet and visor
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x0a1018, side: THREE.BackSide })));
  const panel = (c, x, y, z, w, h, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  panel(0xffffff, 0, 4.8, 0, 6, 3, 0, Math.PI / 2);
  panel(0xdff6ff, 2.5, 1.5, 4.8, 3, 2.2);
  panel(0x4fc3e8, -4.8, 0.5, 1, 2, 4, Math.PI / 2);
  panel(0x9b7cff, 4.8, 0.5, -1.5, 2, 4, -Math.PI / 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture; pm.dispose();
  return tex;
}

function onSphere(r, theta, phi) {   // phi = π/2 faces the camera (+z)
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function buildHead() {
  const head = new THREE.Group();
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x3a9cc4, metalness: 0.45, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12 });
  const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x1d5470, metalness: 0.6, roughness: 0.35 });
  const purple = new THREE.MeshPhysicalMaterial({ color: 0x8f6fe0, metalness: 0.3, roughness: 0.25, clearcoat: 1, sheen: 0.4, sheenColor: 0xd9c9ff });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x04070d, metalness: 0.85, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 });
  const glow = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
  const tipMat = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });

  const dome = new THREE.Group(); dome.scale.set(1, 1.06, 0.98); head.add(dome);
  dome.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat));
  // one wide visor wrapping the front
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1.018, 64, 24, Math.PI / 2 - 1.0, 2.0, 1.33, 0.52), visorMat);
  dome.add(visor);
  // visor rims (top and bottom edge)
  for (const th of [1.33, 1.85]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.sin(th) * 1.022, 0.02, 8, 64, 2.0), darkMat);
    rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.0); rim.position.y = Math.cos(th) * 1.022; dome.add(rim);
  }

  // glowing eyes inside the visor
  const eyes = [];
  for (const d of [-0.34, 0.34]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), glow);
    const p = onSphere(1.03, 1.56, Math.PI / 2 + d); e.position.copy(p); e.lookAt(p.clone().multiplyScalar(2)); e.scale.set(1, 1, 0.35);
    dome.add(e); eyes.push(e);
  }
  // mouth: a line at rest, voice bars while talking
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), glow);
  const lp = onSphere(1.03, 1.76, Math.PI / 2); line.position.copy(lp); line.lookAt(lp.clone().multiplyScalar(2)); dome.add(line);
  const bars = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.02), glow);
    const p = onSphere(1.03, 1.76, Math.PI / 2 + (i - 2) * 0.075); b.position.copy(p); b.lookAt(p.clone().multiplyScalar(2));
    b.visible = false; dome.add(b); bars.push(b);
  }

  // spiral brow badge
  const bp = onSphere(1.0, 1.12, Math.PI / 2);
  const badge = new THREE.Group(); badge.position.copy(bp); badge.lookAt(bp.clone().multiplyScalar(2)); dome.add(badge);
  badge.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 32).rotateX(Math.PI / 2), darkMat));
  const pts = []; for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 4, r = 0.012 + k / 60 * 0.085; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.03)); }
  badge.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.011, 6), new THREE.MeshBasicMaterial({ color: 0xd9c9ff, toneMapped: false })));

  // purple crest fin running front to back over the top
  const fs = new THREE.Shape();
  fs.moveTo(0.55, 0); fs.quadraticCurveTo(0.35, 0.36, -0.15, 0.4); fs.quadraticCurveTo(-0.55, 0.36, -0.8, 0); fs.lineTo(0.55, 0);
  const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 24 });
  fg.translate(0, 0, -0.06);
  const fin = new THREE.Mesh(fg, purple); fin.rotation.y = -Math.PI / 2; fin.position.set(0, 0.9, 0.05); head.add(fin);

  // side pods with light rings, antennas with status tips
  const rings = [], tips = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.24, 40), darkMat);
    pod.rotation.z = Math.PI / 2; pod.position.set(s * 0.98, 0, 0); head.add(pod);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 40), shellMat);
    cap.rotation.z = Math.PI / 2; cap.position.set(s * 1.11, 0, 0); head.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 10, 48), glow.clone());
    ring.rotation.y = Math.PI / 2; ring.position.set(s * 1.11, 0, 0); head.add(ring); rings.push(ring);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.62, 12), darkMat);
    ant.position.set(s * 1.17, 0.42, 0); ant.rotation.z = -s * 0.36; head.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), tipMat.clone());
    tip.position.set(s * 1.28, 0.74, 0); head.add(tip); tips.push(tip);
  }

  // neck collar
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.28, 48), darkMat); neck.position.y = -1.12; head.add(neck);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.04, 12, 48), shellMat); collar.rotation.x = Math.PI / 2; collar.position.y = -1.0; head.add(collar);

  return { head, eyes, line, bars, rings, tips, glow };
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.environment = envMap(renderer);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa58bff, 3); rim.position.set(-3, 1.5, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x63e0ff, 0.8); fill.position.set(-3, -1, 3); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50); camera.position.set(0, 0.05, 6.4);
  const H = buildHead(); scene.add(H.head);

  btn.insertBefore(canvas, btn.firstChild);
  wrap.classList.add("sk-3d");
  const size = () => { const r = canvas.getBoundingClientRect(); if (r.width) { renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); } };
  size(); new ResizeObserver(size).observe(btn);

  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = 0, ty = 0, last = 0, nextBlink = 2.5, blinkUntil = 0;
  window.addEventListener("pointermove", e => {
    const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tx = Math.max(-0.75, Math.min(0.75, (e.clientX - cx) / innerWidth * 1.8));
    ty = Math.max(-0.35, Math.min(0.35, (e.clientY - cy) / innerHeight * 1.2));
    last = performance.now();
  }, { passive: true });

  const col = new THREE.Color();
  function frame(ms) {
    const t = ms / 1000, alert = wrap.classList.contains("alert"), talk = wrap.classList.contains("talk");
    // colour state: cyan normally, amber when approvals wait
    col.set(alert ? AMBER : CYAN); H.glow.color.copy(col); H.rings.forEach(r => r.material.color.copy(col));
    const pulse = alert && !still ? 0.6 + 0.4 * Math.sin(t * 4.5) : 1;
    H.tips.forEach(tp => tp.material.color.set(alert ? AMBER : GREEN).multiplyScalar(pulse));
    // motion
    const idle = performance.now() - last > 2500;
    const gy = still ? 0.35 : (idle ? Math.sin(t * 0.6) * 0.35 + 0.25 : tx + 0.15), gx = still ? 0.05 : (idle ? Math.sin(t * 0.45) * 0.06 : ty);
    H.head.rotation.y += (gy - H.head.rotation.y) * 0.08;
    H.head.rotation.x += (gx - H.head.rotation.x) * 0.08;
    H.head.position.y = still ? 0 : Math.sin(t * 1.9) * 0.05;
    if (alert && !still) H.head.rotation.z = Math.sin(t * 3) * 0.03; else H.head.rotation.z *= 0.9;
    // blink
    if (!still && t > nextBlink) { blinkUntil = t + 0.12; nextBlink = t + 3 + Math.random() * 3; }
    H.eyes.forEach(e => { e.scale.y = t < blinkUntil ? 0.12 : 1; });
    // talk
    H.line.visible = !talk; H.bars.forEach((b, i) => { b.visible = talk; b.scale.y = 0.35 + Math.abs(Math.sin(t * 16 + i * 1.3)) * 0.9; });
    renderer.render(scene, camera);
  }
  let raf = 0;
  const loop = ms => { frame(ms); raf = requestAnimationFrame(loop); };
  const go = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", go);
  go();
  return true;
}
