/* Part 1 — synaptic transmission and initiating the impulse.

   One synchronized view, three linked panels:
     1. Synapse close-up — every step of chemical transmission, animated.
     2. Postsynaptic neuron — graded potentials spread (and fade) to the axon
        hillock, where they sum; if threshold is reached an AP fires.
     3. Voltage graph — at the synapse and at the axon hillock, with threshold.

   Timing is schematic (slowed and simplified for teaching). The action
   potential at the hillock reuses the shared membrane model from Part 2. */
(function () {
  'use strict';
  const NL = window.NeuroLab, { clamp, smooth, lerp, hash, $ } = NL.util, S = NL.svg, C = NL.colors;
  NL.renderChrome('synapse');
  const model = NL.createMembrane(), P = model.P;

  const COL = { ca: '#139fb3', na: C.na, cl: '#2f9a45', ntE: '#e8861d', ntI: '#a8439a', ap: '#f2b705', depol: '221,59,44', hyper: '44,108,194' };
  const halo = (c = '#fff', w = 4) => `paint-order="stroke" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
  // Enzyme breakdown in the cleft (the pac-man animation). Off for CNS
  // glutamate/GABA synapses, which are cleared by reuptake. Set to true to
  // reuse this module for an acetylcholine / neuromuscular-junction version
  // (acetylcholinesterase).
  const ENZYME_ENABLED = false;
  const kernel = (tau, tp) => (tau <= 0 ? 0 : (tau / tp) * Math.exp(1 - tau / tp));   // PSP shape (peak 1 at tp)

  /* ------------------------------------------------ synapses & scenarios */
  const SYN = {
    1: { type: 'E', name: 'S1', amp: 11, local: 14 },
    2: { type: 'E', name: 'S2', amp: 11, local: 14 },
    3: { type: 'I', name: 'S3', amp: -9, local: -10 }
  };
  const SCEN = {
    single:   { events: [{ syn: 1, t: 0 }], text: 'One presynaptic action potential at excitatory synapse S1.' },
    temporal: { events: [{ syn: 1, t: 0 }, { syn: 1, t: 2 }, { syn: 1, t: 4 }], text: 'Three action potentials arrive at S1 in quick succession, so their EPSPs add up before each one fades.' },
    spatial:  { events: [{ syn: 1, t: 0 }, { syn: 2, t: 0 }], text: 'Two excitatory synapses (S1 and S2) fire at the same time, so their EPSPs add up at the axon hillock.' },
    inhib:    { events: [{ syn: 3, t: 0 }], text: 'One presynaptic action potential at inhibitory synapse S3.' },
    mixed:    { events: [{ syn: 1, t: 0 }, { syn: 2, t: 0 }, { syn: 3, t: 0 }], text: 'S1 and S2 (excitatory) fire together with S3 (inhibitory). The IPSP subtracts from the EPSPs.' }
  };
  const DURATION = 24;
  // Step timeline (ms after a presynaptic spike reaches the terminal region)
  const T = { arrive: 0, ca: 1.0, caEnd: 2.2, dock: 1.5, fuse: 2.4, release: 2.6, bind: 4.0, open: 4.2, spread: 1.2, end: 7.2 };
  const STEPS = [
    { t: T.arrive, title: 'AP arrives', e: 'An action potential travels down the presynaptic axon. The membrane (red) depolarizes as it reaches the axon terminal.' },
    { t: T.ca, title: 'Ca²⁺ channels open', e: 'Depolarization opens voltage-gated Ca²⁺ channels in the terminal membrane. Ca²⁺ flows in down its concentration gradient.' },
    { t: T.fuse, title: 'Exocytosis', e: 'Ca²⁺ triggers synaptic vesicles to dock and fuse with the membrane, releasing neurotransmitter into the cleft.' },
    { t: T.release + 0.2, title: 'Diffusion', e: 'Neurotransmitter diffuses across the synaptic cleft toward the postsynaptic membrane.' },
    { t: T.bind, title: 'Receptors open', eE: 'Glutamate binds AMPA receptors. These are ligand-gated (chemically gated) Na⁺ channels, so they open.', eI: 'GABA binds GABA-A receptors. These are ligand-gated (chemically gated) Cl⁻ channels, so they open.' },
    { t: T.open + 0.4, title: 'Ions flow → PSP', eE: 'Na⁺ flows in through the open AMPA receptors and depolarizes the membrane: an excitatory postsynaptic potential (EPSP).', eI: 'Cl⁻ flows in through the open GABA-A receptors and hyperpolarizes the membrane: an inhibitory postsynaptic potential (IPSP).' },
    { t: T.open + T.spread, title: 'Spread & summation', e: 'The graded potential spreads to the axon hillock, getting smaller with distance. There it adds to any other EPSPs and IPSPs (summation).' },
    { t: T.end, title: 'Signal ends', e: ENZYME_ENABLED ? 'Neurotransmitter leaves its receptors and is removed: an enzyme breaks it down in the cleft, reuptake transporters carry some back into the terminal, and some diffuses away. Receptor channels close and vesicles are recycled.' : 'Neurotransmitter leaves its receptors and is removed: reuptake transporters on the sides of the terminal carry it back in (nearby glial cells take up some too), and some diffuses away. Receptor channels close and vesicles are recycled.' }
  ];

  let scen = 'single', view = 'E', B = null;
  function build() {
    const sc = SCEN[scen];
    const types = [...new Set(sc.events.map(e => SYN[e.syn].type))];
    if (!types.includes(view)) view = types[0];
    const viewSyn = sc.events.find(e => SYN[e.syn].type === view).syn;
    const close = sc.events.filter(e => e.syn === viewSyn);
    // Neurotransmitter dots for the close-up (12 per spike: 2 vesicles × 6)
    const dots = [], recOpen = [[], [], [], [], []];
    close.forEach((ev, k) => {
      const docks = [250 + k * 35, 370 + k * 35];
      for (let i = 0; i < 12; i++) {
        const h = j => hash(k * 50 + i, j), rel = ev.t + T.release + 0.05 * i, arr = rel + 1.4;
        const rec = i < 10 ? i % 5 : -1, bindEnd = arr + 1.4 + 1.6 * h(2);
        dots.push({ k, i, x0: docks[i % 2] + (h(1) - 0.5) * 18, rel, arr, rec, bindEnd, fate: ENZYME_ENABLED && h(3) < 0.5 ? 'enzyme' : 'reuptake', h4: h(4), h5: h(5) });
        if (rec >= 0) recOpen[rec].push([arr, bindEnd]);
      }
    });
    // Postsynaptic potentials
    const local = t => close.reduce((v, ev) => v + SYN[ev.syn].local * kernel(t - ev.t - T.open, 2.0), 0);
    const hillSum = t => sc.events.reduce((v, ev) => v + SYN[ev.syn].amp * kernel(t - ev.t - T.open - T.spread, 2.4), 0);
    let tc = null;
    for (let t = 0; t <= DURATION; t += 0.01) if (P.rest + hillSum(t) >= P.threshold) { tc = t; break; }
    const hillV = t => (tc != null && t >= tc ? model.voltage(t - tc) : P.rest + hillSum(t));
    let peakT = 0, best = -1; for (let t = 0; t <= DURATION; t += 0.05) { const d = Math.abs(hillSum(t)); if (d > best) { best = d; peakT = t; } }
    B = { sc, viewSyn, close, dots, recOpen, local, hillSum, hillV, tc, peakT, types };
    B.enz = ENZYME_ENABLED ? enzymePlan(dots) : null;
  }

  /* ================================================ 1. SYNAPSE CLOSE-UP */
  const PRE = 300, POST = 352, POSTB = 368, RX = [200, 260, 320, 380, 440], ENZ_Y = 326;
  const CA = [{ x: 110, y: 236, side: -1 }, { x: 530, y: 236, side: 1 }];      // voltage-gated Ca²⁺ channels (side walls)
  const RU = [{ x: 110, y: 278, side: -1 }, { x: 530, y: 278, side: 1 }];      // reuptake transporters (side walls)
  const VES = [[230, 170], [320, 150], [410, 170], [190, 232], [285, 222], [375, 226], [450, 238], [330, 268]];
  const dockOf = (k, j) => [250 + k * 35, 370 + k * 35][j];
  const TERM = 'M280 0 L280 70 C280 120 110 120 110 220 L110 286 Q110 300 125 300 L515 300 Q530 300 530 286 L530 220 C530 120 360 120 360 70 L360 0 Z';
  const HALF_L = 'M280 0 L280 70 C280 120 110 120 110 220 L110 286 Q110 300 125 300 L320 300';
  const HALF_R = 'M360 0 L360 70 C360 120 530 120 530 220 L530 286 Q530 300 515 300 L320 300';
  const DEPOL = '#e2512c';
  // Enzyme route: it travels to each unbound transmitter molecule in turn and breaks it down.
  function enzymePlan(dots) {
    const eat = dots.filter(d => d.rec >= 0 && d.fate === 'enzyme').sort((a, b) => a.bindEnd - b.bindEnd);
    let prev = { t: 0, x: 150 }; const stops = [prev];
    for (const d of eat) {
      d.wx = RX[d.rec] + (d.h4 - 0.5) * 24;
      d.te = Math.max(d.bindEnd + 0.35, prev.t + Math.max(0.2, Math.abs(d.wx - prev.x) / 170));
      prev = { t: d.te, x: d.wx }; stops.push(prev);
    }
    return stops;
  }
  function enzymeAt(t) {
    const st = B.enz; let i = 0;
    while (i < st.length - 1 && st[i + 1].t <= t) i++;
    if (i === st.length - 1) return { x: st[i].x + 8 * Math.sin(t * 2), dir: 1 };
    const a = st[i], b = st[i + 1], travel = Math.max(0.2, Math.abs(b.x - a.x) / 170), start = b.t - travel;
    if (t < start) return { x: a.x + 5 * Math.sin(t * 3), dir: b.x >= a.x ? 1 : -1 };
    return { x: lerp(a.x, b.x, smooth((t - start) / travel)), dir: b.x >= a.x ? 1 : -1 };
  }
  function pacman(cx, cy, dir, t) {
    const r = 14, a = (0.25 + 0.3 * Math.abs(Math.sin(t * 14))) , x1 = cx + dir * r * Math.cos(a), y1 = cy - r * Math.sin(a), y2 = cy + r * Math.sin(a);
    return `<path d="M${cx.toFixed(1)} ${cy}L${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 1 ${dir > 0 ? 0 : 1} ${x1.toFixed(1)} ${y2.toFixed(1)}Z" fill="#7b6bb0" stroke="#4d407f" stroke-width="1.5"/><circle cx="${(cx - dir * 3).toFixed(1)}" cy="${cy - 7}" r="1.8" fill="#fff"/>`;
  }
  function vesicle(x, y, r, ntCol, op = 1) {
    let s = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" fill-opacity=".85" stroke="#8f9db0" stroke-width="2" opacity="${op}"/>`;
    if (r > 8) for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; s += `<circle cx="${(x + Math.cos(a) * r * 0.45).toFixed(1)}" cy="${(y + Math.sin(a) * r * 0.45).toFixed(1)}" r="3.2" fill="${ntCol}" opacity="${op}"/>`; }
    return s;
  }
  function closeup(t) {
    const type = SYN[B.viewSyn].type, ntCol = type === 'E' ? COL.ntE : COL.ntI, ionCol = type === 'E' ? COL.na : COL.cl;
    let s = '';
    const lv = B.local(t), f = clamp(Math.abs(lv) / 14);
    s += S.rect(0, 0, 640, POST, '#eef5fa');                                         // extracellular fluid & cleft
    s += S.rect(0, POSTB, 640, 480 - POSTB, '#f7f3ee') + (f > 0.01 ? S.rect(0, POSTB, 640, 480 - POSTB, `rgba(${lv > 0 ? COL.depol : COL.hyper},${(0.45 * f).toFixed(3)})`) : '');
    s += S.rect(0, POST, 640, POSTB - POST, '#efe3c6', 'stroke="#c4ae7a"');
    // Presynaptic terminal; the membrane itself changes colour as the AP arrives
    s += `<path d="${TERM}" fill="#eef1f6" stroke="#c4ae7a" stroke-width="7"/>`;
    B.close.forEach(ev => {
      const tau = t - ev.t;
      if (tau >= 0 && tau < 1.0) {                       // depolarization sweeping down both sides of the membrane
        const front = tau / 1.0 * 100;
        for (const d of [HALF_L, HALF_R]) s += `<path d="${d}" pathLength="100" fill="none" stroke="${DEPOL}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${Math.min(front, 100).toFixed(1)} 200" opacity=".9"/>`;
        s += S.text(372, 60, 'Action potential: membrane depolarizing', 12, DEPOL, 'start', 'font-weight="800" ' + halo('#eef5fa', 3));
      } else if (tau >= 1.0 && tau < 2.6) {                // whole terminal depolarized, then repolarizing
        const op = 0.9 * (1 - clamp((tau - 1.8) / 0.8));
        s += `<path d="${TERM}" fill="none" stroke="${DEPOL}" stroke-width="9" opacity="${op.toFixed(2)}"/>`;
      }
    });
    // Vesicles
    const used = new Set(B.close.flatMap((ev, k) => [2 * k, 2 * k + 1]));
    VES.forEach(([x, y], vi) => { if (!used.has(vi)) s += vesicle(x + 2 * Math.sin(t * 1.3 + vi), y + 2 * Math.cos(t * 1.1 + vi), 20, ntCol); });
    B.close.forEach((ev, k) => [0, 1].forEach(j => {
      const tau = t - ev.t, [rx0, ry0] = VES[2 * k + j], dx = dockOf(k, j);
      if (tau < T.dock) s += vesicle(rx0, ry0, 20, ntCol);
      else if (tau < T.fuse) { const e = smooth((tau - T.dock) / (T.fuse - T.dock)); s += vesicle(lerp(rx0, dx, e), lerp(ry0, PRE - 20, e), 20, ntCol); }
      else if (tau < T.fuse + 0.9) {
        const q = clamp((tau - T.fuse) / 0.9), w = 14 * (1 - Math.abs(q - 0.5) * 2);
        s += `<circle cx="${dx}" cy="${(PRE - 20 + 18 * q).toFixed(1)}" r="${Math.max(0.1, 20 * (1 - q)).toFixed(1)}" fill="#fff" stroke="#8f9db0" stroke-width="2"/>`;
        s += S.rect(dx - w - 2, PRE - 4, 2 * (w + 2), 8, '#eef5fa');
      } else if (tau > 9) s += vesicle(rx0, ry0, 20, ntCol, clamp((tau - 9) / 1.5).toFixed(2));
    }));
    // Voltage-gated Ca²⁺ channels in the side walls
    const caOpen = B.close.some(ev => t - ev.t >= T.ca && t - ev.t < T.caEnd);
    CA.forEach(c => {
      const g = caOpen ? 6 : 1.5, fill = caOpen ? COL.ca : '#e3eef0';
      s += `<rect x="${c.x - 15}" y="${c.y - g - 7}" width="30" height="7" rx="3" fill="${fill}" stroke="#0f6f7d" stroke-width="1.5"/><rect x="${c.x - 15}" y="${c.y + g}" width="30" height="7" rx="3" fill="${fill}" stroke="#0f6f7d" stroke-width="1.5"/>`;
      for (let i = 0; i < 3; i++) s += `<circle cx="${c.x + c.side * (30 + (i % 2) * 10)}" cy="${c.y - 16 + i * 16}" r="3.2" fill="${COL.ca}" opacity=".45"/>`;
    });
    B.close.forEach((ev, k) => CA.forEach((c, ci) => {
      for (let i = 0; i < 6; i++) {
        const p = t - ev.t - (T.ca + 0.18 * i); if (p < 0 || p > 1.1) continue;
        let px, py = c.y;
        if (p < 0.25) px = lerp(c.x + c.side * 40, c.x - c.side * 18, smooth(p / 0.25));
        else { const q = (p - 0.25) / 0.85; px = lerp(c.x - c.side * 18, 320 + c.side * (40 + 40 * hash(i, k + ci)), q); py = lerp(c.y, 250 + 30 * hash(i, 9 + k + ci), q); }
        s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${COL.ca}" stroke="#fff" stroke-width="1.2" opacity="${(p < 0.8 ? 1 : 1 - (p - 0.8) / 0.3).toFixed(2)}"/>`;
      }
    }));
    // Reuptake transporters in the side walls
    RU.forEach(r => {
      s += `<rect x="${r.x - 16}" y="${r.y - 9}" width="32" height="18" rx="9" fill="#d9e6f7" stroke="#2c6cc2" stroke-width="1.6"/>`;
      s += `<path d="M${r.x + r.side * 9} ${r.y}h${-r.side * 16}m${r.side * 5} -4l${-r.side * 5} 4 ${r.side * 5} 4" fill="none" stroke="#2c6cc2" stroke-width="1.6"/>`;
    });
    // Postsynaptic receptors: AMPA (glutamate → Na⁺) or GABA-A (GABA → Cl⁻)
    RX.forEach((x, j) => {
      const open = B.recOpen[j].some(([a, b]) => t >= a && t < b), g = open ? 6 : 1.5;
      // Receptors keep their identity colour (AMPA orange, GABA-A purple) while closed; open = saturated.
      const fill = type === 'E' ? (open ? '#f5b971' : '#fdebd6') : (open ? '#cfa0dc' : '#f3e4f6'), stroke = type === 'E' ? '#c56a12' : '#7d3a99';
      s += `<path d="M${x - g - 10} ${POST + 24}v-30q0-4 4-4h6v34z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><path d="M${x + g + 10} ${POST + 24}v-30q0-4 -4-4h-6v34z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
      if (!open) s += S.line(x - 2, POST + 6, x + 2, POST + 6, stroke, 'stroke-width="3"');
      B.recOpen[j].forEach(([a, b], n) => {
        for (let ts = a + 0.15; ts < b; ts += 0.32) {
          const p = t - ts; if (p < 0 || p > 1.0) continue;
          const hx = hash(Math.round(ts * 100) + j, 7 + n);
          let px = x, py;
          if (p < 0.3) py = lerp(POST - 22, POSTB + 10, smooth(p / 0.3));
          else { const q = (p - 0.3) / 0.7; px = x + (hx - 0.5) * 70 * q; py = lerp(POSTB + 10, POSTB + 60 + 30 * hx, q); }
          s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${ionCol}" stroke="#fff" stroke-width="1.2" opacity="${(p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4).toFixed(2)}"/>`;
        }
      });
    });
    // Neurotransmitter: release → diffuse → bind → enzyme or reuptake
    for (const d of B.dots) {
      const p = t - d.rel; if (p < 0) continue;
      let x, y, op = 1;
      const xr = d.rec >= 0 ? RX[d.rec] : (d.h4 < 0.5 ? -30 : 670);
      if (t < d.arr) { const e = smooth(p / 1.4); x = lerp(d.x0, d.rec >= 0 ? xr : d.x0 + (xr - d.x0) * 0.4, e) + 7 * Math.sin(p * 9 + d.i); y = lerp(PRE + 6, d.rec >= 0 ? POST - 12 : PRE + 26, e); }
      else if (d.rec < 0) { const q = clamp((t - d.arr) / 1.6); x = lerp(d.x0 + (xr - d.x0) * 0.4, xr, q); y = PRE + 26 + 6 * Math.sin(q * 8); op = 1 - q; }
      else if (t < d.bindEnd) { x = xr + (d.i % 2 ? 4 : -4); y = POST - 12; }
      else if (d.fate === 'enzyme') {
        const q = t - d.bindEnd;
        if (t < d.te) { const e = smooth(clamp(q / 0.3)); x = lerp(xr, d.wx, e) + 2 * Math.sin(t * 8 + d.i); y = lerp(POST - 12, ENZ_Y + 4, e); }
        else if (t < d.te + 0.4) {                        // broken into fragments
          const e = (t - d.te) / 0.4;
          s += `<circle cx="${(d.wx - 9 * e).toFixed(1)}" cy="${(ENZ_Y + 4 - 10 * e).toFixed(1)}" r="2.2" fill="${ntCol}" opacity="${(1 - e).toFixed(2)}"/><circle cx="${(d.wx + 9 * e).toFixed(1)}" cy="${(ENZ_Y + 4 + 8 * e).toFixed(1)}" r="2.2" fill="${ntCol}" opacity="${(1 - e).toFixed(2)}"/>`;
          continue;
        } else continue;
      } else {
        const q = t - d.bindEnd, r = RU[xr < 320 ? 0 : 1], ox = r.x + r.side * 24;
        if (q < 1.0) { const e = smooth(q); x = lerp(xr, ox, e); y = lerp(POST - 12, PRE + 18, e); }
        else if (q < 1.6) { const e = smooth((q - 1.0) / 0.6); x = ox; y = lerp(PRE + 18, r.y, e); }
        else if (q < 2.1) { const e = (q - 1.6) / 0.5; x = lerp(ox, r.x - r.side * 22, e); y = r.y; op = 1 - e * 0.8; }
        else continue;
      }
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${ntCol}" stroke="#fff" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
    }
    // Enzyme patrolling the cleft
    const ez = ENZYME_ENABLED ? enzymeAt(t) : null;
    if (ez) s += pacman(ez.x, ENZ_Y, ez.dir, t);
    // Labels
    const lab = (x, y, txt, anchor = 'start', col = C.muted) => S.text(x, y, txt, 11.5, col, anchor, 'font-weight="700" ' + halo('#eef5fa', 3));
    s += lab(12, 20, 'Presynaptic axon terminal', 'start', C.ink);
    s += lab(628, 20, type === 'E' ? 'Excitatory synapse (S1) · glutamate' : 'Inhibitory synapse (S3) · GABA', 'end', type === 'E' ? '#b5600c' : '#7d3a99');
    s += lab(470, 130, 'Synaptic vesicles');
    s += lab(96, CA[0].y - 14, 'Ca²⁺ channel', 'end', '#0f6f7d') + lab(544, CA[1].y - 14, 'Ca²⁺ channel', 'start', '#0f6f7d');
    s += lab(96, RU[0].y + 4, 'Reuptake', 'end', '#2c6cc2') + lab(544, RU[1].y + 4, 'Reuptake', 'start', '#2c6cc2');
    s += lab(10, PRE + 44, 'Synaptic cleft') + (ez ? lab(ez.x, ENZ_Y - 18, 'Enzyme', 'middle', '#4d407f') : '');
    s += lab(10, POSTB + 20, 'Postsynaptic membrane (dendrite)', 'start', C.ink);
    s += lab(628, POSTB + 20, type === 'E' ? 'AMPA receptors (Na⁺ channels)' : 'GABA-A receptors (Cl⁻ channels)', 'end', type === 'E' ? '#b5600c' : '#7d3a99');
    if (Math.abs(lv) > 1) s += S.text(628, 470, lv > 0 ? 'EPSP: inside becomes less negative' : 'IPSP: inside becomes more negative', 13, lv > 0 ? C.na : C.k, 'end', 'font-weight="800" ' + halo('#fff', 4));
    $('closeup').innerHTML = s;
  }

  /* ============================================= 2. POSTSYNAPTIC NEURON */
  const SITE = { 1: [[70, 52], [150, 86], [260, 116], [334, 128]], 2: [[70, 208], [150, 172], [260, 142], [334, 132]], 3: [[268, 86], [300, 98], [334, 126]] };
  const along = (pts, f) => { const segs = pts.length - 1, u = clamp(f) * segs, i = Math.min(segs - 1, Math.floor(u)), r = u - i; return [lerp(pts[i][0], pts[i + 1][0], r), lerp(pts[i][1], pts[i + 1][1], r)]; };
  function neuron(t) {
    let s = S.text(10, 18, 'Postsynaptic neuron', 13, C.ink, 'start', 'font-weight="700"');
    // dendrites, soma, hillock, axon
    s += `<path d="M70 52 L150 86 L262 118 M70 208 L150 172 L262 142 M150 86 L120 120 M150 172 L118 140" fill="none" stroke="#9fc8c0" stroke-width="9" stroke-linecap="round"/>`;
    const hv = B.hillV(t), d = hv - P.rest, hf = clamp(Math.abs(d) / 20);
    s += `<circle cx="300" cy="130" r="42" fill="#dcefeb" stroke="#087c76" stroke-width="2"/><circle cx="300" cy="130" r="12" fill="#b9dcd5"/>`;
    s += `<path d="M338 114 L374 124 L374 136 L338 146Z" fill="${d >= 0 ? `rgba(${COL.depol},${(0.15 + 0.75 * hf).toFixed(2)})` : `rgba(${COL.hyper},${(0.15 + 0.7 * hf).toFixed(2)})`}" stroke="#087c76" stroke-width="2"/>`;
    s += S.line(374, 130, 512, 130, '#087c76', 'stroke-width="6"');
    s += S.text(356, 172, 'Axon hillock', 11, C.ink, 'middle', 'font-weight="700"') + S.text(356, 186, '(trigger zone)', 10.5, C.muted, 'middle');
    s += S.text(356, 104, `${hv >= 0 ? '+' : ''}${hv.toFixed(0)} mV`, 13, hv >= P.threshold ? C.na : d < -0.5 ? C.k : C.ink, 'middle', 'font-weight="800" ' + halo());
    s += S.text(300, 196, 'Cell body', 10.5, C.muted, 'middle');
    // synapse sites
    const active = new Set(B.sc.events.map(e => e.syn));
    for (const id of [1, 2, 3]) {
      const [x, y] = SITE[id][0], col = SYN[id].type === 'E' ? COL.ntE : COL.ntI, on = active.has(id);
      s += `<circle cx="${x}" cy="${y}" r="11" fill="${on ? col : '#e6eaea'}" stroke="${on ? '#5a3b10' : '#b5bfbd'}" stroke-width="1.5"/>` + S.text(x, y + 4, SYN[id].name, 9.5, on ? '#fff' : '#8a9694', 'middle', 'font-weight="800"');
    }
    s += S.text(20, 240, 'S1, S2 excitatory', 10.5, COL.ntE, 'start', 'font-weight="700"') + S.text(140, 240, 'S3 inhibitory', 10.5, COL.ntI, 'start', 'font-weight="700"');
    // Graded potentials travelling to the hillock, shrinking as they go
    B.sc.events.forEach(ev => {
      const p = (t - ev.t - T.open) / T.spread; if (p < 0 || p > 1.15) return;
      const [x, y] = along(SITE[ev.syn], p), e = SYN[ev.syn].type === 'E';
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(13 - 6 * clamp(p)).toFixed(1)}" fill="rgba(${e ? COL.depol : COL.hyper},${(0.85 - 0.45 * clamp(p)).toFixed(2)})"/>`;
    });
    if (B.sc.events.some(ev => { const p = (t - ev.t - T.open) / T.spread; return p >= 0 && p < 1.2; })) s += S.text(250, 222, 'graded potentials fade as they spread', 10.5, C.muted, 'middle');
    // Action potential leaving the hillock
    if (B.tc != null && t >= B.tc) {
      const q = (t - B.tc) / 1.6;
      if (q < 1.2) s += `<ellipse cx="${lerp(380, 505, clamp(q)).toFixed(1)}" cy="130" rx="16" ry="10" fill="${COL.ap}" stroke="${C.na}" stroke-width="2"/>`;
      s += S.text(450, 110, 'Action potential!', 12, C.na, 'middle', 'font-weight="800" ' + halo());
      s += S.text(450, 156, 'continues in Part 2 →', 10.5, C.na, 'middle', 'font-weight="700"');
    } else s += S.text(450, 118, 'Axon', 11, C.muted, 'middle');
    $('neuron').innerHTML = s;
  }

  /* ================================================== 3. VOLTAGE GRAPH */
  function graph(t) {
    const x0 = 52, x1 = 508, y0 = 44, y1 = 200, X = tt => x0 + tt / DURATION * (x1 - x0), Y = v => y1 - (v + 95) / 135 * (y1 - y0);
    let s = S.text(10, 16, 'Voltage at the axon hillock over time', 13, C.ink, 'start', 'font-weight="700"');
    for (const [v, lab, col, dash] of [[30, '+30'], [0, '0'], [P.threshold, '−55', C.threshold, '5 4'], [P.rest, '−75'], [-90, '−90']]) {
      s += S.line(x0, Y(v), x1, Y(v), col || '#e1e7e5', dash ? `stroke-dasharray="${dash}"` : '') + S.text(x0 - 5, Y(v) + 4, lab, 10, col || C.muted, 'end');
    }
    s += S.text(x1, Y(P.threshold) - 4, 'threshold', 10, C.threshold, 'end');
    const type = SYN[B.viewSyn].type;
    s += `<path d="${S.curve(B.hillV, 0, DURATION, 480, X, Y)}" fill="none" stroke="${C.ink}" stroke-width="2.6"/>`;
    B.sc.events.forEach(ev => { const x = X(ev.t); s += `<path d="M${x.toFixed(1)} ${y0 - 4}l-4 -7h8z" fill="${SYN[ev.syn].type === 'E' ? COL.ntE : COL.ntI}"/>`; });
    s += S.line(x0, y1, x1, y1, C.muted);
    for (let tt = 0; tt <= DURATION; tt += 4) s += S.text(X(tt), y1 + 14, tt, 10, C.muted, 'middle');
    s += S.text((x0 + x1) / 2, y1 + 30, 'Time (ms, slowed and simplified) · ▼ = presynaptic action potential', 10.5, C.muted, 'middle');
    s += S.line(x0, 236, x0 + 22, 236, C.ink, 'stroke-width="2.6"') + S.text(x0 + 28, 240, 'Voltage at the axon hillock (trigger zone)', 10.5, C.muted);
    if (B.tc != null) s += S.text(X(B.tc) + 8, Y(10), 'threshold reached → action potential', 10.5, C.na, 'start', 'font-weight="700" ' + halo());
    const x = X(t);
    s += S.line(x, y0, x, y1, C.purple, 'stroke-width="2"') + `<circle cx="${x.toFixed(1)}" cy="${Y(B.hillV(t)).toFixed(1)}" r="5" fill="${C.purple}" stroke="#fff" stroke-width="2"/>`;
    $('graph').innerHTML = s;
  }

  /* ======================================================= status */
  function status(t) {
    const type = SYN[B.viewSyn].type, first = B.close[0].t;
    let idx = -1; STEPS.forEach((st, i) => { if (t >= first + st.t) idx = i; });
    $('steps').innerHTML = STEPS.map((st, i) => `<li class="${i === idx ? 'now' : i < idx ? 'done' : ''}"><b>${i + 1}</b>${st.title}</li>`).join('');
    const st = STEPS[Math.max(0, idx)];
    $('step-text').textContent = idx < 0 ? 'Press Play to send an action potential to the synapse.' : (st.e || (type === 'E' ? st.eE : st.eI));
    let res = '';
    if (B.tc != null && t >= B.tc) res = '<b>Result:</b> the EPSPs summed to threshold (−55 mV) at the axon hillock, so an <b>action potential</b> fires and travels down the axon. <a href="../unmyelinated-axon/index.html">Follow it in Part 2 →</a>';
    else if (t >= B.peakT && B.tc == null) res = {
      single: '<b>Result:</b> one EPSP depolarized the hillock by about 11 mV. That is below threshold, so <b>no action potential</b>. Try temporal or spatial summation.',
      inhib: '<b>Result:</b> the IPSP hyperpolarized the hillock, moving it <b>further from threshold</b>. No action potential.',
      mixed: '<b>Result:</b> the IPSP cancelled part of the two EPSPs, so the hillock stayed <b>below threshold</b>. No action potential.'
    }[scen] || '';
    $('result').innerHTML = res;
    $('result').hidden = !res;
  }

  /* ======================================================= wiring */
  function render(t) { closeup(t); neuron(t); graph(t); status(t); }
  const player = NL.createPlayer({
    duration: DURATION, step: 0.1, render, initialTime: 3.3,
    ids: { play: 'play', restart: 'restart', step: 'step', next: 'next', speed: 'speed', loop: 'loop', time: 'time', clock: 'clock' },
    stageTimes: () => { const f = B.close[0].t, list = STEPS.map(s => f + s.t + 0.001); if (B.tc != null) list.push(B.tc + 0.001); return list.sort((a, b) => a - b); }
  });
  function setScenario(id) {
    scen = id; build();
    document.querySelectorAll('[data-scen]').forEach(b => b.setAttribute('aria-pressed', b.dataset.scen === id));
    $('scen-text').textContent = SCEN[id].text;
    $('view-switch').hidden = B.types.length < 2;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
    player.pause(); player.setTime(0);
  }
  document.querySelectorAll('[data-scen]').forEach(b => b.addEventListener('click', () => setScenario(b.dataset.scen)));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; build(); document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === view)); player.invalidate(); }));
  build(); $('scen-text').textContent = SCEN[scen].text; $('view-switch').hidden = true;

  /* ======================================================= page tabs */
  function showTab(id) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== id; });
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); try { history.replaceState(null, '', '#' + b.dataset.tab); } catch (e) { /* file:// */ } }));
  showTab(location.hash === '#neurotransmitters' ? 'neurotransmitters' : 'simulation');

  /* ======================================================= neurotransmitters */
  const NTS = [
    { name: 'Glutamate', kind: 'E',
      effect: 'The main excitatory neurotransmitter in the brain. Binds AMPA receptors, which open to let Na⁺ in, producing EPSPs.',
      where: 'Brain and spinal cord; learning and memory.',
      nursing: 'Too much glutamate over-excites and damages neurons (excitotoxicity) after stroke, head injury and during prolonged seizures, so neurological checks matter in these patients.',
      pharm: 'Memantine (used for moderate to severe Alzheimer disease) and ketamine (used for anaesthesia) both block a type of glutamate receptor called NMDA.' },
    { name: 'Acetylcholine (ACh)', kind: 'B',
      effect: 'Excitatory at skeletal muscle and in the brain; inhibitory at the heart (slows heart rate).',
      where: 'Neuromuscular junction, parasympathetic nervous system, autonomic ganglia, brain (memory, attention).',
      ends: 'Broken down in the synaptic cleft by the enzyme acetylcholinesterase into acetate and choline. Choline is taken back into the terminal and reused to make new ACh.',
      nursing: 'Loss of ACh-releasing neurons in the brain contributes to the memory loss of Alzheimer disease. Drugs that block ACh in the brain (anticholinergics) can cause confusion and delirium, especially in older adults.',
      pharm: 'Donepezil (used for Alzheimer disease) blocks acetylcholinesterase in the brain, so ACh stays in the synapse longer and helps memory.' },
    { name: 'Norepinephrine', kind: 'E',
      effect: 'Mainly excitatory. The "fight or flight" transmitter: raises heart rate, blood pressure and alertness.',
      where: 'Sympathetic nervous system; brainstem (attention, arousal).',
      nursing: 'In the brain, norepinephrine supports alertness, attention and mood. When antidepressants that raise it are started, monitor mood changes and suicidal thoughts, especially in young adults.',
      pharm: 'Venlafaxine (an SNRI used for depression and anxiety) blocks the reuptake of norepinephrine and serotonin in the brain.' },
    { name: 'Epinephrine', kind: 'E',
      effect: 'Excitatory; mostly released as a hormone from the adrenal medulla. Raises heart rate and opens airways.',
      where: 'Adrenal medulla (bloodstream); small amounts in the brain.',
      nursing: 'Epinephrine plays only a small role in the brain (a few brainstem neurons). Most nursing care involving epinephrine happens outside the CNS and is covered later in the program.',
      pharm: 'No common drugs target epinephrine in the brain. Epinephrine medications (e.g., for anaphylaxis) act outside the CNS and are covered in pharmacology.' },
    { name: 'Dopamine', kind: 'B',
      effect: 'Excitatory or inhibitory depending on the receptor. Controls movement, motivation and reward.',
      where: 'Basal ganglia (movement), reward pathways, hypothalamus.',
      nursing: 'Loss of dopamine neurons causes Parkinson disease (tremor, slow movement, high fall risk).',
      pharm: 'Levodopa with carbidopa (used for Parkinson disease) is converted to dopamine in the brain. Antipsychotics such as haloperidol and risperidone (used for schizophrenia) block dopamine receptors and can cause movement side effects. Stimulants such as amphetamine (used for ADHD) increase dopamine.' },
    { name: 'Serotonin (5-HT)', kind: 'B',
      effect: 'Mostly inhibitory/modulatory. Regulates mood, sleep, appetite and pain.',
      where: 'Brainstem and widespread brain areas; most of the body\'s serotonin is in the gut.',
      nursing: 'Watch for serotonin syndrome (agitation, fever, tremor, fast heart rate) when serotonin-raising drugs are combined.',
      pharm: 'Sertraline (an SSRI used for depression and anxiety) blocks serotonin reuptake in the brain and usually takes a few weeks to work.' },
    { name: 'Histamine', kind: 'E',
      effect: 'Excitatory in the brain; keeps you awake and alert.',
      where: 'Hypothalamus (wakefulness); also released by mast cells in allergic reactions.',
      nursing: 'Drowsiness from sedating antihistamines raises fall risk, especially in older adults.',
      pharm: 'Diphenhydramine (used for allergies and as an over-the-counter sleep aid) crosses into the brain and blocks histamine receptors there, which is why it causes drowsiness.' },
    { name: 'Substance P', kind: 'E',
      effect: 'Excitatory; transmits pain signals.',
      where: 'Pain pathways in the spinal cord (dorsal horn).',
      nursing: 'Part of the pain pathway that nurses assess and treat.',
      pharm: 'Aprepitant (used to prevent chemotherapy-induced nausea and vomiting) blocks substance P receptors in the brain. Opioids also reduce substance P release in the spinal cord.' },
    { name: 'GABA', kind: 'I',
      effect: 'The main inhibitory neurotransmitter in the brain. Binds GABA-A receptors (Cl⁻ channels); Cl⁻ entry produces IPSPs.',
      where: 'Throughout the brain.',
      nursing: 'GABA-enhancing drugs cause sedation; combined with alcohol or opioids they can slow breathing dangerously. Monitor level of consciousness and respiratory rate, and take fall precautions.',
      pharm: 'Many sedative and anaesthetic drugs are GABAergic (i.e., they bind to the GABA receptors and enhance the effects of GABA). Examples: benzodiazepines such as lorazepam (used for anxiety and seizures) and midazolam (used for sedation during procedures); propofol (used for general anaesthesia and ICU sedation); barbiturates such as phenobarbital (used for seizures). Flumazenil binds to the GABA receptor and reduces the effects of GABA, and hence can reverse the effects of the benzodiazepines.' },
    { name: 'Glycine', kind: 'I',
      effect: 'The main inhibitory neurotransmitter in the spinal cord. Opens Cl⁻ channels.',
      where: 'Spinal cord and brainstem.',
      nursing: 'Tetanus toxin travels to the spinal cord and blocks glycine release, so motor neurons fire uncontrolled, causing severe muscle spasms (lockjaw).',
      pharm: 'Strychnine acts as a poison because it binds to and blocks glycine receptors in the CNS. Consequently, the motor neurons get excited too easily, resulting in spastic muscle contractions and even death through respiratory failure.' },
    { name: 'Endorphins & enkephalins', kind: 'I',
      effect: 'Inhibitory; the body\'s natural pain relievers. Reduce pain signalling.',
      where: 'Brain and spinal cord pain pathways.',
      nursing: 'Opioid medications act on the same receptors. Monitor respiratory rate and sedation level in patients receiving opioids.',
      pharm: 'Morphine and other opioids (used for moderate to severe pain) activate the same receptors as endorphins. Naloxone blocks the opioid receptors to prevent opioids (e.g., fentanyl) from binding to these receptors, thus reversing the overdose.' }
  ];
  const KIND = { E: ['Excitatory', 'kind-e'], I: ['Inhibitory', 'kind-i'], B: ['Depends on receptor', 'kind-b'] };
  function renderNT(filter) {
    $('nt-cards').innerHTML = NTS.filter(n => filter === 'all' || n.kind === filter).map(n => `
      <article class="nt-card ${KIND[n.kind][1]}"><header><h3>${n.name}</h3><span class="nt-pill">${KIND[n.kind][0]}</span></header>
      <dl><dt>Main effect</dt><dd>${n.effect}</dd><dt>Where it is used</dt><dd>${n.where}</dd>${n.ends ? `<dt>How its action ends</dt><dd>${n.ends}</dd>` : ''}<dt>Nursing correlation</dt><dd>${n.nursing}</dd><dt>Pharmacology</dt><dd class="nt-pharm">${n.pharm}</dd></dl></article>`).join('');
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === filter));
  }
  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => renderNT(b.dataset.filter)));
  renderNT('all');

  /* ======================================================= quiz */
  NL.renderQuiz($('quiz'), [
    { prompt: 'What directly triggers synaptic vesicles to release neurotransmitter?', choices: ['Na⁺ entering the axon terminal', 'Ca²⁺ entering the axon terminal', 'K⁺ leaving the axon terminal', 'Neurotransmitter binding to the vesicle'], answer: 1, explanation: 'Depolarization opens voltage-gated Ca²⁺ channels. Ca²⁺ entry triggers vesicles to fuse with the membrane (exocytosis).' },
    { prompt: 'The receptors on the postsynaptic membrane in this simulation are…', choices: ['Voltage-gated channels', 'Ligand-gated (chemically gated) channels', 'Leak channels', 'Na⁺/K⁺ pumps'], answer: 1, explanation: 'They open when a chemical (the neurotransmitter) binds, not in response to voltage.' },
    { prompt: 'An IPSP makes the postsynaptic neuron…', choices: ['More likely to fire, because it depolarizes the membrane', 'Less likely to fire, because it hyperpolarizes the membrane', 'Fire an action potential immediately', 'Release more neurotransmitter'], answer: 1, explanation: 'An IPSP (e.g., Cl⁻ entering through GABA receptors) makes the inside more negative, moving the membrane further from threshold.' },
    { prompt: 'One EPSP is not enough to reach threshold. Several EPSPs from the SAME synapse arriving in quick succession add up. This is called…', choices: ['Spatial summation', 'Temporal summation', 'Saltatory conduction', 'Repolarization'], answer: 1, explanation: 'Temporal summation: repeated inputs over time add up before each one fades. Spatial summation is inputs from different synapses at the same time.' },
    { prompt: 'Where must the summed potentials reach threshold for an action potential to start?', choices: ['The dendrite', 'The synaptic cleft', 'The axon hillock (trigger zone)', 'The axon terminal'], answer: 2, explanation: 'The axon hillock has many voltage-gated Na⁺ channels. When it reaches threshold (about −55 mV), an action potential begins and travels down the axon.' },
    { prompt: 'A patient with myasthenia gravis has muscle weakness. What is happening at the neuromuscular junction?', choices: ['Too much acetylcholine is released', 'Antibodies block acetylcholine receptors, so fewer receptor channels open', 'GABA is released instead of acetylcholine', 'Ca²⁺ channels stay open'], answer: 1, explanation: 'With fewer working ACh receptors, the muscle\'s postsynaptic potential is too small to trigger contraction reliably. Acetylcholinesterase inhibitors help by keeping ACh in the cleft longer.' }
  ]);
})();
