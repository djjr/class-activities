// Market Exchange: phases, rounds, and offers.
//
// sim.js knows the economics (scores, trade effects, benchmarks). This file
// knows the *game*: who is in the phase, whether a round is open, which
// offers are pending, and what each person is allowed to see. It is a set of
// functions over one plain `phase` object, so the whole state can be written
// to live.json and restored after a redeploy without any special handling.
//
// Errors a student should see are thrown as Error with a user-facing message.

const crypto = require('crypto');
const sim = require('./sim');

const MAX_PAY = 64;   // a payment never needs to exceed the whole score range

// ---------------------------------------------------------------- lifecycle

// members: [{ pid, nickname }] in join order. The phase never references
// pids again after this; students are indices 0..n-1 inside the phase.
function startPhase(type, members, seed = crypto.randomInt(2 ** 31)) {
  const rand = sim.makeRng(seed);
  const order = members.slice();
  // Shuffle so index order carries no information about join order.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = order.length;
  const economy = sim.newEconomy(type, n, rand);
  const holdings = economy.start.slice();
  return {
    type, seed, createdAt: new Date().toISOString(),
    pids: order.map(m => m.pid),
    names: uniqueNames(order.map(m => m.nickname)),
    economy,
    holdings,
    tokens: new Array(n).fill(sim.START_TOKENS),
    benchmark: sim.benchmark(economy, rand),
    startWelfare: sim.welfare(economy, holdings),
    rounds: [],          // [{ classifieds, money, open, welfareStart, welfareEnd, trades }]
    offers: {},          // id -> { id, from, to, fromItem, toItem, pay }
    notices: {},         // index -> { id, text }: latest message for that student's phone
    noticeSeq: 0,
  };
}

