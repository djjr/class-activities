// Student phone page. Everything on screen is driven by one SSE payload from
// the server (studentPayload in server.js); the only local state is which
// partner is open in the trade sheet and the payment being composed.
//
// Strategy: render() is idempotent. Every payload re-renders from scratch,
// so there is no client state to drift out of sync with the server.

const CODE = location.pathname.split('/').pop().toUpperCase();
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Office scores are means over neighbors, so they can be fractional.
const fmt = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1));
const signed = x => (x > 1e-9 ? '+' : x < -1e-9 ? '−' : '±') + fmt(Math.abs(x));

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}
let PID = store('mx-pid');
if (!PID) { PID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store('mx-pid', PID); }

async function api(path, body) {
  const res = await fetch(`/api/s/${CODE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ pid: PID, ...body }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ---------------------------------------------------------------- state
let last = null;            // last payload from the server
let sheet = null;           // null | { partner: index|null, pay: number }
let lastNoticeId = null;

const es = new EventSource(`/api/s/${CODE}/stream?pid=${encodeURIComponent(PID)}`);
es.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.ended) return showEnded();
  last = msg;
  render();
};
es.onerror = () => {
  // EventSource reconnects on its own; a 404 means the session is gone.
  fetch(`/api/s/${CODE}/state?pid=${encodeURIComponent(PID)}`).then(r => { if (r.status === 404) { es.close(); showEnded(); } });
};

function showEnded() {
  $('main').innerHTML = `<div class="panel center"><h2>This session has ended</h2><p class="muted">Ask for the new code.</p></div>`;
  ['status', 'actions'].forEach(id => { $(id).hidden = true; });
  $('incoming').innerHTML = $('outgoing').innerHTML = '';
  closeSheet();
}

// ---------------------------------------------------------------- render
function render() {
  const m = last;
  if (!m.joined) return renderJoin();
  if (m.state === 'lobby') return renderMessage("You're in!", 'Waiting for the instructor to start.');
  if (m.state === 'waiting-next-phase') return renderMessage("You're in!", 'This phase started before you joined. You\'ll get a chair or office when the next phase starts.');
  renderPhase(m.view);
}

function renderJoin() {
  hideChrome();
  const saved = store('mx-nick') || '';
  $('main').innerHTML = `
    <form class="panel" id="joinForm">
      <h1>Market Exchange</h1>
      <label for="nick">Your nickname</label>
      <input id="nick" maxlength="16" autocomplete="off" value="${esc(saved)}" placeholder="What classmates call you">
      <p class="muted small">Classmates see this on your screen and in their trade lists.</p>
      <button class="btn" style="width:100%">Join</button>
      <p class="error" id="joinErr"></p>
    </form>`;
  $('joinForm').onsubmit = async e => {
    e.preventDefault();
    const nickname = $('nick').value.trim();
    store('mx-nick', nickname);
    try { await api('join', { nickname }); }
    catch (err) { $('joinErr').textContent = err.message; $('nick').focus(); $('nick').select(); }
  };
}

function renderMessage(title, text) {
  hideChrome();
  $('main').innerHTML = `<div class="panel center"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p></div>`;
}

function hideChrome() {
  ['status', 'actions'].forEach(id => { $(id).hidden = true; });
  $('incoming').innerHTML = $('outgoing').innerHTML = '';
  closeSheet();
}

const PHASE_LABEL = { chairs: 'Chairs', 'offices-random': 'Offices', 'offices-like-me': 'Offices' };

function renderPhase(v) {
  // Status bar: round number, round type, open/closed.
  const r = v.round;
  const kinds = r ? [r.classifieds && 'Classifieds', r.money && 'Money'].filter(Boolean).join(' · ') : '';
  $('status').hidden = false;
  $('status').className = 'status ' + (r && r.open ? 'open' : 'closed');
  $('status').innerHTML = !r
    ? `<b>${PHASE_LABEL[v.type]}</b> · Trading opens soon`
    : `<b>Round ${r.number}</b>${kinds ? ' · ' + kinds : ''} · ${r.open ? 'Trading open' : 'Trading closed'}`
      + (v.moneyEver ? `<span class="tokens">${v.me.tokens} tokens</span>` : '');

  renderOffers(v);

  if (v.type === 'chairs') {
    $('main').innerHTML = '<div id="card"></div>';
    renderChairCard($('card'), { dims: v.dims, chair: v.me.chair, target: v.me.target, score: fmt(v.me.score), nickname: v.me.name });
  } else {
    renderOfficeMain(v);
  }

  $('actions').hidden = false;
  $('tradeBtn').disabled = !(r && r.open);
  $('tradeBtn').textContent = r && r.open ? (r.classifieds ? 'Trade · see classifieds' : 'Trade') : 'Trading closed';

  if (v.notice && v.notice.id !== lastNoticeId) {
    lastNoticeId = v.notice.id;
    toast(v.notice.text);
  }
  if (sheet) renderSheet();
}

function renderOfficeMain(v) {
  const O = Offices;
  $('main').innerHTML = `
    <div class="office-me">
      <div><div class="private-title">You are</div>${O.typeChip(v.me.type, ` ${O.TYPE_WORDS[v.me.type - 1]}`)}</div>
      <div><div class="private-title">You'd like neighbors who are</div>${O.typeChip(v.me.wants, ` ${O.TYPE_WORDS[v.me.wants - 1]}`)}</div>
      <div class="score"><div class="private-title">Score</div><div class="score-num">${fmt(v.me.score)}</div><div class="score-max">of 64</div></div>
    </div>
    <div id="map"></div>
    <p class="muted small center">Tap an office to see what swapping with that person would do for you.</p>`;
  O.renderOfficeMap($('map'), v.grid, { showNames: true, clickable: v.round && v.round.open });
  $('map').onclick = e => {
    const cell = e.target.closest('[data-index]');
    if (cell) openSheet(Number(cell.dataset.index));
  };
}

function renderOffers(v) {
  $('incoming').innerHTML = v.incoming.map(o => `
    <div class="offer-in">
      <div><b>${esc(o.name)}</b> offers to swap${payPhrase(o.pay, false)}</div>
      <div class="offer-effect ${o.mine.total > 0 ? 'good' : 'bad'}">Your score: ${fmt(v.me.score)} → ${fmt(v.me.score + o.mine.total)} (${signed(o.mine.total)})</div>
      <div class="row">
        <button class="btn secondary" data-respond="${o.id}" data-accept="0">Decline</button>
        <button class="btn ${o.mine.total > 1e-9 ? '' : 'secondary'}" data-respond="${o.id}" data-accept="1">Accept</button>
      </div>
    </div>`).join('');
  const o = v.outgoing;
  $('outgoing').innerHTML = o ? `
    <div class="offer-out">
      <span>Waiting for <b>${esc(o.name)}</b>… (you: ${signed(o.mine.total)})</span>
      <button class="link" id="withdrawBtn">Withdraw</button>
    </div>` : '';
  if (o) $('withdrawBtn').onclick = () => api('withdraw', {}).catch(err => toast(err.message));
}

// pay > 0 means the offer's sender pays. Phrase it from the reader's side.
function payPhrase(pay, iAmSender) {
  if (!pay) return '';
  const senderPays = pay > 0, amt = Math.abs(pay);
  if (iAmSender) return senderPays ? ` · you pay ${amt}` : ` · they pay you ${amt}`;
  return senderPays ? ` · they pay you ${amt}` : ` · you pay ${amt}`;
}

$('incoming').addEventListener('click', async e => {
  const b = e.target.closest('[data-respond]');
  if (!b) return;
  b.disabled = true;
  try {
    const out = await api('respond', { offerId: b.dataset.respond, accept: b.dataset.accept === '1' });
    if (out.accepted) toast('Trade done!');
  } catch (err) { toast(err.message); }
});

// ---------------------------------------------------------------- trade sheet
$('tradeBtn').onclick = () => openSheet(null);
$('sheetClose').onclick = closeSheet;
$('sheetBack').onclick = () => { sheet.partner = null; sheet.amt = 0; renderSheet(); };

function openSheet(partner) {
  sheet = { partner, dir: 'me', amt: 0 };
  $('sheet').hidden = false;
  renderSheet();
}
function closeSheet() { sheet = null; $('sheet').hidden = true; }

function renderSheet() {
  const v = last && last.view;
  if (!v || !v.round || !v.round.open) return closeSheet();
  $('sheetBack').hidden = sheet.partner === null;
  const body = $('sheetBody'), y = body.scrollTop;   // keep scroll position across live re-renders
  if (sheet.partner === null) renderList(v); else renderDetail(v);
  body.scrollTop = y;
}

function renderList(v) {
  $('sheetTitle').textContent = v.round.classifieds ? 'Classifieds' : 'Trade with…';
  let html;
  if (v.round.classifieds) {
    html = v.classifieds.length
      ? `<p class="muted small">Swaps that would raise your score, best first. Only your own gain is shown.</p>` +
        v.classifieds.map(c => `<button class="list-row" data-partner="${c.index}"><span>${esc(c.name)}</span><span class="gain">${signed(c.gain)}</span></button>`).join('')
      : `<p class="muted">No single swap would raise your score right now. In a Money round, you could pay someone to make a swap worth their while.</p>`;
    html += `<details class="all-names"><summary>Everyone</summary>${namesHtml(v)}</details>`;
  } else {
    html = `<p class="muted small">Tap the person you want to trade with.</p>` + namesHtml(v);
  }
  $('sheetBody').innerHTML = html;
}

const namesHtml = v => v.partners.map(p => `<button class="list-row" data-partner="${p.index}"><span>${esc(p.name)}</span><span class="muted">›</span></button>`).join('');

$('sheetBody').addEventListener('click', e => {
  const row = e.target.closest('[data-partner]');
  if (row) { sheet.partner = Number(row.dataset.partner); sheet.dir = 'me'; sheet.amt = 0; renderSheet(); }
});

function renderDetail(v) {
  const p = sheet.partner, name = (v.partners.find(x => x.index === p) || {}).name || '?';
  $('sheetTitle').textContent = name;
  const what = v.type === 'chairs'
    ? `<div class="compare">${v.dims.map((d, k) => `
        <div class="compare-row"><span class="compare-label">${esc(d.label)}</span>
          ${miniBlocks(v.chairs[p][k])}<span class="muted small">want</span>${miniBlocks(v.me.target[k])}</div>`).join('')}
        <div class="muted small">Their chair (left) vs. what you want (right)</div></div>`
    : officeSwapHtml(v, p, name);
  const money = v.round.money ? moneyControls(v) : '';
  $('sheetBody').innerHTML = `
    ${what}
    ${money}
    <div id="pv" class="preview">Working it out…</div>
    <button class="btn" id="offerBtn" style="width:100%" disabled>Offer swap</button>
    <p class="muted small center">${esc(name)} will see their own change, not yours.</p>`;
  if (v.round.money) wireMoney(v);
  if (v.type !== 'chairs') renderSwapMap(v, p);
  $('offerBtn').onclick = async () => {
    $('offerBtn').disabled = true;
    try { await api('offer', { partner: p, pay: payOf() }); toast(`Offer sent to ${name}`); closeSheet(); }
    catch (err) { toast(err.message); $('offerBtn').disabled = false; }
  };
  updatePreview(v);
}

// Offices: show where you'd move, who your neighbors are now vs. after,
// sorted so the two lists are easy to compare against what you want.
function officeSwapHtml(v, p, name) {
  const O = Offices, theirs = v.grid.cells.findIndex(c => c && c.index === p);
  const nb = O.swapNeighbors(v.grid, v.me.office, theirs);
  const chips = list => list.slice().sort((x, y) => x - y).map(t => O.typeChip(t)).join(' ');
  return `
    <p class="small" style="margin:0">You'd move into <b>${esc(name)}</b>'s office; they'd move into yours. <span class="muted">Map shows the room after the swap; your new neighbors are outlined.</span></p>
    <div id="swapMap"></div>
    <div class="neighbors">
      <div><span class="nb-label">You want</span>${O.typeChip(v.me.wants, ` ${O.TYPE_WORDS[v.me.wants - 1]}`)}</div>
      <div><span class="nb-label">Neighbors now</span>${chips(nb.now)}</div>
      <div><span class="nb-label">After swap</span>${chips(nb.after)}</div>
    </div>
    <p class="muted small" style="margin:0">Your old neighbors get ${esc(name)} as a neighbor, and theirs get you. That changes their scores too.</p>`;
}

// The map is drawn as the room would look AFTER the swap, so the outlined
// neighbors show the same types as the "After swap" list (including the
// partner, if your two offices are adjacent).
function renderSwapMap(v, p) {
  const mine = v.me.office, theirs = v.grid.cells.findIndex(c => c && c.index === p);
  const cells = v.grid.cells.slice();
  [cells[mine], cells[theirs]] = [cells[theirs], cells[mine]];
  const marks = { [mine]: 'from', [theirs]: 'to' };
  for (const k of Offices.swapNeighbors(v.grid, mine, theirs).afterOffices) if (!marks[k]) marks[k] = 'nb';
  Offices.renderOfficeMap($('swapMap'), { ...v.grid, cells }, {
    showNames: false, marks,
    labels: { [theirs]: 'You', [mine]: cells[mine].name },
  });
}

function miniBlocks(n) {
  let h = '<span class="mini">';
  for (let k = 1; k <= 5; k++) h += `<i class="${k <= n ? 'on' : ''}"></i>`;
  return h + '</span>';
}

// Money: choose direction and amount. sheet.dir is 'me' (I pay) or 'they';
// the payment sent to the server is positive when I pay.
const payOf = () => (sheet.dir === 'they' ? -sheet.amt : sheet.amt);

function moneyControls(v) {
  return `
    <div class="money">
      <div class="seg">
        <button data-dir="me" class="${sheet.dir === 'me' ? 'on' : ''}">I pay</button>
        <button data-dir="they" class="${sheet.dir === 'they' ? 'on' : ''}">They pay me</button>
      </div>
      <div class="stepper">
        <button data-step="-1" aria-label="less">−</button><span id="amt">${sheet.amt}</span><button data-step="1" aria-label="more">+</button>
        <span class="muted small">tokens · you have ${v.me.tokens}</span>
      </div>
    </div>`;
}

function wireMoney(v) {
  const box = document.querySelector('.money');
  box.onclick = e => {
    const dirBtn = e.target.closest('[data-dir]'), step = e.target.closest('[data-step]');
    if (!dirBtn && !step) return;
    if (dirBtn) sheet.dir = dirBtn.dataset.dir;
    if (step) sheet.amt = Math.max(0, Math.min(64, sheet.amt + Number(step.dataset.step)));
    box.outerHTML = moneyControls(v);
    wireMoney(v);
    updatePreview(v);
  };
}

let previewSeq = 0;
async function updatePreview(v) {
  const seq = ++previewSeq;
  try {
    const pv = await api('preview', { partner: sheet.partner, pay: payOf() });
    if (seq !== previewSeq || !$('pv')) return;
    const before = v.me.score, after = before + pv.total;
    $('pv').className = 'preview ' + (pv.total > 1e-9 ? 'good' : 'bad');
    $('pv').innerHTML = `
      <div class="preview-main">Your score: <b>${fmt(before)} → ${fmt(after)}</b> <span>(${signed(pv.total)})</span></div>
      ${pv.money ? `<div class="muted small">Swap ${signed(pv.item)} · payment ${signed(pv.money)}</div>` : ''}
      ${pv.total <= 1e-9 ? '<div class="warn-text">This makes you worse off (or no better).</div>' : ''}`;
    $('offerBtn').disabled = false;
  } catch (err) {
    if ($('pv')) $('pv').textContent = err.message;
  }
}

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}
