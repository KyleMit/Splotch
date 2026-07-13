# ADR-0002: Svelte 5 Runes Over Legacy Stores

**Status:** Active\
**Date:** 2024

## Context

Svelte 5 introduced a new reactivity model based on *runes* (`$state`, `$derived`, `$effect`) as a
replacement for legacy `writable`/`readable` stores and reactive declarations (`$:`, `let x = ...`).
The two models can coexist during migration, but maintaining both long-term adds cognitive overhead.

Splotch's reactive state layer (`state/*.svelte.ts`) manages the active color, palette, stroke
width, active tool, settings, layout, network status, and coloring book — roughly a dozen
independent stores.

## Decision

Use Svelte 5 runes exclusively. No legacy Svelte stores. All reactive state is expressed as `$state`
/ `$derived` / `$effect` in `.svelte.ts` modules.

The file extension `.svelte.ts` (not `.ts`) is required for the Svelte compiler to process rune
syntax in non-component files.

## Consequences

* **+** Uniform reactivity model across components and modules; no mixing of the `$store`
  subscription shorthand and rune-based accessors.
* **+** Runes are more explicit about reactive boundaries; derived state and side effects are
  clearly delineated.
* **+** Vitest can import `.svelte.ts` state modules directly after compilation by the SvelteKit
  Vite plugin in `vitest.config.ts`.
* **-** Requires Svelte 5 throughout; older community examples and libraries targeting Svelte 4
  syntax won't apply directly.
* **-** `.svelte.ts` extension can confuse editors and tools that don't know the convention.
