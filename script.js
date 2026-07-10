const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const I18N = {
  en: {
    resetVotesBtn: 'Reset votes',
    resetAllBtn: 'Reset',
    questionLabel: 'Question',
    questionPlaceholder: 'Which question should be voted on?',
    answersLabel: 'Answers',
    addAnswerBtn: '+ Add answer',
    participantsLabel: 'Participants',
    namePlaceholder: 'Name',
    addParticipantBtn: 'Add',
    participantHint: 'Choose an existing answer to join others’ votes. More votes = bigger segment.',
    questionEyebrow: 'Question',
    questionDisplayPlaceholder: 'Your question will appear here',
    spinBtn: 'Spin',
    spinningBtn: 'Spinning …',
    winnerLabel: 'Winner',
    closeBtn: 'Close',
    spinAgainBtn: 'Spin again',
    noVotesYet: 'No votes yet',
    answerPlaceholder: n => `Answer ${n}`,
    optionsCount: n => `${n} option${n === 1 ? '' : 's'}`,
    votesCount: n => `${n} vote${n === 1 ? '' : 's'}`,
    statusLine(v, o) { return `${this.votesCount(v)} · ${this.optionsCount(o)}`; },
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% of votes`; }
  },
  de: {
    resetVotesBtn: 'Stimmen zurücksetzen',
    resetAllBtn: 'Zurücksetzen',
    questionLabel: 'Frage',
    questionPlaceholder: 'Welche Frage soll abgestimmt werden?',
    answersLabel: 'Antworten',
    addAnswerBtn: '+ Antwort hinzufügen',
    participantsLabel: 'Teilnehmer',
    namePlaceholder: 'Name der Person',
    addParticipantBtn: 'Eintragen',
    participantHint: 'Wähle eine bestehende Antwort, um dich den Stimmen anderer anzuschließen. Mehr Stimmen = größeres Segment.',
    questionEyebrow: 'Frage',
    questionDisplayPlaceholder: 'Deine Frage erscheint hier',
    spinBtn: 'Drehen',
    spinningBtn: 'Dreht …',
    winnerLabel: 'Gewinner',
    closeBtn: 'Schließen',
    spinAgainBtn: 'Nochmal drehen',
    noVotesYet: 'Noch keine Stimmen',
    answerPlaceholder: n => `Antwort ${n}`,
    optionsCount: n => `${n} Optionen`,
    votesCount: n => `${n} Stimmen`,
    statusLine(v, o) { return `${this.votesCount(v)} · ${this.optionsCount(o)}`; },
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% der Stimmen`; }
  }
};
let lang = localStorage.getItem('dyntune_lang') || 'en';
function t(key, ...args) {
  const dict = I18N[lang];
  const entry = dict[key];
  return typeof entry === 'function' ? entry.apply(dict, args) : entry;
}

const state = {
  question: '',
  answers: [],      // { id, label }
  participants: [], // { id, name, answerId }
  voteAnswerId: null
};

let rotation = -Math.PI / 2;
let spinning = false;
let winner = null;
let audioCtx = null;
let spinRaf = null;
let confettiRaf = null;
let pointerTimeout = null;

