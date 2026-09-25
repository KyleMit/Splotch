# First hand-run compatibility audit — 2026-09-25

The phase 1 log for issue #2327: one compatibility audit run by hand at main 7a0a52798, recorded so
the `audit-compatibility` skill could be written from what the run actually needed rather than from
theory. The findings it produced are staged in `docs/AUDIT.md` under
`## Source: Compatibility audit`; this note is the working behind them.

## Decision: keep the floor

The floor stays at Chrome/Edge 111, Firefox 114, Safari/iOS 16.4 (web) and API 24 (Android).

| Candidate                                      | Global users reached | Cost vs the current floor |
| ---------------------------------------------- | -------------------- | ------------------------- |
| Current floor                                  | 90.24%               | —                         |
| Safari + iOS to 17.4 only                      | 89.61%               | 0.63%                     |
| Safari + iOS to 18                             | 89.13%               | 1.11%                     |
| Baseline Widely Available (123/123/124/17.4)   | 86.93%               | 3.31%                     |
| Chrome 111 → 123 alone (inside the line above) | —                    | 1.66%                     |

Source: `browserslist --coverage` over caniuse-lite 1.0.30001810 (installed package data dated
2026-09-01). The percentages are shares of all tracked users, so the "reached" column cannot reach
100% even with no floor: every version of the five floor engines together is 93.02%.

Why keep:

* **The yield is small.** A Safari/iOS 17.4 raise would retire `lib/promiseWithResolvers.ts` (three
  callers) and nothing else load-bearing. `light-dark()` (the duplicated dark-token block in
  `tokens.css`) and `text-wrap: balance` both need 17.5, and `backdrop-filter` unprefixed needs 18.
* **The web floor drags the native floor with it.** `browserFloor.test.ts` requires the web
  Safari/iOS target to stay at or below `IPHONEOS_DEPLOYMENT_TARGET`, so a web raise to 17.4 forces
  the iOS app to 17.4 and drops iPhone 8, 8 Plus and X, whose last release is iOS 16. The Android
  section of `docs/COMPATIBILITY.md` already records that this audience skews toward retired
  household devices.
* **The raise would cost global users for no user-visible gain**, and Chrome desktop is the costly
  engine (1.66%) while contributing no deletable code.

What would change the answer: App Store Connect showing iOS 16 negligible among *Splotch's*
installs, or a load-bearing feature (not an enhancement) that needs a newer engine. Splotch collects
no analytics by design (`/privacy`: "no analytics"), so no first-party web usage data exists; the
store consoles are the only first-party source and need a human with console access.

## Sources used, and what each can and cannot answer

* **caniuse-lite through browserslist** (installed; `npm run report:browser-floor` wraps it). Global
  StatCounter-derived shares. Answers "how many people does a floor exclude worldwide"; says nothing
  about Splotch's audience. The data is as fresh as the installed package — check its version in the
  report header before quoting a number.
* **web-features** (installed as a devDependency for the report). Baseline status and per-engine
  first-support versions for a named feature. Ids are feature slugs, not interface names:
  `DOMMatrix` is `dom-geometry`, `caches` is inside `service-workers`. The report suggests ids for a
  miss.
* **Play Console → Statistics / App Store Connect → Analytics.** The only Splotch-specific usage
  numbers. Human-only; the audit cannot fetch them.

## Where the floor is enforced, and what guards each

| Statement                                                      | Guarded by                                           |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `web/browserTargets.ts` → `build.target`                       | the source of truth                                  |
| WebKit web target ≤ `IPHONEOS_DEPLOYMENT_TARGET` (pbxproj ×4)  | `web/src/browserFloor.test.ts`                       |
| `MIN_IOS_RELEASE` (`/beta`) = pbxproj; `docs/MOBILE/native.md` | `web/src/lib/components/beta/iosBeta.test.ts`        |
| `android/variables.gradle` → `minSdkVersion`, `/beta` Android  | `tools/mobile/android/tests/android-config.test.mjs` |
| `docs/COMPATIBILITY.md` Android enforcement row                | `android-config.test.mjs`                            |
| `docs/COMPATIBILITY.md` web tables (supported + enforcement)   | **nothing** — finding filed                          |
| `docs/MOBILE/ios.md` web floor note                            | **nothing** — part of the same finding               |
| Register `Where` anchors                                       | `tools/tests/compatibility-register.test.mjs`        |
| Register Baseline cells                                        | **nothing** — by design; the audit is the check      |
| Code comments citing a version ("needs Chrome 123 / Safari…")  | nothing; grep for them when a raise is on the table  |

