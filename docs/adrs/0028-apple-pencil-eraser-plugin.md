# ADR-0028: A Custom `PencilEraser` Capacitor Plugin for the Apple Pencil Double-Tap

**Status:** Active
**Date:** 2026-06

## Context

Splotch has an eraser tool toggled by the on-screen eraser button in the Actions Panel
(`toolState.eraser`, `web/src/lib/state/tool.svelte.ts`). The request was to let an Apple
Pencil drive the eraser "with the back of the pencil."

Apple Pencil has **no physical eraser end** — that's a Surface/Wacom feature, which the
browser exposes as the PointerEvent eraser button (bit 5). The genuine "Apple Pencil
eraser" is the **double-tap gesture** on Apple Pencil 2 / Pro, which drawing apps
conventionally map to *switch between the current tool and the eraser*.

That gesture is delivered by UIKit's **`UIPencilInteraction`** and is **not** visible to the
WKWebView — it never appears in PointerEvents, the `buttons` bitfield, or any web API. So,
like device-lock state (ADR-0027), it can only be captured natively and forwarded to the web
layer. No installed `@capacitor/*` plugin exposes it.

The web canvas needed **no changes**: the drawing engine already tracks `erase` per pointer
and composites with `destination-out`, so the feature is purely a native gesture driving the
existing tool state.

**Scope decisions (confirmed with the product owner):**

- **Double-tap only.** No squeeze (Apple Pencil Pro), and we deliberately *ignore* the
  user's iPadOS `preferredTapAction` — in this toddler app a double-tap always means "toggle
  eraser," which is predictable for a parent who may not have configured the system setting.
- **iOS / Apple Pencil only.** We did *not* wire up the generic PointerEvent eraser-button
  path, so eraser-tipped styluses on web/Android are out of scope this round.
- **Parent opt-out, revealed by use.** Toddlers double-tapping at random flip pen↔eraser and
  get confused, so parents need an off switch — but only the minority of devices have a
  pencil, so a permanent toggle would be clutter for everyone else. There is no reliable
  web-exposed API to ask "is an Apple Pencil paired," so instead of proactive detection we
  detect **lazily**: the first double-tap sets a sticky per-device flag, and the Parent
  Center toggle appears only once that flag is set. The feature defaults **on** so it works
  out of the box; the very first double-tap both erases and reveals the off switch.

## Decision

Add a minimal app-local Capacitor plugin, **`PencilEraser`**, that emits a `doubleTap`
event — the first **event-emitting** local plugin (ADR-0027's `DeviceLock` is request/reply)
and the first to attach a **UIKit interaction to the web view**:

- **iOS** — `ios/App/App/PencilEraserPlugin.swift`, an `@objc` `CAPPlugin` +
  `CAPBridgedPlugin` (with empty `pluginMethods` — it has no callable methods) that also
  conforms to `UIPencilInteractionDelegate`. Its `attach(to:)` installs a
  `UIPencilInteraction` on a view; `pencilInteractionDidTap(_:)` calls
  `notifyListeners("doubleTap", …)`. We use the classic delegate callback because it is the
  only one available down to the iOS 15 deployment target (it still fires, deprecated, on
  newer iPadOS). As ADR-0027 established, **Capacitor 8 does not auto-discover plugin
  classes**, so `MainViewController.swift` (`capacitorDidLoad()`) both
  `registerPluginInstance(…)`s it *and* calls `attach(to: bridge?.webView)`. The instance is
  held strongly by the VC because `UIPencilInteraction.delegate` is weak. Added to the App
  target's Compile Sources by hand (`project.pbxproj`), mirroring `AppDelegate.swift`; no
  `Package.swift` edit (SPM, ADR-0020).
- **No Android** — out of scope (see above).
- **JS** — `web/src/lib/plugins/pencilEraser.ts`, a typed `registerPlugin('PencilEraser', …)`
  facade with an inert `web` fallback, loaded through an `__IS_CAPACITOR__`-gated lazy
  `import()` so `@capacitor/core` stays out of the SSR/prerender graph and the web bundle. It also exports
  `initPencilEraser()`, which (only when `isNative()` and the platform is `ios`) subscribes to
  `doubleTap` and returns a cleanup that detaches the listener — synchronous-return even
  though the subscription resolves asynchronously. `DrawingCanvas.svelte`'s `onMount`
  lazy-loads and starts it (guarded by `isNative()` so the module — and `@capacitor/core` —
  never load on web) and runs the cleanup on teardown.
- **Behavior / opt-out** — the listener calls `handleDoubleTap()`, a pure-enough exported
  function that (1) sets the sticky `applePencilSeen` flag the first time it runs, then
  (2) toggles the eraser + fires an `impactThreshold()` haptic **only if**
  `pencilEraserEnabled` is on. Both live in the table-driven `settings.svelte.ts`
  (`pencilEraserEnabled` default `true`, `applePencilSeen` default `false`). Detection is
  recorded even while the feature is disabled so the toggle stays available to re-enable.
  `SettingsToggles.svelte` renders the "Apple Pencil double-tap to erase" row only
  `{#if settings.applePencilSeen}`, mirroring the existing conditional `showOrientationControls`
  rows.

`toggleEraser()` was added to `tool.svelte.ts` as the shared flip used by the bridge (and
available to the on-screen button), keeping the toggle logic in one unit-testable place.

## Consequences

- **+** On iPad with an Apple Pencil 2 / Pro, a double-tap toggles pen ↔ eraser with a haptic
  tick, matching the on-screen button — no web/Android impact.
- **+** Parents get an off switch that only shows up on devices where it's relevant (a pencil
  has been used), so the Parent Center stays uncluttered for the finger-only majority while
  giving pencil households a way to stop accidental tool-flipping.
- **+** Extends ADR-0027's local-plugin pattern to **event-emitting** plugins
  (`notifyListeners` + a JS `addListener` facade) and to **attaching a UIKit interaction to
  the web view** from `capacitorDidLoad()` — documented in the `mobile` skill.
- **−** More hand-written native code that needs a **fresh native build** (`ios:run`);
  `cap:sync` alone won't compile/register it. The new Swift file needs manual
  `project.pbxproj` Compile-Sources entries, and the VC must retain the plugin instance
  (weak delegate) — easy to miss.
- **−** Uses the deprecated `pencilInteractionDidTap(_:)`; if a future deployment target
  drops it, switch to the newer `pencilInteraction(_:didReceiveTap:)` behind an availability
  check.
- **−** Only unit-testable at the web-fallback / no-op level; the real gesture can't be
  simulated by Playwright or Maestro, so it needs **on-device verification** with a physical
  Apple Pencil.
- **−** Apple Pencil 1 (no double-tap) and finger/other styluses get no native eraser
  shortcut — they still use the on-screen button. The generic PointerEvent eraser-button
  path remains available as a future, cross-platform follow-up.
