# Best versions of each arm (owner steer: pick the best bones)

2026-11-10 08:44 EST → 17:12, Claude. Paused 09:41–13:00 for the disk (cleared with the owner's
approval). **State at 17:12:** both arms built for Android and iOS; RN's checks pass at its tip
apart from two failures that the frozen build shares; nothing is installed yet. Galaxy installs and
smokes wait for the Galaxy (the memory settle run holds it); iPad installs wait for the iPad, which
has been offline since a reboot at 16:51.

Both branches are local only, never pushed. The frozen candidates are untouched. Worktrees:
`.claude/worktrees/best-rn` (`claude/best-rn`) and `.claude/worktrees/best-shipping`
(`claude/best-shipping`). Logs and scripts are in `best-versions/` in the campaign scratch folder.

## RN best: `claude/best-rn` @ `09f06e86c174555e4c553da018179f488d90b0af` (off `427756f14`)

| Fix                                         | Source                                            | Commit(s) on the best branch                                                       | Files and size                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-stroke sound stall                    | `claude/spike-ios-first-stroke-audio` 6c93c0993   | 3921681113e96d797c10a56a8b608dd31b06367d                                           | `src/audio/drawingAudio.ts` +4; test +16/−1                                                                                                                                             |
| Ink hidden after rotation                   | `claude/spike-rn-rotation-ink` 7d07dfe9d          | d3e37c9f5de277f308a20f220261f5074c68466e                                           | `src/drawing/PaperInputView.tsx` +36/−9                                                                                                                                                 |
| Post-Clear lock (Auto-Save on), Undo memory | `claude/spike-rn-guardrails` 24928fead            | c01b89156f3c…, d1efcc759e74…, 38bb2351018a…, 469ccff1b0d4…, cfc226a6b534…          | 5 spike commits (its spike-only `.dev.spike` suffix commit cf1c24fac left out). Source ≈ +335/−115 in 12 files, react-native-skia `pnpm patch` (one changed line)                       |
| Lockfile tidy                               | new                                               | 38c72f46c6e1001e7177d5f735b2eee69fd14181                                           | The guardrails patch commit also moved `legacy-javascript` 0.0.3 → 0.0.4 (a Lighthouse dependency). Reverted; only the Skia patch entries stay. `pnpm install --frozen-lockfile` passes |
| Clear after an Eraser lift; dialog exit     | `claude/spike-rn-input-loss` 1e5049c8f (net diff) | a3754ff6c6d53ccbc37903701eda53e9fd73bc71                                           | `useDrawingScreen.ts`, `ModalShellContent.tsx`, 2 tests; +54/−3. Merged by hand with the guardrails Clear (below)                                                                       |
| Status-bar icons over a dialog (Galaxy)     | new (`visual.md`)                                 | b7af5302217dc0f0308e64a2e40bbb7967fddf56                                           | `DrawingAppearance.tsx`, `ModalShellContent.tsx`, 1 test; +18/−4                                                                                                                        |
| Orientation picker stacked vertically       | new (`visual.md`)                                 | 09f06e86c174555e4c553da018179f488d90b0af                                           | `RsdSegmentedPicker.tsx`, 1 test; +20/−3                                                                                                                                                |
| Test re-pointing                            | new                                               | 9ca88e83eb4c96346924edda120aff5e26ab2bad, 637188cc73bd4e1bff06db90e5613ffcaaa58c81 | listed below                                                                                                                                                                            |

Totals against `427756f14`: source, patch and lockfile 19 files +422/−134; tests 18 files +430/−159.

**The Clear merge.** The guardrails and input-loss spikes both rewrote the start of
`clearCurrentPicture`. The best branch keeps both rules. A Clear with nothing to keep clears at once
(`empty ?? false`). A Clear that keeps the picture and knows the page clears at once and exports the
frozen ink. Only a keeping Clear on a page whose emptiness is still unknown waits under the input
lock.

**The dialog exit uses the instant variant.** The on-time variant was not built, because it cannot
deliver what it promises. The spike's dot trains put the frozen app's deaf window at 300–340 ms and
the instant variant's at 100–140 ms. The difference is exactly the 200 ms fly-back, so the
JavaScript hop after the animation is small. The RN-only extra is the press-to-commit latency before
the fly-back starts. Dismissing on a JavaScript timer at 200 ms would therefore land near the frozen
~300 ms. Keeping the fly-back without the lost touches needs the leaving window to pass touches
through (an Android `FLAG_NOT_TOUCHABLE` dialog window, and an iOS presented controller outside
hit-testing). That is native work on both platforms, beyond the one-hour budget. The best build
therefore has no native close animation, a visual-parity regression against shipping.

