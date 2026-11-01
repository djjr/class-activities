// Market Exchange server: one live session in memory, SSE for live updates,
// JSON files on disk for backup and saved sessions. See ARCHITECTURE.md.
//
// Session/QR/SSE/persistence code is copied from roommateDesign on purpose
// (repo rule: generalize shared pieces only once a second activity is stable).
// Game logic lives in market.js and sim.js; this file is routing and plumbing.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const sim = require('./sim');
const market = require('./market');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
// Two keys (see ARCHITECTURE.md, "Keys"):
//   INSTRUCTOR_KEY  view key. Goes in the deck's iframe URLs, which are public.
//                   Shows the join slide and room view, without names or controls.
//   ADMIN_KEY       control key. Typed once into the room view on the
//                   instructor's own browser (kept in localStorage, never in a
//                   URL in the deck). Unlocks controls, names, and saved sessions.
// If ADMIN_KEY is unset it falls back to INSTRUCTOR_KEY, i.e. the old
// single-key behavior, so a deploy keeps working until the variable is added.
let INSTRUCTOR_KEY = process.env.INSTRUCTOR_KEY;
if (!INSTRUCTOR_KEY) {
  INSTRUCTOR_KEY = 'dev';
  console.warn('INSTRUCTOR_KEY not set; using "dev". Set it in production.');
}
const ADMIN_KEY = process.env.ADMIN_KEY || INSTRUCTOR_KEY;
if (!process.env.ADMIN_KEY) console.warn('ADMIN_KEY not set; controls use INSTRUCTOR_KEY. Set ADMIN_KEY before sharing the deck.');

const LIVE_FILE = path.join(DATA_DIR, 'live.json');
const SAVED_DIR = path.join(DATA_DIR, 'saved');
fs.mkdirSync(SAVED_DIR, { recursive: true });

// ---------- Session state ----------
// session = { code, createdAt, participants: {pid: {nickname, joinedAt}},
//             phase: <market.js phase> | null, pastPhases: [phase...] }

let session = null;

function newCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
  let code = '';
  for (let i = 0; i < 4; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function createSession() {
  const old = session;
  session = { code: newCode(), createdAt: new Date().toISOString(), participants: {}, phase: null, pastPhases: [] };
  if (old) endStudentStreams(old.code);
  changed();
  return session;
}

// index of a pid in the current phase, or -1 if they joined after it started
function indexOf(pid) {
  return session.phase ? session.phase.pids.indexOf(pid) : -1;
}

function counts() {
  return {
    joined: Object.keys(session.participants).length,
    inPhase: session.phase ? session.phase.pids.length : 0,
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

const instructorClients = new Set(); // { res, admin }
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

// Names are included only for admin streams. The view key is public (it is in
// the deck), so the display-only room view shows trades without names.
function instructorPayload(admin) {
  if (!session) return { session: null, admin };
  const phase = session.phase ? market.roomView(session.phase) : null;
  if (phase && !admin) stripNames(phase);
  return {
    session: { code: session.code, createdAt: session.createdAt },
    admin,
    counts: counts(),
    phase,
    history: session.pastPhases.map(market.phaseSummary),
    phaseTypes: sim.PHASE_TYPES,
  };
}

function stripNames(view) {
  view.ticker = view.ticker.map(({ nameA, nameB, ...t }) => t);
  if (view.grid) view.grid = { ...view.grid, cells: view.grid.cells.map(c => (c ? (({ name, ...rest }) => rest)(c) : c)) };
}

// Per-student payload. Students who joined after the phase started wait.
function studentPayload(pid) {
  const base = { code: session.code, joined: !!session.participants[pid], counts: counts() };
  if (!session.phase) return { ...base, state: 'lobby' };
  const i = indexOf(pid);
  if (i < 0) return { ...base, state: 'waiting-next-phase' };
  return { ...base, state: 'phase', view: market.studentView(session.phase, i) };
}

function broadcast() {
  const payloads = {};
  for (const c of instructorClients) {
    const key = c.admin ? 'admin' : 'view';
    send(c.res, payloads[key] = payloads[key] || instructorPayload(c.admin));
  }
  if (!session) return;
  for (const c of studentClients) {
    if (c.code === session.code) send(c.res, studentPayload(c.pid));
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
  for (const c of instructorClients) c.res.write(': ping\n\n');
  for (const c of studentClients) c.res.write(': ping\n\n');
}, 25000);

// ---------- App ----------

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set('Content-Security-Policy', "frame-ancestors 'self' https://slides.com https://*.slides.com");
  next();
});
app.get('/sim.js', (req, res) => res.sendFile(path.join(__dirname, 'sim.js')));
app.use(express.static(path.join(__dirname, 'public'), { index: false, extensions: ['html'] }));

const page = name => (req, res) => res.sendFile(path.join(__dirname, 'public', name));
app.get('/', page('index.html'));
app.get('/s/:code', page('student.html'));
app.get('/i/welcome', page('welcome.html'));
app.get('/i/room', page('room.html'));
app.get('/i/sessions', page('sessions.html'));
app.get('/healthz', (req, res) => res.send('ok'));

const STARTED_AT = new Date().toISOString();
app.get('/version', (req, res) => {
  let savedCount = null;
  try {
    savedCount = fs.readdirSync(SAVED_DIR).filter(f => f.endsWith('.json')).length;
  } catch {
    savedCount = 'error reading SAVED_DIR';
  }
  res.json({
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 7),
    startedAt: STARTED_AT,
    dataDir: DATA_DIR,
    railwayVolumeMountPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || null,
    savedSessionCount: savedCount,
  });
});