const el = {
  questionInput: document.getElementById('questionInput'),
  questionDisplay: document.getElementById('questionDisplay'),
  answersList: document.getElementById('answersList'),
  answersCount: document.getElementById('answersCount'),
  addAnswerBtn: document.getElementById('addAnswerBtn'),
  nameInput: document.getElementById('nameInput'),
  voteSelect: document.getElementById('voteSelect'),
  addParticipantBtn: document.getElementById('addParticipantBtn'),
  participantsCount: document.getElementById('participantsCount'),
  resetVotesBtn: document.getElementById('resetVotesBtn'),
  resetAllBtn: document.getElementById('resetAllBtn'),
  wheelCanvas: document.getElementById('wheelCanvas'),
  pointer: document.getElementById('pointer'),
  spinBtn: document.getElementById('spinBtn'),
  statusLine: document.getElementById('statusLine'),
  winnerOverlay: document.getElementById('winnerOverlay'),
  confettiCanvas: document.getElementById('confettiCanvas'),
  winnerCard: document.getElementById('winnerCard'),
  winnerBadge: document.getElementById('winnerBadge'),
  winnerLabel: document.getElementById('winnerLabel'),
  winnerMeta: document.getElementById('winnerMeta'),
  closeWinnerBtn: document.getElementById('closeWinnerBtn'),
  againBtn: document.getElementById('againBtn'),
  flicker: document.getElementById('flicker'),
  langEnBtn: document.getElementById('langEnBtn'),
  langDeBtn: document.getElementById('langDeBtn')
};

function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }

// ---------- data ----------
// Only answers with at least one real vote get a wheel segment, so an
// unvoted option can never appear to have a chance of winning.
function getSegments() {
  const { answers, participants } = state;
  const votes = {};
  answers.forEach(a => votes[a.id] = 0);
  participants.forEach(p => { if (votes[p.answerId] != null) votes[p.answerId]++; });
  const n = answers.length;
  const totalV = answers.reduce((sum, a) => sum + votes[a.id], 0);
  if (totalV === 0) return [];
  let acc = 0;
  const segs = [];
  answers.forEach((a, i) => {
    const v = votes[a.id];
    if (v <= 0) return;
    const f0 = acc / totalV; acc += v; const f1 = acc / totalV;
    segs.push({
      id: a.id, label: a.label, number: i + 1,
      votes: v,
      pct: Math.round(v / totalV * 100),
      color: colorFor(i, n), f0, f1
    });
  });
  return segs;
}

function colorFor(i, n) {
  const scheme = CONFIG.paletteScheme;
  const f = n <= 1 ? 0.5 : i / (n - 1);
  let h, s, l;
  if (scheme === 'Warm') { h = 45 - 37 * f; s = 62; l = 60; }
  else if (scheme === 'Regenbogen') { h = 315 * f; s = 58; l = 60; }
  else { h = 195 + 110 * f; s = 47; l = 60; }
  l = l + (i % 2 ? -3 : 3);
  return `hsl(${h.toFixed(0)} ${s}% ${l}%)`;
}

