# Market Exchange — Architecture (proof of concept)

**Status: draft for review (2026-10-31). Nothing built yet.**

The activity itself is specified in [SIMULATION.md](SIMULATION.md) and implemented in `sim.js`. This doc follows the shape of `roommateDesign/ARCHITECTURE.md` and reuses its decisions wherever they apply. The repo-level CLAUDE.md conventions hold: Node + Express, plain HTML/CSS/JS, no build step, dependencies `express` and `qrcode` only, names never written to disk, two-click confirms instead of `alert`/`confirm`, frame-ancestors CSP allowing slides.com, and `INSTRUCTOR_KEY` never committed.

## How it differs from roommateDesign

| | roommateDesign | marketExchange |
|---|---|---|
| Student interaction | Each student submits alone | Students make offers **to each other** |
| Time structure | Open → close | Phases → rounds, driven by the instructor |
| Live payload | Same aggregate for everyone | **Per-student** state (your item, score, offers) plus a shared room view |
| Server logic | Validate and aggregate | Economy generation, offer matching, welfare, benchmarks |

Per the repo's "generalize only when a second activity needs it" rule, session, QR, and SSE code is **copied** from roommateDesign rather than shared. A later refactor can extract it once both activities are stable.

## Components

```
Student phones ──► /s/ABCD ───┐
                              │  fetch (POST) + SSE (per-student stream)
Slide iframe ──► /i/welcome ──┤
Slide iframe ──► /i/room ─────┤   (projected view + controls)
                              ▼
                   Node/Express (single instance)
                   ├─ in-memory session
                   ├─ sim.js: newEconomy(), score(), applyTrade(),
                   │          classifieds(), benchmark(), snapshot()
                   └─ DATA_DIR (Railway volume)
                        ├─ live.json
                        └─ saved/<timestamp>-<code>.json
```

## Pages

| URL | Audience | Behavior |
|---|---|---|
| `/i/welcome?key=K` | Slide iframe | QR code, join code, "N joined". **New session** button. Same as roommateDesign. |
| `/i/room?key=K` | Slide iframe | Welfare chart, trade ticker, offices map, and controls (Start phase, Open round with Classifieds/Money, Close round, Save). |
| `/i/sessions?key=K` | Instructor browser | Saved sessions with JSON download. |
| `/s/ABCD` | Students | Nickname → wait → chair card or office view → Trade (names / classifieds / map) → offers. |
| `/test/fake-class.html?key=K` | Instructor browser | Bot students that join and trade only when both gain (see Testing). |

## API

`/api/i/*` routes require `key`.

| Method & path | Purpose |
|---|---|
| `GET  /api/i/current` | Current session (created if none) → `{code, joinUrl, qrSvg, counts, phase, round}` |
| `POST /api/i/new` | Discard the session and start fresh |
| `POST /api/i/phase` | `{type}` → generate a new economy for joined students; round 0 (closed) |
| `POST /api/i/round/open` | `{classifieds, money}` → open the next round |
| `POST /api/i/round/close` | Close it, withdraw pending offers, record welfare |
| `POST /api/i/save` · `GET /api/i/saved[/:id]` | Same as roommateDesign |
| `GET  /api/i/stream` | SSE: room view (welfare series, benchmark, ticker, map, counts) |
| `POST /api/s/:code/join` | `{pid, nickname}` |
| `GET  /api/s/:code/stream?pid=` | SSE: **this student's** view: item, private target, score, tokens, round state, incoming/outgoing offers, partner list or classifieds |
| `POST /api/s/:code/preview` | `{pid, partner, pay?}` → your score change only |
| `POST /api/s/:code/offer` | `{pid, partner, pay?}` → creates or replaces your one outgoing offer |
| `POST /api/s/:code/withdraw` | Withdraw your outgoing offer |
| `POST /api/s/:code/respond` | `{pid, offerId, accept}` → on accept, the server re-validates and applies the trade atomically |

`pid` is a browser UUID in `localStorage`, as in roommateDesign.

**Atomicity.** Node runs one request handler at a time, so `respond` can check the holdings and tokens and then apply the swap without locks. If either party's item changed since the offer was made (each offer stores the items it was made against), the offer is rejected as stale.

## Live state (in memory)

```js
session = {
  code, createdAt,
  participants: { [pid]: { nickname, joinedAt } },
  phase: null | {
    type, members: [pid...],            // fixed at phase start
    economy,                            // see SIMULATION.md
    holdings: { [pid]: itemIndex },     // current allocation
    tokens:   { [pid]: 20 },
    benchmark,                          // computed once at phase start
    rounds: [ { classifieds, money, open, welfareStart, welfareEnd, trades: [] } ],
    offers: { [offerId]: { from, to, fromItem, toItem, pay, createdAt } }
  },
  pastPhases: [ /* finished phases, same shape */ ]
}
```

Every change re-broadcasts: one room payload to instructor streams and one personalized payload per student stream. At 25 students this is trivial. `live.json` is written with a short debounce, as in roommateDesign.

## Benchmarks (computed in `sim.js` at phase start)

- **Chairs:** exact best assignment via the Hungarian algorithm, about 60 lines and O(n³). Instant at n ≤ 30.
- **Offices:** simulated annealing over swaps, a few thousand iterations. Well under a second in Node at this size. Shown as "best arrangement found," not "optimum."

## Testing plan

Still no test suite, matching repo practice, but:

1. **Bot class** (`public/test/fake-class.html` + `scripts/fake-class.js`): N bots join, and each round they make random offers and accept only if they gain. This replays the Python simulation through the real server, so the welfare curves should land near its numbers (chairs about 80% of possible gain after trading stalls; offices with random preferences showing some red swaps). That is an end-to-end check of the scoring, the offer protocol, and the benchmarks.
2. **Stale-offer races:** a script fires two acceptances that touch the same chair, and exactly one must succeed.
3. **Visual:** this session can run headless Chromium, so I can screenshot the student pages at phone width and the room view at slide size. That closes the gap roommateDesign still has. The chair card's readability from a distance still needs Dan's own look on a real phone.

## Railway

- A **new service** in the same project, repo `djjr/class-activities`, root directory `/marketExchange`.
- Its own volume at `/data` with `DATA_DIR=/data`, plus `INSTRUCTOR_KEY` and `PUBLIC_URL`. One replica.
- **Set Watch Paths on both services** (`/marketExchange/**` here, `/roommateDesign/**` on the existing one). Otherwise every push to `main` redeploys both services, including one that might be live in class.
- `/healthz` and `/version` as in roommateDesign.

## Decisions (from the 2026-10-31 design conversation)

1. Phases: Chairs, Offices: random, Offices: like me. The instructor picks each phase on the projected view.
2. Each round's Classifieds and Money toggles are set independently by the instructor at round open, in any order.
3. The app does the math, but each student sees only their own score change.
4. Students move around as much or as little as they like. The phone is a chair card meant to be held up.
5. A fresh economy is generated at each phase start for whoever is present. Phantoms fill office grids, never trade, and are not counted in welfare.
6. Folder name: `marketExchange`.
7. Score previews (`/preview`) are uncapped in every round type. The student's "You want" target is fixed for the whole phase; only holdings change.
