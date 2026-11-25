/* =====================================================================
   App shell: tab navigation, theory figures and tables
   ===================================================================== */
(function () {
  const { TYPES, FREQ, nice, rbcCompatible, plasmaCompatible } = BT;
  const $ = id => document.getElementById(id);
  const TABS = ['antigens', 'simulation', 'transfusion', 'plasma', 'quiz'];

  /* ---------- tabs ---------- */
  function showTab(name, push) {
    if (!TABS.includes(name)) name = 'antigens';
    TABS.forEach(t => {
      const on = t === name;
      $('tab-' + t).hidden = !on;
      const b = document.querySelector(`[data-tab="${t}"]`);
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    if (name === 'simulation') Sim.show(); else Sim.hide();
    if (name === 'quiz') Quiz.show();
    const t = $('toast'); if (t) t.classList.remove('show');
    if (push) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0 });
  }

  function initTabs() {
    const btns = [...document.querySelectorAll('[data-tab]')];
    btns.forEach((b, i) => {
      b.addEventListener('click', () => showTab(b.dataset.tab, true));
      b.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
        n.focus(); showTab(n.dataset.tab, true);
      });
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-tab-link]');
      if (a) { e.preventDefault(); showTab(a.dataset.tabLink, true); }
    });
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));
    window.addEventListener('resize', () => { if (!$('tab-quiz').hidden) Quiz.show(); });
  }

  /* ---------- figures ---------- */
  const Y = (x, y, col, s = 1, rot = 0) => `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})"><path d="M0,9 L0,0 L-6,-7 M0,0 L6,-7" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/></g>`;
  const COLA = '#1d4fb0', COLB = '#b8860b';

  function cell(cx, cy, R, kind) {
    let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#rbcG)" stroke="#8a0d22" stroke-width="1.2"/>
             <ellipse cx="${cx}" cy="${cy}" rx="${R * .45}" ry="${R * .42}" fill="#b01730" opacity=".35"/>`;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * (R + 1), y = cy + Math.sin(a) * (R + 1);
      const deg = a * 180 / Math.PI + 90;
      let k = kind === 'AB' ? (i % 2 ? 'B' : 'A') : kind;
      if (k === 'A') s += `<g transform="translate(${x},${y}) rotate(${deg})"><path d="M0,0 L0,-5 M-5,-5 L5,-5 L0,-12 Z" fill="${COLA}" stroke="${COLA}" stroke-width="1.4" stroke-linejoin="round"/></g>`;
      else if (k === 'B') s += `<g transform="translate(${x},${y}) rotate(${deg})"><path d="M0,0 L0,-5" stroke="${COLB}" stroke-width="1.6"/><circle cx="0" cy="-9" r="4.2" fill="${COLB}"/></g>`;
      else s += `<g transform="translate(${x},${y}) rotate(${deg})"><path d="M0,0 L0,-6" stroke="#8a97a4" stroke-width="2" stroke-linecap="round"/></g>`;
    }
    return s;
  }

  function aboFigure() {
    const kinds = [['A', 'A antigens', 'Anti-B', [COLB]], ['B', 'B antigens', 'Anti-A', [COLA]], ['AB', 'A and B antigens', 'Neither', []], ['O', 'No A or B antigens', 'Anti-A and anti-B', [COLA, COLB]]];
    let s = `<svg viewBox="0 0 680 270" role="img" aria-label="Red cells of types A, B, AB and O with their surface antigens and plasma antibodies">
      <defs><radialGradient id="rbcG" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="#ec7286"/><stop offset=".6" stop-color="#cc2a46"/><stop offset="1" stop-color="#90102a"/></radialGradient></defs>`;
    kinds.forEach(([k, ag, ab, cols], i) => {
      const cx = 85 + i * 170;
      s += `<text x="${cx}" y="22" text-anchor="middle" font-weight="700" font-size="17" fill="#1d2733">Type ${k}</text>`;
      s += cell(cx, 92, 44, k === 'O' ? 'H' : k);
      s += `<text x="${cx}" y="168" text-anchor="middle" font-size="13" fill="#4a5866">${ag}</text>`;
      s += `<rect x="${cx - 74}" y="184" width="148" height="76" rx="10" fill="#fff6e8" stroke="#ecd9b8"/>`;
      s += `<text x="${cx}" y="202" text-anchor="middle" font-size="11.5" fill="#7a5a20">Plasma antibodies</text>`;
      cols.forEach((c, j) => { const n = cols.length; s += Y(cx + (j - (n - 1) / 2) * 34, 222, c, 1.3); });
      s += `<text x="${cx}" y="251" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1d2733">${ab}</text>`;
    });
    return s + '</svg>';
  }

  function agglutFigure() {
    let s = `<svg viewBox="0 0 680 252" role="img" aria-label="Antibodies cross-linking red cells that carry the matching antigen, compared with no reaction">
      <defs><radialGradient id="rbcG2" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="#ec7286"/><stop offset=".6" stop-color="#cc2a46"/><stop offset="1" stop-color="#90102a"/></radialGradient></defs>
      <rect x="6" y="6" width="326" height="240" rx="14" fill="#fdecef" stroke="#f3c4cd"/>
      <rect x="348" y="6" width="326" height="240" rx="14" fill="#f3f6f8" stroke="#d8e0e6"/>
      <text x="169" y="30" text-anchor="middle" font-weight="700" font-size="14" fill="#9b1c32">Matching antigen: agglutination</text>
      <text x="511" y="30" text-anchor="middle" font-weight="700" font-size="14" fill="#4a5866">No matching antigen: no reaction</text>`;
    const pts = [[110, 95], [182, 95], [146, 157], [218, 157], [74, 157]];
    pts.forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="30" fill="url(#rbcG2)" stroke="#8a0d22"/>`; });
    const links = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [0, 4], [2, 4]];
    links.forEach(([a, b]) => {
      const [x1, y1] = pts[a], [x2, y2] = pts[b], mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      s += Y(mx, my, COLA, 1.15, ang + 90);
    });
    [[420, 90], [520, 80], [610, 110], [455, 170], [570, 175]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="30" fill="url(#rbcG2)" stroke="#8a0d22"/>`; });
    [[470, 128, 20], [560, 130, -30], [640, 170, 60], [395, 145, 110], [515, 205, -70]].forEach(([x, y, r]) => { s += Y(x, y, COLA, 1.15, r); });
    s += `<text x="169" y="236" text-anchor="middle" font-size="12" fill="#4a5866">Each Y-shaped antibody binds two cells, linking them into clumps</text>
          <text x="511" y="236" text-anchor="middle" font-size="12" fill="#4a5866">Antibodies float free; cells stay evenly spread</text>`;
    return s + '</svg>';
  }

  /* ---------- tables ---------- */
  function aboTable() {
    const rows = [['A', 'A', 'Anti-B'], ['B', 'B', 'Anti-A'], ['AB', 'A and B', 'None'], ['O', 'None', 'Anti-A and anti-B']];
    return `<table class="tbl"><thead><tr><th>ABO type</th><th>Antigens on red cells</th><th>Antibodies in plasma</th><th>Canadians (Rh+ / Rh−)</th></tr></thead><tbody>` +
      rows.map(([t, ag, ab]) => `<tr><td><b>${t}</b></td><td>${ag}</td><td>${ab}</td><td>${FREQ[t + '+']}% / ${FREQ[t + '-']}%</td></tr>`).join('') + '</tbody></table>';
  }

  function rbcGrid() {
    let s = `<table class="grid"><thead><tr><th class="corner">Recipient ↓ &nbsp; Donor →</th>${TYPES.map(t => `<th>${nice(t)}</th>`).join('')}</tr></thead><tbody>`;
    TYPES.forEach(r => {
      s += `<tr><th>${nice(r)}</th>` + TYPES.map(d => rbcCompatible(r, d) ? '<td class="y" aria-label="compatible">✓</td>' : '<td class="n" aria-label="not compatible"></td>').join('') + '</tr>';
    });
    return s + '</tbody></table>';
  }

  function plasmaGrid() {
    const G = ['O', 'A', 'B', 'AB'];
    let s = `<table class="grid"><thead><tr><th class="corner">Recipient ↓ &nbsp; Plasma donor →</th>${G.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>`;
    G.forEach(r => { s += `<tr><th>${r}</th>` + G.map(d => plasmaCompatible(r, d) ? '<td class="y" aria-label="compatible">✓</td>' : '<td class="n" aria-label="not compatible"></td>').join('') + '</tr>'; });
    return s + '</tbody></table>';
  }

  function init() {
    $('figABO').innerHTML = aboFigure();
    $('figAgg').innerHTML = agglutFigure();
    $('tblABO').innerHTML = aboTable();
    $('gridRBC').innerHTML = rbcGrid();
    $('gridPlasma').innerHTML = plasmaGrid();
    const pos = TYPES.filter(t => t.endsWith('+')).reduce((a, t) => a + FREQ[t], 0);
    $('rhPos').textContent = Math.round(pos) + '%';
    Sim.init();
    Quiz.init();
    initTabs();
    showTab(location.hash.slice(1) || 'antigens', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
