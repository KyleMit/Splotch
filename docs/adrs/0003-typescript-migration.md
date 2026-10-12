# ADR-0003: Full TypeScript Adoption

**Status:** Active\
**Date:** 2025 (tiered migration)

## Context

The original codebase was written in JavaScript. As the project grew — adding a canvas drawing
engine, multi-layer state modules, a Capacitor native shell, server-side API routes, and
Playwright/Vitest tests — the absence of types made it harder to catch interface mismatches at
development time (e.g., callback signatures between the engine and Svelte components, storage
key/type pairs, API request/response shapes).

## Decision

Migrate the entire codebase to TypeScript with strict mode enabled. The migration was executed in
tiers to keep each commit reviewable:

1. Leaf modules (utilities, helpers)
2. Storage and reactive state
3. Engine, drawing, audio, actions
4. Components (`lang="ts"` in `.svelte` files)
5. Routes and hooks
6. Config files (Vite, Playwright, Vitest)

All new code must be TypeScript. `svelte-check` runs via `npm run check` (and in CI) to surface type
errors before build or test.

## Consequences

* **+** IDE autocompletion and inline error detection across all modules.
* **+** Callback interfaces between the imperative engine and Svelte components are explicitly typed
  (`InitOptions`, `ExportOptions`), preventing silent signature drift.
* **-** Adds a compile step for scripts that previously ran with bare `node`; workaround is
  `node --experimental-strip-types` for lightweight one-off scripts.
* **-** Capacitor plugin types (e.g., `@aparajita/capacitor-secure-storage`) sometimes lag behind
  API changes and require manual type assertions.
