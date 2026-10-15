/* Shelly Tower in 3D (v2.6). The tower and every floor were modelled in Blender
   (scripts/blender/build_tower_3d.py) and exported as .glb; this file shows them with the vendored three.js.
   Tower: drag to spin, wheel or pinch to zoom, tap a floor to fly into it.
   Floor: walls, doors, the lift core, fire stairs, furniture and people by role. Guest rooms, apartments and
   washrooms are closed rooms with closed doors, and nobody is drawn inside them. People have no faces.
   Talks to app.js with two window events: "floors:show" {level} (app.js -> here) and "floors:go" {level} (here -> app.js). */
import * as THREE from "../kit/vendor/three.module.min.js";
import { RoomEnvironment } from "../kit/vendor/RoomEnvironment.js";
import { loadGLB } from "../kit/glb.js";

const touch = matchMedia("(pointer: coarse)").matches;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const $ = s => document.querySelector(s);
const MODEL = new URL("model/", location.href).href;

function webgl() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }

/* ---------------------------------------------------------------- a scene with orbit, zoom and tap */
function stage(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: touch ? "low-power" : "high-performance", alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(opts.bg || "#0d1522");
  if (!touch) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; }
  scene.add(new THREE.HemisphereLight("#eaf2ff", "#3a4658", touch ? 2.2 : 1.2));
  const sun = new THREE.DirectionalLight("#fff1dc", 1.8); sun.position.set(-60, 120, 80); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, .2, 3000);
  const ov = Object.assign({ theta: .7, phi: 1.0, dist: 60, tx: 0, ty: 0, tz: 0, min: 8, max: 600 }, opts.view || {});
  let anim = null, dirty = true, visible = true;
  const ptrs = new Map(); let down = null, moved = 0, pinch0 = 0;
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY }; moved = 0; anim = null; });
  canvas.addEventListener("pointermove", e => { const p = ptrs.get(e.pointerId);
    if (!p) { opts.onHover && opts.onHover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) ov.dist = Math.max(ov.min, Math.min(ov.max, ov.dist * pinch0 / d)); pinch0 = d; }
    else { ov.theta -= dx * .006; ov.phi = Math.max(.12, Math.min(1.5, ov.phi - dy * .005)); }
    dirty = true; });
  const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; if (down && moved < 6 && e.type === "pointerup" && opts.onTap) opts.onTap(e); down = null; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => { e.preventDefault(); anim = null; ov.dist = Math.max(ov.min, Math.min(ov.max, ov.dist * (e.deltaY > 0 ? 1.1 : .9))); dirty = true; }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e, list) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(list, true)[0]; }
  function flyTo(to, ms = 1100) { if (still) { Object.assign(ov, to); dirty = true; return; } const from = { ...ov }; anim = { from, to, t0: performance.now(), ms }; }
  function resize() { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); dirty = true; }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) dirty = true; }).observe(canvas);
  const ticks = [];
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    if (anim) { const k = Math.min(1, (now - anim.t0) / anim.ms), e = ease(k); for (const key in anim.to) ov[key] = anim.from[key] + (anim.to[key] - anim.from[key]) * e; if (k >= 1) anim = null; dirty = true; }
    for (const t of ticks) if (t(now)) dirty = true;
    if (!dirty) return; dirty = false;
    const sp = Math.sin(ov.phi); camera.position.set(ov.tx + ov.dist * sp * Math.sin(ov.theta), ov.ty + ov.dist * Math.cos(ov.phi), ov.tz + ov.dist * sp * Math.cos(ov.theta)); camera.lookAt(ov.tx, ov.ty, ov.tz);
    renderer.render(scene, camera); opts.afterRender && opts.afterRender(camera);
  }
  requestAnimationFrame(frame);
  return { scene, camera, ov, pick, flyTo, ticks, poke: () => { dirty = true; }, resize };
}

/* ---------------------------------------------------------------- the tower */
function towerView(IDX) {
  const canvas = $("#tw3d"), tip = $("#tw3dTip");
  const S = stage(canvas, { bg: "#0d1522", view: { theta: .75, phi: 1.2, dist: 300, ty: 62, min: 60, max: 700 },
    onTap: e => { const h = S.pick(e, floors); const lv = h && levelOf(h.object); if (lv) dispatchEvent(new CustomEvent("floors:go", { detail: { level: lv, from: "tower" } })); },
    onHover: e => { if (touch) return; const h = S.pick(e, floors), lv = h && levelOf(h.object); canvas.style.cursor = lv ? "pointer" : "grab";
      if (lv !== hov) { hov = lv; tip.textContent = lv ? label(lv) : "Tap a floor to go in"; } } });
  let floors = [], byLevel = {}, sel = null, hov = null, slide = {};
  const levelOf = o => { while (o) { if (/^F_/.test(o.name) && o.parent && !/^F_/.test(o.parent.name)) return o.name.slice(2); o = o.parent; } return null; };
  const F = window.SHELLY_FLOORS.floors, info = Object.fromEntries(F.map(f => [f.level, f]));
  const label = lv => { const f = info[lv]; return f ? `${lv === "R" ? "Roof" : /^B|G/.test(lv) ? lv : "L" + lv} · ${f.name}` : lv; };
  loadGLB(MODEL + "tower.glb").then(root => {
    S.scene.add(root);
    root.traverse(o => { if (/^F_/.test(o.name) && o.parent && !/^F_/.test(o.parent.name) && !o.isMesh) { byLevel[o.name.slice(2)] = o; slide[o.name.slice(2)] = 0; } });
    floors = Object.values(byLevel);
    canvas.closest(".t3").classList.add("ready"); S.poke();
    if (pending) show(pending);
  }).catch(e => { console.warn("tower model not loaded", e); canvas.closest(".t3").classList.add("fail"); });
  // the chosen floor slides out like a drawer, so you can see which one you are in
  S.ticks.push(() => { let moving = false; for (const lv in byLevel) { const want = lv === sel ? 14 : 0, o = byLevel[lv]; const x = o.position.x + (want - o.position.x) * .14;
    if (Math.abs(x - want) > .02) { o.position.x = x; moving = true; } else if (o.position.x !== want) { o.position.x = want; moving = true; } } return moving; });
  let pending = null;
  function show(lv) { if (!floors.length) { pending = lv; return; } sel = lv; const o = byLevel[lv]; if (!o) return;
    const y = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).y; S.flyTo({ ty: y, dist: Math.min(S.ov.dist, 230) }, 900); tip.textContent = label(lv); S.poke(); }
  return { show };
}

