/* Part 2 — continuous conduction in an unmyelinated axon.
   Uses the shared membrane model (js/neurolab.js); this file only handles
   geometry and drawing for this module. */
(function () {
  'use strict';
  const NL = window.NeuroLab, { clamp, smooth, lerp, hash, $ } = NL.util, S = NL.svg, C = NL.colors;
  NL.renderChrome('unmyelinated');

  /* ---------------------------------------------------------- parameters */
  const L = 8;            // axon length shown (mm)
  const W = 3;            // magnified window width (mm)
  const V = 0.75;         // conduction velocity (mm/ms = m/s)
  const START = -0.3;     // front position at t = 0 (just off-screen left)
  const model = NL.createMembrane();
  const P = model.P;
  const arrival = x => (x - START) / V;                 // time this point crosses threshold
  const DURATION = Math.ceil(arrival(L) + P.tRecover);  // wave leaves the axon and it recovers
  const SPACING = 0.1;                                  // mm between neighbouring Na⁺ channels
  const NA_QUANTUM = 6, K_QUANTUM = 11;                 // mV·ms of driving force per drawn ion
  const NA_LIFE = 0.9, K_LIFE = 1.0, TRANSIT = 0.12;    // particle lifetimes (ms)

  /* -------------------------------------------------------------- layout */
  const MX0 = 72, MX1 = 932, MW = MX1 - MX0;            // magnified x range (px)
  const OY0 = 58, OY1 = 86;                             // overview tube
  const ECF_TOP = 116, MEM_TOP = 206, MEM_BOT = 326, ECF_BOT = 394, HALF = 8;
  const PY0 = 444, PY1 = 640;                           // voltage-vs-position plot
  const Xo = mm => MX0 + mm / L * MW;                   // overview scale
  let seg = 0.6, probe = 2;
  const Xm = mm => MX0 + (mm - seg) / W * MW;           // magnified scale
  const Yv = v => PY1 - (v + 95) / 140 * (PY1 - PY0);   // −95 … +45 mV

  /* --------------------------------------------- channels (fixed layout) */
  // Two membranes: top (interior is below, dir = +1) and bottom (dir = −1).
  const membranes = [{ yc: MEM_TOP, dir: 1, seed: 1 }, { yc: MEM_BOT, dir: -1, seed: 2 }];
  const channels = [];
  for (const m of membranes) {
    for (let i = 0; (i + 0.5) * SPACING < L; i++) {
      const xNa = (i + 0.25) * SPACING, xK = (i + 0.75) * SPACING;
      const uNa = hash(i, m.seed * 10 + 1), uK = hash(i, m.seed * 10 + 3);
      channels.push({ kind: 'Na', mm: xNa, m, u: uNa, side: hash(i, m.seed * 10 + 5), spawns: model.spawnAges('Na', uNa, NA_QUANTUM, hash(i, m.seed * 10 + 2)) });
      channels.push({ kind: 'K', mm: xK, m, u: uK, side: hash(i, m.seed * 10 + 6), spawns: model.spawnAges('K', uK, K_QUANTUM, hash(i, m.seed * 10 + 4)) });
    }
  }
  // Background ions — density reflects concentration (≈10:1 Na⁺, ≈25:1 K⁺).
  const background = [];
  const scatter = (kind, perMm, y0, y1, seed) => {
    const n = Math.round(perMm * L);
    for (let i = 0; i < n; i++) background.push({ kind, mm: hash(i, seed) * L, y: lerp(y0, y1, hash(i, seed + 0.37)), ph: hash(i, seed + 0.71) * 6.283 });
  };
  scatter('Na', 26, ECF_TOP + 6, MEM_TOP - HALF - 18, 101); scatter('K', 1.2, ECF_TOP + 6, MEM_TOP - HALF - 18, 102);
  scatter('Na', 22, MEM_BOT + HALF + 18, ECF_BOT - 6, 103); scatter('K', 1, MEM_BOT + HALF + 18, ECF_BOT - 6, 104);
  scatter('K', 30, MEM_TOP + HALF + 18, MEM_BOT - HALF - 18, 105); scatter('Na', 3, MEM_TOP + HALF + 18, MEM_BOT - HALF - 18, 106);

  /* --------------------------------------------------------------- state */
  const ui = id => $(id);
  const shown = () => ({ flux: ui('show-flux').checked, grad: ui('show-gradient').checked, current: ui('show-current').checked, charge: ui('show-charge').checked });
  const patchAt = (mm, t) => model.state(t - arrival(mm));
  const zone = s => s.age >= 0 && s.age < P.tPeak && s.nO > 0.02 ? 'depol' : s.refractory !== 'none' ? s.refractory : s.phase === 'Local depolarization' ? 'local' : 'rest';
  const zoneFill = { rest: C.resting, local: C.localDep, depol: C.depol, absolute: 'url(#hatch-abs)', relative: 'url(#hatch-rel)' };

  /* ------------------------------------------------------------- drawing */
  function defs() {
    return `<defs>${S.arrowMarkers()}
      <pattern id="hatch-abs" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${C.absolute}"/><line x1="0" y1="0" x2="0" y2="7" stroke="#a9cdb9" stroke-width="2"/></pattern>
      <pattern id="hatch-rel" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${C.relative}"/><circle cx="3.5" cy="3.5" r="1.3" fill="#9cc5ae"/></pattern>
      <clipPath id="clip-mag"><rect x="${MX0}" y="${ECF_TOP - 6}" width="${MW}" height="${ECF_BOT - ECF_TOP + 12}"/></clipPath>
      <linearGradient id="lipid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c9a3"/><stop offset=".5" stop-color="#f6eedc"/><stop offset="1" stop-color="#d9c9a3"/></linearGradient>
    </defs>`;
  }

  function overview(t) {
    let s = S.text(MX0, 46, 'Whole axon (8 mm) · the signal enters from the axon hillock on the left', 13, C.muted) + S.text(MX1, 46, 'Click the strip to move the magnified segment', 12, C.muted, 'end');
    const n = 160;
    for (let i = 0; i < n; i++) {
      const mm = (i + 0.5) / n * L, z = zone(patchAt(mm, t));
      s += S.rect(Xo(i / n * L), OY0, MW / n + 0.4, OY1 - OY0, zoneFill[z]);
    }
    const yo = v => OY1 - 2 - (v + 90) / 125 * (OY1 - OY0 - 4);
    s += `<path d="${S.curve(mm => patchAt(mm, t).voltage, 0, L, 200, Xo, yo)}" fill="none" stroke="${C.na}" stroke-width="1.6"/>`;
    s += `<rect x="${MX0}" y="${OY0}" width="${MW}" height="${OY1 - OY0}" rx="6" fill="none" stroke="#8c9b98" stroke-width="2"/>`;
    // Bracket for the magnified segment and zoom guide lines
    const b0 = Xo(seg), b1 = Xo(seg + W);
    s += `<rect x="${b0.toFixed(1)}" y="${OY0 - 5}" width="${(b1 - b0).toFixed(1)}" height="${OY1 - OY0 + 10}" rx="4" fill="none" stroke="${C.ink}" stroke-width="2.2"/>`;
    s += S.line(b0, OY1 + 5, MX0, ECF_TOP - 6, '#9aa9a6', 'stroke-dasharray="3 3"') + S.line(b1, OY1 + 5, MX1, ECF_TOP - 6, '#9aa9a6', 'stroke-dasharray="3 3"');
    s += `<circle cx="${Xo(probe).toFixed(1)}" cy="${OY0 - 9}" r="4.5" fill="${C.purple}"/>`;
    return s;
  }

  function membraneBase(t, show) {
    let s = S.rect(MX0, ECF_TOP, MW, MEM_TOP - HALF - ECF_TOP, '#eef6fb') + S.rect(MX0, MEM_BOT + HALF, MW, ECF_BOT - MEM_BOT - HALF, '#eef6fb');
    // Axoplasm shaded by membrane state (excitability)
    const n = 150;
    for (let i = 0; i < n; i++) {
      const mm = seg + (i + 0.5) / n * W, z = zone(patchAt(mm, t));
      s += S.rect(MX0 + i / n * MW, MEM_TOP + HALF, MW / n + 0.4, MEM_BOT - MEM_TOP - 2 * HALF, zoneFill[z]);
    }
    for (const m of membranes) s += S.rect(MX0, m.yc - HALF, MW, 2 * HALF, 'url(#lipid)', 'stroke="#b9a678" stroke-width=".8"');
    s += S.text(MX0 + 6, ECF_TOP + 14, 'Extracellular fluid', 12.5, C.muted, 'start', 'font-weight="650"');
    s += S.text(MX0 + 6, (MEM_TOP + MEM_BOT) / 2 + 5, 'Axoplasm (inside the axon)', 12.5, C.muted, 'start', 'font-weight="650" paint-order="stroke" stroke="#fff" stroke-width="3"');
    s += S.text(MX0 + 6, ECF_BOT - 6, 'Extracellular fluid', 12.5, C.muted, 'start', 'font-weight="650"');
    if (show.grad) {
      s += S.text(MX1 - 6, ECF_BOT - 6, 'Na⁺ ≈ 145 mM · K⁺ ≈ 5 mM', 12, C.muted, 'end', 'paint-order="stroke" stroke="#eef6fb" stroke-width="3"');
      s += S.text(MX1 - 6, (MEM_TOP + MEM_BOT) / 2 + 5, 'K⁺ ≈ 140 mM · Na⁺ ≈ 15 mM', 12, C.muted, 'end', 'paint-order="stroke" stroke="#fff" stroke-width="3"');
      for (const b of background) {
        if (b.mm < seg - 0.05 || b.mm > seg + W + 0.05) continue;
        const x = Xm(b.mm) + 1.6 * Math.sin(t * 2.1 + b.ph), y = b.y + 1.6 * Math.cos(t * 1.7 + b.ph * 1.3);
        s += b.kind === 'Na' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${C.na}" opacity=".38"/>`
          : `<path d="M${x.toFixed(1)} ${(y - 3.2).toFixed(1)}l3.2 3.2-3.2 3.2-3.2-3.2Z" fill="${C.k}" opacity=".42"/>`;
      }
    }
    if (show.charge) {
      for (const m of membranes) for (let mm = Math.ceil(seg / 0.2) * 0.2 + 0.05; mm < seg + W; mm += 0.2) {
        const pos = patchAt(mm, t).voltage >= 0, x = Xm(mm);
        s += S.text(x, m.yc + m.dir * 24 + 5, pos ? '+' : '−', 14, pos ? C.na : '#2f5f9a', 'middle', 'font-weight="800"');
        s += S.text(x, m.yc - m.dir * 21 + 5, pos ? '−' : '+', 14, pos ? '#2f5f9a' : C.na, 'middle', 'font-weight="800"');
      }
    }
    return s;
  }

  // One channel glyph spanning the membrane. dir = +1 → interior is below.
  function channelGlyph(ch, t) {
    const x = Xm(ch.mm), { yc, dir } = ch.m, a = t - arrival(ch.mm);
    if (ch.kind === 'Na') {
      const st = model.naChannel(ch.u, a), wide = st !== 'closed', g = wide ? 5 : 1.5;
      const col = st === 'open' ? C.open : st === 'inactivated' ? C.inact : C.closed;
      const fill = st === 'open' ? '#e6dcf7' : st === 'inactivated' ? '#d6ece0' : '#efe3c2';
      let s = `<g><title>Na⁺ channel: ${st}</title>`;
      s += `<rect x="${(x - g - 4).toFixed(1)}" y="${yc - 13}" width="4" height="26" rx="2" fill="${fill}" stroke="${col}" stroke-width="${st === 'open' ? 1.7 : 1.1}"/><rect x="${(x + g).toFixed(1)}" y="${yc - 13}" width="4" height="26" rx="2" fill="${fill}" stroke="${col}" stroke-width="${st === 'open' ? 1.7 : 1.1}"/>`;
      if (st === 'closed') s += S.line(x - g, yc - dir * 6, x + g, yc - dir * 6, col, 'stroke-width="3"');           // activation gate shut (outer)
      if (st === 'inactivated') s += `<path d="M${(x + g + 2).toFixed(1)} ${yc + dir * 13}q2 ${dir * 5} -2 ${dir * 5}" fill="none" stroke="${col}" stroke-width="1.2"/><circle cx="${x.toFixed(1)}" cy="${yc + dir * 13}" r="3.6" fill="${col}"/>`; // inactivation "ball" plugs inner mouth
      return s + '</g>';
    }
    const open = model.kChannel(ch.u, a) === 'open', g = open ? 5 : 1.5, col = open ? C.k : '#7fa9b0';
    let s = `<g><title>K⁺ channel: ${open ? 'open' : 'closed'}</title><rect x="${(x - g - 4).toFixed(1)}" y="${yc - 13}" width="4" height="26" rx="1" fill="${open ? '#cfe9ed' : '#e8eff0'}" stroke="${col}" stroke-width="${open ? 1.7 : 1.1}"/><rect x="${(x + g).toFixed(1)}" y="${yc - 13}" width="4" height="26" rx="1" fill="${open ? '#cfe9ed' : '#e8eff0'}" stroke="${col}" stroke-width="${open ? 1.7 : 1.1}"/>`;
    if (!open) s += S.line(x - g, yc + dir * 7, x + g, yc + dir * 7, col, 'stroke-width="3"');                       // gate shut (inner)
    return s + '</g>';
  }

  // Ions crossing a channel. Spawn times come from the cumulative driving
  // force while that channel is open, so flux ∝ open channels × driving force.
  function particles(ch, t) {
    const a = t - arrival(ch.mm), life = ch.kind === 'Na' ? NA_LIFE : K_LIFE;
    const x0 = Xm(ch.mm), { yc, dir } = ch.m;
    let s = '';
    ch.spawns.forEach((sp, k) => {
      const p = a - sp;
      if (p < 0 || p >= life) return;
      const lat = (hash(k, ch.side * 97) - 0.5) * 2;   // sideways drift after crossing
      let x = x0, y, op = 1;
      if (ch.kind === 'Na') {
        const yOut = yc - dir * 30, yIn = yc + dir * 22;
        if (p < TRANSIT) { y = lerp(yOut, yIn, smooth(p / TRANSIT)); op = clamp(p / 0.03); }
        else { const q = (p - TRANSIT) / (life - TRANSIT); x += lat * 22 * q; y = yIn + dir * 34 * q; op = 1 - q * q; }
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${C.na}" stroke="#fff" stroke-width="1.2" opacity="${op.toFixed(2)}"/>`;
      } else {
        const yIn = yc + dir * 28, yOut = yc - dir * 22;
        if (p < TRANSIT) { y = lerp(yIn, yOut, smooth(p / TRANSIT)); op = clamp(p / 0.03); }
        else { const q = (p - TRANSIT) / (life - TRANSIT); x += lat * 22 * q; y = yOut - dir * 34 * q; op = 1 - q * q; }
        s += `<path d="M${x.toFixed(1)} ${(y - 5.5).toFixed(1)}l5.5 5.5-5.5 5.5-5.5-5.5Z" fill="${C.k}" stroke="#fff" stroke-width="1.1" opacity="${op.toFixed(2)}"/>`;
      }
    });
    return s;
  }

  function localCurrent(t) {
    const front = START + V * t, src = front - V * 0.25;    // where Na⁺ entry is strongest
    if (src < -0.4 || src > L + 0.4) return '';
    const ahead = src + 0.62, behind = src - 0.62, yIn = MEM_TOP + HALF + 34, yOut = ECF_TOP + 34;
    let s = '';
    // Inward Na⁺ current at the active site
    s += S.line(Xm(src), yOut + 8, Xm(src), yIn - 10, C.na, 'stroke-width="3" marker-end="url(#arr-na)" opacity=".75"');
    // Forward loop: inside → out through membrane ahead (depolarizes it) → back outside
    s += S.line(Xm(src) + 4, yIn, Xm(ahead) - 4, yIn, C.purple, 'stroke-width="2.6" marker-end="url(#arr-purple)"');
    s += S.line(Xm(ahead), yIn - 6, Xm(ahead), yOut + 6, C.purple, 'stroke-width="2.6" marker-end="url(#arr-purple)"');
    s += S.line(Xm(ahead) - 4, yOut, Xm(src) + 8, yOut, C.muted, 'stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arr-muted)"');
    // Backward loop: current also spreads back, but that membrane is refractory
    s += S.line(Xm(src) - 4, yIn, Xm(behind) + 4, yIn, C.green, 'stroke-width="2" stroke-dasharray="6 3" marker-end="url(#arr-green)"');
    s += S.line(Xm(behind), yIn - 6, Xm(behind), yOut + 6, C.green, 'stroke-width="2" stroke-dasharray="6 3" marker-end="url(#arr-green)"');
    s += S.line(Xm(behind) + 4, yOut, Xm(src) - 8, yOut, C.muted, 'stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#arr-muted)"');
    const lab = (mm, txt, col, anchor) => S.text(clamp(Xm(mm), MX0 + 6, MX1 - 6), ECF_TOP + 58, txt, 12, col, anchor, 'font-weight="700" paint-order="stroke" stroke="#eef6fb" stroke-width="4"');
    s += lab(ahead + 0.04, 'Ahead: resting membrane depolarized → threshold', C.purple, Xm(ahead) > MX1 - 300 ? 'end' : 'start');
    if (behind > seg + 0.05) s += lab(behind - 0.04, 'Behind: refractory → no new spike', C.green, Xm(behind) < MX0 + 230 ? 'start' : 'end');
    return s;
  }

  function positionPlot(t) {
    let s = S.text(MX0, PY0 - 10, 'Membrane voltage along the magnified segment (a snapshot in space)', 14.5, C.ink, 'start', 'font-weight="650"');
    // Refractory bands under the curve
    const n = 120;
    for (let i = 0; i < n; i++) {
      const mm = seg + (i + 0.5) / n * W, z = zone(patchAt(mm, t));
      if (z === 'absolute' || z === 'relative') s += S.rect(MX0 + i / n * MW, PY0, MW / n + 0.4, PY1 - PY0, z === 'absolute' ? C.absolute : C.relative);
    }
    for (const v of [-85, -75, -55, 0, 30]) {
      s += S.line(MX0, Yv(v), MX1, Yv(v), v === P.threshold ? C.threshold : '#e3e9e7', v === P.threshold ? 'stroke-dasharray="5 4"' : '');
      s += S.text(MX0 - 8, Yv(v) + 4, v, 11, C.muted, 'end');
    }
    s += S.text(MX0 + 4, Yv(P.threshold) - 5, 'threshold −55 mV', 11, C.threshold);
    s += `<path d="${S.curve(mm => patchAt(mm, t).voltage, seg, seg + W, 300, Xm, Yv)}" fill="none" stroke="${C.na}" stroke-width="3"/>`;
    // Upstroke in space lies AHEAD (to the right) of the peak
    const front = START + V * t, peakMm = front - V * P.tPeak, a0 = clamp(peakMm, seg, seg + W), a1 = clamp(front, seg, seg + W);
    if (a1 > a0) {
      s += `<path d="${S.curve(mm => patchAt(mm, t).voltage, a0, a1, 40, Xm, Yv)}" fill="none" stroke="${C.purple}" stroke-width="4.5"/>`;
      if (front > seg && front < seg + W) s += S.text(Xm(front) + 8, Yv(P.threshold) + 18, 'Upstroke: Na⁺ channels opening', 11.5, C.purple, Xm(front) > MX1 - 200 ? 'end' : 'start', 'font-weight="650"');
    }
    s += S.line(MX0, PY1, MX1, PY1, C.muted);
    for (let mm = Math.ceil(seg * 2) / 2; mm <= seg + W + 1e-6; mm += 0.5) s += S.line(Xm(mm), PY1, Xm(mm), PY1 + 5, C.muted) + S.text(Xm(mm), PY1 + 18, mm.toFixed(1), 11, C.muted, 'middle');
    s += S.text((MX0 + MX1) / 2, PY1 + 40, 'Distance along axon (mm)  —  signal travels left → right', 13, C.muted, 'middle');
    s += S.text(22, (PY0 + PY1) / 2, 'mV', 12, C.muted);
    return s;
  }

  function probeMarker(t) {
    if (probe < seg || probe > seg + W) return S.text((MX0 + MX1) / 2, ECF_BOT + 18, `Probe (${probe.toFixed(2)} mm) is outside the magnified segment`, 11.5, C.purple, 'middle');
    const x = Xm(probe), v = patchAt(probe, t).voltage;
    return S.line(x, ECF_TOP - 4, x, PY1, C.purple, 'stroke-width="2" stroke-dasharray="6 4"') +
      `<circle cx="${x.toFixed(1)}" cy="${Yv(v).toFixed(1)}" r="6" fill="${C.purple}" stroke="#fff" stroke-width="2"/>` +
      S.text(x, ECF_BOT + 18, `Probe ${probe.toFixed(2)} mm`, 12, C.purple, 'middle', 'font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="4"');
  }

  function spatial(t) {
    const show = shown();
    let s = defs() + S.text(MX0, 22, 'Signal propagation →', 16, C.ink, 'start', 'font-weight="700"') + S.text(MX1, 22, 'Continuous conduction: every patch of membrane regenerates the action potential', 12.5, C.muted, 'end');
    s += overview(t);
    let mag = membraneBase(t, show);
    const vis = channels.filter(c => c.mm > seg - 0.05 && c.mm < seg + W + 0.05);
    for (const c of vis) mag += channelGlyph(c, t);
    if (show.flux) for (const c of vis) mag += particles(c, t);
    if (show.current) mag += localCurrent(t);
    s += `<g clip-path="url(#clip-mag)">${mag}</g>` + positionPlot(t);
    s += S.text(MX0 - 8, MEM_TOP + 4, 'membrane', 10.5, C.muted, 'end') + S.text(MX0 - 8, MEM_BOT + 4, 'membrane', 10.5, C.muted, 'end');
    s += probeMarker(t);
    $('space').innerHTML = s;
  }

  /* ------------------------------------------------------- probe & status */
  const explanations = {
    'Resting': 'Na⁺ channels are closed but ready to open (activation gate shut, inactivation gate open). Voltage-gated K⁺ channels are closed. Leak channels (not drawn) hold the resting potential.',
    'Local depolarization': 'Positive charge spreading inside the axon from the active region makes this patch less negative. As it nears threshold, the first Na⁺ channels begin to open.',
    'Depolarization': 'Threshold reached: positive feedback. Depolarization opens more Na⁺ channels → more Na⁺ rushes in → more depolarization. Inactivation is already starting, and the slower K⁺ channels begin to open.',
    'Repolarization': 'Na⁺ channels are inactivated (plugged), so Na⁺ entry has stopped. K⁺ channels are open and K⁺ flows out down its gradient, making the inside negative again.',
    'Afterhyperpolarization': 'K⁺ channels are slow to close, so the membrane dips below rest toward E_K. Because the voltage is close to E_K, little K⁺ actually flows. Na⁺ channels are recovering from inactivation.'
  };
  function status(t) {
    const s = patchAt(probe, t), pct = f => `${Math.round(f * 100)}%`;
    const phaseName = s.phase === 'Resting' && s.age > P.tRecover ? 'Resting (recovered)' : s.phase;
    if ($('phase').textContent !== phaseName) $('phase').textContent = phaseName;
    $('measurement').textContent = `${s.voltage.toFixed(1)} mV · ${probe.toFixed(2)} mm · ${s.age >= -0.6 && s.age < 6 ? `${s.age >= 0 ? '+' : ''}${s.age.toFixed(2)} ms from threshold` : s.age < 0 ? 'waiting for the signal' : 'signal has passed'}`;
    $('na-c').style.width = pct(s.nC); $('na-o').style.width = pct(s.nO); $('na-i').style.width = pct(s.nI);
    $('na-pct').textContent = `${pct(s.nO)} open · ${pct(s.nI)} inactivated`;
    $('k-bar').style.width = pct(s.nK); $('k-pct').textContent = pct(s.nK);
    const fmax = 0.4;
    $('na-flux-bar').style.width = pct(clamp(s.naFlux / fmax)); $('na-flux').textContent = s.nO > 0.01 ? `driving force ${Math.round(s.naDrive)} mV` : 'none';
    $('k-flux-bar').style.width = pct(clamp(s.kFlux / fmax)); $('k-flux').textContent = s.nK > 0.01 ? `driving force ${Math.round(s.kDrive)} mV` : 'none';
    $('explanation').textContent = s.phase === 'Resting' && s.age > P.tRecover ? 'This patch has returned to rest. All Na⁺ channels have recovered and K⁺ channels have closed. It could fire again if stimulated.' : explanations[s.phase];
    $('refractory-text').innerHTML = s.refractory === 'absolute' ? '<b>Absolute refractory:</b> too few Na⁺ channels are available — no stimulus can start another action potential.'
      : s.refractory === 'relative' ? '<b>Relative refractory:</b> some Na⁺ channels are still inactivated and extra K⁺ channels are open — only a stronger-than-normal stimulus can trigger a spike.'
      : '<b>Excitable:</b> a normal stimulus can trigger an action potential.';
    const past = model.stages.filter(m => m.age <= s.age + 1e-6).pop(), nxt = model.stages.find(m => m.age > s.age + 1e-6);
    $('milestone').textContent = `${past ? `Last milestone: ${past.label}.` : ''} ${nxt ? `Next: ${nxt.label} at ${(arrival(probe) + nxt.age).toFixed(2)} ms.` : ''}`;
  }

  /* ------------------------------------------------------------- wiring */
  function render(t) {
    if ($('follow').checked) { seg = clamp(START + V * t - 0.62 * W, 0, L - W); $('segment').value = seg; }
    $('segment-value').textContent = `${seg.toFixed(2)}–${(seg + W).toFixed(2)} mm`;
    $('probe-value').textContent = `${probe.toFixed(2)} mm`;
    spatial(t);
    NL.drawProbeTrace($('temporal'), model, t - arrival(probe));
    status(t);
  }
  const player = NL.createPlayer({
    duration: DURATION, step: 0.1, render, initialTime: 2.6,   // open on a frame where the wave is in view
    ids: { play: 'play', restart: 'restart', step: 'step', next: 'next', speed: 'speed', loop: 'loop', time: 'time', clock: 'clock' },
    stageTimes: () => model.stages.map(m => arrival(probe) + m.age)
  });
  $('segment').max = L - W;
  $('segment').addEventListener('input', e => { seg = +e.target.value; $('follow').checked = false; player.invalidate(); });
  $('follow').addEventListener('change', player.invalidate);
  $('probe').addEventListener('input', e => { probe = +e.target.value; player.invalidate(); });
  for (const id of ['show-flux', 'show-gradient', 'show-current', 'show-charge']) $(id).addEventListener('change', player.invalidate);
  $('space').addEventListener('click', e => {
    const svg = $('space'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (p.x < MX0 || p.x > MX1) return;
    if (p.y < ECF_TOP - 10) {               // overview strip → move magnified segment
      seg = clamp((p.x - MX0) / MW * L - W / 2, 0, L - W); $('segment').value = seg; $('follow').checked = false;
    } else {                                // magnified view → move probe
      probe = clamp(Math.round((seg + (p.x - MX0) / MW * W) * 20) / 20, 0.1, L - 0.1); $('probe').value = probe;
    }
    player.invalidate();
  });

  /* -------------------------------------------------------------- quiz */
  NL.renderQuiz($('quiz'), [
    { prompt: 'Why does the action potential keep its full size as it travels along an unmyelinated axon?', choices: ['Each patch of membrane opens its own Na⁺ channels and regenerates the action potential', 'The same Na⁺ ions travel the full length of the axon', 'The Na⁺/K⁺ pump pushes the signal forward', 'Myelin prevents any loss of current'], answer: 0, explanation: 'Conduction is regenerative. Local current only needs to bring the next patch to threshold; that patch then produces its own full-sized action potential.' },
    { prompt: 'During the repolarization phase, what is the state of most voltage-gated Na⁺ channels?', choices: ['Open', 'Closed and ready to open', 'Inactivated', 'Pumping Na⁺ out'], answer: 2, explanation: 'Na⁺ channels inactivate shortly after opening. The inactivation gate plugs the pore, so Na⁺ entry stops while K⁺ efflux repolarizes the membrane.' },
    { prompt: 'Which ion movement is mainly responsible for the falling (repolarizing) phase?', choices: ['Na⁺ moving into the cell', 'K⁺ moving out of the cell', 'K⁺ moving into the cell', 'Na⁺ pumped out by the Na⁺/K⁺-ATPase'], answer: 1, explanation: 'Delayed voltage-gated K⁺ channels open, and K⁺ leaves down its concentration gradient, removing positive charge from the inside.' },
    { prompt: 'During the afterhyperpolarization many K⁺ channels are still open, yet K⁺ efflux is small. Why?', choices: ['The K⁺ channels are inactivated', 'The membrane voltage is close to the K⁺ equilibrium potential, so the driving force is small', 'All the K⁺ inside the axon has been used up', 'Na⁺ channels block K⁺ channels'], answer: 1, explanation: 'Ion flow depends on open channels × driving force. Near E_K (≈ −90 mV) there is little net force pushing K⁺ out.' },
    { prompt: 'Local current spreads both forward and backward from the active region. Why doesn\'t the action potential travel backward?', choices: ['Current only flows forward in axons', 'The membrane just behind is refractory because its Na⁺ channels are inactivated', 'Myelin blocks backward current', 'The K⁺ channels behind are closed'], answer: 1, explanation: 'Behind the wave, Na⁺ channels have not yet recovered from inactivation (absolute refractory period), so that membrane cannot fire again.' },
    { prompt: 'A patient receives lidocaine, which blocks voltage-gated Na⁺ channels in a nerve. What happens to conduction through that region?', choices: ['It speeds up', 'It stops, because the action potential cannot be regenerated', 'It continues normally but with a smaller amplitude forever', 'Only K⁺ channels carry the signal instead'], answer: 1, explanation: 'Without Na⁺ channel opening, the membrane cannot be depolarized to produce a new action potential, so the signal is blocked — the basis of local anaesthesia.' }
  ]);
})();
