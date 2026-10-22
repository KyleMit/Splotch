# Real-handler UI integration evidence

## Done when

The browser drives real HTTP generation, worker dispatch, polling, displayed results, image and
refusal reports, feedback and representative failures against isolated test-mode handlers. Separate
development-identity Release builds demonstrate hosted-test generation through the UI on an Android
emulator and iOS simulator. The PR targets `codex/native-migration`, survives independent review and
CI, and remains open.

## Coverage boundaries

| Lane                    | Exercised here                                                                                                                                             | Isolation                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Focused browser UI      | Existing image-report and feedback cases, including intercepted responses                                                                                  | Existing Playwright fixtures; 14 checks passed                                                           |
| Real-handler browser UI | Fresh grant, drawing, style selection, async submission, result polling, displayed image, image/refusal reporting, feedback, invalid key, provider failure | Six checks; fresh browser state, function graph and local Blobs per test; outside server fetches refused |
| Hosted native UI        | Fresh grant, drawing, actual parent keypad, style selection, displayed image                                                                               | Release `art.splotch.app.dev` on fresh virtual devices; build-time test origin                           |

Native reporting and feedback were not exercised. Browser and API-smoke records establish those
handlers' behavior locally; they do not establish native report/feedback coverage. The existing
boot-only smoke remains separate. No physical device or store app was operated.

## Reproduction

Use unused local ports. Run the host-exclusive browser and native lanes separately.

```sh
SPLOTCH_E2E_PORT=5300 npm run test:e2e:api -- --workers=1
SPLOTCH_E2E_PORT=5303 npm run test:e2e -- e2e/specs/ai-report.spec.ts e2e/specs/feedback-page.spec.ts --workers=1
SMOKE_PORT=5301 npm run test:api:smoke
SMOKE_PORT=5302 npm run test:api:smoke:test
npm run test:tools
npm run test:migration:rsd-selection
npm run format:check
npm run check
npm run lint
```

The local recorded browser run reused an export built with `npm run build:site`, by setting
`SPLOTCH_E2E_PREBUILT=1`, as CI does with its downloaded export. The ordinary command builds first.

Create fresh virtual targets following `DEVELOPMENT.md`, then run:

```sh
EXPO_PUBLIC_SPLOTCH_API_ORIGIN=https://test--splotchy.netlify.app \
  npm run test:native:api -- --platform ios --device SIMULATOR_UUID
EXPO_PUBLIC_SPLOTCH_API_ORIGIN=https://test--splotchy.netlify.app \
  npm run test:native:api -- --platform android --device emulator-5556
```

Both commands rebuild, verify the compiled origin and install the development identity. The origin
is absent from launch arguments and UI controls. The custom hostname had a local negative DNS
resolution failure; the existing Netlify alias worked. No DNS, dashboard or deployment was changed.

The final iOS target was a fresh iPhone 18 Pro simulator on iOS 27.0, UUID
`1E7ED8C0-775A-4BD8-A2E1-830F9465E154`. The final Android target was a fresh Pixel 7 Pro AVD using
`system-images;android-33;google_apis_playstore;arm64-v8a`, serial `emulator-5556`, density 3.5.
Android app clearing does not reset its Android ID; the AVD itself was new. iOS used a new simulator
to avoid retaining a Keychain installation seed. Each flow required ten free creations before
drawing, and used the ordinary rate/grant behavior.

## Negative controls and native findings

* The lane refuses production/missing mode and injected provider/GitHub credentials. The runtime
  Playwright check attempts both Page and BrowserContext routing and requires both attempts to
  throw. Unit controls also try routing/HAR/WebSocket replacement after locking the methods. A
  rendered native-keypad guard evaluates the Maestro digit selector for every key and rejects a
  mutated selector prefix, preventing drift between YAML and the app’s test identifiers.
* The existing local fetch boundary refuses outside origins and redirected fetches. API smoke
  continues to prove real pending/result polling, fake reports, test-prefixed stores and hermetic
  failure behavior without modifying the wire corpus or baseline.
* The native runner rejects production/unknown origins and physical/missing/unavailable device
  targets. Artifact controls reject both test hostnames in production bundles in UTF-8 and UTF-16.
* The store simulator target remains production-only and unsigned. A separate development Release
  target signs ad hoc: the unsigned app booted but could not read secure credentials through
  Keychain. Ad hoc signing allowed the actual generation journey to complete.
* Android generation exposed a real `Canvas: trying to draw too large(191419200bytes) bitmap` crash
  in `SvgView.onDraw`. The hidden capture view laid export pixels out as density-independent points,
  multiplying the display allocation by density again. `CaptureSvg.android.tsx` divides layout
  dimensions by density while preserving the actual SVG ref, viewBox and explicit export options.
  The regression fails at densities 2 and 3.5 with the original passthrough facade and passes at 1,
  2 and 3.5 with the adapter. Related capture checks also passed (53 checks total).

## Retained controls

`controls/` contains command outputs or the final build/flow tails from the original outputs. Native
tails include the successful build, fixed development identity, explicit target, UI assertions and
runner verdict; the large compiler transcript stays outside the repository. Screenshots are hosted
on `pr-assets` and linked in the PR.

The production API smoke passed 46 checks. The test-mode API smoke, six real-handler browser checks
and 14 retained focused browser checks passed. Type checks and lint passed; lint reported three
pre-existing unused-import warnings. The full tools suite passed 8,229 checks across 507 files; the
native renderer suite passed 1,044 checks across 83 files. Their outputs are in `controls/`.

## Independent review follow-up

The first Claude review found three non-blocking issues, all addressed: the host receives the same
validated, frozen environment as the Blobs setup; the native runner re-queries virtual-target state
immediately before installation; and the focused reproduction command names `feedback-page.spec.ts`.
The corrected filter lists 14 checks across two files.

The environment mutation control fails without the freeze. Android replacement and iOS shutdown
controls fail without the post-build recheck. Both deliberate source mutations returned exit 1, then
restored the exact committed bytes. These checks use isolated local storage or mocked device
commands; no further native generation or physical-device operation was needed for the runner-only
review changes.

## CI result synchronization

The first CI lane run failed its image assertion while the UI was still making the picture. The
trace shows that the assertion started before capture submitted the request; its five-second budget
ended before the first scheduled result poll. The success journey waits for the actual successful
result response within the client request budget before asserting the rendered image. Its image,
status, report and grant assertions are unchanged. Retries remain disabled. The retained CI trace
timing summary is in `controls/ci-result-synchronization.log.txt`.
