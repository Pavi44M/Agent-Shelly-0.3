/* Shelly kit: a small .glb reader for the Blender models (v2.6).
   Mesh nodes with their parents and transforms, positions, normals, indices, and each material's colour,
   roughness, metalness and transparency. That is all scripts/blender/build_tower_3d.py exports (no textures). */
import * as THREE from "./vendor/three.module.min.js";

const MATS = new Map();
export async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a GLB file");
  const jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const bin = 20 + jl + 8;
  const arr = i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = bin + (v.byteOffset || 0) + (a.byteOffset || 0),
    n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    return new T(buf.slice(off, off + n * T.BYTES_PER_ELEMENT)); };
  const material = i => {
    const m = J.materials[i], key = m.name;
    if (MATS.has(key)) return MATS.get(key);
    const p = m.pbrMetallicRoughness || {}, c = p.baseColorFactor || [1, 1, 1, 1], blend = m.alphaMode === "BLEND";
    const mm = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), roughness: p.roughnessFactor ?? .8, metalness: p.metallicFactor ?? 0,
      transparent: blend, opacity: blend ? c[3] : 1, depthWrite: !blend, side: blend ? THREE.DoubleSide : THREE.FrontSide });
    if (key === "led" || key === "pad_mark") { mm.emissive = mm.color.clone(); mm.emissiveIntensity = .7; }
    MATS.set(key, mm); return mm;
  };
  const make = idx => {
    const n = J.nodes[idx], o = n.mesh !== undefined ? new THREE.Group() : new THREE.Group();
    o.name = n.name || "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.mesh !== undefined) for (const p of J.meshes[n.mesh].primitives) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(arr(p.attributes.POSITION), 3));
      if (p.attributes.NORMAL !== undefined) g.setAttribute("normal", new THREE.BufferAttribute(arr(p.attributes.NORMAL), 3));
      if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(arr(p.indices), 1));
      if (p.attributes.NORMAL === undefined) g.computeVertexNormals();
      const me = new THREE.Mesh(g, p.material !== undefined ? material(p.material) : new THREE.MeshStandardMaterial());
      me.name = o.name; if (me.material.transparent) me.renderOrder = 2; o.add(me);
    }
    (n.children || []).forEach(c => o.add(make(c)));
    return o;
  };
  const root = new THREE.Group();
  (J.scenes[J.scene || 0].nodes).forEach(i => root.add(make(i)));
  return root;
}