function baseUrl(req) {
  return PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

// Turn thrown user-facing errors into 400/409 JSON.
const handle = fn => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
};

// ----- Instructor API -----

function keyMatches(given, want) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Admin key: header (fetch) or ?admin= (EventSource and download links,
// which can't set headers). The view key alone never grants admin.
const isAdmin = req => keyMatches(req.get('x-admin-key') || req.query.admin, ADMIN_KEY);

function requireKey(req, res, next) {
  const view = req.query.key || req.get('x-instructor-key');
  if (keyMatches(view, INSTRUCTOR_KEY) || keyMatches(view, ADMIN_KEY) || isAdmin(req)) return next();
  res.status(401).json({ error: 'Bad instructor key' });
}
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(403).json({ error: 'Controls are locked. Unlock with the admin key.' });
}

app.use('/api/i', requireKey);
// Everything that changes state, plus saved sessions, needs the admin key.
app.post('/api/i/*', requireAdmin);
app.get('/api/i/saved*', requireAdmin);

app.get('/api/i/whoami', (req, res) => res.json({ admin: isAdmin(req) }));

app.get('/api/i/current', async (req, res) => {
  if (!session) createSession();
  const joinUrl = `${baseUrl(req)}/s/${session.code}`;
  const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
  res.json({ code: session.code, joinUrl, qrSvg, counts: counts() });
});

app.post('/api/i/new', handle(() => {
  createSession();
  return { code: session.code };
}));

function needSession() {
  if (!session) throw Object.assign(new Error('No session'), { status: 404 });
}
function needPhase() {
  needSession();
  if (!session.phase) throw Object.assign(new Error('No phase has started'), { status: 409 });
}

app.post('/api/i/phase', handle(req => {
  needSession();
  const { type } = req.body || {};
  if (!sim.PHASE_TYPES.includes(type)) throw new Error('Unknown phase type');
  const members = Object.entries(session.participants)
    .sort((a, b) => a[1].joinedAt.localeCompare(b[1].joinedAt))
    .map(([pid, p]) => ({ pid, nickname: p.nickname }));
  if (members.length < 2) throw new Error('Need at least 2 students to start a phase');
  if (session.phase) {
    if (market.isOpen(session.phase)) market.closeRound(session.phase);
    session.pastPhases.push(session.phase);
  }
  session.phase = market.startPhase(type, members);
  changed();
  return { ok: true };
}));

app.post('/api/i/round/open', handle(req => {
  needPhase();
  const { classifieds, money } = req.body || {};
  market.openRound(session.phase, { classifieds, money });
  changed();
  return { ok: true };
}));

app.post('/api/i/round/close', handle(() => {
  needPhase();
  market.closeRound(session.phase);
  changed();
  return { ok: true };
}));

// Remove fake-class bots (pids starting "bot-") from the session. They are
// left out of the next phase; a phase already running keeps them, because
// removing people would change its economy mid-phase.
app.post('/api/i/remove-bots', handle(() => {
  needSession();
  const bots = Object.keys(session.participants).filter(pid => pid.startsWith('bot-'));
  bots.forEach(pid => delete session.participants[pid]);
  const inPhase = session.phase ? session.phase.pids.filter(pid => pid.startsWith('bot-')).length : 0;
  changed();
  return { removed: bots.length, stillInCurrentPhase: inPhase };
}));

