# ADR-0002: Svelte 5 Runes Over Legacy Stores

**Status:** Active — amended in 2026-09 with the state and lifecycle standards established by epic
#1926 (see the amendment below).\
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

## Amendment (2026-09): State and lifecycle standards

The migration proved that choosing runes did not by itself settle ownership, lifecycle, or async
coordination. Epic #1926 fixed the recurring failure modes and established the following standards
for rune-based state.

### State ownership and shape

* A shared-state module owns one encapsulated shape: a `createX()` factory over private `$state`,
  read-only getters, and named mutators. Its shared instance is exported as `<basename>State`; modal
  controllers end in `Modal`. Nested mutable objects need a genuinely read-only view rather than
  TypeScript's shallow `Readonly<T>`. `tools/tests/state-export-names.test.mjs` drift-guards the
  singleton naming and one-instance rule. Tests create fresh instances through the factory.
* A module that subscribes to browser or platform state exposes symmetric `install()` and
  `dispose()` methods on that same instance. The production singleton still installs once at module
  load behind its client guard; tests install and dispose their own instance.
* Multi-phase async state is one tagged union. Consumers narrow on its discriminant instead of
  inferring a phase from independent booleans, nullable results, and error fields that can disagree.
* An in-memory value that mirrors persisted state cannot outlive the storage fact it represents.
  Failed or superseded reads do not prove absence; writes and hydrations carry ownership/version
  checks, and a storage connection or removal marker is refreshed or retired with its backing
  storage rather than cached indefinitely.

### Effects and component lifecycle

* `$effect` is a synchronization boundary, not a state-transition detector. It pushes reactive state
  to systems outside Svelte such as the drawing engine, browser APIs, storage, and subscriptions.
  User and application transitions live in their initiating handlers, declarative relationships in
  `$derived`, and dialog lifecycle transitions in the modal action's `onOpen` or `onClose`. A rare
  reconciliation owned by a different component must explain why no initiating handler owns both
  sides and must not recover the transition with a previous-value latch.
* Threshold behavior gates on a `$derived` boolean, so an effect follows the threshold state rather
  than reimplementing its comparison. Bookkeeping that an effect writes but must not subscribe to is
  read with `untrack`.
* Use `onMount(() => teardown)` for imperative wiring that installs exactly once for a component's
  mount and is removed at unmount. Use an `$effect` cleanup when the subscription depends on
  reactive inputs and must be replaced as those inputs change. Browser-only cleanup also belongs in
  an effect rather than `onDestroy`, because `onDestroy` runs during SSR while effects do not.

### Async ownership

* Resetting a view invalidates the work started by the previous visit. When the operation has an
  external side effect that must still land, reset detaches it instead of aborting it; its late
  result is ignored, and the next request neither waits for nor aborts it. Every result is applied
  only after an ownership check proves it still belongs to the visit that sent it.
* An abort scheduled by the operation's own deadline is a visible timeout failure. An abort caused
  by superseding the operation or unmounting its owner is silent because no current view owns that
  result. The distinction must survive both the fetch and response-body-read phases.

### Bindings, events, and dialogs

* Every `$bindable` has one writer. A parent-reset/child-edit form field may be two-way bound, but a
  value a child fills asynchronously stays child-local and is returned through a method. Functions
  are never bindable; a child exposes behavior as an exported function and the parent obtains the
  component through `bind:this`.
* Pointer-driven controls accept only `PointerEvent.button === 0`. APIs requiring transient user
  activation (wake lock, fullscreen) are requested from `pointerup`, `touchend`, or `click`, never
  `pointerdown`.
* A document-level listener that must observe Svelte-delegated events registers in capture phase or
  through `on()` from `svelte/events`; otherwise delegated propagation can hide the event from it.
* A conditionally rendered dialog remains mounted until the native dialog and its close animation
  have retired. State scoped to one open of a long-lived component is cleared on close, not left for
  the next visit.
* Gesture guards share only `PRESS_CLICK_CONSUME_WINDOW_MS`. They do not share a click-swallowing
  helper: `scribbleGuard`, `colorFoldGesture`, `pinchTextZoom`, and `launchGuard` consume the click
  at different points in different pointer lifecycles, and a common helper would merely encode those
  differences as options.
* A newly attached drawing-engine callback set receives the engine's current flags immediately on
  both paths: adopting the early-boot engine and falling back to a fresh initialization. Waiting for
  the next change leaves reactive UI stale.

### SSR and navigation

* A route rendered per request on the web never writes module-level state while rendering. The
  separate Vitest pass under `web/vitest.webSsr.config.ts` compiles the web branches, snapshots
  every module instance, renders every per-request route, and drift-guards both inventories.
* Svelte instance scripts do not read browser globals at top level. The
  `svelte/no-top-level-browser-globals` lint rule enforces this; `/dev/engine` carries the narrow
  exemption because its route declares `ssr = false`.
* Code that strips a query before SvelteKit's router has mounted uses
  `history.replaceState(history.state, '', url)`. Preserving `history.state` keeps SvelteKit's
  navigation index intact, and `eslint.config.js` rejects direct `pushState` or a replacement that
  discards it. `$app/navigation` helpers are used only after the router is live.

### Regression tests

* Async lifecycle tests exercise each ownership boundary independently—reset, supersede, unmount,
  deadline, and late settlement—instead of asserting only that a reopen happens to look clean.
* Dialog keyboard tests allow for focus to fall back to `<body>` when focused content unmounts, then
  prove the product deliberately restores or moves it.
* Every new red regression test gets a negative control against the pre-fix code. A test that also
  passes there does not prove the defect is covered.

### Accepted non-goals

Splotch does not add a state-machine/state library, does not move app state into Svelte context, and
does not synchronize state across tabs. The factories, tagged unions, and explicit ownership rules
are sufficient for the app's current scope.
