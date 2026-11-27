/* Painted muscle regions (prototype).

   Every triangle of the model can belong to one muscle side ("<labelId>|left" or "|right"). A click on the
   model looks up the triangle that was hit, so a muscle is identified from any angle, and the selected
   muscle is drawn as a tinted surface with an outline that follows its 3D shape.

   Authoring (Author mode, local server only): a brush paints or erases triangles, a fill spreads from a
   clicked point until it reaches the white tendon and fascia lines of the model's texture, and a mirror
   copies one side to the other (the model is symmetric about x = 0 in modelRoot space; the figure's
   left is +x because it faces the camera).

   Stored in data/muscle-regions.json, separate from data/muscle-labels.json:
   { version, model, meshes: { meshName: triangleCount }, regions: { "<id>|<side>": { meshName: "a-b,c,..." } } }
   Triangle lists are run-length encoded ranges of triangle indices. Labels without a painted region keep
   working exactly as before (anchor point and the old click polygon). */

import * as THREE from "three";

const HIGHLIGHT = 0x4ba3e3;   // platform sky blue
const OUTLINE = 0x025287;     // platform navy
const PAINT = 0xf59e0b;       // amber while authoring
const OTHER = 0x94a3b8;       // other painted regions while authoring

export function encodeRanges(sorted) {
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    out.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return out.join(",");
}

export function decodeRanges(text) {
  const out = [];
  for (const part of String(text || "").split(",")) {
    if (!part) continue;
    const [a, b] = part.split("-").map(Number);
    if (Number.isNaN(a)) continue;
    for (let t = a; t <= (Number.isNaN(b) || b === undefined ? a : b); t++) out.push(t);
  }
  return out;
}

