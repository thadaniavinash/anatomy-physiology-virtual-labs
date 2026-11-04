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
    ink: '#102f35', muted: '#5a6f73', line: '#d8e2df',
    na: '#c0392b', naSoft: '#f4c9c2', k: '#0f7c8c', kSoft: '#bfe2e7',
    open: '#7b4fc0', inact: '#2f7d5b', closed: '#a77b16',
    purple: '#7b4fc0', green: '#2f7d5b', gold: '#a77b16',
    threshold: '#b06a1f', resting: '#fff8e4', localDep: '#f1ebfa', depol: '#e6dcf7',
    absolute: '#e1efe7', relative: '#eef6f1', myelin: '#f3e3c3'
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
      return m('arr-muted', NL.colors.muted) + m('arr-purple', NL.colors.purple) + m('arr-green', NL.colors.green) + m('arr-na', NL.colors.na) + m('arr-k', NL.colors.k);
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
      tFoot: -0.25, tPeak: 0.45, tTrough: 1.3, tRecover: 3.6, upSlope: 150,
      // channel kinetics (ms, relative to threshold crossing)
      naAct: [-0.08, 0.40], naInact: [0.12, 0.60], naRecover: [0.9, 1.8],
      kAct: [0.15, 0.65], kClose: [1.2, 2.4],
      absoluteAvailable: 0.4, // fraction of Na⁺ channels available to end absolute refractoriness
      relativeNaI: 0.05, relativeK: 0.1
    }, opts);

    const voltage = hermite([
      { t: P.tFoot, v: P.rest, m: 0 },
      { t: 0, v: P.threshold, m: P.upSlope },  // non-zero slope: no stall at threshold
      { t: P.tPeak, v: P.peak, m: 0 },
      { t: P.tTrough, v: P.ahp, m: 0 },
      { t: P.tRecover, v: P.rest, m: 0 }
    ]);
    const A = a => smooth((a - P.naAct[0]) / P.naAct[1]);
    const I = a => smooth((a - P.naInact[0]) / P.naInact[1]);
    const R = a => 1 - smooth((a - P.naRecover[0]) / P.naRecover[1]);
    const kRise = a => smooth((a - P.kAct[0]) / P.kAct[1]);
    const kFall = a => 1 - smooth((a - P.kClose[0]) / P.kClose[1]);
    const nK = a => kRise(a) * kFall(a);

    function gating(a) {
      const r = R(a), nI = I(a) * r, nA = A(a) * r;
      return { nO: Math.max(0, nA - nI), nI, nC: 1 - nA, nK: nK(a) };
    }
    function refractory(a, g = gating(a)) {
      if (a < 0) return 'none';
      // Absolute: from threshold until enough Na⁺ channels have recovered from
      // inactivation (they cannot recover until the membrane repolarizes).
      if (a < P.naInact[0] + P.naInact[1] || 1 - g.nI < P.absoluteAvailable) return 'absolute';
      if (g.nI > P.relativeNaI || g.nK > P.relativeK) return 'relative';
      return 'none';
    }
    function phase(a, v) {
      if (a < P.tFoot) return 'Resting';
      if (a < 0) return 'Local depolarization';
      if (a < P.tPeak) return 'Depolarization';
      if (a < P.tRecover) return a < P.tTrough && v >= P.rest ? 'Repolarization' : 'Afterhyperpolarization';
      return 'Resting';
    }
    // Full state of a membrane patch at a given age.
    function state(a) {
      const v = voltage(a), g = gating(a);
      const naDrive = P.ENa - v, kDrive = v - P.EK;          // mV, + means inward Na⁺ / outward K⁺
      const scale = P.ENa - P.rest;                            // normalise to resting Na⁺ drive
      return {
        age: a, voltage: v, ...g, naDrive, kDrive,
        naFlux: g.nO * naDrive / scale, kFlux: g.nK * kDrive / scale,
        refractory: refractory(a, g), phase: phase(a, v)
      };
    }
    // Discrete state of one drawn channel with fixed random u ∈ [0,1).
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

    // Open window [start, end) of a single channel, in age units.
    function naWindow(u) { return [invert(A, u, -1, 2), invert(I, u, -1, 2)]; }
    const kPeakAge = (() => { let best = 0, ba = 0; for (let a = 0; a < 4; a += 0.01) { const k = nK(a); if (k > best) { best = k; ba = a; } } return ba; })();
    function kWindow(u) {
      const start = invert(nK, u + 1e-9, -1, kPeakAge);
      const end = invert(a => -nK(a), -u, kPeakAge, 7);
      return [start, end];
    }
    // Spawn ages of particles through one channel: one particle per `quantum`
    // mV·ms of driving force while open. `phase` staggers channels.
    function spawnAges(kind, u, quantum, phase0) {
      const [s, e] = kind === 'Na' ? naWindow(u) : kWindow(u);
      if (!isFinite(s) || !isFinite(e) || e <= s) return [];
      const tab = kind === 'Na' ? cumNa : cumK, c0 = lookup(tab, s), c1 = lookup(tab, e), out = [];
      for (let k = phase0; c0 + k * quantum < c1; k++) out.push(reverse(tab, c0 + k * quantum));
      return out;
    }

    // Teaching milestones (ages) for "next stage" navigation.
    const stages = (() => {
      const list = [
        { age: P.tFoot, label: 'Local depolarization begins' },
        { age: 0, label: 'Threshold reached' }
      ];
      let best = 0, ba = 0; for (let a = 0; a < 1; a += 0.005) { const o = gating(a).nO; if (o > best) { best = o; ba = a; } }
      list.push({ age: ba, label: 'Peak Na⁺ conductance' }, { age: P.tPeak, label: 'Peak voltage' });
      const scan = (test, from) => { for (let a = from; a < 7; a += 0.005) if (test(a)) return a; return null; };
      const ahp = scan(a => voltage(a) < P.rest, P.tPeak);
      const absEnd = scan(a => refractory(a) !== 'absolute', 0);
      const relEnd = scan(a => refractory(a) === 'none', absEnd || 0);
      list.push({ age: ahp, label: 'Afterhyperpolarization' }, { age: absEnd, label: 'Absolute refractory ends' }, { age: relEnd, label: 'Excitability restored' }, { age: P.tRecover, label: 'Back to resting potential' });
      return list.filter(s => s.age != null).sort((x, y) => x.age - y.age);
    })();

    return { P, voltage, gating, state, naChannel, kChannel, spawnAges, stages, kPeakAge };
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
  // Draws voltage (top) and channel populations (bottom) against age for one
  // patch, with refractory shading and a "now" marker. Reusable by any module.
  NL.drawProbeTrace = function (svgEl, model, nowAge, opt = {}) {
    const S = NL.svg, C = NL.colors, P = model.P;
    const a0 = opt.from ?? -0.6, a1 = opt.to ?? 5, W = 700, x0 = 62, x1 = 672;
    const X = a => x0 + (a - a0) / (a1 - a0) * (x1 - x0);
    const vTop = 26, vBot = 226, gTop = 262, gBot = 352;
    const Y = v => vBot - (v + 100) / 170 * (vBot - vTop);     // −100 … +70 mV
    const G = f => gBot - f * (gBot - gTop);
    const st = model.stages, absEnd = st.find(s => s.label === 'Absolute refractory ends').age, relEnd = st.find(s => s.label === 'Excitability restored').age;
    let s = S.rect(X(0), vTop, X(absEnd) - X(0), gBot - vTop, C.absolute) + S.rect(X(absEnd), vTop, X(relEnd) - X(absEnd), gBot - vTop, C.relative);
    s += S.text((X(0) + X(absEnd)) / 2, 18, 'Absolute refractory', 11, C.green, 'middle') + S.text((X(absEnd) + X(relEnd)) / 2, 18, 'Relative refractory', 11, C.green, 'middle');
    // Reference lines: equilibrium potentials show where each ion "wants" to take the membrane.
    for (const [v, lab, col, dash] of [[P.ENa, `E<tspan baseline-shift="sub" font-size="9">Na</tspan> +${P.ENa}`, C.na, '2 4'], [30, '+30', null], [0, '0', null], [P.threshold, '−55', C.threshold, '5 4'], [P.rest, String(P.rest), null], [P.EK, `E<tspan baseline-shift="sub" font-size="9">K</tspan> ${P.EK}`, C.k, '2 4']]) {
      s += S.line(x0, Y(v), x1, Y(v), col || '#e3e9e7', dash ? `stroke-dasharray="${dash}"` : '');
      s += S.text(x0 - 6, Y(v) + 4, col ? lab : v, 10.5, col || C.muted, 'end');
    }
    s += `<path d="${S.curve(model.voltage, a0, a1, 320, X, Y)}" fill="none" stroke="${C.na}" stroke-width="2.6"/>`;
    s += `<path d="${S.curve(model.voltage, 0, P.tPeak, 40, X, Y)}" fill="none" stroke="${C.purple}" stroke-width="3.5"/>`;
    s += S.text(12, (vTop + vBot) / 2, 'mV', 11, C.muted);
    // Conductance panel
    s += S.line(x0, gBot, x1, gBot, C.muted) + S.line(x0, gTop, x1, gTop, '#e3e9e7', 'stroke-dasharray="2 3"');
    s += S.text(x0 - 6, gTop + 4, '100%', 10, C.muted, 'end') + S.text(x0 - 6, gBot + 4, '0', 10, C.muted, 'end');
    const nO = a => model.gating(a).nO, nK = a => model.gating(a).nK, avail = a => 1 - model.gating(a).nI;
    s += `<path d="${S.curve(nO, a0, a1, 300, X, G)} L${X(a1)} ${gBot} L${X(a0)} ${gBot}Z" fill="${C.open}" fill-opacity=".22" stroke="${C.open}" stroke-width="2"/>`;
    s += `<path d="${S.curve(nK, a0, a1, 300, X, G)}" fill="none" stroke="${C.k}" stroke-width="2.4"/>`;
    s += `<path d="${S.curve(avail, a0, a1, 300, X, G)}" fill="none" stroke="${C.green}" stroke-width="1.6" stroke-dasharray="5 3"/>`;
    const halo = 'font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3"';
    s += S.text(X(0.3) + 14, G(0.86), 'Na⁺ open', 11, C.open, 'start', halo) + S.text(X(1.25), gTop - 6, 'K⁺ open', 11, C.k, 'middle', halo);
    s += S.text(X(2.25) + 10, G(0.45), 'Na⁺ available (recovered)', 11, C.green, 'start', halo);
    s += S.text(X(0.3) + 14, Y(P.threshold) + 14, 'threshold', 10.5, C.threshold, 'start');
    for (let a = 0; a <= a1; a++) s += S.text(X(a), gBot + 16, a, 11, C.muted, 'middle');
    s += S.text((x0 + x1) / 2, gBot + 34, 'Time since this patch reached threshold (ms)', 12.5, C.muted, 'middle');
    if (nowAge >= a0 && nowAge <= a1) {
      const x = X(nowAge), g = model.gating(nowAge);
      s += S.line(x, vTop, x, gBot, C.ink, 'stroke-width="1.6"');
      s += `<circle cx="${x.toFixed(1)}" cy="${Y(model.voltage(nowAge)).toFixed(1)}" r="5.5" fill="${C.ink}" stroke="#fff" stroke-width="2"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${G(g.nO).toFixed(1)}" r="4" fill="${C.open}"/><circle cx="${x.toFixed(1)}" cy="${G(g.nK).toFixed(1)}" r="4" fill="${C.k}"/>`;
    } else {
      s += S.text((x0 + x1) / 2, 245, nowAge < a0 ? 'The action potential has not reached this patch yet' : 'This patch has fully recovered', 12, C.purple, 'middle');
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
