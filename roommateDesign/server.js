// Roommate Design server: one live session in memory, SSE for live updates,
// JSON files on disk for backup and saved sessions. See ARCHITECTURE.md.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const sim = require('./sim');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
let INSTRUCTOR_KEY = process.env.INSTRUCTOR_KEY;
if (!INSTRUCTOR_KEY) {
  INSTRUCTOR_KEY = 'dev';
  console.warn('INSTRUCTOR_KEY not set; using "dev". Set it in production.');
}

const LIVE_FILE = path.join(DATA_DIR, 'live.json');
const SAVED_DIR = path.join(DATA_DIR, 'saved');
fs.mkdirSync(SAVED_DIR, { recursive: true });

// ---------- Session state ----------

let session = null;

function newCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
  let code = '';
  for (let i = 0; i < 4; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function createSession() {
  const old = session;
  session = {
    code: newCode(),
    createdAt: new Date().toISOString(),
    closed: false,
    participants: {},
    submissions: {},
  };
  if (old) endStudentStreams(old.code);
  changed();
  return session;
}

function labelFor(pid) {
  const p = session.participants[pid] || {};
  const label = p.nickname || p.name || 'Anonymous';
  return p.group ? `${label} (${p.group})` : label;
}

function submissionList(withAuthors) {
  return Object.entries(session.submissions).map(([pid, s]) => ({
    data: s.data,
    author: withAuthors ? labelFor(pid) : null,
  }));
}

function counts() {
  return {
    joined: Object.keys(session.participants).length,
    submitted: Object.keys(session.submissions).length,
  };
}

// ---------- Persistence ----------

let writeTimer = null;
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => writeJson(LIVE_FILE, session), 500);
}

function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

try {
  session = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
  console.log(`Restored session ${session.code}`);
} catch {
  session = null;
}

// ---------- SSE ----------

const instructorClients = new Set();
const studentClients = new Set(); // { res, code, pid }

function openStream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function instructorPayload() {
  if (!session) return { session: null };
  return {
    session: { code: session.code, closed: session.closed, createdAt: session.createdAt },
    counts: counts(),
    virtues: sim.VIRTUES,
    aggregate: sim.aggregate(submissionList(true), { withAuthors: true }),
  };
}

// getAnon lets a broadcast compute the anonymous aggregate once for everyone.
function studentPayload(pid, getAnon = () => sim.aggregate(submissionList(false))) {
  const submitted = !!session.submissions[pid];
  const payload = { closed: session.closed, submitted, counts: counts() };
  if (submitted || session.closed) payload.aggregate = getAnon();
  return payload;
}

function broadcast() {
  const ip = instructorPayload();
  for (const res of instructorClients) send(res, ip);
  if (!session) return;
  let anon = null;
  const getAnon = () => (anon = anon || sim.aggregate(submissionList(false)));
  for (const c of studentClients) {
    if (c.code === session.code) send(c.res, studentPayload(c.pid, getAnon));
  }
}

function endStudentStreams(code) {
  for (const c of studentClients) {
    if (c.code === code) send(c.res, { ended: true });
  }
}

function changed() {
  scheduleWrite();
  broadcast();
}

// Keep connections alive through Railway's proxy.
setInterval(() => {
  for (const res of instructorClients) res.write(': ping\n\n');
  for (const c of studentClients) c.res.write(': ping\n\n');
}, 25000);

// ---------- App ----------

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.set('Content-Security-Policy', "frame-ancestors 'self' https://slides.com https://*.slides.com");
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const page = name => (req, res) => res.sendFile(path.join(__dirname, 'public', name));
app.get('/', page('index.html'));
app.get('/s/:code', page('student.html'));
app.get('/i/welcome', page('welcome.html'));
app.get('/i/aggregate', page('aggregate.html'));
app.get('/i/sessions', page('sessions.html'));
app.get('/healthz', (req, res) => res.send('ok'));
// Which commit is running (Railway sets RAILWAY_GIT_COMMIT_SHA on GitHub deploys).
const STARTED_AT = new Date().toISOString();
app.get('/version', (req, res) => res.json({
  commit: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 7),
  startedAt: STARTED_AT,
}));

function baseUrl(req) {
  return PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

// ----- Instructor API -----

function requireKey(req, res, next) {
  const given = Buffer.from(String(req.query.key || req.get('x-instructor-key') || ''));
  const want = Buffer.from(INSTRUCTOR_KEY);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: 'Bad instructor key' });
}

