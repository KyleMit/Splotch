# SvelteKit retirement evidence

Refs #3161. The comparison base is 01e13ba6bfd3d33e3307eef9984f74c1990bb088 on
`codex/native-migration`. The React Native app remains in `experiments/native-architecture`; shared
framework-free modules remain in `web/src/lib` for the promotion unit.

## Deletion proof

`deletions.json` records the removed files. `source-reachability.json` records a conservative import
graph rooted in retained native, server and tool code, together with filesystem readers the graph
cannot discover. The icon SVGs and closed icon-name type, shared layout numbers, privacy data,
landscape-toolbar geometry and service-worker test harness have retained consumers. No tracked
Svelte source or Svelte runtime import remains. Independent knip and production-dependency checks
cover unresolved imports, unused exports and the production install boundary.

The head tags were extracted byte for byte from the retired `app.html` into `native-web-head.mjs`.
Its tests preserve viewport-fit and installed-app metadata, and reject a missing head or viewport.
`layoutMetrics.ts` supplies the numeric drawing layout values that the token projection read from
`app.css`; token projection mutation controls remain. Both extractions preserve deployed output.

## Test disposition

`test-dispositions.json` lists removed tests, migrated inputs and retired commands.
`native-callback-dispositions.json` accounts for every original native callback whose title was
removed during the first pruning pass. `partial-assertion-dispositions.json` separately audits
assertion changes inside surviving callbacks. `retained-shared-test-dispositions.json` closes every
retained-import candidate and the complete deleted-test call sweep; `server-test-dispositions.json`
records the restored server runtime and retired form-only boundaries. These distinguish retired
Svelte source equivalence from actual native operations and cite restored or retained successors.

Mounted native transitions, accessibility, layout boundaries, save failures, AI progression, Photos
permission failures, focus rings, paint names and raster coverage are retained. Explicit expected
tables replace deleted-source oracles for native response parsing, export grids, filenames, guide
order, stroke paths, motion tracks, picker behavior and palette occupancy. Base-derived unencoded
RGBA digests preserve both Crayon grain bands and all 48 seed/height/column raster windows. Their
fixtures describe base behavior; they do not import or execute the retired application. Generic
tooling tests with synthetic Svelte path strings remain whenever their implementation is still used.

The shared unit coverage floor is rebased to the remaining TypeScript modules. This reflects
removing application modules and their tests while retaining shared PWA, server, terminal parser,
icon, geometry, gradient and contrast runtime tests. The measured remaining-module coverage is
82.31% statements, 81.88% branches, 85.57% functions and 83.7% lines, with floors rounded down to
one decimal; native renderer and tool tests remain separate tiers. The startup and page budgets are
unchanged (`startup-budgets.json`). Only the page-load baseline's source digest is refreshed.

## Retired live entry points

| Entry point                                                   | Disposition                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:driver:smoke` and `tools/app-driver`                    | Retired Svelte selector/replay contract. The supported `run-splotch` source driver serves the RN export, has lifecycle/argument guards in the tool tier, and was verified with actual drawing and privacy captures. |
| Page-inventory capture and HTML refresh                       | Retired live Svelte routes and selectors. Committed image review/finalization remains; all 672 recorded capture hashes were verified.                                                                               |
| Worker sweep                                                  | Retired runner/workflow for the Svelte suite. The retained RN suite keeps the migrated flaky reporter and CI artifact folder guard. The frozen tuning report labels its former runner command archival.             |
| Model-eval crayon capture and store-drawing evaluation/review | Retired live Svelte browser automation. Deterministic scene generation and committed-capture store framing remain with focused tests.                                                                               |
| Crayon-reference live capture                                 | Retired `/dev/engine` automation; static comparison-sheet rendering from committed captures remains.                                                                                                                |
| Release-build smoke and Svelte postbuild checks               | Retired with their build. RN build, precache/startup/page acceptance, browserless, Playwright engine/shard jobs and native compile remain.                                                                          |

## Verification

The receipts and manifest record successful local gates and selected seeded negative controls.
Native runtime faults used during restoration included missing focus outlines, wrong paint labels,
missing inherited typography, start/poll confusion, DPR clamping, singular-only save copy, unpadded
filenames, missing touch locks, truncated audio assets and reset free allowances. The restored
fixtures pass after each fault is removed. Grain field-seed and raster pattern-transform faults
reject fixed byte digests; PWA ink/Save-Data and historical ledger-writer faults reject lost
update/recovery guarantees.

The site build is followed separately by `postnative:web:build`: the build's browserless acceptance
checks alone do not prove the Chromium page/admin/safe-area checks. The latter run exercises all
no-JavaScript page layouts, a local API-backed admin session and safe-area behavior.

No deployed RN screen intentionally changes. The source driver produced visible ink and a readable
privacy page; share-card image bytes remain unchanged after their input provenance is regenerated.
No physical device, installed store app or private drawing was accessed.

## Remaining campaign work

The promotion and full prose reconciliation remain in #3163 and #3164. Frozen ledger references to
the deleted development routes identify historical evidence; their live replacement test owners are
recorded in the updated ledger rows. Parked native product gaps remain outside this deletion.

## Review repairs

The build receipt omits 21 Expo asset-listing lines whose filename hashes matched the device-ID
guard. Budget and acceptance summaries remain. The guard itself is unchanged. Skill citation checks
use the current `e2e/specs` directory and pass with the old empty `web/tests` directory absent.
Tracked-file guards are rerun after the final evidence and manifest are staged.
