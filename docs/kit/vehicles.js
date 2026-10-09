/* Shelly vehicles: truck cabs, vans, cars, wheels, forklifts, trees and yard props modelled in Blender
   (blender/shelly_vehicles_build.py -> kit/vehicle-mesh.js). Geometry is decoded once and shared;
   each part gets its own material (fleet paint, glass, black trim, chrome, rubber, alloy). */
import { VEHICLE } from "./vehicle-mesh.js";

let GEO = null;
export function vgeo(THREE, k) {
  if (!GEO) {
    GEO = {};
    const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    for (const [key, [p, nn, ix]] of Object.entries(VEHICLE)) {
      const P = new Int16Array(b64(p)), F = new Float32Array(P.length); for (let i = 0; i < P.length; i++) F[i] = P[i] / 2000;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(F, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(b64(nn)), 3, true));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64(ix)), 1)); g.computeBoundingSphere(); g.userData.shared = true; GEO[key] = g;
    }
  }
  return GEO[k];
}
const MATS = {};
export function vmat(THREE, kind, colour) {
  const k = kind + (colour || "");
  if (MATS[k]) return MATS[k];
  const o = {
    paint: { color: colour, metalness: .35, roughness: .32 },
    glass: { color: "#18222e", metalness: .9, roughness: .06 },
    black: { color: "#23272d", metalness: .1, roughness: .62 },
    chrome: { color: "#e3e8ee", metalness: 1, roughness: .18 },
    rubber: { color: "#18191c", metalness: 0, roughness: .92 },
    alloy: { color: "#c3cad3", metalness: .85, roughness: .28 },
    steel: { color: "#4a525c", metalness: .6, roughness: .45 },
    bark: { color: "#6b4c33", roughness: .95 },
    leaf: { color: colour || "#4f9e4a", roughness: .85 },
  }[kind];
  const m = new THREE.MeshStandardMaterial(o); m.userData.shared = true; return (MATS[k] = m);
}
function part(THREE, g, key, m, shadows) { const me = new THREE.Mesh(vgeo(THREE, key), m); me.castShadow = !!shadows; me.receiveShadow = !!shadows; g.add(me); return me; }

/* a wheel (tyre + rim), axle along x; flip for the left side so the rim faces out */
export function wheel(THREE, kind = "truck", left = false, shadows = false) {
  const g = new THREE.Group();
  part(THREE, g, kind + "Tyre", vmat(THREE, "rubber"), shadows); part(THREE, g, kind + "Rim", vmat(THREE, kind === "truck" ? "steel" : "alloy"), false);
  if (left) g.scale.x = -1;
  return g;
}
/* truck cab (cab-over), front face at z = 0, extends back 2.45 m */
export function cab(THREE, colour, shadows = false) {
  const g = new THREE.Group();
  part(THREE, g, "cabPaint", vmat(THREE, "paint", colour), shadows);
  part(THREE, g, "cabGlass", vmat(THREE, "glass")); part(THREE, g, "cabBlack", vmat(THREE, "black"), shadows); part(THREE, g, "cabChrome", vmat(THREE, "chrome"));
  return g;
}
/* van, centred, 5.7 m long */
export function van(THREE, colour, shadows = false) {
  const g = new THREE.Group();
  part(THREE, g, "vanPaint", vmat(THREE, "paint", colour), shadows); part(THREE, g, "vanGlass", vmat(THREE, "glass")); part(THREE, g, "vanBlack", vmat(THREE, "black"));
  const wh = [];
  for (const z of [1.85, -1.75]) for (const s of [-1, 1]) { const w = wheel(THREE, "car", s < 0, shadows); w.scale.multiplyScalar(1.12); w.position.set(s * .9, .37, z); g.add(w); wh.push(w); }
  g.userData.wheels = wh; return g;
}
/* car: "saloon" | "hatch" | "suv", centred */
export function car(THREE, kind, colour, shadows = false) {
  const g = new THREE.Group();
  part(THREE, g, kind + "Paint", vmat(THREE, "paint", colour), shadows); part(THREE, g, kind + "Glass", vmat(THREE, "glass")); part(THREE, g, kind + "Black", vmat(THREE, "black"));
  const wb = kind === "suv" ? [1.45, -1.4] : kind === "hatch" ? [1.3, -1.25] : [1.38, -1.35], wd = kind === "suv" ? .86 : .8, y = kind === "suv" ? .4 : .33;
  const wh = [];
  for (const z of wb) for (const s of [-1, 1]) { const w = wheel(THREE, "car", s < 0, shadows); if (kind === "suv") w.scale.set(w.scale.x * 1.15, 1.15, 1.15); w.position.set(s * wd, y, z); g.add(w); wh.push(w); }
  g.userData.wheels = wh; return g;
}
/* forklift body (paint, guard, mast); the fork carriage is separate so it can lift */
export function forklift(THREE, colour = "#f5a623", shadows = false) {
  const g = new THREE.Group();
  part(THREE, g, "liftPaint", vmat(THREE, "paint", colour), shadows); part(THREE, g, "liftBlack", vmat(THREE, "black"), shadows); part(THREE, g, "liftMast", vmat(THREE, "steel"), shadows);
  for (const [x, z] of [[-.5, .62], [.5, .62], [-.5, -.8], [.5, -.8]]) { const w = wheel(THREE, "lift", x < 0, shadows); w.position.set(x, .27, z); g.add(w); }
  const carriage = new THREE.Group(); part(THREE, carriage, "forkCarriage", vmat(THREE, "steel"), shadows);
  return { g, carriage };
}
export function reefer(THREE) { const g = new THREE.Group(); part(THREE, g, "reefer", vmat(THREE, "paint", "#e9edf1")); part(THREE, g, "reeferGrille", vmat(THREE, "black")); return g; }
export function tree(THREE, kind = "A", leaf = "#4f9e4a", shadows = false) {
  const g = new THREE.Group(); part(THREE, g, "treeTrunk", vmat(THREE, "bark"), shadows); part(THREE, g, "treeCrown" + kind, vmat(THREE, "leaf", leaf), shadows); return g;
}