`ios/App/CapApp-SPM/Package.swift` `.iOS(.v15)` is the Capacitor package lower bound, not the app
floor — a false positive to skip.

## Classifying the runtime probes

The first grep found about 60 `typeof`/`in`/`?.` sites in `web/src`; most were type narrowing
(`typeof value === 'object'`) or app callbacks (`callbacks.onStrokeEnd?.()`). The report narrows
that to 37 feature probes plus 24 environment guards and sorts them. The categories that emerged:

1. **Environment guards** — probe only `window`/`document`/`navigator`/`matchMedia`/
   `requestAnimationFrame`/`Image`/`Worker`. They exist for SSR, workers, or the unit tests. Leave
   alone; the report omits them.
2. **Test-environment guards on floor-universal APIs** — `typeof AudioContext`,
   `'fonts' in document`, `typeof Worker`. Every supported engine has these, but happy-dom does not,
   so the guard keeps unit tests running. They look deletable and are not. Check happy-dom before
   calling one dead: a throwaway `web/src/zz-probe.test.ts` that writes `typeof X` for each global
   to a temp file answers it in seconds (console output is swallowed by the reporter).
3. **Optional-API guards** — APIs that some supported engine lacks by design, or that exist only in
   secure contexts: `wakeLock`, `navigator.locks`, `showDirectoryPicker`, `getCoalescedEvents`,
   `requestIdleCallback`, `navigator.connection`, `caches`, orientation lock. Never deleted by a
   floor change; they belong in the register.
4. **Compatibility fallbacks** — the API exists at some newer version; the fallback serves engines
   between the floor and that version: `startViewTransition` (Safari 18), `OffscreenCanvas` paths,
   the `-webkit-` mask and backdrop-filter twins, `@property`. These are what a floor raise retires;
   each should have a register row saying which floor would.
5. **Dead guards** — floor-universal API, present in happy-dom too, not an SSR guard:
   `typeof DOMMatrix` and `typeof createImageBitmap` in the readback path. Finding filed.

A "no" in the report's register column is not a finding by itself: the register cites the guard, not
every use, so a second instance of an existing row's pattern (`layout.svelte.ts` reading
`screen.orientation`, `saveFolder.svelte.ts` repeating `folderSave.ts`'s probe across a deliberate
bundle boundary) is correct as it is.

## Judgment calls and false positives

* **web-features scores whole features.** `createimagebitmap` shows Safari 17.2, but the base call
  has worked since Safari 15; the later version covers options the app does not pass. When
  web-features disagrees with a register cell, check which part of the feature the code uses before
  calling the register wrong.
* **The text-wrap-pretty cell really was wrong** (Safari 17.5 in the register, Safari 26 in the
  data); it looked copied from the balance row. Adjacent rows that share a property family are where
  this happens.
* **Prefixed CSS twins need their own lookup.** The docs called `-webkit-backdrop-filter` optional
  at the floor; the unprefixed property is Safari 18. Look up every `-webkit-` declaration's
  unprefixed feature against the Safari floor, not the Chrome one.
* **`anchor-positioning`** reports only Safari 27 as supporting it (web-features 3.39.0) while the
  register says Chrome 125 / Firefox 147 / Safari 26. The feature is not used and its row only
  records why it was not adopted, so the mismatch was left alone rather than chased; a
  Baseline-`false` feature's engine list is the least reliable cell to compare.
* **browserslist's `baseline widely available`** resolves against today's date, so the Baseline
  column in the report moves on its own between runs. That is the point, but note the date.

## What was not done

No floor change, no code change beyond the report tool, and no issue was filed; the findings go
through `vet-audits` like every other producer's.
