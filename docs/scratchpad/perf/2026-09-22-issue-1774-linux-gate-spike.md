# Issue 1774 — the fast WebKit commit gate run locally on WebKit 26.6, with a planted regression

Spike evidence for the decision brief on
[issue 1774](https://github.com/KyleMit/Splotch/issues/1774). It answers one narrow question with
numbers: on the WebKit build the gate runs today (Playwright WebKit 26.6, r2359), what does
`npm run perf:web:undo:webkit:fast` catch and what does it not? The raw commit samples are in the
sibling
[`2026-09-22-issue-1774-linux-gate-spike.json`](2026-09-22-issue-1774-linux-gate-spike.json).

## Setup

* Claude Code cloud container, Linux x64, Node 22, no CPU throttle. Playwright WebKit 26.6 was
  installed into a scratch browsers directory with `npx playwright install webkit` plus
  `install-deps`; the repo's Chromium cache is untouched.
* Product tree: `main` at 766e59537790d0b1de8b616252722876366fe929, built with `npm run perf:build`
  (`PERF_MARKS=true`). The second run adds one build flag, `PERF_PLANT_COMMIT_MS=40`, which the
  spike branch wires through `web/vite.config.ts` to a synchronous 40 ms busy-wait inside
  `commitStrokeGroup()` after `commitTiledCommand()`. That is the size of regression ADR-0093
  designed the 25 ms budget to catch (its defect class measured 47–56 ms maxima against a 1–8 ms
  healthy worst). The flag is zero in every build that does not set it; the branch is not meant to
  merge.
* Gate, scenarios, pacing, confirmation policy and `COMMIT_GATE_MS` are unchanged. Enforcement is
  off on `main` (`COMMIT_GATE_ENFORCED = false`), so every run below exits 0 whatever it measures.
* One run per arm. Serial, on port 4210. The first attempt on port 4190 failed before measuring:
  Node's `fetch` refuses that port (it is on the Fetch specification's bad-ports list), so
  `waitForUrl` never saw the preview server. Pick a port that is not on that list.

## Results

| Arm                                    | Multi-finger commit P95 / max | Crayon commit P95, initial / confirmation | Crayon commit max | Crayon draw total | Gate                             |
| -------------------------------------- | ----------------------------: | ----------------------------------------: | ----------------: | ----------------: | -------------------------------- |
| `main` 766e5953                        |                      3 / 5 ms |                          2,445 / 2,628 ms |          2,749 ms |          1,119 ms | crayon breach, confirmed; exit 0 |
| `main` + planted 40 ms on every commit |                    44 / 46 ms |                          2,500 / 2,488 ms |          2,523 ms |          1,088 ms | both breach, confirmed; exit 0   |

The crayon baseline is bimodal inside one run: 15 of 22 commits cost 0–1 ms and the last seven cost
1,208–2,453 ms (initial pass; 1,224–2,749 ms in confirmation). Linux WebKit charges the deferred
crayon raster at the commit boundary, the same "commit-charged" mode the bisect measured on the
macOS runner (3,088–3,808 ms) and locally on Linux (3,265 ms before PR 1733, 3,170 ms after). The
multi-finger baseline here is 0–5 ms, unlike the macOS runner's 26.6 regime of 57–177 ms.

## What that says about the gate

* **Crayon cannot distinguish a 40 ms regression from its own baseline on this browser build.** The
  planted arm moves the P95 by roughly the plant, on top of a 2.4 s baseline; the verdict is the
  same word either way. A threshold that passed the baseline would pass the regression too.
* **Multi-finger does distinguish it here** (3 ms to 44 ms), because this host's multi-finger
  baseline is clean. On the macOS runner the same scenario's 26.6 baseline is 57–177 ms, so the same
  40 ms plant would be invisible there. Which half of the gate works depends on the host, not the
  product.
* **The harness fails closed on a missing instrument.** The first local attempt served a bundle a
  concurrent Playwright run had rebuilt without `PERF_MARKS` (the E2E web server and the perf build
  share `web/build`). The gate reported `NOT EVALUATED: no engine.commit samples` instead of a 0 ms
  pass. That property is worth keeping under any policy.
* **The WebKit engine smoke is a separate instrument** and is unaffected:
  `npm run test:webkit:smoke` passed 7 of 7 in 43 s here. It asserts boot, hydration parity,
  Settings, Back navigation and the Color Picker on WebKit and has no timing assertion.

## What it does not answer

Nothing here measures a device. The only on-device commit numbers remain the 2026-09-18 iPad
baseline (iPadOS 26.5: commit P95 0–2 ms and maximum ≤ 4 ms at finger pace; its `summary.json`
records the synchronous burst at a commit P95 of 8–17 ms). The iPadOS 26.6 run the issue asks for
has not been taken.
