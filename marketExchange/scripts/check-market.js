// Headless checks for market.js (phases, rounds, offers). Run: node scripts/check-market.js
const assert = require('assert');
const sim = require('../sim');
const m = require('../market');
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };
const members = Array.from({ length: 18 }, (_, i) => ({ pid: 'pid-' + i, nickname: i === 5 ? 'Sam' : i === 6 ? 'Sam' : 'Kid' + i }));
const throwsMsg = (fn, re) => assert.throws(fn, e => re.test(e.message));

test('duplicate nicknames become unique', () => {
  const p = m.startPhase('chairs', members, 1);
  assert.strictEqual(new Set(p.names).size, 18);
  assert(p.names.includes('Sam') && p.names.includes('Sam 2'));
});

test('no trading before a round opens; offers die when it closes', () => {
  const p = m.startPhase('chairs', members, 2);
  throwsMsg(() => m.makeOffer(p, 0, 1), /closed/);
  m.openRound(p);
  m.makeOffer(p, 0, 1);
  m.closeRound(p);
  assert.strictEqual(Object.keys(p.offers).length, 0);
  throwsMsg(() => m.openRound(p) || m.openRound(p), /already open/);
});

test('one outgoing offer per student: a new offer replaces the old', () => {
  const p = m.startPhase('chairs', members, 3); m.openRound(p);
  m.makeOffer(p, 0, 1); m.makeOffer(p, 0, 2);
  const mine = Object.values(p.offers).filter(o => o.from === 0);
  assert.strictEqual(mine.length, 1); assert.strictEqual(mine[0].to, 2);
});

test('accept swaps items, records trade, and welfare changes by dRoom', () => {
  const p = m.startPhase('chairs', members, 4); m.openRound(p);
  const w0 = sim.welfare(p.economy, p.holdings);
  const [h0, h1] = [p.holdings[0], p.holdings[1]];
  const o = m.makeOffer(p, 0, 1);
  const { trade } = m.respond(p, 1, o.id, true);
  assert.deepStrictEqual([p.holdings[0], p.holdings[1]], [h1, h0]);
  assert.strictEqual(sim.welfare(p.economy, p.holdings) - w0, trade.dRoom);
  assert.strictEqual(m.currentRound(p).trades.length, 1);
});

test('stale offers: once a party trades, offers involving them are gone or rejected', () => {
  const p = m.startPhase('chairs', members, 5); m.openRound(p);
  const a = m.makeOffer(p, 0, 1);      // 0 -> 1
  const c = m.makeOffer(p, 2, 0);      // 2 -> 0 (involves 0's chair)
  const d = m.makeOffer(p, 3, 1);      // 3 -> 1 (involves 1's chair)
  const e = m.makeOffer(p, 4, 5);      // unrelated
  m.respond(p, 1, a.id, true);
  assert(!p.offers[c.id] && !p.offers[d.id], 'offers involving the traders are removed');
  assert(p.offers[e.id], 'unrelated offer survives');
  throwsMsg(() => m.respond(p, 0, c.id, true), /no longer available/);
  assert(/expired/.test(p.notices[2].text) && /expired/.test(p.notices[3].text));
});

test('stale check catches a changed holding even if the offer survived', () => {
  const p = m.startPhase('chairs', members, 6); m.openRound(p);
  const o = m.makeOffer(p, 0, 1);
  [p.holdings[1], p.holdings[7]] = [p.holdings[7], p.holdings[1]];   // simulate an out-of-band change
  throwsMsg(() => m.respond(p, 1, o.id, true), /out of date/);
});

test('money: only in Money rounds, affordable, conserved, excluded from welfare', () => {
  const p = m.startPhase('chairs', members, 7); m.openRound(p);
  throwsMsg(() => m.makeOffer(p, 0, 1, 5), /only allowed in Money/);
  m.closeRound(p); m.openRound(p, { money: true });
  throwsMsg(() => m.makeOffer(p, 0, 1, 25), /only have 20/);
  const w0 = sim.welfare(p.economy, p.holdings);
  const o = m.makeOffer(p, 0, 1, 6);
  const { trade } = m.respond(p, 1, o.id, true);
  assert.strictEqual(p.tokens[0], 14); assert.strictEqual(p.tokens[1], 26);
  assert.strictEqual(p.tokens.reduce((s, x) => s + x, 0), 18 * sim.START_TOKENS);
  assert.strictEqual(sim.welfare(p.economy, p.holdings) - w0, trade.dRoom, 'tokens do not enter welfare');
  const v = m.studentView(p, 0);
  assert.strictEqual(v.me.score, v.me.itemScore - 6);
});

test('preview reports only the viewer\'s side, and matches the trade', () => {
  const p = m.startPhase('chairs', members, 8); m.openRound(p, { money: true });
  const pv = m.preview(p, 0, 1, 3);
  const eff = sim.tradeEffect(p.economy, p.holdings, 0, 1);
  assert.strictEqual(pv.item, eff.dA); assert.strictEqual(pv.money, -3); assert.strictEqual(pv.total, eff.dA - 3);
  assert(!('dB' in pv));
});

test('student view leaks no one else\'s target or score', () => {
  const p = m.startPhase('chairs', members, 9); m.openRound(p, { classifieds: true });
  const v = m.studentView(p, 0), json = JSON.stringify(v);
  for (let j = 1; j < 18; j++) {
    const t = JSON.stringify(p.economy.targets[j]);
    // A target vector can coincide with someone's public chair; only fail if it appears as a target field.
    assert(!('targets' in v) && !json.includes('"target":' + t) || JSON.stringify(v.me.target) === t);
  }
  assert(v.classifieds.every(c => c.gain > 0 && !('dB' in c)));
  assert(v.partners.length === 17 && v.partners.every(x => !('score' in x)));
});

test('offices: map shows types and phantoms, room view reports sorting', () => {
  const p = m.startPhase('offices-like-me', members, 10); m.openRound(p);
  const v = m.studentView(p, 0);
  assert.strictEqual(v.grid.rows * v.grid.cols, 20);
  assert.strictEqual(v.grid.cells.filter(c => c.kind === 'phantom').length, 2);
  assert.strictEqual(v.grid.cells.filter(c => c.kind === 'me').length, 1);
  assert(!JSON.stringify(v.grid).includes('wants'));
  const r = m.roomView(p);
  assert(typeof r.sorting === 'number' && r.grid);
});

test('snapshot contains no names or pids', () => {
  const p = m.startPhase('offices-random', members, 11); m.openRound(p);
  const o = m.makeOffer(p, 0, 1); m.respond(p, 1, o.id, true); m.closeRound(p);
  const s = JSON.stringify(m.snapshot(p));
  assert(!/pid-|Kid|Sam/.test(s));
});

test('live.json round-trip: state survives JSON serialization', () => {
  const p = m.startPhase('chairs', members, 12); m.openRound(p, { money: true });
  m.makeOffer(p, 0, 1, 2);
  const q = JSON.parse(JSON.stringify(p));
  const id = Object.keys(q.offers)[0];
  m.respond(q, 1, id, true);
  assert.strictEqual(q.tokens[0], 18);
});
console.log(`\n${n} checks passed`);