export function createRegionSystem({ modelRoot, meshes }) {
  modelRoot.updateMatrixWorld(true);
  const keys = [];                // index -> "id|side"
  const keyIndex = new Map();     // "id|side" -> index
  const info = new Map();         // meshName -> mesh data
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const toModel = new THREE.Matrix4();

  // ---------- per-mesh data: triangle owners, centroids in modelRoot space ----------
  for (const mesh of meshes) {
    const g = mesh.geometry;
    if (!g || !g.attributes.position) continue;
    const pos = g.attributes.position;
    const index = g.index ? g.index.array : null;
    const triCount = index ? index.length / 3 : pos.count / 3;
    const centroids = new Float32Array(triCount * 3);
    toModel.copy(modelRoot.matrixWorld).invert().multiply(mesh.matrixWorld);
    for (let t = 0; t < triCount; t++) {
      tmp.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        const v = index ? index[t * 3 + k] : t * 3 + k;
        tmp.x += pos.getX(v); tmp.y += pos.getY(v); tmp.z += pos.getZ(v);
      }
      tmp.multiplyScalar(1 / 3).applyMatrix4(toModel);
      centroids[t * 3] = tmp.x; centroids[t * 3 + 1] = tmp.y; centroids[t * 3 + 2] = tmp.z;
    }
    info.set(mesh.name, {
      mesh, triCount, index, centroids,
      owner: new Int32Array(triCount).fill(-1),
      neighbors: null, texel: null,
      overlay: null, otherOverlay: null, outline: null,
    });
  }

  // ---------- spatial grid over all centroids (brush and mirror lookups) ----------
  const CELL = 0.02;
  const grid = new Map();
  const cellKey = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  for (const [name, m] of info) {
    for (let t = 0; t < m.triCount; t++) {
      const k = cellKey(m.centroids[t * 3], m.centroids[t * 3 + 1], m.centroids[t * 3 + 2]);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(name, t);
    }
  }
  function nearby(x, y, z, r, fn) {
    const n = Math.ceil(r / CELL);
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const list = grid.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (let q = 0; q < list.length; q += 2) {
        const m = info.get(list[q]); const t = list[q + 1];
        const dx = m.centroids[t * 3] - x, dy = m.centroids[t * 3 + 1] - y, dz = m.centroids[t * 3 + 2] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r * r) fn(list[q], t, d2);
      }
    }
  }

  function keyId(key) {
    if (!keyIndex.has(key)) { keyIndex.set(key, keys.length); keys.push(key); }
    return keyIndex.get(key);
  }

  // ---------- adjacency (shared edges, vertices welded by position) and texture colour ----------
  function ensureNeighbors(m) {
    if (m.neighbors) return m.neighbors;
    const pos = m.mesh.geometry.attributes.position;
    const weld = new Map(); const wid = new Int32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      const k = `${Math.round(pos.getX(v) * 1e4)},${Math.round(pos.getY(v) * 1e4)},${Math.round(pos.getZ(v) * 1e4)}`;
      if (!weld.has(k)) weld.set(k, weld.size);
      wid[v] = weld.get(k);
    }
    const edges = new Map();
    const vert = (t, k) => wid[m.index ? m.index[t * 3 + k] : t * 3 + k];
    for (let t = 0; t < m.triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const a = vert(t, k), b = vert(t, (k + 1) % 3);
        const e = a < b ? `${a}_${b}` : `${b}_${a}`;
        const l = edges.get(e);
        if (l) l.push(t); else edges.set(e, [t]);
      }
    }
    const nb = Array.from({ length: m.triCount }, () => []);
    for (const l of edges.values()) for (let i = 0; i < l.length; i++) for (let j = 0; j < l.length; j++) if (i !== j) nb[l[i]].push(l[j]);
    m.neighbors = nb;
    return nb;
  }

  // Colour of the texture at each triangle (sampled at the centroid UV), as [r, g, b] 0–255.
  function ensureTexel(m) {
    if (m.texel !== null) return m.texel;
    const g = m.mesh.geometry; const uv = g.attributes.uv;
    const mat = Array.isArray(m.mesh.material) ? m.mesh.material[0] : m.mesh.material;
    const img = mat && mat.map && mat.map.image;
    if (!uv || !img || !img.width) { m.texel = false; return false; }
    const W = Math.min(1024, img.width), H = Math.round(img.height * W / img.width);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const flipY = mat.map.flipY;
    const out = new Uint8Array(m.triCount * 3);
    for (let t = 0; t < m.triCount; t++) {
      let u = 0, v = 0;
      for (let k = 0; k < 3; k++) { const i = m.index ? m.index[t * 3 + k] : t * 3 + k; u += uv.getX(i); v += uv.getY(i); }
      u = ((u / 3) % 1 + 1) % 1; v = ((v / 3) % 1 + 1) % 1;
      const px = Math.min(W - 1, Math.floor(u * W));
      const py = Math.min(H - 1, Math.floor((flipY ? 1 - v : v) * H));
      const o = (py * W + px) * 4;
      out[t * 3] = data[o]; out[t * 3 + 1] = data[o + 1]; out[t * 3 + 2] = data[o + 2];
    }
    m.texel = out;
    return out;
  }

  // Tendon / fascia / bone: pale, low-saturation texture. Muscle is a saturated red.
  function isBoundary(m, t, opts) {
    const tx = ensureTexel(m);
    if (!tx) return false;
    const r = tx[t * 3], g = tx[t * 3 + 1], b = tx[t * 3 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    return sat < opts.minSaturation || (r - Math.max(g, b)) < opts.minRedness;
  }

  // ---------- editing ----------
  function setTri(name, t, key) {
    const m = info.get(name); if (!m) return;
    m.owner[t] = key === null ? -1 : keyId(key);
  }

  function hitToModel(hit) { return modelRoot.worldToLocal(hit.point.clone()); }

  // Brush: every triangle whose centroid lies within `radius` (model units) of the hit point.
  function paintAt(hit, key, radius, erase = false) {
    const p = hitToModel(hit); const kid = erase ? null : keyId(key);
    let n = 0;
    nearby(p.x, p.y, p.z, radius, (name, t) => {
      const m = info.get(name);
      if (erase) { if (m.owner[t] === keyIndex.get(key)) { m.owner[t] = -1; n++; } }
      else if (m.owner[t] !== kid) { m.owner[t] = kid; n++; }
    });
    return n;
  }

  // Fill: flood across shared edges from the hit triangle, staying on muscle-coloured texture and within
  // maxDistance of the seed; never takes triangles that already belong to another muscle.
  function fillFrom(hit, key, opts = {}) {
    const o = { maxDistance: 0.35, maxTriangles: 60000, minSaturation: 0.38, minRedness: 40, ...opts };
    const name = hit.object.name; const m = info.get(name); if (!m) return 0;
    const nb = ensureNeighbors(m); const kid = keyId(key);
    const seed = hit.faceIndex; const p = hitToModel(hit);
    if (isBoundary(m, seed, o)) return 0; // clicked on tendon, fascia or bone: nothing to fill
    const seen = new Uint8Array(m.triCount); const queue = [seed]; seen[seed] = 1;
    let n = 0;
    while (queue.length && n < o.maxTriangles) {
      const t = queue.shift();
      if (m.owner[t] !== -1 && m.owner[t] !== kid) continue;
      if (t !== seed && isBoundary(m, t, o)) continue;
      if (t !== seed && Math.sign(m.centroids[t * 3]) !== Math.sign(p.x) && Math.abs(m.centroids[t * 3]) > 0.004) continue;
      const dx = m.centroids[t * 3] - p.x, dy = m.centroids[t * 3 + 1] - p.y, dz = m.centroids[t * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > o.maxDistance * o.maxDistance) continue;
      if (m.owner[t] !== kid) { m.owner[t] = kid; n++; }
      for (const u of nb[t]) if (!seen[u]) { seen[u] = 1; queue.push(u); }
    }
    // close pinholes: a triangle whose neighbours are mostly in the region joins it
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t < m.triCount; t++) {
        if (m.owner[t] !== -1) continue;
        const l = nb[t]; if (!l.length) continue;
        let c = 0; for (const u of l) if (m.owner[u] === kid) c++;
        if (c >= 2 && c / l.length >= 0.5) { m.owner[t] = kid; n++; }
      }
    }
    return n;
  }

  // Mirror: each triangle of `fromKey` claims the triangle nearest to its reflection across x = 0.
  function mirror(fromKey, toKey) {
    const from = keyIndex.get(fromKey); if (from === undefined) return 0;
    const kid = keyId(toKey);
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) m.owner[t] = -1;
    let n = 0;
    for (const m of info.values()) {
      for (let t = 0; t < m.triCount; t++) {
        if (m.owner[t] !== from) continue;
        const x = -m.centroids[t * 3], y = m.centroids[t * 3 + 1], z = m.centroids[t * 3 + 2];
        let best = null, bestD = Infinity;
        nearby(x, y, z, CELL * 1.5, (name, u, d2) => { if (d2 < bestD) { bestD = d2; best = [name, u]; } });
        if (best) { const bm = info.get(best[0]); if (bm.owner[best[1]] === -1) { bm.owner[best[1]] = kid; n++; } }
      }
    }
    // the reflected samples are sparse where the other side's mesh is denser: fill single-triangle gaps
    for (const m of info.values()) {
      if (!m.index) continue;
      const nb = ensureNeighbors(m);
      for (let pass = 0; pass < 3; pass++) for (let t = 0; t < m.triCount; t++) {
        if (m.owner[t] !== -1) continue;
        let c = 0; for (const u of nb[t]) if (m.owner[u] === kid) c++;
        if (c >= 2) { m.owner[t] = kid; n++; }
      }
    }
    return n;
  }

  // Keep only the triangles of `key` whose centroid (modelRoot space) passes keep(x, y, z); returns how many were removed.
  function trim(key, keep) {
    const kid = keyIndex.get(key); if (kid === undefined) return 0;
    let n = 0;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) {
      if (m.owner[t] === kid && !keep(m.centroids[t * 3], m.centroids[t * 3 + 1], m.centroids[t * 3 + 2])) { m.owner[t] = -1; n++; }
    }
    return n;
  }

  // Drop the triangles of `key` that sit on pale texture (eyeball, teeth, tendon), e.g. after mirroring.
  function trimPale(key, opts = {}) {
    const o = { minSaturation: 0.38, minRedness: 40, ...opts };
    const kid = keyIndex.get(key); if (kid === undefined) return 0;
    let n = 0;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) {
      if (m.owner[t] === kid && isBoundary(m, t, o)) { m.owner[t] = -1; n++; }
    }
    return n;
  }

  function clear(key) {
    const kid = keyIndex.get(key); if (kid === undefined) return;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) m.owner[t] = -1;
  }

  function count(key) {
    const kid = keyIndex.get(key); if (kid === undefined) return 0;
    let n = 0; for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) n++;
    return n;
  }

  // ---------- lookup ----------
  function keyAt(hit) {
    if (!hit || hit.faceIndex == null) return null;
    const m = info.get(hit.object.name); if (!m) return null;
    const kid = m.owner[hit.faceIndex];
    if (kid < 0) return null;
    const [id, side] = keys[kid].split("|");
    return { id, side, key: keys[kid] };
  }

  // ---------- drawing ----------
  let shown = null; // "key|mode"
  function overlayFor(m, slot, color, opacity) {
    if (!m[slot]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", m.mesh.geometry.attributes.position);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const o = new THREE.Mesh(g, mat);
      o.renderOrder = 5; o.visible = false; o.raycast = () => {};
      m.mesh.add(o); m[slot] = o;
    }
    m[slot].material.color.set(color); m[slot].material.opacity = opacity;
    return m[slot];
  }

  function triIndices(m, pick) {
    const arr = [];
    for (let t = 0; t < m.triCount; t++) if (pick(m.owner[t])) {
      if (m.index) arr.push(m.index[t * 3], m.index[t * 3 + 1], m.index[t * 3 + 2]);
      else arr.push(t * 3, t * 3 + 1, t * 3 + 2);
    }
    return arr;
  }

  function outlineFor(m, kidSet) {
    const has = (o) => kidSet.has(o);
    const nb = ensureNeighbors(m);
    const pos = m.mesh.geometry.attributes.position;
    const nor = m.mesh.geometry.attributes.normal;
    const lift = 0.0015 / Math.max(1e-6, m.mesh.matrixWorld.getMaxScaleOnAxis());
    const pts = [];
    const vtx = (t, k) => (m.index ? m.index[t * 3 + k] : t * 3 + k);
    for (let t = 0; t < m.triCount; t++) {
      if (!has(m.owner[t])) continue;
      for (let k = 0; k < 3; k++) {
        const a = vtx(t, k), b = vtx(t, (k + 1) % 3);
        // an edge is on the boundary if no neighbour in the region shares both of its positions
        const shared = nb[t].some((u) => {
          if (!has(m.owner[u])) return false;
          let hits = 0;
          for (let q = 0; q < 3; q++) {
            const w = vtx(u, q);
            tmp.fromBufferAttribute(pos, w);
            if (tmp.distanceToSquared(tmp2.fromBufferAttribute(pos, a)) < 1e-12 || tmp.distanceToSquared(tmp2.fromBufferAttribute(pos, b)) < 1e-12) hits++;
          }
          return hits >= 2;
        });
        if (shared) continue;
        for (const v of [a, b]) {
          tmp.fromBufferAttribute(pos, v);
          if (nor) tmp.addScaledVector(tmp2.fromBufferAttribute(nor, v), lift);
          pts.push(tmp.x, tmp.y, tmp.z);
        }
      }
    }
    if (!m.outline) {
      m.outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: OUTLINE, transparent: true, opacity: 0.95 }));
      m.outline.renderOrder = 6; m.outline.raycast = () => {};
      m.mesh.add(m.outline);
    }
    m.outline.geometry.dispose();
    m.outline.geometry = new THREE.BufferGeometry();
    m.outline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    m.outline.visible = pts.length > 0;
  }

  // mode: "show" (student highlight) or "paint" (authoring: current region amber, others grey)
  function show(key, mode = "show", force = false) {
    const list = Array.isArray(key) ? key : [key];
    const tag = `${list.join('+')}|${mode}`;
    if (!force && tag === shown) return;
    shown = tag;
    const kids = new Set(list.map((k) => (k ? keyIndex.get(k) : undefined)).filter((k) => k !== undefined));
    const kid = kids.size ? [...kids][0] : undefined;
    for (const m of info.values()) {
      const main = overlayFor(m, "overlay", mode === "paint" ? PAINT : HIGHLIGHT, mode === "paint" ? 0.55 : 0.35);
      const idx = kid === undefined ? [] : triIndices(m, (o) => kids.has(o));
      main.geometry.setIndex(idx); main.visible = idx.length > 0;
      const other = overlayFor(m, "otherOverlay", OTHER, 0.3);
      const oidx = mode === "paint" ? triIndices(m, (o) => o >= 0 && !kids.has(o)) : [];
      other.geometry.setIndex(oidx); other.visible = oidx.length > 0;
      if (kid !== undefined && idx.length) outlineFor(m, kids);
      else if (m.outline) m.outline.visible = false;
    }
  }

  // ---------- load / save ----------
  function load(data) {
    if (!data || !data.regions) return 0;
    let n = 0;
    for (const [key, perMesh] of Object.entries(data.regions)) {
      for (const [name, ranges] of Object.entries(perMesh)) {
        const m = info.get(name); if (!m) continue;
        if (data.meshes && data.meshes[name] && data.meshes[name] !== m.triCount) continue; // different model
        for (const t of decodeRanges(ranges)) if (t < m.triCount) { setTri(name, t, key); n++; }
      }
    }
    shown = null;
    return n;
  }

  function toJSON() {
    const regions = {}; const meshesOut = {};
    for (const [name, m] of info) {
      meshesOut[name] = m.triCount;
      const lists = new Map();
      for (let t = 0; t < m.triCount; t++) {
        const o = m.owner[t]; if (o < 0) continue;
        if (!lists.has(o)) lists.set(o, []);
        lists.get(o).push(t);
      }
      for (const [o, l] of lists) (regions[keys[o]] ||= {})[name] = encodeRanges(l);
    }
    return { version: 1, model: "assets/male-full-body-ecorche.glb", meshes: meshesOut, regions };
  }

  function has(key) { return count(key) > 0; }

  // Centre and radius of an outline in modelRoot space (for framing a review camera).
  function boundsOf(key) {
    const kid = keyIndex.get(key); if (kid === undefined) return null;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) {
      sx += m.centroids[t * 3]; sy += m.centroids[t * 3 + 1]; sz += m.centroids[t * 3 + 2]; n++;
    }
    if (!n) return null;
    sx /= n; sy /= n; sz /= n;
    let r = 0;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) {
      const dx = m.centroids[t * 3] - sx, dy = m.centroids[t * 3 + 1] - sy, dz = m.centroids[t * 3 + 2] - sz;
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return { center: [sx, sy, sz], radius: r, triangles: n };
  }

  // A point on the outline's surface near its middle (the painted triangle closest to the mean of all of
  // them), in modelRoot space, with the mesh it lies on: used to aim the label arrow at the painted side.
  function centerOf(key) {
    const kid = keyIndex.get(key); if (kid === undefined) return null;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const m of info.values()) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) {
      sx += m.centroids[t * 3]; sy += m.centroids[t * 3 + 1]; sz += m.centroids[t * 3 + 2]; n++;
    }
    if (!n) return null;
    sx /= n; sy /= n; sz /= n;
    let best = null, bestD = Infinity;
    for (const [name, m] of info) for (let t = 0; t < m.triCount; t++) if (m.owner[t] === kid) {
      const dx = m.centroids[t * 3] - sx, dy = m.centroids[t * 3 + 1] - sy, dz = m.centroids[t * 3 + 2] - sz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = { localPosition: [m.centroids[t * 3], m.centroids[t * 3 + 1], m.centroids[t * 3 + 2]], meshName: name }; }
    }
    return best;
  }

  return { keyAt, show, paintAt, fillFrom, mirror, trim, trimPale, clear, count, has, centerOf, boundsOf, load, toJSON, refresh: () => { shown = null; } };
}
