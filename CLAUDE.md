# class-activities

Interactive classroom activities that students join by phone. Results show live in iframes on slides.com (reveal.js) decks. Proof-of-concept scale: one instructor (Dan), about 25 students, one live session at a time.

Repo: https://github.com/djjr/class-activities (public). The local folder is named `classroom-activities`.

## Activities

### roommateDesign: "Design a Robot Roommate"

Students pick up to 5 of 12 virtues for a robot roommate. For each virtue they can describe a failure mode (too much of a picked virtue, or a missing unpicked one) and workarounds. The failure modes and workarounds are the substance of the exercise; the UX centers on them.

Read these first:
- `roommateDesign/ARCHITECTURE.md`: pages, API, state, persistence, embedding, decisions
- `roommateDesign/SIMULATION.md`: the activity, data shapes, results view
- `roommateDesign/README.md`: run locally, fake data, Railway, slides.com embed

Code map:
- `sim.js`: virtue list + definitions, budget, `validate` / `aggregate` / `snapshot`. `toAggregate(snapshotData)` rebuilds the `{n, counts, pairs, byVirtue}` shape from a saved snapshot's `selections` (pairs/lift aren't stored on disk, just derived on read) so saved-view.html can reuse `results.js` unchanged. All activity-specific logic lives here.
- `server.js`: Express. One session in memory, SSE live updates, `live.json` backup, saves to `DATA_DIR/saved/`. `/version` reports `dataDir`, `railwayVolumeMountPath`, and `savedSessionCount` for diagnosing the persistence issue below.
- `public/student.*`: join → design board (tap pill to move; ✎ opens failure-mode dialog) → submit → results.
- `public/results.js`: shared results view, used by both the live `aggregate.html` and the read-only `saved-view.html`. Springy draggable co-selection graph on the left (hand-rolled force layout, no d3); writeup panel on the right with ‹ › stepping.
- `public/welcome.html`, `aggregate.html`, `sessions.html`, `saved-view.html` + `instructor.js`: instructor pages; the key comes from `?key=`. `sessions.html` links to `saved-view.html` (`/i/view?id=...`) to view a saved session read-only, and to `/api/i/saved/:id` to download its raw JSON.
- `public/test/fake-class.{html,js}`: fake-class generator, shared with `scripts/fake-class.js`.

## Conventions and decisions (settled; don't relitigate)

- Node + Express, plain HTML/CSS/JS, **no build step, no frontend framework**. Two dependencies: `express`, `qrcode`.
- Students see results only after submitting, or once the instructor closes submissions. Resubmitting overwrites until close.
- **Names are never written to disk.** Saves are anonymized: virtue sets plus all failure-mode/workaround text. The instructor can show names live via the "Show names" toggle; students always see anonymous entries.
- Instructor slide URLs always target the *current* session, so deck URLs never change. Loading a page never creates a session unless none exists.
- No blocking `alert`/`confirm` (they freeze slide iframes); use two-click confirm buttons.
- **Never commit `INSTRUCTOR_KEY`**, since the repo is public. It lives only in Railway variables.
- The frame-ancestors CSP allows `slides.com`. Keep it if you touch headers.

## Run and test

```sh
cd roommateDesign && npm install
INSTRUCTOR_KEY=dev npm run dev        # http://localhost:3000/i/aggregate?key=dev
npm run fake -- --url http://localhost:3000 --key dev --new   # 25 fake students
```

No test suite. Changes have been verified by:
- API checks with curl and the fake-class script.
- Headless Node scripts that stub the DOM to run `results.js`: settling, NaN, overlap, and a cluster-separation ratio (unrelated vs same-persona virtue distance; about 1.6 median is the current baseline).

Visual checks need the Claude in Chrome extension, which was not connected in the first session, so **nothing has been visually verified by Claude**. Dan has checked the deployed pages and says they work well.

## Deploy (Railway)

- Production: https://classroom-simulations-production.up.railway.app
- Deploys automatically on push to `main`, about 30 s. Railway's "Source" settings show "Could not load branches"; it's only a display glitch, and pushes still deploy.
- Service root directory is `/roommateDesign`. Volume at `/data` with `DATA_DIR=/data`. Variable `INSTRUCTOR_KEY`. One replica, because state is in memory.
- Verify a deploy: `curl …/version` returns `{"commit":"<sha7>"}`. Compare with `git log -1 --format=%h`.
- Test page: `…/test/fake-class.html?key=<KEY>` (the `.html` is required).

**Pushing to `main` deploys to production.** Ask Dan before pushing unless he has said to.

## Working with Dan

- Dan wants honest assessments of design ideas, including pushback and tradeoffs, not agreement.
- He works from both a laptop and an office Mac Studio, so keep tooling hardware-agnostic: browser pages over local scripts, and anything needed should be in the repo.
- He prefers discussing the design before building, with decisions recorded in the spec docs.

## Open items

- Optional: serve pages without the `.html` ending (`express.static(..., { extensions: ['html'] })`), so `/test/fake-class` works.
- ~~Saved sessions don't survive a redeploy~~ **Fixed 2026-10-11.** Root cause confirmed via `/version`'s `railwayVolumeMountPath`: it was `null`, meaning no Volume was actually attached to this service despite `DATA_DIR=/data` being set — `/data` was just ephemeral container storage. Railway's assistant attached a real Volume to the service, mounted at `/data`. Verified: saved a session, triggered a manual Redeploy (no code push), and `savedSessionCount` on `/version` was unchanged afterward. The earlier Oct 4 saved session was lost in the process (it predated the fix), but Dan had already downloaded its JSON as a backup.
  - The old workaround (download each save's JSON right after saving) is no longer necessary but is harmless to keep as extra insurance.
  - This also means the mid-class `live.json` backup should now survive a redeploy, but that hasn't been separately tested — treat "don't push to `main` during class" as still-prudent caution rather than a confirmed non-issue.
- Not yet done: a visual pass of the student page at phone width, and of the results slide inside an actual slides.com iframe. Also not yet visually verified: `saved-view.html` (added 2026-10-11) — the server-side `toAggregate` math is checked against `aggregate()` on synthetic data and the endpoint returns well-formed data for the one real saved session, but no one has looked at the rendered page in a browser yet.
- Future activities go in sibling folders. Generalize shared pieces (session/QR/SSE) only when a second activity actually needs them.
- Possible enhancement: a tap-to-reveal "(i)" hint on the note dialog's "Practical wisdom needed" and "Institutional safeguard needed" prompts (added 2026-10-11), since those two are more abstract than the failure-mode prompts. Needs to be touch-friendly (no hover tooltip, this is a phone activity) and non-blocking (no `alert`/dialog that could freeze the slide iframe) — inline expanding text next to just those two labels, not a popover.
