# Android edge-to-edge verification — issue 2552

The window explicitly enables AndroidX edge-to-edge after bridge startup. Capacitor SystemBars owns
native padding and CSS inset injection, with `insetsHandling: "css"` and a `cover` viewport hint.
The shared CSS seam prefers injected values, including zero, over the web/iOS `env()` fallback. The
legacy status-bar caller and custom native APIs are retained for the separate migration unit.

## Source inspection

Capacitor 8.5.2's installed Android SystemBars listener passes system/cutout insets through when
WebView is at least 140 and the viewport uses `cover`. Otherwise it pads the native decor and
injects zero CSS insets. In either branch it handles the IME natively and injects zero bottom inset
while the keyboard is visible. A second app-owned native inset listener or summing the two CSS
sources would duplicate ownership. The initial viewport hint avoids the initial no-cover branch.

`WindowCompat.enableEdgeToEdge(getWindow())` follows the current
[AndroidX view guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge). The
older Play Console wording names `EdgeToEdge.enable()` for Java; this implementation uses the
supported window-level API already available in the installed AndroidX Core 1.17 dependency. No new
bundle has been analyzed by Play, so warning clearance is unverified.

## Runtime evidence

Isolated Pixel 7 Pro API 33 emulator, WebView 150.0.7871.181, debug build. The host has API 28 and
33 images only; Android 14/API 34, Android 15/API 35, and Android 16/API 36 runtime coverage is
unavailable. No physical device was used.

| Scenario                        | Observed result                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gesture navigation, portrait    | Viewport 411 × 891 CSS px; injected top 41px; app top padding 41px; painted top band 41px; bottom inset zero                |
| Gesture navigation, landscape   | Viewport 891 × 411; injected top zero, left 41px; app left padding and band 41px; long top edge reclaimed                   |
| Three-button navigation         | Navigation overlay confirmed, mode 0; bar stays hidden on the drawing surface and appears for the keyboard                  |
| Real Feedback textarea with IME | Viewport shrinks to 411 × 555; injected bottom zero; focused textarea remains within the visible viewport; no feedback sent |
| Dialog dismissal                | Viewport returns to 411 × 891, top inset and app padding both 41px                                                          |
| Home/app re-entry               | Returning to the existing task preserves the same viewport/insets and immersive navigation                                  |

The emulator's physical cutout supplies the 41px portrait/landscape inset. Sensor rotation was used
because the app's Auto orientation intentionally follows the sensor despite the system rotation
setting. Changing the navigation overlay recreates the native activity, so Settings was reopened.

## Regression controls and checks

* `capacitor-safe-area.spec.ts`: injected portrait/landscape values, explicit all-zero insets
  against conflicting nonzero `env()` values, and removal restoring fallback. All four pass on the
  change; all four fail against the original CSS.
* `safeAreaProperties.test.ts`: both seed and seam-isolation guards fail against the original CSS.
* `edge-to-edge.test.mjs`: startup and configuration guards fail against the original Activity and
  configuration; the retained immersive/cutout guard stays green.
* Existing safe-area matrix plus the four new runtime cases: 71 passed.
* App units: 4088 passed; SSR guards: 19 passed.
* Full tools tier initially caught the compatibility register's stale CSS anchor. Updating the
  living documentation made its 60 targeted tests pass; the full tier is rerun before push.
* `npm run check`, `npm run lint`, native debug APK build, and Android Release Java compile pass.

The debug native screenshots demonstrate the real WebView/layout and OS keyboard. Release Java
compilation validates the release source configuration; it does not replace release device testing.
