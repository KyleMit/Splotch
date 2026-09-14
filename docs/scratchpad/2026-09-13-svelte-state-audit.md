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

| ID  | Finding                                                                                        | Verdict                                | Red test                                                  |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| B1  | Ctrl/Cmd+Z undoes a canvas stroke while typing in a dialog field                               | pending                                |                                                           |
| B2  | A late report response overwrites a reopened feedback form and erases the new draft            | CONFIRMED                              | `flows-settings-report.spec.ts`                           |
| B3  | Raw `history.replaceState` erases SvelteKit's history index, so Back changes only the URL      | CONFIRMED (feedback); prod run pending | `feedback.spec.ts`, `page.spec.ts`                        |
| B4  | The `/design` light/dark toggle persists an origin-wide theme with no way back to system       | DROP (ADR-0096)                        | —                                                         |
| B5  | An access code is dropped for the session when secure storage rejects the save                 | DROP                                   | —                                                         |
| B6  | Abandoning a credential save after a failed hydrate writes `''` and erases the stored secret   | CONFIRMED                              | `secureCredentialCoordinator.test.ts`                     |
| B7  | The cached IndexedDB connection is never reopened after the browser closes it                  | CONFIRMED                              | `secure-storage-connection.spec.ts`                       |
| B8  | Undoing a coloring-page change restores the page with a stale orientation                      | pending                                |                                                           |
| B9  | An auto-save throw after a delivered AI result also records an error                           | REFUTED                                | —                                                         |
| B10 | The `initDrawingCanvas` fallback never replays `canUndo`/`canvasEmpty` into `canvasState`      | pending                                |                                                           |
| B11 | A malformed grant response yields `remaining: NaN` with `available: true`                      | CONFIRMED                              | `freeGenerations.svelte.test.ts`                          |
| B12 | Pre-hydration strokes never tick `canvasState.strokeCount`                                     | pending                                |                                                           |
| B13 | The Settings landing effect tracks seen-stamps and re-scrolls the pane on durable restore      | CONFIRMED, untested                    | —                                                         |
| B14 | `reportStatus` has two writers (parent effect and child teardown)                              | REFUTED                                | —                                                         |
| B15 | A cross-tab race marks the secure vault empty while a secret exists                            | CONFIRMED                              | `secureStorage.test.ts`                                   |
| B16 | A failed native Preferences removal resurrects a removed key on the next reconcile             | CONFIRMED                              | `storage.test.ts`                                         |
| B17 | `app.html`'s boot script skips the `theme-color` repaint when storage throws                   | CONFIRMED                              | `app.html.test.ts`                                        |
| B18 | Session counters accept negative or oversized stored values                                    | DROP                                   | —                                                         |
| B19 | `install`'s `onDurableRestore` hook is unreachable on web and reloads only part of its state   | DROP (dead code)                       | —                                                         |
| B20 | Save-folder hydration is last-write-wins against a concurrent folder change                    | REFUTED                                | —                                                         |
| B21 | A slow native `Network.getStatus()` overwrites a newer status event                            | CONFIRMED                              | `network.svelte.test.ts`                                  |
| B22 | A non-cancelable dialog `cancel` closes the dialog while state still says open                 | CONFIRMED                              | `ai-report.spec.ts`, `flows-parental-gate-escape.spec.ts` |
| B23 | `ActionsPanel`'s drawer-motion rAF is not cancelled on unmount                                 | pending                                |                                                           |
| B24 | A remounted pack downloader's stale `finally` clears `downloadingBookId` mid-download          | CONFIRMED                              | `manager.test.ts`                                         |
| B25 | `AdminConsole`'s new-token draft survives sign-out                                             | CONFIRMED                              | `admin.spec.ts`                                           |
| B26 | Admin sessions are a fixed HMAC with a ten-year cookie and cannot be revoked                   | DROP (ADR-0016)                        | —                                                         |
| B27 | A transient grant-fetch failure is never retried while online                                  | CONFIRMED                              | `freeGenerations.svelte.test.ts`                          |
| B28 | `InstallBanner`'s parting timer is cleared by a separate `onMount`, not the effect that set it | REFUTED                                | —                                                         |

