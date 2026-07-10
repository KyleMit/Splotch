---
name: run-splotch
description: Launch, run, and screenshot the Splotch web app to confirm a change works in the real running app (not just tests). Use when asked to run/start Splotch, open it in a browser, take a screenshot, draw on the canvas, or visually verify a UI change. Covers the / drawing app, /admin, and /privacy routes. For Android/iOS native builds use the `mobile` skill instead.
---

# Run Splotch (web)

Splotch is a SvelteKit web app (`/` drawing canvas, `/admin` console, `/privacy`).
There is no `chromium-cli` on this project, so the driver is
[`driver.mjs`](driver.mjs) — it launches a `vite dev` server, opens Playwright's
bundled Chromium, optionally draws a stroke, and saves a screenshot. Playwright
is already a devDependency; the same Chromium the E2E suite uses.

**All paths below are relative to the repo root** (`/Users/kylemit/Code/Splotch`).

## Prerequisites

Deps + the Playwright Chromium binary (one-time):

```bash
npm install
npm run test:e2e:install
```

(On a Linux box you'd also need `npx playwright install-deps` for Chromium's
system libs — not required on macOS, where this was verified.)

## Run (agent path) — driver.mjs

Launch the app, draw a stroke on the canvas, and screenshot the home route:

```bash
node .claude/skills/run-splotch/driver.mjs --route / --draw --out screenshots/splotch-home.png
```

Screenshot another route (no `--draw`):

```bash
node .claude/skills/run-splotch/driver.mjs --route /admin --out screenshots/splotch-admin.png
```

The driver starts its own server, waits for the route to become interactive,
writes the PNG, then tears the server down. **Open the PNG and look at it** —
`screenshots/splotch-home.png` shows the color palette down the left, the
Parent Controls button top-right, and (with `--draw`) a purple zig-zag stroke on
the canvas. A blank canvas with no stroke means the draw flow regressed.

Options (see the header of `driver.mjs`):

| Flag | Effect |
| --- | --- |
| `--route <path>` | Route to open — `/`, `/admin`, `/privacy`, `/dev/engine` (default `/`) |
| `--draw` | Drag a stroke across the canvas before the shot (route `/` only) |
| `--out <file>` | Screenshot path (default `screenshots/splotch.png`) |
| `--headed` | Show the browser window instead of headless |
| `--keep` | Leave the dev server running afterward and print its URL |
| `--url <baseURL>` | Drive an already-running server instead of launching one |
| `--port <n>` | Dev server port (default `5199`) |

Output (`screenshots/`) is gitignored. **Write your shots there** (or another
gitignored dir) — a PNG dropped elsewhere in the repo shows up as an untracked file
and trips the stop-hook git check.

## Capturing a specific tool / state (beyond a default stroke)

`--draw` only drags one **default-pen** stroke. There is no flag to select a tool
(magic brush, eraser), apply a coloring page, or draw a custom path — so to
screenshot any other state you drive it with your own short Playwright script.
Don't reinvent the driver's setup; **reuse its server** and copy its three
non-obvious pieces:

```bash
# 1. Leave the driver's dev server running and note the URL it prints.
node .claude/skills/run-splotch/driver.mjs --route / --keep
```

```js
// 2. Your own script: connect to that server and drive the UI.
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

// Cloud Chromium can drift from Playwright's pinned build, so a bare
// chromium.launch() fails with "Executable doesn't exist". This is driver.mjs's
// chromiumExecutablePath() inlined so the script runs verbatim: PLAYWRIGHT_CHROMIUM
// wins; else the pinned build if present; else the newest chromium-<rev> under the
// browsers path (the versioned dir — NOT the bare `chromium` entry). undefined =
// let Playwright use its own pinned binary.
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = `${base}/${build}/${sub}/chrome`;
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

const browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5199/', { waitUntil: 'commit' });

// Readiness: the canvas is in the DOM before it's wired — poll for the engine
// resizing the backing store off its 300×150 default (see the Gotchas below).
await page.waitForFunction(() => {
  const c = document.getElementById('drawingCanvas');
  return !!c && c.width > 300;
});

// The tool buttons live in the COLLAPSED action drawer — expand it first.
await page.locator('button[aria-label="Expand controls"]').click();
await page.locator('#undoButton').waitFor({ state: 'visible' });

// Tools toggle, so select idempotently rather than clicking blindly.
const magic = page.locator('#magicBrushButton');
if ((await magic.getAttribute('aria-pressed')) !== 'true') await magic.click();
```

