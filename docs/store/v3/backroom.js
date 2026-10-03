/* Back of house: storeroom racking, the walk-in chiller, the manager's office,
   the staff room, restrooms and the receiving dock, laid out from `backroom`
   in planogram.yaml. Returns the spots people use and the delivery pallets. */
export function buildBackroom(ctx) {
  const { THREE, scene, ST, wx, wz, box, mat, glow, colliders, buildWall } = ctx;
  const BR = ST.backroom || {};
  const S = ST.plan.px_to_m;
  const rectW = r => ({ x: wx((r[0] + r[2]) / 2), z: wz((r[1] + r[3]) / 2), w: (r[2] - r[0]) * S, d: (r[3] - r[1]) * S });
  const solid = (x, z, w, d) => colliders.push({ cx: x, cz: z, hw: w / 2, hd: d / 2, rot: 0 });
  const g = new THREE.Group(); scene.add(g);

  // room floors and labels
  (BR.rooms || []).forEach(rm => {
    const r = rectW(rm.rect);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), mat(rm.floor || "#2a333d")); f.rotation.x = -Math.PI / 2; f.position.set(r.x, .004, r.z); g.add(f);
    const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d");
    x.fillStyle = "rgba(234,240,246,.85)"; x.font = "700 44px 'JetBrains Mono', monospace"; x.textBaseline = "middle"; x.fillText(rm.name.toUpperCase(), 10, 48);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(r.w - .2, 3.2), Math.min(r.w - .2, 3.2) * 96 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(r.x, .012, r.z + (rm.id === "storeroom" ? -r.d / 2 + .35 : rm.id === "dock" ? r.d / 2 - .35 : 0)); g.add(lab);
  });
  // walls (lower than the shop)
  const BW = mat("#d9d6cf");
  (BR.walls || []).forEach(([a, b, kind]) => buildWall(a, b, kind === "dock" ? undefined : kind, 2.6, BW));

  // storeroom racking: uprights, beams and cartons on three levels
  const UP = mat("#2f5f9e"), BEAM = mat("#e08a3a"), CART = ["#b88a52", "#c79a62", "#a77a45", "#d9b07a", "#8f6a3c"];
  const rackSpots = [];
  (BR.racks || []).forEach((rk, k) => {
    const r = rectW(rk), along = r.w >= r.d, L = along ? r.w : r.d, D = along ? r.d : r.w;
    const rg = new THREE.Group(); rg.position.set(r.x, 0, r.z); rg.rotation.y = along ? 0 : Math.PI / 2; g.add(rg);
    const bays = Math.max(1, Math.round(L / 1.2)), bw = L / bays;
    for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) box(rg, .06, 2.3, .06, -L / 2 + i * bw, 1.15, s * (D / 2 - .03), UP);
    [.15, .95, 1.75].forEach((y, lv) => {
      for (const s of [-1, 1]) box(rg, L, .08, .05, 0, y, s * (D / 2 - .03), BEAM);
      box(rg, L, .03, D, 0, y + .05, 0, mat("#9aa3a7"));
      for (let i = 0; i < bays; i++) for (let c = 0; c < 3; c++) {
        if (((k * 7 + i * 3 + c + lv) % 5) === 0) continue;   // some gaps: stock goes out to the shelves
        const h = .3 + ((i + c + lv) % 3) * .1;
        box(rg, bw / 3 - .05, h, D - .12, -L / 2 + i * bw + (c + .5) * bw / 3, y + .07 + h / 2, 0, mat(CART[(i + c + lv + k) % CART.length]));
      }
    });
    solid(r.x, r.z, r.w, r.d);
    // pick spots on both long sides
    for (let i = 0; i < bays; i++) for (const s of [-1, 1]) {
      const lx = -L / 2 + (i + .5) * bw, lz = s * (D / 2 + .45);
      rackSpots.push(along ? [r.x + lx, r.z + lz] : [r.x + lz, r.z + lx]);
    }
  });

  const P = (k, dx = 0, dz = 0) => { const p = (BR.spots || {})[k]; return p ? [wx(p[0]) + dx, wz(p[1]) + dz] : null; };
  // manager's office: desk, monitor, chair, filing cabinet
  const desk = P("desk");
  if (desk) {
    box(g, 1.5, .74, .75, desk[0], .37, desk[1], mat("#6b4a2f"));
    box(g, .55, .34, .04, desk[0] - .2, .97, desk[1] - .2, mat("#1d2430"));
    box(g, .5, .29, .01, desk[0] - .2, .97, desk[1] - .175, glow("#3f8fb5"));
    box(g, .35, .02, .14, desk[0] - .2, .755, desk[1] + .05, mat("#26292b"));
    box(g, .45, 1.3, .6, desk[0] + 1.15, .65, desk[1] - .35, mat("#8a949c"));
    solid(desk[0], desk[1], 1.5, .75); solid(desk[0] + 1.15, desk[1] - .35, .45, .6);
    const ch = P("desk_chair"); if (ch) { box(g, .5, .08, .5, ch[0], .48, ch[1] + .25, mat("#1d2430")); box(g, .5, .55, .08, ch[0], .78, ch[1] + .5, mat("#1d2430")); }
  }
  // staff room: table, chairs, fridge, bench with kettle and microwave, lockers
  const tb = P("staff_table");
  const seats = [];
  if (tb) {
    box(g, 1.4, .74, .8, tb[0], .37, tb[1], mat("#e7e1d4")); solid(tb[0], tb[1], 1.4, .8);
    [[-.45, -.65], [.45, -.65], [-.45, .65], [.45, .65]].forEach(([dx, dz]) => {
      box(g, .42, .06, .42, tb[0] + dx, .46, tb[1] + dz, mat("#c0392b")); box(g, .42, .45, .05, tb[0] + dx, .7, tb[1] + dz + Math.sign(dz) * .2, mat("#c0392b"));
      seats.push([tb[0] + dx, tb[1] + dz, dz < 0 ? 0 : Math.PI]);
    });
    const rm = (BR.rooms || []).find(r => r.id === "staffroom");
    if (rm) { const r = rectW(rm.rect);
      box(g, .6, 1.8, .6, r.x + r.w / 2 - .4, .9, r.z - r.d / 2 + .45, mat("#e9eef2")); solid(r.x + r.w / 2 - .4, r.z - r.d / 2 + .45, .6, .6);
      box(g, 1.2, .9, .55, r.x + r.w / 2 - .4, .45, r.z + r.d / 2 - .4, mat("#9aa3a7"));
      box(g, .45, .28, .32, r.x + r.w / 2 - .6, 1.04, r.z + r.d / 2 - .4, mat("#26292b"));
      box(g, .14, .2, .14, r.x + r.w / 2 - .15, .99, r.z + r.d / 2 - .4, mat("#d9d6cf"));
      solid(r.x + r.w / 2 - .4, r.z + r.d / 2 - .4, 1.2, .55);
    }
  }
  // restrooms: toilet and basin in each
  ["restroom_a", "restroom_b"].forEach(k => { const p = P(k); if (!p) return;
    box(g, .4, .42, .6, p[0], .21, p[1] + 1.05, mat("#f4f6f8")); box(g, .4, .45, .15, p[0], .6, p[1] + 1.3, mat("#f4f6f8"));
    box(g, .45, .15, .35, p[0] - .55, .85, p[1] + .9, mat("#f4f6f8")); });
  // walk-in chiller: cold shelving
  const coolerRoom = (BR.rooms || []).find(r => r.id === "cooler");
  if (coolerRoom) { const r = rectW(coolerRoom.rect);
    for (const s of [-1, 1]) { box(g, .5, 1.9, r.d - .6, r.x + s * (r.w / 2 - .35), .95, r.z, mat("#c9d2d6")); solid(r.x + s * (r.w / 2 - .35), r.z, .5, r.d - .6);
      for (let i = 0; i < 8; i++) box(g, .4, .25, .35, r.x + s * (r.w / 2 - .35), .3 + (i % 4) * .45, r.z - r.d / 2 + .6 + Math.floor(i / 4) * (r.d - 1.2), mat(["#ffffff", "#3a78c9", "#e2b33c", "#f2f2f2"][i % 4])); }
  }
  // receiving dock: roller door frame in the gap and the delivery pallets (shown on delivery days)
  const dock = P("dock");
  const pallets = new THREE.Group(); g.add(pallets); pallets.visible = false;
  if (dock) {
    const dz0 = wz(1150), dz1 = wz(1260), dxw = wx(45);
    box(g, .2, .4, dz1 - dz0 + .3, dxw, 2.4, (dz0 + dz1) / 2, mat("#e0a53a"));
    for (let i = 0; i < 6; i++) box(g, .03, .1, dz1 - dz0, dxw - .02, 2.15 - i * .1, (dz0 + dz1) / 2, mat("#9aa3a7"));
    const n = (ST.operations && ST.operations.deliveries && ST.operations.deliveries.pallets) || 6;
    for (let i = 0; i < n; i++) {
      const px = dock[0] + .3 + (i % 2) * 1.25, pz = dock[1] - 1.3 + Math.floor(i / 2) * 1.25;
      const pg = new THREE.Group(); pg.position.set(px, 0, pz); pallets.add(pg);
      box(pg, 1.1, .14, 1.1, 0, .07, 0, mat("#a77a45"));
      const h = .9 + (i % 3) * .25; box(pg, 1.0, h, 1.0, 0, .14 + h / 2, 0, mat(CART[i % CART.length]));
      box(pg, 1.02, h * .98, 1.02, 0, .14 + h / 2, 0, new THREE.MeshLambertMaterial({ color: 0xdfeaf2, transparent: true, opacity: .25, depthWrite: false }));
    }
  }
  return { rackSpots, seats, pallets, spot: P };
}
