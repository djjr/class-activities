# Market Exchange

Students trade chairs, then offices, while the room tracks aggregate welfare round by round. See [SIMULATION.md](SIMULATION.md) for the activity and [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

## Run locally

```sh
cd marketExchange && npm install
INSTRUCTOR_KEY=dev npm run dev
```

- Join slide: http://localhost:3000/i/welcome?key=dev
- Room view (projected; also your controls): http://localhost:3000/i/room?key=dev
- Students: scan the QR code, or open http://localhost:3000 and type the code
- Saved sessions: http://localhost:3000/i/sessions?key=dev
- Chair card design preview (no server needed): open `public/preview.html`

## Running a session

1. Students join from the welcome slide with a nickname.
2. On the room view, click a phase (**Chairs**, **Offices: random**, **Offices: like me**) twice to start it. This generates a fresh economy for everyone joined right now. Anyone who joins later waits for the next phase.
3. Tick **Classifieds** and/or **Money** if you want them, then **Open round**. Students trade until you click **Close round** (twice).
4. Repeat rounds, then start the next phase. **Save** writes an anonymized record (economies, trades, welfare; no names).

## Fake class

Bots join the current session and trade whenever a round is open.

- In the browser: `/test/fake-class?key=…`, with the room view open in another tab.
- From a terminal: `npm run fake -- --url http://localhost:3000 --key dev --new`
- Add `--drive` to run a whole scripted session (all three phases × ordinary / Classifieds / Money rounds) and print the welfare curves. `--round-secs 10` sets the round length.

## Checks

```sh
npm run check      # sim.js (Hungarian vs brute force, bot classes) + market.js (offers, stale races, privacy)
```

## Deploy (Railway)

A second service in the same Railway project as roommateDesign:

- Repo `djjr/class-activities`, root directory `/marketExchange`, start command `npm start` (auto-detected).
- Add a Volume at `/data`, then set `DATA_DIR=/data`, `INSTRUCTOR_KEY=…`, and `PUBLIC_URL=https://<this service's domain>`.
- One replica (state is in memory).
- **Watch Paths:** set `/marketExchange/**` on this service and `/roommateDesign/**` on the roommate service, so a push to one activity doesn't redeploy the other.
- Check a deploy with `curl …/version`.

## slides.com

Embed `/i/welcome?key=…` and `/i/room?key=…` as iframes. Both always target the current session, so the deck URLs never change. Keep the deck private: the key is in the URL.
