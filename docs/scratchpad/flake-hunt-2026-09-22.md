# Flake hunt — 2026-09-22

Overnight, unattended, in a Claude Code cloud container: the Vitest tiers and the Playwright E2E
suite run many times with retries off, every intermittent failure classified, every survivor filed.
Follows the flake-hunting protocol in `docs/TESTING.md` and the shape of
`e2e-flake-hunt-2026-09-02.md`.

## Method

Cloud container, 4 logical CPUs (`availableParallelism()` = 4, so 4 workers is the supported CI
contention level, ADR-0078), 15 GB RAM. Every full-suite E2E rep ran through the sweep driver, which
builds once, unsets the CI variables (retries off), and boots a fresh preview server per rep:

```bash
npm run test:e2e:sweep -- --workers=4 --reps=12 --out=<dir>/sweep1          # discovery
npm run test:e2e:sweep -- --workers=4 --reps=12 --out=<dir>/sweep2          # discovery
npm run test:e2e -- <spec> -g "<title>" --workers=8 --retries=0 --repeat-each=10 \
  --trace retain-on-failure                                                 # amplification
```

The Vitest tiers (`test:unit`, `test:tools`, `test:asset-gen`, `test:store-drawings`) ran 20
iterations each under `timeout 600`, plus one `--sequence.shuffle` pass per tier; `test:api:smoke`
ran 5 iterations on an explicit port.

The suite is 905 tests in 97 files at `d8a8102` (581 on 2026-09-02).

### Seed list from CI

`npm run gen:flaky-digest` cannot reach Actions from this container: the token is rejected with a
401 through the proxy. The `Flaky digest` workflow's own history artifact (run 35671284884,
2026-09-22T00:17Z) was downloaded through the GitHub MCP artifact link instead. Its 7-day ranking
(window 2026-09-15 → 2026-09-22; 1,201 trunk samples, 2,891 branch samples, 136 masked events):

| Events | trunk | branch | Last seen | Test                                                                                                              |
| -----: | ----: | -----: | --------- | ----------------------------------------------------------------------------------------------------------------- |
|     83 |    25 |     58 | 09-21     | `flows-parent-center-warning.spec.ts` › the standing warning survives a relaunch and asks nothing of the mode it is on |
|     28 |     4 |     24 | 09-21     | `flows-parental-gate.spec.ts` › Parent Center is gated before its controls appear and persists every feature policy |
|     10 |     4 |      6 | 09-21     | `actions-panel-layout.spec.ts` › AI-only drawer paints its count before the grant arrives                          |
|      9 |     2 |      7 | 09-16     | `flows-palette-brush.spec.ts` › the eraser bubble tracks the pointer and hides on leave or brush switch            |
|      3 |     0 |      3 | 09-19     | `bare-toolbar.spec.ts` › Bare hides stale pane geometry until rotation layout settles                              |
|      2 |     1 |      1 | 09-19     | `flows-parent-center-warning.spec.ts` › cancelling the warning leaves the Parent Center check as it was            |
|      1 |     1 |      0 | 09-21     | `coloring-pack-download.spec.ts` › a fresh install opens the Farm pages directly before packs arrive               |

Every one of these shipped green under `retries: 2`.

## Container baseline

(Re-measured below from the discovery sweeps; the 2026-09-02 floor was `pwa-registration` precache
bytes and `store-drawing-replay` replay parity at 13/13, and the privacy-page provider-terms gate at
4/13.)

## Discovery, 4 workers, retries off

(Filled in after each sweep.)

## Vitest and smoke tiers

(Filled in after the runs.)

## Post-run validation

(Filled in at the end.)
