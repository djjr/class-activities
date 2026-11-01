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

0. Before class, click **New session** (twice) on the room view or the welcome slide. The server keeps the last session across restarts (`data/live.json`), so it won't reset by itself.
1. Students join from the welcome slide with a nickname.
2. On the room view, click a phase (**Chairs**, **Offices: random**, **Offices: like me**) twice to start it. This generates a fresh economy for everyone joined right now. Anyone who joins later waits for the next phase.
3. Tick **Classifieds** and/or **Money** if you want them, then **Open round**. Students trade until you click **Close round** (twice).
4. Repeat rounds, then start the next phase. **Save** writes an anonymized record (economies, trades, welfare; no names).

## Slide demo (before playing)

A self-contained animation of 8 bot traders for explaining the game. No session or server state is involved: the whole run is computed from the URL, so it can't touch a live class.

```
/demo?phase=chairs                         plain market
/demo?phase=chairs&classifieds=1           same economy, with classifieds
/demo?phase=chairs&money=1                 … with side payments
/demo?phase=chairs&classifieds=1&money=1   … both
```

- Put two iframes side by side on a slide, **same `phase` (and `seed`)**, differing only in institutions. Both panes start from the same people, chairs, and best-possible line, and share a chart scale, so the gap between them is the institution's effect.
- In money panes everyone starts with 20 tokens (as in the real game), shown as a coin counter on each person; payments show as coin badges, and a deal fails if the winner can't afford enough. Tokens don't count toward welfare.
- Click either pane to start; the other starts with it (and pausing works the same way). Space pauses or resumes, → steps once paused, R replays. It stops on a summary.
- Options: `phase` (`chairs`, `offices-random`, `offices-like-me`), `seed`, `speed` (1 = about 3.5 s per meeting), `meetings` (24), `captions=0` (you narrate), `title`, `group` (to keep two demo pairs on different slides from syncing with each other).
- Default seeds tell each phase's story (chosen with `node scripts/demo-seeds.js`). Chairs (17): plain 55% · classifieds 76% · money 81% (two deals fail because the winner can't afford enough) · both 100%. Offices random (156): plain ends *below* the start; classifieds 24% with 9 harmful swaps. Offices like me (39): plain 53% after 24 meetings; classifieds sorts the room in 3 meetings, 93%.
- **Setup screen:** `/demo` with no settings, a URL with a mistake, or `?setup` shows selectors for every option, the finished iframe URL with a Copy button (plus the matching plain-market pane's URL), and a Run button. Mistyped names and values are reported with suggestions (`clasifieds` → classifieds), instead of a blank demo.
- Preview two panes at `/test/demo-pair.html?phase=chairs&right=classifieds` (`right` = `classifieds`, `money`, or `both`).

## Fake class

Bots join the current session and trade whenever a round is open.

- In the browser: `/test/fake-class?key=…`, with the room view open in another tab. **Remove all bots from session** clears them out; they're left out of the next phase.
- Bot nicknames are unique: a second batch joins as "Maya 2", "Jordan 2", and so on.
- From a terminal: `npm run fake -- --url http://localhost:3000 --key dev --new`
- Add `--drive` to run a whole scripted session (all three phases × ordinary / Classifieds / Money rounds) and print the welfare curves. `--round-secs 10` sets the round length.

## Checks

```sh
npm run check      # sim.js (Hungarian vs brute force, bot classes) + market.js (offers, stale races, privacy)
```

## Deploy (Railway)

A second service in the same Railway project as roommateDesign:

- Repo `djjr/class-activities`, root directory `/marketExchange`, start command `npm start` (auto-detected).
- Add a Volume at `/data`, then set `DATA_DIR=/data`, `INSTRUCTOR_KEY=…` (view key, goes in the deck), `ADMIN_KEY=…` (different, kept private), and `PUBLIC_URL=https://<this service's domain>`.
- One replica (state is in memory).
- **Watch Paths:** set `/marketExchange/**` on this service and `/roommateDesign/**` on the roommate service, so a push to one activity doesn't redeploy the other.
- Check a deploy with `curl …/version`.

## Keys and slides.com

There are two keys, so the deck can be public:

- **`INSTRUCTOR_KEY` (view key)** goes in the deck's iframe URLs: `/i/welcome?key=…` and `/i/room?key=…`. Anyone with the deck can see the join slide and a display-only room view, with no names and no controls.
- **`ADMIN_KEY`** unlocks the controls, names, and saved sessions. Click the 🔒 in the room view (or the welcome slide) on your own laptop and type it once. Your browser remembers it, including inside the slides.com iframe, and it never appears in any URL in the deck. 🔓 Lock forgets it.
- If `ADMIN_KEY` isn't set, it falls back to `INSTRUCTOR_KEY` (the old single-key behavior). Locally, `INSTRUCTOR_KEY=dev` means you unlock with `dev`.
- The fake-class CLI takes `--admin KEY` for `--new`/`--drive` (it defaults to `--key`).

Both slide URLs always target the current session, so the deck URLs never change.
