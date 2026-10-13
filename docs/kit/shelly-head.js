/* Shelly's robot head (v1.22): her own design. A rounded TV-style head with a rolled clear-coat
   shell, a recessed bezel with a teal gasket, four screws, knob ears, a back vent panel, and an LED
   matrix face (28 x 16 LEDs) that glows and blooms. On top, a springy antenna carries her old
   light bulb, which still glows with her status (amber when approvals are waiting).

   Moods (the face, the LED colour and how the head moves):
     idle · thinking · searching · listening · speaking (live lip-sync from ShellyVoice) · working ·
     happy · alert · error · sleeping · dizzy · annoyed · hungry · wink
   A mood change plays a short glitch and the colour cross-fades. The head and eyes follow the
   pointer; a click makes her hop and spin. Reduced motion = a still, friendly pose.

   mount(canvas, wrap, btn, L) -> true when running (WebGL2 three.js head, or the 2D head when
   WebGL is missing or too slow). Pages can set a mood: ShellyHead.set("thinking", 4000).
   Inspired by the idea of LED-faced agent heads (robot-heads, MIT); all code and design here are Shelly's own. */
import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const COLS = 28, ROWS = 16;
export const MOODS = {
  idle: "#5fe3ff", thinking: "#b69cf2", searching: "#4fe0c4", listening: "#7ee08f", speaking: "#ffd98a", working: "#6aa8ff",
  happy: "#ffe066", alert: "#ffb347", error: "#ff6b6b", sleeping: "#3f6fa8", dizzy: "#ff9ad5", annoyed: "#ff8f6b", hungry: "#7ee08f", wink: "#5fe3ff",
};
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ------------------------------------------------------------------ the LED face */
export function makeFace() {
  const G = new Float32Array(COLS * ROWS);
  const lo = document.createElement("canvas"); lo.width = COLS; lo.height = ROWS;          // one pixel per LED (for the bloom)
  const hi = document.createElement("canvas"); hi.width = COLS * 20; hi.height = ROWS * 20;  // the crisp LEDs
  const bl = document.createElement("canvas"); bl.width = (COLS + 8) * 3; bl.height = (ROWS + 8) * 3;          // the soft glow: LEDs blurred, with room to spread
  const lg = lo.getContext("2d"), hg = hi.getContext("2d"), bg = bl.getContext("2d"), img = lg.createImageData(COLS, ROWS);
  let col = hex(MOODS.idle), from = col, to = col, fadeT = 1, glitch = 0, lastMood = "idle", key = "";

  const px = (x, y, v = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return; const i = y * COLS + x; if (v > G[i]) G[i] = v; };
  const rect = (x, y, w, h, v = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, v); };
  const ell = (cx, cy, rx, ry, v = 1) => { for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const dx = (x + .5 - cx) / Math.max(.3, rx), dy = (y + .5 - cy) / Math.max(.3, ry); if (dx * dx + dy * dy <= 1) px(x, y, v); } };
  const line = (x0, y0, x1, y1, v = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let k = 0; k <= n; k++) px(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, v); };
  const put = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < COLS && y < ROWS) G[y * COLS + x] = v; };
  const pts = (a, v = 1) => a.forEach(([x, y]) => px(x, y, v));
  const LE = 9, RE = 18, EY = 3;   // eye centres (LED coords of the eye's top-left anchor area)

  function eye(kind, cx, s) {
    const { lx, ly, blink, t } = s, ox = Math.round(lx * 2), oy = Math.round(ly * 1.2);
    if (kind === "open" || kind === "big") {
      const big = kind === "big" ? 1 : 0;
      if (blink < .4) { rect(cx - 2 + ox, EY + 3 + oy, 4 + big, 1); return; }
      ell(cx + .5 + ox, EY + 3 + oy, 2.4 + big * .6, 3 + big * .7);
      put(cx - 1 + ox, EY + 1 + oy, .35);   // a catch-light
    } else if (kind === "happy") { pts([[cx - 2, EY + 4], [cx - 1, EY + 2], [cx, EY + 1], [cx + 1, EY + 1], [cx + 2, EY + 2], [cx + 3, EY + 4]]); pts([[cx - 1, EY + 3], [cx + 2, EY + 3]], .5); }
    else if (kind === "closed") { pts([[cx - 2, EY + 3], [cx - 1, EY + 4], [cx, EY + 4], [cx + 1, EY + 4], [cx + 2, EY + 4], [cx + 3, EY + 3]]); }
    else if (kind === "flat") { rect(cx - 2 + ox, EY + 3, 5, 2); }
    else if (kind === "small") { rect(cx - 1 + ox, EY + 2 + oy, 3, 3); }
    else if (kind === ">" || kind === "<") { const k = kind === ">" ? 1 : -1, c = cx + .5; line(c - 2 * k, EY + 1, c + 2 * k, EY + 3); line(c + 2 * k, EY + 3, c - 2 * k, EY + 5); }
    else if (kind === "x") { line(cx - 2, EY + 1, cx + 2, EY + 5); line(cx + 2, EY + 1, cx - 2, EY + 5); }
    else if (kind === "spiral") { for (let k = 0; k < 14; k++) { const a = t * 9 + k * .45, r = .4 + k * .17; px(cx + .5 + Math.cos(a) * r, EY + 3 + Math.sin(a) * r * .9, .4 + k / 20); } }
  }
  function mouth(kind, s) {
    const { t, m } = s, y = 12;
    if (kind === "smile") pts([[11, y - 1], [12, y], [13, y], [14, y], [15, y], [16, y - 1]]);
    else if (kind === "grin") { pts([[10, y - 2], [17, y - 2]]); rect(11, y - 1, 6, 1); rect(12, y, 4, 1); px(13, y, .55); px(14, y, .55); }
    else if (kind === "talk") { const o = m ? m.open : .5 + .5 * Math.sin(t * 13), w = m ? 2 + m.wide * 1.6 - m.round * 1.2 : 2.6; ell(14, y, Math.max(1, w), .55 + o * 2.2); }
    else if (kind === "o") ell(14, y, 1.4, 1.5);
    else if (kind === "bigo") ell(14, y, 2.4, 2.4);
    else if (kind === "flat") rect(12, y, 4, 1);
    else if (kind === "wave") for (let x = 10; x <= 17; x++) px(x, y + Math.round(Math.sin(x * 1.3 + t * 8) * .7));
    else if (kind === "snore") ell(14, y, .9 + .5 * Math.abs(Math.sin(t * 1.2)), .9 + .5 * Math.abs(Math.sin(t * 1.2)));
    else if (kind === "dots") for (let k = 0; k < 3; k++) { const on = Math.floor(t * 3) % 4 > k; rect(11 + k * 3, y, 2, 1, on ? 1 : .18); }
    else if (kind === "eq") for (let k = 0; k < 6; k++) { const h = 1 + Math.round((Math.sin(t * (5 + k * 1.7) + k) * .5 + .5) * 3); rect(9 + k * 2, y + 2 - h, 1, h); }
    else if (kind === "bar") { rect(8, y + 1, 12, 1, .2); rect(8, y + 1, Math.round((t * .5 % 1) * 12), 1); }
  }
  // the face for a mood
  function draw(mood, s) {
    G.fill(0);
    const { t } = s;
    const E = (a, b = a) => { eye(a, LE, s); eye(b, RE, s); };
    switch (mood) {
      case "thinking": eye("small", LE, { ...s, lx: .8, ly: -1 }); eye("small", RE, { ...s, lx: .8, ly: -1 }); mouth("dots", s); break;
      case "searching": { const sw = Math.sin(t * 2.2); for (let k = 0; k < 2; k++) eye("open", k ? RE : LE, { ...s, lx: sw * 1.4, ly: 0 });
        const cx = Math.round((sw * .5 + .5) * (COLS - 1)); for (let y = 0; y < ROWS; y++) px(cx, y, .22); mouth("flat", s); break; }
      case "listening": E("open"); mouth("eq", s); break;
      case "speaking": E("open"); mouth("talk", s); break;
      case "working": E("flat"); mouth("bar", s); break;
      case "happy": E("happy"); mouth("grin", s); for (let k = 0; k < 3; k++) { const r = Math.sin(Math.floor(t * 6) * 12.9898 + k * 78.2) * 43758.5; const f = r - Math.floor(r); px(Math.floor(f * COLS), Math.floor(((f * 7) % 1) * 4), .7); } break;
      case "alert": E("big"); mouth("o", s); break;
      case "error": E("x"); mouth("wave", s); break;
      case "sleeping": E("closed"); mouth("snore", s); { const z = (t * .6) % 1; pts([[23, 4 - Math.round(z * 3)], [24, 4 - Math.round(z * 3)], [24, 3 - Math.round(z * 3)], [23, 2 - Math.round(z * 3)], [24, 2 - Math.round(z * 3)]], .7 * (1 - z)); } break;
      case "dizzy": E("spiral"); mouth("wave", s); break;
      case "annoyed": eye(">", LE, s); eye("<", RE, s); mouth("flat", s); break;
      case "hungry": E("big"); mouth("bigo", s); break;
      case "wink": eye("open", LE, s); eye("happy", RE, s); mouth("smile", s); break;
      default: E("open"); mouth("smile", s);
    }
  }
  /* render: returns true when the textures changed */
  function render(mood, s) {
    if (mood !== lastMood) { from = col.slice(); to = hex(MOODS[mood] || MOODS.idle); fadeT = 0; if (!s.still) glitch = .32; lastMood = mood; }
    if (fadeT < 1) { fadeT = Math.min(1, fadeT + s.dt / .3); col = from.map((v, i) => Math.round(v + (to[i] - v) * fadeT)); }
    draw(mood, s);
    if (glitch > 0) { glitch -= s.dt;   // a short glitch: rows tear sideways, a little static
      for (let y = 0; y < ROWS; y++) if (Math.random() < .35) { const sh = Math.round((Math.random() - .5) * 5), row = G.slice(y * COLS, y * COLS + COLS); for (let x = 0; x < COLS; x++) G[y * COLS + x] = row[(x - sh + COLS) % COLS]; }
      for (let k = 0; k < 18; k++) G[Math.floor(Math.random() * G.length)] = Math.random() * .8;
    }
    const dim = s.dim ?? 1;
    let h = col.join(",") + "|" + dim.toFixed(2) + "|"; for (let i = 0; i < G.length; i++) h += G[i] > .02 ? (G[i] * 9 | 0) : "";
    if (h === key) return false; key = h;
    const d = img.data;
    for (let i = 0; i < G.length; i++) { const v = G[i] * dim; d[i * 4] = col[0] * v; d[i * 4 + 1] = col[1] * v; d[i * 4 + 2] = col[2] * v; d[i * 4 + 3] = 255; }
    lg.putImageData(img, 0, 0);
    bg.clearRect(0, 0, bl.width, bl.height); bg.imageSmoothingEnabled = true;
    if ("filter" in bg) bg.filter = "blur(4px)"; bg.drawImage(lo, 12, 12, COLS * 3, ROWS * 3); if ("filter" in bg) bg.filter = "none";
    hg.fillStyle = "#04070b"; hg.fillRect(0, 0, hi.width, hi.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = G[y * COLS + x] * dim, cx = x * 20 + 10, cy = y * 20 + 10;
      hg.fillStyle = v > .02 ? `rgb(${col.map(c => Math.round(14 + c * v)).join(",")})` : `rgb(${col.map(c => Math.round(10 + c * .05)).join(",")})`;
      hg.beginPath(); hg.arc(cx, cy, 7.4, 0, 7); hg.fill();
      if (v > .6) { hg.fillStyle = `rgba(255,255,255,${(v - .6) * .9})`; hg.beginPath(); hg.arc(cx - 2, cy - 2, 2.6, 0, 7); hg.fill(); }
    }
    return true;
  }
  return { render, lo, hi, bl, color: () => col };
}

