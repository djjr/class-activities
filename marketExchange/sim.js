// Market Exchange: the simulation itself. See SIMULATION.md.
//
// Everything here is plain functions over plain data, with no server state,
// so it can be run headlessly (scripts/check-sim.js) and in the browser.
//
// Conventions:
//   - Students in a phase are indexed 0..n-1 (the server maps pid -> index).
//   - holdings[i] is the item student i holds: a chair index (chairs) or an
//     office index (offices). A swap exchanges two entries of holdings.
//   - All scores are on a 0..64 scale, higher is better.

const DIMS = [
  { id: 'shade',    label: 'Shade',    lo: 'pale',    hi: 'deep' },
  { id: 'style',    label: 'Style',    lo: 'classic', hi: 'modern' },
  { id: 'firmness', label: 'Firmness', lo: 'soft',    hi: 'firm' },
  { id: 'weight',   label: 'Weight',   lo: 'light',   hi: 'heavy' },
];
const LEVELS = 5;          // attribute values are 1..5
const MAX_SCORE = 64;      // 4 dims * (5-1)^2
const START_TOKENS = 20;
const PHASE_TYPES = ['chairs', 'offices-random', 'offices-like-me'];
const GRIDS = [[4, 4], [4, 5], [5, 5], [5, 6], [6, 6]];

