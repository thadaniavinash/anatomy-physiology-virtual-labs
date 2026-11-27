/* Trace selection for the outline review screen.

   The author draws a loop on the screen. pickInLoop() returns the triangles inside it:
   - normally only the ones that can be seen (each triangle is drawn in a colour that encodes its number into
     an off-screen image, and the pixels inside the loop are read back), so tracing never reaches the far side
     of the body;
   - with `throughModel`, every triangle whose centre falls inside the loop, hidden or not.
   It also returns inside(name, t), which tells whether a triangle's centre projects inside the loop (used to
   close small gaps without spilling outside the loop). */

import * as THREE from "three";

export function createTracePicker({ renderer, camera, modelRoot, meshData }) {
  let idScene = null;
  let target = null;
  const names = [];

  function build() {
    idScene = new THREE.Scene();
    meshData.forEach((m, i) => {
      names[i] = m.name;
      const src = m.mesh.geometry.attributes.position;
      const pos = new Float32Array(m.triCount * 9);
      const tri = new Float32Array(m.triCount * 3);
      for (let t = 0; t < m.triCount; t++) {
        for (let k = 0; k < 3; k++) {
          const v = m.index ? m.index[t * 3 + k] : t * 3 + k;
          pos[(t * 3 + k) * 3] = src.getX(v); pos[(t * 3 + k) * 3 + 1] = src.getY(v); pos[(t * 3 + k) * 3 + 2] = src.getZ(v);
          tri[t * 3 + k] = t;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aTri", new THREE.BufferAttribute(tri, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { meshId: { value: i + 1 } },
        vertexShader: `
          attribute float aTri;
          varying float vTri;
          void main() { vTri = aTri; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          precision highp float;
          uniform float meshId;
          varying float vTri;
          void main() {
            float id = floor(vTri + 0.5) + 1.0;
            float r = mod(id, 256.0);
            float g = mod(floor(id / 256.0), 256.0);
            float b = floor(id / 65536.0);
            gl_FragColor = vec4(r, g, b, meshId) / 255.0;
          }`,
        side: THREE.DoubleSide,
        blending: THREE.NoBlending,
      });
      const o = new THREE.Mesh(g, mat);
      o.frustumCulled = false;
      o.matrixAutoUpdate = false;
      o.userData.source = m.mesh;
      idScene.add(o);
    });
  }

  // loop: [{x, y}] in CSS pixels relative to the canvas.
  function pickInLoop(loop, { throughModel = false } = {}) {
    const rect = renderer.domElement.getBoundingClientRect();
    const toScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(modelRoot.matrixWorld);
    const e = toScreen.elements;
    const W = rect.width, H = rect.height;
    let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
    for (const p of loop) { lx0 = Math.min(lx0, p.x); ly0 = Math.min(ly0, p.y); lx1 = Math.max(lx1, p.x); ly1 = Math.max(ly1, p.y); }
    const inside = (name, t) => {
      const m = byName.get(name); const c = m.centroids;
      const x = c[t * 3], y = c[t * 3 + 1], z = c[t * 3 + 2];
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0) return false;
      const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W;
      const sy = (-(e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5) * H;
      if (sx < lx0 || sx > lx1 || sy < ly0 || sy > ly1) return false;
      return pointInLoop(sx, sy, loop);
    };
    const picked = new Map();
    if (throughModel) {
      for (const m of meshData) {
        const list = [];
        for (let t = 0; t < m.triCount; t++) if (inside(m.name, t)) list.push(t);
        if (list.length) picked.set(m.name, list);
      }
      return { picked, inside };
    }

    if (!idScene) build();
    for (const o of idScene.children) o.matrix.copy(o.userData.source.matrixWorld);
    idScene.updateMatrixWorld(true);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pr = size.x / W;
    if (!target || target.width !== size.x || target.height !== size.y) {
      if (target) target.dispose();
      target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    }
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color()); const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(idScene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);

    // bounding box of the loop in drawing-buffer pixels
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of loop) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const bx = Math.max(0, Math.floor(x0 * pr)), by = Math.max(0, Math.floor(y0 * pr));
    const bw = Math.min(size.x, Math.ceil(x1 * pr) + 1) - bx, bh = Math.min(size.y, Math.ceil(y1 * pr) + 1) - by;
    if (bw <= 0 || bh <= 0) return { picked, inside };

    const mask = document.createElement("canvas"); mask.width = bw; mask.height = bh;
    const ctx = mask.getContext("2d", { willReadFrequently: true });
    ctx.beginPath();
    loop.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * pr - bx, p.y * pr - by));
    ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill();
    const maskData = ctx.getImageData(0, 0, bw, bh).data;

    const pixels = new Uint8Array(bw * bh * 4);
    renderer.readRenderTargetPixels(target, bx, size.y - by - bh, bw, bh, pixels);
    const sets = new Map();
    for (let j = 0; j < bh; j++) {
      const mrow = bh - 1 - j; // render target rows start at the bottom
      for (let i = 0; i < bw; i++) {
        if (!maskData[(mrow * bw + i) * 4 + 3]) continue;
        const o = (j * bw + i) * 4;
        const meshId = pixels[o + 3]; if (!meshId) continue;
        const id = pixels[o] + pixels[o + 1] * 256 + pixels[o + 2] * 65536 - 1;
        const name = names[meshId - 1]; if (!name || id < 0) continue;
        let s = sets.get(name); if (!s) sets.set(name, (s = new Set()));
        s.add(id);
      }
    }
    for (const [name, s] of sets) picked.set(name, [...s]);
    return { picked, inside };
  }

  const byName = new Map(meshData.map((m) => [m.name, m]));
  return { pickInLoop };
}

export function pointInLoop(x, y, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
