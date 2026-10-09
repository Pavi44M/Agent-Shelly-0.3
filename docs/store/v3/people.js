/* People for every Shelly 3D world (Store Floor, Gateway, Shelly Tower): a body modelled in Blender
   with real joints, in a role-coloured shirt. Staff wear the store polo; the Duty Manager has a gold
   lanyard and a ★ tag; customers wear their own clothes and some carry a basket. */
import { HUMAN } from "../../kit/human-mesh.js";
export const ROLE_SHIRT = { "Duty Manager": "#f2c14e", "Store Team": "#1f8a5b", "Store Manager": "#2f5f9e", "Cook": "#f4f4f1", "Café": "#8a5a3b", customer: null };
const SKIN = ["#f1c9a5", "#e0ac84", "#c68c5f", "#a26a42", "#7a4b2c", "#f6d7bd"];
const HAIR = ["#1d1a17", "#3b2a1e", "#6b4a2f", "#b8864b", "#d9c08a", "#8a8f94", "#2a2420"];
const CLOTHES = ["#d94a3d", "#3d7dd9", "#7a5cc4", "#e08a3a", "#2a9d8f", "#e85d9a", "#556070", "#c9b48a", "#7fb3d5", "#a23b72", "#334155", "#f4f1ea"];
const PANTS = ["#26303b", "#3a4a5e", "#1d2430", "#5b4a3a", "#2e3a2e", "#4a4f57"];

let n = 0;
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

/* The body comes from Blender (blender/shelly_people_build.py -> kit/human-mesh.js): smooth limbs with
   real joints (hips, knees, ankles, shoulders, elbows, neck), a face (eyes, brows, mouth, nose, ears),
   four hair styles, two builds, trousers or a skirt, short or long sleeves. Geometry is decoded once
   and shared by everyone; colours come from the role (uniforms) or, for customers, their own clothes. */
let GEO = null;
function geo(THREE, k) {
  if (!GEO) {
    GEO = {};
    const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    for (const [key, [p, nn, ix]] of Object.entries(HUMAN)) {
      const P = new Int16Array(b64(p)), F = new Float32Array(P.length); for (let i = 0; i < P.length; i++) F[i] = P[i] / 4000;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(F, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(b64(nn)), 3, true));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64(ix)), 1)); g.computeBoundingSphere(); g.userData.shared = true; GEO[key] = g;
    }
  }
  return GEO[k];
}
const MATS = {};
function M(THREE, c, rough = .62) { const k = c + rough; if (!MATS[k]) { MATS[k] = new THREE.MeshStandardMaterial({ color: c, roughness: rough }); MATS[k].userData.shared = true; } return MATS[k]; }
const LONG = /Manager|Supervisor|Lead|Officer|Controller|Quality|Driver|Courier|Head|Director|Exec|Analyst|Engineer|Advisor/;

