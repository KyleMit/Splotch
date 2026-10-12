# ADR-0133: Capture the Control Surface the Product Actually Offers

**Status:** Active — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md)
**Date:** 2026-08

## Context

[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md) requires a performance capture to
drive the product's own controls, and specifically forbids bypassing product persistence with a
test-only preference mutation. The runner encoded that rule as two fixed assumptions: a native
orientation change flips the Settings rotation-lock toggle, and an action sweep opens Settings and
walks its section list.

Both assumptions are false in modes the deployment matrix is required to cover, and the 2026-08-20
campaign lost 20 cells to them:

* `AppearanceSection.svelte` renders `#lockRotationToggle` behind `supportsOrientationLock()`, which
  returns false for a native tablet because iPadOS windowing ignores an in-app lock. The runner read
  the absent toggle as an ADR-0090 unavailability and refused to rotate, leaving the iPad
  simulator's native landscape drawing and all four of its action modes unmeasured. The same guard
  would have blocked the physical iPad, so the campaign's framing of this as a simulator limitation
  was wrong.
* `SettingsModal.svelte` selects `CompactShell` under
  `(orientation: landscape) and (max-height: 599px)`, and that shell deliberately offers quick
  toggles plus "Switch to portrait for the full settings" instead of a section list. The sweep
  waited for section rows that a correct product does not draw, and the timeout discarded the entire
  capture — including the drawer, palette, brush, coloring, screenshot, undo, clear, and rotation
  actions that never touch Settings. Every Android landscape action cell failed this way, three
  attempts each, across physical and emulated, web and native.

The alternatives were worse. Adding a profiling-only orientation seam or mutating the persisted
preference directly is exactly what ADR-0090 forbids, and it would measure a path no child can take.
Forcing the device to portrait to reach the section list would measure the wrong mode and silently
relabel it. Reporting both as permanently unavailable — the status quo — attributes a harness
assumption to the product and leaves a fifth of the matrix blank.

## Decision

A capture resolves the product's real control surface for the platform and mode under test, rather
than assuming one surface everywhere.

**Orientation.** `setNativeRotationLock` in `tools/perf/lib/campaign-state.mjs` returns the exported
`PLATFORM_OWNS_ROTATION` sentinel when Settings renders no rotation-lock toggle, instead of
overloading `null`. The distinction is sound because `openAppearanceSettings` has already waited for
the Appearance pane's theme picker, so a missing toggle cannot be a pane that failed to open — it is
the product's answer. `capture-xcuitest-screen.mjs` treats that answer as "no in-app lock to
release": it rotates the device, skips the restore that would re-lock a control that does not exist,
and records `automation.platformOwnsRotation` in the capture. ADR-0090's rule is satisfied rather
than skipped, because device rotation is the only orientation path the product offers there.

**Settings shell.** `capture-xcuitest-actions.mjs` detects `#settingsModal .quick-toggles` before
waiting for section rows. In the compact shell it skips the section sweep, measures the controls
that shell actually renders — `#quickNightToggle`, `#quickSoundToggle`,
`#quickAdvancedControlsToggle` — under labels that name the compact shell, and records
`settingsShell` in the artifact.

The non-obvious invariant: **a mode is comparable only against the same shell.** Compact-shell
labels are deliberately distinct from their sectioned counterparts so the matrix never scores one
against the other, and a differing label set between two modes reads as a different shell rather
than a regression. `tools/perf/tests/xcuitest-actions.test.mjs` holds each selector against
`CompactShell.svelte`, because a renamed id would otherwise restore the silent timeout with no test
failing.

## Consequences

\+ 20 matrix cells become measurable — 12 on the iPad simulator native target, 8 across Android
landscape — without weakening ADR-0090's persisted-setting rule or inventing a test-only seam.

\+ A capture now carries what it measured: `platformOwnsRotation` and `settingsShell` make the
control surface part of the evidence rather than an assumption a reader has to reconstruct.

\+ The physical-iPad native path is unblocked ahead of time; it would have hit the identical
rotation guard once device discovery worked.

− The action vocabulary is no longer uniform across modes. A landscape phone contributes a smaller,
differently-labelled action set, so cross-mode action coverage is genuinely uneven and the report's
per-mode column counts differ by shell.

− Two harness behaviors are now keyed to product markup the perf suite cannot import — the compact
shell's container and toggle ids, and the rotation toggle's absence. The drift guard converts a
rename into a test failure, but it is a guard rather than a shared constant.

− Reading a missing control as a product answer is only safe because the surrounding code proves the
pane rendered first. A future caller that reaches for a control without establishing its container
would misread a genuine failure as "the platform owns it."