/* ---------------------------------------------------------------- one floor */
function floorView(IDX) {
  const canvas = $("#fl3d"), wrap = canvas.closest(".f3"), tags = $("#fl3dTags"), note = $("#fl3dNote");
  let model = null, info = null, curLv = null, rise = null, loadId = 0;
  const v = new THREE.Vector3();
  const S = stage(canvas, { bg: "#0b111b", view: { theta: .55, phi: .85, dist: 60, min: 6, max: 160 },
    afterRender: cam => { if (!info) return; const r = canvas.getBoundingClientRect();
      tags.querySelectorAll("span").forEach(s => { v.set(+s.dataset.x, 3.2 + (model ? model.position.y : 0), -s.dataset.y).project(cam);
        const off = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05; s.style.display = off ? "none" : "";
        if (!off) s.style.transform = `translate(${((v.x + 1) / 2 * r.width).toFixed(1)}px,${((1 - v.y) / 2 * r.height).toFixed(1)}px) translate(-50%,-50%)`; }); } });
  const VIEWS = { angle: (W, H) => ({ theta: .55, phi: .85, dist: Math.max(W, H) * 1.25 }), top: (W, H) => ({ theta: 0, phi: .14, dist: Math.max(W, H * 1.4) * 1.15 }),
    eye: (W, H) => ({ theta: Math.PI * .92, phi: 1.36, dist: Math.max(W, H) * .55 }) };
  let view = "angle";
  // arriving by lift: the floor rises into place
  S.ticks.push(now => { if (!rise || !model) return false; const k = Math.min(1, (now - rise) / 900); model.position.y = -4 * (1 - ease(k)); if (k >= 1) rise = null; return true; });
  function aim(animate) { if (!info) return; const W = info.w, H = info.h, to = Object.assign({ tx: W / 2, ty: 0, tz: -H / 2 }, VIEWS[view](W, H));
    if (view === "eye") { to.tx = W / 2; to.tz = -H / 2; }
    animate ? S.flyTo(to, 900) : Object.assign(S.ov, to); S.poke(); }
  async function show(lv) {
    if (lv === curLv) return; curLv = lv; const my = ++loadId;
    info = IDX.floors.find(f => f.level === lv); wrap.classList.add("loading");
    try {
      const root = await loadGLB(MODEL + "L" + lv + ".glb"); if (my !== loadId) return;
      if (model) { S.scene.remove(model); model.traverse(o => o.geometry && o.geometry.dispose()); }
      model = root; S.scene.add(model);
      tags.innerHTML = info.rooms.filter(r => r.label).map(r => `<span data-x="${r.x}" data-y="${r.y}">${r.name.replace(/[&<>]/g, "")}</span>`).join("");
      const priv = /Guest rooms|Suites|apartments/.test(info.rooms.map(r => r.name).join("|"));
      note.textContent = `${info.w} m × ${info.h} m · ${info.people_drawn} of ${info.people_in} people shown, by role colour` + (priv ? " · guest rooms are closed: doors only, nobody shown inside" : "");
      aim(false); if (!still) rise = performance.now(); wrap.classList.remove("loading"); wrap.classList.add("ready");
    } catch (e) { console.warn("floor model not loaded", e); wrap.classList.remove("loading"); wrap.classList.add("fail"); }
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { view = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false")); aim(true); }));
  return { show };
}

/* ---------------------------------------------------------------- wire up */
(async function () {
  if (!window.SHELLY_FLOORS) return;
  if (!webgl()) { document.documentElement.classList.add("no3d"); return; }
  document.documentElement.classList.add("has3d");
  let IDX;
  try { IDX = await (await fetch(MODEL + "index.json")).json(); } catch (e) { document.documentElement.classList.add("no3d"); return; }
  const T = towerView(IDX), FV = floorView(IDX);
  const show = lv => { T.show(lv); FV.show(lv); };
  addEventListener("floors:show", e => show(e.detail.level));
  if (window.SHELLY_FLOORS_CUR) show(window.SHELLY_FLOORS_CUR);
})();