## Wasted work

| ID | Finding                                                                                   | Verdict | Red test |
| -- | ----------------------------------------------------------------------------------------- | ------- | -------- |
| P1 | Two `+page.svelte` effects re-run on every stroke after the settled-in threshold          | pending |          |
| P2 | The theme-sync effect tracks `colors.activeSwatch`, re-running on every palette tap       | pending |          |
| P3 | Settings sliders write storage (and the native Preferences bridge) on every `input` event | DROP    | —        |

## Gaps

| ID | Finding                                                                                   | Verdict                       | Red test                                |
| -- | ----------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| G1 | No cross-tab sync: a tightened parental-gate policy does not reach an open second tab     | CONFIRMED                     | `flows-parental-gate-cross-tab.spec.ts` |
| G2 | IndexedDB version hard-coded to 1; `splotch-secure` opened through two cached connections | DROP                          | —                                       |
| G3 | `canvas`, `modal`, `network`, `ui`, `persistedStateStatus` have no unit tests             | DROP (network covered by B21) | —                                       |
| G4 | Nothing prevents a per-request SSR route from writing module-level `$state`               | Real gap, no violation        | —                                       |

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

### Settings and components

* **B2 — CONFIRMED.** The late first POST writes "Thanks for your feedback." and clears the new
  draft; reopening also re-enables Send, and a second send aborts the first report. Red, in
  `web/tests/flows-settings-report.spec.ts`:
  `a report sent before reopening Settings leaves the new draft in place`
  (`Expected: "The stamps are upside down." Received: ""`) and
  `a second report sent after reopening Settings leaves the first to land` (`"failed"` in place of
  `"finished"`). The existing `reopening Settings mid-submit leaves the sent report to land` still
  passes.
* **B13 — CONFIRMED, untested.** A throwaway dev probe with Settings scrolled to About: calling
  `reloadSectionsSeen()` snapped the pane to 0 and moved the highlight to Appearance, and a rerun
  also re-locks an unlocked Parent Center. Unreachable in CI: the reload fires only on native, once
  at cold start, when Preferences restores an evicted value. The effect's self-triggered rerun lands
  in the same flush before its rAF and is invisible. Fix is one `untrack`.
* **B14 — REFUTED.** None of the three `AiImageReport` branches has a transition, so the outgoing
  teardown runs in the flush that mounts the incoming instance, before any user input can move it to
  `confirm`/`busy`.
* **B22 — CONFIRMED (Chromium).** One Escape after a click keeps the dialog open; a second Escape
  without fresh activation closes it natively. Red: `web/tests/ai-report.spec.ts` —
  `the confirmation stays up through repeated Escape presses while sending` (`open` expected true,
  received false); `web/tests/flows-parental-gate-escape.spec.ts` —
  `the success card survives repeated Escape presses` (the pending AI prompt never opens because
  `dismissGate` dropped it).
* **B25 — CONFIRMED.** Red: `web/tests/admin.spec.ts` —
  `web /admin signing out discards an unsent code draft`
  (`Expected: "" Received: "e2e-unsent-draft"`). It adds two sign-ins against the 10-per-minute
  admin login limit — watch for 429 flake.
* **B28 — REFUTED.** At most one timer (the `parting` flag blocks a second) and the `onMount` clears
  it on unmount. The effect's self-rerun is exactly why the timer cannot move into the effect's
  cleanup — worth a comment when fixes land.
* **P3 — DROP.** `Slider.apply` calls `onInput` only when the rounded value changes (at most 100
  writes per full volume sweep, 60 for button size), and each step already does heavier work (the
  audio preview, the live re-layout). Not on the drawing path.
