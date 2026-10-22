# Device rotation and landscape

Read this before changing the Orientation picker or device rotation. ADR-0172 records the gating
rationale; ADR-0182 replaces its Svelte/Capacitor implementation with the RN app in ``. Browser API
risks live in `docs/COMPATIBILITY.md`.

## The two questions

1. **May the app turn the screen right now?** The platform's `useOrientationLockApplies()` controls
   the picker and whether a saved lock is requested.
2. **Can Auto override the device's own rotation lock?** `autoOverridesSystemLock()` answers this
   separately. Only native Android returns true.

## Current implementation

The choice is `portrait`, `landscape` or `auto`, persisted as `orientation` by
`src/settings/orientation.ts`. The native owner is `src/platform/deviceOrientation.ts`; Metro
resolves its `.web.ts` counterpart for browsers.

* **Native Portrait / Landscape** request Expo's `PORTRAIT_UP` / `LANDSCAPE_RIGHT` locks.
* **Native Auto** requests Android's `SCREEN_ORIENTATION_SENSOR` through `lockPlatformAsync`, so
  Auto can follow the sensor even with the OS rotation toggle off. iOS calls `unlockAsync()` and
  follows the system.
* **Native tablets** have no picker and no lock request when the shorter screen side is at least
  `TABLET_MIN_SIDE_PX` (600dp). The subscription follows live screen changes: crossing the tablet
  boundary releases or reapplies the saved choice. This avoids Android 16's large-screen ignore and
  windowed-iPad letterboxing.
* **Native ordering** serializes requests and settles the latest wanted target; an older async
  request cannot land after the newer target. Refused requests remain retryable.
* **Browser gating** requires a Screen Orientation lock method, a coarse primary pointer and element
  fullscreen or fullscreen display mode. Browser Auto unlocks; it does not override the OS toggle. A
  fullscreen change reruns the saved choice.
* **iOS integration** uses scene geometry requests. The `expo-screen-orientation` patch in
  `patches/` removes the obsolete `UIDevice` orientation setter that iOS 26 rejects. No supported
  iOS version predates the geometry API.
* **Dialogs** declare all supported orientations through the modal shell so a phone modal does not
  veto a Landscape choice in Settings.

A method's presence is not proof it will succeed: desktop Chromium and some older Firefox versions
expose a lock that rejects. A render-time gate cannot probe by actually rotating the screen. The web
picker still has that limitation on touch-primary desktops and large Android screens; these are
recorded constraints, not evidence for a new capability detector.

## Testing

* `tools/tests/native-orientation-settings.test.mjs` checks persisted choices and native lock
  behavior, including request ordering and the live tablet boundary.
* `tools/tests/native-orientation-web.test.mjs` checks browser gating and fullscreen changes.
* `tools/migration/tests/rsd-native-orientation.test.mjs` mounts the picker.
* `tools/tests/native-paper-rotation-mounted.test.mjs` turns the paper with a drawing on it.
* `tools/tests/native-runtime-warning-patches.test.mjs` checks the iOS dependency patch.
* `tools/migration/tests/rsd-native-modal-frame.test.mjs` checks dialog orientation support.
* `e2e/specs/orientation-picker.spec.ts` and `e2e/specs/settings-quick-toggles.spec.ts` cover
  browser layout, the absent tab case and the Auto caption on the RN export.

Chromium has no display-mode override. Browser specs use the real fullscreen helpers in
`e2e/support/group-c.ts`; exit fullscreen before resizing the viewport, because Chromium refuses a
fullscreen resize. The retired Svelte platform/orientation unit tests are historical coverage, not a
second active enforcement tier.

## Historical device evidence

This table records the 2026-09 Svelte/Capacitor investigation behind ADR-0172. The native
measurements are not a recapture of the RN app; retain their provenance when using them. Current RN
behavior is defined above and tested below.

