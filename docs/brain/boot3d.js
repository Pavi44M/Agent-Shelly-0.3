/* Shelly Brain boot in 3D (three.js, vendored): a brain made of light you can look into.
   ~9,000 glowing points fly in from deep space and assemble into a volumetric brain (two folded
   hemispheres with the fissure between them, cerebellum, brain stem); synapse threads link them and
   impulses race through; the eight departments orbit in their colours, ignite one by one and fire
   beams into the brain; the camera drifts and follows your pointer (or the phone's tilt) for depth
   and parallax; star dust, a holographic scan plane, light rings and a core spark with a shockwave
   when the brain wakes. API: brainBoot3D(canvas, departments) -> { progress(v), ignite(), stop() } */
import * as THREE from "../kit/vendor/three.module.min.js";
import { BRAIN_POINTS } from "./brain-points.js";   // sculpted in Blender (blender/shelly_brain_points.py)

const VS = `
  attribute vec3 start; attribute float seed; attribute vec3 col;
  uniform float uT, uAsm, uWake, uPx, uFlash;
  varying vec3 vCol; varying float vA;
  void main() {
    float d = fract(seed * 7.13) * .45;
    float k = clamp((uAsm - d) / (1. - d), 0., 1.); k = 1. - pow(1. - k, 3.);
    vec3 p = mix(start, position, k);
    p += normal * sin(uT * 1.7 + seed * 40.) * .012 * k;                 // the brain breathes
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    float tw = .65 + .35 * sin(uT * 3. + seed * 60.);
    vA = ((.25 + .75 * k) * (.35 + .65 * uWake) * tw + uFlash * .6) * .6;
    vCol = col * (1. + uFlash * 1.5);
    gl_PointSize = uPx * (1.1 + 1.6 * fract(seed * 3.7)) * (1. + uFlash) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FS = `
  varying vec3 vCol; varying float vA;
  void main() { vec2 c = gl_PointCoord - .5; float r = length(c); if (r > .5) discard;
    float a = smoothstep(.5, 0., r); a = a * a * vA; gl_FragColor = vec4(vCol * (1. + 2. * smoothstep(.18, 0., r)), a); }`;

function glowTex(inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(.2, "rgba(255,255,255,.55)"); r.addColorStop(.55, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.strokeStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 16; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function brainBoot3D(cv, deps) {
  let R;
  try { R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (e) { return null; }
  if (!R.capabilities.isWebGL2) { R.dispose(); return null; }
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, small = innerWidth < 700;
  R.setClearColor(0, 0); R.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2("#070b12", .035);
  const cam = new THREE.PerspectiveCamera(42, 1, .1, 200); cam.position.set(0, .4, 9.5);
  const world = new THREE.Group(); scene.add(world);
  const brain = new THREE.Group(); world.add(brain);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---- the brain: points on folded surfaces + a little inner volume */
  const BP = BRAIN_POINTS, b64 = q => Uint8Array.from(atob(q), c => c.charCodeAt(0)).buffer;
  const BPp = new Int16Array(b64(BP.p)), BPn = new Int8Array(b64(BP.nrm)), BPd = new Uint8Array(b64(BP.d)), BPk = new Uint8Array(b64(BP.k));
  const step = small ? 2 : 1, N = Math.floor(BP.n / step);
  const pos = new Float32Array(N * 3), st = new Float32Array(N * 3), nor = new Float32Array(N * 3), sd = new Float32Array(N), cl = new Float32Array(N * 3);
  const C = [new THREE.Color("#63b6d8"), new THREE.Color("#b69cf2"), new THREE.Color("#7fd1a8"), new THREE.Color("#9fe3ff")], tmp = new THREE.Vector3(), cc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const j = i * step; for (let c = 0; c < 3; c++) { pos[i * 3 + c] = BPp[j * 3 + c] / 8000; nor[i * 3 + c] = BPn[j * 3 + c] / 127; }
    pos[i * 3 + 1] += .1;
    tmp.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(9, 26)); st.set([tmp.x, tmp.y, tmp.z - 6], i * 3);
    sd[i] = Math.random();
    const part = BPk[j], depth = BPd[j] / 200;   // gyri bright, sulci dim
    cc.copy(part === 0 ? C[Math.random() < .5 ? 0 : (Math.random() < .5 ? 1 : 3)] : part === 1 ? C[1] : C[2]).multiplyScalar(.32 + .85 * Math.min(1, depth));
    cl.set([cc.r, cc.g, cc.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("start", new THREE.BufferAttribute(st, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(sd, 1)); g.setAttribute("col", new THREE.BufferAttribute(cl, 3));
  const U = { uT: { value: 0 }, uAsm: { value: still ? 1 : 0 }, uWake: { value: 0 }, uPx: { value: 22 }, uFlash: { value: 0 } };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; brain.add(pts);

  /* ---- synapse threads between near neighbours (sampled) + impulses racing along them */
  const L = [], M = small ? 900 : 1600;
  for (let n = 0; n < M; n++) { const i = Math.floor(Math.random() * N); let best = -1, bd = 1e9;
    for (let s = 0; s < 40; s++) { const j = Math.floor(Math.random() * N); if (j === i) continue; const d = (pos[i * 3] - pos[j * 3]) ** 2 + (pos[i * 3 + 1] - pos[j * 3 + 1]) ** 2 + (pos[i * 3 + 2] - pos[j * 3 + 2]) ** 2; if (d < bd) { bd = d; best = j; } }
    if (best >= 0 && bd < .25) L.push(i, best); }
  const lp = new Float32Array(L.length * 3); L.forEach((i, k) => lp.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], k * 3));
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
  const linkM = new THREE.LineBasicMaterial({ color: "#7cc8ec", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  brain.add(new THREE.LineSegments(lg, linkM));
  const NP = 140, pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), imp = [];
  for (let i = 0; i < NP; i++) imp.push({ e: Math.floor(Math.random() * (L.length / 2)), f: Math.random(), v: rnd(.6, 1.6) });
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
  const impM = new THREE.PointsMaterial({ size: .16, map: glowTex(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const impP = new THREE.Points(pg, impM); impP.frustumCulled = false; brain.add(impP);

  /* ---- star dust for depth, a holographic scan plane, an inner core glow */
  const SD = 1400, sp = new Float32Array(SD * 3); for (let i = 0; i < SD; i++) sp.set([rnd(-40, 40), rnd(-24, 24), rnd(-60, 4)], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const dust = new THREE.Points(sg, new THREE.PointsMaterial({ size: .09, color: "#8fb8dd", transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex() })); scene.add(dust);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(6.4, .05), new THREE.MeshBasicMaterial({ color: "#6ff7ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scan.rotation.x = -Math.PI / 2; const scanG = new THREE.Group(); scanG.add(scan); brain.add(scanG);
  const scanSheet = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ color: "#3fb8ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  scanSheet.rotation.x = -Math.PI / 2; scanG.add(scanSheet);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: "#ffe9a8", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); core.scale.setScalar(2); brain.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: "#3f8fd8", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(11, 8, 1); halo.position.z = -1.5; brain.add(halo);
  const RT = ringTex(), rings = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: RT, color: ["#63b6d8", "#b69cf2", "#ffe9a8"][i], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2 + .25 * (i - 1); world.add(m); return m; });

  /* ---- the departments: glowing orbs on a tilted orbit, labels as HTML, beams into the brain */
  const host = cv.parentElement; host.style.position = host.style.position || "relative";
  const orbit = new THREE.Group(); orbit.rotation.set(.32, 0, -.12); world.add(orbit);
  const GT = glowTex();
  const D = deps.map((d, i) => {
    const a = i / deps.length * Math.PI * 2, o = new THREE.Group(); o.position.set(Math.cos(a) * 4.1, Math.sin(a * 2) * .25, Math.sin(a) * 3.0); orbit.add(o);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.13, 20, 14), new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: .35 })); o.add(orb);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: GT, color: d.colour, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.setScalar(1.3); o.add(gl);
    const bg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beam = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: d.colour, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); world.add(beam);
    const lab = document.createElement("div"); lab.className = "b3-lab"; lab.textContent = d.name; lab.style.setProperty("--c", d.colour); host.appendChild(lab);
    const trail = []; return { d, o, orb, gl, beam, lab, on: 0, trail };
  });

  /* ---- camera: slow dolly, pointer / tilt parallax */
  let px = 0, py = 0, tx = 0, ty = 0;
  const onMove = e => { const r = cv.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 2; ty = ((e.clientY - r.top) / r.height - .5) * 2; };
  const onTilt = e => { if (e.gamma == null) return; tx = Math.max(-1, Math.min(1, e.gamma / 30)); ty = Math.max(-1, Math.min(1, (e.beta - 40) / 30)); };
  addEventListener("pointermove", onMove, { passive: true }); addEventListener("deviceorientation", onTilt, { passive: true });

  let prog = 0, shown = 0, ign = 0, raf = 0, t0 = performance.now(), last = t0;
  function size() { const r = cv.getBoundingClientRect(); R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); U.uPx.value = 17 * Math.min(2, devicePixelRatio || 1) * (r.height / 420); }
  size(); addEventListener("resize", size);
  const v3 = new THREE.Vector3(), ease = q => q < 0 ? 0 : q > 1 ? 1 : 1 - Math.pow(1 - q, 3);

  function frame(now) {
    const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    shown += (prog - shown) * (still ? 1 : Math.min(1, dt * 4));
    U.uT.value = t; U.uAsm.value = still ? 1 : Math.min(1, t / 2.2); U.uWake.value = shown;
    // camera: a slow dolly in, swinging with the pointer
    px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3);
    const dolly = still ? 8.4 : 11 - 2.6 * ease(t / 3.2), shake = ign && !still ? Math.max(0, 1 - (now - ign) / 500) * .08 : 0;
    cam.position.set(px * 1.6 + Math.sin(t * .3) * .3 + (Math.random() - .5) * shake, .5 - py * 1.0 + Math.sin(t * .23) * .15 + (Math.random() - .5) * shake, dolly);
    cam.lookAt(0, -.1, 0);
    brain.rotation.y = still ? -.5 : -.6 + Math.sin(t * .25) * .35 + t * .08; brain.rotation.x = .08;
    dust.rotation.y = t * .01; dust.position.x = -px * .8;
    linkM.opacity = Math.min(.55, .08 + .4 * shown) * U.uAsm.value;
    halo.material.opacity = .12 + .3 * shown;
    // impulses
    impM.opacity = still ? 0 : Math.min(1, shown * 1.5) * U.uAsm.value;
    imp.forEach((q, i) => { q.f += dt * q.v * (1 + shown * 2); if (q.f > 1) { q.f = 0; q.e = Math.floor(Math.random() * (L.length / 2)); }
      const a = L[q.e * 2], b = L[q.e * 2 + 1]; for (let c = 0; c < 3; c++) pp[i * 3 + c] = pos[a * 3 + c] + (pos[b * 3 + c] - pos[a * 3 + c]) * q.f;
      const dc = D[i % D.length] ? new THREE.Color(D[i % D.length].d.colour) : C[0]; pc[i * 3] = dc.r; pc[i * 3 + 1] = dc.g; pc[i * 3 + 2] = dc.b; });
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    // scan plane sweeping the brain
    const sc = (t * .45) % 1; scanG.position.y = -1.6 + sc * 3.4; scan.material.opacity = still ? 0 : .7 * Math.sin(sc * Math.PI) * U.uAsm.value; scanSheet.material.opacity = still ? 0 : .05 * Math.sin(sc * Math.PI) * U.uAsm.value;
    // departments ignite in turn and fire beams into the brain
    orbit.rotation.y = still ? 0 : t * .18;
    const w = cv.clientWidth, h = cv.clientHeight;
    D.forEach((q, i) => { const want = shown * (D.length + .5) > i + .5 ? 1 : 0; q.on += (want - q.on) * (still ? 1 : Math.min(1, dt * 4));
      const pulse = still ? 1 : .85 + .15 * Math.sin(t * 5 + i);
      q.orb.material.opacity = .25 + .75 * q.on; q.gl.material.opacity = .9 * q.on * pulse; q.gl.scale.setScalar(1 + .9 * q.on);
      q.o.getWorldPosition(v3); const bp = q.beam.geometry.attributes.position; bp.setXYZ(0, v3.x, v3.y, v3.z);
      const tgt = new THREE.Vector3(pos[(i * 911 % N) * 3], pos[(i * 911 % N) * 3 + 1], pos[(i * 911 % N) * 3 + 2]).applyMatrix4(brain.matrixWorld);
      bp.setXYZ(1, tgt.x, tgt.y, tgt.z); bp.needsUpdate = true; q.beam.material.opacity = .65 * q.on * (still ? 1 : .7 + .3 * Math.sin(t * 9 + i));
      v3.project(cam); const lx = (v3.x * .5 + .5) * w, ly = (-v3.y * .5 + .5) * h;
      q.lab.style.transform = `translate(${lx + cv.offsetLeft}px,${ly + cv.offsetTop}px) translate(-50%,-160%)`; q.o.getWorldPosition(tmp); const behind = tmp.z < -.6; q.lab.style.opacity = String((.35 + .65 * q.on) * (behind ? .35 : 1)); q.lab.classList.toggle("on", q.on > .5); q.lab.style.zIndex = v3.z < 1 ? 2 : 0; });
    // ignition: flash, core spark, shockwave rings
    if (ign) { const k = still ? 1 : Math.min(1, (now - ign) / 1100);
      U.uFlash.value = still ? 0 : Math.max(0, 1 - k * 2.2); core.material.opacity = Math.max(0, 1 - k) ; core.scale.setScalar(1.5 + 6 * ease(k));
      rings.forEach((m, i) => { const kk = Math.max(0, k - i * .12); m.scale.setScalar(.5 + 11 * ease(kk)); m.material.opacity = kk > 0 ? .9 * (1 - kk) : 0; }); }
    R.render(scene, cam);
    if (!still || !ign) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    progress(v) { prog = v; }, ignite() { ign = performance.now(); },
    stop() { cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); removeEventListener("deviceorientation", onTilt); removeEventListener("resize", size); D.forEach(q => q.lab.remove()); R.dispose(); },
  };
}
