/*
 * NeuroLab — shared engine for the Chapter 12 nerve-impulse modules.
 *
 * Plain (non-module) script so every page also works when opened directly
 * from disk (file://). Everything is exposed on window.NeuroLab:
 *
 *   util      small math helpers (clamp, smooth, hermite, hash, invert)
 *   svg       string builders for SVG markup
 *   createMembrane(opts)  prescribed action-potential + channel-population model
 *   createPlayer(opts)    play / pause / scrub / step controller (render-on-change)
 *   drawProbeTrace(...)   voltage + conductance vs. time plot (reusable)
 *   renderChrome(id)      tabs, progress and prev/next links from manifest.js
 *   renderPartCards(el)   overview cards from manifest.js
 *   renderQuiz(el, items) learning check-in
 *
 * Future modules (synapse, myelinated axon) should reuse these pieces rather
 * than copy them, so the physiology stays consistent across the lab.
 */
(function () {
  'use strict';
  const NL = (window.NeuroLab = window.NeuroLab || {});

  /* ------------------------------------------------------------------ util */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // Deterministic pseudo-random number in [0,1) — stable between frames.
  const hash = (i, seed = 0) => { const x = Math.sin(i * 127.1 + seed * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); };
  // Piecewise cubic Hermite through knots {t, v, m}: continuous value AND slope.
  function hermite(knots) {
    return t => {
      if (t <= knots[0].t) return knots[0].v;
      const end = knots[knots.length - 1];
      if (t >= end.t) return end.v;
      let i = 0; while (t > knots[i + 1].t) i++;
      const k0 = knots[i], k1 = knots[i + 1], h = k1.t - k0.t, s = (t - k0.t) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * k0.v + (s3 - 2 * s2 + s) * h * k0.m + (-2 * s3 + 3 * s2) * k1.v + (s3 - s2) * h * k1.m;
    };
  }
  // First t in [lo,hi] where monotone-increasing f(t) >= target (bisection).
  function invert(f, target, lo, hi) {
    if (f(lo) >= target) return lo;
    if (f(hi) < target) return Infinity;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) >= target) hi = mid; else lo = mid; }
    return hi;
  }
  NL.util = { clamp, smooth, lerp, hash, hermite, invert, $: id => document.getElementById(id) };

  /* ------------------------------------------------------------- colours */
  NL.colors = {
    ink: '#102f35', muted: '#5a6f73', line: '#d8e2df', purple: '#7b4fc0', threshold: '#b06a1f',
    // Na⁺ family (warm reds) and K⁺ family (blues); inactivated = amber "paused"
    na: '#c8352a', naOpen: '#dd3b2c', naClosedFill: '#fbe9e6', naClosedLine: '#c98b84', inact: '#e39b17',
    k: '#2058a8', kOpen: '#2c6cc2', kClosedFill: '#e8eff9', kClosedLine: '#8aa8cf',
    // Membrane phase colours (shared by the axon diagram and the time graph)
    rest: '#fbf7ec', stim: '#f9ece2', depol: '#fbd8d2', repol: '#dbe7f7', hyper: '#e4def5', ret: '#e2efe6',
    myelin: '#f3e3c3', green: '#2f7d5b', gold: '#a77b16'
  };

  /* ----------------------------------------------------------------- svg */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  NL.svg = {
    text(x, y, s, size = 13, fill = NL.colors.ink, anchor = 'start', extra = '') {
      return `<text x="${typeof x === 'number' ? x.toFixed(1) : x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" ${extra}>${s}</text>`;
    },
    line(x1, y1, x2, y2, stroke = NL.colors.line, extra = '') {
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" ${extra}/>`;
    },
    rect(x, y, w, h, fill, extra = '') {
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${fill}" ${extra}/>`;
    },
    // Polyline path from a function sampled n times between a and b.
    curve(f, a, b, n, X, Y) {
      let d = '';
      for (let i = 0; i <= n; i++) { const u = a + (b - a) * i / n; d += `${i ? 'L' : 'M'}${X(u).toFixed(1)} ${Y(f(u)).toFixed(1)}`; }
      return d;
    },
    esc,
    arrowMarkers() {
      const m = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c}"/></marker>`;
      return m('arr-muted', NL.colors.muted) + m('arr-na', NL.colors.na) + m('arr-k', NL.colors.k);
    }
  };

  /* ------------------------------------------------------- membrane model
   * A prescribed (teaching) action potential, not a Hodgkin–Huxley solver.
   * Everything is a function of `age` = time since this patch crossed
   * threshold (ms). Voltage, channel populations, refractoriness, phase and
   * ion fluxes are all derived from the same age, so they cannot drift out
   * of sync.
   *
   * Na⁺ channel populations use two monotone curves:
   *   A(age) — fraction that has activated (opened at least once)
   *   I(age) — fraction that has inactivated
   *   open = A − I, inactivated = I, closed = 1 − A
   * then recovery from inactivation R(age) returns channels to "closed".
   * Giving each drawn channel a fixed random number u and classifying it as
   *   u < I·R → inactivated, u < A·R → open, else closed
   * guarantees every channel follows C → O → I → C in the correct order,
   * and the fraction of drawn channels in each state matches the curves.
   */
  NL.createMembrane = function (opts = {}) {
    const P = Object.assign({
      rest: -75, threshold: -55, peak: 30, ahp: -85, ENa: 60, EK: -90,
      // Voltage landmarks (ms after threshold): peak, back through rest, lowest point, rest again
      tFoot: -0.25, tPeak: 0.45, tCross: 1.05, tTrough: 1.6, tRecover: 3.6, upSlope: 150,
      // Channel kinetics (start, duration) in ms after threshold:
      naAct: [0, 0.22],        // Na⁺ channels open AT threshold → phase 1
      naInact: [0.25, 0.25],   // …and are inactivated by the peak
      naRecover: [1.0, 1.0],   // recover (inactivated → closed) once repolarized
      kAct: [0.4, 0.3],        // K⁺ channels open at the peak → phase 2
      kClose: [1.4, 1.4],      // close slowly → phases 3 and 4
      absoluteAvailable: 0.4, relativeNaI: 0.05, relativeK: 0.1
    }, opts);

    const voltage = hermite([
      { t: P.tFoot, v: P.rest, m: 0 },
      { t: 0, v: P.threshold, m: P.upSlope },  // non-zero slope: no stall at threshold
      { t: P.tPeak, v: P.peak, m: 0 },
      { t: P.tCross, v: P.rest, m: -40 },
      { t: P.tTrough, v: P.ahp, m: 0 },
      { t: P.tRecover, v: P.rest, m: 0 }
    ]);
    const A = a => smooth((a - P.naAct[0]) / P.naAct[1]);
    const I = a => smooth((a - P.naInact[0]) / P.naInact[1]);
    const R = a => 1 - smooth((a - P.naRecover[0]) / P.naRecover[1]);
    const nK = a => smooth((a - P.kAct[0]) / P.kAct[1]) * (1 - smooth((a - P.kClose[0]) / P.kClose[1]));

    function gating(a) {
      const r = R(a), nI = I(a) * r, nA = A(a) * r;
      return { nO: Math.max(0, nA - nI), nI, nC: 1 - nA, nK: nK(a) };
    }
    function refractory(a, g = gating(a)) {
      if (a < 0) return 'none';
      // Absolute: from threshold until enough Na⁺ channels have recovered from inactivation.
      if (a < P.naInact[0] + P.naInact[1] || 1 - g.nI < P.absoluteAvailable) return 'absolute';
      if (g.nI > P.relativeNaI || g.nK > P.relativeK) return 'relative';
      return 'none';
    }
    // The four numbered phases taught in class, plus the lead-in and rest.
    function phase(a) {
      if (a < P.tFoot) return 'Resting';
      if (a < 0) return 'Reaching threshold';
      if (a < P.tPeak) return 'Depolarization';
      if (a < P.tCross) return 'Repolarization';
      if (a < P.tTrough) return 'Hyperpolarization';
      if (a < P.tRecover) return 'Return to resting potential';
      return 'Resting';
    }
    function state(a) {
      const v = voltage(a), g = gating(a);
      const naDrive = P.ENa - v, kDrive = v - P.EK;          // mV, + means inward Na⁺ / outward K⁺
      const scale = P.ENa - P.rest;
      return {
        age: a, voltage: v, ...g, naDrive, kDrive,
        naFlux: g.nO * naDrive / scale, kFlux: g.nK * kDrive / scale,
        refractory: refractory(a, g), phase: phase(a)
      };
    }
    // Discrete state of one drawn channel with fixed random u ∈ [0,1).
    // Ordering guarantees each channel goes closed → open → inactivated → closed.
    function naChannel(u, a) { const r = R(a); return u < I(a) * r ? 'inactivated' : u < A(a) * r ? 'open' : 'closed'; }
    function kChannel(u, a) { return u < nK(a) ? 'open' : 'closed'; }

    // Cumulative driving-force integrals (mV·ms) for scrub-friendly particles.
    const T0 = -1, T1 = 7, DT = 0.004, N = Math.round((T1 - T0) / DT);
    const cumNa = new Float64Array(N + 1), cumK = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {
      const a = T0 + (i - 0.5) * DT, v = voltage(a);
      cumNa[i] = cumNa[i - 1] + (P.ENa - v) * DT;
      cumK[i] = cumK[i - 1] + Math.max(0, v - P.EK) * DT;
    }
    const lookup = (tab, a) => { const f = clamp((a - T0) / DT, 0, N), i = Math.floor(f), j = Math.min(N, i + 1); return lerp(tab[i], tab[j], f - i); };
    const reverse = (tab, val) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] < val) lo = m; else hi = m; } const span = tab[hi] - tab[lo] || 1; return T0 + (lo + (val - tab[lo]) / span) * DT; };
    function naWindow(u) { return [invert(A, u, -1, 2), invert(I, u, -1, 2)]; }
    const kPeakAge = (() => { let best = 0, ba = 0; for (let a = 0; a < 4; a += 0.01) { const k = nK(a); if (k > best) { best = k; ba = a; } } return ba; })();
    function kWindow(u) { return [invert(nK, u + 1e-9, -1, kPeakAge), invert(a => -nK(a), -u, kPeakAge, 7)]; }
    // Ages at which ions cross one channel: one ion per `quantum` mV·ms of
    // driving force while that channel is open (flux ∝ open × driving force).
    function spawnAges(kind, u, quantum, phase0) {
      const [s, e] = kind === 'Na' ? naWindow(u) : kWindow(u);
      if (!isFinite(s) || !isFinite(e) || e <= s) return [];
      const tab = kind === 'Na' ? cumNa : cumK, c0 = lookup(tab, s), c1 = lookup(tab, e), out = [];
      for (let k = phase0; c0 + k * quantum < c1; k++) out.push(reverse(tab, c0 + k * quantum));
      return out;
    }

    const scan = (test, from) => { for (let a = from; a < 7; a += 0.005) if (test(a)) return a; return null; };
    const absEnd = scan(a => refractory(a) !== 'absolute', 0);
    const relEnd = scan(a => refractory(a) === 'none', absEnd);
    // Teaching milestones for "next stage" navigation.
    const stages = [
      { age: P.tFoot, label: 'Local current starts to depolarize this patch' },
      { age: 0, label: '1 · Depolarization: threshold reached, Na⁺ channels open' },
      { age: P.tPeak, label: '2 · Repolarization: Na⁺ channels inactivated, K⁺ channels open' },
      { age: P.tCross, label: '3 · Hyperpolarization: below resting potential' },
      { age: absEnd, label: 'Absolute refractory period ends' },
      { age: P.tTrough, label: '4 · Return to resting potential: K⁺ channels closing' },
      { age: relEnd, label: 'Relative refractory period ends' },
      { age: P.tRecover, label: 'Resting membrane potential restored' }
    ].sort((x, y) => x.age - y.age);
    const phaseSpans = [
      { n: 1, key: 'Depolarization', from: 0, to: P.tPeak, color: NL.colors.depol },
      { n: 2, key: 'Repolarization', from: P.tPeak, to: P.tCross, color: NL.colors.repol },
      { n: 3, key: 'Hyperpolarization', from: P.tCross, to: P.tTrough, color: NL.colors.hyper },
      { n: 4, key: 'Return to resting potential', from: P.tTrough, to: P.tRecover, color: NL.colors.ret }
    ];
    return { P, voltage, gating, state, naChannel, kChannel, spawnAges, stages, phaseSpans, absEnd, relEnd, kPeakAge };
  };

  /* ----------------------------------------------------- playback control */
  NL.createPlayer = function (o) {
    const $ = NL.util.$;
    const p = { time: o.initialTime || 0, playing: false, duration: o.duration, dirty: true };
    let last = 0;
    const ui = {
      play: $(o.ids.play), restart: $(o.ids.restart), step: $(o.ids.step), next: $(o.ids.next),
      speed: $(o.ids.speed), loop: $(o.ids.loop), time: $(o.ids.time), clock: $(o.ids.clock)
    };
    ui.time.max = o.duration;
    p.invalidate = () => { p.dirty = true; };
    p.setTime = t => { p.time = clamp(t, 0, o.duration); p.dirty = true; };
    p.pause = () => { p.playing = false; last = 0; p.dirty = true; };
    p.toggle = () => { if (p.time >= o.duration) p.time = 0; p.playing = !p.playing; last = 0; p.dirty = true; };
    ui.play.addEventListener('click', p.toggle);
    ui.restart.addEventListener('click', () => { p.pause(); p.setTime(0); });
    ui.step.addEventListener('click', () => { p.pause(); p.setTime(p.time + (o.step || 0.1)); });
    ui.time.addEventListener('input', e => { p.pause(); p.setTime(+e.target.value); });
    if (ui.next) ui.next.addEventListener('click', () => {
      p.pause();
      const times = o.stageTimes();
      const nxt = times.find(t => t > p.time + 0.005);
      p.setTime(nxt == null ? o.duration : nxt);
    });
    document.addEventListener('keydown', e => {
      if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY/.test(document.activeElement.tagName)) return;
      e.preventDefault(); p.toggle();
    });
    document.addEventListener('visibilitychange', () => { last = 0; });
    function frame(ts) {
      if (p.playing) {
        const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
        p.time += dt * Number(ui.speed.value);
        if (p.time >= o.duration) { if (ui.loop && ui.loop.checked) p.time %= o.duration; else { p.time = o.duration; p.playing = false; } }
        last = ts; p.dirty = true;
      }
      if (p.dirty) {
        p.dirty = false;
        o.render(p.time);
        ui.time.value = p.time;
        ui.clock.textContent = `${p.time.toFixed(2)} / ${o.duration.toFixed(1)} ms`;
        ui.play.textContent = p.playing ? 'Pause' : 'Play';
        ui.play.setAttribute('aria-pressed', p.playing);
        ui.step.disabled = ui.next.disabled = p.time >= o.duration;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return p;
  };

  /* ------------------------------------------- probe trace (V and g vs t) */
  // Voltage over time at one patch, divided into the four numbered phases,
  // with Na⁺/K⁺ channel opening below and the refractory periods as a bar.
  NL.drawProbeTrace = function (svgEl, model, nowAge, opt = {}) {
    const S = NL.svg, C = NL.colors, P = model.P;
    const a0 = opt.from ?? -0.5, a1 = opt.to ?? 4.2, x0 = 62, x1 = 672;
    const X = a => x0 + (a - a0) / (a1 - a0) * (x1 - x0);
    const vTop = 44, vBot = 236, gTop = 262, gBot = 336;
    const Y = v => vBot - (v + 95) / 165 * (vBot - vTop);     // −95 … +70 mV
    const G = f => gBot - f * (gBot - gTop);
    let s = '';
    // Phase bands with number badges
    for (const p of model.phaseSpans) {
      s += S.rect(X(p.from), vTop, X(p.to) - X(p.from), vBot - vTop, p.color);
      const cx = (X(p.from) + X(p.to)) / 2;
      s += `<circle cx="${cx.toFixed(1)}" cy="26" r="11" fill="${C.ink}"/>` + S.text(cx, 30.5, p.n, 13, '#fff', 'middle', 'font-weight="800"');
    }
    for (const [v, lab, col, dash] of [[P.ENa, 'E<tspan baseline-shift="sub" font-size="9">Na</tspan> +60', C.na, '2 4'], [30, '+30'], [0, '0'], [P.threshold, '−55', C.threshold, '5 4'], [P.rest, '−75'], [P.EK, 'E<tspan baseline-shift="sub" font-size="9">K</tspan> −90', C.k, '2 4']]) {
      s += S.line(x0, Y(v), x1, Y(v), col || '#dfe6e4', dash ? `stroke-dasharray="${dash}"` : '');
      s += S.text(x0 - 6, Y(v) + 4, lab, 10.5, col || C.muted, 'end');
    }
    s += S.text(X(-0.48), Y(P.threshold) - 5, 'threshold', 10.5, C.threshold);
    s += S.text(X(3.0), Y(P.rest) - 6, 'resting potential', 10.5, C.muted, 'middle');
    s += `<path d="${S.curve(model.voltage, a0, a1, 320, X, Y)}" fill="none" stroke="${C.ink}" stroke-width="3"/>`;
    s += S.text(14, (vTop + vBot) / 2, 'mV', 11, C.muted);
    // Channel panel
    const nO = a => model.gating(a).nO, nK = a => model.gating(a).nK;
    s += S.text(x0 - 6, gTop + 4, '100%', 10, C.muted, 'end') + S.text(x0 - 6, gBot + 4, '0', 10, C.muted, 'end');
    s += S.line(x0, gTop, x1, gTop, '#e3e9e7', 'stroke-dasharray="2 3"');
    s += `<path d="${S.curve(nO, a0, a1, 300, X, G)} L${X(a1)} ${gBot} L${X(a0)} ${gBot}Z" fill="${C.naOpen}" fill-opacity=".28" stroke="${C.naOpen}" stroke-width="2"/>`;
    s += `<path d="${S.curve(nK, a0, a1, 300, X, G)} L${X(a1)} ${gBot} L${X(a0)} ${gBot}Z" fill="${C.kOpen}" fill-opacity=".22" stroke="${C.kOpen}" stroke-width="2"/>`;
    const halo = 'font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3"';
    s += S.text(X(0.1), gTop - 4, 'Na⁺ channels open', 11, C.naOpen, 'start', halo) + S.text(X(1.1), gTop + 14, 'K⁺ channels open', 11, C.kOpen, 'start', halo);
    s += S.line(x0, gBot, x1, gBot, C.muted);
    for (let a = 0; a <= a1; a++) s += S.text(X(a), gBot + 15, a, 11, C.muted, 'middle');
    // Refractory bar
    const ry = 360;
    s += S.rect(X(0), ry, X(model.absEnd) - X(0), 16, '#9fb8ae') + S.rect(X(model.absEnd), ry, X(model.relEnd) - X(model.absEnd), 16, '#d6e3dd');
    s += S.text((X(0) + X(model.absEnd)) / 2, ry + 12, 'Absolute refractory', 10.5, '#fff', 'middle', 'font-weight="700"');
    s += S.text((X(model.absEnd) + X(model.relEnd)) / 2, ry + 12, 'Relative', 10.5, C.ink, 'middle', 'font-weight="700"');
    s += S.text((x0 + x1) / 2, 400, 'Time since this patch reached threshold (ms)', 12.5, C.muted, 'middle');
    if (nowAge >= a0 && nowAge <= a1) {
      const x = X(nowAge), g = model.gating(nowAge);
      s += S.line(x, vTop - 4, x, ry + 16, C.purple, 'stroke-width="2"');
      s += `<circle cx="${x.toFixed(1)}" cy="${Y(model.voltage(nowAge)).toFixed(1)}" r="6" fill="${C.purple}" stroke="#fff" stroke-width="2"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${G(g.nO).toFixed(1)}" r="4" fill="${C.naOpen}"/><circle cx="${x.toFixed(1)}" cy="${G(g.nK).toFixed(1)}" r="4" fill="${C.kOpen}"/>`;
    } else {
      s += S.text((x0 + x1) / 2, Y(-20), nowAge < a0 ? 'The action potential has not reached this patch yet' : 'This patch is back at its resting potential', 13, C.purple, 'middle', halo);
    }
    svgEl.innerHTML = s;
  };

  /* --------------------------------------------------------- page chrome */
  NL.renderChrome = function (activeId) {
    const M = NL.manifest, root = document.body.dataset.root || '';
    const parts = M.parts, steps = parts.filter(p => p.step), active = parts.find(p => p.id === activeId);
    const nav = document.getElementById('lab-nav');
    if (nav) nav.innerHTML = parts.map(p => {
      const cur = p.id === activeId;
      return `<a class="tab${cur ? ' active' : ''}" href="${root}${p.href}"${cur ? ' aria-current="page"' : ''}>${p.step ? p.step + ' · ' : ''}${p.label}${p.status === 'planned' ? '<span class="tab-badge">In development</span>' : ''}</a>`;
    }).join('');
    const prog = document.getElementById('lab-progress');
    if (prog) {
      const idx = active && active.step ? active.step : 0;
      prog.innerHTML = `<div class="progress-label"><span>Signal pathway</span><b>${idx ? `Part ${idx} of ${steps.length}` : 'Overview'}</b></div><div class="progress" aria-hidden="true"><i style="width:${idx / steps.length * 100}%"></i></div><div class="progress-steps" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map(p => `<span class="progress-step${p.id === activeId ? ' active' : ''}">${p.label}</span>`).join('')}</div>`;
    }
    const pn = document.getElementById('lab-pager');
    if (pn) {
      const i = parts.findIndex(p => p.id === activeId), prev = parts[i - 1], next = parts[i + 1];
      pn.innerHTML = (prev ? `<a class="pager-link" href="${root}${prev.href}"><small>Previous</small>← ${prev.step ? prev.step + ' · ' : ''}${prev.label}</a>` : '<span></span>') +
        (next ? `<a class="pager-link next" href="${root}${next.href}"><small>Next</small>${next.step + ' · '}${next.label} →</a>` : '<span></span>');
    }
  };

  NL.renderPartCards = function (el) {
    const root = document.body.dataset.root || '';
    el.innerHTML = NL.manifest.parts.filter(p => p.step).map(p => `
      <article class="part-card ${p.status}">
        <div class="part-num" aria-hidden="true">${p.step}</div>
        <div><p class="part-label">Part ${p.step}${p.status === 'planned' ? ' · <span class="badge">In development</span>' : ' · <span class="badge ready">Interactive</span>'}</p>
        <h3>${p.title}</h3><p>${p.summary}</p>
        <ul>${p.topics.map(t => `<li>${t}</li>`).join('')}</ul></div>
        <a class="launch" href="${root}${p.href}">${p.status === 'ready' ? 'Open simulation' : 'Preview plan'} <span aria-hidden="true">→</span></a>
      </article>`).join('');
  };

  /* ---------------------------------------------------------------- quiz */
  NL.renderQuiz = function (el, items) {
    let i = 0, score = 0, answered = 0;
    function show() {
      const q = items[i];
      el.innerHTML = `<p class="quiz-count">Question ${i + 1} of ${items.length} · Score ${score}/${answered}</p><p class="quiz-prompt">${q.prompt}</p>
        <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}">${c}</button>`).join('')}</div>
        <div class="feedback" role="status" aria-live="polite">Choose the best answer.</div>
        <div class="quiz-actions"><button class="btn" data-act="next">${i < items.length - 1 ? 'Next question →' : 'Start again'}</button></div>`;
      el.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
        const k = +b.dataset.k, ok = k === q.answer;
        if (!el.querySelector('.choice:disabled')) { answered++; if (ok) score++; }
        el.querySelectorAll('.choice').forEach((c, j) => { c.disabled = true; if (j === q.answer) c.classList.add('correct'); else if (j === k) c.classList.add('wrong'); });
        el.querySelector('.feedback').innerHTML = `<b>${ok ? 'Correct.' : 'Not quite.'}</b> ${q.explanation}`;
        el.querySelector('.quiz-count').textContent = `Question ${i + 1} of ${items.length} · Score ${score}/${answered}`;
      }));
      el.querySelector('[data-act=next]').addEventListener('click', () => { i = (i + 1) % items.length; if (i === 0) { score = 0; answered = 0; } show(); });
    }
    show();
  };
})();
