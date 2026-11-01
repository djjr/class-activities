// Slide demo player. DemoPlan computes the events; this file animates them.
//
// Layout: 8 fixed "slots" in a 4 x 2 grid, with movable "items" on top.
//   Chairs:  slot = person (name stays put), item = chair (moves on a swap)
//   Offices: slot = office (stays put),     item = person (moves on a swap)
// Items are absolutely positioned over their slot, so a swap is just two
// items transitioning to each other's slot coordinates.

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const flag = (name, dflt) => (q.has(name) ? !['0', 'false', 'no'].includes(q.get(name)) : dflt);

const PHASE = q.get('phase') || 'chairs';
// Defaults chosen by scripts/demo-seeds.js so each phase tells its story.
const DEFAULT_SEED = { chairs: 17, 'offices-random': 156, 'offices-like-me': 39 };
const OPTS = {
  phase: PHASE,
  classifieds: flag('classifieds', false),
  money: flag('money', false),
  seed: Number(q.get('seed')) || DEFAULT_SEED[PHASE] || 1,
  meetings: Number(q.get('meetings')) || 24,
};
const SPEED = Math.max(0.25, Number(q.get('speed')) || 1);
const CAPTIONS = flag('captions', true);
const T = { meet: 1500 / SPEED, outcome: 1600 / SPEED, gap: 350 / SPEED };

const P = DemoPlan.plan(OPTS);
const E = P.economy, offices = PHASE !== 'chairs';
const fmt = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1));
const signed = x => (x > 1e-9 ? '+' : x < -1e-9 ? '−' : '±') + fmt(Math.abs(x));
const name = i => P.names[i];

// Same chart scale in every pane that shares phase + seed: compute all four
// institution variants and take the overall range.
const SCALE = (() => {
  const all = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, m]) => DemoPlan.plan({ ...OPTS, classifieds: !!c, money: !!m }));
  const ws = all.flatMap(p => [p.start, p.best, ...p.events.filter(e => e.welfare != null).map(e => e.welfare)]);
  const lo = Math.min(...ws), hi = Math.max(...ws), pad = Math.max(3, (hi - lo) * 0.1);
  return { lo: lo - pad, hi: hi + pad };
})();

$('title').textContent = q.get('title') ||
  (OPTS.classifieds && OPTS.money ? 'Classifieds + money' : OPTS.classifieds ? 'With classifieds' : OPTS.money ? 'With money' : 'Plain market');
if (!CAPTIONS) $('caption').hidden = true;

// ---------------------------------------------------------------- board
const board = $('board');
const slots = [], items = [];
const SHADES = ['#eef3f8', '#c9dbee', '#90b4da', '#4f80b8', '#1f4a82'];

function bars(v) {
  let h = '<span class="d-bar">';
  for (let k = 1; k <= 5; k++) h += `<i class="${k <= v ? 'on' : ''}"></i>`;
  return h + '</span>';
}

function buildBoard() {
  board.innerHTML = '';
  for (let k = 0; k < 8; k++) {
    const s = document.createElement('div');
    s.className = 'd-slot';
    if (!offices) s.innerHTML = `<div class="d-name">${name(k)}</div><div class="d-score" data-score></div>${OPTS.money ? '<div class="d-tokens" data-tokens></div>' : ''}`;
    board.appendChild(s); slots.push(s);
  }
  const nItems = 8;
  for (let i = 0; i < nItems; i++) {
    const it = document.createElement('div');
    it.className = 'd-item';
    if (!offices) {
      const c = E.chairs[i];   // item i = chair i
      it.style.background = SHADES[c[0] - 1];
      it.classList.add(c[0] >= 4 ? 'ink-light' : 'ink-dark');
      it.innerHTML = MarketSim.DIMS.map((d, k) => `<div class="d-row"><span>${d.label}</span>${bars(c[k])}</div>`).join('');
    } else {
      const t = E.types[i];    // item i = person i
      it.style.background = Offices.TYPE_COLORS[t - 1];
      it.classList.add(t === 3 || t === 4 ? 'ink-dark' : 'ink-light');
      it.innerHTML = `<div class="d-type">${t}</div><div class="d-pname">${name(i)}</div>
        <div class="d-wants">wants ${Offices.typeChip(E.wants[i])}</div><div class="d-score" data-score></div>${OPTS.money ? '<div class="d-tokens" data-tokens></div>' : ''}`;
    }
    board.appendChild(it); items.push(it);
  }
}

