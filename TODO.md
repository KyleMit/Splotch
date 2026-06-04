# Splotch — Code Health TODO

This document lists recommended improvements from a comprehensive code-health pass.
Each task is self-contained: it states the problem, the affected files (with line
references valid as of commit `8f98410`), a concrete approach, and acceptance criteria.
A fresh session should be able to pick up any single task and complete it without
further context.

**How to use this file:** tasks are ordered by priority (highest first). Pick the
**topmost** task, complete it, and **delete that task from this file** when done so the
next run picks up the next most important item. Line numbers drift as the code changes —
re-grep to confirm locations before editing.

**Project shape:** SvelteKit (Svelte 5 runes) + Capacitor app called "Splotch", a
kids' drawing/coloring app. Imperative drawing engine in `src/lib/drawing/`, reactive
state in `src/lib/state/*.svelte.js`, UI in `src/lib/components/`, server/API routes
under `src/routes/api/` and `src/routes/admin/`. Unit tests use Vitest (`npm run
test:unit`); e2e uses Playwright (`npm run test:e2e`).

---

## 4. Guard `localStorage` writes against exceptions

**Problem:** The write helpers call `localStorage.setItem`/`removeItem` unguarded.
`setItem` throws `QuotaExceededError` when storage is full and `SecurityError` in
locked-down or private-mode WebViews. These helpers run synchronously inside every
settings `setX` handler, so a throw propagates into the UI event handler and can break
a toggle. The durable native mirror is already `.catch()`-wrapped; the primary web write
is not.

**Affected files:**
- `src/lib/storage.js` — `writeBool` (~55), `writeString` (~69), `writeInt` (~79), and the `removeItem` path (~100)

**Approach:** Wrap the `localStorage.setItem`/`removeItem` calls in try/catch so a failed
web write degrades gracefully (the durable mirror still provides native fallback). Log at
most once; do not let the exception escape into the caller.

**Acceptance criteria:** a thrown `setItem` (simulate by stubbing) no longer breaks the
calling setter; normal persistence behavior unchanged; existing storage unit tests
(`src/lib/storage.test.js`) still pass under `npm run test:unit`.

---

## 5. Avoid the full-canvas `getImageData` scan on every erase-end / undo

**Problem:** `scanCanvasIsEmpty()` calls `getImageData(0, 0, canvas.width,
canvas.height)` over the entire canvas and loops every 4th byte. It's invoked from
`stopDrawing` whenever the user was erasing and from `undo()`. The 2D context is created
with `willReadFrequently: false`, so the GPU→CPU readback hits the slow path, and the JS
scan is O(pixels) on the main thread — a perceptible hitch on stroke-end on a large
canvas.

**Affected files:**
- `src/lib/drawing/engine.js:45` — `scanCanvasIsEmpty()`
- `src/lib/drawing/engine.js` — the `getContext('2d', …)` call (around the `ctx` setup, ~line 281)

**Approach:** Either set `willReadFrequently: true` on the context (it is read for empty
checks/snapshots and never WebGL-composited), or make the readback cheap by drawing a
downscaled copy into a small offscreen canvas and calling `getImageData` on that. Measure
before/after if practical.

**Acceptance criteria:** empty-canvas detection (clear-button enable/disable, undo state)
remains correct; no full-resolution `getImageData` runs synchronously on stroke-end for
typical canvases. `npm run test:e2e` passes.

---

## 6. Replace the triplicated settings definitions with a descriptor table

**Problem:** Each of the ~13 boolean settings is written three times — in the `$state`
initializer, in a hand-written `setX` setter, and in `reloadSettings()`. Adding a setting
means editing three places; forgetting the `reloadSettings` entry means the setting
silently fails to recover after a native WebView eviction, with nothing to catch it.

**Affected files:**
- `src/lib/state/settings.svelte.js:28-98`

**Approach:** Define a descriptor table, e.g. `const BOOL_SETTINGS = { soundEnabled:
[SOUND_KEY, true], … }`, and generate the initial `$state`, the setters, and the
`reloadSettings` loop from it. Keep `aiUserApiKey` (secure-storage-backed) and
`aiAccessToken` as explicit special cases.

**Acceptance criteria:** all settings read/write/persist and reload exactly as before;
adding a new boolean setting requires editing exactly one place; settings unit tests
pass under `npm run test:unit`.

---

## 7. Parallelize durable-storage hydration

**Problem:** `hydrateDurableStorage` awaits `Preferences.get` (and sometimes `set`) one
key at a time, ~15 serial native bridge round-trips on the cold-start critical path
before `reloadSettings`/`reloadStrokeWidth` run.

**Affected files:**
- `src/lib/storage.js` — `hydrateDurableStorage` (~115-123)

**Approach:** Collect the per-key work into an array and `await Promise.all(...)` (or batch
the gets). Native-only path; does not affect web boot.

**Acceptance criteria:** hydration result identical to the serial version; measured cold
boot does fewer serial awaits; no regression in settings recovery after eviction.

---

## 8. Add rate limiting to `/api/generate-image`

**Problem:** `verify-key` and `verify-access-code` are rate-limited, but
`generate-image` — the most expensive endpoint, which spends *your* Gemini quota for
managed (non-BYOK) tokens — is not. A leaked managed token can be hammered with no
per-token/per-IP throttle until noticed via the Blobs usage tally and manually pulled.

**Affected files:**
- `src/routes/api/generate-image/+server.js`
- `src/lib/server/rateLimit.js` (existing limiter to reuse)

