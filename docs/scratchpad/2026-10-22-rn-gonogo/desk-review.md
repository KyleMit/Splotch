# RN go/no-go: desk review

Refs [#2690](https://github.com/KyleMit/Splotch/issues/2690). **The desk evidence favors holding the
Android and iOS cutover:** the native ink architecture fits the drawing workload, but the frozen
candidate carries more dependency/native upkeep, a costly forward-release rollback, incomplete
current parity evidence, and unfinished release acceptance. This is a recommendation from these
factors, not a device-performance verdict. There are no supplied factor weights, so the ordinal
scores below are not summed.

## Measurement boundary and evidence

| Role                                     | Exact commit                               | Worktree used                        |
| ---------------------------------------- | ------------------------------------------ | ------------------------------------ |
| Frozen RN, `rn-gonogo-freeze-2026-10-22` | `fffeed1fe4116112bb10297a180ac552f9754046` | `/workspace/rn-freeze`, detached     |
| Shipping source, fetched `origin/main`   | `ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4` | `/workspace/shipping-main`, detached |
| Shipping store-release source, `v1.6.0`  | `d8b86469f63c57a06a9de45664a42eea15b99eb0` | `/workspace/shipping-v160`, detached |

The provenance receipt is authoritative for these identities. The report branch starts at the
fetched `origin/codex/native-migration`, which at intake equals the frozen RN commit. No product
code, configuration or tests were changed. Dependency installation used the frozen lockfile and
disabled lifecycle scripts. No device, signing key, store or production service was exercised.

Numbers below are either fresh measurements, explicitly attributed historical receipts, or
**planning estimates**. Historical observations retain their original source and scope; a passing
older slice is not a passing frozen candidate. Commands, tool versions, run counts and raw outputs
are indexed in [evidence/README.md](evidence/README.md). All fresh candidate execution took place in
the detached frozen worktree; remote CI and issue inventories describe dated GitHub state, not
another executed candidate.

| Factor                  | Android | iOS | Reason for RN relative to shipping                                                                                                |
| ----------------------- | ------: | --: | --------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance cost        |      -1 |  -1 | One product UI remains, but app source, runtime graph and native project obligations increase.                                    |
| Dependency/upgrade risk |      -2 |  -2 | Expo/RN/renderer coupling, private prerender APIs and downstream patches add coordinated upgrade work.                            |
| Reversibility           |      -2 |  -2 | Capacitor survives in history, not the candidate; store rollback requires a new signed release and cannot read all RN state.      |
| Architecture fit        |      +1 |  +1 | Native live ink bypasses React and incremental raster work is bounded by new samples; desk tests cover narrower render contracts. |
| Developer velocity      |       0 |   0 | Release-bundle swapping helps JS iteration; longer sampled CI and native rebuild/signing costs offset that benefit.               |
| Parity-ledger coverage  |      -2 |  -2 | Mapping validation fails and no final device matrix cell is verified at the freeze.                                               |
| Cost to finish          |      -2 |  -2 | Physical qualification and distribution work remain beyond an already released shipping app.                                      |

Scores use the requested -2…+2 ordinal scale. Web implications are called out within each factor;
the native architecture score is not a claim of faster RN web rendering.

## 1. Maintenance cost

Start with [BURDEN.md](../../migration/BURDEN.md): its common-horizon decision policy requires
retirement of a demonstrated recurring obligation and evidence-backed effort ranges. Source size and
dependency counts are useful exposure proxies, not measured engineer time or proof that the burden
eligibility test passes. Its source-facts receipt already uses the shipping SHA above and is reused
for that historical context. The candidate's inputs have changed, so the structural census is fresh.

The [census script](evidence/measure-desk.py) counts physical lines, including comments/blank lines,
in tracked text extensions. It partitions non-test product paths (`src`, `web/src`, `netlify`, and
the historical experiment's `src`), tests, native projects, tooling/agent trees, docs/evidence and
everything else. Generated declarations and mirrored agent files are included; binary art
contributes bytes/files but no lines. This is a reproducible text census, not semantic SLOC. Native
code is shown separately from app code; tooling excludes its test files. Raw per-bucket bytes/files
and exact path rules are in the script and receipts.

| Tracked text lines                       | Shipping main | RN freeze | Store tag source |
| ---------------------------------------- | ------------: | --------: | ---------------: |
| App paths, excluding tests               |        69,105 |    97,242 |           54,830 |
| Tooling and agent trees, excluding tests |       266,706 |   233,772 |          233,025 |
| Tests, across the tree                   |       173,807 |   162,575 |           97,581 |
| Native projects, excluding tests         |         3,219 |     9,094 |            2,255 |
| Docs and evidence                        |       366,028 |   786,659 |          221,818 |

The RN tree has retired SvelteKit and Capacitor rather than retaining two complete product UIs. That
removes old build/bridge owners, but introduces native input/audio/storage seams, Skia, React Strict
DOM adapters, and a custom static web pipeline. The large documentation delta is campaign history;
it should not be charged as runtime or equated with annual product upkeep. The census includes
common backend code in both app totals.

Dependency counts below traverse `pnpm-lock.yaml` from every importer's `dependencies` and
`optionalDependencies`, through snapshot dependency/optional edges, collapsing peer/patch suffixes
to unique **name@version** identities. Direct means manifest production dependencies; transitive
excludes those direct identities. Optional platform packages are counted even when this Linux host
would not install them. There were no unresolved graph edges. Build packages filed under production
for Netlify belong to these totals; this is **not the native binary's packaged dependency count**.

| Runtime-declared lock graph             | Shipping main |    RN freeze | Store tag source |
| --------------------------------------- | ------------: | -----------: | ---------------: |
| Direct dependencies                     |            19 |           31 |               21 |
| Transitive name@version identities      |           523 |          842 |              496 |
| Total reachable name@version identities |           542 |          873 |              517 |
| Local patch files                       |             0 |            7 |                0 |
| Patch bytes / physical lines            |         0 / 0 | 13,243 / 444 |            0 / 0 |

[RN](evidence/census-rn.log.txt), [main](evidence/census-main.log.txt) and
[release-tag](evidence/census-v160.log.txt) receipts contain the raw roots and counts.

Native project weight differs structurally:

* RN's committed `ios/Podfile.lock` has **182 pod/subspec entries, 109 distinct root pod names and
  110 direct Podfile dependency declarations**, generated with CocoaPods **1.17.0**. Subspecs are
  not independent libraries and direct declarations need not equal root names. Shipping uses SPM,
  with **3 remote pins**, and has no Podfile.lock. Those are different dependency models, not a
  claim that RN has exactly that many times more libraries.
* The frozen Android app explicitly declares WorkManager, Guava, React Android and Hermes; Expo/RN
  autolinking adds the module graph. Shipping declares AppCompat, Core, splashscreen, WorkManager,
  Capacitor/Cordova projects and its generated plugin-project dependencies. The complete declaration
  lists are in the census receipts. Gradle itself and native-module build plugins remain additional
  owners.
* **Resolved Gradle dependency counts are unavailable in this run.** Initial wrapper invocations
  could not write the default cache; writable-cache retries could not resolve the distribution host
  without Java proxy settings. Proxy-configured retries downloaded the wrappers, then RN stopped at
  the unavailable JDK 17 toolchain (the configured resolver returned HTTP 403), while shipping
  stopped because its native plugin packages were not installed in that separate worktree. These are
  collection-environment failures, not established product defects; their raw output is in the
  Gradle logs. Do not replace an unresolved graph with the small explicit declaration count. Neither
  source commits Android dependency locking sufficient to derive the complete resolved runtime graph
  offline.

**Score: -1 on Android and iOS.** Retiring a framework is useful, but the measured
app/native/dependency surface does not demonstrate lower recurring cost. The retained web renderer,
native renderers and prerender adapters still need joint behavior validation.

## 2. Dependency and upgrade risk

[DEPENDENCY-HEALTH.md](../../migration/DEPENDENCY-HEALTH.md) documents the external source-map
repair and a separately embedded residual. Its green-audit discussion explicitly does not certify
embedded code. [UPGRADES.md](../../migration/UPGRADES.md) supplies identity, native floor and
signed-channel obligations, not an annual SDK upgrade measurement. Their older path and architecture
descriptions must be read with the retirement receipt and current source.

The actual pin chain is recorded from the installed frozen lock graph in
[installed-pins.log.txt](evidence/installed-pins.log.txt): **Expo 58.0.14 → RN 0.88.0 / React
19.3.0**, with Expo's `bundledNativeModules.json` selecting **Skia 2.14.0, Reanimated 4.7.1 and
Worklets 0.13.0**. The frozen app matches those recommendations. Reanimated requires its Worklets
companion and an applicable RN version; the installed compatibility tables and peer declarations are
retained. Skia's broad peer ranges do not establish native ABI, picture lifetime, floor or pixel
compatibility. Upgrade these as a qualified set, including native projects and Hermes, rather than
independently accepting broad semver ranges. This run did not upgrade anything or prove native
compilation.

Patch-zero releases are exposure indicators, not evidence of a defect. The direct RN
production-declared `.0` resolutions are `@fontsource-variable/quicksand@5.3.0`,
`@shopify/react-native-skia@2.14.0`, `openai@7.23.0`, `react@19.3.0`, `react-dom@19.3.0`,
`react-native@0.88.0`, `react-native-svg@15.16.0`, and `react-native-worklets@0.13.0`. Shipping's
corresponding list is `@capacitor-community/media@9.1.0`, Quicksand, OpenAI and
`vite-plugin-pwa@1.3.0`. Across the reachable graph there are **220** RN and **111** shipping
name@version identities ending in `.0`; the exhaustive lists are in the census logs. This includes
old stable releases, fonts, server/build tooling and optional platform packages. In particular,
**Reanimated is on a patch release**, not a `.0` release.

Every frozen patch, inspected as committed:

| Patch                            | Bytes / lines | Why it exists and what an upgrade must preserve                                                                                                                                                                                   |
| -------------------------------- | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@stylexjs/stylex@0.15.4`        |      803 / 27 | Constrain number-only generic types and admit CSS `text-wrap: pretty`; typecheck/build compatibility.                                                                                                                             |
| `expo-audio@58.0.9`              |   3,997 / 113 | Account for the native Clear sampler's shared audio-session activity; stop/tear down players after media-services reset instead of automatically restoring playback. Requalify interruptions, reset, silence and session release. |
| `expo-screen-orientation@58.0.3` |      723 / 13 | Remove forced UIDevice rotation/attemptRotation calls; retain supported-orientation invalidation. Recheck OS rotation-lock and requested-orientation behavior.                                                                    |
| `node-forge@1.4.0`               |    1,119 / 23 | Validate nested DigestInfo element counts and empty ASN.1 NULL parameters against the named signature-forgery vulnerability. Primarily a build/signing dependency, not app UI.                                                    |
| `react-native-svg@15.16.0`       |    1,387 / 42 | Set and restore the current bitmap for both normal draw and `toDataURL`, including `finally`; preserve correct export/filter background behavior.                                                                                 |
| `react-native@0.88.0`            |    1,302 / 34 | Supply implicit first/last gradient endpoint positions, avoiding Android null-position warnings without changing the intended gradient.                                                                                           |
| `react-strict-dom@0.0.54`        |    3,912 / 92 | Align StyleX declaration constraints; disable Android font padding in text adapters; remove the unsupported native `header` role default. Requalify text geometry and accessibility semantics.                                    |

Raw patches and the prerender seams are in
[patches-and-prerender.log.txt](evidence/patches-and-prerender.log.txt). Each patch must either
disappear after verifying an upstream equivalent or be rebased and tested. Skia is **not patched**
in the freeze; the separate size-reduction proposal was declined in the epic's comments to avoid
that upkeep.

`tools/migration/prerender-native-web.mjs` deep-imports
`@expo/cli/build/src/export/embed/exportEmbedAsync.js` and consumes
`createMetroServerAndBundleRequestAsync`. It also deep-imports
`@expo/router-server/build/utils/html.js` for hydration markup. Its `asCommonJsModule` rewrites
Metro's terminal `__r(...)` call with a regular expression. These are implementation seams, beyond a
stable `expo export` CLI contract: a compatible SDK update can still alter module paths, request
shapes, generated bundle grammar or hydration output. The upgrade gate must exercise no-JS pages,
hydration/first input, offline precache, startup budgets, admin and API routing, not merely a native
build. Shipping has framework/bundler upgrade risks too; this particular private-API coupling is
added by RN web's custom pipeline.

The [npm publication-time receipt](evidence/expo-cadence.log.txt) records SDK `.0.0` releases: SDK
55 on 2026-02-25, 56 on 2026-05-20, 57 on 2026-06-30, and 58 on 2026-09-29. Cadence is irregular and
already includes **4** releases in this calendar year; a fixed annual bump is not the upstream
rhythm. Expo's [upgrade guidance snapshot](evidence/expo-upgrade-source.log.txt) recommends
upgrading SDK versions incrementally and aligning dependencies, native projects and release-note
changes. Expo Go support is not the production app's support window; this project builds its own
native apps.

**Annual planning allowance, not measured effort:** budget **3–4 SDK steps × 3–7 engineer-days =
9–28 engineer-days/year** for alignment/native project changes, patch/private-API reconciliation,
full web/renderer tests, physical service/drawing checks and signed release qualification. This
includes validation; unfamiliar upstream breakage can exceed it. Skipping intermediate versions
defers that work rather than removing it. The assumptions and arithmetic are in
[planning-estimates.json](evidence/planning-estimates.json). There is no measured comparable annual
Capacitor effort, so this cannot establish an annual monetary saving or satisfy BURDEN's formal
eligibility rule.

**Score: -2 on Android and iOS.** The SDK set, downstream native patches and web export internals
concentrate upgrade risk across platforms.

## 3. Reversibility

The [Svelte-retirement evidence](../2026-10-22-svelte-retirement/README.md) and
[#3148's final comment](https://github.com/KyleMit/Splotch/issues/3148#issuecomment-6334153593)
establish that the old app, Capacitor shell and release path were removed/replaced. **The RN freeze
cannot cut a Capacitor release.** A new Capacitor release can still be prepared from preserved
shipping main or the release tag in a separate checkout, with the old pinned toolchain, build
scripts and signing lineage. This run did not build that fallback, so source availability is not
release readiness. Keep an explicit protected rescue ref and recoverable toolchain before cutover;
do not depend on an agent's temporary worktree.

Store rollback is a **forward release of older implementation**. Re-uploading the old v1.6.0
binaries cannot replace a higher installed build. Android requires a higher versionCode, the
existing application ID and compatible Play app-signing lineage; the upload key alone does not prove
an update to a Play-signed installation. iOS needs an acceptable newer marketing version/build under
the same App Store Connect record/team and entitlements, Distribution signing, and another
review/release. A rejected/reused older build number is not a recovery path. Halt staged/phased
rollout first to limit exposure; it does not downgrade users already updated. No emergency review
time is guaranteed.

Drawings are not a reversible database migration. The fresh-start decision in CONTRACT/UPGRADES and
#2690 accepts legacy beta-to-RN data loss and does not provide a bidirectional importer. Ordinary
active ink/history is session-scoped. Saved pictures in the user's Photos/MediaStore remain external
image files through an in-place application update; the old app does not regain editable stroke
history from them. RN failed-save retention writes `splotch-unsaved-pictures-v1/held-*.json` through
Expo, and RN AI recovery has its own records. Shipping's old readers do not thereby acquire those
formats/namespaces. RN sandbox files may remain on disk after an update while being invisible to
Capacitor. Uninstalling/clearing data risks losing them; iOS Keychain survival is not a drawing
backup. Old settings/credential records may also reappear under old readers. A rollback needs a
separately reviewed disposition for dormant credentials and shared installation-allowance records,
not blind resurrection of old state. [Storage reads](evidence/rollback-storage.log.txt),
[shipping readers](evidence/shipping-storage.log.txt) and UPGRADES own the evidence.

Concrete recipe, to prepare before cutover and execute only if rollback is chosen:

1. Preserve `origin/main` at the shipping SHA above, the v1.6.0 tag, their lockfiles, native
   projects, release artifacts, signing recovery and store channel history. Rehearse the rescue
   build on supported toolchains. Keep old hosted API/CORS/trusted-origin contracts working while
   either client remains installed.
2. Reserve the RN release and rescue version sequence in both consoles. Illustrative minimum, **only
   if no later codes/builds exist**: RN `1.7.0 / 9`, then rescue `1.7.1 / 10`. Inspect actual
   uploaded/installed versions and choose higher values; never assume the published v1.6.0 baseline
   is the highest reservation.
3. On a rollback trigger, pause staged/phased rollout. Capture the affected commit, artifact/version
   and symptom. Tell parents to save open drawings and retry failed saves while RN can still read
   them. Preserve the application sandbox; do not uninstall. If RN cannot export its held data,
   carry that unresolved recovery cost explicitly.
4. Branch from preserved shipping source, apply only the necessary
   release-number/current-toolchain/security/API compatibility changes in a separately reviewed
   release unit. Use that branch's Capacitor `build:cap`, Android bundle and iOS archive/export
   flow. Do not run the RN release writer against the old project layout. Verify embedded
   identities, versions, provenance, signature, permissions and production API origin in the actual
   artifacts.
5. On disposable data, update a genuinely channel-installed RN build to the higher-numbered
   Capacitor rescue on each store's test channel. Verify launch, allowances/credentials, image
   saves, Photos/MediaStore survival, offline behavior, AI/report compatibility and the explicitly
   documented RN-only state loss. Local same-key installs alone do not prove store lineage.
   Fix/export data before rollout if the promised recovery fails.
6. Submit the rescue against the existing store records, complete review and release, then monitor.
   Retain RN data/export tooling until recovery is resolved. If later returning to RN, ship yet
   another higher-numbered qualified release.

**Planning cost:** **3–7 engineer-days** for a rehearsed rescue (source/toolchain revival, state/API
review, two signed build/update checks and submission), plus store review/rollout wait; **5–15
engineer-days** if a new RN-state exporter or compatibility work is required. These are alternative
ranges, not additive, and are unmeasured estimates recorded in the planning receipt. Without a
prebuilt, tested rescue this is not a same-day switch. A web deployment can restore old
static/server output faster, but same-origin browser/AI records and API compatibility still need
review; that does not repair installed native clients.

**Score: -2 on Android and iOS.** History preserves the implementation; it does not preserve an
immediately shippable binary or lossless state rollback.

## 4. Architecture fit

[ADR-0178](../../adrs/0178-native-ink-renders-through-skia.md) selects bounded native ink rendering
and its amendment specifies incremental op painting. At the freeze, `src/drawing/SkiaInk.tsx`
subscribes to the live feed in `useLiveFrames`, paints through `scene.flush`, and presents through
the handoff cadence. `src/drawing/skiaViewPicture.ts` calls
`SkiaViewApi.setJsiProperty(view.nativeId, 'picture', picture)`. A live sample does not call a React
state setter. React still handles cohort boundaries, layout/resource readiness, appearance and error
UI; this is not a claim that drawing never renders React. Undo/theme/page/resize rebuilds can replay
history, and raster memory scales with paper size. Source and installed pin receipts preserve the
inspection.

The required run at the frozen tag **passes: 5 tests, 1 file**, Vitest **5.0.2**, Node **24.19.0**,
one execution of:

```sh
npm run test:migration:rsd-selection -- rsd-native-render-budgets
```

[Raw output](evidence/render-budgets.log.txt) includes version, duration and warnings. It mounts the
real RSD drawing screen through the released native RSD renderer with host seams and counts React
commits/renders. The budgets cover:

* Drawer/menu open/close without rendering paper.
* Landscape Color Menu open/close without paper; a color pick must reach paper.
* Only the swatches affected by a paint pick re-render, with the pick reaching paper.
* Button Size drag updates affected chrome without paper.
* Volume drag updates its slider without re-rendering chrome or paper.

Positive render assertions accompany the zero-render budgets so a blind census cannot trivially
pass. **These tests do not execute the physical Skia/GPU/input path** and do not measure frame time,
long-stroke cost, memory, native crashes, pixels or touch-to-ink latency. The static path confirms
the intended separation; native surface-render, incremental pixel and picture-lifetime tests are
complementary owners, not newly executed passes in this report. ADR-0178's older performance numbers
are not reused as freeze measurements. RN web retains its own renderer and cannot inherit the native
Skia conclusion.

**Score: +1 on Android and iOS.** The architecture addresses the original rendering constraint and
its narrow React budgets pass; physical benefits and costs remain unmeasured here.

## 5. Developer velocity

Workflow definitions were read at each exact source commit; [frozen CI](evidence/ci-frozen.log.txt)
and [shipping CI](evidence/ci-shipping.log.txt) retain the commands and conditions.

| Tier                        | Shipping main                                                                                             | RN freeze                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Quality                     | Format/types/lint/CSS, generated/token/dead-code/production-dependency/asset/ADR-related guards and audit | Corresponding RN/types/tooling guards and audit; Svelte-only token/build owners retired                          |
| Browserless                 | Shared coverage, asset pipeline, store drawings, tools, API contract smoke                                | Same retained tiers, mounted RSD-native renderer tier, real-handler test-mode API/isolation smoke                |
| Production build            | Web release build smoke and Capacitor static bundle boundary                                              | Production-only RN web install/build, artifact sharing, then Chromium postbuild/no-JS/admin/safe-area acceptance |
| Browser UI                  | Svelte Playwright suite in 8 shards, Firefox/WebKit smokes                                                | RN web Playwright in 2 shards, Firefox/WebKit smokes, real-handler UI integration                                |
| Performance                 | Lighthouse and fast WebKit commit gate                                                                    | RN-export Lighthouse/startup/precache gates; retired Svelte-specific WebKit commit owner                         |
| Native compile              | Capacitor native compile workflow under its path/event conditions                                         | Release Android and iOS simulator compilation under native-input path filters                                    |
| Native boot / channel proof | Tag/dispatch emulator/simulator smokes; no per-PR physical/channel proof                                  | Tag/dispatch RN boot smokes; still no per-PR physical/channel proof                                              |

A native renderer test hosted with mocked OS seams is not a device UI test. Fewer browser shards and
removed Svelte-specific tests do not alone establish less coverage; the retirement dispositions name
retained/replaced/retired owners. Required physical and store-install tests remain external to
ordinary PR CI on both stacks.

Recent PR timing uses **10 latest merged PRs per base branch**, selecting the latest completed
non-cancelled Tests run matching each PR's exact final head. All selected runs succeeded. Duration
is workflow `updatedAt - startedAt`, excluding pre-start queue time, and is an elapsed workflow
proxy rather than summed job CPU or native compile time. The samples are a historical comparison of
different changes/runners/dates, not an experiment on identical inputs.

| Target base                             | Sample count | Median Tests workflow elapsed |
| --------------------------------------- | -----------: | ----------------------------: |
| `main`, SvelteKit/Capacitor PRs         |           10 |                   327 seconds |
| `codex/native-migration`, recent RN PRs |           10 |                 771.5 seconds |

[Sampling commands and summary](evidence/ci-sampling.log.txt),
[raw runs, exact measured SHAs and PR links](evidence/ci-samples.json), and
[sampler source](evidence/sample-ci.py) make the selection reproducible. Workflow-ID lookup was
needed because the filename/event-filter probe returned no rows; main's older merged PRs required
the earlier created-date window. This does not estimate time lost to failed attempts, review, cache
misses or native compile; the sampled RN set spans workflow evolution before the freeze.

The documented JS loop is `tools/device-parity/swap-js-bundle.mjs`: start with a full Release
**development-identity** build, re-export JS using the same Expo/Hermes flags, replace the bundle,
align/re-sign Android or re-sign the iOS app with its preserved profile/entitlements, install over
the same development ID and relaunch. It refuses the store ID. Android rejects assets absent from
the base APK; native modules, resources, entitlements, SDK changes and signing changes require a
full build. iOS still needs macOS and an appropriate identity.

The [README](../../../tools/device-parity/README.md) claims about **ten seconds** while the script's
opening comment says **about a minute**. These are inconsistent historical claims, not timings
collected here. No device loop or full native rebuild was timed. The concrete benefit is avoiding
native recompilation for eligible JS-only edits; shipping's `build:cap`/sync workflow also avoids
rewriting native code for ordinary web changes, so this is not unique to RN. The frozen iOS compile
workflow estimates **20–30 minutes** on hosted runners in its comment; that is documented context,
not this run's benchmark.

**Score: 0 on Android and iOS.** There is a practical JS-only loop, but the CI sample favors
shipping and there is no matched end-to-end edit-to-device measurement.

## 6. Parity-ledger coverage

The required command was run read-only at the freeze:

```sh
python3 docs/scratchpad/2026-10-18-device-parity/build-protocol-mapping.py --check
```

**FAIL**, Python **3.12.14**, one execution, exit **1**:
`AssertionError: ('L0085', 'tools/tests/native-icon-recolor-parity.test.mjs')`. The named test was
retired. [Raw failure](evidence/protocol-check.log.txt); campaign-found bug
[#3182](https://github.com/KyleMit/Splotch/issues/3182), labelled `type:bug`, `area:ci-testing`,
`area:native`. No repair was made. The historical mapping cannot be certified as generated/current
at this freeze.

The [fresh CSV census](evidence/ledger-census.log.txt) reads committed rows; it does not promote
their status. Statuses must be reported separately by evidence layer:

| Layer                     |                          Verified |                             Failed |                Settled / accepted |                                Unrun or unresolved | Other / total                 |
| ------------------------- | --------------------------------: | ---------------------------------: | --------------------------------: | -------------------------------------------------: | ----------------------------- |
| Protocol mapping          | 24 historical automated contracts | 0 marked failed after prior reruns |                        20 settled |                      1,344 unverified + 17 blocked | 136 out-of-scope; 1,541 total |
| Final acceptance subcells |                                 0 |                    0 marked failed |  1 explicitly accepted difference | 4,627 pending + 140 stale/invalidated + 30 blocked | 4,798 total                   |
| Requirements inventory    |                                 0 |                    0 marked failed | 4 explicitly accepted differences |                                      1,537 pending | 1,541 total                   |

“Unrun or unresolved” includes rows with diagnostic takes or stale evidence; it must not be
relabelled as literally never attempted. No final-matrix verified cells is materially different from
no bugs found. `out-of-scope` and `settled` are dispositions, not successful execution. The README's
older classification table predates the out-of-scope changes; the current CSVs own the counts above.
The failed generator prevents treating the historical **24** contracts as an independently
revalidated current-freeze pass.

The older `2026-10-14-rn-parity-ledger` contains **275 logic rows**, **355 behavior rows**, and
**787 shipping E2E titles**. Logic classifications are **118 ported with drift guard, 66 ported
without guard, 27 imported, 38 not needed on RN, 26 missing**. Behavior evidence says **263 “RN test
or code”** and **92 “none found”**. These are historical port/inspection classifications, not
verified/failed execution statuses, so no fabricated pass percentage is derived from them. Current
owner references may have moved through retirement. The latest issue comments explicitly supersede
older “acceptance completed with limitations” language with an incomplete final matrix.

**Score: -2 on Android and iOS.** The ledger is broad enough to expose risk, but does not close it;
historical closed defects and owner decisions do not supply current complete parity proof.

## 7. Cost to finish

The `enumerate-sub-issues` skill used the API-backed recursive command, then fetched each
descendant's body and full comment thread. [Tree](evidence/epic-tree.json),
[per-issue snapshots](evidence/issues/2690.json) and
[complete classification](evidence/epic-classification.csv) are committed. Every descendant is in
one bucket; closure is source/API evidence of historical work, not frozen release acceptance. The
inventory is read-only and no existing issue was claimed or closed.

| Parent                  | Direct API children | Done | Dropped | Blocked/open |
| ----------------------- | ------------------: | ---: | ------: | -----------: |
| #2690                   |                  92 |   90 |       0 |            2 |
| #2978                   |                  33 |   29 |       3 |            1 |
| #3148                   |                  14 |   14 |       0 |            0 |
| Unique descendant union |                 139 |  133 |       3 |            3 |

The dropped descendants are **#3014** (test host returned SPA HTML for pack assets; no RN defect),
**#3074** (Samsung stops supplying finger events after palm cancellation; owner accepted platform
behavior), and **#3078** (tap stops a still-settling fling; owner accepted platform behavior). Their
full comments retract/narrow the original reports. Do not schedule their original fixes again.

The only open descendants are **#2978**, **#2985** and **#3148**. Public issues outside the child
relation also matter: **#3121, #3122 and #3142** explicitly remain unresolved RN/device findings.
**#3007** is open but its implementation has been delivered through #3148; its old “after cutover”
wording was superseded by the owner's later retirement-before-main decision. **#3011** was
explicitly deferred and is not silently converted into a release blocker.
[Open-issue inventory](evidence/open-issues.json) and supplementary issue snapshots record this
check. #851's submission-readiness children are all closed; its remaining console checklist still
needs execution for the RN release.

Estimates are **one person's focused engineer-days**, not measured elapsed time, confidence
intervals, or the older BURDEN arm forecasts. Each range is tied to the frozen source and the issue
snapshot in [planning-estimates.json](evidence/planning-estimates.json). Device access, account/key
recovery, store review and newly found defects add calendar time. Do not sum parent tracking issues
and their included child work twice.

| Open item / release obligation                                                               | Remaining work at this freeze                                                                                                                                                           | Planning effort                          | Blocking scope / evidence                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#2978](https://github.com/KyleMit/Splotch/issues/2978)                                      | Qualify final-source shipping comparators; complete applicable device/floor/visual/behavior/audio/input/lifecycle/performance and live AI/report evidence, reconcile stale cells        | 8–15 days                                | Android and iOS; physical/store-qualified comparisons remain unfinished. Excludes the specific implementation repairs below; includes physical #2985 checks.    |
| [#2985](https://github.com/KyleMit/Splotch/issues/2985)                                      | Physical maximum-font and screen-reader acceptance                                                                                                                                      | 0.5–1 day, included above                | Both platforms. Latest comment says compact AX5 layout is fixed by #3102; live font-size leftover has a reasoned disposition. Do not estimate redoing that fix. |
| [#3121](https://github.com/KyleMit/Splotch/issues/3121)                                      | Resolve window controls covering palette, or make a reviewed supported-window decision; verify it                                                                                       | 1–3 days                                 | iPadOS. Reported in shipping too; still an unresolved child-facing defect, not automatically waived.                                                            |
| [#3122](https://github.com/KyleMit/Splotch/issues/3122)                                      | Diagnose/repair stale insets after maximize; verify window cycles                                                                                                                       | 1–3 days                                 | iPadOS. Shared shipping symptom; distinguish OS limitation from app repair before disposition.                                                                  |
| [#3142](https://github.com/KyleMit/Splotch/issues/3142)                                      | Keep action icons nonzero when the Android split pane clamps button faces; verify minimum pane                                                                                          | 1–2 days                                 | Android. Existing report is at an earlier source; reproduce at freeze before changing a future candidate.                                                       |
| [#3182](https://github.com/KyleMit/Splotch/issues/3182)                                      | Reconcile retired test ownership and restore the protocol check; revalidate stale verified claims                                                                                       | 0.5–1 day                                | Shared evidence gate; newly found here. Requires a subsequent candidate/evidence revision, not a fix in this report.                                            |
| [#3148](https://github.com/KyleMit/Splotch/issues/3148)                                      | Configure shipping Xcode account and Distribution private key, export/verify App Store IPA                                                                                              | 0.5–2 days + account/key wait            | iOS. All implementation children are done. Prior signed archive is not an exported App Store IPA, and its source predates freeze.                               |
| [#3007](https://github.com/KyleMit/Splotch/issues/3007)                                      | Final acceptance/administrative reconciliation with delivered retirement                                                                                                                | 0.25 day, included in release validation | Shared; no new routing rewrite is implied. Retain older-client API compatibility checks.                                                                        |
| Version reservation and fresh release artifacts                                              | Reserve newer version/builds, bump via canonical release owner, build frozen-successor release, verify embedded metadata, signature, API origin and source association                  | 0.5–1 day                                | Both; freeze still declares `1.6.0 / 8`, so it is not upload-ready as the next store release.                                                                   |
| Signed channel update rehearsal                                                              | Update supported actual distributed sources through Play testing/TestFlight, preserving identity, allowance and safe fresh initialization; check candidate-created data on later update | 1–3 days                                 | Both. Distinct from anonymous/local development installs and ordinary boot smoke; excludes the broader #2978 behavioral matrix.                                 |
| [#851](https://github.com/KyleMit/Splotch/issues/851) console checklist and store submission | Revalidate privacy/data-safety/age rating, AI reviewer access, support links, permissions/screenshots/metadata; upload to existing records, submit and stage rollout                    | 1–3 days + store review                  | Both. Existing released status is accepted as campaign context; older repository notes do not independently establish current console state.                    |
| Owner go/no-go on #2690                                                                      | Weigh this report with the other campaign runs, accept remaining decisions and choose platform-specific cutover                                                                         | Owner decision, unestimated              | Both; no store upload, deployment or merge is performed by this run.                                                                                            |

These are work packages, not promises that a finite fix list guarantees acceptance: final #2978
checks can discover more defects. #3121/#3122 are conservatively held pending an explicit
disposition because “shipping does it too” does not by itself settle their stated acceptance. The
unrelated open provenance/automation ideas **#1098, #222, #241, #248** are not mandatory new product
features for this campaign: manual artifact/source verification and manual store submission can
satisfy release mechanics without implementing those proposals. #3011's optional tiered hydration
remains deferred. Owner-parked web gaps in #3148's final comment remain recorded decisions, not
silently reopened work.

Release mechanics are concrete. v1.6.0's verified published artifact inventory already establishes
**Android code 8 / version 1.6.0** and **iOS build 8 / marketing 1.6.0**; this report reuses
[UPGRADES' artifact inventory](../../migration/evidence/upgrade-artifact-inventory/README.md),
rather than redownloading equivalent artifacts. The freeze's own projects still match those values.
Reserve **higher than all store-uploaded/reserved values**, using the canonical version writer;
`1.7.0 / 9` is an example only if console history allows it. Android needs the existing upload key
and Play-held signing lineage, correct store build switch, production ID/origin and mapping. iOS
needs the registered team/app/access groups, a Distribution identity with private key,
provisioning/export, archive/IPA verification and App Store Connect submission. Build/tag/GitHub
Release automation is not a store submission. The prior Android signing receipt and iOS archive are
useful historical feasibility evidence, but neither certifies new freeze bytes or grants upload
readiness.

**Score: -2 on Android and iOS.** Remaining work is concentrated in qualification, explicit defect
disposition and release operations; completed migration implementation is not yet an accepted next
store release.

## What this cannot tell us

This desk review cannot establish touch feel, frame pacing, GPU/thermal/memory behavior, battery
cost, physical audio/input/accessibility correctness, store-signed in-place installability,
successful AI/report delivery, or review acceptance. Mounted React budgets do not measure those
properties. The Gradle runtime graph remains unmeasured; source counts, broad peer ranges and a
frozen install cannot substitute for it. Historical CI medians mix different changes, dates and
runner/cache conditions. Estimates are planning judgments and the factor scale has no agreed
weights. Neither a complete port inventory nor a zero-failed-row count makes missing final evidence
a pass. A go decision needs the companion platform measurements, current channel/version history and
the owner's explicit acceptance of the remaining tradeoffs.