> **Save the script file inside the repo, not the session scratchpad.** Node resolves
> `import ... 'playwright'` by walking up from the script's own directory, so a `.mjs` under
> the session scratchpad (per `CLAUDE.md`'s temp-file rule) dies with
> `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`. Put it in the gitignored
> `screenshots/` dir — inside the tree so imports resolve, and gitignored so the file doesn't
> trip the stop-hook git check (same dir your shots go in). Delete it when done.
>
> `NODE_PATH=…/node_modules` does **not** fix this for these scripts — `NODE_PATH` is a
> CommonJS-only resolver hint and is ignored by the ESM `import` loader.

To apply a coloring page: click `#coloringBookButton`, then in the `dialog` pick a
book and a page, and wait for `#coloringOverlay` to be visible. A full worked
example (all these steps) lives in the magic-brush E2E test, `web/tests/flows.spec.ts`.

> **Never hand-roll the dev server in a throwaway script.** `spawn('npx', ['vite',
> 'dev', …])` + `server.kill('SIGTERM')` does **not** work: `npx` exits but the real
> `vite` keeps running, and because its stdout is piped to your script the Node event
> loop never drains — the script hangs on exit and leaves an **orphaned `vite dev`
> holding the port for hours**. Instead, pick one:
> - **Reuse the driver's server** (preferred): `driver.mjs … --keep`, connect your own
>   Playwright script with `--url`/`page.goto`, and when done free the port with
>   `npx kill-port <n>` (default 5199). Your script should only manage the *browser*,
>   never the server.
> - **If you truly must spawn one**, use `spawnViteServer(port, env)` from
>   `scripts/lib/vite-server.mjs` — it launches vite in a **detached process group** and
>   its `stop()` kills the whole group (`process.kill(-pid)` / `taskkill /T`), so nothing
>   is orphaned. `freePort(port)` clears a stale listener first.
>
> Either way, **reap what you spawned before ending**: kill the script/browser, run
> `npx kill-port <n>`, and confirm with `ps`/`ss -ltnp` that no `vite dev` or headless
> Chromium is left behind. A leaked server reads as a "task running for hours".

## Run (human path)

```bash
npm run dev
```

Serves `localhost:5173` — but **no `/api/*` functions** (image generation, admin
auth). For those, `npm run dev:netlify` runs the Netlify serverless functions
too. Useless headless — it just waits for a browser.

## Test / direct invocation

- **Full E2E** (production build + Playwright, what CI runs): `npm run test:e2e`
- **Unit / internal functions** (Vitest, happy-dom — for PRs that touch one
  module, not the UI): `npm run test:unit`
- **API contract smoke** (self-contained, no Gemini/Blobs): `npm run test:api:smoke`

The `/dev/engine` route is an in-app harness for the drawing engine (gated behind
`PUBLIC_ENABLE_DEV_HARNESS`, which the driver sets automatically).

## Gotchas

- **The canvas exists before it's interactive.** `#drawingCanvas` is in the DOM
  before `onMount` runs `initDrawingCanvas` and binds the pointer listeners, so
  polling for the element alone draws into a dead canvas. The driver waits for the
  engine to resize the backing store off its 300×150 default (which happens right
  before it binds listeners); do the same if you script your own draw.
- **Cold `vite dev` re-optimizes deps** on the first hit, briefly 504-ing modules
  and auto-reloading. The driver *polls* for readiness instead of re-navigating
  (same trick as `web/tests/global-setup.ts`); a plain `goto` + immediate screenshot
  can catch the transient error page.
- **`--port` defaults to 5199**, not the usual 5173, to avoid clashing with a dev
  server you already have running. Pass `--port 5173` to reuse one, or `--keep`
  to leave the driver's own server up.
- **The action drawer is collapsed by default**, so the tool buttons (magic brush,
  eraser, undo, coloring, screenshot) aren't in the DOM until you click
  `button[aria-label="Expand controls"]`. A custom script that goes straight for
  `#magicBrushButton` fails with "element is not visible" — expand first (the E2E
  suite's `openDrawer` helper does the same).
- **Clearing the canvas is a drag gesture, not a click.** `#clearButton` is wired
  to `dragToClear` — you have to press on it and drag past its accept threshold
  (`0.4 × min(innerWidth, innerHeight)`) toward the screen center, then release. A
  plain `.click()` does nothing.
- **`window.__engine` exists only on `/dev/engine`**, not on `/`. That harness
  (imperative `clearCanvas`, `undo`, pixel readers) is the easy way to manipulate
  and assert engine state — but on the main app you must drive the real UI instead.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Executable doesn't exist … playwright` (local) | `npm run test:e2e:install` |
| `Executable doesn't exist … playwright` (cloud session) | The env's cached Chromium revision drifted from the one this Playwright version wants. `driver.mjs` now self-heals — it falls back to any Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`). Override with `PLAYWRIGHT_CHROMIUM=/path/to/chrome`. Never run `npx playwright install` in cloud. See `docs/CLOUD.md`. |
| `server never came up at http://localhost:5199` | Port in use — pass `--port <n>` or `npx kill-port 5199` |
| `<route> never became interactive` | Route 404s or crashes — check it loads at `npm run dev` first |
| Blank canvas in the `--draw` screenshot | Drawing engine regressed; reproduce at `npm run dev` |
| Want one E2E spec, not the whole suite / `Cannot navigate to invalid URL` from raw `npx playwright test` | The config + `baseURL` live in `web/`, and raw `npx` from the repo root also loses the Chromium fallback. Filter through the npm script instead: `npm run test:e2e -- flows.spec.ts -g "<title>"` — `scripts/web.mjs` sets the `web/` cwd and Chromium path and forwards the args to Playwright. See the `testing` skill. |
