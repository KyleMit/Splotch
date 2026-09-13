# ADR-0165: Android System Back Goes Through a Local `SystemBack` Plugin

**Status:** Active **Date:** 2026-09

## Context

Nothing in the Android app handled the system Back button or the back gesture. `MainActivity`
registered no `OnBackPressedCallback`, and Capacitor's `BridgeActivity` registers none either, so
Back fell through to `Activity`'s default. On Android 12 and newer that moves the task to the
background. On Android 7 through 11 (`minSdkVersion` 24) it finishes the activity, which destroys
the WebView and the drawing with it, because drawings are not kept across a reload (issue 1450).
Back never closed an open dialog: a parent pressing Back to close Settings left the app instead.

The behavior, decided with the product owner:

1. If a dialog is open, Back closes the top one, exactly as that dialog's own close control does. It
   never bypasses the Grown-Ups Only check: closing the check cancels it.
2. If nothing is open and the canvas is empty, Back leaves the app at once.
3. If nothing is open and the canvas has ink, Back asks first. Confirming leaves; cancelling, or
   Back again, stays.

iOS has no system Back, and the web keeps the browser's own history Back. Neither may change.

Two ways to reach Back from the web layer were weighed:

* **`@capacitor/app` and its `backButton` listener.** First-party and small. It is a whole-app
  plugin, though: `cap sync` adds it to the iOS Swift package too, so iOS would ship a new native
  plugin for a feature iOS does not have. Without a listener it navigates the WebView's history
  before leaving, which this app does not want. Its `exitApp()` finishes the activity, the very
  behavior that loses the drawing on Android 11 and older; `minimizeApp()` would have to be used
  instead. Placement would also need a decision under ADR-0070.
* **An app-local Android plugin**, the `DeviceLock` (ADR-0027) and `ColoringPacks` (ADR-0103)
  pattern. About forty lines of Java, no iOS or npm footprint, and exactly the two operations the
  feature needs.

For the dialog stack, the app already has one source of truth: every modal is a native `<dialog>`
opened through the `modalDialog` action, so the browser's top layer holds them in the order they
opened. The platform offers no way to read that order back, and nested dialogs are real (the check
opens over Settings; the AI report confirmation opens over the AI result).

## Decision

**Native.** `android/app/src/main/java/art/splotch/app/SystemBackPlugin.java`, registered in
`MainActivity`, adds an always-enabled `OnBackPressedCallback` to the activity's AndroidX
`OnBackPressedDispatcher` in `load()`. When the page has a `back` listener, the callback only
notifies it. When it has none, the callback disables itself, re-dispatches, and re-enables, so the
system default runs. That fallback is load-bearing: before the web layer subscribes, and after a
page reload (`Bridge.reset()` clears every plugin listener), a callback that always consumed Back
would swallow it with nothing left to answer. `moveToBackground()` calls `moveTaskToBack(true)`,
which on every API level leaves the app the way Android 12+ Back does, keeping the activity and its
drawing.

**Predictive back.** The AndroidX dispatcher registers an `OnBackInvokedCallback` itself on Android
13+ when the platform dispatches through one, and falls back to `onBackPressed()` otherwise. With
`targetSdkVersion` 36 the platform uses the new path on Android 16+ with no manifest opt-in, and on
13–15 without `android:enableOnBackInvokedCallback` it still calls `onBackPressed()`. The same
callback runs in both, so the manifest is unchanged. Because the callback is always enabled while
Splotch is in front, the system back-to-home animation never plays; the decision is made in the web
layer, after the gesture commits.

**Web.** `web/src/lib/boot/systemBack.ts` is the only static edge into the startup graph. It imports
`./systemBackHandler` behind `__IS_CAPACITOR__ && getPlatform() === 'android'`, so the web build
drops the import and iOS never takes the branch. The handler mounts the Leave Splotch dialog
(`LeaveConfirm.svelte`) through the page's overlay list and subscribes to the plugin, returning a
cleanup that detaches a subscription even if it resolves after cleanup.

`respondToSystemBack()` decides, in order:

1. `dismissTopModal()` from `web/src/lib/actions/modalDialog.svelte.ts`. Each `modalDialog` action
   pushes itself onto a module-level list when it calls `showModal()` and removes itself on `close`,
   so the list mirrors the top layer. The top entry dismisses through its own `onRequestClose`
   behind its own `allowDismiss`, which is the same path as a backdrop tap. A dialog whose open flag
   is already false (still retiring after its own close) refuses, so Back cannot reach the dialog
   beneath it. A refusal keeps the app in front.
2. If any page-level modal flag is open but its dialog has not mounted from the lazy overlay chunk,
   Back does nothing.
3. An empty canvas (`canvasState.canvasEmpty`) leaves through `moveToBackground()`.
4. Otherwise it opens Leave Splotch.

The Grown-Ups Only check needs no special case: its `onRequestClose` is `dismissGate()`, which
discards the pending destination, and its `allowDismiss` holds the card open during the success
hand-off. A lockout is a deadline in `parentalGate.svelte.ts`, so closing the card never ends one.

Leave Splotch is itself a `modalDialog`, so Back on it is its cancel. Repeated Back therefore
alternates between opening and closing the question and never leaves; only the Leave button leaves.
Keep drawing is first in the card, so `showModal()` focuses the choice that stays. The copy says
only what holds: the drawing stays while Splotch is in the background, and is lost if Splotch
closes.

## Consequences

* \+ Back closes dialogs on Android with the same focus return as their own close, and a toddler
  mashing Back cannot leave a drawing.
* \+ Android 7–11 keep the drawing when Back leaves, which the platform default did not.
* \+ No iOS change, no new npm dependency, and nothing in the web bundle: the web export contains
  none of the plugin, handler, or dialog code.
* \+ The top-layer mirror in `modalDialog` is available to any future caller that needs the topmost
  dialog.
* − Back on a multi-level dialog (the phone Settings hub and its sections) closes the whole dialog,
  as Escape does, rather than stepping back one level.
* − Predictive back's back-to-home animation never shows while Splotch is in front.
* − Before the web layer subscribes, and in the moment a page reload clears listeners, Back takes
  the system default. On Android 7–11 that still finishes the activity.
* − A dialog that bypassed `modalDialog` would be invisible to Back. Every app dialog uses it today.