/* ------------------------------------------------------------------ shared: which mood right now */
let forced = "", forcedUntil = 0;
export const ShellyHead = { set(m, ms = 4000) { forced = m; forcedUntil = performance.now() + ms; }, clear() { forced = ""; } };
if (typeof window !== "undefined") { window.ShellyHead = ShellyHead; addEventListener("shelly:mood", e => ShellyHead.set(e.detail && e.detail.mood, e.detail && e.detail.ms)); }
function moodNow(wrap, L, M) {
  const c = wrap.classList, m = L.mood();
  if (c.contains("dizzy")) return "dizzy";
  if (c.contains("sleepy")) return "sleeping";
  if (c.contains("hungry")) return "hungry";
  if (m === "happy" || m === "gulp") return "happy";
  if (m === "annoyed") return "annoyed";
  if (m === "alert") return "alert";
  if (M || c.contains("talk")) return "speaking";
  if (m === "wink") return "wink";
  if (forced && performance.now() < forcedUntil) return forced;
  return "idle";
}
/* how the head moves for a mood: [yaw, pitch, roll] offsets + bob */
function pose(mood, t, still) {
  if (still) return [.18, .04, 0, 0];
  switch (mood) {
    case "thinking": return [.2, -.1, .14, Math.sin(t * 1.2) * .02];
    case "searching": return [Math.sin(t * 2.2) * .38, 0, 0, 0];
    case "listening": return [0, .1, -.06, 0];
    case "speaking": return [Math.sin(t * 1.7) * .08, Math.sin(t * 6) * .025, Math.sin(t * 3.1) * .03, Math.abs(Math.sin(t * 6)) * .03];
    case "working": return [0, .12 + Math.sin(t * 9) * .03, 0, 0];
    case "happy": return [Math.sin(t * 8) * .12, -.05, Math.sin(t * 8) * .08, Math.abs(Math.sin(t * 7)) * .08];
    case "error": case "annoyed": return [Math.sin(t * 24) * .07, 0, 0, 0];
    case "sleeping": return [0, .3, .14, Math.sin(t * 1.2) * .02];
    case "dizzy": return [Math.sin(t * 5) * .2, Math.sin(t * 7) * .1, Math.sin(t * 11) * .2, 0];
    case "alert": return [0, -.08, 0, .04];
    default: return [Math.sin(t * .6) * .1, Math.sin(t * .45) * .04, 0, Math.sin(t * 2.2) * .015];
  }
}

