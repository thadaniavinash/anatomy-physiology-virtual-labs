/* =====================================================================
   Slide renderer — draws a glass slide with reagent, blood, mixing and
   a particle-based agglutination pattern. Used by the simulation and quiz.
   ===================================================================== */
window.SlideRender = (function () {
  const MIX_RED = { A: [158, 16, 40], B: [172, 26, 30], Rh: [174, 22, 40] };
  const PLASMA  = { A: [206, 96, 128], B: [218, 108, 100], Rh: [216, 100, 122] };

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixRGB = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const gauss = r => (r() + r() + r() - 1.5) / 1.5;

  function fit(c) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return false;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c._w = w; c._h = h; c._dpr = dpr; return true;
  }

  function geo(c) {
    const W = c._w, H = c._h;
    return { W, H, cx: W / 2, cy: H * 0.40, rx: W * 0.37, ry: H * 0.27, rd: W * 0.14 };
  }

  function model(ab, positive, seed) {
    const r = rng(seed + ab.charCodeAt(0) * 97 + ab.length * 13);
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    const strands = [];
    const asp = 0.37 * 136 / (0.27 * 300);
    for (let gy = -0.78; gy <= 0.8; gy += 0.20) {
      for (let gx = -0.62; gx <= 0.63; gx += 0.31) {
        const u = gx + (r() - .5) * 0.22, v = gy + (r() - .5) * 0.12;
        if (u * u + v * v > 0.80 || r() < 0.18) continue;
        const blob = r() < 0.3;
        strands.push({ u, v, ang: r() * Math.PI, len: blob ? 0.10 + r() * 0.08 : 0.16 + r() * 0.22,
          w: blob ? 0.045 + r() * 0.03 : 0.018 + r() * 0.022, curv: 0.15 + r() * 0.25, wav: 1 + r() * 1.6,
          lag: r() * 6.28, dir: r() < .5 ? -1 : 1 });
      }
    }
    const N = 900, cells = [];
    for (let i = 0; i < N; i++) {
      const a = r() * 6.2832, rad = Math.sqrt(r()) * 0.93;
      const iu = Math.cos(a) * rad, iv = Math.sin(a) * rad;
      let tu = iu, tv = iv, sIdx = -1;
      if (r() < 0.84 && strands.length) {
        sIdx = Math.floor(r() * strands.length);
        const s = strands[sIdx], t = r() - 0.5;
        const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
        const along = t * s.len, bend = Math.sin(t * Math.PI * 2 * s.wav) * s.curv * s.len * s.dir;
        const thick = gauss(r) * s.w * (1 - 3.2 * t * t);
        tu = s.u + ca * along - sa * (bend + thick);
        tv = s.v + (sa * along + ca * (bend + thick)) * asp;
        const rr = Math.hypot(tu, tv); if (rr > 0.92) { tu *= 0.92 / rr; tv *= 0.92 / rr; }
      }
      cells.push({ iu, iv, tu, tv, s: sIdx, d: r() * 0.45, ph: r() * 6.28, sz: 0.75 + r() * 0.5 });
    }
    return { ab, positive, ph, strands, cells, reagentA: 0, bloodA: 0, mixP: 0, mixing: false, stickAng: 0 };
  }

  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drop(ctx, x, y, rx, ry, col, alpha, pale) {
    ctx.save(); ctx.globalAlpha = alpha;
    const gr = ctx.createRadialGradient(x - rx * .3, y - ry * .35, rx * .1, x, y, Math.max(rx, ry));
    gr.addColorStop(0, rgb(mixRGB(col, [255, 255, 255], 0.18)));
    gr.addColorStop(0.75, rgb(col));
    gr.addColorStop(1, rgb(mixRGB(col, [0, 0, 0], pale ? 0.18 : 0.35)));
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill();
    if (pale) { ctx.strokeStyle = 'rgba(150,160,170,.7)'; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x - rx * .35, y - ry * .42, rx * .22, ry * .10, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
    ctx.restore();
  }

  function puddlePath(ctx, g, sl, k, oy) {
    const n = 72; ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      const rr = 1 + 0.035 * Math.sin(3 * a + sl.ph[0]) + 0.025 * Math.sin(5 * a + sl.ph[1]) + 0.015 * Math.sin(8 * a + sl.ph[2]);
      const x = g.cx + Math.cos(a) * g.rx * rr * k, y = g.cy + oy + Math.sin(a) * g.ry * rr * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function puddle(ctx, g, sl, k, t, tilt, p) {
    const ab = sl.ab, ep = smooth(p);
    const slosh = tilt * g.ry * 0.02;
    const base = mixRGB(MIX_RED[ab], PLASMA[ab], ep);
    ctx.save();
    puddlePath(ctx, g, sl, k, slosh);
    ctx.fillStyle = rgb(base, 0.97); ctx.fill();
    ctx.clip();
    const gl = ctx.createRadialGradient(g.cx - g.rx * .35, g.cy - g.ry * .45, 2, g.cx, g.cy, g.ry * 1.1);
    gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(.5, 'rgba(255,255,255,.05)'); gl.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, g.W, g.H);
    if (k >= 1) {
      const W = g.W;
      for (const c of sl.cells) {
        const lp = sl.positive ? smooth((p - c.d) / (1 - c.d)) : 0;
        const bound = c.s >= 0;
        const jit = 0.006 * (1 - lp * 0.8);
        const u = lerp(c.iu, c.tu, lp) + Math.sin(t * 0.0011 + c.ph) * jit;
        const v = lerp(c.iv, c.tv, lp) + Math.cos(t * 0.0013 + c.ph) * jit;
        let x = g.cx + u * g.rx, y = g.cy + v * g.ry;
        if (tilt) {
          const lag = bound ? sl.strands[c.s].lag : c.ph;
          y += tilt * g.ry * (0.02 + 0.05 * lp) + Math.sin(t * 0.004 + lag) * tilt * 1.2 * lp;
          x += Math.sin(t * 0.003 + lag) * tilt * 1.0 * lp;
        }
        const rad = W * (0.0075 + 0.0062 * lp * (bound ? 1 : 0.3)) * c.sz;
        const a = sl.positive ? lerp(0.20, bound ? 0.92 : 0.55, lp) : 0.20;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832);
        ctx.fillStyle = `rgba(${Math.round(lerp(120, 96, lp))},0,${Math.round(lerp(26, 20, lp))},${a})`;
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.save(); puddlePath(ctx, g, sl, k, slosh);
    ctx.strokeStyle = rgb(mixRGB(base, [60, 0, 10], 0.4), 0.55); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  }

  function stick(ctx, g, sl) {
    const a = sl.stickAng, R = 0.5 * smooth(sl.mixP * 1.5) + 0.15;
    const tx = g.cx + Math.cos(a) * g.rx * R, ty = g.cy + Math.sin(a) * g.ry * R;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#c49a5c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + g.W * 0.9, ty - g.H * 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tx + 1, ty - 1); ctx.lineTo(tx + g.W * 0.9 + 1, ty - g.H * 0.5 - 1); ctx.stroke();
    ctx.fillStyle = '#8a1a2c'; ctx.beginPath(); ctx.arc(tx, ty, 2.4, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  /* draw(canvas, slideModel, time, tilt, aggProgress0to1, opts) */
  function draw(c, sl, t, tilt, agg, opts = {}) {
    if (!c._w) return;
    const ctx = c.getContext('2d'), g = geo(c), { W, H } = g;
    ctx.setTransform(c._dpr, 0, 0, c._dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 1, 1, W - 2, H - 2, 5);
    ctx.fillStyle = 'rgba(205,228,240,0.16)'; ctx.fill();
    ctx.strokeStyle = 'rgba(225,242,252,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(5, 6, 3, H * 0.76);
    if (opts.label !== false) {
      roundRect(ctx, 3, H * 0.83, W - 6, H * 0.17 - 3, 3);
      ctx.fillStyle = 'rgba(238,242,246,0.92)'; ctx.fill();
      ctx.fillStyle = '#1d2733'; ctx.font = `700 ${Math.max(9, W * 0.105)}px Inter,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(BT.NAME[sl.ab].toUpperCase(), W / 2, H * 0.915);
    }
    const m = sl.mixP, e = smooth(m);
    if (m < 1) {
      if (sl.reagentA > 0) {
        const y = lerp(H * 0.25, g.cy, e * 0.85), r = g.rd * Math.sqrt(sl.reagentA) * (1 + e * 0.6);
        drop(ctx, g.cx, y, r * 1.05, r * 0.92, hexRGB(BT.COLOR[sl.ab]), 1 - e * 0.7, sl.ab === 'Rh');
      }
      if (sl.bloodA > 0) {
        const y = lerp(H * 0.55, g.cy, e * 0.85), r = g.rd * 1.05 * Math.sqrt(sl.bloodA) * (1 + e * 0.6);
        drop(ctx, g.cx, y, r * 1.05, r * 0.92, [176, 16, 42], 1, false);
      }
      if (m > 0) { const k = smooth((m - 0.25) / 0.75); if (k > 0) puddle(ctx, g, sl, k, t, 0, 0); }
    } else {
      puddle(ctx, g, sl, 1, t, tilt, sl.positive ? agg : 0);
    }
    if (sl.mixing) stick(ctx, g, sl);
  }

  /* Static fully-developed result, used by the quiz */
  function drawStatic(c, ab, positive, seed) {
    if (!fit(c)) return;
    const sl = model(ab, positive, seed);
    sl.reagentA = 1; sl.bloodA = 1; sl.mixP = 1;
    draw(c, sl, 0, 0, 1, { label: true });
  }

  return { fit, geo, model, draw, drawStatic, smooth, clamp, lerp, rng };
})();
