# Svelte state audit — vetting ledger (2026-09-13)

A read-only audit of how `web/src` handles reactive and persisted state surfaced the findings below.
Each one is vetted against current code, confirmed empirically where the failure can be driven, and
— when confirmed — captured by a red test that asserts the correct behavior and fails today. Fixes
come after this ledger; the standards (and the ADR or doc that records them) wait until the fixes
have landed in their final design.

Verdicts: **CONFIRMED** (red test fails for the stated reason), **CONFIRMED, untested** (reproduced
but no automatable red test — reason given), **REFUTED** (the failure cannot happen — evidence
given), **DROP** (real but not worth fixing — reason given). Withdrawn findings stay listed.

## Bugs

| ID  | Finding                                                                                        | Verdict | Red test |
| --- | ---------------------------------------------------------------------------------------------- | ------- | -------- |
| B1  | Ctrl/Cmd+Z undoes a canvas stroke while typing in a dialog field                               | pending |          |
| B2  | A late report response overwrites a reopened feedback form and erases the new draft            | pending |          |
| B3  | Raw `history.replaceState` erases SvelteKit's history index, so Back changes only the URL      | pending |          |
| B4  | The `/design` light/dark toggle persists an origin-wide theme with no way back to system       | pending |          |
| B5  | An access code is dropped for the session when secure storage rejects the save                 | pending |          |
| B6  | Abandoning a credential save after a failed hydrate writes `''` and erases the stored secret   | pending |          |
| B7  | The cached IndexedDB connection is never reopened after the browser closes it                  | pending |          |
| B8  | Undoing a coloring-page change restores the page with a stale orientation                      | pending |          |
| B9  | An auto-save throw after a delivered AI result also records an error                           | pending |          |
| B10 | The `initDrawingCanvas` fallback never replays `canUndo`/`canvasEmpty` into `canvasState`      | pending |          |
| B11 | A malformed grant response yields `remaining: NaN` with `available: true`                      | pending |          |
| B12 | Pre-hydration strokes never tick `canvasState.strokeCount`                                     | pending |          |
| B13 | The Settings landing effect tracks seen-stamps and re-scrolls the pane on durable restore      | pending |          |
| B14 | `reportStatus` has two writers (parent effect and child teardown)                              | pending |          |
| B15 | A cross-tab race marks the secure vault empty while a secret exists                            | pending |          |
| B16 | A failed native Preferences removal resurrects a removed key on the next reconcile             | pending |          |
| B17 | `app.html`'s boot script skips the `theme-color` repaint when storage throws                   | pending |          |
| B18 | Session counters accept negative or oversized stored values                                    | pending |          |
| B19 | `install`'s `onDurableRestore` hook is unreachable on web and reloads only part of its state   | pending |          |
| B20 | Save-folder hydration is last-write-wins against a concurrent folder change                    | pending |          |
| B21 | A slow native `Network.getStatus()` overwrites a newer status event                            | pending |          |
| B22 | A non-cancelable dialog `cancel` closes the dialog while state still says open                 | pending |          |
| B23 | `ActionsPanel`'s drawer-motion rAF is not cancelled on unmount                                 | pending |          |
| B24 | A remounted pack downloader's stale `finally` clears `downloadingBookId` mid-download          | pending |          |
| B25 | `AdminConsole`'s new-token draft survives sign-out                                             | pending |          |
| B26 | Admin sessions are a fixed HMAC with a ten-year cookie and cannot be revoked                   | pending |          |
| B27 | A transient grant-fetch failure is never retried while online                                  | pending |          |
| B28 | `InstallBanner`'s parting timer is cleared by a separate `onMount`, not the effect that set it | pending |          |

## Wasted work

| ID | Finding                                                                                   | Verdict | Red test |
| -- | ----------------------------------------------------------------------------------------- | ------- | -------- |
| P1 | Two `+page.svelte` effects re-run on every stroke after the settled-in threshold          | pending |          |
| P2 | The theme-sync effect tracks `colors.activeSwatch`, re-running on every palette tap       | pending |          |
| P3 | Settings sliders write storage (and the native Preferences bridge) on every `input` event | pending |          |

## Gaps

| ID | Finding                                                                                   | Verdict | Red test |
| -- | ----------------------------------------------------------------------------------------- | ------- | -------- |
| G1 | No cross-tab sync: a tightened parental-gate policy does not reach an open second tab     | pending |          |
| G2 | IndexedDB version hard-coded to 1; `splotch-secure` opened through two cached connections | pending |          |
| G3 | `canvas`, `modal`, `network`, `ui`, `persistedStateStatus` have no unit tests             | pending |          |
| G4 | Nothing prevents a per-request SSR route from writing module-level `$state`               | pending |          |

## Evidence

Per-finding evidence lands below as each is vetted.
