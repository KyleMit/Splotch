# ADR-0027: A Custom `DeviceLock` Capacitor Plugin to Detect Guided Access / App Pinning

**Status:** Active
**Date:** 2026-06

## Context

The Parent Center's setup panel (`SetupInstructions.svelte`) teaches parents how to
lock the app for a toddler — **Guided Access** on iOS, **App Pinning** on Android — and
already shows a green ✓ when the *web PWA* is installed (`display-mode: standalone`). We
wanted the same confirmation for the device lock: when the lock is actually engaged, show
a ✓ and swap the "enable" steps for "how to exit" steps.

Neither lock state is visible to the WebView/JS layer — both are native-only:

- iOS — `UIAccessibility.isGuidedAccessEnabled`
- Android — `ActivityManager.getLockTaskModeState()` (≠ `LOCK_TASK_MODE_NONE`)

No installed `@capacitor/*` plugin exposes either, and the repo had **no custom native
plugin** at all (only stock `MainActivity.java` / `AppDelegate.swift` with minor overrides).

This is the mirror image of the orientation-lock decision recorded in `platform.ts`, which
deliberately *avoided* a native plugin. The two differ on the facts that matter:

- **Orientation lock** had no authoritative synchronous native query (UIKit exposes the
  lock *state* but not "can this scene be locked"), and the answer was approximable from a
  build-/device-class heuristic — so a plugin wasn't worth it.
- **Lock state** *does* have an authoritative, synchronous native query on each platform,
  and the value is a per-device **runtime** fact (it changes as the parent toggles the
  lock), so it can't be a build-time constant or a CSS/UA heuristic. A tiny native bridge
  is the only correct source.

## Decision

Add a minimal local Capacitor plugin, **`DeviceLock`**, with a single method
`isLocked(): Promise<{ locked: boolean }>`:

- **iOS** — two Swift files in the App target (`ios/App/App/`). `DeviceLockPlugin.swift`
  is an `@objc` `CAPPlugin` + `CAPBridgedPlugin` whose `isLocked` reads
  `UIAccessibility.isGuidedAccessEnabled` on the main thread. Crucially, **Capacitor 8 does
  not auto-discover plugin classes** — `registerPlugins()` only loads its built-ins plus
  the `packageClassList` that `cap sync` writes into `capacitor.config.json` from npm
  *packages*, so an app-local class is never registered and calls fail with `"DeviceLock"
  plugin is not implemented on ios`. We register it explicitly in `MainViewController.swift`
  (a `CAPBridgeViewController` subclass) via `capacitorDidLoad()` →
  `bridge?.registerPluginInstance(DeviceLockPlugin())`, and point `Main.storyboard`'s root
  VC at `MainViewController`. Both files are added to Compile Sources by hand — the project
  uses classic Xcode file references (not synchronized groups) and `cap sync` won't add
  them. No `Package.swift` edit (SPM, ADR-0020).
- **Android** — `DeviceLockPlugin.java`, a `@CapacitorPlugin` returning
  `getLockTaskModeState() != LOCK_TASK_MODE_NONE` (covers user pinning *and* MDM lock-task;
  `getLockTaskModeState` is API 23+, below our minSdk 24). Registered via
  `registerPlugin(DeviceLockPlugin.class)` **before** `super.onCreate` in `MainActivity`.
- **JS** — `web/src/lib/plugins/deviceLock.ts`, a typed `registerPlugin('DeviceLock', …)`
  facade whose `web` fallback always resolves `{ locked: false }` (the web genuinely can't
  observe either state). Loaded through an `__IS_CAPACITOR__`-gated lazy `import()` so
  `@capacitor/core` stays out of the SSR/prerender graph and the web bundle (the same
  convention `NotchBand.svelte` uses).

`SetupInstructions.svelte` re-checks **on Parent Center open only** — reusing its existing
`$effect(open)` re-detect pattern with a `cancelled` guard — rather than subscribing to a
live listener. iOS offers a change notification but Android has no clean lock-task event;
on-open detection is accurate whenever a parent looks at the panel and keeps the plugin
surface to one method, symmetric across platforms.

## Consequences

- **+** Parents get the same confidence signal for the device lock as for PWA install: a ✓
  plus exit steps when the lock is on, instead of stale "enable" instructions.
- **+** Establishes the repo's pattern for custom native plugins (iOS: `@objc` `CAPPlugin`
  \+ `CAPBridgedPlugin` Swift class **explicitly registered** in a `CAPBridgeViewController`
  subclass's `capacitorDidLoad()`; Android: `@CapacitorPlugin` + `registerPlugin`; JS: a
  typed `registerPlugin` facade with a web fallback loaded via an `__IS_CAPACITOR__`-gated
  lazy `import()`) —
  documented in the `mobile` skill, including the iOS no-auto-discovery trap.
- **−** First hand-written native code beyond the activity/delegate overrides: three native
  files (two Swift on iOS — the plugin + the VC subclass — plus Java on Android), the iOS
  ones needing manual `project.pbxproj` Compile-Sources entries and a storyboard edit, and
  adding/changing them needs a **fresh native build** (`android:run` / `ios:run`).
- **−** The iOS registration is non-obvious: a `CAPBridgedPlugin` compiles and links but is
  never registered (Capacitor only loads built-ins + npm `packageClassList`), so without the
  explicit `registerPluginInstance` it silently fails at runtime. Easy to forget for the
  next app-local plugin.
- **−** On-open detection won't update a ✓ live if the lock toggles while the panel is
  already open; reopening refreshes it. A listener could be added later if needed.
- **−** Only unit-testable at the web-fallback level; the real native reads require
  on-device verification (Guided Access on iPhone, App Pinning on Android).
