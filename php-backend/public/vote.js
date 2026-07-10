const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const API = '../api/';

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

let sessionCode = new URLSearchParams(location.search).get('code') || localStorage.getItem('dyntune_vote_code') || '';
let myAnswerId = null;
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
  codeGate: document.getElementById('codeGate'),
  codeInput: document.getElementById('codeInput'),
  codeContinueBtn: document.getElementById('codeContinueBtn'),
  nameGate: document.getElementById('nameGate'),
  nameInput: document.getElementById('nameInput'),
  nameContinueBtn: document.getElementById('nameContinueBtn'),
  voteArea: document.getElementById('voteArea'),
  questionDisplay: document.getElementById('questionDisplay'),
  optionsList: document.getElementById('optionsList'),
  votedHint: document.getElementById('votedHint'),
  wheelCanvas: document.getElementById('wheelCanvas'),
  pointer: document.getElementById('pointer'),
  winnerOverlay: document.getElementById('winnerOverlay'),
  confettiCanvas: document.getElementById('confettiCanvas'),
  winnerCard: document.getElementById('winnerCard'),
  winnerBadge: document.getElementById('winnerBadge'),
  winnerLabel: document.getElementById('winnerLabel'),
  winnerMeta: document.getElementById('winnerMeta'),
  closeWinnerBtn: document.getElementById('closeWinnerBtn'),
  flicker: document.getElementById('flicker')
};

function apiGet(path) {
  return fetch(`${API}${path}?code=${encodeURIComponent(sessionCode)}`).then(r => r.json());
}
function apiPost(path, body) {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: sessionCode, ...(body || {}) })
  }).then(r => r.json());
}

// ---------- gates: code, then name ----------
async function tryEnterWithCode(code) {
  sessionCode = code.trim().toUpperCase();
  const data = await apiGet('state.php');
  if (data.error) return false;
  localStorage.setItem('dyntune_vote_code', sessionCode);
  el.codeGate.classList.add('hidden');
  const savedName = localStorage.getItem('dyntune_name');
  myAnswerId = localStorage.getItem('dyntune_lastVote_' + sessionCode) || null;
  if (savedName) {
    el.nameInput.value = savedName;
    el.voteArea.classList.remove('hidden');
    applyState(data);
  } else {
    el.nameGate.classList.remove('hidden');
  }
  return true;
}

el.codeInput.addEventListener('input', () => {
  el.codeContinueBtn.disabled = !el.codeInput.value.trim();
});
el.codeInput.addEventListener('keydown', e => { if (e.key === 'Enter' && el.codeInput.value.trim()) el.codeContinueBtn.click(); });
el.codeContinueBtn.addEventListener('click', async () => {
  el.codeContinueBtn.disabled = true;
  el.codeContinueBtn.textContent = 'Prüfe …';
  const ok = await tryEnterWithCode(el.codeInput.value);
  if (!ok) {
    el.codeContinueBtn.disabled = false;
    el.codeContinueBtn.textContent = 'Weiter';
    el.codeInput.style.borderColor = '#e0563f';
    el.codeInput.placeholder = 'Code nicht gefunden - nochmal prüfen';
  }
});

el.nameInput.addEventListener('input', () => {
  el.nameContinueBtn.disabled = !el.nameInput.value.trim();
});
el.nameContinueBtn.addEventListener('click', () => {
  const name = el.nameInput.value.trim();
  if (!name) return;
  localStorage.setItem('dyntune_name', name);
  el.nameGate.classList.add('hidden');
  el.voteArea.classList.remove('hidden');
  poll();
});

(function initGates() {
  if (sessionCode) {
    tryEnterWithCode(sessionCode).then(ok => { if (!ok) { sessionCode = ''; el.codeGate.classList.remove('hidden'); } });
  } else {
    el.codeGate.classList.remove('hidden');
  }
})();

function currentName() {
  return (localStorage.getItem('dyntune_name') || el.nameInput.value || '').trim();
}

function castVote(answerId) {
  const name = currentName();
  if (!name) return;
  myAnswerId = answerId;
  localStorage.setItem('dyntune_lastVote_' + sessionCode, answerId);
  highlightSelection();
  el.votedHint.classList.remove('hidden');
  apiPost('vote.php', { deviceId, name, answerId }).catch(() => {});
}

function highlightSelection() {
  el.optionsList.querySelectorAll('.option-btn').forEach(btn => {
    const isSelected = btn.dataset.id === String(myAnswerId);
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
    label.textContent = a.label || `Antwort ${i + 1}`;

    const check = document.createElement('span');
    check.className = 'option-check';

    btn.append(num, label, check);
    btn.addEventListener('click', () => castVote(a.id));
    el.optionsList.appendChild(btn);
  });
  knownIds = answers.map(a => a.id);
  highlightSelection();
}

function updateOptionLabels(answers) {
  answers.forEach((a, i) => {
    const btn = el.optionsList.querySelector(`.option-btn[data-id="${a.id}"]`);
    if (!btn) return;
    btn.querySelector('.option-number').style.background = colorFor(i, answers.length);
    btn.querySelector('.option-number').textContent = i + 1;
    btn.querySelector('.option-label').textContent = a.label || `Antwort ${i + 1}`;
  });
}

// ---------- wheel drawing ----------
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
    ctx.fillText('Noch keine Stimmen', cx, cy);
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

// ---------- spin ----------
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
el.closeWinnerBtn.addEventListener('click', closeWinner);

// ---------- poll ----------
function applyState(data) {
  if (data.error) return;
  latest = data;
  el.questionDisplay.textContent = (data.question || '').trim() || 'Warte auf die Frage …';

  const idsChanged = knownIds.length !== data.answers.length ||
    data.answers.some((a, i) => a.id !== knownIds[i]);
  if (idsChanged) renderOptions(data.answers);
  else updateOptionLabels(data.answers);

  if (!spinning) drawWheel(data.segments);

  if (displayedRound === null) displayedRound = data.round;
  if (data.round !== displayedRound && !spinning && data.spin) {
    displayedRound = data.round;
    animateSpinTo(data.spin.winner, data.spin.segments);
  }
}

let pollTimer = null;
function poll() {
  if (!sessionCode || el.nameGate.classList.contains('hidden') === false) return;
  apiGet('state.php').then(applyState).catch(() => {});
}
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, 1000);
}
startPolling();