app.post('/api/i/save', handle(() => {
  needSession();
  const phases = [...session.pastPhases, ...(session.phase ? [session.phase] : [])];
  const record = {
    code: session.code,
    createdAt: session.createdAt,
    savedAt: new Date().toISOString(),
    nJoined: Object.keys(session.participants).length,
    data: { phases: phases.map(market.snapshot) },
  };
  const id = `${session.createdAt.replace(/[:.]/g, '-')}-${session.code}.json`;
  writeJson(path.join(SAVED_DIR, id), record);
  return { id, savedAt: record.savedAt };
}));

app.get('/api/i/saved', handle(() =>
  fs.readdirSync(SAVED_DIR)
    .filter(f => f.endsWith('.json'))
    .map(id => {
      const r = JSON.parse(fs.readFileSync(path.join(SAVED_DIR, id), 'utf8'));
      return { id, code: r.code, createdAt: r.createdAt, savedAt: r.savedAt, nJoined: r.nJoined,
               phases: r.data.phases.map(p => p.type) };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
));

app.get('/api/i/saved/:id', (req, res) => {
  if (!/^[\w-]+\.json$/.test(req.params.id)) return res.status(400).end();
  const file = path.join(SAVED_DIR, req.params.id);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.download(file);
});

// Same payload as the stream, for scripts (fake-class --drive) that poll.
app.get('/api/i/room', handle(req => instructorPayload(isAdmin(req))));

app.get('/api/i/stream', (req, res) => {
  openStream(req, res);
  const client = { res, admin: isAdmin(req) };
  instructorClients.add(client);
  send(res, instructorPayload(client.admin));
  req.on('close', () => instructorClients.delete(client));
});

// ----- Student API -----

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

// The student's index in the current phase, or a user-facing error.
function me(req) {
  const pid = (req.body && req.body.pid) || req.query.pid;
  if (!validPid(pid)) throw new Error('Bad participant id');
  if (!session.phase) throw Object.assign(new Error('The instructor has not started a phase yet'), { status: 409 });
  const i = indexOf(pid);
  if (i < 0) throw Object.assign(new Error("You'll join at the start of the next phase"), { status: 409 });
  return i;
}

app.post('/api/s/:code/join', liveSession, handle(req => {
  const { pid, nickname } = req.body || {};
  if (!validPid(pid)) throw new Error('Bad participant id');
  const nick = typeof nickname === 'string' ? nickname.trim().slice(0, 16) : '';
  if (!nick) throw new Error('Please enter a nickname');
  // Nicknames must be unique (case-insensitive) so trade lists are unambiguous.
  // Rejoining under your own name is fine.
  const taken = Object.entries(session.participants)
    .some(([other, p]) => other !== pid && p.nickname.toLowerCase() === nick.toLowerCase());
  if (taken) {
    throw Object.assign(new Error(`Someone already uses "${nick}". Try adding an initial, like "${nick} ${'ABCDEFGHJKMNPRSTW'[crypto.randomInt(17)]}".`), { status: 409, code: 'name-taken' });
  }
  session.participants[pid] = { nickname: nick, joinedAt: session.participants[pid]?.joinedAt || new Date().toISOString() };
  changed();
  return { ok: true };
}));

// Same payload as the stream; used by the fake-class bots, which poll.
app.get('/api/s/:code/state', liveSession, handle(req => {
  const pid = String(req.query.pid || '');
  if (!validPid(pid)) throw new Error('Bad participant id');
  return studentPayload(pid);
}));

app.post('/api/s/:code/preview', liveSession, handle(req => {
  const { partner, pay } = req.body;
  return market.preview(session.phase, me(req), partner, pay);
}));

app.post('/api/s/:code/offer', liveSession, handle(req => {
  const { partner, pay } = req.body;
  const o = market.makeOffer(session.phase, me(req), partner, pay);
  changed();
  return { id: o.id };
}));

app.post('/api/s/:code/withdraw', liveSession, handle(req => {
  market.withdraw(session.phase, me(req));
  changed();
  return { ok: true };
}));

app.post('/api/s/:code/respond', liveSession, (req, res) => {
  let i;
  try { i = me(req); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  try {
    const out = market.respond(session.phase, i, req.body.offerId, !!req.body.accept);
    res.json(out);
  } catch (e) {
    res.status(409).json({ error: e.message });
  } finally {
    changed();   // the offer was consumed either way; everyone's view changes
  }
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

app.listen(PORT, () => console.log(`Market Exchange listening on :${PORT}`));
