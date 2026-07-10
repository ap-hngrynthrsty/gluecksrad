const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const API = '../api/';
let sessionCode = localStorage.getItem('dyntune_lead_code');

let latest = { question: '', answers: [], segments: [], participantsCount: 0, round: 0, spin: null };
let displayedRound = null;
let rotation = -Math.PI / 2;
let spinning = false;
let winner = null;
let audioCtx = null;
let confettiRaf = null;
let pointerTimeout = null;
let questionDebounce = null;
let knownAnswerIds = [];

const el = {
  questionInput: document.getElementById('questionInput'),
  questionDisplay: document.getElementById('questionDisplay'),
  answersList: document.getElementById('answersList'),
  answersCount: document.getElementById('answersCount'),
  addAnswerBtn: document.getElementById('addAnswerBtn'),
  participantsCount: document.getElementById('participantsCount'),
  nameInput: document.getElementById('nameInput'),
  voteSelect: document.getElementById('voteSelect'),
  addParticipantBtn: document.getElementById('addParticipantBtn'),
  resetVotesBtn: document.getElementById('resetVotesBtn'),
  resetAllBtn: document.getElementById('resetAllBtn'),
  newSessionBtn: document.getElementById('newSessionBtn'),
  wheelCanvas: document.getElementById('wheelCanvas'),
  pointer: document.getElementById('pointer'),
  spinBtn: document.getElementById('spinBtn'),
  statusLine: document.getElementById('statusLine'),
  codeDisplay: document.getElementById('codeDisplay'),
  joinUrl: document.getElementById('joinUrl'),
  copyLinkBtn: document.getElementById('copyLinkBtn'),
  winnerOverlay: document.getElementById('winnerOverlay'),
  confettiCanvas: document.getElementById('confettiCanvas'),
  winnerCard: document.getElementById('winnerCard'),
  winnerBadge: document.getElementById('winnerBadge'),
  winnerLabel: document.getElementById('winnerLabel'),
  winnerMeta: document.getElementById('winnerMeta'),
  closeWinnerBtn: document.getElementById('closeWinnerBtn'),
  againBtn: document.getElementById('againBtn'),
  flicker: document.getElementById('flicker')
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

// ---------- API ----------
function apiGet(path) {
  return fetch(`${API}${path}?code=${sessionCode}`).then(r => r.json());
}
function apiPost(path, body) {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: sessionCode, ...(body || {}) })
  }).then(r => r.json());
}

async function bootstrapSession() {
  if (sessionCode) {
    const check = await apiGet('state.php');
    if (!check.error) return;
  }
  const created = await fetch(`${API}create-session.php`, { method: 'POST' }).then(r => r.json());
  sessionCode = created.code;
  localStorage.setItem('dyntune_lead_code', sessionCode);
}

// ---------- wheel drawing ----------
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
    ctx.fillText('Noch keine Stimmen', cx, cy);
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

