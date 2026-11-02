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
        // Nicknames must be unique, so if another batch of bots (or a real
        // student) already has this name, try "Maya 2", "Maya 3", ...
        for (const b of bots) {
          const base = b.nickname;
          for (let k = 2; ; k++) {
            try { await call(b, 'join', { nickname: b.nickname }); break; }
            catch (e) {
              if (!/already uses/.test(e.message) || k > 50) throw e;
              b.nickname = `${base} ${k}`;
            }
          }
        }
        log(`${bots.length} bots joined ${code}`);
      },
      start() {
        if (timer) return;
        const tick = () => bots.forEach(b => setTimeout(() => turn(b), Math.random() * tickMs));
        // Browsers slow timers in background tabs to about once a minute,
        // which would stall the bots while you watch the room view in another
        // tab. A Web Worker's timer isn't throttled that way, so in the
        // browser the worker sends the ticks. (Node just uses setInterval.)
        if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
          const src = `setInterval(() => postMessage(0), ${tickMs});`;
          const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
          w.onmessage = tick;
          timer = { stop: () => w.terminate() };
        } else {
          const id = setInterval(tick, tickMs);
          timer = { stop: () => clearInterval(id) };
        }
      },
      stop() { if (timer) timer.stop(); timer = null; },
      // What the bots are doing right now, for the status line on the page.
      async status() {
        const st = await call(bots[0], 'state');
        if (st.state === 'lobby') return { ok: false, text: 'Joined. Waiting for you to start a phase in the room view.' };
        if (st.state === 'waiting-next-phase') return { ok: false, text: 'These bots joined after the current phase started, so they wait for the next phase (start a new phase in the room view).' };
        const r = st.view.round;
        if (!r) return { ok: false, text: 'Phase started. Open a round in the room view and the bots will trade.' };
        if (!r.open) return { ok: false, text: `Round ${r.number} is closed. Open the next round to resume trading.` };
        return { ok: true, text: `Trading in round ${r.number}${r.classifieds ? ' · classifieds' : ''}${r.money ? ' · money' : ''}.` };
      },
    };
  }

  const api = { createBots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FakeClass = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