/* ------------------------------------------------------------------ geometry helpers */
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function fitUV(geo) {   // ShapeGeometry UVs are positions: map them to 0..1
  geo.computeBoundingBox(); const b = geo.boundingBox, uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  uv.needsUpdate = true; return geo;
}
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.3, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ------------------------------------------------------------------ mount */
export function mount(cv, wrap, btn, L) {
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { lx: 0, ly: 0, tx: 0, ty: 0, blinkAt: 1800, blinkEnd: 0, last: 0, spin: 0, spinV: 0, hop: 0, hopV: 0 };
  addEventListener("pointermove", e => { const r = btn.getBoundingClientRect();
    S.tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 260)); S.ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 260)); }, { passive: true });
  btn.addEventListener("pointerdown", () => { if (!still) { S.spinV = 15; S.hopV = 3.2; } });
  const face = makeFace();
  const ok = webgl(cv, wrap, btn, L, S, face, still);
  if (ok) return true;
  const c2 = document.createElement("canvas"); c2.className = cv.className; c2.setAttribute("aria-hidden", "true"); cv.replaceWith(c2);
  return flat(c2, wrap, btn, L, S, face, still);
}

function step(S, now, still) {   // shared per-frame state: pointer, blink, hop and spin springs
  const t = now / 1000, dt = Math.min(.05, (now - (S.last || now)) / 1000); S.last = now;
  S.lx += (S.tx - S.lx) * Math.min(1, dt * 8); S.ly += (S.ty - S.ly) * Math.min(1, dt * 8);
  if (!still && now > S.blinkAt) { S.blinkEnd = now + 120; S.blinkAt = now + 2400 + Math.random() * 3400; }
  // hop (gravity) and one full spin, eased by a spring that settles on a whole turn
  S.hopV -= 14 * dt; S.hop = Math.max(0, S.hop + S.hopV * dt); if (S.hop === 0) S.hopV = Math.max(0, S.hopV);
  const target = Math.round(S.spin / (Math.PI * 2)) * Math.PI * 2 + (S.spinV > 6 ? Math.PI * 2 : 0);
  S.spinV += ((target - S.spin) * 30 - S.spinV * 7) * dt; S.spin += S.spinV * dt;
  return { t, dt, blink: now < S.blinkEnd ? .1 : 1 };
}

