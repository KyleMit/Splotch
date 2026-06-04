# Splotch — Code Health TODO

This document lists recommended improvements from a comprehensive code-health pass.
Each task is self-contained: it states the problem, the affected files (with line
references valid as of commit `66ae88d`), a concrete approach, and acceptance criteria.
A fresh session should be able to pick up any single task and complete it without
further context.

**Project shape:** SvelteKit (Svelte 5 runes) + Capacitor app called "Splotch", a
kids' drawing/coloring app. Imperative drawing engine in `src/lib/drawing/`, reactive
state in `src/lib/state/*.svelte.js`, UI in `src/lib/components/`, server/API routes
under `src/routes/api/` and `src/routes/admin/`. Tests use Playwright (`npm test`).

**General rules for any task here:**
- Match the surrounding code style. Comments in this repo explain *why*, not *what* —
  keep that convention.
- Run `npm test` (Playwright) after structural changes where practical.
- Don't introduce new dependencies without calling it out.
- Line numbers may have drifted; re-grep to confirm before editing.

Tasks are ordered by recommended attack order. Priority tags: **[High]** / **[Med]** / **[Low]**.

---

## Task 1 — Extract a dual-context drawing helper in the engine **[Med, low-risk]**

**File:** `src/lib/drawing/engine.js`

**Problem:** Every canvas drawing operation is written twice — once for the visible
`ctx`, once for the off-screen `virtualCtx` (used to preserve the drawing across
resizes). The mirrored blocks live in:
- `startDrawing()` — the visible block at ~132–140, the `virtualCtx` block at ~142–152
- `draw()` — visible at ~187–194, `virtualCtx` at ~196–205
- `undo()` — ~256–262
- `clearCanvas()` — ~316–319

This ~40 lines of mirror-image code must be hand-synced; a change to one side that
misses the other is a latent bug.

**Approach:** Introduce a helper that yields whichever contexts exist, then write each
operation once:

```js
function activeContexts() {
  return virtualCtx ? [ctx, virtualCtx] : [ctx];
}
```

Refactor `startDrawing`, `draw`, `undo`, and `clearCanvas` to loop over
`activeContexts()`. For the stroke segment in `draw()`, a small helper like:

```js
function strokeSegment(c, ps, x, y) {
  c.globalCompositeOperation = ps.erase ? 'destination-out' : 'source-over';
  c.strokeStyle = ps.color;
  c.lineWidth = ps.lineWidth;
  c.beginPath();
  c.moveTo(ps.x, ps.y);
  c.lineTo(x, y);
  c.stroke();
  c.globalCompositeOperation = 'source-over';
}
```