// Where each item sits: chairs -> holder's slot; offices -> person's office.
function slotOf(holdings, item) {
  return offices ? holdings[item] : holdings.indexOf(item);
}

function place(holdings, animate) {
  const b = board.getBoundingClientRect();
  items.forEach((it, i) => {
    const r = slots[slotOf(holdings, i)].getBoundingClientRect();
    it.style.transition = animate ? `left ${T.outcome * 0.55}ms ease-in-out, top ${T.outcome * 0.55}ms ease-in-out` : 'none';
    const inset = offices ? 0 : 0.22 * r.height;   // chairs: leave room for the person's name
    it.style.left = `${r.left - b.left}px`;
    it.style.top = `${r.top - b.top + inset}px`;
    it.style.width = `${r.width}px`;
    it.style.height = `${r.height - inset}px`;
  });
}

function showScores(holdings) {
  const sc = MarketSim.scores(E, holdings);
  if (offices) items.forEach((it, i) => { it.querySelector('[data-score]').textContent = fmt(sc[i]); });
  else slots.forEach((s, i) => { s.querySelector('[data-score]').textContent = fmt(sc[i]); });
}

// Money panes: a coin counter on each person (tokens are not part of welfare).
function showTokens(tokens) {
  if (!OPTS.money) return;
  for (let i = 0; i < 8; i++) personEl(i).querySelector('[data-tokens]').innerHTML = `<span class="coin"></span>${tokens[i]}`;
}

// The element that represents person i (for highlights and badges).
const personEl = i => (offices ? items[i] : slots[i]);

function badge(el, text, cls) {
  const bdg = document.createElement('div');
  bdg.className = `d-badge ${cls}`;
  if (cls.includes('pay')) bdg.innerHTML = `<span class="coin"></span>${text}`;
  if (!cls.includes('pay')) bdg.textContent = text;
  el.appendChild(bdg);
  setTimeout(() => bdg.remove(), T.meet + T.outcome);
}

// ---------------------------------------------------------------- chart
function drawChart(upto) {
  const el = $('chart'), W = Math.max(300, el.clientWidth), H = Math.max(100, el.clientHeight);
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const L = 44, R = 12, Tp = 18, B = 20;
  const x = m => L + (W - L - R) * m / OPTS.meetings;
  const y = v => Tp + (H - Tp - B) * (1 - (v - SCALE.lo) / (SCALE.hi - SCALE.lo));
  const pts = [[0, P.start]];
  let w = P.start, m = 0;
  for (let k = 0; k < upto; k++) {
    const e = P.events[k];
    if (e.kind === 'stable') break;
    m++;
    if (e.welfare != null) w = e.welfare;
    pts.push([m, w]);
  }
  const by = y(P.best), sy = y(P.start);
  el.innerHTML = `
    <line x1="${L}" x2="${W - R}" y1="${by}" y2="${by}" class="bench"/>
    <text x="${L + 4}" y="${by - 5}" class="bench-label">best possible · ${fmt(P.best)}</text>
    <line x1="${L}" x2="${W - R}" y1="${sy}" y2="${sy}" class="start-line"/>
    <text x="${L - 6}" y="${sy + 4}" class="tick" text-anchor="end">start</text>
    <polyline class="line" points="${pts.map(([a, v]) => `${x(a)},${y(v)}`).join(' ')}"/>
    <circle cx="${x(pts[pts.length - 1][0])}" cy="${y(w)}" r="5" class="pt"/>
    <text x="${W - R}" y="${H - 4}" class="tick" text-anchor="end">meetings →</text>`;
}

