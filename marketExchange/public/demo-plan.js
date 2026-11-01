// Slide demo planner: computes the whole demo up front, as a list of events,
// from a seed. The page (demo.js) only animates the list.
//
// Strategy: separating "what happens" from "how it's shown" means the story
// is deterministic (same seed => same economy and same events in every pane
// that shares it), testable in Node, and searchable for good default seeds.
//
// plan({ phase, classifieds, money, seed, n = 8, meetings = 24 }) ->
//   { economy, names, start, best, events: [...], final }
// Event kinds:
//   meet    { a, b, dA, dB, traders, dRoom, pay, deal, why, holdings, welfare, deltas, tokens }
//   search  { a, found: false }                       (classifieds: nobody on a's list says yes)
//   stable  {}                                       (no trade left that this market allows)

(function (root) {
  const sim = (typeof module !== 'undefined' && module.exports) ? require('../sim') : root.MarketSim;
  const NAMES = ['Ava', 'Kofi', 'Lin', 'Omar', 'Rosa', 'Theo', 'Zara', 'Diego'];

  // split: how a payment divides the gain when one side would lose.
  //   even   compensate the loser, then split the rest evenly (default)
  //   winner pay just enough for the loser to accept; the winner keeps the rest
  //   loser  pay nearly the whole gain; the loser gets most of it
  // Payments only move tokens, so the split changes who gains, not how much
  // the room gains, unless someone runs out of tokens and a later deal fails.
  function plan({ phase = 'chairs', classifieds = false, money = false, split = 'even', seed = 1, n = 8, meetings = 24 } = {}) {
    // The economy depends only on (phase, seed), so panes that differ only in
    // institutions start from the same people, chairs, and benchmark.
    const econRand = sim.makeRng(seed);
    const economy = sim.newEconomy(phase, n, econRand, phase === 'chairs' ? {} : { grid: { rows: 2, cols: 4 } });
    const best = sim.benchmark(economy, econRand).welfare;
    // Meetings use a separate stream, so turning an institution on doesn't
    // change the economy, only who meets whom.
    const rand = sim.makeRng(seed * 7919 + 17);
    const holdings = economy.start.slice();
    const start = sim.welfare(economy, holdings);
    // Everyone starts with the same tokens as in the real game. Payments move
    // tokens between people but never change room welfare.
    const tokens = new Array(n).fill(sim.START_TOKENS);
    const events = [];

    // Would these two trade, and with what payment? Traders look only at their
    // own scores (never at neighbors): that is the externality.
    function deal(a, b) {
      const { dA, dB, dRoom } = sim.tradeEffect(economy, holdings, a, b);
      const base = { a, b, dA, dB, traders: dA + dB, dRoom, pay: 0 };
      if (dA > 1e-9 && dB > 1e-9) return { ...base, deal: true, why: 'both' };
      if (!money) return { ...base, deal: false, why: dA <= 1e-9 && dB <= 1e-9 ? 'neither' : 'one' };
      // Money: the winner pays the loser enough to make it worth their while,
      // splitting the surplus. Payments are whole tokens, so tiny surpluses fail.
      const surplus = dA + dB;
      if (surplus <= 1e-9) return { ...base, deal: false, why: 'no-surplus' };
      const loserIsA = dA <= dB, dL = loserIsA ? dA : dB, dW = loserIsA ? dB : dA;
      const lo = Math.floor(-dL) + 1, hi = Math.ceil(dW) - 1;   // loser needs > -dL, winner keeps > 0
      if (lo > hi) return { ...base, deal: false, why: 'no-surplus' };
      // The winner pays, and can only pay what they have.
      const payer = loserIsA ? b : a;
      const target = split === 'winner' ? lo : split === 'loser' ? hi : Math.round(-dL + surplus / 2);
      const p = Math.min(hi, Math.max(lo, target), tokens[payer]);
      if (p < lo) return { ...base, deal: false, why: 'broke', payer };
      // pay > 0 means a pays b (same convention as market.js)
      return { ...base, deal: true, why: 'paid', pay: loserIsA ? -p : p };
    }

    function anyTradeLeft() {
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (deal(a, b).deal) return true;
      return false;
    }

    function apply(d) {
      const before = sim.scores(economy, holdings);
      [holdings[d.a], holdings[d.b]] = [holdings[d.b], holdings[d.a]];
      tokens[d.a] -= d.pay; tokens[d.b] += d.pay;
      const after = sim.scores(economy, holdings);
      return { deltas: after.map((x, i) => x - before[i]) };
    }

    let turn = 0;
    for (let m = 0; m < meetings; m++) {
      if (!anyTradeLeft()) { events.push({ kind: 'stable' }); break; }
      let d;
      if (classifieds) {
        // Someone with a non-empty list goes down it, best first, until a
        // partner says yes (or nobody does).
        const order = Array.from({ length: n }, (_, k) => (turn + k) % n);
        turn++;
        const a = order.find(i => sim.classifieds(economy, holdings, i).length) ?? order[0];
        const list = sim.classifieds(economy, holdings, a);
        d = list.map(c => deal(a, c.partner)).find(x => x.deal);
        if (!d) { events.push({ kind: 'search', a, found: false, listed: list.length }); continue; }
      } else {
        // Plain market: two people happen to meet.
        const a = Math.floor(rand() * n);
        let b = Math.floor(rand() * (n - 1)); if (b >= a) b++;
        d = deal(a, b);
      }
      const ev = { kind: 'meet', ...d };
      if (d.deal) Object.assign(ev, apply(d));
      ev.holdings = holdings.slice();
      ev.tokens = tokens.slice();
      ev.welfare = sim.welfare(economy, holdings);
      events.push(ev);
    }
    const trades = events.filter(e => e.kind === 'meet' && e.deal);
    return {
      phase, classifieds, money, split, seed, n, meetings,
      economy, names: NAMES.slice(0, n), start, best, events,
      final: {
        welfare: sim.welfare(economy, holdings),
        trades: trades.length,
        harmful: trades.filter(e => e.dRoom < -1e-9).length,
        meetings: events.filter(e => e.kind !== 'stable').length,
        tokens: tokens.slice(),
      },
    };
  }

  const api = { plan, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DemoPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
