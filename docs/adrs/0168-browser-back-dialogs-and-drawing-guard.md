# ADR-0168: Browser Back Models Dialogs and One Drawing Guard in History

**Status:** Active **Date:** 2026-09

## Context

ADR-0165 gave the native Android app an explicit system-Back policy and deliberately left browser
history alone. That boundary made Back unsafe in the installed PWA and surprising in mobile
browsers: it could leave the drawing route while a dialog was open, and the first Back after drawing
could discard the only in-memory copy of the picture. Browser history still has to remain real
history. A protection that continually replaces or cancels navigation would trap the user, and
drawing persistence or a save-error surface is a separate product decision.

The alternatives considered were:

* Intercept `beforeunload` or show a browser confirmation. That API cannot close an in-page dialog,
  has inconsistent mobile presentation, and would ask repeatedly rather than give one predictable
  cushion.
* Add a guard in every browser context. That makes a desktop tab require an unexplained extra Back
  after drawing, where accidental system gestures are not the problem.
* Detect Android from the user agent. That omits iOS Safari's edge-swipe history gesture and makes
  installed desktop PWAs depend on a mutable identity string instead of their interaction and
  display capabilities.
* Persist the drawing before navigation. That expands this interaction fix into drawing lifecycle,
  storage, and failure UX, all outside issue 1937.

## Decision

The web build represents dismissible UI as shallow SvelteKit history entries. Every dialog opened
through `modalDialog` adds one layer. Browser Back removes the top layer and asks that dialog to
close through the same guarded request path as its own controls. Closing through a dialog control
traverses back over the corresponding layer, so repeated open/close cycles do not accumulate stray
entries. Nested dialogs remain one layer each.

The first transition from an empty canvas to ink adds one drawing-guard layer only when either
`(pointer: coarse)` or `(display-mode: standalone)` matches. The former covers touch browsers,
including iOS Safari's edge-swipe history navigation; the latter covers installed PWAs even with a
fine pointer. Consuming that layer marks the guard spent for the current JavaScript runtime, so the
next Back is normal navigation and later strokes do not trap the user. Clearing the canvas before
the layer is consumed removes it and permits a later drawing to arm it again.

Desktop browser tabs with a fine pointer get dialog layers but no drawing guard. Native Capacitor
builds get none of this handler: Android keeps ADR-0165's local-plugin policy, and native iOS
remains unchanged.

`web/src/lib/boot/webBackHandler.ts` owns the history stack and dialog responses, while
`web/src/lib/boot/systemBack.ts` keeps the web and native handlers behind mutually exclusive build
branches. `web/src/lib/actions/modalDialog.svelte.ts` publishes open and closing transitions from
the existing top-layer mirror. The drawing route publishes only its empty/non-empty state; it does
not persist ink.

Two lifecycle cases constrain the history design:

* Client-side navigation away from `/` preserves the shallow entry. Returning with Back restores the
  open dialog, and the next Back dismisses it before leaving the drawing route.
* A full document load cannot hydrate on a shallow SvelteKit entry. The pre-hydration script in
  `web/src/app.html` detects the page-state marker and traverses past its dialog and guard layers
  before the router starts. `web/src/app.html.test.ts` guards the duplicated bundle-boundary key.

## Consequences

* \+ Back closes the top dialog in browsers and installed PWAs through the dialog's existing close
  policy, including nested and lazily mounted dialogs.
* \+ A touch browser or installed PWA gets exactly one reversible Back after drawing, followed by
  ordinary navigation rather than a permanent trap.
* \+ Desktop tabs retain normal drawing navigation, while their dialogs still participate in Back.
* \+ iOS Safari history gestures follow the same touch-browser policy without changing the native
  iOS app.
* \+ Native Android behavior and bundle boundaries from ADR-0165 remain intact.
* − The guard protects only the current in-memory route visit; it neither saves nor restores a
  drawing.
* − Browser history gains invisible shallow entries while a dialog or guard is active, so refresh
  needs an early bootstrap unwind before SvelteKit hydration.
* − Pointer and display-mode media queries are capability proxies. A hybrid fine-pointer browser
  outside standalone mode receives dialog handling but not the drawing guard until it reports a
  coarse primary pointer.
