const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('qrcode');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function uid() { return crypto.randomBytes(4).toString('hex'); }

// Single in-memory session (one Lead, one room) - nothing is persisted to disk.
const session = {
  question: '',
  answers: [],       // { id, label }
  participants: [],  // { id, deviceId (null for leads-added), name, answerId }
  round: 0,
  lastSpin: null,     // { segments, winner } frozen at the moment /api/spin was called
  allowParticipantAnswers: false
};

// Site-wide counters, kept separate from `session` so resetting a round never
// wipes them. There's no per-code "create session" concept here (single
// persistent room), so a Reset is the closest equivalent to "starting fresh".
// Resets to 0 whenever the server process restarts - acceptable for a
// same-WiFi, per-event tool with no database.
const stats = {
  sessionsCreated: 0,
  heartsGiven: 0
};

// Round numbers worth a special "you're the Nth!" celebration on the
// site-wide sessions/hearts counters.
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
function milestoneHit(n) { return MILESTONES.includes(n) ? n : null; }

function voteCounts() {
  const votes = {};
  session.answers.forEach(a => votes[a.id] = 0);
  session.participants.forEach(p => { if (votes[p.answerId] != null) votes[p.answerId]++; });
  return votes;
}

// Only answers with a real vote become a wheel segment - same rule as the standalone app.
function computeSegments() {
  const votes = voteCounts();
  const totalV = session.answers.reduce((s, a) => s + votes[a.id], 0);
  const segs = [];
  if (totalV === 0) return segs;
  let acc = 0;
  session.answers.forEach((a, i) => {
    const v = votes[a.id];
    if (v <= 0) return;
    const f0 = acc / totalV; acc += v; const f1 = acc / totalV;
    segs.push({ id: a.id, number: i + 1, label: a.label, votes: v, pct: Math.round(v / totalV * 100), f0, f1 });
  });
  return segs;
}

function publicState() {
  const votes = voteCounts();
  return {
    question: session.question,
    answers: session.answers.map((a, i) => ({
      id: a.id, number: i + 1, label: a.label, votes: votes[a.id],
      voters: session.participants
        .filter(p => p.answerId === a.id)
        .map(p => ({ id: p.id, name: p.name }))
    })),
    segments: computeSegments(),
    participantsCount: session.participants.length,
    round: session.round,
    spin: session.lastSpin,
    allowParticipantAnswers: session.allowParticipantAnswers
  };
}

function pickWinner() {
  const segs = computeSegments();
  if (segs.length < 2) return null;
  const totalV = segs.reduce((s, x) => s + x.votes, 0);
  let r = Math.random() * totalV;
  for (const s of segs) {
    r -= s.votes;
    if (r <= 0) return s;
  }
  return segs[segs.length - 1];
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/lead.html' : pathname;
  const full = path.join(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/qr' && req.method === 'GET') {
      const link = `http://${getLocalIP()}:${PORT}/vote.html`;
      const dataUrl = await qrcode.toDataURL(link, { margin: 1, width: 320 });
      return sendJSON(res, 200, { url: link, dataUrl });
    }
    if (pathname === '/api/question' && req.method === 'POST') {
      const body = await readJSON(req);
      session.question = String(body.question || '').slice(0, 300);
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/answers' && req.method === 'POST') {
      const body = await readJSON(req);
      const label = String(body.label || '').slice(0, 80);
      session.answers.push({ id: uid(), label });
      return sendJSON(res, 200, publicState());
    }
    const answerMatch = pathname.match(/^\/api\/answers\/([a-f0-9]+)$/);
    if (answerMatch && req.method === 'PATCH') {
      const body = await readJSON(req);
      const a = session.answers.find(x => x.id === answerMatch[1]);
      if (a) a.label = String(body.label || '').slice(0, 80);
      return sendJSON(res, 200, publicState());
    }
    if (answerMatch && req.method === 'DELETE') {
      session.answers = session.answers.filter(a => a.id !== answerMatch[1]);
      session.participants = session.participants.filter(p => p.answerId !== answerMatch[1]);
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/vote' && req.method === 'POST') {
      const body = await readJSON(req);
      const deviceId = String(body.deviceId || '').slice(0, 64);
      const name = String(body.name || '').trim().slice(0, 40);
      const answerId = String(body.answerId || '');
      if (!deviceId || !name || !session.answers.some(a => a.id === answerId)) {
        return sendJSON(res, 400, { error: 'invalid vote' });
      }
      const existing = session.participants.find(p => p.deviceId === deviceId);
      if (existing) { existing.name = name; existing.answerId = answerId; }
      else session.participants.push({ id: uid(), deviceId, name, answerId });
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/participants' && req.method === 'POST') {
      const body = await readJSON(req);
      const name = String(body.name || '').trim().slice(0, 40);
      const answerId = String(body.answerId || '');
      if (!name || !session.answers.some(a => a.id === answerId)) {
        return sendJSON(res, 400, { error: 'invalid participant' });
      }
      session.participants.push({ id: uid(), deviceId: null, name, answerId });
      return sendJSON(res, 200, publicState());
    }
    const participantMatch = pathname.match(/^\/api\/participants\/([a-f0-9]+)$/);
    if (participantMatch && req.method === 'DELETE') {
      session.participants = session.participants.filter(p => p.id !== participantMatch[1]);
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/reset-votes' && req.method === 'POST') {
      session.participants = [];
      session.lastSpin = null;
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/reset-all' && req.method === 'POST') {
      session.question = '';
      session.answers = [];
      session.participants = [];
      session.round = 0;
      session.lastSpin = null;
      session.allowParticipantAnswers = false;
      stats.sessionsCreated++;
      const sessionsMilestone = milestoneHit(stats.sessionsCreated);
      return sendJSON(res, 200, { ...publicState(), sessionsMilestone });
    }
    if (pathname === '/api/stats' && req.method === 'GET') {
      return sendJSON(res, 200, { ...stats, heartsMilestone: null });
    }
    if (pathname === '/api/stats' && req.method === 'POST') {
      const body = await readJSON(req);
      let heartsMilestone = null;
      if (body.action === 'heart') {
        stats.heartsGiven++;
        heartsMilestone = milestoneHit(stats.heartsGiven);
      }
      return sendJSON(res, 200, { ...stats, heartsMilestone });
    }
    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readJSON(req);
      session.allowParticipantAnswers = !!body.allowParticipantAnswers;
      return sendJSON(res, 200, publicState());
    }
    if (pathname === '/api/spin' && req.method === 'POST') {
      const w = pickWinner();
      if (!w) return sendJSON(res, 400, { error: 'not enough votes' });
      session.round++;
      // Every client (lead + all phones) animates towards this same frozen
      // snapshot, so the wheel looks identical everywhere regardless of votes
      // that arrive while the spin animation is still running.
      session.lastSpin = { segments: computeSegments(), winner: w };
      return sendJSON(res, 200, publicState());
    }

    if (req.method === 'GET') return serveStatic(res, pathname);
    res.writeHead(404); res.end();
  } catch (e) {
    sendJSON(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log('\nGluecksrad-Server laeuft!');
  console.log(`  Lead-Ansicht (dieses Geraet): http://localhost:${PORT}/lead.html`);
  console.log(`  Fuer Teilnehmer im selben WLAN: http://${ip}:${PORT}/vote.html\n`);
  qrcode.toString(`http://${ip}:${PORT}/vote.html`, { type: 'terminal', small: true })
    .then(qr => console.log(qr))
    .catch(() => {});
});