// ---------------------------------------------------------------- captions
function meetCaption(e) {
  const who = `<b>${name(e.a)}</b> and <b>${name(e.b)}</b> meet.`;
  const gains = `${name(e.a)} ${signed(e.dA)}, ${name(e.b)} ${signed(e.dB)}`;
  return `${who} ${gains}…`;
}
function outcomeCaption(e) {
  let s;
  if (e.why === 'both') s = 'Both gain, so they swap.';
  else if (e.why === 'paid') {
    const payer = e.pay > 0 ? e.a : e.b, payee = e.pay > 0 ? e.b : e.a;
    s = `${name(payer)} pays ${name(payee)} ${Math.abs(e.pay)}, so both come out ahead. Swap.`;
  } else if (e.why === 'no-surplus') s = 'Together they would lose, so no deal, even with money.';
  else if (e.why === 'broke') s = `${name(e.payer)} can't afford to pay enough. No deal.`;
  else if (e.why === 'neither') s = 'Neither gains. No deal.';
  else s = `${e.dA > e.dB ? name(e.b) : name(e.a)} would lose. No deal.`;
  if (e.deal && offices) {
    const neighbors = e.dRoom - e.traders;
    s += ` Neighbors ${signed(neighbors)}, room <b class="${e.dRoom < -1e-9 ? 'neg' : 'pos'}">${signed(e.dRoom)}</b>.`;
  }
  return s;
}

function setCaption(html) { if (CAPTIONS) $('caption').innerHTML = html; }

// ---------------------------------------------------------------- player
let k = 0, holdings = E.start.slice(), playing = false, timer = null, started = false, finished = false;

function status() {
  const meetingsSoFar = P.events.slice(0, k).filter(e => e.kind !== 'stable').length;
  const tradesSoFar = P.events.slice(0, k).filter(e => e.kind === 'meet' && e.deal).length;
  const w = MarketSim.welfare(E, holdings);
  $('status').innerHTML = `Meeting ${meetingsSoFar} · ${tradesSoFar} trades · welfare <b>${fmt(w)}</b> · ${shareText(w)}`;
}

// "62% of possible gain", or, if welfare fell, "below the start".
function shareText(w) {
  if (w < P.start - 1e-9) return '<b class="neg">below the start</b>';
  const share = P.best > P.start ? Math.round(100 * (w - P.start) / (P.best - P.start)) : 0;
  return `<b>${share}%</b> of possible gain`;
}

const MONEY_INTRO = ` Everyone starts with ${MarketSim.START_TOKENS} tokens and can pay to make a trade worth someone's while. Payments move tokens around; they don't change room welfare.`;

function reset() {
  clearTimeout(timer);
  k = 0; holdings = E.start.slice(); playing = false; started = false; finished = false;
  $('summary').hidden = true; $('caption').classList.remove('final');
  $('overlay').hidden = false;
  $('overlay').textContent = '▶ Click to start';
  items.forEach(it => it.classList.remove('meeting'));
  slots.forEach(s => s.classList.remove('meeting'));
  place(holdings, false); showScores(holdings); showTokens(new Array(8).fill(MarketSim.START_TOKENS)); drawChart(0); status();
  setCaption(offices
    ? `Eight people, eight offices. Each wants neighbors of a certain type. ${OPTS.classifieds ? 'Classifieds list who would help you.' : 'People meet at random.'}${OPTS.money ? MONEY_INTRO : ''}`
    : `Eight people, eight chairs. Each wants a different chair. ${OPTS.classifieds ? 'Classifieds list who would help you.' : 'People meet at random.'}${OPTS.money ? MONEY_INTRO : ''}`);
}