export function makePerson(THREE, opts) {
  const r = opts.seed ?? Math.random();
  const kind = opts.kind;                         // "staff" | "customer"
  const shirtHex = kind === "staff" ? ROLE_SHIRT[opts.role] || opts.shirt || "#1f8a5b" : pick(CLOTHES, (r * 7.13) % 1);
  const fem = ((r * 13.1) % 1) < .5, skirt = kind === "customer" && fem && ((r * 17.3) % 1) < .45;
  const long = kind === "staff" ? LONG.test(opts.role || "") : ((r * 19.7) % 1) < .5;
  const shirt = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: .62 }),   // own copy: some worlds recolour a shirt
   skin = M(THREE, pick(SKIN, (r * 3.7) % 1), .5), hair = M(THREE, pick(HAIR, (r * 5.3) % 1), .75);
  const pants = M(THREE, kind === "staff" ? "#1d2430" : pick(PANTS, (r * 2.9) % 1)), shoeM = M(THREE, pick(["#15181c", "#2b2420", "#3a2a1e", "#f4f4f1"], (r * 23.9) % 1), .45);
  const part = (parent, k, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo(THREE, k), m); me.position.set(x, y, z); parent.add(me); return me; };
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const s = (kind === "customer" ? .94 + ((r * 11.7) % 1) * .14 : 1) * (fem ? .96 : 1.02);
  body.scale.setScalar(s);
  part(body, fem ? "torsoB" : "torsoA", shirt);
  part(body, skirt ? "skirt" : "pelvis", skirt ? M(THREE, pick(CLOTHES, (r * 29.3) % 1)) : pants);
  const neck = new THREE.Group(); neck.position.y = 1.46; body.add(neck);
  part(neck, "neck", skin);
  const head = new THREE.Group(); neck.add(head);
  part(head, "head", skin); part(head, "eyes", M(THREE, "#231c18", .4)); part(head, "mouth", M(THREE, "#a85a50", .5));
  const hairK = fem ? pick(["hairLong", "hairBun", "hairLong", "hairCurly"], (r * 31.1) % 1) : pick(["hairShort", "hairShort", "hairCurly", null], (r * 31.1) % 1);
  const hairMesh = hairK ? part(head, hairK, hair) : null;
  const legs = [], arms = [], knees = [], elbows = [];
  for (const sd of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sd * .088, .88, 0); body.add(hip);
    part(hip, "thigh", skirt ? skin : pants);
    const knee = new THREE.Group(); knee.position.y = -.40; hip.add(knee);
    part(knee, "shin", skirt ? skin : pants);
    const ankle = new THREE.Group(); ankle.position.y = -.41; knee.add(ankle); part(ankle, "shoe", shoeM);
    legs.push(hip); knees.push(knee);
    const sh = new THREE.Group(); sh.position.set(sd * (fem ? .175 : .19), 1.39, 0); sh.rotation.z = sd * .07; body.add(sh);
    part(sh, "upperArm", long ? shirt : skin); if (!long) part(sh, "sleeve", shirt);
    const el = new THREE.Group(); el.position.y = -.28; sh.add(el);
    part(el, "forearm", long ? shirt : skin);
    const hand = part(el, "hand", skin, 0, -.24, 0); if (sd > 0) hand.scale.x = -1;
    arms.push(sh); elbows.push(el);
  }
  if (kind === "staff") {                         // name badge, and a lanyard for the Duty Manager
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.07, .045, .01), M(THREE, "#ffffff")); badge.position.set(.08, 1.25, .118); body.add(badge);
    if (opts.role === "Duty Manager") { const ly = new THREE.Mesh(new THREE.TorusGeometry(.12, .009, 6, 20, Math.PI), M(THREE, "#e66767")); ly.position.set(0, 1.36, .07); ly.rotation.set(Math.PI / 2.3, 0, Math.PI); body.add(ly); }
  }
  if (opts.role === "Cook") {                     // chef's hat and apron
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(.11, .095, .17, 14), M(THREE, "#ffffff")); hat.position.y = .3; head.add(hat); if (hairMesh) hairMesh.visible = false;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(.3, .5, .02), M(THREE, "#d9dde2")); apron.position.set(0, .98, .125); body.add(apron);
  }
  if (opts.role === "Café") { const apron = new THREE.Mesh(new THREE.BoxGeometry(.3, .5, .02), M(THREE, "#2b2420")); apron.position.set(0, .98, .125); body.add(apron); }
  // what they can hold: a stock carton (staff), a basket (customers)
  const carry = new THREE.Mesh(new THREE.BoxGeometry(.38, .26, .3), M(THREE, kind === "staff" ? "#b88a52" : "#d23b3b"));
  carry.position.set(0, 1.0, .3); carry.visible = false; body.add(carry);
  if (kind === "customer" && r > .55) { carry.scale.set(.9, .55, .7); carry.position.set(.27, .78, .05); carry.visible = true; }
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 1.8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = .9; g.add(hit);
  g.userData.personId = opts.id || "p" + (n++);
  return { g, body, legs, arms, knees, elbows, head, neck, hair: hairMesh, carry, hit, shirtHex, phase: r * 6.28 };
}

