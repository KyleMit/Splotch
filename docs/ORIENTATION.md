# Device rotation and landscape

Which orientation controls Splotch can offer on which device, in which target, and what each one
actually does to the screen. Read this before changing the Orientation picker, the rotation lock, or
any branch that decides whether the app may turn the screen.

The decision behind the current gating is
[ADR-0172](adrs/0172-orientation-controls-render-only-where-a-lock-applies.md). The per-API
support/fallback register is `COMPATIBILITY.md`; the native plugin mechanics are `MOBILE/native.md`.

## The two questions

Every branch in this area answers one of two separate questions, and conflating them is the
recurring bug.

1. **May the app turn the screen at all right now?** A capability question plus a permission
   question. `supportsOrientationLock()` answers the capability half; `orientationLockApplies()`
   adds the per-moment half and is what the Settings picker renders on.
2. **Can Auto beat the device's own rotation lock?** Independent of the first, answered by
   `autoOrientationOverridesSystemLock()`. Only the Android shell can.

## What the controls do

The picker offers Portrait, Landscape, and Auto, persisted as `lockRotationEnabled` +
`forceLandscapeOrientation` and applied by `web/src/lib/platform/orientation.ts`.

* **Portrait / Landscape** beat the OS rotation lock wherever a lock is permitted at all. On the web
  this is not obvious: Chromium maps them to `SCREEN_ORIENTATION_SENSOR_PORTRAIT` / `_LANDSCAPE`,
  which ignore the OS toggle.
* **Auto** beats the OS rotation lock only in the Android app, via `SensorOrientationPlugin`
  requesting `SCREEN_ORIENTATION_SENSOR`. Everywhere else Auto means "follow the system": Chromium
  maps `unlock()` to `SCREEN_ORIENTATION_USER` and `lock('any')` to `FULL_USER`, and iOS restores
  the all-orientations mask. The OS rotation lock pins all three.

## Shipping matrix

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

Splotch targets SDK 36 (`android/variables.gradle`), so the last row applies today on tablets and
unfolded foldables.

## Detection

| Question                         | Predicate                                                                           | Reliable                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Native or web                    | `Capacitor.isNativePlatform()`, `Capacitor.getPlatform()`                           | yes                                                                     |
| Engine can lock at all           | `typeof screen.orientation?.lock === 'function'`                                    | no — desktop Chrome exposes one that always throws                      |
| Screen can physically turn       | `matchMedia('(pointer: coarse)')`                                                   | good — misses touch-primary desktops                                    |
| Lock permitted right now         | `document.fullscreenElement !== null \|\| matchMedia('(display-mode: fullscreen)')` | yes — Chromium's exact condition                                        |
| Large-screen Android ignore      | `Math.min(screen.width, screen.height) >= 600`                                      | yes — tracks the 600dp rule                                             |
| Why a lock failed                | catch the rejection, read `error.name`                                              | yes — `SecurityError` means fullscreen, `NotSupportedError` means never |
| OS rotation lock, Android native | `Settings.System.ACCELEROMETER_ROTATION`                                            | yes, no permission — but Android needs no warning                       |
| OS rotation lock, web            | none exists                                                                         | **not detectable**                                                      |
| OS rotation lock, iOS native     | none exists                                                                         | **not detectable** — see below                                          |

**The iOS trap.** `UIWindowScene.effectiveGeometry.isInterfaceOrientationLocked` looks like the
answer and is not. It reports whether *the app's own* `prefersInterfaceOrientationLocked` request
took effect, not whether the user's Control Center rotation lock is on, and it is iOS 26+ against a
16.4 floor. Do not reach for it to detect the user's setting.

The only universally reliable detector is behavioral: call `lock()` and read the rejection. It is
async and it actually locks when it succeeds, so it cannot back a synchronous render-time gate.

## APIs in play

* **Web:** Screen Orientation API (`lock`, `unlock`, `type`, `angle`, `change`), Fullscreen API
  (`requestFullscreen`, `fullscreenElement`, `fullscreenchange`, `fullscreenEnabled`),
  `matchMedia('(display-mode: …)')`, the manifest's `display` and `orientation` members, and
  `navigator.standalone` for legacy iOS.
* **Android native:** `Activity.setRequestedOrientation()` with the `SCREEN_ORIENTATION_*`
  constants, the manifest `screenOrientation` attribute, `Settings.System.ACCELEROMETER_ROTATION`,
  and the Android 16 large-screen ignore.
* **iOS native:** `UIWindowScene.requestGeometryUpdate(.iOS(interfaceOrientations:))`,
  `supportedInterfaceOrientations`, `setNeedsUpdateOfSupportedInterfaceOrientations`.
* **Capacitor:** `@capacitor/screen-orientation`, plus the app-local `SensorOrientation` plugin.

## Known gaps

* **Android tablets are not excluded on the web.** The native gate hides the picker above 600dp; the
  web gate does not. On Android 16 that control is dead in every web target, fullscreen included.
* **Foldables straddle the gate,** and the size read happens at render rather than on fold.
* **Touch-primary desktops slip through** — a Surface in tablet mode reports a coarse pointer
  against a `lock()` that always throws. The fullscreen gate hides the picker in a tab there, so the
  dead control only surfaces once the page is fullscreen.
* **Leaving fullscreen silently unlocks.** Chromium releases the lock on exit, so the phone returns
  to portrait while the picker still reads Landscape.
* **A shortcut is not an install.** Chrome offers "create shortcut" beside "install"; the shortcut
  opens in a normal tab, so two identical-looking icons behave differently.
* **iOS Auto has the defect Android fixed** in issue 2193 and no way to fix it.

## Testing

Orientation branches are covered at two layers, and the web gate cannot be reached without help.

* `web/src/lib/platform/platform.orientationLock.test.ts` — the gates themselves, plus a drift guard
  that reads the manifest and the query constant together, because the installed app's picker
  depends on `"display": "fullscreen"` and nothing else ties those files together.
* `web/src/lib/platform/orientation.test.ts` — what `applyDeviceOrientationPreference` calls per
  platform and target, including the superseded-request ordering.
* `web/tests/orientation-picker.spec.ts` — layout across phone widths, the absent case in a plain
  tab, and the Auto caption.
* `web/tests/settings-quick-toggles.spec.ts` — the landscape-phone quick-toggle grid: the compact
  Orientation picker on a touch device in fullscreen, the About cell that fills its slot on a
  desktop browser, and the mini About cell on a lock-incapable native tablet.
* Chromium exposes **no display-mode override**, so a spec cannot emulate the installed app. Use
  `enterFullscreen` from `web/tests/helpers.ts`, which triggers real element fullscreen from a
  keypress; pair it with `exitFullscreen` before any `setViewportSize`, because Chromium refuses to
  resize a fullscreen window.
