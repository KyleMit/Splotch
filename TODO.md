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

## Minor cleanup (do opportunistically; remove each line when done)

- **`SetupInstructions.svelte`** iOS/Android branches are near-identical and could be
  data-driven; it also hand-rolls a UA sniff alongside the imported `$lib/platform.js`.

**Acceptance criteria (minor items):** behavior unchanged; readability/robustness improved.
