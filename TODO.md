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
