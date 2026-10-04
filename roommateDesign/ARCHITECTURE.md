# Roommate Design — Architecture (proof of concept)

A classroom simulation with live results. Students join from their phones with a QR code, interact, and submit. Live totals appear in an iframe on a slides.com slide. The simulation itself is specified in [SIMULATION.md](SIMULATION.md) and implemented in `sim.js`.

## Scope / constraints

- One instructor (me), one active session at a time, ~25 students.
- Students can see the aggregate view **only after submitting**.
- The instructor closes submissions with a **Close Submissions** button on the aggregate view.
- **Saves are anonymized.** Names are never written to disk. Saved data keeps each anonymous virtue set plus all failure-mode and workaround text (see SIMULATION.md).
- Students may optionally give a name, nickname, and/or group.
- Stack: Node + Express, plain HTML/JS/CSS, no build step.
- Hosting: Railway, auto-deployed from GitHub, default `*.up.railway.app` domain.

## Components

```
Student phones ──► /s/ABCD  ──┐
                              │  fetch (POST) + SSE (live updates)
Slide iframe ──► /i/welcome ──┤
Slide iframe ──► /i/aggregate ┤
                              ▼
                   Node/Express (single instance)
                   ├─ in-memory session state
                   ├─ sim.js: validate(), aggregate(), snapshot()
                   └─ DATA_DIR (Railway volume)
                        ├─ live.json              (crash/redeploy backup)
                        └─ saved/<timestamp>-<code>.json  (anonymized saves)
```

Persistence uses JSON files on a Railway volume rather than Postgres. That is enough for a proof of concept and needs no database driver.

## Pages

| URL | Audience | Behavior |
|---|---|---|
| `/i/welcome?key=K` | Instructor slide iframe | Shows the **current open session**, creating one only if none exists. Displays the QR code, join URL + code, and a live "N joined / M submitted" count. A small **New session** button starts a fresh session. |
| `/i/aggregate?key=K` | Instructor slide iframe | Live aggregate for the current session, plus the **Close Submissions** (toggles to Reopen) and **Save** buttons. |
| `/i/sessions?key=K` | Instructor (browser) | Lists saved sessions, each with a JSON download. |
| `/s/ABCD` | Students | Optional name/nickname/group form → interactive sim → Submit → toggle between "My answer" and "Class results". |

Both instructor slides always point at the *current* session, so the slide URLs never change between classes. Reveal.js reloads iframes as you move between slides, which is harmless: loading a page never creates a session unless none exists.

## API

All `/api/i/*` routes require `key` (query param or header) to match `INSTRUCTOR_KEY`.

| Method & path | Purpose |
|---|---|
| `GET  /api/i/current` | Get the current session, creating one if none exists → `{code, joinUrl, qrSvg, counts, closed}` |
| `POST /api/i/new` | Discard the current session and start a new one |
| `POST /api/i/close` / `POST /api/i/reopen` | Lock or unlock submissions |
| `POST /api/i/save` | Write `sim.snapshot()` to `saved/` (can be done more than once; the latest is kept) |
| `GET  /api/i/saved` / `GET /api/i/saved/:id` | List saved sessions / download one |
| `GET  /api/i/stream` | SSE: counts and aggregate, including writeups with author labels, on every change |
| `POST /api/s/:code/join` | `{pid, name?, nickname?, group?}` → registers the participant |
| `POST /api/s/:code/submit` | `{pid, data}` → validates and stores the submission, overwriting any earlier one; rejected if closed |
| `GET  /api/s/:code/info` | Virtue list, budget, closed flag; 404 if the code is not the live session |
| `GET  /api/s/:code/stream?pid=` | SSE: `{closed, submitted, counts}`, plus the anonymous aggregate only once this `pid` has submitted or submissions are closed. Sends `{ended:true}` when the instructor starts a new session |

The browser generates `pid` (a random UUID) and keeps it in `localStorage`, so a refresh does not create a duplicate student.

## Live state (in memory)

```js
session = {
  code: "K7QM",            // 4 chars, no ambiguous characters (0/O, 1/I/L)
  createdAt, closed: false,
  participants: { [pid]: { name, nickname, group, joinedAt } },
  submissions:  { [pid]: { data, submittedAt } },
  aggregate:    sim.aggregate(submissions)   // recomputed on each submit
}
```

After every change, the server recomputes the aggregate, broadcasts it over SSE, and writes `live.json` with a short debounce. On startup, the server restores the session from `live.json`, so a mid-class redeploy does not lose it.

## Saved record (anonymized)

```json
{ "code": "K7QM", "createdAt": "...", "savedAt": "...",
  "nJoined": 25, "nSubmitted": 23, "closed": true,
  "data": { /* sim.snapshot(); shape in SIMULATION.md */ } }
```

## Embedding & security

- Responses set `Content-Security-Policy: frame-ancestors 'self' https://slides.com https://*.slides.com`, and the app does not send `X-Frame-Options`.
- `INSTRUCTOR_KEY` appears in the iframe URLs. **Anyone who can view the deck's source can see it**, so keep the deck private or unlisted, and rotate the key if it leaks.
- Student input is length-limited and validated by `sim.validate()`. Names are rendered as text, never as HTML.

## Project layout

```
roommateDesign/
  package.json        # express, qrcode
  server.js           # routes, session state, SSE, persistence
  sim.js              # virtue list, budget, validate(), aggregate(), snapshot()
  public/
    index.html          # type-in join code
    student.html  student.js
    welcome.html  aggregate.html  sessions.html  instructor.js
    results.js          # bars + co-selection graph + writeups (shared)
    style.css
```

## Railway

- Railway's Nixpacks builder auto-detects Node; the service runs `npm start`.
- Add a volume mounted at `/data` and set `DATA_DIR=/data`.
- Environment variables: `INSTRUCTOR_KEY`, `DATA_DIR`, and `PUBLIC_URL` (the base URL encoded in the QR code). `PORT` is provided by Railway.
- Health check: `GET /healthz`.
- Run exactly one replica, because state is held in memory.

## Decisions

1. **After Close:** every student can see the results, including those who never submitted.
2. **Resubmitting:** allowed until close. The new submission overwrites the old one.
3. **Names in the aggregate:** on the instructor view, failure-mode writeups can show their author (nickname, else name) behind a **Show names** toggle that is off by default. That lets the instructor say "Jason, tell us about that one." Students only ever see anonymous text. Names are never saved.
4. **No "extremes" feature.** The instructor explores by tapping virtues instead (see SIMULATION.md).