"Dead" means the control renders but changes nothing. Evidence: **M** measured on a Pixel 7 Pro
emulator (2026-09-22), **S** read from implementation source, **D** vendor documentation, **I**
inferred from a verified rule without a direct test.

| Device and target                               | Picker shows | Portrait / Landscape | Auto, rotation on | Auto, rotation off | Ev |
| ----------------------------------------------- | ------------ | -------------------- | ----------------- | ------------------ | -- |
| Android phone, browser tab                      | no           | n/a                  | rotates           | stuck              | M  |
| Android phone, browser fullscreen               | yes          | works                | rotates           | stuck              | M  |
| Android phone, installed PWA                    | yes          | works                | rotates           | stuck              | S  |
| Android phone, native                           | yes          | works                | rotates           | **rotates**        | M  |
| Android tablet, browser tab                     | no           | n/a                  | rotates           | stuck              | I  |
| Android tablet, fullscreen or PWA, Android ≤ 15 | yes          | works                | rotates           | stuck              | I  |
| Android tablet, fullscreen or PWA, Android 16+  | yes          | dead                 | rotates           | stuck              | D  |
| Android tablet, native                          | no           | n/a                  | rotates           | stuck              | S  |
| Firefox Android 114–143, browser tab            | no           | n/a                  | rotates           | stuck              | D  |
| Firefox Android 114–143, fullscreen or PWA      | yes          | dead                 | rotates           | stuck              | D  |
| iPhone, any web target                          | no           | n/a                  | rotates           | stuck              | D  |
| iPhone, native                                  | yes          | works                | rotates           | stuck              | S  |
| iPad, any web target                            | no           | n/a                  | rotates           | stuck              | D  |
| iPad, native                                    | no           | n/a                  | rotates           | stuck              | S  |
| Desktop, mouse primary                          | no           | n/a                  | n/a               | n/a                | S  |
| Desktop, touch primary, browser tab             | no           | n/a                  | rotates           | stuck              | D  |
| Desktop, touch primary, fullscreen              | yes          | dead                 | rotates           | stuck              | D  |

Two rows carry the whole table. Portrait and Landscape work wherever a lock is permitted. Auto beats
the OS rotation lock in the Android app and nowhere else, which is why every other target captions
the picker.

## Version history

| Change                    | Effect                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| Chrome Android 38         | `lock()` ships; fullscreen required from the start                 |
| Firefox Android 79–144    | `lock()` exists and always fails                                   |
| Firefox 144               | first real implementation                                          |
| WebKit, every version     | never shipped `lock()`, so no iOS or iPadOS browser                |
| iOS 16                    | scene geometry requests replace the legacy device-orientation hack |
| iPadOS 26                 | windowed apps ignore in-app locks (Apple TN3192)                   |
| Android 16, target SDK 36 | `setRequestedOrientation()` ignored at smallest width ≥ 600dp      |

Splotch targets SDK 36 (`android/gradle.properties`), so the last row applies today on tablets and
unfolded foldables.

## Detection limits retained from the investigation

* A coarse pointer identifies the intended handheld class imperfectly; it can include a
  touch-primary desktop.
* Screen Orientation's lock-method presence says nothing about whether the call is permitted now.
  Chromium's fullscreen state is the browser gate; the rejection remains authoritative.
* The browser cannot read the user's OS rotation-lock toggle. Neither can the iOS app.
  `UIWindowScene.effectiveGeometry.isInterfaceOrientationLocked` reports an app-requested lock, not
  the user's Control Center setting; it is also above the iOS floor.
* An Android shortcut may open a plain browser tab rather than the installed fullscreen PWA.
* The browser's tablet gate still differs from native: native observes the live short-side limit,
  while browser eligibility is pointer/fullscreen based.

The former `SensorOrientation` Capacitor plugin and Svelte settings booleans retired. Their
historical measurements explain why native Android Auto uses a sensor request; current code and
tests above own how it is applied.
