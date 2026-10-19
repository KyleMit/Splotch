# WEB-1 and AI-1 browser harness

Playwright scripts that drive the `rn-web` and `web-prod` arms of `../../execution-plan.md` through
the same public controls in headless Chromium, and record what each arm showed, stored and fetched.
The records `../web-1-2026-10-19.md` and `../ai-1-web-2026-10-19.md` hold the outcomes; this folder
holds the means to reproduce them.

## Run

1. Build both arms. `rn-web`: `npm run native:web:build`. `web-prod`: a `git worktree` of `main`,
   then `pnpm install --frozen-lockfile` and `npm run build`.
2. Serve them on free ports (`npm --silent run show:free-port`):
   * `node docs/scratchpad/2026-10-18-device-parity/results/web/serve-rn-web.mjs --root experiments/native-architecture/dist/web --port <a>`;
   * in the worktree, `npm run preview -- --port <b> --strictPort`.
3. Point the harness at them with `RN_WEB_URL` and `WEB_PROD_URL` (defaults `127.0.0.1:5300` and
   `:5400`), then run cells from this folder:

```bash
node run-cells.mjs --module web-1 --list
node run-cells.mjs --module web-1 --cells install-android,back-touch-guard
node run-cells.mjs --module ai-1 --cells ai-success --record ai-1-extra-observations.json
node compare.mjs --cells install-android            # where the arms disagree
node pair-shots.mjs --out /tmp/pairs install-android # rn-web | web-prod side by side
```

A batch stops before a cell that would start after 600 s. `--record` writes a separate observation
file, so a long cell such as `ai-poll-past-240s` can run beside another batch.

## Files

| File                              | Role                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `harness.mjs`                     | Arms, profiles, external-request guard, 8 ms stroke driver, settle rule, captures |
| `page-probes.mjs`                 | In-page readers of public DOM: banner, dialogs, surface locks, headings, links    |
| `serve-rn-web.mjs`                | Static host for the RN export with an SPA fallback                                |
| `arm-proxy.mjs`                   | Per-cell proxy origin that can serve a next deploy's `sw.js` and `version.json`   |
| `ai-fixture.mjs`                  | Labeled fixture for `/api/*`, recording every request                             |
| `web-1-*.mjs`, `ai-1-cells.mjs`   | The cells                                                                         |
| `run-cells.mjs`                   | Runs named cells and merges their observations into a record file                 |
| `compare.mjs`, `pair-shots.mjs`   | The mechanical diff and the inspector's side-by-side view                         |
| `*-observations.json`             | Raw observations per cell and arm                                                 |
| `web-1-rows.csv`, `ai-1-rows.csv` | Per-row outcomes, cells, issues and notes                                         |
| `shots/`                          | 360 px webp captures named `<cell>-<arm>.webp`                                    |

## Emulation and its limits

Headless Chromium has no installed display mode, never hides a page, never fires a real
`beforeinstallprompt`, hides scrollbars by default and cannot show a directory picker. The cells
replace each of these with the same shim in both arms: shipping's own standalone `matchMedia` shim,
a visibility shim, a synthetic install prompt, a browser launched without `--hide-scrollbars`, and
an origin-private directory as an explicitly diagnostic folder picker. The records name every place
a shim stands in for the real platform.