* **New, unvetted — N1.** A parental gate left open after its Settings or result dialog closes still
  runs its destination when solved later; for a picture report that raises the confirmation over a
  closed result.

### Routing, AI, network, packs

* **B3 — CONFIRMED for `/feedback`.** After the `?sent=1` strip `history.state` is `null` (the
  `/beta` control, which uses `$app/navigation`, keeps `sveltekit:history`); Back from `/` fires a
  null-state popstate and SvelteKit only updates the URL. Red: `web/tests/feedback.spec.ts` —
  `Back from the drawing app renders the feedback page again, not just its URL` (4/4 and 2/2 on the
  dev server, at `#drawingCanvas` count 0), guarded by `expectNoReload` after an early spurious pass
  from a dep-optimizer reload. `web/tests/page.spec.ts` —
  `Back to the drawing app after ${name} strips its launch parameter renders the canvas` for an
  invite link and a stale-page recovery: the `?v=` case skips on the dev server (`initPWAUpdates`
  returns early in DEV) and the invite case is blocked in dev by S1, so both await the
  production-build run.
* **B4 — DROP.** ADR-0096 makes the `/design` picker deliberately write an explicit preference that
  "persists across reloads and drawing-page visits"; System stays reachable in Settings →
  Appearance.
* **B9 — REFUTED.** ce846e16b already guards every throw path in `autoSaveImages`, covered at
  `aiImage.test.ts`.
* **B11 — CONFIRMED (low reachability).** Red: `settles a 200 grant response with %s as unavailable`
  — a missing or non-numeric `remaining` yields `available: true, remaining: NaN` ("NaN free left");
  a body with no `ok` flag leaves `loading` true forever.
* **B21 — CONFIRMED (one bridge round-trip at startup).** Red: new `network.svelte.test.ts` —
  `keeps a status change that arrives before the initial status read resolves`
  (`expected true to be false`); passes when the late `getStatus` never resolves.
* **B24 — CONFIRMED (native).** `+page.svelte` installs downloads on mount and stops on unmount, so
  `/privacy` and back builds a second downloader while native `stop()` leaves the first running; the
  "Downloading X" label vanishes and both runs install the same book. Red: `manager.test.ts` —
  `keeps the new run downloading while the stopped run settles its install`
  (`expected null to be 'dinosaur'`).
* **B26 — DROP.** Facts verified, but ADR-0016 accepts them ("revocation is only by rotating the
  secret"). Theft needs the admin's HttpOnly, SameSite=Strict, `path=/admin` cookie. Reopen only
  with new evidence.
* **B27 — CONFIRMED.** One failed grant fetch while online hides the canvas AI button until a
  reconnect, an AI settings change, or a panel remount. Red:
  `retries a transient status failure while online without waiting for a reconnect`
  (`called 2 times, but got 1 times`); it assumes a timer retry within ten minutes, so a
  visibility-change retry design would need the test adjusted.
* **G3 — DROP**, except `network.svelte.ts`, which now has B21's test file. `canvas` and
  `persistedStateStatus` are logic-free; `modal` and `ui` are trivial and covered by E2E.
* **G4 — real gap, no violation today.** Per-request on web: `/admin`, `/feedback`, `/design`, and
  `+error.svelte`. The only state use there is `/design` reading `resolvedTheme` after mount and
  calling `setTheme` in a click handler; `iconRegistry` fills module state at SSR import with a
  constant. Candidate guard: a Vitest render of each non-prerendered route via `svelte/server`
  asserting module `$state` is unchanged.
* **Side finding — S1.** On the dev server, client-side navigation off `/` throws
  `Cannot read properties of null (reading 'removeEventListener')` at `PointerHalos.svelte:192` (the
  effect cleanup reads the `canvasEl` prop after the parent's binding nulled it), breaking two
  existing `page.spec.ts` tests in dev. Production behavior pending.