function webgl(cv, wrap, btn, L, S, face, still) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { return false; }
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xe4ecff, 0x161210, .55));
  const keyL = new THREE.DirectionalLight(0xffffff, 1.6); keyL.position.set(-3, 4, 5); scene.add(keyL);
  const rim = new THREE.DirectionalLight(0x8fd0ff, 1.4); rim.position.set(3.5, 1.5, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, 1, .1, 50); cam.position.set(0, .5, 10.6); cam.lookAt(0, .42, 0);

  const rig = new THREE.Group(); scene.add(rig);
  const head = new THREE.Group(); rig.add(head);
  /* shell: rounded box with a rolled (bevelled) edge, pearl clear-coat paint */
  const shellGeo = new THREE.ExtrudeGeometry(rrShape(2.2, 1.62, .46), { depth: 1.15, bevelEnabled: true, bevelThickness: .26, bevelSize: .22, bevelSegments: 8, curveSegments: 18 });
  shellGeo.center();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9edf2, roughness: .38, metalness: 0, clearcoat: 1, clearcoatRoughness: .08, sheen: .3, sheenColor: new THREE.Color(0x9fdcff), envMapIntensity: 1.1 });
  head.add(new THREE.Mesh(shellGeo, paint));
  const FZ = .835;   // front face of the shell
  /* bezel (dark), gasket (teal), screen glass with the LED texture, bloom on top */
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(2.12, 1.56, .36), { depth: .02, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 3 }),
    new THREE.MeshPhysicalMaterial({ color: 0x1d2530, roughness: .55, metalness: .2, clearcoat: .4 }));
  bezel.position.z = FZ; head.add(bezel);
  const gs = rrShape(1.94, 1.38, .3); gs.holes.push(rrShape(1.82, 1.26, .24));
  const gasket = new THREE.Mesh(new THREE.ExtrudeGeometry(gs, { depth: .025, bevelEnabled: false, curveSegments: 14 }), new THREE.MeshPhysicalMaterial({ color: 0x3fb8d8, roughness: .35, metalness: .4, clearcoat: .8 }));
  gasket.position.z = FZ + .04; head.add(gasket);
  const ledTex = new THREE.CanvasTexture(face.hi); ledTex.colorSpace = THREE.SRGBColorSpace; ledTex.anisotropy = 8;
  const bloomTex = new THREE.CanvasTexture(face.bl); bloomTex.colorSpace = THREE.SRGBColorSpace; bloomTex.minFilter = bloomTex.magFilter = THREE.LinearFilter;
  const screen = new THREE.Mesh(fitUV(new THREE.ShapeGeometry(rrShape(1.82, 1.26, .24), 14)), new THREE.MeshPhysicalMaterial({
    color: 0x020407, roughness: .16, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, emissive: 0xffffff, emissiveMap: ledTex, emissiveIntensity: 1.9, envMapIntensity: .9 }));
  screen.position.z = FZ + .05; head.add(screen);
  const bloom = new THREE.Mesh(new THREE.PlaneGeometry(1.82 * (COLS + 8) / COLS, 1.26 * (ROWS + 8) / ROWS), new THREE.MeshBasicMaterial({ map: bloomTex, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  bloom.position.z = FZ + .09; head.add(bloom);
  /* screws in the bezel corners */
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xcfd6de, metalness: 1, roughness: .22, clearcoat: .5 });
  const slotM = new THREE.MeshBasicMaterial({ color: 0x1a1f26 });
  [[-.97, .69], [.97, .69], [-.97, -.69], [.97, -.69]].forEach(([x, y], i) => {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal); sc.rotation.x = Math.PI / 2; sc.scale.set(1, .45, 1); sc.position.set(x, y, FZ + .045); head.add(sc);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(.07, .012, .01), slotM); sl.position.set(x, y, FZ + .066); sl.rotation.z = i * .7; head.add(sl);
  });
  /* knob ears: a teal collar, a knurled cap and an indicator dot */
  const teal = new THREE.MeshPhysicalMaterial({ color: 0x2c9fc0, metalness: .55, roughness: .3, clearcoat: 1 });
  const knobs = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.x = sx * 1.36; g.rotation.z = Math.PI / 2 * sx; head.add(g);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.3, .32, .14, 40), teal); g.add(collar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.22, .24, .2, 22), new THREE.MeshPhysicalMaterial({ color: 0xdfe4ea, metalness: .9, roughness: .28, flatShading: true }));
    cap.position.y = .15; g.add(cap);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a59 })); dot.position.set(.15, .26, 0); cap.add(dot);
    return cap;
  });
  /* back panel with vents */
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(1.7, 1.15, .28), { depth: .03, bevelEnabled: false }), new THREE.MeshPhysicalMaterial({ color: 0x2a323e, roughness: .6, metalness: .3 }));
  back.position.z = -FZ - .03; head.add(back);
  for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(1.1, .06, .02), slotM); v.position.set(0, .34 - k * .17, -FZ - .045); head.add(v); }
  /* antenna: a boss, a little spring coil, a rod on a damped spring, and Shelly's bulb on top */
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .1, 28), teal); boss.position.y = 1.04; head.add(boss);
  const pivot = new THREE.Group(); pivot.position.y = 1.08; head.add(pivot);
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(.065, .014, 8, 20), metal); c.rotation.x = Math.PI / 2; c.position.y = .03 + k * .045; pivot.add(c); }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.022, .03, .62, 12), metal); rod.position.y = .5; pivot.add(rod);
  const bulbMat = new THREE.MeshPhysicalMaterial({ color: 0xfff6e0, roughness: .42, transmission: .55, thickness: .3, clearcoat: 1, emissive: new THREE.Color(1, .8, .45), emissiveIntensity: .9, envMapIntensity: 1 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.17, 28, 18), bulbMat); bulb.position.y = .86; pivot.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd27a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.scale.set(1.3, 1.3, 1); glow.position.y = .86; pivot.add(glow);
  /* soft floor shadow */
  const shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow.material.map, color: 0x000000, transparent: true, opacity: .45, depthWrite: false }));
  shadow.scale.set(2.6, .5, 1); shadow.position.set(0, -1.32, 0); rig.add(shadow);
  /* screen glow onto the room */
  const spill = new THREE.PointLight(0x5fe3ff, 1.2, 4, 2); spill.position.set(0, 0, 1.6); head.add(spill);

  let quality = 1.25;
  function size() { const css = (btn.clientWidth || 64) * 1.5; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 3) * quality); renderer.setSize(css, css, false); cam.aspect = 1; cam.updateProjectionMatrix(); }
  size(); new ResizeObserver(size).observe(btn);
  wrap.classList.add("sk-3d", "sk-head");

  // antenna spring (angles about x and z), whipped by the head's motion
  const A = { x: 0, z: 0, vx: 0, vz: 0 }; let prev = [0, 0, 0, 0], ry = 0, rx = 0, rz = 0, yb = 0;
  let probeStart = 0, probeN = 0, stage = 0, raf = 0;
  function probe(now) {   // slow device: lower resolution, then hand over to the 2D head
    if (stage > 1) return; if (!probeStart) { probeStart = now; probeN = 0; return; } probeN++;
    if (now - probeStart < 2500) return; const fps = probeN / ((now - probeStart) / 1000); probeStart = 0;
    if (fps >= 40) { stage = 2; return; } if (stage === 0) { stage = 1; quality = .75; size(); return; }
    if (fps < 24 && !/[?&]head=3d/.test(location.search)) { stage = 3; cancelAnimationFrame(raf); renderer.dispose(); const c2 = document.createElement("canvas"); c2.className = cv.className; c2.setAttribute("aria-hidden", "true"); cv.replaceWith(c2); flat(c2, wrap, btn, L, S, face, still); }
    else stage = 2;
  }
  const C = new THREE.Color(), WARM = new THREE.Color(1, .82, .48), AMBER = new THREE.Color(1, .6, .2);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { probeStart = 0; return; }
    probe(now); if (stage === 3) return;
    const { t, dt, blink } = step(S, now, still);
    const V = window.ShellyVoice, M = V && V.speaking ? V.mouth() : null, mood = moodNow(wrap, L, M);
    const sleepy = mood === "sleeping";
    if (face.render(mood, { t, dt, lx: S.lx, ly: S.ly, blink, m: M, still, dim: sleepy ? .45 : 1 })) { ledTex.needsUpdate = true; bloomTex.needsUpdate = true; }
    const fc = face.color(); C.setRGB(fc[0] / 255, fc[1] / 255, fc[2] / 255);
    spill.color.copy(C); spill.intensity = sleepy ? .3 : 1.2 + (M ? M.energy * 1.5 : 0);
    bloom.material.opacity = sleepy ? .25 : .55 + (M ? M.energy * .3 : 0);
    // pose: the mood's motion + following the pointer
    const [py, pp, pr, bob] = pose(mood, t, still);
    const gy = py + (still ? 0 : S.lx * .42), gx = pp + (still ? 0 : S.ly * .2);
    ry += (gy - ry) * Math.min(1, dt * 6); rx += (gx - rx) * Math.min(1, dt * 6); rz += (pr - rz) * Math.min(1, dt * 6); yb += (bob - yb) * Math.min(1, dt * 10);
    rig.rotation.set(rx, ry + S.spin, rz); head.position.y = yb + S.hop * .35;
    shadow.material.opacity = .45 - Math.min(.3, S.hop * .3);
    // antenna spring: driven by how fast the head turns and hops
    const cur = [rx, ry + S.spin, rz, head.position.y];
    const dvy = (cur[1] - prev[1]) / Math.max(dt, 1e-3), dvx = (cur[0] - prev[0]) / Math.max(dt, 1e-3), dvz = (cur[2] - prev[2]) / Math.max(dt, 1e-3), dh = (cur[3] - prev[3]) / Math.max(dt, 1e-3); prev = cur;
    if (!still) { A.vz += (-60 * A.z - 5 * A.vz + dvy * 2.2 + dvz * 3) * dt; A.vx += (-60 * A.x - 5 * A.vx - dvx * 3 + dh * 1.5) * dt; A.z += A.vz * dt; A.x += A.vx * dt; }
    A.z = Math.max(-.7, Math.min(.7, A.z)); A.x = Math.max(-.7, Math.min(.7, A.x)); pivot.rotation.set(A.x, 0, A.z);
    // ear knobs turn while she works or thinks
    if (!still && (mood === "working" || mood === "thinking" || mood === "searching")) knobs.forEach((k, i) => { k.rotation.y += dt * (i ? 2.4 : -1.8); });
    // the bulb: her old light, amber and pulsing when approvals wait, bright when she speaks
    const alert = wrap.classList.contains("alert");
    const bc = alert ? AMBER : WARM, pulse = alert && !still ? .55 + .45 * Math.sin(t * 4) : 1;
    const lvl = sleepy ? .15 : (.8 + (M ? M.energy * .8 : 0)) * pulse;
    bulbMat.emissive.copy(bc); bulbMat.emissiveIntensity = .2 + 1.4 * lvl; glow.material.color.copy(bc); glow.material.opacity = Math.min(1, .25 + .7 * lvl);
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);
  return true;
}

