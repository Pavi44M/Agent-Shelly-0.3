/* Walkable grid + A* pathfinding for the store team and customers.
   The grid covers the building in 25 cm cells. A cell is walkable when it is on the
   sales floor, in the back of house or on the footpath outside the entrance, and
   is clear of every fixture and wall (inflated by a body radius). Paths are
   string-pulled so people walk in straight lines between corners. */
export function makeNav({ bounds, walkable, blocked, cell = 0.25 }) {
  const [x0, z0, x1, z1] = bounds;
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
  const ok = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
    ok[j * W + i] = walkable(x, z) && !blocked(x, z) ? 1 : 0;
  }
  const toCell = (x, z) => [Math.max(0, Math.min(W - 1, Math.floor((x - x0) / cell))), Math.max(0, Math.min(H - 1, Math.floor((z - z0) / cell)))];
  const toWorld = (i, j) => [x0 + (i + .5) * cell, z0 + (j + .5) * cell];

  function nearestOpen(i, j) {
    if (ok[j * W + i]) return [i, j];
    for (let r = 1; r < 24; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W && b < H && ok[b * W + a]) return [a, b];
    }
    return [i, j];
  }
  function los(a, b) {            // straight line of walkable cells between two cells
    let [i0, j0] = a; const [i1, j1] = b; const di = Math.abs(i1 - i0), dj = Math.abs(j1 - j0), si = i0 < i1 ? 1 : -1, sj = j0 < j1 ? 1 : -1;
    let err = di - dj;
    for (;;) {
      if (!ok[j0 * W + i0]) return false;
      if (i0 === i1 && j0 === j1) return true;
      const e2 = 2 * err;
      if (e2 > -dj) { err -= dj; i0 += si; if (!ok[j0 * W + i0]) return false; }
      if (e2 < di) { err += di; j0 += sj; }
    }
  }
  /* binary heap A* with octile distance */
  const g = new Float32Array(W * H), from = new Int32Array(W * H), seen = new Int32Array(W * H);
  let stamp = 0;
  function find(ax, az, bx, bz) {
    const s = nearestOpen(...toCell(ax, az)), t = nearestOpen(...toCell(bx, bz));
    const S = s[1] * W + s[0], T = t[1] * W + t[0];
    if (S === T) return [[bx, bz]];
    stamp++;
    const heap = [], f = [];
    const push = (n, pr) => { heap.push([pr, n]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top[1]; };
    const h = n => { const dx = Math.abs(n % W - t[0]), dz = Math.abs(((n / W) | 0) - t[1]); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
    seen[S] = stamp; g[S] = 0; from[S] = -1; push(S, h(S));
    const closed = new Set();
    let found = false, guard = 0;
    while (heap.length && guard++ < 60000) {
      const n = pop(); if (n === T) { found = true; break; } if (closed.has(n)) continue; closed.add(n);
      const ni = n % W, nj = (n / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = ni + di, b = nj + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const m = b * W + a; if (!ok[m]) continue;
        if (di && dj && (!ok[nj * W + a] || !ok[b * W + ni])) continue;     // no corner cutting
        const cost = g[n] + (di && dj ? 1.414 : 1);
        if (seen[m] !== stamp || cost < g[m]) { seen[m] = stamp; g[m] = cost; from[m] = n; push(m, cost + h(m)); }
      }
    }
    if (!found) return [[bx, bz]];
    const cells = []; for (let n = T; n !== -1; n = from[n]) cells.push([n % W, (n / W) | 0]); cells.reverse();
    const out = []; let anchor = cells[0];
    for (let k = 2; k < cells.length; k++) if (!los(anchor, cells[k])) { anchor = cells[k - 1]; out.push(toWorld(...anchor)); }
    out.push([bx, bz]);
    return out;
  }
  const isOpen = (x, z) => { const [i, j] = toCell(x, z); return !!ok[j * W + i]; };
  const snap = (x, z) => toWorld(...nearestOpen(...toCell(x, z)));
  return { find, isOpen, snap, W, H };
}
