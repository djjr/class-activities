// The projected room view: welfare chart, trade ticker, office map, controls.
// Driven by the instructor SSE stream (instructorPayload in server.js).

const $ = id => document.getElementById(id);
const PHASE_LABEL = { chairs: 'Chairs', 'offices-random': 'Offices: random neighbors', 'offices-like-me': 'Offices: neighbors like me' };
const fmt = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1));
const signed = x => (x > 1e-9 ? '+' : x < -1e-9 ? '−' : '±') + fmt(Math.abs(x));

let last = null;
let flash = { at: null, until: 0, set: new Set() };

adminGate($('lock')).then(() => istream(msg => { last = msg; render(); }));
window.addEventListener('resize', () => render());
$('optNames').onchange = () => render();

function render() {
  const m = last;
  if (!m || !m.session) return;
  const p = m.phase;
  const waiting = m.counts.joined - m.counts.inPhase;
  $('counts').innerHTML = `<b>${m.counts.joined}</b> joined` +
    (p ? ` · <b>${p.tradesThisRound}</b> trades this round · <b>${p.pendingOffers}</b> offers pending` : '') +
    (p && waiting > 0 ? ` · ${waiting} waiting for next phase` : '');
  renderHistory(m.history);

  if (!p) {
    $('phaseLabel').textContent = 'No phase yet';
    $('roundLabel').textContent = `Session ${m.session.code} · choose a phase below once students have joined`;
    // Reset everything the previous session drew, so a New session looks new.
    $('openBtn').disabled = true; $('closeBtn').hidden = true; $('openBtn').hidden = false;
    $('openBtn').textContent = 'Open round 1';
    $('optClassifieds').disabled = $('optMoney').disabled = false;
    $('kpiWelfare').textContent = '–'; $('kpiShare').textContent = '–';
    $('kpiShareLabel').textContent = 'of possible gain';
    $('kpiHarmBox').hidden = $('kpiSortBox').hidden = true;
    $('mapWrap').hidden = true; $('ticker').innerHTML = '<li class="muted">No trades yet.</li>'; $('chart').innerHTML = '';
    return;
  }

  $('phaseLabel').textContent = PHASE_LABEL[p.type];
  const r = p.round;
  $('roundLabel').textContent = !r ? `${p.n} students · baseline (round 0)`
    : `${p.n} students · Round ${r.number}` + (r.classifieds ? ' · Classifieds' : '') + (r.money ? ' · Money' : '') + (r.open ? ' · trading open' : ' · closed');

  // Controls
  const open = !!(r && r.open);
  $('openBtn').hidden = open; $('closeBtn').hidden = !open; $('openBtn').disabled = false;
  $('openBtn').textContent = `Open round ${(r ? r.number : 0) + 1}`;
  $('closeBtn').textContent = `Close round ${r ? r.number : ''}`;
  $('optClassifieds').disabled = $('optMoney').disabled = open;

  // KPIs
  $('kpiWelfare').textContent = fmt(p.welfare);
  $('kpiShare').textContent = p.gainShare == null ? '–' : `${Math.round(100 * p.gainShare)}%`;
  $('kpiShareLabel').textContent = p.benchmark.kind === 'optimum' ? 'of possible gain' : 'of gain to best found';
  const offices = p.type !== 'chairs';
  $('kpiHarmBox').hidden = !offices;
  $('kpiHarm').textContent = p.harmfulTrades;
  $('kpiSortBox').hidden = !offices;
  if (offices) $('kpiSort').textContent = `${p.sortingStart.toFixed(2)} → ${p.sorting.toFixed(2)}`;

  renderChart(p);
  renderTicker(p);
  renderMap(p);
}

