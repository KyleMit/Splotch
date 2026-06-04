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



Small, independent items. Each can be done in isolation.

- **`aria-live="polite"` on the BYOK key status message** in the AI key UI (currently
  uses `role` alone) so screen readers announce validation results.
- **Consistent event-handler naming:** the codebase mixes `handleX` and inline lambdas;
  pick `handle<Event>` for non-trivial handlers. Cosmetic; do opportunistically.

**Acceptance criteria:** behavior unchanged; readability improved.
