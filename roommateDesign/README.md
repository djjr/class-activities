# Roommate Design

Classroom activity: students design a robot roommate by choosing up to 5 virtues, then describe failure modes and the practical wisdom or institutional safeguards they call for. Results show live on slides.com through iframes.

- Design: [ARCHITECTURE.md](ARCHITECTURE.md), [SIMULATION.md](SIMULATION.md)
- Virtue list, definitions, budget: [sim.js](sim.js)

## Run locally

```sh
npm install
INSTRUCTOR_KEY=dev npm run dev
```

| Page | URL |
|---|---|
| Welcome / QR (slide) | http://localhost:3000/i/welcome?key=dev |
| Results (slide) | http://localhost:3000/i/aggregate?key=dev |
| Saved sessions | http://localhost:3000/i/sessions?key=dev |
| Student | the URL shown on the welcome page, or http://localhost:3000 and type the code |

To test on a phone on the same Wi-Fi, set `PUBLIC_URL=http://<your-laptop-ip>:3000` so the QR code points at your laptop.

Add `&theme=dark` to an instructor URL for a dark slide. The default is light.

## Fake class (test data)

From any browser, open:

```
https://<app>.up.railway.app/test/fake-class.html?key=<INSTRUCTOR_KEY>
```

Choose how many students to add, an optional delay between them (for example 1500 ms, to watch the results slide fill in live), and whether to start a fresh session first. The page also links to the welcome, results and saved-sessions pages, and shows which commit the server is running.

The same generator also runs from a terminal:

```sh
npm run fake -- --url https://<app>.up.railway.app --key <KEY> [--n 25] [--delay 1500] [--new] [--code ABCD]
```

The generator lives in `public/test/fake-class.js`, shared by the page and `scripts/fake-class.js`. Fake students' IDs start with `fake-`, and their picks cluster around four "personas" so the graph has structure. Before class, click **New session** on the welcome slide to clear fake data.

## Check which version is deployed

`https://<app>.up.railway.app/version` returns the running commit, for example `{"commit":"3df4b56",...}`.
Compare it with `git log -1 --format=%h` after a push. A push to `main` that changes anything under `roommateDesign/` should redeploy automatically within a few minutes.

## Deploy on Railway

1. New Project → Deploy from GitHub repo → `djjr/class-activities`.
2. Service **Settings → Root Directory**: `/roommateDesign`. Optionally set **Watch Paths** to `/roommateDesign/**`.
3. **Variables**:
   - `INSTRUCTOR_KEY`: the **view key**, a long random string. It goes in the deck's iframe URLs.
   - `ADMIN_KEY`: the **control key**, a different long random string. Never put it in a URL or commit it. (If unset, it falls back to `INSTRUCTOR_KEY`, the old single-key behavior.)
   - `DATA_DIR`: `/data`
   - `PUBLIC_URL`: optional. By default the app uses the host the request arrived on.
4. **Volume**: add one mounted at `/data`. It holds the live backup and saved sessions.
5. **Networking**: Generate Domain. Keep **Replicas = 1**, because state is in memory.
6. Health check path: `/healthz`.

## Embed in slides.com

Add an iframe element to a slide with:

- Welcome slide: `https://<app>.up.railway.app/i/welcome?key=<INSTRUCTOR_KEY>`
- Results slide: `https://<app>.up.railway.app/i/aggregate?key=<INSTRUCTOR_KEY>`

The deck can be public. The `key` in these URLs is the view key: anyone can see the join slide and anonymous results, but not the controls (Close, Save, New session), author names, or saved sessions. To use those, click the 🔒 on the results or welcome slide on your own laptop and type `ADMIN_KEY` once. Your browser remembers it (including inside the slides.com iframe), and 🔓 Lock forgets it. The CLI fake class takes `--admin KEY` for `--new`.
