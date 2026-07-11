const CONFIG = {
  paletteScheme: 'Warm', // 'Kühl' | 'Warm' | 'Regenbogen'
  showPercent: true,
  soundOn: true,
  spinDuration: 9.5
};

const I18N = {
  en: {
    nameLabel: 'Your name (optional)',
    anonymousName: 'Anonymous',
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
    sessionsLabel: 'sessions',
    milestoneSession: n => `🎉 Congratulations - you just started session #${n}!`,
    milestoneHeart: n => `🎉 You just gave heart #${n} - thank you!`,
    tipThanks: name => `${name} just bought me a coffee - thank you!`,
    supportPromptNext: n => `Make it #${n}?`,
    anonymousTipper: 'Someone',
    answerPlaceholder: n => `Answer ${n}`,
    votesCount: n => `${n} vote${n === 1 ? '' : 's'}`,
    winnerMeta(v, p) { return `${this.votesCount(v)} · ${p}% of votes`; }
  },
  de: {
    nameLabel: 'Dein Name (optional)',
    anonymousName: 'Anonym',
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
    sessionsLabel: 'Sessions',
    milestoneSession: n => `🎉 Herzlichen Glückwunsch - du hast gerade Session Nr. ${n} gestartet!`,
    milestoneHeart: n => `🎉 Du hast gerade Herz Nr. ${n} verschenkt - danke!`,
    tipThanks: name => `${name} hat mir gerade einen Kaffee ausgegeben - danke!`,
    supportPromptNext: n => `Kaffee Nr. ${n} gefällig?`,
    anonymousTipper: 'Jemand',
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
let displayedTipRound = null;
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
  supportPrompt: document.getElementById('supportPrompt'),
  supportBtnWrap: document.querySelector('.support-btn-wrap'),
  heartsCanvas: document.getElementById('heartsCanvas'),
  page: document.querySelector('.page'),
  likeBtn: document.getElementById('likeBtn'),
  heartsCount: document.getElementById('heartsCount'),
  sessionsCount: document.getElementById('sessionsCount'),
  milestoneOverlay: document.getElementById('milestoneOverlay'),
  milestoneConfetti: document.getElementById('milestoneConfetti'),
  milestoneText: document.getElementById('milestoneText')
};

const savedName = localStorage.getItem('dyntune_name');
if (savedName) {
  el.nameInput.value = savedName;
  el.nameGate.classList.add('hidden');
  el.voteArea.classList.remove('hidden');
}

el.nameContinueBtn.addEventListener('click', () => {
  const name = el.nameInput.value.trim() || t('anonymousName');
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

// ---------- compact number display (1.2K/3.4M, like social media counters) ----------
// Tied to the app's own language toggle (not the browser locale), same as
// every other piece of text on the page.
const compactFmtEn = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const compactFmtDe = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
function formatCount(n) { return (lang === 'de' ? compactFmtDe : compactFmtEn).format(n); }

// ---------- vibration (Android only - iOS Safari has no Vibration API) ----------
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
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

    // Broadcasts the tip celebration to every connected device (lead + all
    // participants), the same way spins are synced - and also to the
    // tipping device itself on its next poll, so it still shows up even if
    // that person only comes back from the ko-fi tab much later.
    if (displayedTipRound === null) displayedTipRound = data.tipRound;
    if (data.tipRound !== displayedTipRound) {
      displayedTipRound = data.tipRound;
      if (data.tipRound > 0) celebrateSupport(data.lastTipperName, data.tipCount);
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
  pollStats();
}
el.langEnBtn.addEventListener('click', () => setLang('en'));
el.langDeBtn.addEventListener('click', () => setLang('de'));

// ---------- support / donate celebration ----------
let heartsRaf = null;
let heartSprite = null;
const HEART_PATH = 'M23.6 0c-3.4 0-6.3 2-7.6 4.9C14.7 2 11.8 0 8.4 0 3.8 0 0 3.8 0 8.4c0 9.4 15.4 16.8 16 17.1.6-.3 16-7.7 16-17.1C32 3.8 28.2 0 23.6 0z';
function getHeartSprite() {
  if (heartSprite) return heartSprite;
  const size = 64;
  const off = document.createElement('canvas');
  off.width = off.height = size;
  const octx = off.getContext('2d');
  const scale = size / 32;
  octx.save();
  octx.translate(0, (size - 29 * scale) / 2);
  octx.scale(scale, scale);
  const grad = octx.createLinearGradient(0, 0, 0, 29);
  grad.addColorStop(0, '#ff8a3d');
  grad.addColorStop(1, '#ff2145');
  octx.fillStyle = grad;
  octx.fill(new Path2D(HEART_PATH));
  octx.restore();
  heartSprite = off;
  return heartSprite;
}
function startHearts() {
  const c = el.heartsCanvas;
  const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  const sprite = getHeartSprite();
  const P = [];
  for (let i = 0; i < 90; i++) P.push({
    x: Math.random() * W, y: H + Math.random() * H,
    size: 18 + Math.random() * 22,
    vx: (Math.random() - 0.5) * 2.5, vy: -(2 + Math.random() * 5),
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2
  });
  const t0 = performance.now();
  const draw = t => {
    ctx.clearRect(0, 0, W, H);
    P.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.015; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
    if (t - t0 < 7700) heartsRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(heartsRaf);
  heartsRaf = requestAnimationFrame(draw);
}
// Triggered by the tip-round check in poll() - i.e. by the *server*
// confirming a tip happened, not directly by the click. That way every
// connected device (lead + all participants) shows the same celebration,
// including the tipping device itself on its next poll, no matter how
// long it spent away on the ko-fi tab.
function celebrateSupport(name, count) {
  vibrate([30, 40, 30, 40, 30, 40, 200]);

  el.page.classList.add('support-shake');
  setTimeout(() => el.page.classList.remove('support-shake'), 7700);

  el.supportFlicker.classList.remove('hidden');
  setTimeout(() => el.supportFlicker.classList.add('hidden'), 1600);

  const text = t('tipThanks', name || t('anonymousTipper'));
  el.supportThanks.textContent = text;
  el.supportThanks.dataset.text = text;
  el.supportOverlay.classList.remove('hidden');
  startHearts();

  // Move the button (with its glow + prompt) into the celebration overlay
  // itself for the duration: it's a sibling of .page, not a descendant, so
  // it never shook, but the dark backdrop (a higher z-index) was covering
  // it in its usual spot. Inside the overlay it sits calmly below the
  // thank-you text and stays on top of the backdrop.
  el.supportOverlay.appendChild(el.supportBtnWrap);
  setTimeout(() => {
    el.supportOverlay.classList.add('hidden');
    el.supportOverlay.parentNode.insertBefore(el.supportBtnWrap, el.supportOverlay);
  }, 7700);

  // Glowing button + "want to make it the next one?" prompt, inviting
  // whoever's watching (on any device) to tip again.
  el.supportBtn.classList.add('glow');
  const promptText = t('supportPromptNext', count + 1);
  el.supportPrompt.textContent = promptText;
  el.supportPrompt.classList.remove('hidden');
  setTimeout(() => {
    el.supportBtn.classList.remove('glow');
    el.supportPrompt.classList.add('hidden');
  }, 7700);
}
el.supportBtn.addEventListener('click', () => {
  fetch('/api/tip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: currentName() || t('anonymousTipper') })
  }).catch(() => {});

  // Open ko-fi last, and slightly deferred: on many mobile browsers
  // window.open() immediately backgrounds this tab, which throttles
  // requestAnimationFrame and can make the celebration (triggered by the
  // next poll, above) appear to start very late. Queuing it after a
  // frame lets that poll fire and the celebration start painting first.
  setTimeout(() => window.open('https://ko-fi.com/niludu', '_blank', 'noopener'), 60);
});

// A backgrounded tab throttles the poll interval, so returning from the
// ko-fi tab could otherwise leave the celebration looking "missed" for a
// while - force an immediate poll the moment this tab is visible again.
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

applyStaticI18n();
poll();
setInterval(poll, 1000);

// ---------- double-tap "like" heart anywhere on screen ----------
let heartSvgCounter = 0;
function spawnLikeHeart(x, y) {
  const h = document.createElement("div");
  h.className = "like-heart";
  const gid = "heartGrad" + (heartSvgCounter++);
  h.innerHTML = `<svg viewBox="0 0 32 29" width="100%" height="100%"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff2145"/></linearGradient></defs><path fill="url(#${gid})" d="M23.6 0c-3.4 0-6.3 2-7.6 4.9C14.7 2 11.8 0 8.4 0 3.8 0 0 3.8 0 8.4c0 9.4 15.4 16.8 16 17.1.6-.3 16-7.7 16-17.1C32 3.8 28.2 0 23.6 0z"/></svg>`;
  h.style.left = x + "px";
  h.style.top = y + "px";
  document.body.appendChild(h);
  h.addEventListener("animationend", () => h.remove());
}
let lastTapAt = 0, lastTapX = 0, lastTapY = 0;
document.addEventListener("pointerup", e => {
  // Rapidly clicking a real button (e.g. the like button) also fires
  // pointerup twice in a row - don't treat that as the double-tap-anywhere
  // gesture, or every fast double-click on any control would spawn a
  // heart and double-count it in the counter.
  if (e.target.closest && e.target.closest("button, a, input, select, textarea, label")) return;
  const now = Date.now();
  const isDouble = now - lastTapAt < 350 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 60;
  if (isDouble) {
    spawnLikeHeart(e.clientX, e.clientY);
    vibrate(18);
    bumpHeartsCounter();
    lastTapAt = 0;
  } else {
    lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }
});


// ---------- global site-wide stats (sessions started + hearts given) ----------
let milestoneConfettiRaf = null;
function startMilestoneConfetti() {
  const c = el.milestoneConfetti;
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
    if (t - t0 < 5200) milestoneConfettiRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  };
  cancelAnimationFrame(milestoneConfettiRaf);
  milestoneConfettiRaf = requestAnimationFrame(draw);
}
// Only the one request whose increment actually crosses a milestone gets this
// flag from the server, so only that specific visitor sees the celebration -
// not everyone who happens to be polling at the time.
function celebrateMilestone(n, kind) {
  const num = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US').format(n);
  const text = kind === 'session' ? t('milestoneSession', num) : t('milestoneHeart', num);
  el.milestoneText.textContent = text;
  el.milestoneText.dataset.text = text;
  el.milestoneOverlay.classList.remove('hidden');
  startMilestoneConfetti();
  playFanfare();
  vibrate([40, 30, 40, 30, 160]);
  setTimeout(() => el.milestoneOverlay.classList.add('hidden'), 5500);
}

function pollStats() {
  fetch('/api/stats').then(r => r.json()).then(data => {
    el.heartsCount.textContent = formatCount(data.heartsGiven);
    el.heartsCount.title = data.heartsGiven;
    el.sessionsCount.textContent = formatCount(data.sessionsCreated);
    el.sessionsCount.title = data.sessionsCreated;
  }).catch(() => {});
}
function bumpHeartsCounter() {
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'heart' })
  }).then(r => r.json()).then(data => {
    el.heartsCount.textContent = formatCount(data.heartsGiven);
    el.heartsCount.title = data.heartsGiven;
    if (data.heartsMilestone) celebrateMilestone(data.heartsMilestone, 'heart');
  }).catch(() => {});
}
el.likeBtn.addEventListener('click', () => {
  const r = el.likeBtn.getBoundingClientRect();
  spawnLikeHeart(r.left + r.width / 2, r.top + r.height / 2);
  vibrate(15);
  bumpHeartsCounter();
});
pollStats();
setInterval(pollStats, 5000);