// ---------- spin ----------
function spin() {
  if (spinning || latest.segments.length < 2) return;
  spinning = true;
  updateSpinButton();
  playStart();
  apiPost('spin.php').then(data => {
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
  updateSpinButton();
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
  const text = winner.label || `Antwort ${winner.number}`;
  el.winnerLabel.textContent = text;
  el.winnerLabel.dataset.text = text;
  el.winnerMeta.textContent = `${winner.votes} Stimmen · ${winner.pct}% der Stimmen`;
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

// ---------- answers ----------
function addAnswer() {
  apiPost('answers.php', { action: 'add', label: '' }).then(data => {
    latest = data;
    const i = data.answers.length - 1;
    el.answersList.appendChild(buildAnswerRow(data.answers[i], i, data.answers.length));
    knownAnswerIds = data.answers.map(a => a.id);
    renderVoteSelect();
    refreshNonStructural(data);
  });
}
function deleteAnswer(id) {
  apiPost('answers.php', { action: 'delete', id }).then(data => {
    latest = data;
    const row = el.answersList.querySelector(`.answer-row[data-id="${id}"]`);
    if (row) row.remove();
    data.answers.forEach((a, i) => {
      const r = el.answersList.querySelector(`.answer-row[data-id="${a.id}"]`);
      if (!r) return;
      const numberEl = r.querySelector('.answer-number');
      numberEl.textContent = i + 1;
      numberEl.style.background = colorFor(i, data.answers.length);
      r.querySelector('.answer-input').placeholder = `Antwort ${i + 1}`;
    });
    knownAnswerIds = data.answers.map(a => a.id);
    renderVoteSelect();
    refreshNonStructural(data);
  });
}
function renameAnswer(id, label) {
  apiPost('answers.php', { action: 'rename', id, label }).then(data => {
    latest = data;
    renderVoteSelect();
    refreshNonStructural(data);
  });
}

// ---------- participants ----------
function effVote() {
  const ids = latest.answers.map(a => a.id);
  return ids.includes(Number(el.voteSelect.value)) ? Number(el.voteSelect.value) : (ids[0] || '');
}
function addParticipant() {
  const name = el.nameInput.value.trim();
  const answerId = effVote();
  if (!name || !answerId) return;
  apiPost('participants.php', { action: 'add', name, answerId }).then(data => {
    el.nameInput.value = '';
    latest = data;
    renderAnswersVotes();
    refreshNonStructural(data);
  });
}
function deleteParticipant(id) {
  apiPost('participants.php', { action: 'delete', id }).then(data => {
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
    opt.textContent = `${i + 1}. ${a.label || `Antwort ${i + 1}`}`;
    el.voteSelect.appendChild(opt);
  });
  const ids = latest.answers.map(a => a.id);
  if (ids.includes(Number(prev))) el.voteSelect.value = prev;
}

function resetVotes() { apiPost('reset-votes.php').then(applyState); }
function resetAll() {
  closeWinner();
  rotation = -Math.PI / 2;
  el.questionInput.value = '';
  el.nameInput.value = '';
  apiPost('reset-all.php').then(applyState);
}
async function newSession() {
  closeWinner();
  rotation = -Math.PI / 2;
  const previousCode = sessionCode;
  localStorage.removeItem('dyntune_lead_code');
  const created = await fetch(`${API}create-session.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ previousCode })
  }).then(r => r.json());
  sessionCode = created.code;
  localStorage.setItem('dyntune_lead_code', sessionCode);
  knownAnswerIds = [];
  displayedRound = null;
  updateCodeDisplay();
  poll();
}

// ---------- rendering ----------
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
  input.placeholder = `Antwort ${i + 1}`;
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
  del.title = 'Teilnehmer:in entfernen';
  del.addEventListener('click', () => deleteParticipant(v.id));
  chip.append(name, del);
  return chip;
}

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
  el.spinBtn.textContent = spinning ? 'Dreht …' : 'Drehen';
}

function updateCodeDisplay() {
  el.codeDisplay.textContent = sessionCode || '------';
  const url = `${location.origin}${location.pathname.replace('lead.html', 'vote.html')}?code=${sessionCode}`;
  el.joinUrl.textContent = url;
}

function refreshNonStructural(data) {
  latest = data;
  el.answersCount.textContent = `${data.answers.length} Optionen`;
  el.participantsCount.textContent = `${data.participantsCount} Teilnehmer:innen verbunden`;
  el.statusLine.textContent = `${data.participantsCount} Stimmen · ${data.answers.length} Optionen`;

  if (!questionDebounce && document.activeElement !== el.questionInput) {
    el.questionInput.value = data.question;
  }
  el.questionDisplay.textContent = (data.question || '').trim() || 'Deine Frage erscheint hier';

  if (!spinning) {
    drawWheel(data.segments);
    updateSpinButton();
  }

  if (displayedRound === null) displayedRound = data.round;
  if (data.round !== displayedRound && !spinning && data.spin) {
    displayedRound = data.round;
    winner = data.spin.winner;
    fillWinnerCard();
    el.winnerOverlay.classList.remove('hidden');
    el.flicker.classList.add('hidden');
    el.winnerCard.classList.remove('hidden');
  }
}

function applyState(data) {
  if (data.error) return;
  const idsChanged = knownAnswerIds.length !== data.answers.length ||
    data.answers.some((a, i) => a.id !== knownAnswerIds[i]);
  latest = data;
  if (idsChanged) renderAnswersStructure();
  else renderAnswersVotes();
  refreshNonStructural(data);
}

function poll() {
  apiGet('state.php').then(applyState).catch(() => {});
}

// ---------- wiring ----------
el.questionInput.addEventListener('input', () => {
  clearTimeout(questionDebounce);
  el.questionDisplay.textContent = el.questionInput.value.trim() || 'Deine Frage erscheint hier';
  questionDebounce = setTimeout(() => {
    questionDebounce = null;
    apiPost('question.php', { question: el.questionInput.value });
  }, 400);
});
el.addAnswerBtn.addEventListener('click', addAnswer);
el.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addParticipant(); });
el.addParticipantBtn.addEventListener('click', addParticipant);
el.resetVotesBtn.addEventListener('click', resetVotes);
el.resetAllBtn.addEventListener('click', resetAll);
el.newSessionBtn.addEventListener('click', () => {
  if (confirm('Neue Session starten? Der aktuelle Beitritts-Link wird ungueltig.')) newSession();
});
el.spinBtn.addEventListener('click', spin);
el.closeWinnerBtn.addEventListener('click', closeWinner);
el.againBtn.addEventListener('click', nochmal);
el.copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(el.joinUrl.textContent).then(() => {
    el.copyLinkBtn.textContent = 'Kopiert!';
    setTimeout(() => { el.copyLinkBtn.textContent = 'Kopieren'; }, 1500);
  });
});

(async function init() {
  await bootstrapSession();
  updateCodeDisplay();
  poll();
  setInterval(poll, 1000);
})();