/* ------------------------------------------------------------------ the 2D head (no WebGL or a slow device) */
function flat(cv, wrap, btn, L, S, face, still) {
  const g = cv.getContext("2d"); if (!g) return false;
  wrap.classList.add("sk-3d", "sk-head");
  const A = { a: 0, v: 0 }; let prevX = 0;
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function frame(now) {
    requestAnimationFrame(frame); if (document.hidden) return;
    const css = btn.clientWidth || 64, dpr = Math.min(devicePixelRatio || 1, 3), px = Math.round(css * 1.5 * dpr);
    if (cv.width !== px) cv.width = cv.height = px;
    const { t, dt, blink } = step(S, now, still);
    const V = window.ShellyVoice, M = V && V.speaking ? V.mouth() : null, mood = moodNow(wrap, L, M), sleepy = mood === "sleeping";
    face.render(mood, { t, dt, lx: S.lx, ly: S.ly, blink, m: M, still, dim: sleepy ? .45 : 1 });
    const [py, , pr, bob] = pose(mood, t, still), fc = face.color();
    const k = cv.width / 150; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.width);
    const sx = Math.cos(py + S.spin);   // a spin squashes the head sideways
    g.setTransform(k * sx, 0, 0, k, cv.width / 2 + (still ? 0 : S.lx * 4 * k), cv.width / 2 + (14 - (bob + S.hop * .35) * 40) * k); g.rotate(pr);
    // shadow
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(0, 42, 40, 6, 0, 0, 7); g.fill();
    // antenna spring
    const x = S.lx * 10 + py * 40; A.v += (-60 * A.a - 5 * A.v + (x - prevX) / Math.max(dt, 1e-3) * .02) * dt; A.a += A.v * dt; prevX = x; if (still) A.a = 0;
    g.save(); g.translate(0, -30); g.rotate(A.a); g.strokeStyle = "#c9d1da"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -22); g.stroke();
    const alert = wrap.classList.contains("alert"), pulse = alert && !still ? .55 + .45 * Math.sin(t * 4) : 1, bc = alert ? "255,160,60" : "255,214,130";
    const gl = g.createRadialGradient(0, -26, 0, 0, -26, 16); gl.addColorStop(0, `rgba(${bc},${(sleepy ? .2 : .9) * pulse})`); gl.addColorStop(1, `rgba(${bc},0)`);
    g.fillStyle = gl; g.beginPath(); g.arc(0, -26, 16, 0, 7); g.fill(); g.fillStyle = `rgba(255,246,224,${.6 + .4 * pulse})`; g.beginPath(); g.arc(0, -26, 5.5, 0, 7); g.fill(); g.restore();
    // ears
    g.fillStyle = "#2c9fc0"; rr(-50, -9, 10, 18, 4); g.fill(); rr(40, -9, 10, 18, 4); g.fill();
    // shell
    const sh = g.createLinearGradient(0, -32, 0, 32); sh.addColorStop(0, "#f7f9fb"); sh.addColorStop(1, "#bcc5cf");
    g.fillStyle = sh; rr(-42, -32, 84, 64, 17); g.fill(); g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = "#1d2530"; rr(-37, -27, 74, 54, 12); g.fill();
    g.fillStyle = "#3fb8d8"; rr(-33.5, -23.5, 67, 47, 10); g.fill();
    g.save(); rr(-32, -22, 64, 44, 9); g.clip(); g.drawImage(face.hi, -32, -22, 64, 44);
    g.globalCompositeOperation = "lighter"; g.globalAlpha = sleepy ? .25 : .5; g.imageSmoothingEnabled = true; g.drawImage(face.bl, -32 * 36 / 28, -22 * 24 / 16, 64 * 36 / 28, 44 * 24 / 16); g.restore();
    g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.ellipse(-12, -16, 18, 4, -.15, 0, 7); g.fill();
    // screen spill
    const sp = g.createRadialGradient(0, 0, 10, 0, 0, 60); sp.addColorStop(0, `rgba(${fc.join(",")},.12)`); sp.addColorStop(1, `rgba(${fc.join(",")},0)`); g.fillStyle = sp; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill();
  }
  requestAnimationFrame(frame);
  return true;
}
