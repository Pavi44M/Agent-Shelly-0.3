/* Shelly the light bulb in real 3D (three.js, vendored; CSP script-src 'self').
   Refracting glass (transmission), glowing tungsten coil on support wires, threaded chrome base,
   soft halo + inner light, studio reflections. The face is drawn live onto the glass, so every
   mood from the 2D character carries over. mount(canvas, wrap, btn, L) → true when running. */
import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const WARM = new THREE.Color(1.0, 0.80, 0.42), AMBER = new THREE.Color(1.0, 0.58, 0.18),
      BRIGHT = new THREE.Color(1.0, 0.95, 0.75), GREEN = new THREE.Color(0.5, 0.9, 0.68);

function haloTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.55)"); r.addColorStop(0.6, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* face, drawn in "glass units" (glass radius = 33, origin = glass centre) — same look as the 2D Shelly */
const INK = "#24190d";
function drawFace(g, s) {
  const { t, lx, ly, blink, mood, sleepy, dizzy, talk, hungry, still, m } = s;
  function eye(x, y, kind) {
    g.save(); g.translate(x, y); g.lineCap = "round"; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.6;
    if (kind === "happy") { g.beginPath(); g.arc(0, 2, 4.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (kind === "closed") { g.beginPath(); g.arc(0, -1, 4.4, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
    else if (kind === ">" || kind === "<") { const k = kind === ">" ? 1 : -1; g.beginPath(); g.moveTo(-3.5 * k, -4); g.lineTo(3.5 * k, 0); g.lineTo(-3.5 * k, 4); g.stroke(); }
    else if (kind === "spiral") { g.rotate(t * 9); g.lineWidth = 1.8; g.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 4, r = k / 40 * 5.2; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(0, 0); } g.stroke(); }
    else { const big = kind === "big" ? 1.22 : 1;
      g.beginPath(); g.ellipse(lx * 2.4, ly * 2.2, 4.2 * big, 5.6 * big * blink, 0, 0, Math.PI * 2); g.fill();
      if (blink > 0.5) { g.fillStyle = "#fff"; g.beginPath(); g.arc(lx * 2.4 + 1.5, ly * 2.2 - 2.1 * big, 1.45 * big, 0, 7); g.fill();
        g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.arc(lx * 2.4 - 1.2, ly * 2.2 + 2.2 * big, 0.7 * big, 0, 7); g.fill(); } }
    g.restore();
  }
  let le = "dot", re = "dot";
  if (sleepy) le = re = "closed"; else if (dizzy) le = re = "spiral";
  else if (mood === "happy" || mood === "gulp") le = re = "happy";
  else if (mood === "annoyed") { le = ">"; re = "<"; }
  else if (mood === "alert" || hungry) le = re = "big";
  else if (mood === "wink") re = "happy";
  eye(-10, -3, le); eye(10, -3, re);
  g.fillStyle = `rgba(255,110,130,${mood === "happy" || mood === "gulp" ? 0.5 : 0.3})`;
  [[-17, 6], [17, 6]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, mood === "gulp" ? 5.5 : 4, mood === "gulp" ? 4 : 2.6, 0, 0, 7); g.fill(); });
  g.save(); g.translate(lx * 1.5, 8 + ly * 1.2); g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.4; g.lineCap = "round";
  if (sleepy) { g.beginPath(); g.ellipse(0, 1, 2.2, 1.6 + (still ? 0 : Math.abs(Math.sin(t * 1.2))), 0, 0, 7); g.fill(); }
  else if (dizzy || mood === "annoyed") { g.beginPath(); for (let q = -6; q <= 6; q++) g[q === -6 ? "moveTo" : "lineTo"](q, Math.sin(q * 1.3 + t * (dizzy ? 10 : 0)) * 1.4); g.stroke(); }
  else if (hungry) { g.beginPath(); g.ellipse(0, 1, 6, 5, 0, 0, 7); g.fill(); }
  else if (mood === "gulp") { g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.stroke(); }
  else if (mood === "alert") { g.beginPath(); g.ellipse(0, 1, 2.6, 3, 0, 0, 7); g.fill(); }
  else if (talk && !still) {   // live lip-sync: the shape comes from the word being spoken right now
    const o = m ? m.open : Math.abs(Math.sin(t * 13)) * .7, rd = m ? m.round : 0, wd = m ? m.wide : .5;
    const w = Math.max(1.3, 3.4 + wd * 1.8 - rd * 1.9), h = .45 + o * 4.6;
    g.beginPath(); g.ellipse(0, 1 + o * .6, w, h, 0, 0, 7); g.fill();
    if (o > .35) { g.fillStyle = "#ff8fa3"; g.beginPath(); g.ellipse(0, 1 + o * .6 + h * .45, w * .55, h * .35, 0, 0, 7); g.fill();   // tongue
      g.fillStyle = "#fff"; g.fillRect(-w * .55, 1 + o * .6 - h + .2, w * 1.1, Math.min(1.1, h * .3)); }                        // top teeth
  }
  else if (mood === "happy") { g.beginPath(); g.arc(0, -1, 6.2, 0.05 * Math.PI, 0.95 * Math.PI); g.closePath(); g.fill();
    g.fillStyle = "#ff8fa3"; g.beginPath(); g.ellipse(0, 3.2, 2.6, 1.4, 0, 0, 7); g.fill(); }
  else { g.beginPath(); g.arc(0, -2.5, 5, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke(); }
  g.restore();
}

export function mount(cv, wrap, btn, L) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: "high-performance", premultipliedAlpha: true }); }
  catch (e) { return false; }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return false; }
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-2.5, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 1.2); rim.position.set(3, 1.5, -3); scene.add(rim);

  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); cam.position.set(0, 0.05, 9.4); cam.lookAt(0, -0.32, 0);
  const rig = new THREE.Group(); scene.add(rig);          // turns toward the cursor
  const bulbG = new THREE.Group(); rig.add(bulbG); bulbG.position.y = -0.25;

  /* glass: lathe profile (round globe → neck) */
  const prof = [];
  for (let k = 0; k <= 40; k++) { const a = Math.PI / 2 - k / 40 * (Math.PI / 2 + 0.95); prof.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a)), 0.25 + Math.sin(a))); }
  const end = prof[prof.length - 1];
  for (let k = 1; k <= 14; k++) { const f = k / 14, e = f * f * (3 - 2 * f); prof.push(new THREE.Vector2(end.x + (0.47 - end.x) * e, end.y + (-1.12 - end.y) * f)); }
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, thickness: 0.35, roughness: 0.04, ior: 1.5, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, attenuationColor: new THREE.Color(1, 0.93, 0.8), attenuationDistance: 3,
    emissive: WARM.clone(), emissiveIntensity: 0.3, transparent: true, envMapIntensity: 1.3, side: THREE.FrontSide,
  });
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), glassMat); bulbG.add(glass);

  /* inner stem, support wires and coiled filament */
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 1, roughness: 0.3 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, 0.75, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, transmission: 0.9, roughness: 0.1, thickness: 0.1, transparent: true }));
  stem.position.y = -0.72; bulbG.add(stem);
  const wire = pts => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.014, 6), wireMat);
  bulbG.add(wire([new THREE.Vector3(-0.05, -0.5, 0), new THREE.Vector3(-0.2, -0.1, 0), new THREE.Vector3(-0.28, 0.12, 0)]));
  bulbG.add(wire([new THREE.Vector3(0.05, -0.5, 0), new THREE.Vector3(0.2, -0.1, 0), new THREE.Vector3(0.28, 0.12, 0)]));
  const coilPts = []; for (let k = 0; k <= 160; k++) { const f = k / 160, a = f * Math.PI * 2 * 9; coilPts.push(new THREE.Vector3(-0.28 + f * 0.56, 0.12 + Math.sin(f * Math.PI) * 0.1 + Math.sin(a) * 0.04, Math.cos(a) * 0.04)); }
  const coilMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 400, 0.011, 6), coilMat); bulbG.add(coil);

  /* threaded chrome base + contact */
  const thr = []; for (let k = 0; k <= 120; k++) { const f = k / 120, y = -1.1 - f * 0.62; thr.push(new THREE.Vector2(0.47 + Math.sin(f * Math.PI * 2 * 3.5) * 0.035 - f * 0.03, y)); }
  thr.push(new THREE.Vector2(0.3, -1.78));
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.18, clearcoat: 0.6, envMapIntensity: 1.4 });
  bulbG.add(new THREE.Mesh(new THREE.LatheGeometry(thr, 72), metal));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.025, 12, 72), metal); ring.rotation.x = Math.PI / 2; ring.position.y = -1.1; bulbG.add(ring);
  const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 })); ins.position.y = -1.83; bulbG.add(ins);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal); tip.position.y = -1.86; bulbG.add(tip);

  /* face decal on the front of the globe (drawn live) */
  const FW = 640, FH = 462, fc = document.createElement("canvas"); fc.width = FW; fc.height = FH; const fg = fc.getContext("2d");
  const faceTex = new THREE.CanvasTexture(fc); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 8;
  const PH0 = Math.PI / 2 - 0.9, PHL = 1.8, TH0 = 0.75, THL = 1.3;
  const faceGeo = new THREE.SphereGeometry(1.006, 96, 64, PH0, PHL, TH0, THL); faceGeo.translate(0, 0.25, 0);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false, envMapIntensity: 0.4 });
  const face = new THREE.Mesh(faceGeo, faceMat); face.renderOrder = 2; bulbG.add(face);
  const pxPerUnit = (FW / PHL) / 33;                 // 1 glass unit = 1/33 rad
  const fcx = FW * (1 - 0.5), fcy = FH * ((Math.PI / 2 - TH0) / THL);  // glass centre (phi = π/2 → middle; theta = π/2)

  /* halo + inner light */
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: WARM.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.set(6.4, 6.4, 1); halo.position.set(0, 0.15, -1.2); rig.add(halo);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.material.map, color: WARM.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  core.scale.set(2.2, 2.2, 1); core.position.set(0, 0.0, 0); bulbG.add(core);
  const inner = new THREE.PointLight(0xffd27a, 4, 6, 1.6); inner.position.set(0, 0.0, 0.2); bulbG.add(inner);

  /* VFX: light rays behind her, rings of sound when she speaks, motes of light drifting round the glass */
  const raysTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); g.translate(128, 128);
    for (let k = 0; k < 18; k++) { g.rotate(Math.PI * 2 / 18); const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, -7 - (k % 3) * 3); g.lineTo(128, 7 + (k % 3) * 3); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTex, color: WARM.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  rays.scale.set(4.4, 4.4, 1); rays.position.set(0, 0.15, -1.4); rig.add(rays);
  const ringTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.strokeStyle = "#fff"; g.lineWidth = 5; g.shadowColor = "#fff"; g.shadowBlur = 10; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const waves = [0, 1, 2].map(i => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: WARM.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.position.set(0, 0.2, -0.6); rig.add(sp); return { sp, ph: i / 3 }; });
  const NM = 26, mp = new Float32Array(NM * 3), motes = [];
  for (let i = 0; i < NM; i++) motes.push({ a: Math.random() * 6.28, r: 1.25 + Math.random() * .7, y: -1 + Math.random() * 2.4, v: .2 + Math.random() * .35, s: Math.random() * 6.28 });
  const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const moteM = new THREE.PointsMaterial({ map: halo0(), color: WARM.clone(), size: .22, transparent: true, opacity: .0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const motesP = new THREE.Points(mg, moteM); rig.add(motesP);
  function halo0() { return haloTex(); }
  let energy = 0;

  /* state */
  let lx = 0, ly = 0, tx = 0, ty = 0, rx = 0, ry = 0, light = 0.8, blinkAt = 2200, blinkEnd = 0, last = 0;
  addEventListener("pointermove", e => { const r = btn.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 260)); ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 260)); }, { passive: true });
  const col = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1); let faceKey = "";

  let quality = 1.25;   // supersampling factor; drops automatically on slow devices
  function size() {
    const css = (btn.clientWidth || 64) * 1.5, dpr = Math.min(window.devicePixelRatio || 1, 3) * quality;   // supersampled for crisp edges
    renderer.setPixelRatio(dpr); renderer.setSize(css, css, false); cam.aspect = 1; cam.updateProjectionMatrix();
  }
  size(); new ResizeObserver(size).observe(btn);
  wrap.classList.add("sk-3d");

  // adaptive quality: watch the frame rate for a few seconds; lower resolution, then hand back to the 2D bulb if needed
  let probeStart = 0, probeN = 0, stage = 0;
  function probe(now) {
    if (stage > 1) return;
    if (!probeStart) { probeStart = now; probeN = 0; return; }
    probeN++;
    if (now - probeStart < 2500) return;
    const fps = probeN / ((now - probeStart) / 1000); probeStart = 0;
    if (fps >= 40) { stage = 2; return; }
    if (stage === 0) { stage = 1; quality = 0.75; size(); return; }
    if (fps < 24 && !/[?&]bulb=3d/.test(location.search)) { stage = 3; cancelAnimationFrame(raf); wrap.classList.remove("sk-3d"); cv.hidden = true; renderer.dispose(); }
    else stage = 2;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { probeStart = 0; return; }
    probe(now); if (stage === 3) return;
    const t = now / 1000, dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    lx += (tx - lx) * Math.min(1, dt * 8); ly += (ty - ly) * Math.min(1, dt * 8);
    const cls = wrap.classList, mood = L.mood(), sleepy = cls.contains("sleepy"), dizzy = cls.contains("dizzy"), talk = cls.contains("talk");
    const alert = cls.contains("alert"), hungry = cls.contains("hungry");
    // light level + colour = status
    let want = 0.8 + (still ? 0 : Math.sin(t * 2.2) * 0.05); col.copy(WARM);
    if (alert) { col.copy(AMBER); want = 0.72 + (still ? 0.1 : 0.25 * (0.5 + 0.5 * Math.sin(t * 4))); }
    const V = window.ShellyVoice, M = V && V.speaking ? V.mouth() : null;
    energy += ((M ? M.energy : talk ? .5 : 0) - energy) * Math.min(1, dt * 10);
    if (talk) want = Math.max(want, 1.0) + (still ? 0 : energy * .55);
    if (mood === "happy") { col.copy(BRIGHT); want = 1.5; }
    if (hungry) { col.copy(GREEN); want = 1.05; }
    if (dizzy) want = still ? 0.6 : (Math.random() < 0.2 ? 0.15 : 1.0);
    if (sleepy) want = 0.0;
    light += (want - light) * Math.min(1, dt * (dizzy ? 30 : 6));
    const Lv = Math.max(0, light);
    glassMat.emissive.copy(col); glassMat.emissiveIntensity = 0.05 + 1.1 * Lv;
    glassMat.color.setRGB(1, 1, 1).lerp(col, Math.min(0.65, 0.5 * Lv)); glassMat.attenuationColor.copy(col).lerp(WHITE, 0.5);
    coilMat.color.copy(col).lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(0.35 + 1.4 * Lv);
    halo.material.color.copy(col); halo.material.opacity = 0.8 * Math.min(1.3, Lv);
    core.material.color.copy(col); core.material.opacity = 0.75 * Math.min(1.3, Lv);
    inner.color.copy(col); inner.intensity = 0.4 + 7 * Lv;
    // VFX: rays breathe with the light, sound rings ripple out while she speaks, motes drift up round the glass
    const e2 = still ? 0 : energy;
    rays.material.color.copy(col); rays.material.opacity = Math.min(.55, .12 * Lv + e2 * .45); rays.material.rotation = still ? 0 : t * .15; rays.scale.setScalar(4.4 + e2 * 1.1);
    waves.forEach(w => { const f = ((t * .9 + w.ph) % 1); w.sp.material.color.copy(col); w.sp.material.opacity = talk && !still ? (1 - f) * .55 * Math.min(1, .3 + e2) : Math.max(0, w.sp.material.opacity - dt * 2); w.sp.scale.setScalar(2.2 + f * 2.9); });
    motes.forEach((q, i) => { q.a += dt * q.v * (1 + e2 * 2); q.y += dt * (.15 + e2 * .5); if (q.y > 1.6) q.y = -1.1;
      mp[i * 3] = Math.cos(q.a) * q.r; mp[i * 3 + 1] = q.y + Math.sin(t * 2 + q.s) * .05; mp[i * 3 + 2] = Math.sin(q.a) * q.r * .6; });
    mg.attributes.position.needsUpdate = true; moteM.color.copy(col); moteM.opacity = still ? 0 : Math.min(.9, (mood === "happy" ? .8 : .25) * Lv + e2 * .6); moteM.size = .16 + e2 * .14;
    coilMat.color.multiplyScalar(1 + (still ? 0 : (Math.random() - .5) * .08 * Lv + e2 * .6));   // tungsten flicker, brighter as she speaks
    // turn toward the cursor (with a gentle idle sway)
    const gy = still ? 0.2 : lx * 0.45 + Math.sin(t * 0.6) * 0.08, gx = still ? 0.05 : ly * 0.22 + Math.sin(t * 0.45) * 0.03;
    ry += (gy - ry) * Math.min(1, dt * 5); rx += (gx - rx) * Math.min(1, dt * 5);
    rig.rotation.set(rx + (M && !still ? M.open * .06 : 0), ry, dizzy && !still ? Math.sin(t * 11) * 0.12 : (M && !still ? Math.sin(t * 3.1) * .04 * energy : 0));
    // face
    if (!still && now > blinkAt) { blinkEnd = now + 130; blinkAt = now + 2600 + Math.random() * 3200; }
    // redraw the face only when it changes (animated faces redraw every frame)
    const blink = now < blinkEnd ? 0.12 : 1, anim = !still && (dizzy || talk || sleepy || !!M);
    const key = [Math.round(lx * 40), Math.round(ly * 40), blink, mood, sleepy, dizzy, talk, hungry].join("|");
    if (anim || key !== faceKey) {
      faceKey = key;
      fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, FW, FH);
      fg.setTransform(pxPerUnit, 0, 0, pxPerUnit, fcx, fcy);
      drawFace(fg, { t, lx: lx * 0.6, ly: ly * 0.6, blink, mood, sleepy, dizzy, talk: talk || !!M, hungry, still, m: M });
      faceTex.needsUpdate = true;
    }
    renderer.render(scene, cam);
  }
  let raf = requestAnimationFrame(frame);
  return true;
}
