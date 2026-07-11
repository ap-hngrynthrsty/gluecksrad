const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const I18N = {
  en: {
    nameLabel: 'Your name',
    namePlaceholder: 'e.g. Alex',
    continueBtn: 'Continue',
    questionLabel: 'Question',
    questionWaiting: 'Waiting for the question …',
    votedHint: 'Your vote has been counted. You can change it anytime.',
    suggestLabel: 'Suggest your own answer (optional, no name needed)',
    newAnswerPlaceholder: 'Add your own answer',
    winnerLabel: 'Winner',
    closeBtn: 'Close',
    noVotesYet: 'No votes yet',
    supportBtn: '☕ Buy me a coffee',
    supportThanks: 'Thank you!',
    answerPlaceholder: n => `Answer ${n}`,
    votesCount: n => `${n} vote${n === 1 ? '' : 's'}`,
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% of votes`; }
  },
  de: {
    nameLabel: 'Dein Name',
    namePlaceholder: 'z. B. Alex',
    continueBtn: 'Weiter',
    questionLabel: 'Frage',
    questionWaiting: 'Warte auf die Frage …',
    votedHint: 'Deine Stimme wurde gezählt. Du kannst sie jederzeit ändern.',
    suggestLabel: 'Eigene Antwort vorschlagen (optional, kein Name nötig)',
    newAnswerPlaceholder: 'Eigene Antwort hinzufügen',
    winnerLabel: 'Gewinner',
    closeBtn: 'Schließen',
    noVotesYet: 'Noch keine Stimmen',
    supportBtn: '☕ Spendier mir einen Kaffee',
    supportThanks: 'Danke!',
    answerPlaceholder: n => `Antwort ${n}`,
    votesCount: n => `${n} Stimmen`,
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% der Stimmen`; }
  }
};
let lang = localStorage.getItem('dyntune_lang') || 'en';
function t(key, ...args) {
  const dict = I18N[lang];
  const entry = dict[key];
  return typeof entry === 'function' ? entry.apply(dict, args) : entry;
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

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'd' + Math.random().toString(36).slice(2, 11);
}

const deviceId = localStorage.getItem('dyntune_deviceId') || uid();
localStorage.setItem('dyntune_deviceId', deviceId);

let myAnswerId = localStorage.getItem('dyntune_lastVote') || null;
let latest = { question: '', answers: [], segments: [], round: 0, spin: null };
let displayedRound = null;
let knownIds = [];
let rotation = -Math.PI / 2;
let spinning = false;
let winner = null;
let audioCtx = null;
let confettiRaf = null;
let pointerTimeout = null;

const el = {
  nameGate: document.getElementById('nameGate'),
  nameInput: document.getElementById('nameInput'),
  nameContinueBtn: document.getElementById('nameContinueBtn'),
  voteArea: document.getElementById('voteArea'),
  questionDisplay: document.getElementById('questionDisplay'),
  optionsList: document.getElementById('optionsList'),
  votedHint: document.getElementById('votedHint'),
  suggestArea: document.getElementById('suggestArea'),
  newAnswerInput: document.getElementById('newAnswerInput'),
  addAnswerBtn: document.getElementById('addAnswerBtn'),
  wheelCanvas: document.getElementById('wheelCanvas'),
  pointer: document.getElementById('pointer'),
  winnerOverlay: document.getElementById('winnerOverlay'),
  confettiCanvas: document.getElementById('confettiCanvas'),
  winnerCard: document.getElementById('winnerCard'),
  winnerBadge: document.getElementById('winnerBadge'),
  winnerLabel: document.getElementById('winnerLabel'),
  winnerMeta: document.getElementById('winnerMeta'),
  closeWinnerBtn: document.getElementById('closeWinnerBtn'),
  flicker: document.getElementById('flicker'),
  langEnBtn: document.getElementById('langEnBtn'),
  langDeBtn: document.getElementById('langDeBtn'),
  supportBtn: document.getElementById('supportBtn'),
  supportOverlay: document.getElementById('supportOverlay'),
  supportThanks: document.getElementById('supportThanks'),
  supportFlicker: document.getElementById('supportFlicker'),
  heartsCanvas: document.getElementById('heartsCanvas')
};

const savedName = localStorage.getItem('dyntune_name');
if (savedName) {
  el.nameInput.value = savedName;
  el.nameGate.classList.add('hidden');
  el.voteArea.classList.remove('hidden');
}

el.nameInput.addEventListener('input', () => {
  el.nameContinueBtn.disabled = !el.nameInput.value.trim();
});
el.nameContinueBtn.addEventListener('click', () => {
  const name = el.nameInput.value.trim();
  if (!name) return;
  localStorage.setItem('dyntune_name', name);
  el.nameGate.classList.add('hidden');
  el.voteArea.classList.remove('hidden');
});

function currentName() {
  return (localStorage.getItem('dyntune_name') || el.nameInput.value || '').trim();
}

