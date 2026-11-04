/* Part 2 — continuous conduction in an unmyelinated axon.

   One synchronized view, three linked panels that always show the SAME moment:
     1. Axon strip   — the action potential travelling along the whole axon,
                       with Na⁺ (top edge) and K⁺ (bottom edge) channel states.
     2. AP graph     — voltage over time at the probe, phases 1–4, "now" dot.
     3. Close-up     — a few large channels at the probe, with ions moving.
   An optional magnified 3 mm segment shows every channel along the axon.

   All physiology comes from the shared membrane model (js/neurolab.js). */
(function () {
  'use strict';
  const NL = window.NeuroLab, { clamp, smooth, lerp, hash, $ } = NL.util, S = NL.svg, C = NL.colors;
  NL.renderChrome('unmyelinated');

  /* ---------------------------------------------------------- parameters */
  const L = 8;            // axon length (mm)
  const V = 0.75;         // conduction velocity (mm/ms = m/s)
  const START = -0.3;     // wave-front position at t = 0
  const model = NL.createMembrane();
  const P = model.P;
  const arrival = x => (x - START) / V;                 // time this point reaches threshold
  // The axon hillock fires two action potentials, GAP ms apart. A patch
  // follows the second one once it starts; the first has long since recovered.
  const GAP = 5, WAVES = [0, GAP];
  const ageAt = (mm, t) => { const a = t - arrival(mm); return a - GAP >= P.tFoot ? a - GAP : a; };
  const waveAt = (mm, t) => (t - arrival(mm) - GAP >= P.tFoot ? 2 : 1);
  const DURATION = Math.ceil(arrival(L) + GAP + P.tRecover);
  const SPACING = 0.1;                                  // mm between channels of one type
  let probe = 2;

  const patchAt = (mm, t) => model.state(ageAt(mm, t));
  const phaseFill = { 'Resting': C.rest, 'Reaching threshold': C.stim, 'Depolarization': C.depol, 'Repolarization': C.repol, 'Hyperpolarization': C.hyper, 'Return to resting potential': C.ret };
  const phaseNum = { 'Depolarization': 1, 'Repolarization': 2, 'Hyperpolarization': 3, 'Return to resting potential': 4 };
  // Membrane charge signs: + red, − blue; size shrinks as |voltage| falls toward 0 mV.
  const signSize = (v, base, extra) => base + extra * Math.min(1, Math.abs(v) / 80);
  const sign = (x, y, positive, size) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" fill="${positive ? '#c8352a' : '#2058a8'}" text-anchor="middle" font-weight="800">${positive ? '+' : '−'}</text>`;
  // Refractory overlay: hatching on the membrane, and colours for the labelled bars.
  const REF = { absolute: { bar: '#6f978a', text: '#fff', label: 'Absolute refractory', short: 'Absolute' }, relative: { bar: '#cfe0d8', text: '#21453b', label: 'Relative refractory', short: 'Relative' } };
  const hatchDefs = `<pattern id="hatch-abs" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#2f5f4a" stroke-width="2.2" stroke-opacity=".5"/></pattern><pattern id="hatch-rel" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#2f5f4a" stroke-width="1.2" stroke-opacity=".28"/></pattern>`;
  // Contiguous runs of a property sampled along [a, b] mm.
  function runs(a, b, n, f) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = f(a + (i + 0.5) / n * (b - a));
      if (out.length && out[out.length - 1].v === v) out[out.length - 1].to = i + 1; else out.push({ v, from: i, to: i + 1 });
    }
    return out.map(r => ({ v: r.v, a: a + r.from / n * (b - a), b: a + r.to / n * (b - a) }));
  }
  const halo = (c = '#fff', w = 4) => `paint-order="stroke" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
  const showFlux = () => $('show-flux').checked, showCharge = () => $('show-charge').checked;
  const naStateColor = { closed: '#ecc7c1', open: C.naOpen, inactivated: C.inact };

  /* Channels along the axon (shared by the strip and the magnified view). */
  const channels = [];
  for (let i = 0; (i + 0.5) * SPACING < L; i++) {
    const mm = (i + 0.5) * SPACING, uNa = hash(i, 11), uK = hash(i, 13);
    channels.push({ kind: 'Na', mm, u: uNa, seed: i * 2, spawns: model.spawnAges('Na', uNa, 10, hash(i, 12)) });
    channels.push({ kind: 'K', mm, u: uK, seed: i * 2 + 1, spawns: model.spawnAges('K', uK, 18, hash(i, 14)) });
  }

  /* ===================================================== 1. AXON STRIP */
  const SX0 = 72, SX1 = 932, SW = SX1 - SX0, TUBE0 = 54, TUBE1 = 104;
  const Xs = mm => SX0 + mm / L * SW;
  function strip(t) {
    let s = S.text(SX0, 16, 'Whole axon (8 mm) · two action potentials travel →', 13.5, C.ink, 'start', 'font-weight="700"') +
      S.text(SX1, 16, 'Click or drag along the axon to move the probe', 12, C.muted, 'end');
    const n = 200, spans = [];
    for (let i = 0; i < n; i++) {
      const ph = patchAt((i + 0.5) / n * L, t).phase;
      s += S.rect(Xs(i / n * L), TUBE0, SW / n + 0.4, TUBE1 - TUBE0, phaseFill[ph]);
      if (spans.length && spans[spans.length - 1].ph === ph) spans[spans.length - 1].to = i + 1; else spans.push({ ph, from: i, to: i + 1 });
    }
    for (const sp of spans) {
      const num = phaseNum[sp.ph], w = (sp.to - sp.from) / n * SW;
      if (!num || w < 16) continue;
      const cx = SX0 + (sp.from + sp.to) / 2 / n * SW;
      s += `<circle cx="${cx.toFixed(1)}" cy="${TUBE0 + 13}" r="7.5" fill="#fff" stroke="${C.ink}" stroke-width="1"/>` + S.text(cx, TUBE0 + 16.5, num, 10, C.ink, 'middle', 'font-weight="800"');
    }
    // Refractory overlay inside the axon + labelled bar underneath
    s = `<defs>${hatchDefs}</defs>` + s;
    for (const r of runs(0, L, 200, mm => patchAt(mm, t).refractory)) {
      if (!REF[r.v]) continue;
      const x0 = Xs(r.a), w = Xs(r.b) - x0, st = REF[r.v];
      s += S.rect(x0, TUBE0, w, TUBE1 - TUBE0, `url(#hatch-${r.v === 'absolute' ? 'abs' : 'rel'})`);
      s += S.rect(x0, TUBE1 + 9, w, 15, st.bar);
      if (w > 44) s += S.text(x0 + w / 2, TUBE1 + 20.5, w > 112 ? st.label : st.short, 10.5, st.text, 'middle', 'font-weight="700"');
    }
    // Channel ticks: Na⁺ on the top edge, K⁺ on the bottom edge
    for (const c of channels) {
      const a = ageAt(c.mm, t), x = Xs(c.mm) - 2;
      if (c.kind === 'Na') s += S.rect(x, TUBE0 - 4, 4, 8, naStateColor[model.naChannel(c.u, a)]);
      else s += S.rect(x, TUBE1 - 4, 4, 8, model.kChannel(c.u, a) === 'open' ? C.kOpen : '#cbd8ea');
    }
    // Charge rows: outside (above the membrane) and inside (within the axon)
    for (let mm = 0.1; mm < L; mm += 0.2) {
      const v = patchAt(mm, t).voltage, pos = v >= 0, z = signSize(v, 8, 10);
      s += sign(Xs(mm), TUBE0 - 9, !pos, z) + sign(Xs(mm), TUBE1 - 11, pos, z);
    }
    s += `<rect x="${SX0}" y="${TUBE0}" width="${SW}" height="${TUBE1 - TUBE0}" rx="5" fill="none" stroke="#8c9b98" stroke-width="1.5"/>`;
    s += S.text(SX0 - 7, TUBE0 + 4, 'Na⁺', 11.5, C.na, 'end', 'font-weight="800"') + S.text(SX0 - 7, TUBE1 + 4, 'K⁺', 11.5, C.k, 'end', 'font-weight="800"');
    s += S.text(SX1 + 6, TUBE0 - 12, 'outside', 10.5, C.muted) + S.text(SX1 + 6, TUBE1 - 14, 'inside', 10.5, C.muted);
    // Label each action potential at its leading edge
    WAVES.forEach((w, k) => {
      const front = START + V * (t - w);
      if (front > 0.05 && front < L + 0.3) s += S.text(Xs(Math.min(front, L) - V * 0.22), 30, `AP ${k + 1}`, 12, C.ink, 'middle', 'font-weight="800" ' + halo());
    });
    for (let mm = 0; mm <= L; mm++) s += S.text(Xs(mm), 160, mm, 10.5, C.muted, 'middle');
    s += S.text(SX1 + 8, 160, 'mm', 10.5, C.muted);
    const px = Xs(probe);
    s += S.line(px, TUBE0 - 2, px, TUBE1 + 28, C.purple, 'stroke-width="3"') + `<path d="M${(px - 7).toFixed(1)} ${TUBE1 + 37}h14l-7 -9Z" fill="${C.purple}"/>`;
    s += S.text(px, 147, `Probe ${probe.toFixed(2)} mm`, 11.5, C.purple, 'middle', 'font-weight="700" ' + halo());
    $('strip').innerHTML = s;
  }
  function apLabel(t) {
    const a1 = t - arrival(probe), w = waveAt(probe, t), a = ageAt(probe, t);
    $('ap-label').textContent = a1 < -0.6 ? 'Waiting for action potential 1 to reach the probe'
      : w === 2 && a > P.tRecover ? 'Both action potentials have passed the probe'
      : w === 1 && a > P.tRecover ? 'Action potential 1 has passed · action potential 2 is on its way'
      : `Action potential ${w} of 2 at the probe (${probe.toFixed(2)} mm)`;
  }

  /* ============================================ 3. MEMBRANE CLOSE-UP */
  // A few large channels at the probe. Different random u values make them
  // switch at slightly different moments, as real channel populations do.
  const CY = 176, CHALF = 14, NA_X = [70, 140, 210], K_X = [315, 385, 455];
  const CU_NA = [0.18, 0.5, 0.82], CU_K = [0.2, 0.5, 0.8];
  const closeNa = CU_NA.map((u, i) => ({ x: NA_X[i], u, spawns: model.spawnAges('Na', u, 3.2, i / 3), seed: 900 + i }));
  const closeK = CU_K.map((u, i) => ({ x: K_X[i], u, spawns: model.spawnAges('K', u, 6, i / 3), seed: 950 + i }));
  const CU_TRANSIT = 0.14, CU_NA_LIFE = 1.0, CU_K_LIFE = 0.8;

  function bigChannel(kind, x, st) {
    const pair = (g, fill, stroke, rx) => `<rect x="${x - g - 13}" y="${CY - 26}" width="13" height="52" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x + g}" y="${CY - 26}" width="13" height="52" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    if (kind === 'Na') {
      if (st === 'closed') return pair(2, C.naClosedFill, C.naClosedLine, 6) + S.line(x - 3, CY - 15, x + 3, CY - 15, C.naClosedLine, 'stroke-width="6" stroke-linecap="round"');
      if (st === 'open') return pair(9, C.naOpen, '#9e2318', 6);
      return pair(9, C.inact, '#9a6406', 6) + `<path d="M${x + 10} ${CY + 26}q2 12 -10 12" fill="none" stroke="#9a6406" stroke-width="2.4"/><circle cx="${x}" cy="${CY + 31}" r="9" fill="#9a6406"/>`;
    }
    return st === 'open' ? pair(9, C.kOpen, '#163f7a', 2)
      : pair(2, C.kClosedFill, C.kClosedLine, 2) + S.line(x - 3, CY + 15, x + 3, CY + 15, C.kClosedLine, 'stroke-width="6" stroke-linecap="round"');
  }
  function majority(states) {
    const c = {}; states.forEach(s => { c[s] = (c[s] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  }

  function closeup(t) {
    const a = ageAt(probe, t), st = model.state(a);
    let s = `<defs>${S.arrowMarkers()}</defs>`;
    s += S.rect(0, 30, 520, CY - CHALF - 30, '#eef5fa') + S.rect(0, CY + CHALF, 520, 360 - CY - CHALF, phaseFill[st.phase]);
    s += S.rect(0, CY - CHALF, 520, 2 * CHALF, '#efe3c6', 'stroke="#c4ae7a"');
    s += S.text(10, 20, `Ion channels at the probe (${probe.toFixed(2)} mm)`, 14, C.ink, 'start', 'font-weight="700"');
    if (REF[st.refractory]) { const r = REF[st.refractory]; s += `<rect x="352" y="4" width="162" height="22" rx="11" fill="${r.bar}"/>` + S.text(433, 19.5, r.label, 11.5, r.text, 'middle', 'font-weight="800"'); }
    s += S.text(10, 50, 'Extracellular fluid', 12.5, C.muted, 'start', 'font-weight="650"') + S.text(510, 50, 'Na⁺ 145 mM · K⁺ 5 mM', 11.5, C.muted, 'end');
    s += S.text(10, 350, 'Axoplasm (inside)', 12.5, C.muted, 'start', 'font-weight="650" ' + halo(phaseFill[st.phase], 3)) + S.text(510, 350, 'K⁺ 140 mM · Na⁺ 15 mM', 11.5, C.muted, 'end', halo(phaseFill[st.phase], 3));
    if (showCharge()) {
      const pos = st.voltage >= 0, z = signSize(st.voltage, 11, 13);
      for (const x of [30, 105, 175, 262, 350, 420, 495]) s += sign(x, CY - 32, !pos, z) + sign(x, CY + 50, pos, z);
    }
    s += S.text(510, CY + 82, `Inside: ${st.voltage >= 0 ? '+' : ''}${st.voltage.toFixed(0)} mV`, 16, st.voltage >= 0 ? C.na : C.k, 'end', 'font-weight="800" ' + halo(phaseFill[st.phase], 4));
    s += S.text(510, CY + 100, st.voltage >= 0 ? 'inside is positive' : 'inside is negative', 11.5, C.muted, 'end', halo(phaseFill[st.phase], 3));
    const naStates = closeNa.map(c => model.naChannel(c.u, a)), kStates = closeK.map(c => model.kChannel(c.u, a));
    closeNa.forEach((c, i) => { s += `<g><title>Na⁺ channel: ${naStates[i]}</title>${bigChannel('Na', c.x, naStates[i])}</g>`; });
    closeK.forEach((c, i) => { s += `<g><title>K⁺ channel: ${kStates[i]}</title>${bigChannel('K', c.x, kStates[i])}</g>`; });
    if (showFlux()) {
      closeNa.forEach(c => c.spawns.forEach((sp, k) => {
        const p = a - sp; if (p < 0 || p >= CU_NA_LIFE) return;
        const h1 = hash(c.seed * 13 + k, 1), h2 = hash(c.seed * 13 + k, 2), h3 = hash(c.seed * 13 + k, 3);
        let x = c.x + (h3 - 0.5) * 6, y, op = 1;
        if (p < CU_TRANSIT) { y = lerp(CY - 80, CY + 40, smooth(p / CU_TRANSIT)); op = clamp(p / 0.03); }
        else {
          const q = (p - CU_TRANSIT) / (CU_NA_LIFE - CU_TRANSIT), e = 1 - Math.pow(1 - q, 3);
          x += (h1 < 0.75 ? 80 + 90 * h2 : -(30 + 30 * h2)) * e;      // mostly forward (to the right)
          y = lerp(CY + 40, CY + 70 + h3 * 95, e); op = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        }
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" fill="${C.na}" stroke="#fff" stroke-width="1.6" opacity="${op.toFixed(2)}"/>`;
      }));
      closeK.forEach(c => c.spawns.forEach((sp, k) => {
        const p = a - sp; if (p < 0 || p >= CU_K_LIFE) return;
        const h1 = hash(c.seed * 13 + k, 4), h3 = hash(c.seed * 13 + k, 6);
        let x = c.x + (h3 - 0.5) * 6, y, op = 1;
        if (p < CU_TRANSIT) { y = lerp(CY + 80, CY - 40, smooth(p / CU_TRANSIT)); op = clamp(p / 0.03); }
        else { const q = (p - CU_TRANSIT) / (CU_K_LIFE - CU_TRANSIT); x += (h1 - 0.5) * 50 * q; y = CY - 40 - 60 * q; op = 1 - q * q; }
        s += `<path d="M${x.toFixed(1)} ${(y - 9).toFixed(1)}l9 9-9 9-9-9Z" fill="${C.k}" stroke="#fff" stroke-width="1.6" opacity="${op.toFixed(2)}"/>`;
      }));
      if (st.naFlux > 0.02) s += S.line(140, 290, 250, 290, C.na, 'stroke-width="2.5" marker-end="url(#arr-na)"') + S.text(140, 310, 'Na⁺ spreads forward along the axon', 11.5, C.na, 'start', 'font-weight="700" ' + halo(phaseFill[st.phase], 3));
    }
    // Group state pills
    const nMaj = majority(naStates), kMaj = majority(kStates);
    const pill = (cx, label, fill, color) => `<rect x="${cx - 100}" y="378" width="200" height="30" rx="15" fill="${fill}"/>` + S.text(cx, 398, label, 13, color, 'middle', 'font-weight="800"');
    s += pill(140, `Na⁺ channels: ${nMaj === 'inactivated' ? 'INACTIVATED' : nMaj.toUpperCase()}`, nMaj === 'open' ? C.naOpen : nMaj === 'inactivated' ? C.inact : C.naClosedFill, nMaj === 'closed' ? C.na : '#fff');
    s += pill(385, `K⁺ channels: ${kMaj.toUpperCase()}`, kMaj === 'open' ? C.kOpen : C.kClosedFill, kMaj === 'open' ? '#fff' : C.k);
    $('closeup').innerHTML = s;
  }


  /* ================================== 4. CURRENT PROPAGATION (mid zoom) */
  // ~1.5 mm around the probe with Na⁺ and K⁺ channels alternating in both
  // membranes. Shows Na⁺ entering, spreading downstream to open the next
  // Na⁺ channels, while channels upstream are inactivated (refractory).
  const PW = 2.4, PSP = 0.16, PX0 = 72;   // window (mm) and channel spacing — spacing exaggerated for legibility
  const pointsIn = c0 => [c0 + PW / 6, c0 + PW / 2, c0 + 5 * PW / 6];   // A, B, C evenly spaced across the panel
  const P_MEM = [{ yc: 74, dir: 1 }, { yc: 160, dir: -1 }];
  const P_AX0 = 82, P_AX1 = 152, P_ECF0 = 26, P_ECF1 = 206;
  const propCh = [];
  P_MEM.forEach((m, k) => {
    for (let i = 0; (i + 0.25) * PSP < L; i++) {
      const uNa = hash(i, 21 + k * 4), uK = hash(i, 23 + k * 4);
      propCh.push({ kind: 'Na', mm: (i + 0.25) * PSP, m, u: uNa, seed: 3000 + i * 4 + k, spawns: model.spawnAges('Na', uNa, 9, hash(i, 22 + k * 4)) });
      propCh.push({ kind: 'K', mm: (i + 0.75) * PSP, m, u: uK, seed: 3002 + i * 4 + k, spawns: model.spawnAges('K', uK, 16, hash(i, 24 + k * 4)) });
    }
  });
  function propagation(t) {
    const pts = $('show-points').checked, PX1 = pts ? 668 : 932, PPX = (PX1 - PX0) / PW;
    const c0 = clamp(probe - PW / 2, 0, L - PW), Xp = mm => PX0 + (mm - c0) * PPX;
    let s = `<defs>${hatchDefs.replace(/hatch-/g, 'phatch-')}${S.arrowMarkers()}<marker id="arr-cur" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#9e2318"/></marker><clipPath id="clip-prop"><rect x="${PX0}" y="${P_ECF0}" width="${PX1 - PX0}" height="${P_ECF1 - P_ECF0}"/></clipPath></defs>`;
    s += S.text(PX0, 16, `Current propagation: ${c0.toFixed(2)}–${(c0 + PW).toFixed(2)} mm around the probe`, 13.5, C.ink, 'start', 'font-weight="700"');
    if (!pts) s += S.text(PX1, 16, 'Na⁺ spreads downstream → opens the next Na⁺ channels', 12, C.muted, 'end');
    let g = S.rect(PX0, P_ECF0, PX1 - PX0, P_ECF1 - P_ECF0, '#eef5fa') + S.rect(PX0, P_AX0, PX1 - PX0, P_AX1 - P_AX0, '#fbf7ec');
    // Red glow = how depolarized (positive) the inside is, as in textbook figures
    const n = 120;
    for (let i = 0; i < n; i++) {
      const mm = c0 + (i + 0.5) / n * PW, v = patchAt(mm, t).voltage, f = clamp((v - P.rest) / (P.peak - P.rest));
      if (f > 0.01) g += S.rect(PX0 + i / n * (PX1 - PX0), P_AX0, (PX1 - PX0) / n + 0.4, P_AX1 - P_AX0, `rgba(221,59,44,${(0.6 * f).toFixed(3)})`);
    }
    for (const r of runs(c0, c0 + PW, 120, mm => patchAt(mm, t).refractory)) {
      if (!REF[r.v]) continue;
      const x0 = Xp(r.a), w = Xp(r.b) - x0;
      g += S.rect(x0, P_AX0, w, P_AX1 - P_AX0, `url(#phatch-${r.v === 'absolute' ? 'abs' : 'rel'})`);
      if (w > 70) g += S.text(x0 + w / 2, P_AX1 - 8, w > 150 ? REF[r.v].label : REF[r.v].short, 11.5, '#21453b', 'middle', 'font-weight="700" ' + halo('#fff', 4));
    }
    for (const m of P_MEM) g += S.rect(PX0, m.yc - 8, PX1 - PX0, 16, '#efe3c6');
    if (showCharge()) for (let mm = Math.ceil(c0 / PSP) * PSP; mm <= c0 + PW; mm += PSP) {
      const v = patchAt(mm, t).voltage, pos = v >= 0, z = signSize(v, 8, 8);
      for (const m of P_MEM) g += sign(Xp(mm), m.yc - m.dir * 18 + 4, !pos, z) + sign(Xp(mm), m.yc + m.dir * 19 + 4, pos, z);
    }
    const vis = propCh.filter(c => c.mm > c0 - 0.05 && c.mm < c0 + PW + 0.05);
    for (const c of vis) {
      const x = Xp(c.mm), { yc, dir } = c.m, a = ageAt(c.mm, t);
      const pair = (gap, fill, stroke, rx) => `<rect x="${(x - gap - 5).toFixed(1)}" y="${yc - 11}" width="5" height="22" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/><rect x="${(x + gap).toFixed(1)}" y="${yc - 11}" width="5" height="22" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`;
      if (c.kind === 'Na') {
        const st = model.naChannel(c.u, a);
        g += st === 'closed' ? pair(1.2, C.naClosedFill, C.naClosedLine, 2.5) + S.line(x - 1.5, yc - dir * 6, x + 1.5, yc - dir * 6, C.naClosedLine, 'stroke-width="2.5"')
          : st === 'open' ? pair(3.5, C.naOpen, '#9e2318', 2.5)
          : pair(3.5, C.inact, '#9a6406', 2.5) + `<circle cx="${x.toFixed(1)}" cy="${yc + dir * 13}" r="3.6" fill="#9a6406"/>`;
      } else {
        g += model.kChannel(c.u, a) === 'open' ? pair(3.5, C.kOpen, '#163f7a', 1) : pair(1.2, C.kClosedFill, C.kClosedLine, 1) + S.line(x - 1.5, yc + dir * 6, x + 1.5, yc + dir * 6, C.kClosedLine, 'stroke-width="2.5"');
      }
      if (!showFlux()) continue;
      c.spawns.forEach((sp, k) => {
        const life = c.kind === 'Na' ? 1.0 : 0.8, p = a - sp;
        if (p < 0 || p >= life) return;
        const h1 = hash(c.seed * 11 + k, 1), h2 = hash(c.seed * 11 + k, 2), h3 = hash(c.seed * 11 + k, 3);
        let px = x, py, op;
        if (c.kind === 'Na') {
          if (p < 0.12) { py = lerp(yc - dir * 24, yc + dir * 14, smooth(p / 0.12)); op = clamp(p / 0.03); }
          else {
            const q = (p - 0.12) / (life - 0.12), e = 1 - Math.pow(1 - q, 3);
            px = x + (h1 < 0.75 ? 0.22 + 0.2 * h2 : -(0.05 + 0.07 * h2)) * PPX * e;    // mostly downstream
            py = lerp(yc + dir * 14, P_AX0 + 14 + h3 * (P_AX1 - P_AX0 - 28), e); op = q < 0.55 ? 1 : 1 - (q - 0.55) / 0.45;
          }
          g += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${C.na}" stroke="#fff" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
        } else {
          if (p < 0.12) { py = lerp(yc + dir * 16, yc - dir * 16, smooth(p / 0.12)); op = clamp(p / 0.03); }
          else { const q = (p - 0.12) / (life - 0.12); px += (h1 - 0.5) * 16 * q; py = yc - dir * 16 - dir * 18 * q; op = 1 - q * q; }
          g += `<path d="M${px.toFixed(1)} ${(py - 4.5).toFixed(1)}l4.5 4.5-4.5 4.5-4.5-4.5Z" fill="${C.k}" stroke="#fff" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
        }
      });
    }
    // Depolarizing (local) current: from the active site, mostly downstream
    WAVES.forEach(w => {
      const front = START + V * (t - w), src = front - V * 0.25, mid = (P_AX0 + P_AX1) / 2;
      if (t - w < 0 || src < c0 - 0.6 || src > c0 + PW + 0.2 || front > L + 0.3) return;
      const x = Xp(src), f = 0.42 * PPX, b = 0.18 * PPX;
      g += `<path d="M${x} ${mid - 4}C${x + f * 0.5} ${mid - 4} ${x + f * 0.8} ${mid - 14} ${x + f} ${P_MEM[0].yc - 20}" fill="none" stroke="#9e2318" stroke-width="2.4" marker-end="url(#arr-cur)"/>`;
      g += `<path d="M${x} ${mid + 4}C${x + f * 0.5} ${mid + 4} ${x + f * 0.8} ${mid + 14} ${x + f} ${P_MEM[1].yc + 20}" fill="none" stroke="#9e2318" stroke-width="2.4" marker-end="url(#arr-cur)"/>`;
      g += `<path d="M${x} ${mid}C${x - b * 0.5} ${mid} ${x - b * 0.8} ${mid - 8} ${x - b} ${P_MEM[0].yc - 18}" fill="none" stroke="#9e2318" stroke-width="1.3" stroke-dasharray="3 3" marker-end="url(#arr-cur)"/>`;
      g += S.text(x + f * 0.55, mid + 4, 'depolarizing current', 11, '#9e2318', 'middle', 'font-weight="700" ' + halo('#fff', 3));
    });
    if (pts) {
      pointsIn(c0).forEach((mm, k) => {
        g += S.line(Xp(mm), P_ECF0, Xp(mm), P_ECF1, C.ink, 'stroke-width="1.6" stroke-dasharray="5 4"') + `<circle cx="${Xp(mm).toFixed(1)}" cy="${P_ECF0 + 12}" r="9" fill="${C.ink}"/>` + S.text(Xp(mm), P_ECF0 + 16, 'ABC'[k], 11, '#fff', 'middle', 'font-weight="800"');
      });
    }
    if (probe >= c0 && probe <= c0 + PW) {
      g += S.line(Xp(probe), P_ECF0, Xp(probe), P_ECF1, C.purple, 'stroke-width="1.6" stroke-dasharray="5 4"');
    }
    s += `<g clip-path="url(#clip-prop)">${g}</g>`;
    s += S.text(PX0 - 8, P_MEM[0].yc + 4, 'membrane', 10, C.muted, 'end') + S.text(PX0 - 8, P_MEM[1].yc + 4, 'membrane', 10, C.muted, 'end');
    s += S.text(PX0, 226, '← upstream (behind the wave)', 12, C.muted) + S.text(PX1, 226, 'downstream (ahead of the wave) →', 12, C.muted, 'end');
    if (pts) s += pointTraces(t, c0);
    $('prop').innerHTML = s;
  }
  // Mini voltage traces at points A, B (the probe) and C, sharing one time axis.
  function pointTraces(t, c0) {
    const pm = pointsIn(c0), x0 = 708, x1 = 990, w = waveAt(pm[0], t), off = (w - 1) * GAP;
    const t0 = arrival(pm[0]) + off - 0.8, t1 = arrival(pm[2]) + off + 3.0;
    const X = tt => x0 + (tt - t0) / (t1 - t0) * (x1 - x0);
    let s = S.text(x0, 16, `Voltage at points A, B, C (AP ${w})`, 12.5, C.ink, 'start', 'font-weight="700"');
    ['A', 'B', 'C'].forEach((lab, k) => {
      const mm = pm[k], y0 = 28 + k * 64, y1 = y0 + 54, Y = v => y1 - (v + 90) / 125 * (y1 - y0);
      s += S.rect(x0, y0, x1 - x0, y1 - y0, '#f6f8f7', 'rx="4"');
      s += `<circle cx="${x0 - 12}" cy="${(y0 + y1) / 2}" r="9" fill="${C.ink}"/>` + S.text(x0 - 12, (y0 + y1) / 2 + 4, lab, 11, '#fff', 'middle', 'font-weight="800"');
      s += S.line(x0, Y(P.threshold), x1, Y(P.threshold), C.threshold, 'stroke-dasharray="3 3"') + S.line(x0, Y(P.rest), x1, Y(P.rest), '#d5dedb');
      s += `<path d="${S.curve(tt => patchAt(mm, tt).voltage, t0, t1, 120, X, Y)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
    });
    if (t >= t0 && t <= t1) s += S.line(X(t), 26, X(t), 28 + 2 * 64 + 56, C.purple, 'stroke-width="2"');
    s += S.text(x1, 226, 'The same AP reaches A, then B, then C', 11, C.muted, 'end');
    return s;
  }

  /* ======================================================= status text */
  const explanations = {
    'Resting': 'The inside is negative (−75 mV). Na⁺ and K⁺ channels are closed. Na⁺ channels are ready to open.',
    'Reaching threshold': 'Na⁺ spreading from the neighbouring region makes this patch less negative, bringing it toward threshold (−55 mV).',
    'Depolarization': 'Threshold reached: Na⁺ channels open and Na⁺ rushes in, so the inside becomes positive (up to +30 mV).',
    'Repolarization': 'At the peak, Na⁺ channels become inactivated (temporarily blocked). K⁺ channels open and K⁺ flows out, so the inside becomes negative again.',
    'Hyperpolarization': 'K⁺ channels are slow to close, so extra K⁺ leaves and the membrane dips below resting potential (about −85 mV).',
    'Return to resting potential': 'K⁺ channels close and the membrane returns to −75 mV. Na⁺ channels have recovered and can open again.'
  };
  function status(t) {
    const s = patchAt(probe, t), recovered = s.phase === 'Resting' && s.age > P.tRecover, num = phaseNum[s.phase];
    const name = num ? `${num} · ${s.phase}` : recovered ? 'Resting (recovered)' : s.phase;
    const ph = $('phase');
    if (ph.textContent !== name) ph.textContent = name;
    ph.style.background = phaseFill[s.phase];
    $('measurement').textContent = `${s.voltage >= 0 ? '+' : ''}${s.voltage.toFixed(0)} mV`;
    $('explanation').textContent = recovered ? 'Back at resting potential and ready to fire again. Over time the Na⁺/K⁺ pump restores the few ions that crossed.' : explanations[s.phase];
    $('refractory-text').innerHTML = s.refractory === 'absolute' ? '<b>Absolute refractory:</b> cannot fire again yet.'
      : s.refractory === 'relative' ? '<b>Relative refractory:</b> needs a stronger stimulus to fire.'
      : s.refractory === 'firing' ? '<b>Action potential in progress:</b> Na⁺ channels are open.' : '<b>Excitable:</b> a normal stimulus can trigger an action potential.';
  }

  /* ============================== optional: magnified 3 mm segment view */
  const W = 3, MX0 = 72, MX1 = 932, MW = MX1 - MX0, PX_MM = MW / W;
  const ECF_TOP = 30, MEM_NA = 114, MEM_K = 230, ECF_BOT = 308, HALF = 9;
  const AX_TOP = MEM_NA + HALF, AX_BOT = MEM_K - HALF;
  let seg = 0.6;
  const Xm = mm => MX0 + (mm - seg) * PX_MM;
  const naMem = { yc: MEM_NA, dir: 1 }, kMem = { yc: MEM_K, dir: -1 };

  function detailGlyph(c, t) {
    const x = Xm(c.mm), a = ageAt(c.mm, t), m = c.kind === 'Na' ? naMem : kMem, { yc } = m;
    const pair = (g, fill, stroke, rx) => `<rect x="${(x - g - 6).toFixed(1)}" y="${yc - 15}" width="6" height="30" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/><rect x="${(x + g).toFixed(1)}" y="${yc - 15}" width="6" height="30" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
    if (c.kind === 'Na') {
      const st = model.naChannel(c.u, a);
      if (st === 'closed') return pair(1.5, C.naClosedFill, C.naClosedLine, 3) + S.line(x - 2, yc - 8, x + 2, yc - 8, C.naClosedLine, 'stroke-width="3"');
      if (st === 'open') return pair(4, C.naOpen, '#9e2318', 3);
      return pair(4, C.inact, '#9a6406', 3) + `<circle cx="${x.toFixed(1)}" cy="${yc + 17}" r="4.6" fill="#9a6406"/>`;
    }
    return model.kChannel(c.u, a) === 'open' ? pair(4, C.kOpen, '#163f7a', 1) : pair(1.5, C.kClosedFill, C.kClosedLine, 1) + S.line(x - 2, yc - 8, x + 2, yc - 8, C.kClosedLine, 'stroke-width="3"');
  }
  function detailParticles(c, t) {
    const a = ageAt(c.mm, t), x0 = Xm(c.mm), { yc, dir } = c.kind === 'Na' ? naMem : kMem;
    let s = '';
    c.spawns.forEach((sp, k) => {
      const life = c.kind === 'Na' ? 1.1 : 0.9, p = a - sp;
      if (p < 0 || p >= life) return;
      const h1 = hash(c.seed * 7 + k, 3), h2 = hash(c.seed * 7 + k, 5), h3 = hash(c.seed * 7 + k, 9);
      let x = x0, y, op;
      if (c.kind === 'Na') {
        if (p < 0.12) { y = lerp(yc - dir * 34, yc + dir * 20, smooth(p / 0.12)); op = clamp(p / 0.03); }
        else {
          const q = (p - 0.12) / (life - 0.12), e = 1 - Math.pow(1 - q, 3);
          x = x0 + (h1 < 0.75 ? 0.5 + 0.25 * h2 : -(0.1 + 0.08 * h2)) * PX_MM * e;
          y = lerp(yc + dir * 20, AX_TOP + 14 + h3 * (AX_BOT - AX_TOP - 40), e); op = q < 0.55 ? 1 : 1 - (q - 0.55) / 0.45;
        }
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${C.na}" stroke="#fff" stroke-width="1.3" opacity="${op.toFixed(2)}"/>`;
      } else {
        if (p < 0.12) { y = lerp(yc + dir * 24, yc - dir * 22, smooth(p / 0.12)); op = clamp(p / 0.03); }
        else { const q = (p - 0.12) / (life - 0.12); x += (h1 - 0.5) * 20 * q; y = yc - dir * 22 - dir * 26 * q; op = 1 - q * q; }
        s += `<path d="M${x.toFixed(1)} ${(y - 6).toFixed(1)}l6 6-6 6-6-6Z" fill="${C.k}" stroke="#fff" stroke-width="1.2" opacity="${op.toFixed(2)}"/>`;
      }
    });
    return s;
  }
  function detail(t) {
    let s = `<defs>${hatchDefs.replace(/hatch-/g, 'dhatch-')}<clipPath id="clip-mag"><rect x="${MX0}" y="${ECF_TOP}" width="${MW}" height="${ECF_BOT - ECF_TOP}"/></clipPath></defs>`;
    s += S.text(MX0, 18, `Magnified segment ${seg.toFixed(2)}–${(seg + W).toFixed(2)} mm · signal travels →`, 13.5, C.ink, 'start', 'font-weight="700"');
    let g = S.rect(MX0, ECF_TOP, MW, MEM_NA - HALF - ECF_TOP, '#eef5fa') + S.rect(MX0, MEM_K + HALF, MW, ECF_BOT - MEM_K - HALF, '#eef5fa');
    const n = 150;
    for (let i = 0; i < n; i++) g += S.rect(MX0 + i / n * MW, AX_TOP, MW / n + 0.4, AX_BOT - AX_TOP, phaseFill[patchAt(seg + (i + 0.5) / n * W, t).phase]);
    for (const r of runs(seg, seg + W, 150, mm => patchAt(mm, t).refractory)) {
      if (!REF[r.v]) continue;
      const x0 = Xm(r.a), w = Xm(r.b) - x0;
      g += S.rect(x0, AX_TOP, w, AX_BOT - AX_TOP, `url(#dhatch-${r.v === 'absolute' ? 'abs' : 'rel'})`);
      if (w > 60) g += S.text(x0 + w / 2, (AX_TOP + AX_BOT) / 2 + 4, w > 140 ? REF[r.v].label : REF[r.v].short, 12, '#21453b', 'middle', 'font-weight="700" ' + halo('#fff', 4));
    }
    g += S.rect(MX0, MEM_NA - HALF, MW, 2 * HALF, '#efe3c6') + S.rect(MX0, MEM_K - HALF, MW, 2 * HALF, '#efe3c6');
    const vis = channels.filter(c => c.mm > seg - 0.05 && c.mm < seg + W + 0.05);
    for (const c of vis) g += detailGlyph(c, t);
    if (showCharge()) for (let mm = Math.ceil(seg / 0.2) * 0.2; mm < seg + W; mm += 0.2) {
      const v = patchAt(mm, t).voltage, pos = v >= 0, z = signSize(v, 9, 9);
      for (const m of [naMem, kMem]) g += sign(Xm(mm), m.yc - m.dir * 21 + 5, !pos, z) + sign(Xm(mm), m.yc + m.dir * 23 + 5, pos, z);
    }
    if (showFlux()) for (const c of vis) g += detailParticles(c, t);
    if (probe >= seg && probe <= seg + W) g += S.line(Xm(probe), ECF_TOP, Xm(probe), ECF_BOT, C.purple, 'stroke-width="2" stroke-dasharray="6 4"');
    s += `<g clip-path="url(#clip-mag)">${g}</g>`;
    s += S.text(MX0 - 8, MEM_NA + 4, 'Na⁺', 13, C.na, 'end', 'font-weight="800"') + S.text(MX0 - 8, MEM_K + 4, 'K⁺', 13, C.k, 'end', 'font-weight="800"');
    s += S.text(MX0, ECF_BOT + 22, 'The wave moves right, so the leading edge (phase 1) is on the right and phases 2 → 4 trail behind it on the left.', 12.5, C.muted);
    $('space').innerHTML = s;
  }

  /* ============================================================ wiring */
  function render(t) {
    $('probe-value').textContent = `${probe.toFixed(2)} mm`;
    strip(t);
    propagation(t);
    NL.drawProbeTrace($('temporal'), model, ageAt(probe, t));
    apLabel(t);
    closeup(t);
    status(t);
    if ($('detail').open) {
      if ($('follow').checked) { seg = clamp(START + V * t - 0.62 * W, 0, L - W); $('segment').value = seg; }
      $('segment-value').textContent = `${seg.toFixed(2)}–${(seg + W).toFixed(2)} mm`;
      detail(t);
    }
  }
  const player = NL.createPlayer({
    duration: DURATION, step: 0.05, render, initialTime: 3.25,   // probe is mid-depolarization: Na⁺ channels open
    ids: { play: 'play', restart: 'restart', step: 'step', next: 'next', speed: 'speed', loop: 'loop', time: 'time', clock: 'clock' },
    stageTimes: () => WAVES.flatMap(w => model.stages.map(m => arrival(probe) + w + m.age + 0.001))   // land just inside each stage
  });
  const setProbe = mm => { probe = clamp(Math.round(mm * 20) / 20, 0.1, L - 0.1); $('probe').value = probe; player.invalidate(); };
  $('probe').addEventListener('input', e => setProbe(+e.target.value));
  for (const id of ['show-flux', 'show-charge', 'show-points']) $(id).addEventListener('change', player.invalidate);
  const toSvg = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  let dragging = false;
  const stripPoint = e => { const p = toSvg($('strip'), e); if (p.x >= SX0 - 10 && p.x <= SX1 + 10) setProbe((p.x - SX0) / SW * L); };
  $('strip').addEventListener('pointerdown', e => { dragging = true; $('strip').setPointerCapture(e.pointerId); stripPoint(e); });
  $('strip').addEventListener('pointermove', e => { if (dragging) stripPoint(e); });
  $('strip').addEventListener('pointerup', () => { dragging = false; });
  $('detail').addEventListener('toggle', player.invalidate);
  $('segment').max = L - W;
  $('segment').addEventListener('input', e => { seg = +e.target.value; $('follow').checked = false; player.invalidate(); });
  $('follow').addEventListener('change', player.invalidate);
  $('space').addEventListener('click', e => { const p = toSvg($('space'), e); if (p.x >= MX0 && p.x <= MX1) setProbe(seg + (p.x - MX0) / PX_MM); });

  /* -------------------------------------------------------------- quiz */
  NL.renderQuiz($('quiz'), [
    { prompt: 'Which event causes phase 1, depolarization?', choices: ['Voltage-gated K⁺ channels open and K⁺ leaves', 'Voltage-gated Na⁺ channels open and Na⁺ enters', 'The Na⁺/K⁺ pump moves Na⁺ out', 'Na⁺ channels become inactivated'], answer: 1, explanation: 'At threshold, voltage-gated Na⁺ channels open. Na⁺ rushes in down its concentration gradient and the inside becomes positive.' },
    { prompt: 'During phase 2, repolarization, what is the state of most voltage-gated Na⁺ channels?', choices: ['Open', 'Closed and ready to open', 'Inactivated (temporarily blocked)', 'Moving K⁺ out'], answer: 2, explanation: 'Na⁺ channels inactivate at the peak, so Na⁺ entry stops while K⁺ leaving through open K⁺ channels brings the voltage back down.' },
    { prompt: 'Why does phase 3, hyperpolarization, happen?', choices: ['Na⁺ channels stay open too long', 'K⁺ channels are slow to close, so extra K⁺ leaves', 'The Na⁺/K⁺ pump stops working', 'Cl⁻ enters the axon'], answer: 1, explanation: 'Voltage-gated K⁺ channels close slowly. K⁺ keeps leaving after resting potential is reached, so the inside briefly becomes more negative than at rest.' },
    { prompt: 'Why does the action potential keep its full size as it travels along an unmyelinated axon?', choices: ['Each patch of membrane opens its own Na⁺ channels and regenerates the action potential', 'The same Na⁺ ions travel the full length of the axon', 'The Na⁺/K⁺ pump pushes the signal forward', 'Myelin prevents any loss of current'], answer: 0, explanation: 'Na⁺ spreading inside the axon only needs to bring the next patch to threshold. That patch then opens its own Na⁺ channels and produces a full-sized action potential.' },
    { prompt: 'Na⁺ that enters spreads both ways inside the axon. Why does the action potential only travel forward?', choices: ['Na⁺ can only move forward', 'The membrane behind is refractory: its Na⁺ channels are still inactivated', 'K⁺ channels ahead block the signal', 'The axon hillock pulls the signal back'], answer: 1, explanation: 'Behind the wave, Na⁺ channels have not yet recovered from inactivation (absolute refractory period), so that membrane cannot fire again.' },
    { prompt: 'A patient receives lidocaine, which blocks voltage-gated Na⁺ channels in a nerve. What happens to conduction through that region?', choices: ['It speeds up', 'It stops, because the action potential cannot be regenerated', 'It continues normally', 'K⁺ channels carry the signal instead'], answer: 1, explanation: 'Without Na⁺ channels opening, phase 1 cannot occur, so the signal is blocked. This is how local anaesthetics prevent pain signals from reaching the brain.' }
  ]);
})();
