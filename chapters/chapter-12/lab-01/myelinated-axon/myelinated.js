/* Part 3 — saltatory conduction in a myelinated axon.

   Same four linked panels as Part 2, all showing the same moment:
     1. Axon strip   — myelin sheath over the internodes, nodes of Ranvier with
                       their Na⁺/K⁺ channels, the AP jumping node to node.
     2. Propagation  — three nodes around the probe: Na⁺ enters at a node and
                       spreads quickly under the myelin to the next node.
     3. AP graph     — voltage over time at the probe node (phases 1–4).
     4. Close-up     — the channels at the probe node, flanked by myelin.

   The membrane model is the same as Part 2; only the geometry changes:
   the action potential is generated ONLY at nodes. Distances and timing are
   schematic (nodes drawn 1 mm apart, much wider than real nodes). */
(function () {
  'use strict';
  const NL = window.NeuroLab, { clamp, smooth, lerp, hash, $ } = NL.util, S = NL.svg, C = NL.colors;
  NL.renderChrome('myelinated');

  /* ---------------------------------------------------------- parameters */
  const L = 8, INTER = 1.0, N = 8;                     // axon length, node spacing (mm), number of nodes
  const NODES = Array.from({ length: N }, (_, k) => 0.5 + k * INTER);
  const T0 = 0.6, HOP = 0.5;                            // first node fires at T0; current needs HOP ms to reach the next node
  const GAP = 5, WAVES = [0, GAP];                      // two action potentials, as in Part 2
  const model = NL.createMembrane(), P = model.P;
  const nodeArrival = k => T0 + k * HOP;
  const DURATION = Math.ceil(nodeArrival(N - 1) + GAP + P.tRecover + 0.5);
  const ageNode = (k, t) => { const a = t - nodeArrival(k); return a - GAP >= P.tFoot ? a - GAP : a; };
  const waveAtNode = (k, t) => (t - nodeArrival(k) - GAP >= P.tFoot ? 2 : 1);
  const nodeState = (k, t) => model.state(ageNode(k, t));
  let probeK = 0;   // probe starts at node 1

  const phaseFill = { 'Resting': C.rest, 'Reaching threshold': C.stim, 'Depolarization': C.depol, 'Repolarization': C.repol, 'Hyperpolarization': C.hyper, 'Return to resting potential': C.ret };
  const phaseNum = { 'Depolarization': 1, 'Repolarization': 2, 'Hyperpolarization': 3, 'Return to resting potential': 4 };
  const REF = { absolute: { bar: '#6f978a', text: '#fff', label: 'Absolute refractory', short: 'Absolute' }, relative: { bar: '#cfe0d8', text: '#21453b', label: 'Relative refractory', short: 'Relative' } };
  const halo = (c = '#fff', w = 4) => `paint-order="stroke" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
  const signSize = (v, base, extra) => base + extra * Math.min(1, Math.abs(v) / 80);
  const sign = (x, y, positive, size) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" fill="${positive ? '#c8352a' : '#2058a8'}" text-anchor="middle" font-weight="800">${positive ? '+' : '−'}</text>`;
  const naStateColor = { closed: '#ecc7c1', open: C.naOpen, inactivated: C.inact };
  const MY = { fill: '#f1dfb8', line: '#b8975a' };
  const showFlux = () => $('show-flux').checked, showCharge = () => $('show-charge').checked;
  const hatchDefs = p => `<pattern id="${p}abs" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#2f5f4a" stroke-width="2.2" stroke-opacity=".5"/></pattern><pattern id="${p}rel" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#2f5f4a" stroke-width="1.2" stroke-opacity=".28"/></pattern>`;

  // Voltage anywhere along the axon. Nodes generate the AP; under the myelin
  // the voltage simply follows the neighbouring nodes (passive spread).
  function vAt(mm, t) {
    if (mm <= NODES[0]) { const v = nodeState(0, t).voltage; return P.rest + (v - P.rest) * Math.exp(-(NODES[0] - mm) / 0.5); }
    if (mm >= NODES[N - 1]) { const v = nodeState(N - 1, t).voltage; return P.rest + (v - P.rest) * Math.exp(-(mm - NODES[N - 1]) / 0.5); }
    const k = Math.floor((mm - NODES[0]) / INTER), f = (mm - NODES[k]) / INTER;
    const a = nodeState(k, t).voltage - P.rest, b = nodeState(k + 1, t).voltage - P.rest;
    // Depolarization from node k advances under the myelin as a front; it
    // reaches node k+1 (f = 1) exactly when that node reaches threshold.
    const front = clamp((ageNode(k, t) + 0.05) / HOP), reach = f <= front ? 1 : Math.exp(-(f - front) * 10);
    return P.rest + (a * (1 - f) * reach + b * f) * (1 - 0.1 * Math.sin(Math.PI * f));
  }
  const glow = v => clamp((v - P.rest) / (P.peak - P.rest));
  // The node that most recently fired for each action potential (for "AP n" labels and jump arrows)
  function leading(t) {
    return WAVES.map((w, i) => {
      let lead = -1; for (let k = 0; k < N; k++) if (t - nodeArrival(k) - w >= 0) lead = k;
      return { i, lead, age: lead >= 0 ? t - nodeArrival(lead) - w : -1 };
    }).filter(o => o.lead >= 0 && !(o.lead === N - 1 && o.age > 1.2));
  }

  /* ===================================================== 1. AXON STRIP */
  const SX0 = 72, SX1 = 932, SW = SX1 - SX0, TUBE0 = 66, TUBE1 = 110, NHW = 0.09;
  const Xs = mm => SX0 + mm / L * SW;
  const CU3 = [0.2, 0.5, 0.8];
  function strip(t) {
    let s = `<defs>${S.arrowMarkers()}</defs>`;
    s += S.text(SX0, 14, 'Whole axon (8 mm) · myelinated: the action potential jumps from node to node →', 13.5, C.ink, 'start', 'font-weight="700"') + S.text(SX1, 14, 'Click a node to move the probe', 12, C.muted, 'end');
    s += S.rect(SX0, TUBE0, SW, TUBE1 - TUBE0, C.rest);
    const n = 200;
    for (let i = 0; i < n; i++) { const g = glow(vAt((i + 0.5) / n * L, t)); if (g > 0.01) s += S.rect(Xs(i / n * L), TUBE0, SW / n + 0.4, TUBE1 - TUBE0, `rgba(221,59,44,${(0.55 * g).toFixed(3)})`); }
    // Myelin over each internode (and the ends), above and below the axon
    const segs = [[0, NODES[0] - NHW], ...NODES.slice(0, -1).map((x, k) => [x + NHW, NODES[k + 1] - NHW]), [NODES[N - 1] + NHW, L]];
    for (const [a, b] of segs) {
      s += `<rect x="${Xs(a).toFixed(1)}" y="${TUBE0 - 15}" width="${(Xs(b) - Xs(a)).toFixed(1)}" height="15" rx="7" fill="${MY.fill}" stroke="${MY.line}"/>`;
      s += `<rect x="${Xs(a).toFixed(1)}" y="${TUBE1}" width="${(Xs(b) - Xs(a)).toFixed(1)}" height="15" rx="7" fill="${MY.fill}" stroke="${MY.line}"/>`;
    }
    NODES.forEach((x, k) => {
      const st = nodeState(k, t), x0 = Xs(x - NHW), w = Xs(x + NHW) - x0, a = ageNode(k, t);
      s += S.rect(x0, TUBE0, w, TUBE1 - TUBE0, phaseFill[st.phase]);
      const num = phaseNum[st.phase];
      if (num) s += `<circle cx="${Xs(x).toFixed(1)}" cy="${TUBE0 + 14}" r="7.5" fill="#fff" stroke="${C.ink}"/>` + S.text(Xs(x), TUBE0 + 17.5, num, 10, C.ink, 'middle', 'font-weight="800"');
      CU3.forEach((u, j) => {
        const xx = x0 + 2 + j * (w - 8) / 2;
        s += S.rect(xx, TUBE0 - 4, 4, 8, naStateColor[model.naChannel(u, a)]) + S.rect(xx, TUBE1 - 4, 4, 8, model.kChannel(u, a) === 'open' ? C.kOpen : '#cbd8ea');
      });
      if (showCharge()) { const pos = st.voltage >= 0, z = signSize(st.voltage, 8, 9); s += sign(Xs(x), TUBE0 - 18, !pos, z) + sign(Xs(x), TUBE1 - 9, pos, z); }
      if (REF[st.refractory]) s += S.rect(Xs(x) - 14, TUBE1 + 19, 28, 9, REF[st.refractory].bar, 'rx="2"');
      if (k !== probeK) s += S.text(Xs(x), TUBE1 + 46, `N${k + 1}`, 9.5, k === probeK ? C.purple : C.muted, 'middle', 'font-weight="700"');
    });
    // Saltatory "jump" arrow from the node that just fired to the next node
    for (const o of leading(t)) {
      const x1 = Xs(NODES[o.lead]);
      if (o.lead > 0 && o.age < 0.45) {          // arc appears once the next node has actually fired
        const x0 = Xs(NODES[o.lead - 1]);
        s += `<path d="M${x0} ${TUBE0 - 28}Q${(x0 + x1) / 2} ${TUBE0 - 52} ${x1 - 4} ${TUBE0 - 30}" fill="none" stroke="${C.na}" stroke-width="2.4" stroke-dasharray="5 3" marker-end="url(#arr-na)"/>`;
      }
      s += S.text(x1, 30, `AP ${o.i + 1}`, 12, C.ink, 'middle', 'font-weight="800" ' + halo());
    }
    s += S.text(SX0 - 7, TUBE0 + 4, 'Na⁺', 11.5, C.na, 'end', 'font-weight="800"') + S.text(SX0 - 7, TUBE1 + 4, 'K⁺', 11.5, C.k, 'end', 'font-weight="800"');
    s += S.text(SX1 + 6, TUBE0 - 4, 'myelin', 10.5, '#8a6a2e') + S.text(SX1 + 6, TUBE1 - 8, 'inside', 10.5, C.muted);
    for (let mm = 0; mm <= L; mm++) s += S.text(Xs(mm), 180, mm, 10.5, C.muted, 'middle');
    s += S.text(SX1 + 8, 180, 'mm', 10.5, C.muted);
    const px = Xs(NODES[probeK]);
    s += S.line(px, TUBE0 - 2, px, TUBE1 + 31, C.purple, 'stroke-width="3"') + `<path d="M${(px - 7).toFixed(1)} ${TUBE1 + 40}h14l-7 -9Z" fill="${C.purple}"/>`;
    s += S.text(px, TUBE1 + 58, `Probe: node ${probeK + 1}`, 11.5, C.purple, 'middle', 'font-weight="700" ' + halo());
    $('strip').innerHTML = s;
  }

  /* ================================== 2. CURRENT PROPAGATION (3 nodes) */
  const PW = 3.0, PX0 = 72, PX1 = 668, PPX = (PX1 - PX0) / PW, PNH = 0.14;
  const PM = [{ yc: 84, dir: 1 }, { yc: 150, dir: -1 }], P_AX0 = 91, P_AX1 = 143, P_ECF0 = 26, P_ECF1 = 208;
  const propCh = [];
  NODES.forEach((x, k) => PM.forEach((m, mi) => [-0.075, 0, 0.075].forEach((off, j) => {
    const kind = j === 1 ? 'K' : 'Na', u = hash(k * 7 + mi * 3 + j, 41), seed = 5000 + k * 20 + mi * 5 + j;
    propCh.push({ kind, k, mm: x + off, m: PM[mi], u, seed, spawns: model.spawnAges(kind, u, kind === 'Na' ? 6 : 12, hash(seed, 2)) });
  })));
  const centreNode = () => clamp(probeK, 1, N - 2);
  function propagation(t) {
    const kc = centreNode(), c0 = NODES[kc] - PW / 2, Xp = mm => PX0 + (mm - c0) * PPX;
    let s = `<defs>${hatchDefs('ph-')}${S.arrowMarkers()}<marker id="arr-cur" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#9e2318"/></marker><clipPath id="clip-prop"><rect x="${PX0}" y="${P_ECF0}" width="${PX1 - PX0}" height="${P_ECF1 - P_ECF0}"/></clipPath></defs>`;
    s += S.text(PX0, 16, `Saltatory conduction around the probe (nodes ${kc}–${kc + 2})`, 13.5, C.ink, 'start', 'font-weight="700"');
    let g = S.rect(PX0, P_ECF0, PX1 - PX0, P_ECF1 - P_ECF0, '#eef5fa') + S.rect(PX0, P_AX0, PX1 - PX0, P_AX1 - P_AX0, C.rest);
    const n = 120;
    for (let i = 0; i < n; i++) { const gl = glow(vAt(c0 + (i + 0.5) / n * PW, t)); if (gl > 0.01) g += S.rect(PX0 + i / n * (PX1 - PX0), P_AX0, (PX1 - PX0) / n + 0.4, P_AX1 - P_AX0, `rgba(221,59,44,${(0.6 * gl).toFixed(3)})`); }
    const visNodes = NODES.map((x, k) => ({ x, k })).filter(o => o.x > c0 - 0.3 && o.x < c0 + PW + 0.3);
    for (const { x, k } of visNodes) {
      const st = nodeState(k, t);
      if (REF[st.refractory]) g += S.rect(Xp(x - PNH), P_AX0, 2 * PNH * PPX, P_AX1 - P_AX0, `url(#ph-${st.refractory === 'absolute' ? 'abs' : 'rel'})`);
    }
    for (const m of PM) g += S.rect(PX0, m.yc - 7, PX1 - PX0, 14, '#efe3c6');
    // Myelin sheath: layered wrapping over every internode
    const edges = [c0 - 1, ...NODES, c0 + PW + 1];
    for (let i = 0; i < edges.length - 1; i++) {
      const a = Math.max(edges[i] + (i > 0 ? PNH : 0), c0 - 0.2), b = Math.min(edges[i + 1] - (i < edges.length - 2 ? PNH : 0), c0 + PW + 0.2);
      if (b <= a) continue;
      for (const [y, h] of [[48, 29], [157, 29]]) {
        g += `<rect x="${Xp(a).toFixed(1)}" y="${y}" width="${(Xp(b) - Xp(a)).toFixed(1)}" height="${h}" rx="12" fill="${MY.fill}" stroke="${MY.line}" stroke-width="1.2"/>`;
        for (let l = 1; l < 4; l++) g += S.line(Xp(a) + 8, y + l * h / 4, Xp(b) - 8, y + l * h / 4, MY.line, 'stroke-width=".7" stroke-opacity=".6"');
      }
    }
    if (showCharge()) for (const { x, k } of visNodes) {
      const v = nodeState(k, t).voltage, pos = v >= 0, z = signSize(v, 9, 8);
      for (const m of PM) g += sign(Xp(x), m.yc - m.dir * 18 + 4, !pos, z) + sign(Xp(x), m.yc + m.dir * 19 + 4, pos, z);
    }
    // Channels at the nodes only, with ions
    for (const c of propCh) {
      if (c.mm < c0 - 0.2 || c.mm > c0 + PW + 0.2) continue;
      const x = Xp(c.mm), { yc, dir } = c.m, a = ageNode(c.k, t);
      const pair = (gap, fill, stroke, rx) => `<rect x="${(x - gap - 5).toFixed(1)}" y="${yc - 11}" width="5" height="22" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/><rect x="${(x + gap).toFixed(1)}" y="${yc - 11}" width="5" height="22" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`;
      if (c.kind === 'Na') {
        const st = model.naChannel(c.u, a);
        g += st === 'closed' ? pair(1.2, C.naClosedFill, C.naClosedLine, 2.5) + S.line(x - 1.5, yc - dir * 6, x + 1.5, yc - dir * 6, C.naClosedLine, 'stroke-width="2.5"')
          : st === 'open' ? pair(3.5, C.naOpen, '#9e2318', 2.5) : pair(3.5, C.inact, '#9a6406', 2.5) + `<circle cx="${x.toFixed(1)}" cy="${yc + dir * 13}" r="3.6" fill="#9a6406"/>`;
      } else g += model.kChannel(c.u, a) === 'open' ? pair(3.5, C.kOpen, '#163f7a', 1) : pair(1.2, C.kClosedFill, C.kClosedLine, 1) + S.line(x - 1.5, yc + dir * 6, x + 1.5, yc + dir * 6, C.kClosedLine, 'stroke-width="2.5"');
      if (!showFlux()) continue;
      c.spawns.forEach((sp, i) => {
        const life = c.kind === 'Na' ? 0.8 : 0.8, p = a - sp;
        if (p < 0 || p >= life) return;
        const h1 = hash(c.seed * 11 + i, 1), h2 = hash(c.seed * 11 + i, 2), h3 = hash(c.seed * 11 + i, 3);
        let px = x, py, op;
        if (c.kind === 'Na') {
          if (p < 0.1) { py = lerp(yc - dir * 26, yc + dir * 12, smooth(p / 0.1)); op = clamp(p / 0.03); }
          else {
            // Forward ions cross the internode in TRAVEL ms, arriving before the next node opens
            const TRAVEL = 0.32, fwd = h1 < 0.75, q = clamp((p - 0.1) / (fwd ? TRAVEL : 0.4)), e = fwd ? q : 1 - Math.pow(1 - q, 2);
            const dist = fwd ? INTER * (0.92 + 0.06 * h2) - (c.mm - NODES[c.k]) : -(0.1 + 0.15 * h2);
            px = x + dist * PPX * e;
            py = lerp(yc + dir * 12, P_AX0 + 10 + h3 * (P_AX1 - P_AX0 - 20), Math.min(1, q * 2));
            const tail = (p - 0.1 - (fwd ? TRAVEL : 0.4)) / 0.35; op = tail <= 0 ? 1 : Math.max(0, 1 - tail);
          }
          g += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${C.na}" stroke="#fff" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
        } else {
          if (p < 0.12) { py = lerp(yc + dir * 14, yc - dir * 16, smooth(p / 0.12)); op = clamp(p / 0.03); }
          else { const q = (p - 0.12) / (life - 0.12); px += (h1 - 0.5) * 10 * q; py = yc - dir * 16 - dir * 30 * q; op = 1 - q * q; }
          g += `<path d="M${px.toFixed(1)} ${(py - 4.5).toFixed(1)}l4.5 4.5-4.5 4.5-4.5-4.5Z" fill="${C.k}" stroke="#fff" stroke-width="1" opacity="${op.toFixed(2)}"/>`;
        }
      });
    }
    // Current under the myelin and the "jump" to the next node
    for (const o of leading(t)) {
      const mid = (P_AX0 + P_AX1) / 2;
      if (o.lead < N - 1 && o.age < HOP) {          // current travelling toward the next node
        const x1 = Xp(NODES[o.lead]), x2 = Xp(NODES[o.lead + 1]), xf = lerp(x1, x2, clamp((o.age + 0.05) / HOP));
        if (xf > x1 + 16) g += `<path d="M${x1 + 6} ${mid}H${(xf - 4).toFixed(1)}" fill="none" stroke="#9e2318" stroke-width="2.4" marker-end="url(#arr-cur)"/>`;
        g += S.text((x1 + x2) / 2, mid - 6, 'current flows quickly under the myelin', 11, '#9e2318', 'middle', 'font-weight="700" ' + halo('#fff', 3));
      }
      if (o.lead > 0 && o.age < 0.45) {             // the next node has reached threshold and fired
        const x0 = Xp(NODES[o.lead - 1]), x1 = Xp(NODES[o.lead]);
        g += `<path d="M${x0} 44Q${(x0 + x1) / 2} 22 ${x1 - 4} 42" fill="none" stroke="${C.na}" stroke-width="2.4" stroke-dasharray="5 3" marker-end="url(#arr-na)"/>`;
        g += S.text((x0 + x1) / 2, 38, 'AP "jumps" to the next node', 11, C.na, 'middle', 'font-weight="800" ' + halo('#eef5fa', 3));
      }
    }
    [0, 1, 2].forEach(i => {
      const k = kc - 1 + i, x = Xp(NODES[k]), col = k === probeK ? C.purple : C.ink;
      g += S.line(x, P_ECF0, x, P_ECF1, col, 'stroke-width="1.4" stroke-dasharray="5 4"') + `<circle cx="${x.toFixed(1)}" cy="${P_ECF1 - 10}" r="9" fill="${col}"/>` + S.text(x, P_ECF1 - 6, k + 1, 11, '#fff', 'middle', 'font-weight="800"');
    });
    s += `<g clip-path="url(#clip-prop)">${g}</g>`;
    s += S.text(PX0 - 6, 66, 'myelin', 10, '#8a6a2e', 'end') + S.text(PX0 - 6, 88, 'membrane', 10, C.muted, 'end') + S.text(PX0 - 6, 121, 'axoplasm', 10, C.muted, 'end');
    s += S.text(PX0, 226, 'Nodes of Ranvier have Na⁺/K⁺ channels · myelin-covered internodes have none', 12, C.muted);
    s += pointTraces(t, kc);
    $('prop').innerHTML = s;
  }
  function pointTraces(t, kc) {
    const x0 = 708, x1 = 990, w = waveAtNode(kc - 1, t), off = (w - 1) * GAP;
    const t0 = nodeArrival(kc - 1) + off - 0.8, t1 = nodeArrival(kc + 1) + off + 3.2, X = tt => x0 + (tt - t0) / (t1 - t0) * (x1 - x0);
    let s = S.text(x0, 16, `Voltage at nodes ${kc}, ${kc + 1}, ${kc + 2} (AP ${w})`, 12.5, C.ink, 'start', 'font-weight="700"');
    [0, 1, 2].forEach(i => {
      const k = kc - 1 + i, y0 = 28 + i * 64, y1 = y0 + 54, Y = v => y1 - (v + 90) / 125 * (y1 - y0);
      s += S.rect(x0, y0, x1 - x0, y1 - y0, '#f6f8f7', 'rx="4"') + `<circle cx="${x0 - 12}" cy="${(y0 + y1) / 2}" r="9" fill="${k === probeK ? C.purple : C.ink}"/>` + S.text(x0 - 12, (y0 + y1) / 2 + 4, k + 1, 11, '#fff', 'middle', 'font-weight="800"');
      s += S.line(x0, Y(P.threshold), x1, Y(P.threshold), C.threshold, 'stroke-dasharray="3 3"') + S.line(x0, Y(P.rest), x1, Y(P.rest), '#d5dedb');
      s += `<path d="${S.curve(tt => model.voltage(ageNode(k, tt)), t0, t1, 140, X, Y)}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
    });
    if (t >= t0 && t <= t1) s += S.line(X(t), 26, X(t), 28 + 2 * 64 + 56, C.purple, 'stroke-width="2"');
    s += S.text(x1, 226, 'Each node fires in turn, a short delay apart', 11, C.muted, 'end');
    return s;
  }

  /* ============================================ 4. CLOSE-UP AT THE NODE */
  const CY = 176, CHALF = 14, NA_X = [120, 180, 240], K_X = [300, 360, 420];
  const closeNa = [0.18, 0.5, 0.82].map((u, i) => ({ x: NA_X[i], u, spawns: model.spawnAges('Na', u, 3.2, i / 3), seed: 900 + i }));
  const closeK = [0.2, 0.5, 0.8].map((u, i) => ({ x: K_X[i], u, spawns: model.spawnAges('K', u, 6, i / 3), seed: 950 + i }));
  function bigChannel(kind, x, st) {
    const pair = (g, fill, stroke, rx) => `<rect x="${x - g - 13}" y="${CY - 26}" width="13" height="52" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="${x + g}" y="${CY - 26}" width="13" height="52" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    if (kind === 'Na') {
      if (st === 'closed') return pair(2, C.naClosedFill, C.naClosedLine, 6) + S.line(x - 3, CY - 15, x + 3, CY - 15, C.naClosedLine, 'stroke-width="6" stroke-linecap="round"');
      if (st === 'open') return pair(9, C.naOpen, '#9e2318', 6);
      return pair(9, C.inact, '#9a6406', 6) + `<path d="M${x + 10} ${CY + 26}q2 12 -10 12" fill="none" stroke="#9a6406" stroke-width="2.4"/><circle cx="${x}" cy="${CY + 31}" r="9" fill="#9a6406"/>`;
    }
    return st === 'open' ? pair(9, C.kOpen, '#163f7a', 2) : pair(2, C.kClosedFill, C.kClosedLine, 2) + S.line(x - 3, CY + 15, x + 3, CY + 15, C.kClosedLine, 'stroke-width="6" stroke-linecap="round"');
  }
  const majority = st => { const c = {}; st.forEach(x => { c[x] = (c[x] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
  function closeup(t) {
    const a = ageNode(probeK, t), st = model.state(a), bg = phaseFill[st.phase];
    let s = `<defs>${S.arrowMarkers()}</defs>`;
    s += S.rect(0, 30, 520, CY - CHALF - 30, '#eef5fa') + S.rect(0, CY + CHALF, 520, 360 - CY - CHALF, bg);
    s += S.rect(0, CY - CHALF, 520, 2 * CHALF, '#efe3c6', 'stroke="#c4ae7a"');
    // Myelin on both sides of the node
    for (const [x, w] of [[-20, 104], [436, 104]]) {
      s += `<rect x="${x}" y="${CY - CHALF - 70}" width="${w}" height="70" rx="22" fill="${MY.fill}" stroke="${MY.line}" stroke-width="1.5"/>`;
      for (let l = 1; l < 6; l++) s += S.line(x + 14, CY - CHALF - 70 + l * 70 / 6, x + w - 14, CY - CHALF - 70 + l * 70 / 6, MY.line, 'stroke-width=".8" stroke-opacity=".6"');
    }
    s += S.text(42, CY - CHALF - 78, 'Myelin', 12, '#8a6a2e', 'middle', 'font-weight="800"') + S.text(478, CY - CHALF - 78, 'Myelin', 12, '#8a6a2e', 'middle', 'font-weight="800"');
    s += S.text(10, 20, `Node of Ranvier ${probeK + 1} (probe)`, 14, C.ink, 'start', 'font-weight="700"');
    if (REF[st.refractory]) { const r = REF[st.refractory]; s += `<rect x="352" y="4" width="162" height="22" rx="11" fill="${r.bar}"/>` + S.text(433, 19.5, r.label, 11.5, r.text, 'middle', 'font-weight="800"'); }
    s += S.text(270, 50, 'Extracellular fluid · Na⁺ 145 mM · K⁺ 5 mM', 11.5, C.muted, 'middle');
    s += S.text(10, 350, 'Axoplasm (inside)', 12.5, C.muted, 'start', 'font-weight="650" ' + halo(bg, 3)) + S.text(510, 350, 'K⁺ 140 mM · Na⁺ 15 mM', 11.5, C.muted, 'end', halo(bg, 3));
    if (showCharge()) {
      const pos = st.voltage >= 0, z = signSize(st.voltage, 11, 13);
      for (const x of [150, 210, 270, 330, 390]) s += sign(x, CY - 32, !pos, z);
      for (const x of [40, 105, 150, 210, 270, 330, 390, 435, 490]) s += sign(x, CY + 50, pos, z);
    }
    s += S.text(510, CY + 82, `Inside: ${st.voltage >= 0 ? '+' : ''}${st.voltage.toFixed(0)} mV`, 16, st.voltage >= 0 ? C.na : C.k, 'end', 'font-weight="800" ' + halo(bg, 4));
    const naS = closeNa.map(c => model.naChannel(c.u, a)), kS = closeK.map(c => model.kChannel(c.u, a));
    closeNa.forEach((c, i) => { s += bigChannel('Na', c.x, naS[i]); });
    closeK.forEach((c, i) => { s += bigChannel('K', c.x, kS[i]); });
    if (showFlux()) {
      closeNa.forEach(c => c.spawns.forEach((sp, k) => {
        const p = a - sp; if (p < 0 || p >= 1.0) return;
        const h1 = hash(c.seed * 13 + k, 1), h2 = hash(c.seed * 13 + k, 2), h3 = hash(c.seed * 13 + k, 3);
        let x = c.x, y, op = 1;
        if (p < 0.14) { y = lerp(CY - 80, CY + 40, smooth(p / 0.14)); op = clamp(p / 0.03); }
        else { const q = (p - 0.14) / 0.86, e = 1 - Math.pow(1 - q, 3); x += (h1 < 0.75 ? 140 + 120 * h2 : -(40 + 40 * h2)) * e; y = lerp(CY + 40, CY + 70 + h3 * 90, e); op = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4; }
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" fill="${C.na}" stroke="#fff" stroke-width="1.6" opacity="${op.toFixed(2)}"/>`;
      }));
      closeK.forEach(c => c.spawns.forEach((sp, k) => {
        const p = a - sp; if (p < 0 || p >= 0.8) return;
        const h1 = hash(c.seed * 13 + k, 4);
        let x = c.x, y, op = 1;
        if (p < 0.14) { y = lerp(CY + 80, CY - 40, smooth(p / 0.14)); op = clamp(p / 0.03); }
        else { const q = (p - 0.14) / 0.66; x += (h1 - 0.5) * 30 * q; y = CY - 40 - 50 * q; op = 1 - q * q; }
        s += `<path d="M${x.toFixed(1)} ${(y - 9).toFixed(1)}l9 9-9 9-9-9Z" fill="${C.k}" stroke="#fff" stroke-width="1.6" opacity="${op.toFixed(2)}"/>`;
      }));
      if (st.naFlux > 0.02) s += S.line(300, 300, 470, 300, C.na, 'stroke-width="2.5" marker-end="url(#arr-na)"') + S.text(300, 320, 'Na⁺ spreads under the myelin to the next node', 11.5, C.na, 'start', 'font-weight="700" ' + halo(bg, 3));
    }
    const nM = majority(naS), kM = majority(kS);
    const pill = (cx, label, fill, color) => `<rect x="${cx - 100}" y="378" width="200" height="30" rx="15" fill="${fill}"/>` + S.text(cx, 398, label, 13, color, 'middle', 'font-weight="800"');
    s += pill(150, `Na⁺ channels: ${nM.toUpperCase()}`, nM === 'open' ? C.naOpen : nM === 'inactivated' ? C.inact : C.naClosedFill, nM === 'closed' ? C.na : '#fff');
    s += pill(380, `K⁺ channels: ${kM.toUpperCase()}`, kM === 'open' ? C.kOpen : C.kClosedFill, kM === 'open' ? '#fff' : C.k);
    $('closeup').innerHTML = s;
  }

  /* ============================================= RACE: myelinated vs not */
  function race(t) {
    const x0 = 150, x1 = 960, X = mm => x0 + mm / L * (x1 - x0);
    const fU = clamp(-0.3 + 0.75 * t, 0, L);                                      // Part 2 axon, 0.75 mm/ms
    let lead = -1; for (let k = 0; k < N; k++) if (t >= nodeArrival(k)) lead = k;
    const fM = lead < 0 ? 0 : NODES[lead];
    let s = '';
    const row = (y, label, front, myel) => {
      let r = S.text(x0 - 12, y + 5, label, 12.5, C.ink, 'end', 'font-weight="700"') + S.rect(X(0), y - 8, X(L) - X(0), 16, '#fbf7ec', 'rx="8" stroke="#c9d3d0"');
      if (myel) for (let k = 0; k <= N; k++) { const a = k === 0 ? 0 : NODES[k - 1] + NHW, b = k === N ? L : NODES[k] - NHW; r += S.rect(X(a), y - 10, X(b) - X(a), 20, MY.fill, `rx="9" stroke="${MY.line}"`); }
      r += S.rect(X(0), y - 3, X(front) - X(0), 6, C.na, 'rx="3"') + `<circle cx="${X(front).toFixed(1)}" cy="${y}" r="7" fill="${C.na}" stroke="#fff" stroke-width="2"/>`;
      return r + S.text(X(L) + 0, y - 14, `${front.toFixed(1)} mm`, 11, C.muted, 'end');
    };
    s += row(30, 'Unmyelinated (Part 2)', fU, false) + row(76, 'Myelinated (this axon)', fM, true);
    s += S.text(20, 114, `How far action potential 1 has travelled at the current time. Here the myelinated axon is about ${Math.round(INTER / HOP / 0.75)}× faster; in the body it can be 50× faster or more.`, 11.5, C.muted);
    $('race').innerHTML = s;
  }

  /* ======================================================= status text */
  const explanations = {
    'Resting': 'The node is at rest (−75 mV). Its Na⁺ channels are closed but ready to open; K⁺ channels are closed.',
    'Reaching threshold': 'Na⁺ that entered at the previous node has spread quickly under the myelin and is depolarizing this node toward threshold (−55 mV).',
    'Depolarization': 'Threshold reached at this node: its Na⁺ channels open and Na⁺ rushes in, so the inside becomes positive (up to +30 mV).',
    'Repolarization': 'Na⁺ channels at this node are inactivated (temporarily blocked); K⁺ channels open and K⁺ flows out, so the inside becomes negative again.',
    'Hyperpolarization': 'K⁺ channels are slow to close, so the node dips below resting potential (about −85 mV).',
    'Return to resting potential': 'K⁺ channels close and the node returns to −75 mV. Its Na⁺ channels have recovered and can open again.'
  };
  function status(t) {
    const s = nodeState(probeK, t), recovered = s.phase === 'Resting' && s.age > P.tRecover, num = phaseNum[s.phase];
    const name = num ? `${num} · ${s.phase}` : recovered ? 'Resting (recovered)' : s.phase, ph = $('phase');
    if (ph.textContent !== name) ph.textContent = name;
    ph.style.background = phaseFill[s.phase];
    $('measurement').textContent = `${s.voltage >= 0 ? '+' : ''}${s.voltage.toFixed(0)} mV`;
    $('explanation').textContent = recovered ? 'This node is back at resting potential and ready to fire again.' : explanations[s.phase];
    $('refractory-text').innerHTML = s.refractory === 'absolute' ? '<b>Absolute refractory:</b> cannot fire again yet.' : s.refractory === 'relative' ? '<b>Relative refractory:</b> needs a stronger stimulus to fire.' : s.refractory === 'firing' ? '<b>Action potential in progress:</b> Na⁺ channels are open.' : '<b>Excitable:</b> a normal stimulus can trigger an action potential.';
    const a1 = t - nodeArrival(probeK), w = waveAtNode(probeK, t), a = ageNode(probeK, t);
    $('ap-label').textContent = a1 < -0.5 ? 'Waiting for action potential 1 to reach the probe node'
      : w === 2 && a > P.tRecover ? 'Both action potentials have passed this node'
      : w === 1 && a > P.tRecover ? 'Action potential 1 has passed · action potential 2 is on its way'
      : `Action potential ${w} of 2 at node ${probeK + 1} (probe)`;
  }

  /* ============================================================ wiring */
  function render(t) {
    $('probe-value').textContent = `Node ${probeK + 1}`;
    strip(t); propagation(t); NL.drawProbeTrace($('temporal'), model, ageNode(probeK, t)); closeup(t); status(t); race(t);
  }
  const player = NL.createPlayer({
    duration: DURATION, step: 0.05, render, initialTime: nodeArrival(0) + 0.25,
    ids: { play: 'play', restart: 'restart', step: 'step', next: 'next', speed: 'speed', loop: 'loop', time: 'time', clock: 'clock' },
    stageTimes: () => WAVES.flatMap(w => model.stages.map(m => nodeArrival(probeK) + w + m.age + 0.001))
  });
  const setProbe = k => { probeK = clamp(Math.round(k), 0, N - 1); $('probe').value = probeK + 1; player.invalidate(); };
  $('probe').max = N;
  $('probe').addEventListener('input', e => setProbe(+e.target.value - 1));
  for (const id of ['show-flux', 'show-charge']) $(id).addEventListener('change', player.invalidate);
  const toSvg = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  $('strip').addEventListener('click', e => { const p = toSvg($('strip'), e); const mm = (p.x - SX0) / SW * L; setProbe((mm - NODES[0]) / INTER); });

  /* -------------------------------------------------------------- quiz */
  NL.renderQuiz($('quiz'), [
    { prompt: 'In a myelinated axon, where are the voltage-gated Na⁺ channels concentrated?', choices: ['Under the myelin sheath', 'At the nodes of Ranvier', 'Evenly along the whole axon', 'Only at the axon terminal'], answer: 1, explanation: 'Na⁺ (and K⁺) channels are clustered at the nodes of Ranvier, the small gaps between myelin segments. The membrane under the myelin has almost none.' },
    { prompt: 'Why is saltatory conduction faster than conduction in an unmyelinated axon?', choices: ['Myelin makes Na⁺ channels open faster', 'The action potential is regenerated only at the nodes, and current travels quickly under the insulating myelin between them', 'Myelin pumps ions along the axon', 'The action potential is larger in myelinated axons'], answer: 1, explanation: 'Opening channels and regenerating the AP is the slow step. In a myelinated axon it happens only at the nodes; between them, current spreads quickly because myelin stops it leaking out.' },
    { prompt: 'What is the main job of the myelin sheath?', choices: ['To produce neurotransmitter', 'To insulate the axon so current does not leak out between nodes', 'To generate action potentials', 'To store Ca²⁺'], answer: 1, explanation: 'Myelin is a fatty insulating wrap. It prevents ions and current from leaking across the membrane between nodes.' },
    { prompt: 'Which cells make myelin?', choices: ['Astrocytes in the CNS and microglia in the PNS', 'Oligodendrocytes in the CNS and Schwann cells in the PNS', 'Neurons themselves', 'Red blood cells'], answer: 1, explanation: 'Oligodendrocytes myelinate axons in the brain and spinal cord; Schwann cells myelinate axons in peripheral nerves.' },
    { prompt: 'Why does a myelinated axon use less energy (ATP) per action potential?', choices: ['It has no Na⁺/K⁺ pumps', 'Fewer ions cross the membrane because channels open only at the nodes, so the pump has less to restore', 'Myelin makes ATP', 'Action potentials do not use energy'], answer: 1, explanation: 'Ion flow is limited to the nodes, so the Na⁺/K⁺ pump has fewer ions to move back afterwards.' },
    { prompt: 'In multiple sclerosis, myelin in the CNS is damaged. What happens to conduction?', choices: ['It becomes faster', 'It slows or fails, because current leaks out before reaching the next node', 'It is unchanged', 'Only K⁺ channels are affected'], answer: 1, explanation: 'Without myelin, current leaks out and may not bring the next node to threshold, causing symptoms such as weakness, numbness and vision problems.' }
  ]);
})();
