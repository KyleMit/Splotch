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

## Tool-test callback reconciliation

Runtime collection (`vitest list --no-static-parse`) at the exact base and promoted head confirms
494 tool test files on both sides. Of those, 490 retain their per-file counts (7,972 cases).
`tool-test-dispositions.json` records the four changed files and every removed callback/dynamic
surface row. The 8,101 → 8,091 delta is:

| File                           | Before | After | Disposition                                                                                                                                                          |
| ------------------------------ | -----: | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Netlify production installer   |     52 |    49 | Four obsolete second-root guards collapse to retained root equivalents; one new guard rejects workspace packages.                                                    |
| Build-module collection guards |      3 |     5 | Each Vitest/TypeScript inclusion check expands to the two moved build/hosting owners; parser negative control retained.                                              |
| Code-map classification        |     45 |    44 | The folded app manifest uses the existing root `package.json` classification case.                                                                                   |
| Lighthouse measured surface    |     29 |    21 | Twenty-three measured-root rows fold to fifteen, following merged source/assets and a whole migration-tools scope; all six behavioral/negative-control cases remain. |

This count change removes no runtime contract test. The installer still refuses every lifecycle
stage before child execution and protects the only module tree it cleans. The Lighthouse import
closure still verifies every tracked export dependency, with a negative control that removes `src`;
the folded root manifest follows the existing lockfile-owned dependency fingerprint policy.

Signed-build preflight exposed an Android package-relative path that had been mistaken for an
application-relative path. Expo's included Gradle build resolves from the autolinking package
manifest, so its original `../android/expo-gradle-plugin` suffix remains valid after the application
moves. A new native-release configuration guard evaluates the actual Node resolution from
`settings.gradle` and verifies the installed Gradle build exists; it fails with the erroneous
`./expo-gradle-plugin` suffix. This adds one tool test after the reconciliation above (8,092 total).
The iOS device archive passed; App Store export requires the host's shipping distribution identity.
CocoaPods' generated privacy-manifest reordering preserves identical parsed values, and its local
podspec checksum churn changes no resolved dependency; neither is committed.

## Independent-review repairs

Claude's first review found the SVG optimizer still scanning the removed root, historical-tag
snapshot inputs rewritten to current paths, shared function-cap coverage lost during moves, Vite
ambient types admitted to native compilation, omitted root TypeScript inputs, and obsolete code-map
areas. These are repaired without changing any cap or art bytes. The SVG check scans all 315 shipped
SVGs and fails on an empty scan. A real historical-layout Git fixture exercises snapshot extraction;
another exercises every embedded proof-sheet layer across the static-root move. The proof-sheet
regression was found by auditing analogous historical readers after the review.

`lint-fence-preservation.json` compares ESLint's resolved configuration for all 1,082 retained moved
TypeScript modules against both the integration base and the reviewed promotion. It records the
restored function-size fence on 90 modules, named-export fence on eight moved tests and server-only
import fence on 14 moved helpers. No active severity, file/function cap, restricted-syntax selector
or restricted-import path/pattern is lost from either comparison. Positive controls exercise both
native app paths and the moved owners.

A TypeScript compiler probe rejects Vite-only APIs under the native configuration while accepting
them under the shared web configuration. The shared Vitest configuration is included in type
checking. Root `tsconfig.json` is watched by Netlify and included in the Lighthouse source digest;
only the baseline's digest changes. Code-map areas for the dissolved tree are removed; historical
map regeneration retains the existing requirement to use the counted commit's own rules.

The repaired six-tier browserless mirror passes 2,021 shared, 299 asset, 20 store-drawing, 8,146
tool and 1,043 mounted-native tests, plus all 46 API checks. Shared coverage remains
82.31/81.88/85.57/83.70% (statements/branches/functions/lines). The tool growth after the initial
reconciliation consists of the installed-Gradle guard and the review's positive controls; no
retained callback is removed. Preservation checks still resolve all mapped files and confirm
identical art bytes and unchanged budgets.