// ---------------------------------------------------------------- chart
// Hand-rolled SVG (no chart library, per repo convention). One point per
// round; the open round's point is hollow because it is still moving.
// The SVG's viewBox is set to its on-screen pixel size, so text and dots are
// never stretched (preserveAspectRatio="none" would distort them).
function renderChart(p) {
  const el = $('chart');
  const W = Math.max(320, el.clientWidth), H = Math.max(160, el.clientHeight);
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const L = 54, R = 44, T = 26, B = 46;
  const pts = p.series;
  const ys = pts.map(s => s.welfare).concat([p.benchmark.welfare, p.startWelfare]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(4, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const xs = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / Math.max(pts.length - 1, 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = niceTicks(lo, hi, 4);
  let svg = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join('');
  const by = y(p.benchmark.welfare);
  svg += `<line x1="${L}" x2="${W - R}" y1="${by}" y2="${by}" class="bench"/>
          <text x="${L + 6}" y="${by - 7}" class="bench-label">${p.benchmark.kind === 'optimum' ? 'best possible' : 'best found'} · ${fmt(p.benchmark.welfare)}</text>`;
  svg += `<polyline class="line" points="${pts.map((s, i) => `${xs(i)},${y(s.welfare)}`).join(' ')}"/>`;
  svg += pts.map((s, i) => `
    <circle cx="${xs(i)}" cy="${y(s.welfare)}" r="6" class="${s.final ? 'pt' : 'pt live'}"/>
    <text x="${xs(i)}" y="${y(s.welfare) - 12}" class="pt-label" text-anchor="middle">${fmt(s.welfare)}</text>
    <text x="${xs(i)}" y="${H - B + 20}" class="x-label" text-anchor="middle">${esc(s.label.split(' · ')[0])}</text>
    <text x="${xs(i)}" y="${H - B + 36}" class="x-sub" text-anchor="middle">${esc(s.label.split(' · ').slice(1).join(' · '))}</text>`).join('');
  $('chart').innerHTML = svg;
}

function niceTicks(lo, hi, n) {
  const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw);
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(Math.round(t));
  return out;
}

// ---------------------------------------------------------------- ticker
function renderTicker(p) {
  const names = last.admin && $('optNames').checked, offices = p.type !== 'chairs';
  const newest = p.ticker[0];
  // Flash the two traders' offices for a few seconds after a harmful swap.
  if (newest && newest.at !== flash.at) {
    flash = { at: newest.at, until: Date.now() + 4000, set: newest.dRoom < -1e-9 ? new Set([newest.a, newest.b]) : new Set() };
    setTimeout(render, 4100);
  }
  $('ticker').innerHTML = p.ticker.length ? p.ticker.map(t => {
    const who = names ? `${esc(t.nameA)} ↔ ${esc(t.nameB)}` : 'Swap';
    const traders = t.dA + t.dB, neighbors = t.dRoom - traders;
    const pay = t.pay ? ` · paid ${Math.abs(t.pay)}` : '';
    const detail = offices
      ? `traders ${signed(traders)} · neighbors ${signed(neighbors)} · room <b>${signed(t.dRoom)}</b>`
      : `room <b>${signed(t.dRoom)}</b>`;
    return `<li class="${t.dRoom < -1e-9 ? 'harm' : ''}"><span class="t-round">R${t.round}</span> ${who}${pay} · ${detail}</li>`;
  }).join('') : '<li class="muted">No trades yet.</li>';
}

// ---------------------------------------------------------------- map
function renderMap(p) {
  if (!p.grid) { $('mapWrap').hidden = true; return; }
  $('mapWrap').hidden = false;
  const highlight = Date.now() < flash.until ? flash.set : new Set();
  Offices.renderOfficeMap($('map'), p.grid, { showNames: last.admin && $('optNames').checked, highlight });
  $('legend').innerHTML = [1, 2, 3, 4, 5].map(t => Offices.typeChip(t, ` ${Offices.TYPE_WORDS[t - 1]}`)).join(' ') +
    ' <span class="type-chip phantom-chip">·</span> empty (fixed neighbor)';
}

// ---------------------------------------------------------------- history
function renderHistory(h) {
  $('history').innerHTML = h.length ? 'Earlier: ' + h.map(x =>
    `<span class="hist">${PHASE_LABEL[x.type].split(':')[0]}${x.type.startsWith('offices') ? (x.type.endsWith('like-me') ? ' (like me)' : ' (random)') : ''}: ${fmt(x.startWelfare)} → ${fmt(x.endWelfare)} <span class="muted">(best ${fmt(x.benchmark)})</span></span>`).join(' ') : '';
}

// ---------------------------------------------------------------- controls
const say = text => { $('msg').textContent = text; setTimeout(() => { if ($('msg').textContent === text) $('msg').textContent = ''; }, 4000); };
const run = fn => async () => { try { await fn(); } catch (e) { say(e.message); } };

document.querySelectorAll('[data-phase]').forEach(btn => {
  confirmButton(btn, 'Click again to start', run(async () => {
    await iapi('phase', 'POST', { type: btn.dataset.phase });
    $('optClassifieds').checked = $('optMoney').checked = false;
  }));
});
$('openBtn').onclick = run(() => iapi('round/open', 'POST', { classifieds: $('optClassifieds').checked, money: $('optMoney').checked }));
confirmButton($('closeBtn'), 'Click again to close', run(() => iapi('round/close', 'POST')));
$('saveBtn').onclick = run(async () => { const r = await iapi('save', 'POST'); say(`Saved ${new Date(r.savedAt).toLocaleTimeString()}`); });
// Starts a fresh session (new code; everyone rejoins). Save first if you want a record.
confirmButton($('newBtn'), 'Click again: new session', run(async () => { await iapi('new', 'POST'); say('New session started'); }));
