// Headless checks for sim.js. Run: node scripts/check-sim.js
// 1. Hungarian algorithm matches brute force on small cases.
// 2. Bot classes reproduce the Python simulation's qualitative results.
const sim = require('../sim');
const rand = sim.makeRng(2026);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };

function* perms(a, k = 0) {
  if (k === a.length) { yield a.slice(); return; }
  for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; yield* perms(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
}

console.log('Hungarian vs brute force (200 random 6x6 cases)');
let hOk = true;
for (let t = 0; t < 200; t++) {
  const e = sim.newEconomy('chairs', 6, rand);
  const U = e.targets.map((_, i) => e.chairs.map((_, j) => sim.chairScore(e, i, j)));
  let brute = -Infinity;
  for (const p of perms([0, 1, 2, 3, 4, 5])) brute = Math.max(brute, p.reduce((s, j, i) => s + U[i][j], 0));
  if (sim.benchmark(e, rand).welfare !== brute) hOk = false;
}
check(hOk, 'optimum always equals brute force');

// Bots: random pairs meet; swap iff both strictly gain.
function tradeRound(e, h, log) {
  const order = Array.from({ length: e.n }, (_, i) => i).sort(() => rand() - 0.5);
  let trades = 0;
  for (let k = 0; k + 1 < order.length; k += 2) {
    const [a, b] = [order[k], order[k + 1]];
    const eff = sim.tradeEffect(e, h, a, b);
    if (eff.dA > 0 && eff.dB > 0) { [h[a], h[b]] = [h[b], h[a]]; trades++; log && log.push(eff.dRoom); }
  }
  return trades;
}
function stable(e, h) {
  for (let a = 0; a < e.n; a++) for (let b = a + 1; b < e.n; b++) {
    const eff = sim.tradeEffect(e, h, a, b); if (eff.dA > 0 && eff.dB > 0) return false;
  }
  return true;
}

const N = 18, TRIALS = 300;
console.log(`\nChairs: ${TRIALS} bot classes of ${N}`);
let share = 0, below = 0, dRoomOk = true;
for (let t = 0; t < TRIALS; t++) {
  const e = sim.newEconomy('chairs', N, rand), h = e.start.slice();
  const w0 = sim.welfare(e, h), opt = sim.benchmark(e, rand).welfare;
  const log = [];
  for (let r = 0; r < 500 && !stable(e, h); r++) tradeRound(e, h, log);
  if (log.some(d => d <= 0)) dRoomOk = false;
  const w = sim.welfare(e, h);
  share += (w - w0) / (opt - w0); if (w < opt) below++;
}
console.log(`  trade-to-exhaustion reaches ${(100 * share / TRIALS).toFixed(0)}% of possible gain (Python: 81%)`);
check(dRoomOk, 'every chair trade raised room welfare');
check(below / TRIALS > 0.9, `stalls below optimum in ${(100 * below / TRIALS).toFixed(0)}% of classes`);

for (const type of ['offices-random', 'offices-like-me']) {
  console.log(`\n${type}: ${TRIALS} bot classes of ${N}`);
  let harmful = 0, total = 0, fell = 0, gap = 0, beat = 0, sort0 = 0, sort1 = 0;
  const sorting = (e, h) => {
    const typeAt = sim.officeTypes(e, h); let s = 0, c = 0;
    for (let k = 0; k < typeAt.length; k++) for (const m of sim.neighborsOf(e, k)) if (m > k) { s += Math.abs(typeAt[k] - typeAt[m]); c++; }
    return s / c;
  };
  for (let t = 0; t < TRIALS; t++) {
    const e = sim.newEconomy(type, N, rand), h = e.start.slice();
    sort0 += sorting(e, h);
    const log = []; let prev = sim.welfare(e, h), dropped = false;
    for (let r = 0; r < 6; r++) { tradeRound(e, h, log); const w = sim.welfare(e, h); if (w < prev - 1e-9) dropped = true; prev = w; }
    sort1 += sorting(e, h);
    harmful += log.filter(d => d < 0).length; total += log.length; if (dropped) fell++;
    const best = sim.benchmark(e, rand).welfare; if (best >= prev - 1e-9) beat++;
  }
  console.log(`  grid ${sim.gridFor(N).rows}x${sim.gridFor(N).cols}, ${total / TRIALS | 0} trades per class over 6 rounds`);
  console.log(`  mutually beneficial swaps that lowered room welfare: ${(100 * harmful / total).toFixed(0)}%`);
  console.log(`  classes where welfare fell in some round: ${(100 * fell / TRIALS).toFixed(0)}%`);
  console.log(`  neighbor type difference: ${(sort0 / TRIALS).toFixed(2)} -> ${(sort1 / TRIALS).toFixed(2)}`);
  check(beat === TRIALS, 'annealing benchmark is never beaten by bot trading');
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
