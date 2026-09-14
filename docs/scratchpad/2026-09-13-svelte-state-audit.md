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

| ID  | Finding                                                                                        | Verdict          | Red test                              |
| --- | ---------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------- |
| B1  | Ctrl/Cmd+Z undoes a canvas stroke while typing in a dialog field                               | pending          |                                       |
| B2  | A late report response overwrites a reopened feedback form and erases the new draft            | pending          |                                       |
| B3  | Raw `history.replaceState` erases SvelteKit's history index, so Back changes only the URL      | pending          |                                       |
| B4  | The `/design` light/dark toggle persists an origin-wide theme with no way back to system       | pending          |                                       |
| B5  | An access code is dropped for the session when secure storage rejects the save                 | DROP             | —                                     |
| B6  | Abandoning a credential save after a failed hydrate writes `''` and erases the stored secret   | CONFIRMED        | `secureCredentialCoordinator.test.ts` |
| B7  | The cached IndexedDB connection is never reopened after the browser closes it                  | CONFIRMED        | `secure-storage-connection.spec.ts`   |
| B8  | Undoing a coloring-page change restores the page with a stale orientation                      | pending          |                                       |
| B9  | An auto-save throw after a delivered AI result also records an error                           | pending          |                                       |
| B10 | The `initDrawingCanvas` fallback never replays `canUndo`/`canvasEmpty` into `canvasState`      | pending          |                                       |
| B11 | A malformed grant response yields `remaining: NaN` with `available: true`                      | pending          |                                       |
| B12 | Pre-hydration strokes never tick `canvasState.strokeCount`                                     | pending          |                                       |
| B13 | The Settings landing effect tracks seen-stamps and re-scrolls the pane on durable restore      | pending          |                                       |
| B14 | `reportStatus` has two writers (parent effect and child teardown)                              | pending          |                                       |
| B15 | A cross-tab race marks the secure vault empty while a secret exists                            | CONFIRMED        | `secureStorage.test.ts`               |
| B16 | A failed native Preferences removal resurrects a removed key on the next reconcile             | CONFIRMED        | `storage.test.ts`                     |
| B17 | `app.html`'s boot script skips the `theme-color` repaint when storage throws                   | CONFIRMED        | `app.html.test.ts`                    |
| B18 | Session counters accept negative or oversized stored values                                    | DROP             | —                                     |
| B19 | `install`'s `onDurableRestore` hook is unreachable on web and reloads only part of its state   | DROP (dead code) | —                                     |
| B20 | Save-folder hydration is last-write-wins against a concurrent folder change                    | REFUTED          | —                                     |
| B21 | A slow native `Network.getStatus()` overwrites a newer status event                            | pending          |                                       |
| B22 | A non-cancelable dialog `cancel` closes the dialog while state still says open                 | pending          |                                       |
| B23 | `ActionsPanel`'s drawer-motion rAF is not cancelled on unmount                                 | pending          |                                       |
| B24 | A remounted pack downloader's stale `finally` clears `downloadingBookId` mid-download          | pending          |                                       |
| B25 | `AdminConsole`'s new-token draft survives sign-out                                             | pending          |                                       |
| B26 | Admin sessions are a fixed HMAC with a ten-year cookie and cannot be revoked                   | pending          |                                       |
| B27 | A transient grant-fetch failure is never retried while online                                  | pending          |                                       |
| B28 | `InstallBanner`'s parting timer is cleared by a separate `onMount`, not the effect that set it | pending          |                                       |

## Wasted work

| ID | Finding                                                                                   | Verdict | Red test |
| -- | ----------------------------------------------------------------------------------------- | ------- | -------- |
| P1 | Two `+page.svelte` effects re-run on every stroke after the settled-in threshold          | pending |          |
| P2 | The theme-sync effect tracks `colors.activeSwatch`, re-running on every palette tap       | pending |          |
| P3 | Settings sliders write storage (and the native Preferences bridge) on every `input` event | pending |          |

## Gaps