/* Work wear for the warehouse: a hi-vis vest with reflective bands, a hard hat, a cold-store jacket */
export function workwear(THREE, p, o = {}) {
  if (o.vest) { const v = new THREE.Mesh(geo(THREE, "vest"), M(THREE, o.vest, .5)); p.body.add(v);
    p.body.add(new THREE.Mesh(geo(THREE, "vestBands"), M(THREE, "#e9eef3", .25))); }
  if (o.jacket) p.body.children.forEach(c => { if (c.geometry === geo(THREE, "torsoA") || c.geometry === geo(THREE, "torsoB")) c.material = M(THREE, o.jacket); });
  if (o.hat) { const h = new THREE.Mesh(geo(THREE, "hardHat"), M(THREE, o.hat, .35)); p.head.add(h); if (p.hair) p.hair.visible = false; }
}

/* pose: walking (legs and arms swing, knees and elbows bend), working (hands busy at shelf height),
   sitting (thighs level, shins down, hands on the desk), idle (a little sway) */
export function pose(p, state, t, still) {
  const w = still ? 0 : 1, K = p.knees || [], E = p.elbows || [];
  const held = p.carry.visible && p.carryHeld;
  if (state === "walk") {
    const ph = t * 9 + p.phase, a = Math.sin(ph) * .5 * w;
    p.legs[0].rotation.x = a; p.legs[1].rotation.x = -a;
    if (K[0]) { K[0].rotation.x = (.15 + Math.max(0, Math.sin(ph + 1.9)) * .9) * w; K[1].rotation.x = (.15 + Math.max(0, Math.sin(ph + 1.9 + Math.PI)) * .9) * w; }
    p.arms[0].rotation.x = held ? -.75 : -a * .8; p.arms[1].rotation.x = held ? -.75 : a * .8;
    if (E[0]) { E[0].rotation.x = held ? -.9 : -.25 - Math.max(0, a) * .4; E[1].rotation.x = held ? -.9 : -.25 - Math.max(0, -a) * .4; }
    p.body.position.y = Math.abs(Math.sin(ph)) * .025 * w; p.body.rotation.x = 0;
  } else if (state === "work") {
    p.legs[0].rotation.x = 0; p.legs[1].rotation.x = 0; if (K[0]) K[0].rotation.x = K[1].rotation.x = .05; p.body.position.y = 0;
    p.arms[0].rotation.x = -.8 + Math.sin(t * 5 + p.phase) * .3 * w; p.arms[1].rotation.x = -.6 + Math.sin(t * 5 + p.phase + 1.7) * .3 * w;
    if (E[0]) { E[0].rotation.x = -.7 + Math.sin(t * 5 + p.phase + .6) * .25 * w; E[1].rotation.x = -.8 + Math.sin(t * 5 + p.phase + 2.2) * .25 * w; }
    p.body.rotation.x = .08;
  } else if (state === "sit") {
    p.legs[0].rotation.x = p.legs[1].rotation.x = -1.5; if (K[0]) K[0].rotation.x = K[1].rotation.x = 1.5;
    p.body.position.y = -.4; p.body.rotation.x = 0;
    p.arms[0].rotation.x = -.35; p.arms[1].rotation.x = -.35 + Math.sin(t * 1.5 + p.phase) * .08 * w;
    if (E[0]) { E[0].rotation.x = -1.0 + Math.sin(t * 6 + p.phase) * .06 * w; E[1].rotation.x = -1.0 + Math.sin(t * 6 + p.phase + 2) * .06 * w; }
  } else {
    p.legs[0].rotation.x = 0; p.legs[1].rotation.x = 0; if (K[0]) K[0].rotation.x = K[1].rotation.x = 0; p.body.position.y = 0; p.body.rotation.x = 0;
    p.arms[0].rotation.x = Math.sin(t * 1.2 + p.phase) * .05 * w; p.arms[1].rotation.x = -Math.sin(t * 1.2 + p.phase) * .05 * w;
    if (E[0]) { E[0].rotation.x = -.12; E[1].rotation.x = -.12; }
    if (p.neck) p.neck.rotation.y = Math.sin(t * .4 + p.phase) * .25 * w;
  }
}

