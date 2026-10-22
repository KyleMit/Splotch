# Browser & Device Compatibility

Splotch ships one Expo / React Native / React Strict DOM app to web, Android and iOS (ADR-0182).
Browser compatibility applies to the web export. Native applications run React Native and Hermes,
not the web export inside a WebView; their OS floors are separate contracts. The app and native
projects live at the repository root.

## Supported browsers & devices

| Target                            | Minimum                   | Oldest typical device    |
| --------------------------------- | ------------------------- | ------------------------ |
| Chrome / Edge (desktop + Android) | **111+**                  | —                        |
| Firefox (desktop + Android)       | **114+**                  | —                        |
| Safari (macOS)                    | **16.4+**                 | —                        |
| iOS / iPadOS Safari (web)         | **16.4+**                 | iPhone 8 / 2017-era iPad |
| **Native Android app**            | **Android 7.0 / API 24+** | 2016-era phone           |
| **Native iOS app**                | **iOS 16.4+**             | iPhone 8 (2017)          |

Older versions are unsupported. A feature may work there, but the project does not promise to test
or preserve that behavior. The cutover does not raise these declared support floors.

### Why these numbers

The browser floor retains the explicit Chrome 111 / Firefox 114 / Safari 16.4 policy declared in
`tools/lib/browserTargets.ts`; `npm run report:browser-floor` compares feature data with it. A build
passing in current browsers is not evidence that the exact floor versions work.

**Native Android API 24 (7.0)** is the native OS floor. It governs the RN runtime and native modules
rather than Android System WebView. The native iOS deployment target remains 16.4. The old rule
comparing a web transpilation target with WKWebView's deployment target belonged to the retired
Capacitor shell; it no longer describes the relationship between these builds.

### Why the Android floor is not raised to API 29

The standing policy retains older hand-me-down devices. Dropping API 24–28 would stop updates for
those installs. A global Android distribution table does not establish that Splotch's own audience
has stopped using them.

The Capacitor-era argument concerned legacy gallery permissions versus scoped storage. Those exact
plugin branches are retired; permission behavior is now owned by the RN/Expo modules and the
reviewed inventory in `tools/mobile/privacy-permission-inventory.json`. The cutover does not
reinterpret that old permission argument as evidence to change the OS floor.

A floor change needs a capability the app actually needs or evidence from Splotch's own install
population, followed by an ADR. Update the native project, public claims and drift guards together.

## How the floor is enforced

| Platform floor               | File                                                                   | Value                                                 |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Declared web browser policy  | `tools/lib/browserTargets.ts`                                          | `chrome111, edge111, firefox114, safari16.4, ios16.4` |
| Native iOS deployment target | `ios/Splotch.xcodeproj/project.pbxproj` → `IPHONEOS_DEPLOYMENT_TARGET` | `16.4`                                                |
| Native Android min SDK       | `android/gradle.properties` → `android.minSdkVersion`                  | `24`                                                  |

`tools/mobile/android/tests/android-config.test.mjs` compares the Android project floor with the
published claims and beta instructions. Native compile and smoke checks are described in
`docs/TESTING.md`. The retired Svelte/Vite browser-floor test is not an Expo transpilation check.

## API risk register

This register names the actual browser implementation or guard. Paths are repository-relative; each
`path` → `marker` pair is checked by `tools/tests/compatibility-register.test.mjs`. It is a review
surface for retained capabilities, not a claim that every dependency's API use has been exhaustively
audited during the cutover. Native implementations resolve separately at build time.

