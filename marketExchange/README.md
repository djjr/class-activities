# Market Exchange

Students trade chairs, then offices, while the room tracks aggregate welfare round by round. See [SIMULATION.md](SIMULATION.md) for the activity and [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

**Status:** core model (`sim.js`) and the chair card are built. The server, offers, room view, and offices map are not built yet.

## What's here so far

- `sim.js`: scoring, economy generation, trade effects, classifieds, and benchmarks (Hungarian algorithm for chairs, simulated annealing for offices). Works in Node and in the browser.
- `scripts/check-sim.js`: headless checks. Run `node scripts/check-sim.js`. It checks the Hungarian algorithm against brute force, then runs bot classes and prints the numbers to compare with the Python design simulation.
- `public/card.js` + `public/style.css`: the chair card.
- `public/preview.html`: the chair card with random data. Open the file directly in a browser; no server needed.
