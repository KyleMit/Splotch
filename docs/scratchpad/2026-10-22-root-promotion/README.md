# React Native root promotion

Issue #3163 promotes the single application from `experiments/native-architecture` to the repository
root, based on f73ba89631eecbd4448a5e51a909335759b5bbd9. The architectural decision is ADR-0182.

`file-moves.json` records every retained tracked file from the old application and shared roots. No
shared test is deleted. The 76-row retained-test dispositions and the 171/127 native callback/body
ledgers in the preceding retirement record remain historical evidence. The frozen ledger source and
Crayon raster fixtures retain their original bytes.

* App modules live under `src`; framework-free modules shared by the app live under `src/lib`.
* The callable Netlify entries stay in `netlify/functions`. Their implementation and tests live in
  `netlify/server`; the hosting policy and its test live at `netlify/securityPolicy.ts` and its
  colocated test. This prevents support modules becoming top-level function entries.
* Static hosted files live under `assets/static`, and icon sources under `assets/icons`.
* Tool-owned code joins its existing capability: safe-area diagnostics under `tools/migration`,
  share-card and store-frame geometry under `tools/marketing-assets`, icon classification under
  `tools/icons`, and stroke-authoring settings under `tools/store-drawings`.
* Compiler helpers join `tools/migration`; Metro, Babel, PostCSS, Expo and TypeScript configuration
  live at the root. One root manifest and lockfile own dependencies. The unused-by-web native
  sharing module stays installed for native builds as a development dependency, following ADR-0070.
* Expo updates are explicitly disabled. The application has no `expo-updates` dependency or OTA
  delivery path; the configuration states the existing manual native release policy.

The shared Vitest scope follows the same production files through their moves. Its 2,021 tests and
coverage remain 82.31% statements, 81.88% branches, 85.57% functions and 83.70% lines. Coverage
floors and all startup/page budgets are unchanged.

Native path changes are mechanical: CocoaPods dependency paths become `../node_modules`; Xcode's
`REACT_NATIVE_PATH` becomes `${PODS_ROOT}/../../node_modules/react-native`. The Android signing
example reads the upload key as `upload-keystore.jks`, relative to the root Android project. The
ExpoModulesCore checksum is preserved. Local environment input moves from `web/.env` to root `.env`
without being printed or committed, and `.worktreeinclude` names its new owner. Known rebuildable
outputs and empty retired directories are removed. Signing remains the parent orchestrator's job.

The folded Netlify installer validates one manifest and one clean-install root. Its safety checks
against symlinks, preloads, changed configuration, lifecycle scripts and store overlap remain in
place; the obsolete second-workspace cases collapse to their root equivalents.

The staged preservation check resolves all 2,528 mapped destinations, retains all 118 shared test
files, and compares 1,266 moved art files byte-for-byte with the base. All match. Canonical
share-card regeneration also reproduces the four committed PNGs byte-for-byte; only their input-path
provenance changes. The lockfile folds its importers and aligns stylelint's PostCSS peer to the
application's existing 8.5.28 pin, removing the duplicate 8.5.26 resolution; it introduces no new
package version.