// ---------- wheel drawing ----------
function drawFace(ctx, S, rot, drawLabels) {
  const cx = S / 2, cy = S / 2, R = S / 2 - 34;
  const segs = getSegments();
  if (!segs.length) return;
  const showP = CONFIG.showPercent !== false;
  segs.forEach(s => {
    const a0 = rot + s.f0 * 2 * Math.PI;
    const a1 = rot + s.f1 * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    if (!drawLabels) return;
    const mid = (a0 + a1) / 2, lr = R * 0.66;
    const lx = cx + Math.cos(mid) * lr, ly = cy + Math.sin(mid) * lr;
    ctx.save(); ctx.translate(lx, ly);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 4;
    ctx.font = `700 ${Math.round(S * 0.046)}px 'Space Grotesk',sans-serif`;
    ctx.fillText(String(s.number), 0, showP ? -9 : 0);
    if (showP) {
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.92;
      ctx.font = `600 ${Math.round(S * 0.026)}px 'Instrument Sans',sans-serif`;
      ctx.fillText(s.pct + '%', 0, 15);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });
}

function drawWheel() {
  const c = el.wheelCanvas;
  const ctx = c.getContext('2d');
  const S = c.width, cx = S / 2, cy = S / 2, R = S / 2 - 34;
  ctx.clearRect(0, 0, S, S);
  const segs = getSegments();
  if (!segs.length) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = '#eceae4'; ctx.fill();
    ctx.fillStyle = '#a2a2ab'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(S * 0.03)}px 'Instrument Sans',sans-serif`;
    ctx.fillText(t('noVotesYet'), cx, cy);
    return;
  }
  drawFace(ctx, S, rotation, true);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.lineWidth = 9; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R + 4.5, 0, 2 * Math.PI);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(25,25,34,.08)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.076, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#5a4bd6'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.022, 0, 2 * Math.PI);
  ctx.fillStyle = '#5a4bd6'; ctx.fill();
}

function rattlePointer() {
  el.pointer.style.transform = 'translateX(-50%) rotate(10deg)';
  clearTimeout(pointerTimeout);
  pointerTimeout = setTimeout(() => {
    el.pointer.style.transform = 'translateX(-50%) rotate(0deg)';
  }, 55);
}

function segIndex() {
  const segs = getSegments();
  if (!segs.length) return 0;
  const P = -Math.PI / 2;
  let t = (P - rotation) / (2 * Math.PI);
  t = t - Math.floor(t);
  for (let i = 0; i < segs.length; i++) if (t >= segs[i].f0 && t < segs[i].f1) return i;
  return segs.length - 1;
}

// ---------- audio ----------
function ensureAudio() {
  if (CONFIG.soundOn === false) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function blip(freq, dur, type, vol, slideTo) {
  const a = ensureAudio(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'triangle';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function playClick(vel) {
  const sf = Math.max(0, Math.min(1, vel / 0.44));
  blip(760 + sf * 520, 0.03, 'square', 0.02 + sf * 0.05);
}
function playStart() { blip(170, 0.35, 'sawtooth', 0.05, 520); }
function playThud() { blip(320, 0.5, 'triangle', 0.09, 90); }
function playFanfare() {
  if (CONFIG.soundOn === false) return;
  [[523, 0], [659, 120], [784, 240], [1046, 400]].forEach(([f, d]) =>
    setTimeout(() => blip(f, 0.5, 'triangle', 0.09), d));
  setTimeout(() => blip(1568, 0.6, 'triangle', 0.07), 560);
}

// ---------- spin ----------
function spin() {
  const segs = getSegments();
  if (spinning || segs.length < 2) return;
  playStart();
  const startVel = 0.34 + Math.random() * 0.12;
  const dur = CONFIG.spinDuration || 5;
  const frames = Math.round(dur * 60);
  let vel = startVel;
  const decay = Math.pow(0.0035 / startVel, 1 / frames);
  let frame = 0;
  let lastSeg = segIndex();
  spinning = true;
  updateSpinButton();
  const step = () => {
    frame++;
    vel *= decay;
    rotation += vel;
    drawWheel();
    const s = segIndex();
    if (s !== lastSeg) { lastSeg = s; playClick(vel); rattlePointer(); }
    if (frame < frames && vel > 0.0009) {
      spinRaf = requestAnimationFrame(step);
    } else {
      finishSpin();
    }
  };
  spinRaf = requestAnimationFrame(step);
}

function finishSpin() {
  cancelAnimationFrame(spinRaf);
  const segs = getSegments();
  const idx = segIndex();
  const w = segs[idx] || segs[0];
  playThud();
  spinning = false;
  winner = { number: w.number, label: w.label, votes: w.votes, pct: w.pct, color: w.color };
  updateSpinButton();
  showWinnerFlicker();
  setTimeout(() => {
    if (!winner) return;
    showWinnerCard();
    startConfetti();
    playFanfare();
  }, 1600);
}

// ---------- winner overlay ----------
function fillWinnerCard() {
  if (!winner) return;
  el.winnerBadge.textContent = winner.number;
  el.winnerBadge.style.background = winner.color;
  const text = winner.label || t('answerPlaceholder', winner.number);
  el.winnerLabel.textContent = text;
  el.winnerLabel.dataset.text = text;
  el.winnerMeta.textContent = t('winnerMeta', winner.votes, winner.pct);
}
function showWinnerFlicker() {
  fillWinnerCard();
  el.winnerOverlay.classList.remove('hidden');
  el.winnerCard.classList.add('hidden');
  el.flicker.classList.remove('hidden');
}
function showWinnerCard() {
  el.flicker.classList.add('hidden');
  el.winnerCard.classList.remove('hidden');
}
function closeWinner() {
  cancelAnimationFrame(confettiRaf);
  const c = el.confettiCanvas;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  winner = null;
  el.winnerOverlay.classList.add('hidden');
  el.winnerCard.classList.add('hidden');
  el.flicker.classList.add('hidden');
}
function nochmal() { closeWinner(); setTimeout(spin, 260); }

// ---------- confetti ----------
function startConfetti() {
  const c = el.confettiCanvas;
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const cols = ['#5a4bd6', '#ff2d75', '#23d5ff', '#ffb020', '#28c76f', '#8a7bff'];
  const P = [];
  for (let i = 0; i < 190; i++) P.push({
    x: Math.random() * W, y: Math.random() * -H,
    w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
    vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 5,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    col: cols[i % cols.length]
  });
  const t0 = performance.now();
  const draw = t => {
    ctx.clearRect(0, 0, W, H);
    P.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (t - t0 < 5200 && winner) confettiRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(confettiRaf);
  confettiRaf = requestAnimationFrame(draw);
}

// ---------- editing ----------
function addAnswer() {
  state.answers.push({ id: uid(), label: '' });
  renderAnswers();
  renderDropdown();
  updateCounts();
  drawWheel();
  updateSpinButton();
}
function deleteAnswer(id) {
  state.answers = state.answers.filter(a => a.id !== id);
  state.participants = state.participants.filter(p => p.answerId !== id);
  renderAnswers();
  renderDropdown();
  updateCounts();
  drawWheel();
  updateSpinButton();
}
function effVote() {
  const ids = state.answers.map(a => a.id);
  return ids.includes(state.voteAnswerId) ? state.voteAnswerId : ids[0];
}
function addParticipant() {
  const name = el.nameInput.value.trim();
  const aid = effVote();
  if (!name || !aid) return;
  state.participants.push({ id: uid(), name, answerId: aid });
  el.nameInput.value = '';
  renderVotes();
  updateCounts();
  drawWheel();
  updateSpinButton();
}
function resetVotes() {
  state.participants = [];
  renderVotes();
  updateCounts();
  drawWheel();
  updateSpinButton();
}
function resetAll() {
  cancelAnimationFrame(spinRaf);
  cancelAnimationFrame(confettiRaf);
  spinning = false;
  winner = null;
  rotation = -Math.PI / 2;
  state.question = '';
  state.answers = [];
  state.participants = [];
  state.voteAnswerId = null;
  el.questionInput.value = '';
  el.nameInput.value = '';
  el.winnerOverlay.classList.add('hidden');
  el.winnerCard.classList.add('hidden');
  el.flicker.classList.add('hidden');
  renderAnswers();
  renderDropdown();
  updateCounts();
  updateSpinButton();
  updateQuestionDisplay();
  drawWheel();
}

// ---------- rendering ----------
function renderAnswers() {
  el.answersList.innerHTML = '';
  const n = state.answers.length;
  state.answers.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'answer-row';
    row.dataset.id = a.id;

    const top = document.createElement('div');
    top.className = 'answer-row-top';

    const numberEl = document.createElement('span');
    numberEl.className = 'answer-number';
    numberEl.textContent = i + 1;
    numberEl.style.background = colorFor(i, n);

    const input = document.createElement('input');
    input.className = 'answer-input';
    input.value = a.label;
    input.placeholder = t('answerPlaceholder', i + 1);
    input.addEventListener('input', () => {
      a.label = input.value;
      const opt = el.voteSelect.querySelector(`option[value="${a.id}"]`);
      if (opt) opt.textContent = `${i + 1}. ${a.label || t('answerPlaceholder', i + 1)}`;
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addAnswer(); });

    const votesBadge = document.createElement('span');
    votesBadge.className = 'votes-badge';
    votesBadge.dataset.role = 'votes';

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => deleteAnswer(a.id));

    top.append(numberEl, input, votesBadge, delBtn);

    const votersRow = document.createElement('div');
    votersRow.className = 'voters-row';
    votersRow.dataset.role = 'voters';

    row.append(top, votersRow);
    el.answersList.appendChild(row);
  });
  renderVotes();
}

function renderVotes() {
  const segs = getSegments();
  const votersMap = {};
  state.answers.forEach(a => votersMap[a.id] = []);
  state.participants.forEach(p => { if (votersMap[p.answerId]) votersMap[p.answerId].push(p.name); });

  el.answersList.querySelectorAll('.answer-row').forEach(row => {
    const id = row.dataset.id;
    const seg = segs.find(s => s.id === id);
    row.querySelector('[data-role="votes"]').textContent = seg ? seg.votes : 0;
    const votersRow = row.querySelector('[data-role="voters"]');
    votersRow.innerHTML = '';
    (votersMap[id] || []).forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'voter-chip';
      chip.textContent = name;
      votersRow.appendChild(chip);
    });
  });
}

function renderDropdown() {
  el.voteSelect.innerHTML = '';
  state.answers.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${i + 1}. ${a.label || t('answerPlaceholder', i + 1)}`;
    el.voteSelect.appendChild(opt);
  });
  state.voteAnswerId = effVote();
  if (state.voteAnswerId) el.voteSelect.value = state.voteAnswerId;
}