app.use('/api/i', requireKey);

app.get('/api/i/current', async (req, res) => {
  if (!session) createSession();
  const joinUrl = `${baseUrl(req)}/s/${session.code}`;
  const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
  res.json({ code: session.code, joinUrl, qrSvg, closed: session.closed, counts: counts() });
});

app.post('/api/i/new', (req, res) => {
  createSession();
  res.json({ code: session.code });
});

app.post('/api/i/close', (req, res) => {
  if (!session) return res.status(404).json({ error: 'No session' });
  session.closed = true;
  changed();
  res.json({ closed: true });
});

app.post('/api/i/reopen', (req, res) => {
  if (!session) return res.status(404).json({ error: 'No session' });
  session.closed = false;
  changed();
  res.json({ closed: false });
});

app.post('/api/i/save', (req, res) => {
  if (!session) return res.status(404).json({ error: 'No session' });
  const c = counts();
  const record = {
    code: session.code,
    createdAt: session.createdAt,
    savedAt: new Date().toISOString(),
    nJoined: c.joined,
    nSubmitted: c.submitted,
    closed: session.closed,
    data: sim.snapshot(submissionList(false)),
  };
  const id = `${session.createdAt.replace(/[:.]/g, '-')}-${session.code}.json`;
  writeJson(path.join(SAVED_DIR, id), record);
  res.json({ id, savedAt: record.savedAt });
});

app.get('/api/i/saved', (req, res) => {
  const list = fs.readdirSync(SAVED_DIR)
    .filter(f => f.endsWith('.json'))
    .map(id => {
      const r = JSON.parse(fs.readFileSync(path.join(SAVED_DIR, id), 'utf8'));
      return { id, code: r.code, createdAt: r.createdAt, savedAt: r.savedAt, nSubmitted: r.nSubmitted };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

app.get('/api/i/saved/:id', (req, res) => {
  if (!/^[\w-]+\.json$/.test(req.params.id)) return res.status(400).end();
  const file = path.join(SAVED_DIR, req.params.id);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.download(file);
});

app.get('/api/i/stream', (req, res) => {
  openStream(req, res);
  instructorClients.add(res);
  send(res, instructorPayload());
  req.on('close', () => instructorClients.delete(res));
});

// ----- Student API -----

function cleanField(s) {
  return typeof s === 'string' ? s.trim().slice(0, 40) : '';
}

function validPid(pid) {
  return typeof pid === 'string' && /^[\w-]{8,64}$/.test(pid);
}

// Rejects requests for codes that are not the live session.
function liveSession(req, res, next) {
  if (!session || session.code !== req.params.code.toUpperCase()) {
    return res.status(404).json({ error: 'This session has ended or does not exist.' });
  }
  next();
}

app.get('/api/s/:code/info', liveSession, (req, res) => {
  res.json({ code: session.code, closed: session.closed, virtues: sim.VIRTUES, budget: sim.BUDGET, maxText: sim.MAX_TEXT });
});

app.post('/api/s/:code/join', liveSession, (req, res) => {
  const { pid, name, nickname, group } = req.body || {};
  if (!validPid(pid)) return res.status(400).json({ error: 'Bad participant id' });
  session.participants[pid] = {
    name: cleanField(name), nickname: cleanField(nickname), group: cleanField(group),
    joinedAt: session.participants[pid]?.joinedAt || new Date().toISOString(),
  };
  changed();
  res.json({ ok: true });
});

app.post('/api/s/:code/submit', liveSession, (req, res) => {
  const { pid, data } = req.body || {};
  if (!validPid(pid)) return res.status(400).json({ error: 'Bad participant id' });
  if (session.closed) return res.status(409).json({ error: 'Submissions are closed.' });
  let clean;
  try {
    clean = sim.validate(data);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!session.participants[pid]) {
    session.participants[pid] = { name: '', nickname: '', group: '', joinedAt: new Date().toISOString() };
  }
  session.submissions[pid] = { data: clean, submittedAt: new Date().toISOString() };
  changed();
  res.json({ ok: true });
});

app.get('/api/s/:code/stream', liveSession, (req, res) => {
  const pid = String(req.query.pid || '');
  if (!validPid(pid)) return res.status(400).end();
  openStream(req, res);
  const client = { res, code: session.code, pid };
  studentClients.add(client);
  send(res, studentPayload(pid));
  req.on('close', () => studentClients.delete(client));
});

app.listen(PORT, () => console.log(`Roommate Design listening on :${PORT}`));