**Approach:** Apply `rateLimit()` keyed by token (and/or IP) on the generate path, with a
tighter limit than the verify endpoints. Only throttle managed-token requests if BYOK
requests should stay unlimited (decide and document). Note the limiter is per-instance on
Netlify — this is a cost guardrail, not a hard security boundary.

**Acceptance criteria:** normal usage is unaffected; rapid repeated calls with one token
get throttled with a clear status; `tests/generate-image.spec.js` still passes (extend it
to cover the throttle if practical).

---

## 9. Don't store the raw admin secret in the session cookie

**Problem:** The `admin_session` cookie is set to `env.ADMIN_ACCESS_TOKEN` verbatim with a
~10-year lifetime, so the (effectively permanent) cookie *is* the master secret. It is
HttpOnly + SameSite=strict + path-scoped and the tradeoff is documented, but any cookie
exfiltration leaks the actual admin password with no rotation/revocation short of
changing the env var.

**Affected files:**
- `src/routes/admin/+page.server.js:22-46` — `setSession`, `secretMatches`, `isAdmin`

**Approach:** Store an opaque random session id or an HMAC of the secret (HMAC keyed by a
server-only secret) rather than the secret itself; compare with the existing constant-time
check. Keep the sliding-renewal behavior. Optionally shorten the lifetime.

**Acceptance criteria:** admin login, the authenticated loader, all mutating actions, and
logout work as before; the stored cookie value is no longer equal to
`ADMIN_ACCESS_TOKEN`; an attacker holding the cookie value cannot derive the secret.

---

## 10. Harden `ClearButton` animation teardown

**Problem:** `stopClearDrag` runs a chained `setTimeout` choreography (nested ~600ms →
50ms plus a ~300ms timeout) that is never tracked or cleared. The `onMount` cleanup clears
only `holdTimer` and `tutorialDismissTimer`, so a mid-animation unmount fires callbacks
against torn-down DOM.

**Affected files:**
- `src/lib/components/ClearButton.svelte` — `stopClearDrag` (~239-268); `onMount` cleanup (~303-304)

**Approach:** Track every timeout id created during the reset choreography and clear them
all in the `onMount` teardown, or drive the reset off CSS `transitionend` instead of
hardcoded delays. (Optionally, longer-term, extract the drag gesture into a `use:` action;
not required for this task.)

**Acceptance criteria:** the clear/reset animation looks and behaves identically; no timer
callback runs after the component unmounts (verify by unmounting mid-animation);
`npm run test:e2e` passes.

---

## 11. Run e2e tests against the production build, not the dev server

**Problem:** `playwright.config.js` starts the app with `vite dev`, so e2e never exercises
the service worker, the adapter output, or production minification — exactly the things
most likely to break a release.

**Affected files:**
- `playwright.config.js:29` — `webServer.command`

**Approach:** Change the CI `webServer` to `vite build && vite preview --port 4173` (align
the port with the server type). Keep a fast dev-server option for local iteration if
desired. Confirm the SW/precache doesn't destabilize existing specs; adjust waits if so.

**Acceptance criteria:** `npm run test:e2e` runs against the built artifact and passes;
the configured port matches the server actually started.

---

## 12. Add a cleanliness guard to the release script

**Problem:** `release.mjs` runs `git add -A`, then commits, tags, and pushes. A stray
edited file in the working tree gets swept into the release commit unnoticed.

**Affected files:**
- `scripts/release.mjs:96-116`

**Approach:** Before staging, run `git status --porcelain` and abort (or prompt/warn) if
files outside the known generated/version paths are dirty. Alternatively stage only the
specific generated/version files instead of `-A`. Optionally `rmSync` the temp notes dir
after the `gh` call.

**Acceptance criteria:** a release with an unrelated dirty file is blocked or clearly
warns before committing; a clean release proceeds exactly as before.

---

## Minor cleanup (do opportunistically; remove each line when done)

- **AI object-URL helper:** `aiImage.js` creates blob URLs (~49/57/75) with no revoke
  in-file; revocation lives in `ui.svelte.js` as 4 repeated revoke-on-replace blocks.
  Consolidate into a `swapObjectUrl(prev, next)` helper in the UI store.
- **`ui.svelte.js` `*Origin` fields** (`colorPickerOrigin`, `coloringBookOrigin`,
  `parentCenterOrigin`, `aiPromptOrigin`) are added dynamically on first open instead of
  declared in the initial `$state`. Declare them as `null` for discoverability.
- **`AboutTab.svelte:19`** `versionClicks` is a plain `let`, not `$state` — works today
  only because nothing renders it. Make it `$state(0)` (or comment why it's non-reactive).
- **Brand color `#AB71E1`** (and hover `#9961d1`) is a literal hex in ~8 places across the
  parent components and the canvas background. Promote to a `--brand` CSS custom property.
- **`drawingSound.js`** re-arms a `clearTimeout`/`setTimeout` pair on every `pointermove`
  that never fires (stroke-end already stops sound); and `.play()` is called without a
  `.catch()`, producing unhandled-rejection noise. Remove the redundant timer; add `.catch(() => {})`.
- **Cross-component DOM reach:** `ActionsPanel.svelte:51` and `ColorPicker.svelte:95`
  measure another component's element via `querySelector` (`ActionsPanel` with a 100ms
  `setTimeout` layout race). Share the needed layout value through state instead.
- **`SetupInstructions.svelte`** iOS/Android branches are near-identical and could be
  data-driven; it also hand-rolls a UA sniff alongside the imported `$lib/platform.js`.

**Acceptance criteria (minor items):** behavior unchanged; readability/robustness improved.
