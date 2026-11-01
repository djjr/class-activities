#!/usr/bin/env node
// Add bot students to a running Market Exchange session.
//
//   npm run fake -- --url http://localhost:3000 --key dev [--admin KEY] [--n 18] [--new] [--drive]
//
//   --admin  admin key, needed for --new and --drive (defaults to --key,
//            which works locally where ADMIN_KEY is unset)
//   --new    start a fresh session first
//   --drive  also run a whole scripted session (all three phases, three
//            rounds each: ordinary, Classifieds, Money), print the welfare
//            curves, and save it. Without --drive the bots just trade
//            whenever you open a round from the room view.
const { createBots } = require('../public/test/fake-class.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('url', 'http://localhost:3000')).replace(/\/$/, '');
const key = String(opt('key', 'dev'));
const admin = String(opt('admin', key));
const n = Number(opt('n', 18));
const roundSecs = Number(opt('round-secs', 10));

async function iapi(path, method = 'GET', body) {
  const res = await fetch(`${base}/api/i/${path}?key=${encodeURIComponent(key)}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Admin-Key': admin }, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.status);
  return json;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (opt('new', false)) await iapi('new', 'POST');
  const { code } = await iapi('current');
  const bots = createBots({ base, code, n, log: opt('verbose', false) ? console.log : () => {} });
  await bots.join();
  bots.start();
  console.log(`${n} bots joined session ${code} and are trading whenever a round is open.`);
  if (!opt('drive', false)) return;   // keep running until Ctrl-C

  for (const type of ['chairs', 'offices-random', 'offices-like-me']) {
    await iapi('phase', 'POST', { type });
    for (const round of [{}, { classifieds: true }, { money: true }]) {
      await iapi('round/open', 'POST', round);
      await sleep(roundSecs * 1000);
      await iapi('round/close', 'POST');
      await sleep(300);
    }
    const p = (await iapi('room')).phase;
    console.log(`\n${type}  (benchmark ${p.benchmark.kind} ${p.benchmark.welfare.toFixed(1)})`);
    for (const s of p.series) console.log(`  ${s.label.padEnd(18)} ${s.welfare.toFixed(1)}`);
    console.log(`  share of possible gain: ${Math.round(100 * p.gainShare)}%  trades: ${p.totalTrades}  harmful: ${p.harmfulTrades}` +
      (p.sorting != null ? `  sorting ${p.sortingStart.toFixed(2)} -> ${p.sorting.toFixed(2)}` : ''));
  }
  const saved = await iapi('save', 'POST');
  console.log(`\nSaved ${saved.id}`);
  bots.stop();
})().catch(e => { console.error(e.message); process.exit(1); });