function updateCounts() {
  el.answersCount.textContent = t('optionsCount', state.answers.length);
  el.participantsCount.textContent = t('votesCount', state.participants.length);
  el.statusLine.textContent = t('statusLine', state.participants.length, state.answers.length);
}

function updateSpinButton() {
  const disabled = getSegments().length < 2 || spinning;
  el.spinBtn.disabled = disabled;
  el.spinBtn.textContent = spinning ? t('spinningBtn') : t('spinBtn');
}

function updateQuestionDisplay() {
  el.questionDisplay.textContent = state.question.trim() || t('questionDisplayPlaceholder');
}

function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(elm => {
    elm.textContent = t(elm.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elm => {
    elm.placeholder = t(elm.dataset.i18nPlaceholder);
  });
  el.langEnBtn.classList.toggle('active', lang === 'en');
  el.langDeBtn.classList.toggle('active', lang === 'de');
}

function setLang(newLang) {
  lang = newLang;
  localStorage.setItem('dyntune_lang', lang);
  applyStaticI18n();
  renderAnswers();
  renderDropdown();
  updateCounts();
  updateSpinButton();
  updateQuestionDisplay();
  drawWheel();
  if (winner) fillWinnerCard();
}

// ---------- wiring ----------
function unlockAudio() {
  const a = ensureAudio();
  if (a && a.state === 'suspended') a.resume();
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, unlockAudio, { passive: true }));

el.questionInput.addEventListener('input', () => {
  state.question = el.questionInput.value;
  updateQuestionDisplay();
});
el.addAnswerBtn.addEventListener('click', addAnswer);
el.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
el.voteSelect.addEventListener('change', () => { state.voteAnswerId = el.voteSelect.value; });
el.addParticipantBtn.addEventListener('click', addParticipant);
el.resetVotesBtn.addEventListener('click', resetVotes);
el.resetAllBtn.addEventListener('click', resetAll);
el.spinBtn.addEventListener('click', spin);
el.closeWinnerBtn.addEventListener('click', closeWinner);
el.againBtn.addEventListener('click', nochmal);
el.langEnBtn.addEventListener('click', () => setLang('en'));
el.langDeBtn.addEventListener('click', () => setLang('de'));

applyStaticI18n();
renderAnswers();
renderDropdown();
updateCounts();
updateSpinButton();
updateQuestionDisplay();
drawWheel();