| API / feature              | Where                                                                                       | Guard / contract                                                    | Behavior when unavailable                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pointer events and capture | `src/drawing/PaperInputView.web.tsx` → `setPointerCapture`                                  | Core browser input; capture failure is caught.                      | Required within the web floor.                                               |
| Coalesced pointer samples  | `src/drawing/PaperInputView.web.tsx` → `getCoalescedEvents?.()`                             | Optional sample enhancement.                                        | An absent or empty list uses the dispatched event.                           |
| Native browser dialog      | `src/rsdDrawing/RsdSurfaceFailure.web.tsx` → `showModal()`                                  | Core browser failure dialog.                                        | Supported within the declared web floor.                                     |
| Inert regions              | `src/rsdDrawing/RsdSectionReveal.tsx` → `inert={!visible}`                                  | Core interaction isolation.                                         | Supported within the declared web floor; native RSD resolves separately.     |
| Backdrop blur              | `src/rsdDrawing/RsdBareGlass.web.tsx` → `CSS.supports('backdrop-filter', 'blur(1px)')`      | Capability-detected presentation.                                   | The capability result selects the glass treatment.                           |
| Web Crypto AES-GCM         | `src/platform/aiVault.web.ts` → `crypto.subtle.generateKey`                                 | Secure-context credential storage.                                  | A vault operation fails rather than silently storing plaintext.              |
| IndexedDB                  | `src/lib/idbDatabase.ts` → `indexedDB.open`                                                 | Persistent browser storage.                                         | Database errors reject; callers own recovery.                                |
| Storage persistence        | `src/platform/persistentStorage.web.ts` → `navigator.storage?.persist`                      | Best effort.                                                        | Missing API or refusal leaves the existing save intact.                      |
| Storage estimates          | `src/platform/offlineLibrary.web.ts` → `navigator.storage?.estimate()`                      | Best-effort capacity estimate.                                      | The library handles an unavailable estimate.                                 |
| Wake Lock                  | `src/lib/boot/wakeLock.ts` → `'wakeLock' in navigator`                                      | Optional enhancement.                                               | The page remains usable without keeping the display awake.                   |
| Element fullscreen         | `src/platform/useFullscreen.web.ts` → `document.fullscreenEnabled === true`                 | Offered only to supported Android browser tabs.                     | No fullscreen control when the API is unavailable.                           |
| Screen Orientation lock    | `src/platform/deviceOrientation.web.ts` → `typeof screenOrientation()?.lock === 'function'` | Optional, coarse-pointer fullscreen only.                           | Unsupported browsers do not request a lock.                                  |
| Web Audio                  | `src/platform/drawingAudio.web.ts` → `new AudioContext()`                                   | Browser sound implementation.                                       | Loading errors reject to the sound owner; drawing is independent.            |
| Idle scheduling            | `src/lib/idle.ts` → `typeof requestIdleCallback === 'function'`                             | Detected scheduler enhancement.                                     | Fallback waits for input quiet and frame headroom.                           |
| Service worker             | `src/platform/serviceWorker.web.ts` → `'serviceWorker' in navigator`                        | Production-only offline enhancement.                                | Unsupported browsers keep the live application without offline registration. |
| Install prompt             | `src/platform/installPrompt.web.ts` → `typeof event.prompt === 'function'`                  | Validated browser event.                                            | The device-family install guide remains available.                           |
| Blocked local storage      | `src/platform/installPrompt.web.ts` → `localStorage.getItem`                                | Storage access is caught.                                           | The install prompt behaves as on a first visit.                              |
| Device-family detection    | `src/platform/installPrompt.web.ts` → `maxTouchPoints`                                      | UA/platform heuristic for browser help text.                        | Unrecognized devices use the generic branch; native uses platform modules.   |
| Network Information        | `src/platform/offlineLibrary.web.ts` → `Reflect.get(navigator, 'connection')`               | Optional metered-connection hint.                                   | Missing connection data is treated as not metered.                           |
| Online state               | `src/platform/offlineLibrary.web.ts` → `navigator.onLine === true`                          | Link-state hint, not proof of server reachability.                  | Requests still handle network failure.                                       |
| File System Access         | `src/platform/folderSave.web.ts` → `typeof window.showDirectoryPicker !== 'function'`       | Optional chosen-folder support.                                     | Other browsers save by download.                                             |
| Object URL download        | `src/platform/pictureSave.web.ts` → `URL.createObjectURL`                                   | Browser picture-save path.                                          | Failures return a failed save; object URLs are revoked.                      |
| WebP canvas encoding       | `src/lib/drawing/aiUploadEncoding.ts` → `canvas.toBlob(resolve, 'image/webp'`               | Optional upload compression, output MIME checked.                   | The app uploads PNG if encoding is unavailable or fails.                     |
| CSS zoom                   | `src/lib/actions/pinchTextZoomGesture.ts` → `target.style.zoom`                             | Settings pinch enhancement; Firefox support starts above its floor. | Older Firefox keeps the normal pane size.                                    |
| Reduced transparency       | `src/platform/reducedTransparency.web.ts` → `REDUCED_TRANSPARENCY_QUERY`                    | Preference enhancement.                                             | An unsupported media feature does not match.                                 |
| Forced colors              | `src/platform/forcedColors.web.ts` → `FORCED_COLORS_QUERY`                                  | System-color adaptation.                                            | The ordinary theme remains when the query does not match.                    |
| Browser font loading       | `src/platform/shippingFont.web.tsx` → `document.fonts.add`                                  | Faces added after mount, not during prerender.                      | Fallback text paints while the requested font loads.                         |

