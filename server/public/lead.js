const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const I18N = {
  en: {
    leadSubtitle: 'lead view',
    resetVotesBtn: 'Reset votes',
    resetAllBtn: 'Reset',
    questionLabel: 'Question',
    questionPlaceholder: 'Which question should be voted on?',
    answersLabel: 'Answers',
    addAnswerBtn: '+ Add answer',
    allowAnswersLabel: 'Participants can add answers',
    participantsLabel: 'Participants',
    namePlaceholder: 'Name',
    addParticipantBtn: 'Add',
    participantHintLead: 'For people without their own device. Anyone joining via QR code appears here automatically and can be removed with ×.',
    joinLabel: 'Join',
    qrHint: 'Scan on the same WiFi, or open the link:',
    questionEyebrow: 'Question',
    questionDisplayPlaceholder: 'Your question will appear here',
    spinBtn: 'Spin',
    spinningBtn: 'Spinning …',
    winnerLabel: 'Winner',
    closeBtn: 'Close',
    spinAgainBtn: 'Spin again',
    noVotesYet: 'No votes yet',
    removeParticipantTitle: 'Remove participant',
    supportBtn: '☕ Buy me a coffee',
    supportThanks: 'Thank you!',
    answerPlaceholder: n => `Answer ${n}`,
    optionsCount: n => `${n} option${n === 1 ? '' : 's'}`,
    votesCount: n => `${n} vote${n === 1 ? '' : 's'}`,
    participantsConnected: n => `${n} participant${n === 1 ? '' : 's'} connected`,
    statusLine(v, o) { return `${this.votesCount(v)} · ${this.optionsCount(o)}`; },
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% of votes`; }
  },
  de: {
    leadSubtitle: 'Lead-Ansicht',
    resetVotesBtn: 'Stimmen zurücksetzen',
    resetAllBtn: 'Zurücksetzen',
    questionLabel: 'Frage',
    questionPlaceholder: 'Welche Frage soll abgestimmt werden?',
    answersLabel: 'Antworten',
    addAnswerBtn: '+ Antwort hinzufügen',
    allowAnswersLabel: 'Teilnehmer:innen dürfen Antworten hinzufügen',
    participantsLabel: 'Teilnehmer',
    namePlaceholder: 'Name der Person',
    addParticipantBtn: 'Eintragen',
    participantHintLead: 'Für Personen ohne eigenes Gerät. Wer selbst per QR-Code beitritt, erscheint hier automatisch und lässt sich per × wieder entfernen.',
    joinLabel: 'Beitreten',
    qrHint: 'Im selben WLAN scannen, oder Link öffnen:',
    questionEyebrow: 'Frage',
    questionDisplayPlaceholder: 'Deine Frage erscheint hier',
    spinBtn: 'Drehen',
    spinningBtn: 'Dreht …',
    winnerLabel: 'Gewinner',
    closeBtn: 'Schließen',
    spinAgainBtn: 'Nochmal drehen',
    noVotesYet: 'Noch keine Stimmen',
    removeParticipantTitle: 'Teilnehmer:in entfernen',
    supportBtn: '☕ Spendier mir einen Kaffee',
    supportThanks: 'Danke!',
    answerPlaceholder: n => `Antwort ${n}`,
    optionsCount: n => `${n} Optionen`,
    votesCount: n => `${n} Stimmen`,
    participantsConnected: n => `${n} Teilnehmer:innen verbunden`,
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

let latest = { question: '', answers: [], segments: [], participantsCount: 0, round: 0, spin: null };
let displayedRound = null;
let rotation = -Math.PI / 2;
let spinning = false;
let winner = null;
let audioCtx = null;
let confettiRaf = null;
let pointerTimeout = null;
let questionDebounce = null;

const el = {
  questionInput: document.getElementById('questionInput'),
  questionDisplay: document.getElementById('questionDisplay'),
  answersList: document.getElementById('answersList'),
  answersCount: document.getElementById('answersCount'),
  addAnswerBtn: document.getElementById('addAnswerBtn'),
  allowAnswersToggle: document.getElementById('allowAnswersToggle'),
  participantsCount: document.getElementById('participantsCount'),
  nameInput: document.getElementById('nameInput'),
  voteSelect: document.getElementById('voteSelect'),
  addParticipantBtn: document.getElementById('addParticipantBtn'),
  resetVotesBtn: document.getElementById('resetVotesBtn'),
  resetAllBtn: document.getElementById('resetAllBtn'),
  wheelCanvas: document.getElementById('wheelCanvas'),
  pointer: document.getElementById('pointer'),
  spinBtn: document.getElementById('spinBtn'),
  statusLine: document.getElementById('statusLine'),
  qrImg: document.getElementById('qrImg'),
  joinUrl: document.getElementById('joinUrl'),
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
  langDeBtn: document.getElementById('langDeBtn'),
  supportBtn: document.getElementById('supportBtn'),
  supportOverlay: document.getElementById('supportOverlay'),
  supportThanks: document.getElementById('supportThanks'),
  supportFlicker: document.getElementById('supportFlicker'),
  heartsCanvas: document.getElementById('heartsCanvas')
};

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

// ---------- wheel drawing (segments come from the server, not computed locally) ----------
function drawFace(ctx, S, rot, segs, drawLabels) {
  const cx = S / 2, cy = S / 2, R = S / 2 - 34;
  if (!segs.length) return;
  const showP = CONFIG.showPercent !== false;
  const n = latest.answers.length;
  segs.forEach(s => {
    const a0 = rot + s.f0 * 2 * Math.PI;
    const a1 = rot + s.f1 * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
    ctx.fillStyle = colorFor(s.number - 1, n); ctx.fill();
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

function drawWheel(segs) {
  const c = el.wheelCanvas;
  const ctx = c.getContext('2d');
  const S = c.width, cx = S / 2, cy = S / 2, R = S / 2 - 34;
  ctx.clearRect(0, 0, S, S);
  if (!segs.length) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = '#eceae4'; ctx.fill();
    ctx.fillStyle = '#a2a2ab'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(S * 0.03)}px 'Instrument Sans',sans-serif`;
    ctx.fillText(t('noVotesYet'), cx, cy);
    return;
  }
  drawFace(ctx, S, rotation, segs, true);
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

function segIndexFor(segs, rot) {
  if (!segs.length) return -1;
  const P = -Math.PI / 2;
  let t = (P - rot) / (2 * Math.PI);
  t = t - Math.floor(t);
  for (let i = 0; i < segs.length; i++) if (t >= segs[i].f0 && t < segs[i].f1) return i;
  return segs.length - 1;
}

// ---------- vibration (Android only - iOS Safari has no Vibration API) ----------
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
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
    if (t - t0 < 5200) confettiRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(confettiRaf);
  confettiRaf = requestAnimationFrame(draw);
}

