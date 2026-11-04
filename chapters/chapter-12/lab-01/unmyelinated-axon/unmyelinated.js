/* Part 2 — continuous conduction in an unmyelinated axon.
   Uses the shared membrane model (js/neurolab.js); this file only handles
   geometry and drawing for this module.

   Layout choice for clarity: Na⁺ channels are drawn in the upper membrane
   and K⁺ channels in the lower membrane, so the two never crowd each other.
   Ions are shown only while they move through open channels. */
(function () {
  'use strict';
  const NL = window.NeuroLab, { clamp, smooth, lerp, hash, $ } = NL.util, S = NL.svg, C = NL.colors;
  NL.renderChrome('unmyelinated');

  /* ---------------------------------------------------------- parameters */
  const L = 8;            // axon length (mm)
  const W = 3;            // magnified window width (mm)
  const V = 0.75;         // conduction velocity (mm/ms = m/s)
  const START = -0.3;     // wave front position at t = 0
  const model = NL.createMembrane();
  const P = model.P;
  const arrival = x => (x - START) / V;                 // time this point reaches threshold
  const DURATION = Math.ceil(arrival(L) + P.tRecover);
  const SPACING = 0.1;                                  // mm between channels of one type
  const NA_QUANTUM = 10, K_QUANTUM = 18;                // mV·ms of driving force per drawn ion
  const NA_LIFE = 1.1, K_LIFE = 0.9, TRANSIT = 0.12;    // particle lifetimes (ms)

  /* -------------------------------------------------------------- layout */
  const MX0 = 72, MX1 = 932, MW = MX1 - MX0, PX_MM = MW / W;
  const OY0 = 52, OY1 = 78;                             // whole-axon strip
  const ECF_TOP = 112, MEM_NA = 196, MEM_K = 312, ECF_BOT = 390, HALF = 9;
  const AX_TOP = MEM_NA + HALF, AX_BOT = MEM_K - HALF;
  const Xo = mm => MX0 + mm / L * MW;
  let seg = 0.6, probe = 2;
  const Xm = mm => MX0 + (mm - seg) * PX_MM;

  /* --------------------------------------------- channels (fixed layout) */
  const naMem = { yc: MEM_NA, dir: 1 };   // interior is below the Na⁺ membrane
  const kMem = { yc: MEM_K, dir: -1 };    // interior is above the K⁺ membrane
  const channels = [];
  for (let i = 0; (i + 0.5) * SPACING < L; i++) {
    const mm = (i + 0.5) * SPACING;
    const uNa = hash(i, 11), uK = hash(i, 13);
    channels.push({ kind: 'Na', mm, m: naMem, u: uNa, seed: i * 2, spawns: model.spawnAges('Na', uNa, NA_QUANTUM, hash(i, 12)) });
    channels.push({ kind: 'K', mm, m: kMem, u: uK, seed: i * 2 + 1, spawns: model.spawnAges('K', uK, K_QUANTUM, hash(i, 14)) });
  }

  /* --------------------------------------------------------------- state */
  const patchAt = (mm, t) => model.state(t - arrival(mm));
  const phaseFill = { 'Resting': C.rest, 'Reaching threshold': C.stim, 'Depolarization': C.depol, 'Repolarization': C.repol, 'Hyperpolarization': C.hyper, 'Return to resting potential': C.ret };
  const phaseNum = { 'Depolarization': 1, 'Repolarization': 2, 'Hyperpolarization': 3, 'Return to resting potential': 4 };
  const halo = (c = '#fff', w = 4) => `paint-order="stroke" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;

  /* ------------------------------------------------------------- drawing */
  function overview(t) {
    let s = S.text(MX0, 42, 'Whole axon (8 mm). The signal enters from the axon hillock on the left.', 12.5, C.muted) + S.text(MX1, 42, 'Click this strip to move the magnified segment', 12, C.muted, 'end');
    const n = 160;
    for (let i = 0; i < n; i++) s += S.rect(Xo(i / n * L), OY0, MW / n + 0.4, OY1 - OY0, phaseFill[patchAt((i + 0.5) / n * L, t).phase]);
    s += `<rect x="${MX0}" y="${OY0}" width="${MW}" height="${OY1 - OY0}" rx="6" fill="none" stroke="#8c9b98" stroke-width="2"/>`;
    const b0 = Xo(seg), b1 = Xo(seg + W);
    s += `<rect x="${b0.toFixed(1)}" y="${OY0 - 5}" width="${(b1 - b0).toFixed(1)}" height="${OY1 - OY0 + 10}" rx="4" fill="none" stroke="${C.ink}" stroke-width="2.2"/>`;
    s += S.line(b0, OY1 + 5, MX0, ECF_TOP - 4, '#9aa9a6', 'stroke-dasharray="3 3"') + S.line(b1, OY1 + 5, MX1, ECF_TOP - 4, '#9aa9a6', 'stroke-dasharray="3 3"');
    s += `<circle cx="${Xo(probe).toFixed(1)}" cy="${OY1 + 9}" r="4.5" fill="${C.purple}"/>`;
    return s;
  }

  function membraneBase(t, showCharge) {
    let s = S.rect(MX0, ECF_TOP, MW, MEM_NA - HALF - ECF_TOP, '#eef5fa') + S.rect(MX0, MEM_K + HALF, MW, ECF_BOT - MEM_K - HALF, '#eef5fa');
    // Axoplasm coloured by phase; numbered badges where a phase spans enough room
    const n = 150, spans = [];
    for (let i = 0; i < n; i++) {
      const ph = patchAt(seg + (i + 0.5) / n * W, t).phase;
      s += S.rect(MX0 + i / n * MW, AX_TOP, MW / n + 0.4, AX_BOT - AX_TOP, phaseFill[ph]);
      if (spans.length && spans[spans.length - 1].ph === ph) spans[spans.length - 1].to = i + 1; else spans.push({ ph, from: i, to: i + 1 });
    }
    for (const sp of spans) {
      const w = (sp.to - sp.from) / n * MW, num = phaseNum[sp.ph];
      if (!num || w < 26) continue;
      const cx = MX0 + (sp.from + sp.to) / 2 / n * MW, cy = AX_TOP + 42;
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="12" fill="#fff" stroke="${C.ink}" stroke-width="1.5" opacity=".9"/>` + S.text(cx, cy + 5, num, 14, C.ink, 'middle', 'font-weight="800"');
    }
    s += S.rect(MX0, MEM_NA - HALF, MW, 2 * HALF, '#efe3c6', 'stroke="#c4ae7a" stroke-width=".8"');
    s += S.rect(MX0, MEM_K - HALF, MW, 2 * HALF, '#efe3c6', 'stroke="#c4ae7a" stroke-width=".8"');
    const lab = 'font-weight="650" ' + halo('#eef5fa', 3);
    s += S.text(MX0 + 6, ECF_TOP + 15, 'Extracellular fluid', 12.5, C.muted, 'start', lab) + S.text(MX1 - 6, ECF_TOP + 15, 'Na⁺ ≈ 145 mM · K⁺ ≈ 5 mM', 12, C.muted, 'end', halo('#eef5fa', 3));
    s += S.text(MX0 + 6, ECF_BOT - 7, 'Extracellular fluid', 12.5, C.muted, 'start', lab);
    s += S.text(MX0 + 6, AX_BOT - 26, 'Axoplasm (inside the axon) · K⁺ ≈ 140 mM · Na⁺ ≈ 15 mM', 12, C.muted, 'start', halo('#fff', 3));
    if (showCharge) {
      for (const m of [naMem, kMem]) for (let mm = Math.ceil(seg / 0.2) * 0.2; mm < seg + W; mm += 0.2) {
        const pos = patchAt(mm, t).voltage >= 0, x = Xm(mm);
        s += S.text(x, m.yc + m.dir * 22 + 5, pos ? '+' : '−', 15, pos ? C.na : C.k, 'middle', 'font-weight="800"');
        s += S.text(x, m.yc - m.dir * 21 + 5, pos ? '−' : '+', 15, pos ? C.k : C.na, 'middle', 'font-weight="800"');
      }
    }
    return s;
  }

  // Channel glyphs: Na⁺ rounded (warm), K⁺ square-cornered (blue).
  function channelGlyph(ch, t) {
    const x = Xm(ch.mm), { yc, dir } = ch.m, a = t - arrival(ch.mm);
    const pair = (g, fill, stroke, rx, sw) => `<rect x="${(x - g - 6).toFixed(1)}" y="${yc - 15}" width="6" height="30" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><rect x="${(x + g).toFixed(1)}" y="${yc - 15}" width="6" height="30" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    if (ch.kind === 'Na') {
      const st = model.naChannel(ch.u, a);
      let s = `<g><title>Voltage-gated Na⁺ channel: ${st === 'inactivated' ? 'inactivated (temporarily blocked)' : st}</title>`;
      if (st === 'closed') s += pair(1.5, C.naClosedFill, C.naClosedLine, 3, 1.2) + S.line(x - 2, yc - dir * 8, x + 2, yc - dir * 8, C.naClosedLine, 'stroke-width="3"');
      else if (st === 'open') s += pair(4, C.naOpen, '#9e2318', 3, 1.4);
      else s += pair(4, C.inact, '#9a6406', 3, 1.4) + `<path d="M${(x + 5).toFixed(1)} ${yc + dir * 15}q1 ${dir * 6} -5 ${dir * 6}" fill="none" stroke="#9a6406" stroke-width="1.4"/><circle cx="${x.toFixed(1)}" cy="${yc + dir * 17}" r="4.6" fill="#9a6406"/>`;
      return s + '</g>';
    }
    const open = model.kChannel(ch.u, a) === 'open';
    let s = `<g><title>Voltage-gated K⁺ channel: ${open ? 'open' : 'closed'}</title>`;
    s += open ? pair(4, C.kOpen, '#163f7a', 1, 1.4) : pair(1.5, C.kClosedFill, C.kClosedLine, 1, 1.2) + S.line(x - 2, yc + dir * 8, x + 2, yc + dir * 8, C.kClosedLine, 'stroke-width="3"');
    return s + '</g>';
  }

  // Ions crossing open channels. Spawn times come from the cumulative driving
  // force while that channel is open, so flux ∝ open channels × driving force.
  function particles(ch, t) {
    const a = t - arrival(ch.mm), x0 = Xm(ch.mm), { yc, dir } = ch.m;
    let s = '';
    ch.spawns.forEach((sp, k) => {
      const life = ch.kind === 'Na' ? NA_LIFE : K_LIFE, p = a - sp;
      if (p < 0 || p >= life) return;
      const h1 = hash(ch.seed * 7 + k, 3), h2 = hash(ch.seed * 7 + k, 5), h3 = hash(ch.seed * 7 + k, 9);
      let x = x0, y, op;
      if (ch.kind === 'Na') {
        // Enter from outside, then diffuse along the axoplasm — mostly forward
        // (downstream), where the membrane is still at rest and more negative.
        const yOut = yc - dir * 34, yIn = yc + dir * 20;
        if (p < TRANSIT) { y = lerp(yOut, yIn, smooth(p / TRANSIT)); op = clamp(p / 0.03); }
        else {
          const q = (p - TRANSIT) / (life - TRANSIT), e = 1 - Math.pow(1 - q, 3);
          // Forward spread outpaces the wave at first, so ions reach the resting membrane ahead.
          const forward = h1 < 0.75, dist = forward ? 0.5 + 0.25 * h2 : -(0.1 + 0.08 * h2);
          x = x0 + dist * PX_MM * e; y = lerp(yIn, AX_TOP + 14 + h3 * (AX_BOT - AX_TOP - 50), e); op = q < 0.55 ? 1 : 1 - (q - 0.55) / 0.45;
        }
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${C.na}" stroke="#fff" stroke-width="1.3" opacity="${op.toFixed(2)}"/>`;
      } else {
        const yIn = yc + dir * 24, yOut = yc - dir * 22;
        if (p < TRANSIT) { y = lerp(yIn, yOut, smooth(p / TRANSIT)); op = clamp(p / 0.03); }
        else { const q = (p - TRANSIT) / (life - TRANSIT); x += (h1 - 0.5) * 20 * q; y = yOut - dir * 26 * q; op = 1 - q * q; }
        s += `<path d="M${x.toFixed(1)} ${(y - 6).toFixed(1)}l6 6-6 6-6-6Z" fill="${C.k}" stroke="#fff" stroke-width="1.2" opacity="${op.toFixed(2)}"/>`;
      }
    });
    return s;
  }

  function frontNote(t) {
    const front = START + V * t;
    if (front < seg + 0.1 || front > seg + W) return '';
    const x = Xm(front), right = x < MX1 - 330;
    return S.line(x - 30, ECF_TOP + 34, x + 34, ECF_TOP + 34, C.na, 'stroke-width="2.5" marker-end="url(#arr-na)"') +
      S.text(right ? x + 42 : x - 38, ECF_TOP + 38, 'Na⁺ spreads mostly forward → next region reaches threshold', 12, C.na, right ? 'start' : 'end', 'font-weight="700" ' + halo('#eef5fa', 4));
  }

  function probeMarker(t) {
    if (probe < seg || probe > seg + W) return S.text((MX0 + MX1) / 2, ECF_BOT + 18, `The probe (${probe.toFixed(2)} mm) is outside the magnified segment`, 12, C.purple, 'middle');
    const x = Xm(probe);
    return S.line(x, ECF_TOP - 2, x, ECF_BOT + 4, C.purple, 'stroke-width="2" stroke-dasharray="6 4"') +
      S.text(x, ECF_BOT + 18, `Probe ${probe.toFixed(2)} mm`, 12, C.purple, 'middle', 'font-weight="700" ' + halo());
  }

  function spatial(t) {
    const showFlux = $('show-flux').checked, showCharge = $('show-charge').checked;
    let s = `<defs>${S.arrowMarkers()}<clipPath id="clip-mag"><rect x="${MX0}" y="${ECF_TOP}" width="${MW}" height="${ECF_BOT - ECF_TOP}"/></clipPath></defs>`;
    s += S.text(MX0, 20, 'Signal direction →', 16, C.ink, 'start', 'font-weight="700"') + S.text(MX1, 20, 'Continuous conduction: each patch of membrane regenerates the action potential', 12.5, C.muted, 'end');
    s += overview(t);
    let mag = membraneBase(t, showCharge);
    const vis = channels.filter(c => c.mm > seg - 0.05 && c.mm < seg + W + 0.05);
    for (const c of vis) mag += channelGlyph(c, t);
    if (showFlux) { for (const c of vis) mag += particles(c, t); mag += frontNote(t); }
    s += `<g clip-path="url(#clip-mag)">${mag}</g>`;
    s += S.text(MX0 - 8, MEM_NA - 2, 'Na⁺', 13, C.na, 'end', 'font-weight="800"') + S.text(MX0 - 8, MEM_NA + 12, 'channels', 10.5, C.na, 'end');
    s += S.text(MX0 - 8, MEM_K - 2, 'K⁺', 13, C.k, 'end', 'font-weight="800"') + S.text(MX0 - 8, MEM_K + 12, 'channels', 10.5, C.k, 'end');
    s += probeMarker(t);
    s += S.text(MX0, ECF_BOT + 44, 'Reading the axon: the wave moves to the right, so the leading edge (phase 1) is on the right and the membrane it has', 12.5, C.muted);
    s += S.text(MX0, ECF_BOT + 62, 'already passed (phases 2 → 4) trails behind it on the left. To see the phases in time order, watch the graph below.', 12.5, C.muted);
    $('space').innerHTML = s;
  }

  /* ------------------------------------------------------- probe & status */
  const explanations = {
    'Resting': 'The inside of the axon is negative (about −75 mV). Voltage-gated Na⁺ channels are closed but ready to open. Voltage-gated K⁺ channels are closed.',
    'Reaching threshold': 'Na⁺ that entered the neighbouring region spreads into this patch and makes it less negative. When it reaches threshold (−55 mV), its Na⁺ channels open.',
    'Depolarization': 'Voltage-gated Na⁺ channels are open. Na⁺ rushes into the axon down its concentration gradient, so the inside quickly becomes positive (up to +30 mV).',
    'Repolarization': 'At the peak, Na⁺ channels become inactivated (temporarily blocked), so Na⁺ entry stops. Voltage-gated K⁺ channels open and K⁺ flows out, making the inside negative again.',
    'Hyperpolarization': 'K⁺ channels are slow to close, so extra K⁺ leaves and the membrane dips below its resting potential (to about −85 mV). Na⁺ channels begin to recover.',
    'Return to resting potential': 'K⁺ channels close, and the membrane drifts back to its resting potential. Na⁺ channels have recovered and are ready to open again.'
  };
  function status(t) {
    const s = patchAt(probe, t), pct = f => `${Math.round(f * 100)}%`;
    const recovered = s.phase === 'Resting' && s.age > P.tRecover, num = phaseNum[s.phase];
    const name = num ? `${num} · ${s.phase}` : recovered ? 'Resting (recovered)' : s.phase;
    if ($('phase').textContent !== name) $('phase').textContent = name;
    $('phase').style.background = phaseFill[s.phase];
    $('measurement').textContent = `${s.voltage.toFixed(1)} mV at ${probe.toFixed(2)} mm`;
    $('na-c').style.width = pct(s.nC); $('na-o').style.width = pct(s.nO); $('na-i').style.width = pct(s.nI);
    $('na-pct').textContent = s.nO > 0.005 ? `${pct(s.nO)} open` : s.nI > 0.005 ? `${pct(s.nI)} inactivated` : 'all closed';
    $('k-bar').style.width = pct(s.nK); $('k-pct').textContent = s.nK > 0.005 ? `${pct(s.nK)} open` : 'all closed';
    $('na-flux').textContent = s.naFlux > 0.01 ? '↓ Na⁺ flowing in' : '';
    $('k-flux').textContent = s.kFlux > 0.01 ? '↓ K⁺ flowing out' : '';
    $('explanation').textContent = recovered ? 'This patch is back at its resting potential and could fire again. Over time, the Na⁺/K⁺ pump restores the small amounts of Na⁺ and K⁺ that crossed.' : explanations[s.phase];
    $('refractory-text').innerHTML = s.refractory === 'absolute' ? '<b>Absolute refractory period:</b> no stimulus, however strong, can start another action potential here.'
      : s.refractory === 'relative' ? '<b>Relative refractory period:</b> only a stronger-than-normal stimulus could start another action potential.'
      : '<b>Excitable:</b> a normal stimulus can start an action potential.';
    const nxt = model.stages.find(m => m.age > s.age + 1e-6);
    $('milestone').textContent = nxt ? `Next at this probe: ${nxt.label} (${(arrival(probe) + nxt.age).toFixed(2)} ms).` : '';
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
    duration: DURATION, step: 0.1, render, initialTime: 2.9,   // open on a frame where the wave is in view
    ids: { play: 'play', restart: 'restart', step: 'step', next: 'next', speed: 'speed', loop: 'loop', time: 'time', clock: 'clock' },
    stageTimes: () => model.stages.map(m => arrival(probe) + m.age + 0.001)   // land just inside each stage
  });
  $('segment').max = L - W;
  $('segment').addEventListener('input', e => { seg = +e.target.value; $('follow').checked = false; player.invalidate(); });
  $('follow').addEventListener('change', player.invalidate);
  $('probe').addEventListener('input', e => { probe = +e.target.value; player.invalidate(); });
  for (const id of ['show-flux', 'show-charge']) $(id).addEventListener('change', player.invalidate);
  $('space').addEventListener('click', e => {
    const svg = $('space'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (p.x < MX0 || p.x > MX1) return;
    if (p.y < ECF_TOP - 8) { seg = clamp((p.x - MX0) / MW * L - W / 2, 0, L - W); $('segment').value = seg; $('follow').checked = false; }
    else { probe = clamp(Math.round((seg + (p.x - MX0) / PX_MM) * 20) / 20, 0.1, L - 0.1); $('probe').value = probe; }
    player.invalidate();
  });

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
