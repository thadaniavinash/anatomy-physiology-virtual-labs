/* =====================================================================
   Simulation tab: add antibodies → add blood → mix & stir → wait → identify
   ===================================================================== */
window.Sim = (function () {
  const { AB, NAME, COLOR, LINE, REACT, FREQ, TYPES, EXPLAIN, nice } = BT;
  const R = SlideRender;
  const WAIT_SECONDS = 20;
  const STEP_NAMES = ['Add antibodies', 'Add blood', 'Mix & stir', 'Wait', 'Identify'];

  const S = {
    odds: 'real', bt: null, step: 0, busy: false,
    reagent: {}, blood: {}, mixed: {},
    waiting: false, elapsed: 0, last: 0,
    submitted: false, total: 0, right: 0, seed: 1, magAB: null, visible: false
  };
  const SL = {};
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let toastTimer;
  function toast(msg, kind = 'hint') {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast ' + kind, 4000);
  }

  function pickType() {
    const w = TYPES.map(t => [t, S.odds === 'real' ? FREQ[t] : 1]);
    let r = Math.random() * w.reduce((a, b) => a + b[1], 0);
    for (const [t, x] of w) { r -= x; if (r <= 0) return t; }
    return w[0][0];
  }

  /* ---------- markup ---------- */
  function bottleSVG(ab) {
    const liq = COLOR[ab], line = LINE[ab], cap = ab === 'Rh' ? '#ffffff' : liq;
    return `<svg viewBox="0 0 80 140" aria-hidden="true">
      <path d="M36,26 L40,3 L44,26 Z" fill="#fbfbfb" stroke="#9aa6b2"/>
      <rect x="22" y="24" width="36" height="20" rx="4" fill="${cap}" stroke="${ab === 'Rh' ? '#9aa6b2' : line}" stroke-width="1.2"/>
      <path d="M24,30 L56,30 M24,36 L56,36" stroke="rgba(0,0,0,.12)"/>
      <rect x="28" y="44" width="24" height="9" fill="rgba(235,242,248,.85)" stroke="#9aa6b2"/>
      <path d="M14,62 Q14,53 26,53 L54,53 Q66,53 66,62 L66,128 Q66,136 58,136 L22,136 Q14,136 14,128 Z" fill="rgba(240,246,250,.55)" stroke="#8a97a4" stroke-width="1.2"/>
      <path d="M16,74 L64,74 L64,128 Q64,134 58,134 L22,134 Q16,134 16,128 Z" fill="${liq}" ${ab === 'Rh' ? 'stroke="#c9cdd2"' : ''} opacity=".92"/>
      <rect x="12" y="80" width="56" height="40" rx="3" fill="#fff" stroke="#9aa6b2"/>
      <text x="40" y="97" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="14" fill="#1d2733">${NAME[ab]}</text>
      <text x="40" y="112" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#1d2733">Antibody</text>
      <path d="M20,60 L20,128" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  }

  function build() {
    $('simSteps').innerHTML = STEP_NAMES.map((n, i) => `<div class="st" id="st${i}"><div class="c">${i + 1}</div><div class="l">${n}</div></div>`).join('');
    $('bottles').innerHTML = AB.map(ab => `<button class="bottle" id="bot-${ab}" aria-label="${NAME[ab]} antibody bottle">${bottleSVG(ab)}</button>`).join('');
    $('slides').innerHTML = AB.map(ab => `<div class="slidebox">
        <canvas class="slide" id="sl-${ab}" tabindex="0" role="button" aria-label="${NAME[ab]} slide"></canvas>
        <div class="rlabel" id="rl-${ab}"></div>
        <button class="mag" id="mag-${ab}">🔍 Magnify</button></div>`).join('');
    AB.forEach(ab => {
      $('bot-' + ab).onclick = () => act(() => addReagent(ab));
      $('sl-' + ab).onclick = () => act(() => slideClick(ab));
      $('sl-' + ab).onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(() => slideClick(ab)); } };
      $('mag-' + ab).onclick = () => openMag(ab);
    });
    $('oddsReal').onclick = () => setOdds('real');
    $('oddsEven').onclick = () => setOdds('even');
    $('submit').onclick = submit;
    $('answer').onkeydown = e => { if (e.key === 'Enter') submit(); };
    $('newBtn').onclick = newSample;
    $('mClose').onclick = closeMag;
    $('modal').onclick = e => { if (e.target.id === 'modal') closeMag(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMag(); });
    window.addEventListener('resize', sizeAll);
    Hand.init($('handCanvas'), $('skinCtl'));
  }

  function setOdds(o) {
    S.odds = o;
    $('oddsReal').classList.toggle('on', o === 'real');
    $('oddsEven').classList.toggle('on', o === 'even');
    toast(o === 'real' ? 'From the next sample: blood types follow Canadian frequencies.' : 'From the next sample: all eight blood types are equally likely.');
  }

  function sizeAll() { AB.forEach(ab => R.fit($('sl-' + ab))); R.fit($('lens')); }

  /* ---------- animation helpers ---------- */
  function pagePt(el, fx, fy) { const r = el.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }
  function canvasPt(c, x, y) { const r = c.getBoundingClientRect(); return { x: r.left + x * (r.width / c._w), y: r.top + y * (r.height / c._h) }; }
  function flyDrop(color, from, to, dur, arc, pale) {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'fly flydrop';
      d.style.background = color; if (pale) d.style.border = '1px solid #9aa6b2';
      document.body.appendChild(d);
      const t0 = performance.now();
      (function f(now) {
        const p = Math.min(1, (now - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        d.style.left = (R.lerp(from.x, to.x, e) - 5) + 'px';
        d.style.top = (R.lerp(from.y, to.y, e) - Math.sin(p * Math.PI) * arc - 6) + 'px';
        if (p < 1) requestAnimationFrame(f); else { d.remove(); res(); }
      })(t0);
    });
  }
  function grow(sl, key, ms = 260) {
    const t0 = performance.now();
    (function f(now) { sl[key] = R.smooth((now - t0) / ms); if (sl[key] < 1) requestAnimationFrame(f); })(t0);
  }
  function fingerDrop(show) {
    const d = $('fingerDrop');
    d.classList.toggle('show', !!show);
  }

  /* ---------- actions ---------- */
  async function act(fn) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); } finally { S.busy = false; refresh(); }
  }

  async function addReagent(ab) {
    if (S.step !== 0) { toast(`${NAME[ab]} has already been added to its slide.`); return; }
    if (S.reagent[ab]) { toast(`One drop of ${NAME[ab]} is enough.`); return; }
    const b = $('bot-' + ab), sl = SL[ab], c = $('sl-' + ab), g = R.geo(c);
    b.classList.add('invert');
    await sleep(400);
    await flyDrop(COLOR[ab], pagePt(b, 0.5, 0.96), canvasPt(c, g.cx, g.H * 0.25), 360, 0, ab === 'Rh');
    S.reagent[ab] = true; grow(sl, 'reagentA');
    b.classList.remove('invert');
    await sleep(350);
    if (AB.every(a => S.reagent[a])) { S.step = 1; fingerDrop(true); toast('Antibodies added. Now add a drop of blood to each slide.', 'ok'); }
  }

  async function addBlood(ab) {
    if (S.blood[ab]) { toast('This slide already has a drop of blood.'); return; }
    const c = $('sl-' + ab), g = R.geo(c);
    const from = pagePt($('fingerDrop'), 0.5, 0.5);
    fingerDrop(false);
    await flyDrop('#b0102a', from, canvasPt(c, g.cx, g.H * 0.55), 520, 50);
    S.blood[ab] = true; grow(SL[ab], 'bloodA');
    if (AB.every(a => S.blood[a])) { S.step = 2; toast('Blood added beside each antibody drop. Now mix and stir each slide.', 'ok'); }
    else { await sleep(250); fingerDrop(true); }
  }

  async function mix(ab) {
    if (S.mixed[ab]) { toast('This slide has already been mixed.'); return; }
    const sl = SL[ab]; sl.mixing = true;
    const t0 = performance.now(), dur = 1700;
    await new Promise(res => { (function f(now) {
      const p = (now - t0) / dur; sl.mixP = R.clamp(p); sl.stickAng = p * Math.PI * 2 * 3.2;
      if (p < 1) requestAnimationFrame(f); else res(); })(t0); });
    sl.mixing = false; sl.mixP = 1; S.mixed[ab] = true;
    if (AB.every(a => S.mixed[a])) { S.step = 3; toast('All slides mixed. Start the timer and watch the slides.', 'ok'); }
  }

  async function slideClick(ab) {
    if (S.step === 0) { toast(S.reagent[ab] ? 'Add the other antibodies too.' : `Click the ${NAME[ab]} bottle above this slide to add one drop.`); return; }
    if (S.step === 1) return addBlood(ab);
    if (S.step === 2) return mix(ab);
    if (S.step === 3) { toast(S.waiting ? 'Keep watching. The timer is running.' : 'Start the timer below the slides.'); return; }
    openMag(ab);
  }

  function startWait() {
    if (S.step !== 3 || S.waiting) return;
    S.waiting = true; S.last = performance.now(); refresh();
  }
  function finishWait() {
    S.waiting = false; S.elapsed = WAIT_SECONDS; S.step = 4;
    $('tray').style.transform = '';
    AB.forEach(ab => {
      const pos = !!REACT[S.bt][ab], l = $('rl-' + ab);
      l.textContent = pos ? 'Agglutination' : 'No reaction'; l.className = 'rlabel show ' + (pos ? 'pos' : 'neg');
    });
    toast('Time is up. Look closely at each slide, then identify the blood type.', 'ok');
    $('answerPanel').classList.add('show');
    refresh();
    setTimeout(() => { $('answerPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('answer').focus({ preventScroll: true }); }, 200);
  }

  /* ---------- loop ---------- */
  function loop(t) {
    let tilt = 0;
    if (S.waiting) {
      const now = performance.now();
      S.elapsed = Math.min(WAIT_SECONDS, S.elapsed + (now - S.last) / 1000); S.last = now;
      tilt = Math.sin(t * 0.0035);
      $('tray').style.transform = `perspective(900px) rotateX(${tilt * 4}deg)`;
      updateTimer();
      if (S.elapsed >= WAIT_SECONDS) finishWait();
    }
    if (S.visible) {
      const agg = Math.min(1, S.elapsed / WAIT_SECONDS * 1.05 + 0.05);
      AB.forEach(ab => { if (SL[ab]) R.draw($('sl-' + ab), SL[ab], t, tilt, S.step >= 3 ? agg : 0); });
      if (S.magAB) drawLens(t);
    }
    requestAnimationFrame(loop);
  }

  function updateTimer() {
    const left = Math.max(0, Math.ceil(WAIT_SECONDS - S.elapsed));
    const el = $('timerTxt'); if (el) el.textContent = `0:${String(left).padStart(2, '0')}`;
    const ring = $('ringArc'); if (ring) ring.setAttribute('stroke-dasharray', `${(S.elapsed / WAIT_SECONDS * 56.5).toFixed(1)} 56.5`);
  }

  /* ---------- UI refresh ---------- */
  function refresh() {
    STEP_NAMES.forEach((_, i) => {
      const done = S.submitted || i < S.step;
      $('st' + i).className = 'st' + (done ? ' done' : (i === S.step ? ' on' : ''));
    });
    AB.forEach(ab => {
      const b = $('bot-' + ab);
      b.classList.toggle('ready', S.step === 0 && !S.reagent[ab] && !S.busy);
      b.classList.toggle('dim', S.step !== 0 || !!S.reagent[ab]);
      const ready = !S.busy && ((S.step === 1 && !S.blood[ab]) || (S.step === 2 && !S.mixed[ab]));
      $('sl-' + ab).classList.toggle('ready', ready);
      $('mag-' + ab).classList.toggle('show', S.step >= 4);
    });
    const n = o => AB.filter(a => o[a]).length;
    const msg = [
      `<b>Step 1 · Add antibodies.</b> Click each antibody bottle to place one drop on the slide below it. (${n(S.reagent)}/3)`,
      `<b>Step 2 · Add blood.</b> Click each slide to transfer a drop of blood from your fingertip, beside the antibody drop. (${n(S.blood)}/3)`,
      `<b>Step 3 · Mix &amp; stir.</b> Click each slide to stir the blood and antibody together with a clean mixing stick. (${n(S.mixed)}/3)`,
      S.waiting ? '<b>Step 4 · Wait.</b> The slides are gently rocked while the antibodies react with the red cells. Watch what happens…'
                : '<b>Step 4 · Wait.</b> Start the timer and watch the slides as the reaction develops.',
      S.submitted ? '<b>Done.</b> Review your feedback below, then try a new sample.'
                  : '<b>Step 5 · Identify.</b> Use 🔍 Magnify for a closer look, then enter the blood type below.'
    ];
    $('instr').innerHTML = msg[S.step];
    $('handCap').textContent = S.step === 1 ? 'Your fingertip: blood drop ready' : 'Your fingertip';

    const A = $('actions');
    if (S.step === 3 && !S.waiting) {
      A.innerHTML = `<button class="btn" id="waitBtn">⏱ Start the timer</button>`;
      $('waitBtn').onclick = startWait;
    } else if (S.waiting) {
      A.innerHTML = `<div class="timer"><svg class="ring" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="none" stroke="#3f4c59" stroke-width="3"/><circle id="ringArc" cx="11" cy="11" r="9" fill="none" stroke="#9be7c4" stroke-width="3" stroke-dasharray="0 56.5" transform="rotate(-90 11 11)"/></svg><span id="timerTxt">0:20</span><small>sped up from about 2 minutes</small></div>`;
      updateTimer();
    } else A.innerHTML = '';
  }

  /* ---------- answer ---------- */
  function normalise(raw) {
    let s = (raw || '').trim().toUpperCase().replace(/[−–—]/g, '-')
      .replace(/\bPOSITIVE\b/g, '+').replace(/\bNEGATIVE\b/g, '-')
      .replace(/\bPOS\b/g, '+').replace(/\bNEG\b/g, '-')
      .replace(/\bPLUS\b/g, '+').replace(/\bMINUS\b/g, '-')
      .replace(/\bRH\b/g, '').replace(/\bTYPE\b/g, '').replace(/\s+/g, '');
    if ((s[0] === '+' || s[0] === '-') && s.length > 1) s = s.slice(1) + s[0];
    return s;
  }

  function submit() {
    if (S.step !== 4 || S.submitted) return;
    const raw = $('answer').value;
    if (!raw.trim()) { toast('Type the blood type before submitting.'); $('answer').focus(); return; }
    const right = normalise(raw) === S.bt;
    S.submitted = true; S.total++; if (right) S.right++;
    $('sAtt').textContent = S.total; $('sOk').textContent = S.right;
    $('answer').disabled = true; $('submit').disabled = true;

    const rx = REACT[S.bt];
    const rows = AB.map(ab => `<tr><td><span class="dot" style="background:${COLOR[ab]}"></span>${NAME[ab]}</td>
      <td class="${rx[ab] ? 'pos' : 'neg'}">${rx[ab] ? 'Agglutination' : 'No reaction'}</td>
      <td>${ab === 'Rh' ? 'Rh (D)' : ab} antigen ${rx[ab] ? 'present' : 'absent'}</td></tr>`).join('');
    const recv = TYPES.filter(d => BT.rbcCompatible(S.bt, d)).map(nice).join(', ');
    const give = TYPES.filter(r => BT.rbcCompatible(r, S.bt)).map(nice).join(', ');

    $('fbRes').textContent = right ? `✓ Correct! The blood type is ${nice(S.bt)}.` : `✗ Not quite. You entered "${raw.trim()}". The blood type is ${nice(S.bt)}.`;
    $('fbTable').innerHTML = `<table class="tbl"><thead><tr><th>Slide</th><th>Result</th><th>Meaning</th></tr></thead><tbody>${rows}</tbody></table>`;
    $('fbExp').textContent = EXPLAIN[S.bt];
    $('fbCompat').innerHTML = `<b>What this means for transfusion:</b> a ${nice(S.bt)} client can receive red cells from <b>${recv}</b> and can donate red cells to <b>${give}</b>. <a href="#transfusion" data-tab-link="transfusion">Learn more in Blood Transfusion →</a>`;
    $('fb').className = 'fb show ' + (right ? 'ok' : 'bad');
    refresh();
    setTimeout(() => $('fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }

  /* ---------- magnifier ---------- */
  let LENS = null;
  function openMag(ab) {
    if (S.step < 4) return;
    const pos = !!REACT[S.bt][ab];
    const r = R.rng(S.seed * 7 + ab.length * 31 + ab.charCodeAt(0));
    const cells = [];
    if (pos) {
      [[.30, .30], [.72, .34], [.36, .72], [.72, .74]].forEach(([x, y], ci) => {
        const k = 3 + Math.floor(r() * 3);
        for (let i = 0; i < k; i++) {
          const a = i / (k - 1) * 6.28 + r() * 0.3, d = i === 0 ? 0 : 0.165;
          cells.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, rot: r() * 3, cl: ci, ph: r() * 6 });
        }
      });
    } else {
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
        const x = .2 + gx * .2 + (r() - .5) * .06, y = .2 + gy * .2 + (r() - .5) * .06;
        if ((x - .5) ** 2 + (y - .5) ** 2 < .17) cells.push({ x, y, rot: r() * 3, cl: -1, ph: r() * 6 });
      }
    }
    const free = []; for (let i = 0; i < (pos ? 6 : 16); i++) free.push({ x: r(), y: r(), rot: r() * 6, ph: r() * 6 });
    LENS = { ab, pos, cells, free };
    $('mTitle').textContent = `${NAME[ab]} slide · magnified (illustrative)`;
    $('mCap').textContent = pos
      ? `Each ${NAME[ab]} antibody (Y shape) binds matching antigens on two neighbouring red cells. This cross-linking pulls the cells together into the clumps you see on the slide.`
      : `The ${NAME[ab]} antibodies (Y shapes) find no matching antigen on these red cells, so they float freely and the cells stay evenly spread.`;
    S.magAB = ab; $('modal').classList.add('show'); R.fit($('lens')); $('mClose').focus();
  }
  function closeMag() { S.magAB = null; $('modal').classList.remove('show'); }

  function drawLens(t) {
    const L = $('lens'); if (!L._w || !LENS) return;
    const ctx = L.getContext('2d'), D = L._w;
    ctx.setTransform(L._dpr, 0, 0, L._dpr, 0, 0);
    const { ab, pos } = LENS;
    ctx.fillStyle = pos ? '#fbe3e8' : '#f4d4da'; ctx.fillRect(0, 0, D, D);
    const Rr = D * 0.075, col = LINE[ab], fillY = ab === 'Rh' ? '#ffffff' : COLOR[ab];
    const pts = LENS.cells.map(c => ({
      x: c.x * D + (pos ? Math.sin(t * .0008 + c.ph) * 1.2 : Math.sin(t * .0005 + c.ph) * D * .012),
      y: c.y * D + (pos ? Math.cos(t * .0007 + c.ph) * 1.2 : Math.cos(t * .0004 + c.ph) * D * .012), rot: c.rot, cl: c.cl }));
    pts.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const g = ctx.createRadialGradient(0, 0, Rr * .15, 0, 0, Rr);
      g.addColorStop(0, '#e8697d'); g.addColorStop(.45, '#d23c55'); g.addColorStop(.8, '#a8122c'); g.addColorStop(1, '#8a0d22');
      ctx.beginPath(); ctx.ellipse(0, 0, Rr, Rr * .94, 0, 0, 6.28); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(90,0,15,.6)'; ctx.lineWidth = 1; ctx.stroke();
      if (pos) { ctx.fillStyle = '#5c0a18'; for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; ctx.beginPath(); ctx.arc(Math.cos(a) * Rr * 1.02, Math.sin(a) * Rr * .96, 2, 0, 6.28); ctx.fill(); } }
      ctx.restore();
    });
    const Y = (x, y, ang, s) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, s * .9); ctx.lineTo(0, 0); ctx.lineTo(-s * .6, -s * .7); ctx.moveTo(0, 0); ctx.lineTo(s * .6, -s * .7); ctx.stroke();
      if (ab === 'Rh') { ctx.strokeStyle = fillY; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    };
    if (pos) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]; if (a.cl !== b.cl) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > Rr * 2.5) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      Y(mx - Math.sin(ang) * Rr * .18, my + Math.cos(ang) * Rr * .18, ang, Math.max(Rr * .5, (d - 2 * Rr) * .9 + Rr * .35));
    }
    LENS.free.forEach(f => {
      const x = (f.x * D + t * .006 * Math.cos(f.ph)) % D, y = ((f.y * D + t * .005 * Math.sin(f.ph)) % D + D) % D;
      Y((x + D) % D, y, f.rot + t * .0006, Rr * .4);
    });
  }

  /* ---------- new sample ---------- */
  function newSample() {
    closeMag();
    S.seed = Math.floor(Math.random() * 1e9);
    S.bt = pickType();
    Object.assign(S, { step: 0, busy: false, reagent: {}, blood: {}, mixed: {}, waiting: false, elapsed: 0, submitted: false });
    AB.forEach(ab => { SL[ab] = R.model(ab, !!REACT[S.bt][ab], S.seed); const l = $('rl-' + ab); l.textContent = ''; l.className = 'rlabel'; });
    fingerDrop(false);
    $('tray').style.transform = '';
    $('answerPanel').classList.remove('show'); $('fb').className = 'fb';
    $('answer').value = ''; $('answer').disabled = false; $('submit').disabled = false;
    refresh();
    const top = $('tab-simulation').getBoundingClientRect().top + window.scrollY - 10;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }

  function show() { S.visible = true; sizeAll(); }
  function hide() { S.visible = false; closeMag(); }

  function init() { build(); newSample(); requestAnimationFrame(loop); }

  return { init, show, hide, _state: S };
})();