/* speech bubbles and name tags as sprites */
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
export function bubbleSprite(THREE, text, tone = "say") {
  const c = document.createElement("canvas"), x = c.getContext("2d");
  x.font = "600 30px 'Plus Jakarta Sans', system-ui, sans-serif";
  const w = Math.min(760, Math.ceil(x.measureText(text).width) + 44); c.width = w; c.height = 84;
  const bg = { say: "#ffffff", radio: "#ffe39a", warn: "#ffd2d2", done: "#c9f2dc" }[tone] || "#ffffff";
  x.fillStyle = bg; rr(x, 2, 2, w - 4, 60, 18); x.fill();
  x.beginPath(); x.moveTo(w / 2 - 12, 61); x.lineTo(w / 2, 80); x.lineTo(w / 2 + 12, 61); x.fill();
  x.fillStyle = "#101826"; x.font = "600 30px 'Plus Jakarta Sans', system-ui, sans-serif"; x.textBaseline = "middle";
  let t = text; while (x.measureText(t).width > w - 40 && t.length > 4) t = t.slice(0, -2); x.fillText(t === text ? t : t + "…", 22, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const h = .34; sp.scale.set(h * w / 84, h, 1); sp.renderOrder = 20; return sp;
}
export function tagSprite(THREE, name, role, col) {
  const c = document.createElement("canvas"); c.width = 360; c.height = 64; const x = c.getContext("2d");
  x.fillStyle = "rgba(9,14,22,.88)"; rr(x, 2, 2, 356, 60, 14); x.fill();
  x.fillStyle = col; x.beginPath(); x.arc(30, 32, 11, 0, 7); x.fill();
  x.fillStyle = "#eaf0f6"; x.font = "700 26px 'Plus Jakarta Sans', system-ui, sans-serif"; x.textBaseline = "middle";
  x.fillText((role === "Duty Manager" ? "★ " : "") + name, 52, 24);
  x.fillStyle = "#9fb0c4"; x.font = "500 17px 'JetBrains Mono', monospace"; x.fillText(role.toUpperCase(), 52, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(.9, .16, 1); sp.renderOrder = 19; return sp;
}

/* a shopping trolley: wire basket, child seat flap, handle and four wheels (front of the person when pushed) */
export function makeTrolley(THREE) {
  const g = new THREE.Group();
  const wire = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: .6, roughness: .35, transparent: true, opacity: .75 });
  const solid = new THREE.MeshStandardMaterial({ color: 0x8d99a6, metalness: .7, roughness: .3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: .5 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(.5, .38, .78), wire); b.position.set(0, .72, 0); g.add(b);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(.46, .03, .7), solid); bot.position.set(0, .2, 0); g.add(bot);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .54, 8), red); h.rotation.z = Math.PI / 2; h.position.set(0, .98, -.43); g.add(h);
  for (const x of [-.22, .22]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.02, .78, .02), solid); r.position.set(x, .5, -.36); r.rotation.x = -.12; g.add(r); }
  for (const x of [-.2, .2]) for (const z of [-.32, .32]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .03, 10), new THREE.MeshStandardMaterial({ color: 0x1d2430 })); w.rotation.z = Math.PI / 2; w.position.set(x, .05, z); g.add(w); }
  return g;
}
/* a red hand basket */
export function makeBasket(THREE) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: .5 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(.42, .2, .3), m); b.position.y = .1; g.add(b);
  return g;
}
