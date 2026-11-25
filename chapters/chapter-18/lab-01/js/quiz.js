/* =====================================================================
   Quiz tab: 10 questions = 3 slide-reading (generated) + 3 antigens
   + 2 transfusion + 2 plasma, drawn at random from the bank in data.js
   ===================================================================== */
window.Quiz = (function () {
  const { AB, NAME, REACT, TYPES, QUIZ, nice } = BT;
  const PLAN = { slides: 3, antigens: 3, transfusion: 2, plasma: 2 };
  const TOPIC = { slides: 'Slide reading', antigens: 'Antigens & antibodies', transfusion: 'Blood transfusion', plasma: 'Plasma transfusion' };
  const $ = id => document.getElementById(id);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let Q = [], idx = 0, results = [];

  function slideQuestion(type) {
    const rx = REACT[type];
    // distractors: types that differ by one reaction first (the most instructive mistakes)
    const diff = t => AB.filter(a => REACT[t][a] !== rx[a]).length;
    const near = shuffle(TYPES.filter(t => t !== type)).sort((a, b) => diff(a) - diff(b)).slice(0, 3);
    const opts = shuffle([type, ...near]);
    const desc = AB.map(a => `${NAME[a]}: ${rx[a] ? 'agglutination' : 'no reaction'}`).join('; ');
    return {
      topic: 'slides', type: 'single', slides: { type, seed: Math.floor(Math.random() * 1e9) },
      q: 'These three slides were read after mixing and waiting. What is the blood type?',
      options: opts.map(nice), answer: opts.indexOf(type),
      why: `${desc}. Agglutination means the matching antigen is present, so the blood type is ${nice(type)}.`
    };
  }

  function shuffleOptions(q) {
    const order = shuffle(q.options.map((_, i) => i));
    const ans = q.type === 'sata' ? q.answer.map(a => order.indexOf(a)) : order.indexOf(q.answer);
    return Object.assign({}, q, { options: order.map(i => q.options[i]), answer: ans });
  }

  function newQuiz() {
    const slideTypes = shuffle(TYPES).slice(0, PLAN.slides);
    Q = slideTypes.map(slideQuestion);
    ['antigens', 'transfusion', 'plasma'].forEach(tp => {
      shuffle(QUIZ.filter(q => q.topic === tp)).slice(0, PLAN[tp]).forEach(q => Q.push(shuffleOptions(q)));
    });
    Q = [Q[0], ...shuffle(Q.slice(1))];
    idx = 0; results = [];
    $('quizEnd').hidden = true; $('quizCard').hidden = false;
    render();
  }

  function render() {
    const q = Q[idx];
    $('qProg').textContent = `Question ${idx + 1} of ${Q.length}`;
    $('qBar').style.width = `${(idx / Q.length) * 100}%`;
    $('qTopic').textContent = TOPIC[q.topic];
    $('qText').textContent = q.q;
    $('qHint').textContent = q.type === 'sata' ? 'Select all that apply.' : '';
    const sh = $('qSlides');
    if (q.slides) {
      sh.hidden = false;
      sh.innerHTML = AB.map(a => `<canvas class="qslide" data-ab="${a}"></canvas>`).join('');
      requestAnimationFrame(drawSlides);
    } else { sh.hidden = true; sh.innerHTML = ''; }
    const inp = q.type === 'sata' ? 'checkbox' : 'radio';
    $('qOpts').innerHTML = q.options.map((o, i) => `<label class="opt"><input type="${inp}" name="qopt" value="${i}"><span>${o}</span></label>`).join('');
    $('qFb').className = 'qfb'; $('qFb').innerHTML = '';
    $('qCheck').hidden = false; $('qNext').hidden = true;
    $('qCheck').disabled = true;
    $('qOpts').onchange = () => { $('qCheck').disabled = !$('qOpts').querySelector('input:checked'); };
  }

  function check() {
    const q = Q[idx];
    const chosen = [...$('qOpts').querySelectorAll('input:checked')].map(i => +i.value);
    if (!chosen.length) return;
    const correct = q.type === 'sata' ? q.answer.slice().sort() : [q.answer];
    const ok = chosen.length === correct.length && chosen.slice().sort().every((v, i) => v === correct[i]);
    results.push({ q, ok, chosen });
    $('qOpts').querySelectorAll('label').forEach((l, i) => {
      const inp = l.querySelector('input'); inp.disabled = true;
      if (correct.includes(i)) l.classList.add('right');
      else if (chosen.includes(i)) l.classList.add('wrong');
    });
    $('qFb').className = 'qfb show ' + (ok ? 'ok' : 'bad');
    $('qFb').innerHTML = `<b>${ok ? '✓ Correct.' : (q.type === 'sata' ? '✗ Not quite. The correct options are highlighted.' : '✗ Not quite. The correct answer is highlighted.')}</b> ${q.why}`;
    $('qCheck').hidden = true; $('qNext').hidden = false;
    $('qNext').textContent = idx === Q.length - 1 ? 'See results →' : 'Next question →';
    $('qNext').focus();
  }

  function next() {
    if (idx < Q.length - 1) { idx++; render(); window.scrollTo({ top: $('tab-quiz').offsetTop - 10, behavior: 'smooth' }); }
    else finish();
  }

  function finish() {
    $('qBar').style.width = '100%';
    $('quizCard').hidden = true; $('quizEnd').hidden = false;
    const score = results.filter(r => r.ok).length;
    $('qScore').textContent = `${score} / ${results.length}`;
    $('qMsg').textContent = score === results.length ? 'Excellent: every question correct.'
      : score >= 8 ? 'Well done. Review the questions you missed below.'
      : score >= 6 ? 'Good effort. Revisit the topics below where you lost marks.'
      : 'Keep practising. The theory tabs and the simulation will help.';
    const by = {};
    results.forEach(r => { const t = r.q.topic; by[t] = by[t] || [0, 0]; by[t][1]++; if (r.ok) by[t][0]++; });
    $('qTopics').innerHTML = Object.keys(PLAN).map(t => by[t] ? `<div class="tchip"><span>${TOPIC[t]}</span><b>${by[t][0]}/${by[t][1]}</b></div>` : '').join('');
    $('qReview').innerHTML = results.filter(r => !r.ok).map(r => {
      const q = r.q, corr = q.type === 'sata' ? q.answer.map(i => q.options[i]).join('; ') : q.options[q.answer];
      return `<li><p class="rq">${q.q}${q.slides ? ` <span class="muted">(slides: ${AB.map(a => NAME[a] + ' ' + (REACT[q.slides.type][a] ? '+' : '−')).join(', ')})</span>` : ''}</p>
        <p><b>Answer:</b> ${corr}</p><p class="muted">${q.why}</p></li>`;
    }).join('') || '<li>Nothing to review.</li>';
  }

  function init() {
    $('qCheck').onclick = check;
    $('qNext').onclick = next;
    $('qRestart').onclick = newQuiz;
    newQuiz();
  }
  function drawSlides() {
    const q = Q[idx]; if (!q || !q.slides) return;
    $('qSlides').querySelectorAll('canvas').forEach(c =>
      SlideRender.drawStatic(c, c.dataset.ab, !!REACT[q.slides.type][c.dataset.ab], q.slides.seed));
  }
  function show() { requestAnimationFrame(drawSlides); }
  return { init, show };
})();
