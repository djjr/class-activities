// Fake class: bot students that join a live session and trade through the
// real student API. Shared by public/test/fake-class.html (browser) and
// scripts/fake-class.js (Node 20+, which has fetch built in).
//
// Bot rules (deliberately simple, like the design simulation):
//   - Accept an incoming offer iff it raises my score (swap + payment).
//   - Each turn, if I have no pending offer, pick a partner: the top of my
//     classifieds in Classifieds rounds, otherwise someone at random.
//   - Offer the swap if it helps me. In Money rounds, share half my gain
//     as a payment; if the swap hurts me, sometimes ask to be paid for it.

(function (root) {
  const NAMES = ['Maya', 'Jordan', 'Priya', 'Sam', 'Diego', 'Lin', 'Ava', 'Kofi', 'Noor', 'Eli',
    'Rosa', 'Theo', 'Zara', 'Omar', 'Ines', 'Wen', 'Luca', 'Asha', 'Finn', 'Yuki', 'Nia', 'Ravi', 'Ada', 'Leo', 'Mei'];

  function createBots({ base = '', code, n = 18, tickMs = 700, log = () => {} }) {
    const bots = Array.from({ length: n }, (_, i) => ({
      pid: 'bot-' + Math.random().toString(36).slice(2, 10) + '-' + i,
      nickname: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (1 + Math.floor(i / NAMES.length)) : ''),
      busy: false,
    }));
    let timer = null;

    async function call(bot, path, body) {
      const res = await fetch(`${base}/api/s/${code}/${path}${body ? '' : `?pid=${bot.pid}`}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify({ pid: bot.pid, ...body }) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.status);
      return json;
    }

    async function turn(bot) {
      if (bot.busy) return;
      bot.busy = true;
      try {
        const st = await call(bot, 'state');
        if (st.state !== 'phase') return;
        const v = st.view;
        if (!v.round || !v.round.open) return;
        for (const o of v.incoming) {
          const accept = o.mine.total > 1e-9;
          try {
            await call(bot, 'respond', { offerId: o.id, accept });
            if (accept) { log(`${bot.nickname} accepted ${o.name}`); return; }
          } catch { /* stale: someone traded first */ }
        }
        if (v.outgoing) {
          // Give up on an offer after a few turns so bots keep searching.
          bot.waited = (bot.waited || 0) + 1;
          if (bot.waited > 4) { await call(bot, 'withdraw', {}); bot.waited = 0; }
          return;
        }
        if (Math.random() < 0.35) return;   // not everyone acts every turn
        const partner = v.round.classifieds && v.classifieds.length
          ? v.classifieds[Math.floor(Math.random() * Math.min(3, v.classifieds.length))].index
          : v.partners[Math.floor(Math.random() * v.partners.length)].index;
        const pv = await call(bot, 'preview', { partner });
        let pay = null;
        if (pv.item > 1e-9) {
          pay = v.round.money ? Math.min(v.me.tokens, Math.floor(pv.item / 2)) : 0;
        } else if (v.round.money && pv.item < 0 && Math.random() < 0.5) {
          pay = -(Math.ceil(-pv.item) + 2);   // ask to be paid for a swap that hurts me
        }
        if (pay !== null) { await call(bot, 'offer', { partner, pay }); bot.waited = 0; }
      } catch (e) {
        // Races (stale offers, round just closed) are normal; keep going.
      } finally {
        bot.busy = false;
      }
    }

    return {
      bots,
      async join() {
        for (const b of bots) await call(b, 'join', { nickname: b.nickname });
        log(`${bots.length} bots joined ${code}`);
      },
      start() {
        if (timer) return;
        timer = setInterval(() => bots.forEach(b => setTimeout(() => turn(b), Math.random() * tickMs)), tickMs);
      },
      stop() { clearInterval(timer); timer = null; },
    };
  }

  const api = { createBots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FakeClass = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
