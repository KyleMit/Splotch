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
