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

Output (`screenshots/`) is gitignored.

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

- **First stroke gets swallowed.** Async settings hydration calls `setColor()`
  shortly after mount, arming a 100ms `COLOR_CHANGE_DEBOUNCE` in
  `src/lib/drawing/engine.ts` that ignores the next `pointerdown`. The driver
  settles ~800ms before drawing so the stroke registers; if you script your own
  draw, do the same or the canvas comes out blank.
- **Cold `vite dev` re-optimizes deps** on the first hit, briefly 504-ing modules
  and auto-reloading. The driver *polls* for readiness instead of re-navigating
  (same trick as `tests/global-setup.ts`); a plain `goto` + immediate screenshot
  can catch the transient error page.
- **`--port` defaults to 5199**, not the usual 5173, to avoid clashing with a dev
  server you already have running. Pass `--port 5173` to reuse one, or `--keep`
  to leave the driver's own server up.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Executable doesn't exist … playwright` | `npm run test:e2e:install` |
| `server never came up at http://localhost:5199` | Port in use — pass `--port <n>` or `npx kill-port 5199` |
| `<route> never became interactive` | Route 404s or crashes — check it loads at `npm run dev` first |
| Blank canvas in the `--draw` screenshot | Drawing engine regressed; reproduce at `npm run dev` |
