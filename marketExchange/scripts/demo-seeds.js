// Search for demo seeds that tell the story clearly. Run: node scripts/demo-seeds.js
const { plan } = require('../public/demo-plan.js');
const share = p => (p.final.welfare - p.start) / (p.best - p.start);
const rows = [];
for (let seed = 1; seed <= 400; seed++) {
  const c = {}, o = {};
  for (const [k, opts] of Object.entries({ plain: {}, cls: { classifieds: true }, money: { money: true }, both: { classifieds: true, money: true } })) {
    c[k] = plan({ phase: 'chairs', seed, ...opts });
    o[k] = plan({ phase: 'offices-random', seed, ...opts });
  }
  const noDeals = c.plain.events.filter(e => e.kind === 'meet' && !e.deal).length;
  rows.push({ seed, cp: share(c.plain), cc: share(c.cls), cm: share(c.money), cb: share(c.both), noDeals, ctrades: c.plain.final.trades,
              op: share(o.plain), oc: share(o.cls), oharmP: o.plain.final.harmful, oharmC: o.cls.final.harmful, otrades: o.plain.final.trades });
}
// chairs: plain clearly stalls, classifieds better, money (with classifieds) near the top; several trades and no-deals in plain
const chairs = rows.filter(r => r.cp > 0.3 && r.cp < 0.6 && r.cc > r.cp + 0.2 && r.cb > 0.95 && r.ctrades >= 4 && r.noDeals >= 8)
  .sort((a, b) => (b.cc - b.cp) - (a.cc - a.cp)).slice(0, 6);
console.log('chairs candidates'); chairs.forEach(r => console.log(`  seed ${r.seed}: plain ${(100*r.cp)|0}% (${r.ctrades} trades, ${r.noDeals} no-deals) · classifieds ${(100*r.cc)|0}% · money ${(100*r.cm)|0}% · both ${(100*r.cb)|0}%`));
const offices = rows.filter(r => r.oharmP >= 1 && r.oharmC >= 1 && r.otrades >= 4).sort((a, b) => (b.oharmP + b.oharmC) - (a.oharmP + a.oharmC)).slice(0, 6);
console.log('offices-random candidates'); offices.forEach(r => console.log(`  seed ${r.seed}: plain ${(100*r.op)|0}% (${r.otrades} trades, ${r.oharmP} harmful) · classifieds ${(100*r.oc)|0}% (${r.oharmC} harmful)`));

// offices-like-me: want visible sorting with several trades in the plain market
{
  const sim = require('../sim');
  const sorting = (e, h) => { const t = sim.officeTypes(e, h); let s = 0, c = 0;
    for (let k = 0; k < t.length; k++) for (const m of sim.neighborsOf(e, k)) if (m > k) { s += Math.abs(t[k] - t[m]); c++; } return s / c; };
  const out = [];
  for (let seed = 1; seed <= 400; seed++) {
    const p = plan({ phase: 'offices-like-me', seed }), c = plan({ phase: 'offices-like-me', seed, classifieds: true });
    const last = ev => [...ev.events].reverse().find(e => e.holdings)?.holdings || p.economy.start;
    const s0 = sorting(p.economy, p.economy.start), sp = sorting(p.economy, last(p)), sc = sorting(c.economy, last(c));
    const share = q => (q.final.welfare - q.start) / (q.best - q.start);
    if (p.final.trades >= 3 && share(p) < 0.8 && share(c) > share(p) + 0.1 && s0 - sc > 0.3)
      out.push({ seed, trades: p.final.trades, sp: share(p), sc: share(c), s0, sp_: sp, sc_: sc });
  }
  out.sort((a, b) => (b.s0 - b.sc_) - (a.s0 - a.sc_));
  console.log('offices-like-me candidates');
  out.slice(0, 6).forEach(r => console.log(`  seed ${r.seed}: plain ${(100*r.sp)|0}% (${r.trades} trades), classifieds ${(100*r.sc)|0}% · sorting ${r.s0.toFixed(2)} -> plain ${r.sp_.toFixed(2)}, classifieds ${r.sc_.toFixed(2)}`));
}
