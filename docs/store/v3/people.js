/* People for the store floor, drawn the same way as the agents in Shelly HQ v2:
   a capsule body in a role-coloured shirt, a round head, capsule arms, plus legs
   so they can walk. Staff wear the store polo; the Duty Manager has a gold
   lanyard and a ★ tag; customers wear their own clothes and some carry a basket. */
export const ROLE_SHIRT = { "Duty Manager": "#f2c14e", "Store Team": "#1f8a5b", "Store Manager": "#2f5f9e", "Cook": "#f4f4f1", "Café": "#8a5a3b", customer: null };
const SKIN = ["#f1c9a5", "#e0ac84", "#c68c5f", "#a26a42", "#7a4b2c", "#f6d7bd"];
const HAIR = ["#1d1a17", "#3b2a1e", "#6b4a2f", "#b8864b", "#d9c08a", "#8a8f94", "#2a2420"];
const CLOTHES = ["#d94a3d", "#3d7dd9", "#7a5cc4", "#e08a3a", "#2a9d8f", "#e85d9a", "#556070", "#c9b48a", "#7fb3d5", "#a23b72", "#334155", "#f4f1ea"];
const PANTS = ["#26303b", "#3a4a5e", "#1d2430", "#5b4a3a", "#2e3a2e", "#4a4f57"];

let n = 0;
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

export function makePerson(THREE, opts) {
  const r = opts.seed ?? Math.random();
  const kind = opts.kind;                         // "staff" | "customer"
  const shirtHex = kind === "staff" ? ROLE_SHIRT[opts.role] || "#1f8a5b" : pick(CLOTHES, (r * 7.13) % 1);
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: .65 });
  const shirt = M(shirtHex), skin = M(pick(SKIN, (r * 3.7) % 1)), hair = M(pick(HAIR, (r * 5.3) % 1)), pants = M(kind === "staff" ? "#1d2430" : pick(PANTS, (r * 2.9) % 1));
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const s = kind === "customer" ? .94 + ((r * 11.7) % 1) * .14 : 1;
  body.scale.setScalar(s);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .3, 6, 12), shirt); torso.position.y = 1.13; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.125, 18, 14), skin); head.position.y = 1.54; body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), hair); cap.position.y = 1.555; cap.rotation.x = -.18; body.add(cap);
  const legs = [], arms = [];
  for (const sd of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sd * .085, .82, 0); body.add(hip);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .5, 4, 8), pants); leg.position.y = -.38; hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .2), M("#15181c")); shoe.position.set(0, -.69, .04); hip.add(shoe);
    legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(sd * .22, 1.3, 0); body.add(sh);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .4, 4, 8), shirt); arm.position.y = -.24; sh.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), skin); hand.position.y = -.5; sh.add(hand);
    arms.push(sh);
  }
  if (kind === "staff") {                         // name badge, and a lanyard for the Duty Manager
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.07, .045, .01), M("#ffffff")); badge.position.set(.08, 1.22, .175); body.add(badge);
    if (opts.role === "Duty Manager") { const ly = new THREE.Mesh(new THREE.TorusGeometry(.12, .012, 6, 20, Math.PI), M("#e66767")); ly.position.set(0, 1.33, .12); ly.rotation.set(Math.PI / 2.3, 0, Math.PI); body.add(ly); }
  }
  if (opts.role === "Cook") {                     // chef's hat and apron
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(.11, .09, .16, 14), M("#ffffff")); hat.position.y = 1.72; body.add(hat);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(.3, .42, .02), M("#d9dde2")); apron.position.set(0, .98, .17); body.add(apron);
  }
  if (opts.role === "Café") { const apron = new THREE.Mesh(new THREE.BoxGeometry(.3, .45, .02), M("#2b2420")); apron.position.set(0, .98, .17); body.add(apron); }
  // what they can hold: a stock carton (staff), a basket (customers)
  const carry = new THREE.Mesh(new THREE.BoxGeometry(.38, .26, .3), M(kind === "staff" ? "#b88a52" : "#d23b3b"));
  carry.position.set(0, 1.0, .3); carry.visible = false; body.add(carry);
  if (kind === "customer" && r > .55) { carry.scale.set(.9, .55, .7); carry.position.set(.27, .78, .05); carry.visible = true; }
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 1.8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = .9; g.add(hit);
  g.userData.personId = opts.id || "p" + (n++);
  return { g, body, legs, arms, head, carry, hit, shirtHex, phase: r * 6.28 };
}

/* pose: walking (legs and arms swing), working (arms busy at shelf height), sitting, idle */
export function pose(p, state, t, still) {
  const w = still ? 0 : 1;
  if (state === "walk") {
    const a = Math.sin(t * 9 + p.phase) * .55 * w;
    p.legs[0].rotation.x = a; p.legs[1].rotation.x = -a;
    p.arms[0].rotation.x = p.carry.visible && p.carryHeld ? -1.1 : -a * .8; p.arms[1].rotation.x = p.carry.visible && p.carryHeld ? -1.1 : a * .8;
    p.body.position.y = Math.abs(Math.sin(t * 9 + p.phase)) * .03 * w; p.body.rotation.x = 0;
  } else if (state === "work") {
    p.legs[0].rotation.x = 0; p.legs[1].rotation.x = 0; p.body.position.y = 0;
    p.arms[0].rotation.x = -1.2 + Math.sin(t * 5 + p.phase) * .35 * w; p.arms[1].rotation.x = -1.0 + Math.sin(t * 5 + p.phase + 1.7) * .35 * w;
    p.body.rotation.x = .08;
  } else if (state === "sit") {
    p.legs[0].rotation.x = -1.45; p.legs[1].rotation.x = -1.45; p.body.position.y = -.36; p.body.rotation.x = 0;
    p.arms[0].rotation.x = -.7; p.arms[1].rotation.x = -.7 + Math.sin(t * 1.5 + p.phase) * .1 * w;
  } else {
    p.legs[0].rotation.x = 0; p.legs[1].rotation.x = 0; p.body.position.y = 0; p.body.rotation.x = 0;
    p.arms[0].rotation.x = Math.sin(t * 1.2 + p.phase) * .05 * w; p.arms[1].rotation.x = -Math.sin(t * 1.2 + p.phase) * .05 * w;
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
