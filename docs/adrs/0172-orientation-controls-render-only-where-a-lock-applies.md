# ADR-0172: Orientation Controls Render Only Where a Lock Applies

**Status:** Active **Date:** 2026-09

## Context

The Settings Orientation picker rendered wherever the engine exposed `screen.orientation.lock` and
the primary pointer was coarse (`supportsOrientationLock()`). That is a capability test, and
capability is not permission.

Chromium grants an orientation lock in exactly two states, and
`content/browser/screen_orientation/screen_orientation_provider.cc` tests for precisely that pair:
the page is in element fullscreen, or its display mode is `fullscreen`. Anywhere else `lock()`
rejects with a `SecurityError` naming fullscreen. An installed Splotch satisfies the second
condition through `web/static/site.webmanifest` → `"display": "fullscreen"`; a manifest asking for
`standalone` would not, which is why `isStandalone()` is the wrong signal here despite covering the
installed case.

So in a plain Android browser tab the picker took a choice, persisted it, showed it as selected, and
turned nothing. Worse than inert: Chromium releases the lock when fullscreen ends, so leaving
fullscreen snapped the device back to portrait while the picker still read Landscape. Measured on a
Pixel 7 Pro emulator against the real app.

The previous decision, recorded in `supportsOrientationLock()`'s own comment, was to render anyway,
on the grounds that "a narrower gate would hide a control that becomes functional the moment the
user hits the Fullscreen toggle." That reasoning is sound and the deferred behaviour does work —
tapping Fullscreen applies the saved choice immediately. It was reversed on the maintainer's call
that a control which visibly does nothing costs more than one that appears when it works.

Alternatives considered and rejected:

* **Caption the picker instead of hiding it** ("Turns the screen in fullscreen"). Keeps the setting
  pre-settable and matches the original rationale. Rejected as still presenting a live-looking
  control that does nothing when tapped.
* **Enter fullscreen automatically when Portrait or Landscape is chosen.** The tap carries the user
  activation `requestFullscreen()` needs, so this works. Rejected because
  `lib/state/fullscreen.svelte.ts` deliberately never auto-triggers fullscreen — the chrome flash is
  only acceptable on a deliberate tap — and leaving fullscreen would still silently drop the lock.
* **Emulate Auto from the motion sensor** on platforms that cannot override the OS rotation lock,
  relocking portrait or landscape as gravity swings. Verified working on the emulator. Rejected as
  re-implementing an OS behaviour in the app.

A separate question is Auto, which is not about permission but about the device's own rotation lock.
Auto beats that lock only in the Android shell, through `SensorOrientationPlugin` requesting
`SCREEN_ORIENTATION_SENSOR` (issue #2193). Everywhere else Auto means "follow the system": Chromium
maps `unlock()` to `SCREEN_ORIENTATION_USER` and `lock('any')` to `FULL_USER`, and iOS restores the
all-orientations mask — all of which the user's rotation lock pins. **No platform lets the app read
that setting.** Android could read `Settings.System.ACCELEROMETER_ROTATION`, but Android is the one
platform with nothing to warn about. iOS 26 added `effectiveGeometry.isInterfaceOrientationLocked`,
which reports whether the *app's own* `prefersInterfaceOrientationLocked` request took effect, not
the Control Center setting — and it sits above the iOS 16.4 floor regardless. So greying out or
removing Auto is impossible to do accurately: it would fire for every user, including the majority
who have rotation enabled and for whom Auto works.

The full device x target x rotation-setting matrix this gating produces, with the evidence level
behind each cell, lives in [`docs/ORIENTATION.md`](../ORIENTATION.md).

## Decision

Two gates, both in `web/src/lib/platform/index.ts`.

`orientationLockApplies(fullscreenActive)` decides whether the picker renders at all. It keeps
`supportsOrientationLock()` as the capability half, returns `true` for native (the shells set
orientation on the Activity or scene, with no fullscreen condition), and on the web requires
`fullscreenActive || matchMedia('(display-mode: fullscreen)')`. Both settings shells consume it
through `$derived(orientationLockApplies(fullscreenState.active))`, so the row appears the moment
the Fullscreen Toggle earns it. `AppearanceSection.svelte` hides the whole card;
`CompactShell.svelte` falls back to its About cell, keeping the 2×2 grid flush.

The reactive parameter is load-bearing and must not be "simplified" away: element fullscreen also
sets `display-mode: fullscreen`, so the media query alone would be correct but would never
re-evaluate, because `matchMedia` is not a reactive dependency and `fullscreenState.active` is the
only signal that changes.

`autoOrientationOverridesSystemLock()` decides the caption, returning `getPlatform() === 'android'`
— only the native Android shell reports `'android'`, since Chrome on Android reports `'web'`.
Everywhere else `AppearanceSection.svelte` prints "Auto follows your device's rotation setting." The
compact landscape-phone shell omits it for want of room, and already points at portrait for full
settings.

`applyDeviceOrientationPreference` is unchanged: it still keys a web lock on fullscreen state,
because Chromium drops the lock when fullscreen ends and the persisted choice has to be re-requested
on the next entry.

The E2E consequence is that specs must now reach a lock-honoring state. Chromium exposes no
display-mode override — `Emulation.setEmulatedMedia` does not accept `display-mode`, verified — so
`web/tests/helpers.ts` gains `enterFullscreen`, which triggers real element fullscreen from an F2
keypress. A keypress rather than a click deliberately: a click needs a target, and an overlay above
an open dialog trips outside-click handling and the launch dead zone. Its partner `exitFullscreen`
exists because Chromium refuses `setViewportSize` on a fullscreen window.

## Consequences

\+ No control is offered that cannot do anything, which is the reported symptom.

\+ The gate now matches Chromium's actual condition rather than approximating it, and carries the
source file that defines it.

\+ The installed PWA keeps a working picker, since its manifest asks for `fullscreen`.

\+ Auto's dependency on the device setting is stated wherever it is real, with no detection that
could be wrong.

− The picker appears and disappears as fullscreen is toggled, and a parent cannot pre-set
orientation from a browser tab before entering fullscreen. This is the cost the previous decision
was avoiding.

− A browser tab and the installed app now differ visibly for the same user on the same phone, with
nothing on screen explaining why.

− The manifest's `"display": "fullscreen"` becomes load-bearing for the installed case: switching it
to `standalone` would remove the picker from every installed app. A drift guard in
`platform.orientationLock.test.ts` reads the manifest and the gate's query constant together and
fails on divergence, so the coupling is caught rather than silent — but it is still a coupling
between two files that share no code.

− Firefox for Android 114–143 still slips through: it exposes a `lock()` that always fails, which
neither gate can predict, so the picker renders there and the choice stays unapplied until that
range ages out of the floor.

− Every E2E spec touching the picker now needs a fullscreen round trip, which is setup those specs
did not previously carry.

− The caption is absent from the compact landscape-phone shell, so Auto's caveat goes unstated in
that one surface.