**Status bar.** On the Galaxy, shipping shows white icons over a dialog and RN shows dark ones on
the same near-black band (crops from the visual lane's `shots/galaxy/*/color-picker__light`). On
Android, a dialog's status bar is now `light-content` unless the dialog is see-through. iOS is
unchanged, because no iPad defect was recorded.

**Orientation picker.** Cause: `RsdSegmentedPicker`'s label-split stack was keyed without the option
direction. "Landscape" broke beside its glyph in the first, unmeasured row layout. That stacked the
three locks down the card for good, even after the track measured narrow and asked for glyphs over
labels (shipping's layout). The key now includes the direction. This is diagnosed from code and the
visual lane's screenshot; it is **not yet checked on the device**.

**Left out.** Memory and Undo design work is with the other lanes. So is the rotation spike's
"second view" (`KeyboardScope`): the notes give only an audit for it, not a fix.

### Tests updated (none deleted)

| File                                                                                           | Change                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/tests/native-mounted-alpha.test.mjs`                                                    | 7 failing Clear/decoder tests, plus the passing tests that use the same Clear helper, now clear with Auto-Save on (`clear(true)`), the only Clear that still reads back. Three settle one more frame pass, because the kept picture saves after the decode                                                           |
| `tools/tests/native-ink-scan-mounted.test.mjs`                                                 | "keeps Clear unchanged when its captured crop becomes stale": `clear(false)` → `clear(true)`                                                                                                                                                                                                                         |
| `tools/tests/native-drawing-artwork.test.mjs`                                                  | 4 tests: they find the ink in the paper's box (the native input's parent) instead of inside `drawing-paper`                                                                                                                                                                                                          |
| `tools/tests/native-paper-rotation-mounted.test.mjs`                                           | Grain test: same selector change. **New guard**: the native input holds no React children through a stroke and a rotation. It fails on `427756f14`'s adapter ("expected 1 to be +0")                                                                                                                                 |
| `tools/migration/tests/rsd-native-modal-*.test.mjs`, `-chrome-behind-dialogs`, `-first-stroke` | 19 dialog tests re-pointed (by a helper agent). Native cases pin the dismissal in the close's own commit; premises that need a fly-back run as web, where it survives. The spike's new test moved to `rsd-native-modal-exit.test.mjs` (lint's 500-line cap), plus 2 status-bar cases (android fails without the fix) |
| `tools/migration/tests/rsd-native-whole-words.test.mjs`                                        | New: a label that broke beside its glyph does not keep the column layout stacked. Fails without the fix                                                                                                                                                                                                              |

### Results so far

| Check                                                                                   | Result                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The 8 affected files (4 tool, 4 rsd), before re-pointing                                | 13 + 19 failed, as the spikes predicted (`best-versions/logs/rn-targeted-1.log.txt`)                                                                                                                                                                                                                                     |
| Same tool files after re-pointing, plus the guard                                       | 42/42 pass                                                                                                                                                                                                                                                                                                               |
| `npm run test:migration:rsd-selection` at 9ca88e83e (helper, under rig.lock)            | **1048/1048** pass                                                                                                                                                                                                                                                                                                       |
| rsd `modal-exit`, `whole-words`, `settings-layouts` at the tip                          | 4/4, 43/43 pass                                                                                                                                                                                                                                                                                                          |
| ESLint + Prettier on every touched file                                                 | clean                                                                                                                                                                                                                                                                                                                    |
| Full checks at the tip, under rig.lock, 12:54–13:12 (`best-versions/bin/rn-checks.zsh`) | `check` clean; `lint` 0 errors, 3 warnings, all in files the best branch does not touch; `test:unit` 2,048 pass; `test:migration:rsd-selection` 1,051 pass; `test:tools` 8,237 pass, 1 fail: the expired node-forge audit exception (GHSA-86w9-cpqp-85rv, expired 2026-11-05), which fails the frozen build the same way |

### Builds and devices

| Artifact                                                 | Path (campaign scratch folder)   | sha256                                                                        | Notes                                                                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android probe Release APK, `art.splotch.app.dev.best`    | `builds/best-rn/app-release.apk` | `1530e214a8bde3883870d8fb5a62cd380fe3a3e024b7e2ec3d3783fc8b962c7c`            | 13:16, `best-versions/bin/rn-android.zsh`, 2 m 29 s; Gradle cleaned after                                                                                                                                                       |
| iOS probe Release device app, `art.splotch.app.dev.best` | `builds/best-rn/Splotch.app`     | App binary `e602baf67c800366a5d4d5162da95b8ee3e63de9cd00a9b5a016d32b9603b493` | 17:11, `best-versions/bin/rn-ios-only.zsh`. The first try failed at signing: the worktree lacked the untracked `ios/local.xcconfig` that holds the team, now copied in (gitignored). `pod install`'s edits are restored on exit |

Commands as planned: Android probe Release
`./gradlew :app:createBundleReleaseJsAndAssets --rerun :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`,
with `EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1` like every spike, and an uncommitted
`applicationIdSuffix ".dev.best"` that is reverted afterwards. iOS: `pod install`, then xcodebuild
Release with `SPLOTCH_APP_ID_SUFFIX=.dev.best`, reusing the `builds/ios-dd-spike` derived data.
Expected disk: about 3–5 GB (Gradle outputs, the Skia C++ recompile for the patch, `ios/Pods`).

## Shipping best: `claude/best-shipping` @ `f9d3b6ff67d5c7374f754eebe372c6e95eda6ed2` (off `ef3d1eb20`)

Code and checks were done by a helper agent; I verified the branch state and built it.

| Fix                                     | Source                                       | Commit                                   | Files and size                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stroke tail (last half-chord)           | `claude/spike-shipping-multitouch` 013027548 | e010aedabb5364a2a36fa0e3a469fd474ca80125 | `engine.ts` +10. No test (as in the spike)                                                                                                                                  |
| Duplicate move events (zigzag curve)    | priced in `spike-multitouch.md`, new         | 2858307d2196d944d2003ae37290907c28d95015 | `engine.ts`, `strokeMath.ts` (`admitMove`), `strokeMath.test.ts`; +57. The helper keeps `engine.ts` under its lint cap. Its 3 tests drive the helper, not `draw()`          |
| UIScene for the iPadOS 27 SDK           | `upkeep/uiscene/apply.mjs`                   | 74ece55b6c1663c4382603a72912c98e6484cd29 | `Info.plist` +19, `AppDelegate.swift` +19. The built app carries `UIApplicationSceneManifest`; launch not yet checked                                                       |
| "Choose folder" dead on Android         | `visual.md`                                  | f8f72cc74947d2fd59d618a0b89a90f6b67b9383 | `folderSaveSupported()` is false in the native shells, so the row hides, as RN does; +17/−2 with a test that fails on the base                                              |
| Custom-colour button off-screen (12.9") | `journeys-ipad.md`, `visual.md`              | f9d3b6ff67d5c7374f754eebe372c6e95eda6ed2 | Landscape palette trims by its own measured height (container queries), not the screen's; `ColorPalette.svelte`, `trimGeometry.ts` + test, `docs/COMPATIBILITY.md`; +81/−32 |

Total: 11 files +203/−34.

**The palette check.** In Chromium at 1366×1024 with the iPad's insets, the base keeps 13 colours
and puts the custom button at 972–1032 px, past the bottom edge. The fix keeps 12 (Indigo dropped,
as RN does), with the button at 932–992 px. The `palette-trim` Playwright spec was not run; its
counts are unchanged with no insets.

| Skipped                                            | Why                                                                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Night Mode doesn't recolour ink already drawn      | Deliberate: ADR-0052, "Committed strokes keep the color they were drawn with". Not a defect                                                                                                                                  |
| Screen-reader names for the brush and size buttons | Every option already has an `aria-label`. Only the `aria-pressed` buttons (`ToggleButton`) read empty in the journeys dump, which fits WebView's reduced accessibility tree. It needs a real TalkBack pass before any change |

**Tests updated:** two cases in `trimGeometry.test.ts`. "Classifies every @media rule" now expects
the container rule and its ladder. "Floored at 600 px" became "trims by its own height" plus "is a
size container only in the landscape column layout".

**Results at f9d3b6ff (helper, under rig.lock):** `npm run check` 0 errors and 0 warnings;
`npm run lint` 0 problems; `npm run test:unit` 4,437 + 45 SSR pass; `npm run test:tools` 7,095 pass;
Prettier and dprint clean. No E2E run.

### Builds (09:35–09:38, under rig.lock)

| Artifact                                                | Path (campaign scratch folder)         | sha256                                                                        | Notes                                                                                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android Release APK, `art.splotch.app.baseline.best`    | `builds/best-shipping/app-release.apk` | `58d3d2eaade8bb2dcc27cbe8926bfb4cf45aaf82ff6fde3b908ca9617211aace`            | `npm run android:apk:release`; R8 on; debug key; uncommitted suffix and signing edit, reverted. `postbuild:cap` gates passed (native export 6,129,604 / 7,000,000 bytes, 249 files). Production bundle and API, as frozen |
| iOS Release device app, `art.splotch.app.baseline.best` | `builds/best-shipping/App.app`         | App binary `7ed74c150bb077f480daeca461bd426eb1a0e64d230610cb6c66cb7934487b77` | xcodebuild Release, Apple Development signing, uncommitted pbxproj ID edit, reverted. Same cap-synced web payload                                                                                                         |

Scripts: `best-versions/bin/ship-{android,ios,both}.zsh`. Both worktrees are clean.

## Install and smoke state

| Device     | RN `art.splotch.app.dev.best` | Shipping `art.splotch.app.baseline.best`                           |
| ---------- | ----------------------------- | ------------------------------------------------------------------ |
| the Galaxy | built, not installed          | built, not installed (the Galaxy is held by the memory settle run) |
| the iPad   | built, not installed          | built, not installed (the iPad is offline since a reboot at 16:51) |

No smoke has run. Still to do on resume: the RN checks at the tip, the RN Android and iOS builds,
Galaxy installs and smokes (launch, draw, Undo, Clear, Settings open and close, then draw at once,
plus Settings › Appearance for the Orientation picker and a dialog's status bar), and the iPad after
its lock frees.

## v2 (2026-11-11 00:46 → 01:35 EST, lane rn-best-v2): memory, Undo and sound

RN best v2 is `claude/best-rn` @ `e703b8b79a08fbb4ff6301de0007e495e2c7f207` (v1 + 6 commits, local,
never pushed). Full record: `rn-best-v2.md`. Shipping best is unchanged.

| Added                                                                  | Commit on `claude/best-rn`                                                                                                                                                             | Evidence                                                                                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ganesh purge + 96 MB cap; idle Ganesh purge; allocator purge (Android) | `cc0485716bdb7c4452ee1ce877cad17d62b3baf0`, `a7de2f1f217401267d3a26f0e5e545a959473279`, `55e3a8b144c8e60537bb72e43180dddbb716cce3` (from settle `c904b4026`, `8ac70e177`, `236584509`) | `rn-memory-bones.md` settle run: frozen's leak gone (floors +13.5 → +0.93 MB/min, peak 926 → 527 MB); its own fix gate still failed on the ~200 MB high-water mark ("bones") |
| Undo from per-commit tile snapshots                                    | `e1c106844a0ad8ea8f546be8766a0bea9970cdcb` (from `3c75b4254`); lint-cap refactor `af76f91d68834edd8888345d5547eee7f20f9fe4`                                                            | `rn-undo-bones.md`: all four criteria (p90 79 ms, 0 differing bytes, ≤ 24 MB)                                                                                                |
| Sound ramp at 120 Hz touch rates                                       | `e703b8b79a08fbb4ff6301de0007e495e2c7f207` (new, with a touch-rate test that fails on v1)                                                                                              | Galaxy rerun of `rn-sound.md`'s counted set: 0 of 30 never (frozen control 28 of 30), 122–226 ms                                                                             |

The settle branch's instrumentation commit `1ef1c80b8` stays out (its `.dev.mem` ID, Hermes heap
line and Ganesh counter); the Skia patch was regenerated per commit without the counter.

**Checks at the tip:** `check` clean; `lint` 0 errors, the same 3 warnings; `test:unit` 2,048 pass;
`test:tools` 8,245 pass and the same expired node-forge exception failure the frozen build has;
`test:migration:rsd-selection` 1,051 pass.

| Artifact (campaign scratch folder)                                                      | sha256                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `builds/best-rn-v2/app-release.apk` (Android probe Release, `art.splotch.app.dev.best`) | `a95722f306a81f46bf8758681a0ded8dcde14c7aaec3d4519f2449b389395ca9`            |
| `builds/best-rn-v2/Splotch.app` (iOS probe Release device app, same ID)                 | App binary `98d9fc005bea850fed4699d1e6134c8a65b8fc3a001d772092a3998a30ab66a0` |

v1's artifacts stay in `builds/best-rn/`. **Devices:** the Galaxy's `art.splotch.app.dev.best` is v2
since 01:03:57 (install -r, data kept; launch, draw, Undo, Clear, Undo of a Clear smoke-checked).
The iPad still has whatever the iPad lanes installed; the orchestrator installs v2 there.
