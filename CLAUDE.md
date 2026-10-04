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
- `sim.js`: virtue list + definitions, budget, `validate` / `aggregate` / `snapshot`. All activity-specific logic lives here.
- `server.js`: Express. One session in memory, SSE live updates, `live.json` backup, saves to `DATA_DIR/saved/`.
- `public/student.*`: join → design board (tap pill to move; ✎ opens failure-mode dialog) → submit → results.
- `public/results.js`: shared results view. Springy draggable co-selection graph on the left (hand-rolled force layout, no d3); writeup panel on the right with ‹ › stepping.
- `public/welcome.html`, `aggregate.html`, `sessions.html` + `instructor.js`: instructor pages; the key comes from `?key=`.
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
- Optional: fall back to `RAILWAY_VOLUME_MOUNT_PATH` when `DATA_DIR` is unset. A volume-attach conflict hit during setup; confirm saves land on the volume, i.e. saved sessions survive a redeploy.
- Not yet done: a visual pass of the student page at phone width, and of the results slide inside an actual slides.com iframe.
- Future activities go in sibling folders. Generalize shared pieces (session/QR/SSE) only when a second activity actually needs them.