function castVote(answerId) {
  const name = currentName();
  if (!name) return;
  myAnswerId = answerId;
  localStorage.setItem('dyntune_lastVote', answerId);
  highlightSelection();
  el.votedHint.classList.remove('hidden');
  fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, name, answerId })
  }).catch(() => {});
}

function highlightSelection() {
  el.optionsList.querySelectorAll('.option-btn').forEach(btn => {
    const isSelected = btn.dataset.id === myAnswerId;
    btn.classList.toggle('selected', isSelected);
    btn.querySelector('.option-check').textContent = isSelected ? '✓' : '';
  });
}

function renderOptions(answers) {
  el.optionsList.innerHTML = '';
  answers.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.id = a.id;

    const num = document.createElement('span');
    num.className = 'option-number';
    num.style.background = colorFor(i, answers.length);
    num.textContent = i + 1;

    const label = document.createElement('span');
    label.className = 'option-label';
    label.textContent = a.label || t('answerPlaceholder', i + 1);

    const check = document.createElement('span');
    check.className = 'option-check';

    btn.append(num, label, check);
    btn.addEventListener('click', () => castVote(a.id));
    el.optionsList.appendChild(btn);
  });
  knownIds = answers.map(a => a.id);
  highlightSelection();
}

// Structure (renderOptions) is only rebuilt when the id set changes; label
// text edited afterwards on the lead screen must still reach the phone, so
// this runs on every poll to keep already-rendered buttons' text current.
function updateOptionLabels(answers) {
  answers.forEach((a, i) => {
    const btn = el.optionsList.querySelector(`.option-btn[data-id="${a.id}"]`);
    if (!btn) return;
    btn.querySelector('.option-number').style.background = colorFor(i, answers.length);
    btn.querySelector('.option-number').textContent = i + 1;
    btn.querySelector('.option-label').textContent = a.label || t('answerPlaceholder', i + 1);
  });
}