Note: `clearCanvas`/`undo` clear `ctx` over `canvas.width/height` but `virtualCtx`
over `virtualCanvas.width/height` — those dimensions differ, so keep the clear-rect
dimensions context-specific (don't blindly share one rectangle).

**Acceptance criteria:**
- No behavioral change: draw, erase, undo, clear, and resize all still work.
- The duplicated blocks are gone; each drawing op is expressed once.
- Manually verify resize preservation still works (draw something, resize the window,
  drawing persists).

---

## Task 2 — Add rate limiting to the access-code verification endpoint **[High, security]**

**Files:** `src/routes/api/verify-access-code/+server.js` (primary),
`src/routes/api/verify-key/+server.js` (secondary), `src/lib/server/tokens.js` (reference)

**Problem:** `verify-access-code` returns `{ ok: true, accessCode }` whenever the
submitted code matches an allowed token (`+server.js:21-22`). Combined with the
wide-open CORS policy in `src/hooks.server.js` (`Access-Control-Allow-Origin: *`),
this is an unauthenticated brute-force oracle. Tokens are arbitrary admin-chosen
strings (see `src/lib/server/tokens.js`), so short/guessable ones are at risk. There
is currently no throttling.

**Approach (pick one, simplest acceptable):**
- Per-IP rate limit: track attempts in a short-lived in-memory `Map` keyed by client
  IP (available via the `getClientAddress()` arg in the SvelteKit handler), e.g. max
  ~10 attempts/minute, returning HTTP 429 when exceeded. In-memory is fine given
  Netlify's function lifecycle is short; document the limitation in a comment.
- Or, for durability across cold starts, a small counter in Netlify Blobs (the same
  pattern `tokens.js` and `generate-image`'s `recordUsage` already use via `getStore`).

Apply the same limiter to `verify-key` (lower risk — it bills the caller's own Gemini
quota — but the same abuse shape). Keep the limiter as a shared helper, e.g.
`src/lib/server/rateLimit.js`, so both routes import it.

**Acceptance criteria:**
- Rapid repeated POSTs from one client get throttled (429) after the threshold.
- Legitimate single use is unaffected.
- A brief comment explains the chosen approach and any persistence caveat.

**Related, optional:** In `src/routes/api/generate-image/+server.js`, `recordUsage()`
(line ~16) logs the full token and prompt and is `await`ed in the request path.
Consider truncating the token in logs (last 4 chars) and not blocking the response on
the Blobs write. Small, can be folded in here or done separately.

---

## Task 3 — Extract shared modal CSS **[Med, low-risk]**

**Files:** `src/lib/components/ParentCenter.svelte`, `AiImageResult.svelte`,
`ColoringBook.svelte`, `ColorPicker.svelte`, `AiImagePrompt.svelte`; global stylesheet
`src/app.css`

**Problem:** The `::backdrop` blur treatment and the `dialogFlyFromOrigin` open
animation are copy-pasted verbatim across all five `<dialog>`-based modals. Each block
looks roughly like:

```css
.modal::backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.modal[open] {
  animation: dialogFlyFromOrigin 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}
```

**Approach:** Move the shared backdrop styling and the `@keyframes dialogFlyFromOrigin`
definition into `src/app.css` under a shared class (e.g. `.modal-dialog`). Add that
class to each `<dialog>` and delete the per-component duplicates. Keep component-specific
modal styling (sizing, layout, colors) local. Confirm `app.css` is globally imported
(check `src/routes/+layout.svelte`).

**Acceptance criteria:**
- All five modals still animate in and show the blurred backdrop identically.
- The duplicated CSS blocks are removed from the components.
- No visual regression (open each modal and compare).

---

## Task 4 — Decompose `ParentCenter.svelte` **[High, larger effort]**

**File:** `src/lib/components/ParentCenter.svelte` (~1491 lines)

**Problem:** This single component handles ~6 unrelated responsibilities: BYOK Gemini
key management (submit/validate/forget/mask), access-code redemption, ~8 settings
toggles, iOS/Android "add to home screen" setup instructions, the about/release-notes
view, and an admin-unlock easter egg. Its size makes it the biggest readability and
maintainability liability in the repo.

**Approach:** Split into child components, leaving `ParentCenter` as a ~250-line tab
orchestrator that owns modal open/close state and routes between tabs. Suggested split:
- `AiKeyManager.svelte` — BYOK key entry/validation/forget + access-code redemption,
  the masked-key display, and the status message. Talks to
  `src/lib/state/settings.svelte.js` and the `/api/verify-key` /
  `/api/verify-access-code` endpoints.
- `SettingsToggles.svelte` — the toggle list, bound to `settings.svelte.js`.
- `SetupInstructions.svelte` — the iOS/Android accordion content (OS detection,
  PWA-installed detection).
- `AboutTab.svelte` — release notes (`src/lib/releases.json`), links, version info.

Keep state ownership clear: shared reactive state lives in the `state/` modules
(`settings.svelte.js`, `ui.svelte.js`), so children should import those directly rather
than receiving everything via props — minimize prop drilling.

**Watch out for:**
- This component uses Svelte 5 runes. Preserve `$state`/`$derived`/`$effect` semantics
  when moving code; don't convert `$derived` values into `$effect` writes.
- There is an `$effect` that imperatively resets several pieces of local state when the
  modal opens (look near the top, ~line 194). Decide where reset logic lives once the
  pieces are split (likely each child resets its own, or the orchestrator passes an
  `open` signal).
- The admin easter egg / unlock flow must keep working.

**Acceptance criteria:**
- `ParentCenter.svelte` is substantially smaller (target < ~300 lines) and reads as an
  orchestrator.
- Each extracted concern lives in its own component with a clear responsibility.
- All existing behavior preserved: key submit/validate/forget, access-code redemption,
  every toggle, setup instructions per-OS, about tab, admin unlock.
- `npm test` passes; manually exercise each tab.

---

## Task 5 — Harden the admin route **[Med, security]**

**File:** `src/routes/admin/+page.server.js`

**Problem:** The admin secret travels in the `access-key` URL query param
(`requireAdmin`, line ~14), so it leaks into browser history, server/CDN logs, and
`Referer` headers. The comparison `key !== expected` (line ~16) is also non-constant-time.
`requireAdmin(url)` is duplicated across `load` and both form actions.

**Approach:**
- Replace the query-param secret with an HTTP-only cookie set via a POST login step,
  or at minimum stop reflecting `access-key` back into the page/links.
- Use `crypto.timingSafeEqual` (Node `crypto`) for the comparison, guarding for
  length-mismatch first.
- Centralize the check — a `handle` hook scoped to `/admin` in `src/hooks.server.js`,
  or a single shared helper — so it isn't repeated in three places.

**Note:** This is acceptable as-is if the admin page is genuinely private and rarely
used. Treat as a judgment call; the constant-time comparison and de-duplication are
worth doing regardless.

**Acceptance criteria:**
- Admin auth still gates `load`, `add`, and `remove`.
- The secret is no longer exposed in URLs/logs (if the cookie approach is taken).
- Comparison is constant-time; the check exists in one place.

---

## Task 6 — Cap the uploaded image size in image generation **[Low–Med, security]**

**File:** `src/routes/api/generate-image/+server.js`

**Problem:** The uploaded image blob is read fully into memory and base64-encoded
(lines ~76-77) with no size limit. A valid-token holder could submit a very large
payload (memory/DoS pressure).

**Approach:** After confirming `imageFile instanceof Blob` (line ~54), reject when
`imageFile.size` exceeds a sane cap (e.g. ~15 MB) with `throw error(413, ...)`.
Optionally validate `imageFile.type` against an allowlist (`image/png`, `image/jpeg`,
`image/webp`).

**Acceptance criteria:**
- Oversized uploads are rejected before the arrayBuffer read.
- Normal drawings (well under the cap) still generate successfully.

---

## Task 7 — Fix the speed-tracking window in `draw()` **[Low, correctness/clarity]**

**File:** `src/lib/drawing/engine.js`, `draw()` ~lines 174-183

**Problem:** The "100ms sliding window" used to compute pointer speed (which drives the
drawing sound) is subtly incorrect: it `push`es a distance on every move but only ever
`shift`s a *single* element when `now - windowStartTime > 100`, and resets
`windowStartTime` at that point. So it's not a true sliding window and the divisor
(`windowTime`) resets oddly. It's not a performance problem (the array stays ~6-12
elements), just confusing and slightly wrong.

**Approach:** Replace with an honest time-windowed structure — store `{ t, distance }`
samples, drop entries older than 100ms from the front each move, and divide summed
distance by the actual elapsed span. Or simplify to an exponential moving average of
instantaneous speed if exactness isn't needed (the consumer is just an audio cue).

**Acceptance criteria:**
- Drawing sound still responds to stroke speed sensibly.
- The windowing logic is correct and readable.

---

## Task 8 — Object-URL lifecycle cleanup **[Low]**

**Files:** `src/lib/drawing/screenshot.js`, `src/lib/drawing/aiImage.js`,
`src/lib/components/AiImagePrompt.svelte`

**Problem:** Several `URL.createObjectURL(...)` calls are not reliably paired with
`URL.revokeObjectURL(...)` on error or component-unmount paths, leaking blob URLs.
- `aiImage.js`: preview URL created (~line 49/57) not revoked if generation fails.
- `screenshot.js`: URL(s) created in `saveScreenshot` (~lines 58/73) not revoked on the
  native path / error path.
- `AiImagePrompt.svelte`: `loadPreview()` creates a URL relying on manual
  `cleanupPreview()`; unmount before cleanup leaks it.

**Approach:** Track the current object URL in a variable, revoke the previous one before
creating a new one, and revoke in `finally`/error branches and on component teardown
(an `$effect` cleanup return in the Svelte component).

**Acceptance criteria:**
- No leaked blob URLs across generate-success, generate-failure, screenshot, and
  modal-close/unmount flows.
- Existing behavior (preview shows, screenshot saves, AI result displays) unchanged.

---

## Task 9 — Minor cleanups **[Low]**

Small, independent items. Each can be done in isolation.

- **Named constants in `ClearButton.svelte`:** the hold duration, movement threshold,
  and accept-radius factor are magic numbers (~lines 28-32) — give them named consts
  with a one-line comment each. Also verify timer cleanup (`holdTimer`,
  `tutorialDismissTimer`) on the `onMount` teardown return (~lines 283-297) clears
  pending timers if the component unmounts mid-interaction.
- **Magic `100`ms gesture window in `engine.js`** (`startDrawing` line ~98, the
  color-change debounce; and the speed window) — name it.
- **`aria-live="polite"` on the BYOK key status message** in the AI key UI (currently
  uses `role` alone) so screen readers announce validation results.
- **Consistent event-handler naming:** the codebase mixes `handleX` and inline lambdas;
  pick `handle<Event>` for non-trivial handlers. Cosmetic; do opportunistically.

**Acceptance criteria:** behavior unchanged; readability improved.

---

## Explicitly NOT recommended (conscious decisions)

These came up in review but are fine as designed — don't "fix" them without a reason:

- **CORS `*` on `/api/*`** (`src/hooks.server.js`): intentional and documented. The
  native WebView origins call the hosted API cross-origin; routes are token-gated
  server-side. Leave as-is.
- **CSRF tokens on the API routes:** already handled via the `csrf.trustedOrigins`
  config for the Capacitor WebView origins. No change needed.
- **`scanCanvasIsEmpty()` full pixel scan** (`engine.js:35`): runs only on erase-stroke
  end and undo (not in the move loop), so it's a one-shot `pointerup` cost — acceptable.
  Only revisit if profiling on a very large canvas shows a real hitch.