// One event in three beats: meet (highlight + each side's gain), outcome
// (swap or not, neighbor effects), then a short gap.
function step() {
  if (k >= P.events.length) return finish();
  const e = P.events[k];
  if (e.kind === 'stable') { k++; setCaption(OPTS.money ? 'No trade left that creates value for the two traders.' : 'No trade left that both sides want.'); return finish(); }
  if (e.kind === 'search') {
    personEl(e.a).classList.add('meeting');
    setCaption(`<b>${name(e.a)}</b> checks the classifieds: ${e.listed} ${e.listed === 1 ? 'person' : 'people'} would help, but nobody on the list gains from the swap.`);
    timer = setTimeout(() => { personEl(e.a).classList.remove('meeting'); k++; status(); drawChart(k); schedule(T.gap + T.outcome * 0.4); }, T.meet);
    return;
  }
  const A = personEl(e.a), B = personEl(e.b);
  A.classList.add('meeting'); B.classList.add('meeting');
  badge(A, signed(e.dA), e.dA > 1e-9 ? 'pos' : 'neg');
  badge(B, signed(e.dB), e.dB > 1e-9 ? 'pos' : 'neg');
  setCaption(meetCaption(e));
  timer = setTimeout(() => {
    setCaption(meetCaption(e).replace('…', '. ') + outcomeCaption(e));
    if (e.deal) {
      holdings = e.holdings.slice();
      place(holdings, true);
      // Offices: show the effect on everyone else whose score changed.
      if (offices) e.deltas.forEach((d, i) => { if (i !== e.a && i !== e.b && Math.abs(d) > 1e-9) badge(items[i], signed(d), d > 0 ? 'pos' : 'neg'); });
      setTimeout(() => { showScores(holdings); showTokens(e.tokens); }, T.outcome * 0.55);
      if (e.pay) {
        const payer = e.pay > 0 ? e.a : e.b, payee = e.pay > 0 ? e.b : e.a, amt = Math.abs(e.pay);
        badge(personEl(payer), `−${amt}`, 'pay out');
        badge(personEl(payee), `+${amt}`, 'pay in');
      }
    } else {
      A.classList.add('nodeal'); B.classList.add('nodeal');
    }
    timer = setTimeout(() => {
      A.classList.remove('meeting', 'nodeal'); B.classList.remove('meeting', 'nodeal');
      k++; status(); drawChart(k);
      schedule(T.gap);
    }, T.outcome);
  }, T.meet);
}

function schedule(ms) { if (playing) timer = setTimeout(step, ms); }

function finish() {
  playing = false;
  status(); drawChart(k);
  const f = P.final;
  const stalled = P.events.length && P.events[P.events.length - 1].kind === 'stable'
    ? (OPTS.money ? 'No trade left that creates value. ' : 'No trade left that both sides want. ') : '';
  const html = `${stalled}<b>Done: ${f.meetings} meetings, ${f.trades} trades.</b> Welfare ${fmt(P.start)} → <b>${fmt(f.welfare)}</b> (best ${fmt(P.best)}), ${shareText(f.welfare).replace('possible gain', 'the possible gain')}.` +
    (offices ? ` <span class="${f.harmful ? 'neg' : ''}">${f.harmful} ${f.harmful === 1 ? 'trade' : 'trades'} lowered room welfare.</span>` : '') +
    ` <span class="hint">(R to replay)</span>`;
  if (CAPTIONS) { $('caption').innerHTML = html; $('caption').classList.add('final'); }
  // Captions off: the presenter narrates, so just mark the header as done.
  else $('status').innerHTML = `<b>Done</b> · ${f.meetings} meetings · ${f.trades} trades · welfare <b>${fmt(f.welfare)}</b> · ${shareText(f.welfare)}` +
    (offices && f.harmful ? ` · <b class="neg">${f.harmful} harmful</b>` : '');
  finished = true;
}

// ---------------------------------------------------------------- controls
// Panes on the same slide (same origin) stay in step via BroadcastChannel:
// clicking either one starts or pauses both.
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('mx-demo-' + (q.get('group') || 'default')) : null;
function apply(cmd) {
  if (cmd === 'play') {
    if (finished) return;
    started = true; playing = true; $('overlay').hidden = true; clearTimeout(timer); step();
  } else if (cmd === 'pause') {
    playing = false; clearTimeout(timer);
    // Let the current beat finish visually; resume continues from the next event.
    $('overlay').hidden = false; $('overlay').textContent = '❚❚ Paused · click to resume';
  } else if (cmd === 'restart') reset();
}
function send(cmd) { apply(cmd); if (chan) chan.postMessage(cmd); }
if (chan) chan.onmessage = e => apply(e.data);

$('demo').addEventListener('click', () => send(playing ? 'pause' : 'play'));
document.addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); send(playing ? 'pause' : 'play'); }
  if (e.key === 'r' || e.key === 'R') send('restart');
  if (e.key === 'ArrowRight' && !playing && started) { clearTimeout(timer); step(); }
});
window.addEventListener('resize', () => { place(holdings, false); drawChart(k); });

buildBoard();
// Wait a frame so the grid has its size before placing items.
requestAnimationFrame(() => reset());