// ---------- wheel drawing (mirrors the lead screen exactly) ----------
function drawFace(ctx, S, rot, segs, n) {
  const cx = S / 2, cy = S / 2, R = S / 2 - 22;
  if (!segs.length) return;
  const showP = CONFIG.showPercent !== false;
  segs.forEach(s => {
    const a0 = rot + s.f0 * 2 * Math.PI;
    const a1 = rot + s.f1 * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
    ctx.fillStyle = colorFor(s.number - 1, n); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    const mid = (a0 + a1) / 2, lr = R * 0.66;
    const lx = cx + Math.cos(mid) * lr, ly = cy + Math.sin(mid) * lr;
    ctx.save(); ctx.translate(lx, ly);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 3;
    ctx.font = `700 ${Math.round(S * 0.05)}px 'Space Grotesk',sans-serif`;
    ctx.fillText(String(s.number), 0, showP ? -8 : 0);
    if (showP) {
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.92;
      ctx.font = `600 ${Math.round(S * 0.03)}px 'Instrument Sans',sans-serif`;
      ctx.fillText(s.pct + '%', 0, 13);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });
}

function drawWheel(segs) {
  const c = el.wheelCanvas;
  const ctx = c.getContext('2d');
  const S = c.width, cx = S / 2, cy = S / 2, R = S / 2 - 22;
  ctx.clearRect(0, 0, S, S);
  if (!segs.length) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = '#eceae4'; ctx.fill();
    ctx.fillStyle = '#a2a2ab'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(S * 0.045)}px 'Instrument Sans',sans-serif`;
    ctx.fillText(t('noVotesYet'), cx, cy);
    return;
  }
  drawFace(ctx, S, rotation, segs, latest.answers.length);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, 2 * Math.PI);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(25,25,34,.08)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.076, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#5a4bd6'; ctx.stroke();
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

function segIndexFor(segs, rot) {
  if (!segs.length) return -1;
  const P = -Math.PI / 2;
  let t = (P - rot) / (2 * Math.PI);
  t = t - Math.floor(t);
  for (let i = 0; i < segs.length; i++) if (t >= segs[i].f0 && t < segs[i].f1) return i;
  return segs.length - 1;
}

// ---------- audio (identical synthesis to the lead screen) ----------
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
  const sf = Math.max(0, Math.min(1, vel));
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
function unlockAudio() {
  const a = ensureAudio();
  if (a && a.state === 'suspended') a.resume();
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, unlockAudio, { passive: true }));

// ---------- confetti ----------
function startConfetti() {
  const c = el.confettiCanvas;
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const cols = ['#5a4bd6', '#ff2d75', '#23d5ff', '#ffb020', '#28c76f', '#8a7bff'];
  const P = [];
  for (let i = 0; i < 160; i++) P.push({
    x: Math.random() * W, y: Math.random() * -H,
    w: 5 + Math.random() * 7, h: 7 + Math.random() * 9,
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
    if (t - t0 < 5200) confettiRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(confettiRaf);
  confettiRaf = requestAnimationFrame(draw);
}

// ---------- spin (the server already decided the winner + frozen segments -
// this device just plays the same animation the lead screen is showing) ----------
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function animateSpinTo(win, segs) {
  spinning = true;
  playStart();
  const idx = segs.findIndex(s => s.id === win.id);
  const seg = segs[idx] || segs[0];
  const mid = (seg.f0 + seg.f1) / 2;
  const P = -Math.PI / 2;
  let target = P - mid * 2 * Math.PI;
  const turns = 4 + Math.floor(Math.random() * 2);
  while (target < rotation + turns * 2 * Math.PI) target += 2 * Math.PI;
  const start = rotation;
  const delta = target - start;
  const duration = (CONFIG.spinDuration || 5) * 1000;
  const t0 = performance.now();
  let lastSeg = segIndexFor(segs, rotation);
  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    rotation = start + delta * easeOutCubic(t);
    drawWheel(segs);
    const s = segIndexFor(segs, rotation);
    if (s !== lastSeg) { lastSeg = s; playClick(1 - t); rattlePointer(); }
    if (t < 1) requestAnimationFrame(step);
    else finishSpin(win);
  }
  requestAnimationFrame(step);
}

function finishSpin(win) {
  playThud();
  spinning = false;
  winner = win;
  showWinnerFlicker();
  setTimeout(() => {
    if (!winner) return;
    showWinnerCard();
    startConfetti();
    playFanfare();
  }, 1600);
}

function fillWinnerCard() {
  if (!winner) return;
  el.winnerBadge.textContent = winner.number;
  el.winnerBadge.style.background = colorFor(winner.number - 1, latest.answers.length);
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
el.closeWinnerBtn.addEventListener('click', closeWinner);

function addOwnAnswer() {
  const label = el.newAnswerInput.value.trim();
  if (!label) return;
  el.newAnswerInput.value = '';
  fetch('/api/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label })
  }).catch(() => {});
}
el.addAnswerBtn.addEventListener('click', addOwnAnswer);
el.newAnswerInput.addEventListener('keydown', e => { if (e.key === 'Enter') addOwnAnswer(); });

// ---------- poll ----------
function poll() {
  fetch('/api/state').then(r => r.json()).then(data => {
    latest = data;
    el.questionDisplay.textContent = (data.question || '').trim() || t('questionWaiting');

    const idsChanged = knownIds.length !== data.answers.length ||
      data.answers.some((a, i) => a.id !== knownIds[i]);
    if (idsChanged) renderOptions(data.answers);
    else updateOptionLabels(data.answers);

    if (!spinning) drawWheel(data.segments);

    el.suggestArea.classList.toggle('hidden', !data.allowParticipantAnswers);

    if (displayedRound === null) displayedRound = data.round;
    if (data.round !== displayedRound && !spinning && data.spin) {
      displayedRound = data.round;
      animateSpinTo(data.spin.winner, data.spin.segments);
    }
  }).catch(() => {});
}

function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(elm => { elm.textContent = t(elm.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elm => { elm.placeholder = t(elm.dataset.i18nPlaceholder); });
  el.langEnBtn.classList.toggle('active', lang === 'en');
  el.langDeBtn.classList.toggle('active', lang === 'de');
}
function setLang(newLang) {
  lang = newLang;
  localStorage.setItem('dyntune_lang', lang);
  applyStaticI18n();
  el.questionDisplay.textContent = (latest.question || '').trim() || t('questionWaiting');
  renderOptions(latest.answers);
  if (!spinning) drawWheel(latest.segments);
  if (winner) fillWinnerCard();
}
el.langEnBtn.addEventListener('click', () => setLang('en'));
el.langDeBtn.addEventListener('click', () => setLang('de'));

// ---------- support / donate celebration ----------
let heartsRaf = null;
function startHearts() {
  const c = el.heartsCanvas;
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const P = [];
  for (let i = 0; i < 500; i++) P.push({
    x: Math.random() * W, y: H + Math.random() * H,
    size: 12 + Math.random() * 16,
    vx: (Math.random() - 0.5) * 2.5, vy: -(2 + Math.random() * 5),
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2
  });
  const t0 = performance.now();
  const draw = t => {
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    P.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.015; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.font = `${p.size}px sans-serif`;
      ctx.fillText('❤️', 0, 0);
      ctx.restore();
    });
    if (t - t0 < 4500) heartsRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(heartsRaf);
  heartsRaf = requestAnimationFrame(draw);
}
function celebrateSupport() {
  window.open('https://ko-fi.com/niludu', '_blank', 'noopener');

  document.body.classList.add('support-shake');
  setTimeout(() => document.body.classList.remove('support-shake'), 1600);

  el.supportFlicker.classList.remove('hidden');
  setTimeout(() => el.supportFlicker.classList.add('hidden'), 1600);

  const text = t('supportThanks');
  el.supportThanks.textContent = text;
  el.supportThanks.dataset.text = text;
  el.supportOverlay.classList.remove('hidden');
  startHearts();
  setTimeout(() => el.supportOverlay.classList.add('hidden'), 4500);
}
el.supportBtn.addEventListener('click', celebrateSupport);

applyStaticI18n();
poll();
setInterval(poll, 1000);