## Polyfills & workarounds

A fallback belongs to the owner that knows whether the capability is optional. Coalesced input falls
back to the dispatched event; idle scheduling has a quiet-frame fallback; chosen-folder saves fall
back to downloads; WebP uploads fall back to PNG. Storage failures are outcomes to handle, not
evidence that plaintext or lossy state recovery is acceptable.

Reduced motion is resolved by the app's settings and platform implementations. The export's
prerendering tools stamp the initial document state. The retired Svelte boot script and its CSS
attribute test do not enforce the RN treatment. Keep native and browser behavior covered at their
actual seams (`settings/reduceMotion.ts` under the app's `src/`, and the mounted RSD tests).

The retired engine's Canvas 2D context recovery, tiled worker fallbacks and Pencil Scribble
listeners describe that engine only. Do not transplant their risk rows into the Skia renderer as
though it used the same browser APIs.

## How the floor is validated

* **Engine families:** Chromium E2E plus Firefox and WebKit critical-path projects exercise the RN
  export (`e2e/specs/smoke.spec.ts`). Current desktop engines prove family coverage, not exact
  Chrome 111, Firefox 114 or Safari 16.4 coverage.
* **Native Android:** the Android API 24 **OS floor** is CI-validated by the tagged-release emulator
  smoke alongside current API 33. The native flow now boots React Native, not a WebView.
* **Native iOS:** the hosted smoke uses a current simulator. The manual iOS 16.4 floor gate in
  `docs/MOBILE/ios.md` remains the release-floor check. Historical Maestro driver timeouts on 16.4
  proved neither a successful app launch nor an app failure.
* **Build contracts:** native compile catches toolchain/configuration failures; it does not prove
  interactive drawing or platform I/O. Browser mocks do not prove native file, keychain or Photos
  behavior; see `DEVELOPMENT.md`.

## Maintaining this

* Keep the web policy declaration and the native project floors explicit. A deliberate support
  change updates the relevant declaration, public claims and guards together.
* Check a new API against the declared web floor before depending on it. Use
  `npm run report:browser-floor -- --feature <web-features id>` for the feature data; record a
  missing fallback honestly rather than treating a current-browser test as floor validation.
* In the register, **Where identifies the guard**, not every use. Prefer a stable literal code
  marker to a line number. For an ordering-dependent fallback, use `path` → `earlier` then `later`;
  for a required pair use `path` → `one` + `two`. The guard test checks code after removing
  comments.
* The `audit-compatibility` skill owns a fuller floor/API review. The root-promotion reconciliation
  follows the deletion unit; historical ADRs and captured evidence remain point-in-time records.