| ID | Finding                                                                                   | Verdict   | Red test                                |
| -- | ----------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| G1 | No cross-tab sync: a tightened parental-gate policy does not reach an open second tab     | CONFIRMED | `flows-parental-gate-cross-tab.spec.ts` |
| G2 | IndexedDB version hard-coded to 1; `splotch-secure` opened through two cached connections | DROP      | —                                       |
| G3 | `canvas`, `modal`, `network`, `ui`, `persistedStateStatus` have no unit tests             | pending   |                                         |
| G4 | Nothing prevents a per-request SSR route from writing module-level `$state`               | pending   |                                         |

## Evidence

Per-finding evidence, grouped by vetting pass.

### Persistence and credentials

* **B5 — DROP.** Intentional: b0275fec8 ("Persist AI credentials before publishing state") chose
  persist-then-publish to fix an earlier finding where a key looked active and vanished on reload.
  Pinned by `keeps the live code empty when secure persistence rejects` and
  `keeps the invitation parameter and live state when secure persistence fails`; the retained URL
  parameter lets a reload retry.
* **B6 — CONFIRMED.** The abandon rollback re-persists the in-memory value, which is `''` after a
  failed hydrate, clearing the stored secret. Narrow window (the abandon must land during the
  IndexedDB write); B15 is a realistic source of the empty memory. Red:
  `createSecureCredentialCoordinator after a failed hydration > keeps the stored secret when a save is abandoned mid-write`
  — `expected '' to be 'stored-secret'`.
* **B7 — CONFIRMED.** A CDP `Storage.clearDataForOrigin` (indexeddb) closes the app's connections;
  the next key save reports "could not be saved securely" because the cached connection is dead.
  Red: `web/tests/secure-storage-connection.spec.ts` —
  `an API key saves after the browser closes the secure-storage connection`. Control without the
  clear passes.
* **G2 — DROP.** One store per database (`splotch-secure/secrets`, `splotch-fs/handles`); the fixed
  version is documented in `idbDatabase.ts`; the second `splotch-secure` connection is redundant but
  harmless.
* **B15 — CONFIRMED.** Forced interleaving: tab A's absent read, tab B saves and clears the flag,
  tab A records absent; the next launch skips the database and returns null. Red:
  `skipping the vault when every row is known absent > keeps a secret another tab saved during an absent read reachable on the next launch`
  — `expected null to be 'secret-key-123'`.
* **B16 — CONFIRMED (native, low likelihood).** Likelier trigger than a rejected remove: the app is
  killed before the fire-and-forget remove lands. A legacy plaintext key can return and be re-saved
  into secure storage. Red:
  `removeKey > keeps a removed key removed after a failed Preferences removal and the next durable restore`
  — `expected 'plaintext-key' to be null`.
* **B17 — CONFIRMED (cosmetic).** `theme-color` keeps its light value in dark mode when storage
  throws; matters only on routes that never load the theme module. Red:
  `paints the OS theme when storage refuses every read` — `expected 'unpainted' to be '#17171d'`.
* **B18 — DROP.** Only the app writes these counters, always within `0..limit`; a negative value
  needs a manual edit, and a huge one saturates early rather than delaying.
* **B19 — DROP as a bug.** Durable restore fires only on native, where `initInstallPrompt` exits
  early. The `onDurableRestore(reloadInstallRepromptState)` registration is dead code worth
  deleting.
* **B20 — REFUTED.** `loadHandle` in `folderSave.ts` re-reads when the cached handle changed during
  a pending read, and `changeSaveFolder` assigns only after picker and IndexedDB tasks. Covered by
  `folderSave.test.ts` ("uses a replacement folder when the old IndexedDB read resolves during a
  save").
* **G1 — CONFIRMED (web-only gap).** No `storage` listener or `BroadcastChannel` exists. With two
  tabs, arming "Sending feedback: Every time" in one leaves the other sending ungated until reload.
  Not a store-compliance issue (native has one WebView). Red:
  `web/tests/flows-parental-gate-cross-tab.spec.ts` —
  `a check armed in one tab guards the same action in a tab already open` —
  `#parentalGate … Received: hidden`.