// ---------------------------------------------------------------- randomness
// A small seeded generator (mulberry32) so an economy can be reproduced
// from its seed in tests. Strategy: never call Math.random inside the model;
// pass `rand` in, which keeps every function deterministic and testable.
function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
function shuffle(rand, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const randVec = rand => DIMS.map(() => randInt(rand, 1, LEVELS));

// ---------------------------------------------------------------- economies
// opts.grid = { rows, cols } overrides the headcount-based office grid
// (the slide demo uses 2 x 4 for 8 people, with no phantoms).
function newEconomy(type, n, rand, opts = {}) {
  if (!PHASE_TYPES.includes(type)) throw new Error(`Unknown phase type ${type}`);
  if (n < 2) throw new Error('Need at least 2 students');
  return type === 'chairs' ? newChairs(n, rand) : newOffices(type, n, rand, opts.grid);
}

function newChairs(n, rand) {
  return {
    type: 'chairs', n,
    targets: Array.from({ length: n }, () => randVec(rand)),
    chairs:  Array.from({ length: n }, () => randVec(rand)),
    start: Array.from({ length: n }, (_, i) => i),   // student i starts with chair i
  };
}

function gridFor(n) {
  for (const [rows, cols] of GRIDS) if (rows * cols >= n) return { rows, cols };
  throw new Error(`Too many students for an office grid (${n})`);
}

function newOffices(type, n, rand, grid) {
  const { rows, cols } = grid || gridFor(n);
  if (rows * cols < n) throw new Error('Grid too small');
  const types = Array.from({ length: n }, () => randInt(rand, 1, LEVELS));
  const wants = type === 'offices-like-me'
    ? types.slice()
    : Array.from({ length: n }, () => randInt(rand, 1, LEVELS));
  const offices = shuffle(rand, Array.from({ length: rows * cols }, (_, k) => k));
  const start = offices.slice(0, n);
  // Leftover offices hold phantoms: public type, never trade, not counted.
  const phantoms = offices.slice(n).map(office => ({ office, type: randInt(rand, 1, LEVELS) }));
  return { type, n, rows, cols, types, wants, phantoms, start };
}

// ---------------------------------------------------------------- scoring
function chairScore(e, student, chair) {
  const t = e.targets[student], c = e.chairs[chair];
  let d = 0;
  for (let k = 0; k < DIMS.length; k++) d += (t[k] - c[k]) ** 2;
  return MAX_SCORE - d;
}

function neighborsOf(e, office) {
  const r = Math.floor(office / e.cols), c = office % e.cols, out = [];
  if (r > 0) out.push(office - e.cols);
  if (r < e.rows - 1) out.push(office + e.cols);
  if (c > 0) out.push(office - 1);
  if (c < e.cols - 1) out.push(office + 1);
  return out;
}

// typeAt[office] = type of whoever sits there (student or phantom).
function officeTypes(e, holdings) {
  const typeAt = new Array(e.rows * e.cols).fill(null);
  holdings.forEach((office, i) => { typeAt[office] = e.types[i]; });
  for (const p of e.phantoms) typeAt[p.office] = p.type;
  return typeAt;
}

function officeScoreAt(e, typeAt, student, office) {
  const nb = neighborsOf(e, office);
  let d = 0;
  for (const m of nb) d += (e.wants[student] - typeAt[m]) ** 2;
  return MAX_SCORE - 4 * d / nb.length;
}

// Every student's item score under a given allocation.
function scores(e, holdings) {
  if (e.type === 'chairs') return holdings.map((chair, i) => chairScore(e, i, chair));
  const typeAt = officeTypes(e, holdings);
  return holdings.map((office, i) => officeScoreAt(e, typeAt, i, office));
}

const welfare = (e, holdings) => scores(e, holdings).reduce((s, x) => s + x, 0);

// Effect of swapping a's and b's items. Money is not included here: payments
// move score between the two traders and never change dRoom.
//   dA, dB  change in each trader's item score
//   dRoom   change in total welfare (= dA + dB for chairs; for offices it
//           also includes the effect on neighbors)
function tradeEffect(e, holdings, a, b) {
  if (e.type === 'chairs') {
    const dA = chairScore(e, a, holdings[b]) - chairScore(e, a, holdings[a]);
    const dB = chairScore(e, b, holdings[a]) - chairScore(e, b, holdings[b]);
    return { dA, dB, dRoom: dA + dB };
  }
  const before = scores(e, holdings);
  const after = scores(e, swapped(holdings, a, b));
  const sum = arr => arr.reduce((s, x) => s + x, 0);
  return { dA: after[a] - before[a], dB: after[b] - before[b], dRoom: sum(after) - sum(before) };
}

function swapped(holdings, a, b) {
  const h = holdings.slice();
  [h[a], h[b]] = [h[b], h[a]];
  return h;
}

// Classifieds for one student: every swap that would raise their own score,
// best first. Only the viewer's own gain is reported.
function classifieds(e, holdings, student) {
  const out = [];
  for (let j = 0; j < e.n; j++) {
    if (j === student) continue;
    const { dA } = tradeEffect(e, holdings, student, j);
    if (dA > 0) out.push({ partner: j, gain: dA });
  }
  return out.sort((x, y) => y.gain - x.gain);
}

// ---------------------------------------------------------------- benchmarks
// Chairs: the exact welfare-maximizing assignment, via the Hungarian
// algorithm (O(n^3)). This is the potential-based version: it keeps "prices"
// u (rows) and v (columns) and grows a matching one row at a time along
// shortest augmenting paths. We minimize cost = MAX_SCORE - utility.
function hungarianMax(U) {
  const n = U.length, INF = Infinity;
  const cost = (i, j) => MAX_SCORE - U[i][j];
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assign = new Array(n);
  for (let j = 1; j <= n; j++) assign[p[j] - 1] = j - 1;   // row -> column
  return assign;
}

// Offices: the true optimum is a quadratic assignment problem (NP-hard), so
// we use simulated annealing: random swaps, always accept improvements, and
// accept a worse swap with a probability that shrinks as the "temperature"
// cools. Accepting some bad moves early is what keeps it from getting stuck.
function annealOffices(e, rand, iters = 6000, restarts = 3) {
  let best = -Infinity;
  for (let r = 0; r < restarts; r++) {
    let h = shuffle(rand, e.start.slice());
    let w = welfare(e, h);
    for (let t = 0; t < iters; t++) {
      const temp = 8 * (1 - t / iters) + 1e-3;
      const a = Math.floor(rand() * e.n);
      let b = Math.floor(rand() * (e.n - 1)); if (b >= a) b++;
      const h2 = swapped(h, a, b), w2 = welfare(e, h2);
      if (w2 >= w || rand() < Math.exp((w2 - w) / temp)) { h = h2; w = w2; }
      if (w > best) best = w;
    }
  }
  return best;
}

function benchmark(e, rand) {
  if (e.type === 'chairs') {
    const U = e.targets.map((_, i) => e.chairs.map((_, j) => chairScore(e, i, j)));
    const assign = hungarianMax(U);
    return { kind: 'optimum', welfare: assign.reduce((s, j, i) => s + U[i][j], 0) };
  }
  return { kind: 'best-found', welfare: annealOffices(e, rand) };
}

const MarketSim = {
  DIMS, LEVELS, MAX_SCORE, START_TOKENS, PHASE_TYPES,
  makeRng, newEconomy, gridFor, neighborsOf, officeTypes,
  chairScore, scores, welfare, tradeEffect, swapped, classifieds,
  hungarianMax, benchmark,
};

// Works both in Node (require) and in the browser (<script src="/sim.js">).
if (typeof module !== 'undefined' && module.exports) module.exports = MarketSim;
else globalThis.MarketSim = MarketSim;