// Two students called "Sam" become "Sam" and "Sam 2" so trade lists are unambiguous.
function uniqueNames(names) {
  const seen = {};
  return names.map((raw, i) => {
    const base = (raw || '').trim() || `Student ${i + 1}`;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base} ${seen[base]}`;
  });
}

const currentRound = p => p.rounds[p.rounds.length - 1] || null;
const isOpen = p => !!(currentRound(p) && currentRound(p).open);

function openRound(p, { classifieds = false, money = false } = {}) {
  if (isOpen(p)) throw new Error('A round is already open');
  p.rounds.push({
    classifieds: !!classifieds, money: !!money, open: true,
    openedAt: new Date().toISOString(),
    welfareStart: welfareNow(p), welfareEnd: null, trades: [],
  });
}

function closeRound(p) {
  const r = currentRound(p);
  if (!r || !r.open) throw new Error('No round is open');
  r.open = false;
  r.welfareEnd = welfareNow(p);
  r.closedAt = new Date().toISOString();
  p.offers = {};   // pending offers die with the round
}

// Phones show a notice as a brief toast when its id changes.
function notify(p, i, text) { p.notices[i] = { id: ++p.noticeSeq, text }; }

const welfareNow = p => sim.welfare(p.economy, p.holdings);

// ---------------------------------------------------------------- scores
// What a student sees as "score": item score plus net tokens. Tokens only
// exist in the student's view once a Money round has happened, so Chairs
// without money shows plain item scores.
function itemScores(p) { return sim.scores(p.economy, p.holdings); }
const netTokens = (p, i) => p.tokens[i] - sim.START_TOKENS;

// Effect of a proposed swap from `viewer`'s side only.
// pay > 0 means `from` pays `to`. Returns item and money parts separately.
function sideOf(p, viewer, from, to, pay) {
  const eff = sim.tradeEffect(p.economy, p.holdings, from, to);
  const item = viewer === from ? eff.dA : eff.dB;
  const money = viewer === from ? -pay : pay;
  return { item, money, total: item + money };
}

function checkPay(p, pay) {
  pay = Number(pay) || 0;
  if (!Number.isInteger(pay) || Math.abs(pay) > MAX_PAY) throw new Error('Payment must be a whole number of tokens');
  if (pay !== 0 && !currentRound(p)?.money) throw new Error('Payments are only allowed in Money rounds');
  return pay;
}

function checkPartner(p, me, partner) {
  if (!Number.isInteger(partner) || partner < 0 || partner >= p.pids.length) throw new Error('Unknown trading partner');
  if (partner === me) throw new Error("You can't trade with yourself");
}

// ---------------------------------------------------------------- offers
function preview(p, me, partner, pay = 0) {
  checkPartner(p, me, partner);
  pay = checkPay(p, pay);
  const before = itemScores(p)[me];
  const side = sideOf(p, me, me, partner, pay);
  return { before, afterItem: before + side.item, item: side.item, money: side.money, total: side.total };
}

function makeOffer(p, me, partner, pay = 0) {
  if (!isOpen(p)) throw new Error('Trading is closed right now');
  checkPartner(p, me, partner);
  pay = checkPay(p, pay);
  // Payments must be affordable now; they are re-checked on acceptance.
  if (pay > 0 && p.tokens[me] < pay) throw new Error(`You only have ${p.tokens[me]} tokens`);
  if (pay < 0 && p.tokens[partner] < -pay) throw new Error(`${p.names[partner]} only has ${p.tokens[partner]} tokens`);
  withdraw(p, me);   // one outgoing offer at a time: a new one replaces the old
  const id = crypto.randomBytes(6).toString('hex');
  p.offers[id] = { id, from: me, to: partner, fromItem: p.holdings[me], toItem: p.holdings[partner], pay };
  return p.offers[id];
}

function withdraw(p, me) {
  for (const [id, o] of Object.entries(p.offers)) if (o.from === me) delete p.offers[id];
}

// Accept or decline. Acceptance re-validates everything, because the world
// may have changed since the offer was made (either party may have traded).
// Node handles one request at a time, so check-then-apply is atomic here.
function respond(p, me, offerId, accept) {
  const o = p.offers[offerId];
  if (!o || o.to !== me) throw new Error('That offer is no longer available');
  delete p.offers[offerId];
  if (!accept) {
    notify(p, o.from, `${p.names[me]} declined your offer.`);
    return { accepted: false };
  }
  if (!isOpen(p)) throw new Error('Trading is closed right now');
  if (p.holdings[o.from] !== o.fromItem || p.holdings[o.to] !== o.toItem) {
    notify(p, o.from, `Your offer to ${p.names[me]} expired: one of you traded first.`);
    throw new Error('That offer is out of date: one of you has traded since it was made');
  }
  const payer = o.pay > 0 ? o.from : o.to, amount = Math.abs(o.pay);
  if (amount && p.tokens[payer] < amount) throw new Error(`${p.names[payer]} no longer has enough tokens`);

  const eff = sim.tradeEffect(p.economy, p.holdings, o.from, o.to);
  [p.holdings[o.from], p.holdings[o.to]] = [p.holdings[o.to], p.holdings[o.from]];
  p.tokens[o.from] -= o.pay;
  p.tokens[o.to] += o.pay;
  const trade = {
    a: o.from, b: o.to, pay: o.pay,
    dA: eff.dA, dB: eff.dB, dRoom: eff.dRoom,
    at: new Date().toISOString(),
  };
  currentRound(p).trades.push(trade);
  notify(p, o.from, `${p.names[me]} accepted your offer!`);

  // Any other pending offer that involves either trader is now stale.
  for (const [id, other] of Object.entries(p.offers)) {
    if ([o.from, o.to].includes(other.from) || [o.from, o.to].includes(other.to)) {
      if (other.from !== o.from && other.from !== o.to) {
        notify(p, other.from, `Your offer to ${p.names[other.to]} expired: someone traded.`);
      }
      delete p.offers[id];
    }
  }
  return { accepted: true, trade };
}

// ---------------------------------------------------------------- views
// Everything a single student may see. Never includes other students'
// targets, preferences, or scores.
function studentView(p, me) {
  const e = p.economy, r = currentRound(p), scoresNow = itemScores(p);
  const view = {
    type: p.type,
    round: r ? { number: p.rounds.length, open: r.open, classifieds: r.classifieds, money: r.money } : null,
    moneyEver: p.rounds.some(x => x.money),
    me: {
      index: me, name: p.names[me],
      itemScore: scoresNow[me],
      tokens: p.tokens[me],
      score: scoresNow[me] + netTokens(p, me),
    },
    partners: p.names.map((name, i) => ({ index: i, name })).filter(x => x.index !== me)
      .sort((a, b) => a.name.localeCompare(b.name)),
    outgoing: null, incoming: [],
    notice: p.notices[me] || null,
  };
  if (e.type === 'chairs') {
    view.dims = sim.DIMS;
    view.me.chair = e.chairs[p.holdings[me]];
    view.me.target = e.targets[me];
    // Everyone's chair is public (they're holding it up), so the trade
    // screen can show the partner's chair next to your score change.
    view.chairs = p.holdings.map(c => e.chairs[c]);
  } else {
    view.me.type = e.types[me];
    view.me.wants = e.wants[me];
    view.me.office = p.holdings[me];
    const occupant = new Array(e.rows * e.cols).fill(null);
    p.holdings.forEach((office, i) => { occupant[office] = { kind: i === me ? 'me' : 'student', index: i, name: p.names[i], type: e.types[i] }; });
    for (const ph of e.phantoms) occupant[ph.office] = { kind: 'phantom', type: ph.type };
    view.grid = { rows: e.rows, cols: e.cols, cells: occupant };
  }
  if (r && r.open && r.classifieds) {
    view.classifieds = sim.classifieds(e, p.holdings, me)
      .map(c => ({ index: c.partner, name: p.names[c.partner], gain: c.gain }));
  }
  for (const o of Object.values(p.offers)) {
    if (o.from === me) view.outgoing = { id: o.id, to: o.to, name: p.names[o.to], pay: o.pay, mine: sideOf(p, me, o.from, o.to, o.pay) };
    if (o.to === me) view.incoming.push({ id: o.id, from: o.from, name: p.names[o.from], pay: o.pay, mine: sideOf(p, me, o.from, o.to, o.pay) });
  }
  return view;
}

// The projected room view. Names are included (instructor stream only);
// the page hides them unless "Show names" is on.
function roomView(p) {
  const e = p.economy, r = currentRound(p);
  const series = [{ label: 'Start', welfare: p.startWelfare, final: true }];
  p.rounds.forEach((x, k) => series.push({
    label: `R${k + 1}` + (x.classifieds ? ' · Classifieds' : '') + (x.money ? ' · Money' : ''),
    welfare: x.open ? welfareNow(p) : x.welfareEnd, final: !x.open,
  }));
  const now = welfareNow(p);
  const gainShare = p.benchmark.welfare > p.startWelfare
    ? (now - p.startWelfare) / (p.benchmark.welfare - p.startWelfare) : null;
  const ticker = [];
  p.rounds.forEach((x, k) => x.trades.forEach(t => ticker.push({ round: k + 1, ...t, nameA: p.names[t.a], nameB: p.names[t.b] })));
  const view = {
    type: p.type, n: p.pids.length,
    round: r ? { number: p.rounds.length, open: r.open, classifieds: r.classifieds, money: r.money } : null,
    welfare: now, startWelfare: p.startWelfare, benchmark: p.benchmark, gainShare,
    series,
    ticker: ticker.slice(-14).reverse(),
    tradesThisRound: r ? r.trades.length : 0,
    pendingOffers: Object.keys(p.offers).length,
    harmfulTrades: ticker.filter(t => t.dRoom < -1e-9).length,
    totalTrades: ticker.length,
  };
  if (e.type !== 'chairs') {
    const cells = new Array(e.rows * e.cols).fill(null);
    p.holdings.forEach((office, i) => { cells[office] = { kind: 'student', index: i, name: p.names[i], type: e.types[i] }; });
    for (const ph of e.phantoms) cells[ph.office] = { kind: 'phantom', type: ph.type };
    view.grid = { rows: e.rows, cols: e.cols, cells };
    view.sorting = sortingIndex(e, p.holdings);
    view.sortingStart = sortingIndex(e, e.start);
  }
  return view;
}

// Average |type difference| between neighbors. Lower = more sorted.
function sortingIndex(e, holdings) {
  const typeAt = sim.officeTypes(e, holdings);
  let s = 0, c = 0;
  for (let k = 0; k < typeAt.length; k++) for (const m of sim.neighborsOf(e, k)) if (m > k) { s += Math.abs(typeAt[k] - typeAt[m]); c++; }
  return s / c;
}

// A one-line summary of a finished phase, for the room view's history strip.
function phaseSummary(p) {
  const last = p.rounds.length ? (currentRound(p).welfareEnd ?? welfareNow(p)) : p.startWelfare;
  return { type: p.type, n: p.pids.length, startWelfare: p.startWelfare, endWelfare: last, benchmark: p.benchmark.welfare, rounds: p.rounds.length };
}

// ---------------------------------------------------------------- snapshot
// Anonymized record of a phase for saved/. No names, no pids. Students are
// already in shuffled order inside the phase, so indices reveal nothing.
function snapshot(p) {
  const e = p.economy;
  return {
    type: p.type, n: p.pids.length, seed: p.seed,
    grid: e.type === 'chairs' ? null : { rows: e.rows, cols: e.cols },
    economy: e,
    benchmark: p.benchmark,
    startWelfare: p.startWelfare,
    rounds: p.rounds.map(r => ({
      classifieds: r.classifieds, money: r.money,
      welfareStart: r.welfareStart, welfareEnd: r.welfareEnd ?? welfareNow(p),
      trades: r.trades.map(({ a, b, pay, dA, dB, dRoom }) => ({ a, b, pay, dA, dB, dRoom })),
    })),
    finalHoldings: p.holdings.slice(),
    finalTokens: p.tokens.slice(),
  };
}

module.exports = {
  startPhase, openRound, closeRound, isOpen, currentRound,
  preview, makeOffer, withdraw, respond,
  studentView, roomView, phaseSummary, snapshot,
};