// ---------- spin (server decides the winner + frozen segments, the client only animates) ----------
function spin() {
  if (spinning || latest.segments.length < 2) return;
  spinning = true;
  updateSpinButton();
  playStart();
  fetch('/api/spin', { method: 'POST' }).then(r => r.json()).then(data => {
    if (data.error || !data.spin) { spinning = false; updateSpinButton(); return; }
    displayedRound = data.round;
    animateSpinTo(data.spin.winner, data.spin.segments);
  }).catch(() => { spinning = false; updateSpinButton(); });
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function animateSpinTo(win, segs) {
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
    if (s !== lastSeg) { lastSeg = s; playClick(1 - t); rattlePointer(); vibrate(12); }
    if (t < 1) requestAnimationFrame(step);
    else finishSpin(win);
  }
  requestAnimationFrame(step);
}

function finishSpin(win) {
  playThud();
  spinning = false;
  winner = win;
  updateSpinButton();
  showWinnerFlicker();
  setTimeout(() => {
    if (!winner) return;
    showWinnerCard();
    startConfetti();
    playFanfare();
    vibrate([40, 30, 40, 30, 160]);
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
function nochmal() { closeWinner(); setTimeout(spin, 260); }

// ---------- API helpers ----------
function api(method, path, body) {
  return fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());
}

// Answer add/delete/rename update the DOM incrementally instead of going through
// the generic poll-driven rebuild, so an unsaved edit in another row is never wiped.
function addAnswer() {
  api('POST', '/api/answers', { label: '' }).then(data => {
    latest = data;
    const i = data.answers.length - 1;
    el.answersList.appendChild(buildAnswerRow(data.answers[i], i, data.answers.length));
    knownAnswerIds = data.answers.map(a => a.id);
    renderVoteSelect();
    refreshNonStructural(data);
  });
}
function deleteAnswer(id) {
  api('DELETE', `/api/answers/${id}`).then(data => {
    latest = data;
    const row = el.answersList.querySelector(`.answer-row[data-id="${id}"]`);
    if (row) row.remove();
    data.answers.forEach((a, i) => {
      const r = el.answersList.querySelector(`.answer-row[data-id="${a.id}"]`);
      if (!r) return;
      const numberEl = r.querySelector('.answer-number');
      numberEl.textContent = i + 1;
      numberEl.style.background = colorFor(i, data.answers.length);
      r.querySelector('.answer-input').placeholder = t('answerPlaceholder', i + 1);
    });
    knownAnswerIds = data.answers.map(a => a.id);
    renderVoteSelect();
    refreshNonStructural(data);
  });
}
function renameAnswer(id, label) {
  api('PATCH', `/api/answers/${id}`, { label }).then(data => {
    latest = data;
    renderVoteSelect();
    refreshNonStructural(data);
  });
}
function effVote() {
  const ids = latest.answers.map(a => a.id);
  return ids.includes(el.voteSelect.value) ? el.voteSelect.value : (ids[0] || '');
}
function addParticipant() {
  const name = el.nameInput.value.trim();
  const answerId = effVote();
  if (!name || !answerId) return;
  el.nameInput.value = '';
  api('POST', '/api/participants', { name, answerId }).then(data => {
    latest = data;
    renderAnswersVotes();
    refreshNonStructural(data);
  });
}
function deleteParticipant(id) {
  api('DELETE', `/api/participants/${id}`).then(data => {
    latest = data;
    renderAnswersVotes();
    refreshNonStructural(data);
  });
}
function renderVoteSelect() {
  const prev = el.voteSelect.value;
  el.voteSelect.innerHTML = '';
  latest.answers.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${i + 1}. ${a.label || t('answerPlaceholder', i + 1)}`;
    el.voteSelect.appendChild(opt);
  });
  const ids = latest.answers.map(a => a.id);
  if (ids.includes(prev)) el.voteSelect.value = prev;
}
function resetVotes() { api('POST', '/api/reset-votes').then(applyState); }
function resetAll() {
  closeWinner();
  rotation = -Math.PI / 2;
  el.questionInput.value = '';
  el.nameInput.value = '';
  api('POST', '/api/reset-all').then(applyState);
}

// ---------- rendering ----------
let knownAnswerIds = [];

function buildAnswerRow(a, i, n) {
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
  input.addEventListener('change', () => renameAnswer(a.id, input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });

  const votesBadge = document.createElement('span');
  votesBadge.className = 'votes-badge';
  votesBadge.dataset.role = 'votes';
  votesBadge.textContent = a.votes;

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-btn';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => deleteAnswer(a.id));

  top.append(numberEl, input, votesBadge, delBtn);

  const votersRow = document.createElement('div');
  votersRow.className = 'voters-row';
  votersRow.dataset.role = 'voters';
  (a.voters || []).forEach(v => votersRow.appendChild(buildVoterChip(v)));

  row.append(top, votersRow);
  return row;
}

function buildVoterChip(v) {
  const chip = document.createElement('span');
  chip.className = 'voter-chip';
  const name = document.createElement('span');
  name.textContent = v.name;
  const del = document.createElement('button');
  del.className = 'voter-chip-remove';
  del.textContent = '×';
  del.title = t('removeParticipantTitle');
  del.addEventListener('click', () => deleteParticipant(v.id));
  chip.append(name, del);
  return chip;
}

// Fallback full rebuild - only hit if the answer set changed through some path
// other than this tab's own add/delete/rename (e.g. a second lead tab).
function renderAnswersStructure() {
  el.answersList.innerHTML = '';
  latest.answers.forEach((a, i) => {
    el.answersList.appendChild(buildAnswerRow(a, i, latest.answers.length));
  });
  knownAnswerIds = latest.answers.map(a => a.id);
  renderVoteSelect();
}

function renderAnswersVotes() {
  latest.answers.forEach(a => {
    const row = el.answersList.querySelector(`.answer-row[data-id="${a.id}"]`);
    if (!row) return;
    row.querySelector('[data-role="votes"]').textContent = a.votes;
    const votersRow = row.querySelector('[data-role="voters"]');
    votersRow.innerHTML = '';
    (a.voters || []).forEach(v => votersRow.appendChild(buildVoterChip(v)));
  });
}

function updateSpinButton() {
  const disabled = latest.segments.length < 2 || spinning;
  el.spinBtn.disabled = disabled;
  el.spinBtn.textContent = spinning ? t('spinningBtn') : t('spinBtn');
}

// Everything that isn't the answers-list DOM structure: counts, question,
// wheel and winner detection. Shared by the poll loop and the answer actions.
function refreshNonStructural(data) {
  latest = data;
  el.answersCount.textContent = t('optionsCount', data.answers.length);
  el.participantsCount.textContent = t('participantsConnected', data.participantsCount);
  el.statusLine.textContent = t('statusLine', data.participantsCount, data.answers.length);

  if (!questionDebounce && document.activeElement !== el.questionInput) {
    el.questionInput.value = data.question;
  }
  el.questionDisplay.textContent = (data.question || '').trim() || t('questionDisplayPlaceholder');

  if (!spinning) {
    drawWheel(data.segments);
    updateSpinButton();
  }

  if (document.activeElement !== el.allowAnswersToggle) {
    el.allowAnswersToggle.checked = !!data.allowParticipantAnswers;
  }

  if (displayedRound === null) displayedRound = data.round;
  if (data.round !== displayedRound && !spinning && data.spin) {
    displayedRound = data.round;
    winner = data.spin.winner;
    vibrate([40, 30, 40, 30, 160]);
    fillWinnerCard();
    el.winnerOverlay.classList.remove('hidden');
    el.flicker.classList.add('hidden');
    el.winnerCard.classList.remove('hidden');
  }
}

function applyState(data) {
  const idsChanged = knownAnswerIds.length !== data.answers.length ||
    data.answers.some((a, i) => a.id !== knownAnswerIds[i]);
  latest = data;
  // Rebuilding the answers list (voter chips grow/shrink it) while the name
  // field has focus shifts everything below it right as a phone's on-screen
  // keyboard is open - the "Add" button can move out from under a tap
  // mid-interaction. Defer the rebuild until focus leaves that field.
  if (document.activeElement !== el.nameInput) {
    if (idsChanged) renderAnswersStructure();
    else renderAnswersVotes();
  }
  refreshNonStructural(data);
}

function poll() {
  api('GET', '/api/state').then(applyState).catch(() => {});
}

// ---------- wiring ----------
el.questionInput.addEventListener('input', () => {
  clearTimeout(questionDebounce);
  el.questionDisplay.textContent = el.questionInput.value.trim() || t('questionDisplayPlaceholder');
  questionDebounce = setTimeout(() => {
    questionDebounce = null;
    api('POST', '/api/question', { question: el.questionInput.value });
  }, 400);
});
el.addAnswerBtn.addEventListener('click', addAnswer);
el.allowAnswersToggle.addEventListener('change', () => {
  api('POST', '/api/settings', { allowParticipantAnswers: el.allowAnswersToggle.checked }).then(data => {
    latest = data;
  });
});
el.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
el.addParticipantBtn.addEventListener('click', addParticipant);
el.resetVotesBtn.addEventListener('click', resetVotes);
el.resetAllBtn.addEventListener('click', resetAll);
el.spinBtn.addEventListener('click', spin);
el.closeWinnerBtn.addEventListener('click', closeWinner);
el.againBtn.addEventListener('click', nochmal);

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
  renderAnswersStructure();
  refreshNonStructural(latest);
  if (winner) fillWinnerCard();
}
el.langEnBtn.addEventListener('click', () => setLang('en'));
el.langDeBtn.addEventListener('click', () => setLang('de'));

fetch('/api/qr').then(r => r.json()).then(data => {
  el.qrImg.src = data.dataUrl;
  el.joinUrl.textContent = data.url;
});

// ---------- support / donate celebration ----------
let heartsRaf = null;
function startHearts() {
  const c = el.heartsCanvas;
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const P = [];
  for (let i = 0; i < 700; i++) P.push({
    x: Math.random() * W, y: H + Math.random() * H,
    size: 14 + Math.random() * 20,
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
    if (t - t0 < 18000) heartsRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(heartsRaf);
  heartsRaf = requestAnimationFrame(draw);
}
function celebrateSupport() {
  window.open('https://ko-fi.com/niludu', '_blank', 'noopener');
  vibrate([30, 40, 30, 40, 30, 40, 200]);

  document.body.classList.add('support-shake');
  setTimeout(() => document.body.classList.remove('support-shake'), 10000);

  el.supportFlicker.classList.remove('hidden');
  setTimeout(() => el.supportFlicker.classList.add('hidden'), 1600);

  const text = t('supportThanks');
  el.supportThanks.textContent = text;
  el.supportThanks.dataset.text = text;
  el.supportOverlay.classList.remove('hidden');
  startHearts();
  setTimeout(() => el.supportOverlay.classList.add('hidden'), 18000);
}
el.supportBtn.addEventListener('click', celebrateSupport);

applyStaticI18n();
poll();
setInterval(poll, 1000);

// ---------- double-tap "like" heart anywhere on screen ----------
function spawnLikeHeart(x, y) {
  const h = document.createElement("div");
  h.className = "like-heart";
  h.textContent = "❤️";
  h.style.left = x + "px";
  h.style.top = y + "px";
  document.body.appendChild(h);
  h.addEventListener("animationend", () => h.remove());
}
let lastTapAt = 0, lastTapX = 0, lastTapY = 0;
document.addEventListener("pointerup", e => {
  const now = Date.now();
  const isDouble = now - lastTapAt < 350 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 60;
  if (isDouble) {
    spawnLikeHeart(e.clientX, e.clientY);
    vibrate(18);
    lastTapAt = 0;
  } else {
    lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }
});
