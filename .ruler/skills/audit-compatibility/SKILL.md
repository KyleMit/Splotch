---
name: audit-compatibility
description: Review the supported browser and OS floor against current usage and Baseline data, check the API risk register in docs/COMPATIBILITY.md against the code, and classify every runtime feature probe in shipped web/src, then file what drifted as findings in docs/AUDIT.md. Use when asked to audit browser compatibility, revisit or raise the browser/OS floor, check the compatibility risk register, or find fallbacks and feature checks a floor makes unnecessary. Changes no code; a floor raise becomes a finding for the vet/fix cycle.
---

# Audit compatibility

Checks three things that drift apart between runs: the **floor** (is it still the right one?), the
**API risk register** in `docs/COMPATIBILITY.md` (does it still describe the code and the engines?),
and the **runtime feature probes** in shipped `web/src` (is each one still needed, and recorded?).
It writes findings and changes nothing else. Read `docs/COMPATIBILITY.md` first; it is the subject
of the audit.

## 1. Collect the evidence

```bash
npm run report:browser-floor
```

The report (`tools/report-browser-floor.mjs`, read-only) prints:

* **Usage.** Global share the declared floor reaches, the Baseline Widely Available floor for
  today's date, and what raising each engine to it would cost. The data is caniuse-lite's global
  numbers, **not Splotch's users**. Splotch has no analytics by design, so the only first-party
  numbers are Play Console and App Store Connect. Only a human can read those, so ask for them when
  a raise is plausible and don't invent a proxy. Note the caniuse-lite version in the header. If it
  is months old, say so in the log entry; don't bump it in this run.
* **Runtime feature probes.** Every `typeof X`, `'x' in navigator`, platform optional chain, and
  optional call to a known platform method in shipped `web/src` (tests, `lib/server`, `routes/api`
  and `routes/dev` excluded), with whether the register cites the file. Guards that name only
  SSR/test globals are counted, not listed.

Look up any feature's Baseline status against the floor with
`npm run report:browser-floor -- --feature <id>` (repeatable). Ids are web-features slugs, not
interface names; a miss prints the ids whose compat keys mention the term (`DOMMatrix` →
`dom-geometry`).

Then find what changed since the last run. The previous run's `docs/AUDIT-LOG.md` entry names its
commit; `git diff <that-sha>..HEAD --stat -- web/src` narrows the rest of this audit to the files
that moved.

## 2. Decide keep or raise

Weigh the report's cost column against the **yield**: the fallbacks, register rows and helpers a
raise would retire, and the enhancements it would unlock. Find the yield by:

* the register's Baseline column: rows marked above floor, and rows whose Behavior cell names the
  floor that retires them;
* version citations in code comments, which mark code a raise could simplify:
  `git grep -n -E "(Chrome|Safari|iOS|Firefox) [0-9]{2,3}" -- web/src`.

Two constraints decide most cases:

* **The web WebKit target cannot pass the native iOS deployment target** (`browserFloor.test.ts`). A
  web Safari/iOS raise is also an iOS app raise, and it drops every device whose last iOS is below
  the new version. Name those devices.
* **The Android OS floor is a separate question.** The WebView updates independently of the OS. Read
  "Why the Android floor is not raised to API 29" in `docs/COMPATIBILITY.md` and only reopen it on
  one of the two triggers it names.

A recommended raise is a **finding**, not an action: title it with the proposed targets, and put the
cost, the yield (as a deletion list), the dropped devices, and "needs an ADR" in it. A keep needs no
finding. Record the numbers and the reason in the log entry.

## 3. Classify each feature probe

Every probe in the report is one of five kinds. Only the last two ever yield a finding by
themselves.

| Kind                   | Test                                                                                                | Action                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Environment guard      | Probes only `window`/`document`/`navigator`/`matchMedia`/`Image`/`Worker`: SSR, workers, unit tests | Leave alone (the report omits these)                       |
| Test-environment guard | Every supported engine has the API, but happy-dom does not                                          | Leave alone; deleting it breaks unit tests, not users      |
| Optional API           | Some supported engine lacks it by design, or it exists only in secure contexts                      | Needs a register row; never retired by a raise             |
| Compatibility fallback | The API ships in a later version of a floor engine                                                  | Needs a register row that names the floor retiring it      |
| Dead guard             | Floor-universal, present in happy-dom, not an SSR path                                              | Finding: delete it, or comment the environment it protects |

Two checks settle most of these:

* **What does happy-dom have?** Don't assume. Drop a throwaway `web/src/zz-probe.test.ts` that
  writes `typeof X` for each candidate to a temp file, run it with `npx vitest run` from `web/`,
  then delete it. Write to a file, because the test reporter swallows `console.log`.
* **Which engine versions support it?** Use `--feature`. **web-features scores the whole feature**,
  every option included, so its version can be later than the one the code needs:
  `createimagebitmap` reads Safari 17.2 while the bare call has worked since Safari 15. When the
  data disagrees with the register, check which part of the feature the code actually uses.

**"Not cited in register" is not a finding by itself.** The register cites the guard, not every use
("`Where` answers where is the guard" in `docs/COMPATIBILITY.md`). A second instance of an existing
row's pattern is correct as it is. So is a deliberate duplicate across a bundle boundary
(`saveFolder.svelte.ts` repeats `folderSave.ts`'s probe on purpose). File one only for a probe with
a distinct guard or behavior that no row describes.

## 4. Check the register against the engines and the code

`tools/tests/compatibility-register.test.mjs` already fails when a `Where` anchor stops matching the
code. It cannot check the other columns, so this step does:

* **Baseline cells.** Look up every row marked above floor, and every row touched by the diff from
  step 1, with `--feature`. Adjacent rows in the same property family are where copied cells hide (a
  `text-wrap: pretty` cell once carried `balance`'s Safari version).
* **Prefixed CSS twins.** For each `-webkit-` declaration
  (`git grep -n -E "\-webkit-[a-z-]+\s*:" -- web/src`), look up the *unprefixed* feature against the
  **Safari** floor. The prefix is load-bearing until the Safari/iOS floor reaches the unprefixed
  version, and Chromium CI never exercises it, so docs that call a twin optional are a real finding.
* **New modern APIs and CSS.** In the files the diff touched, look for platform APIs or CSS features
  that have no row and are not within floor by a wide margin. The report catches JS probes. It does
  not see unguarded CSS or an unguarded call, so read the diff for those.
* **Prose.** The "Polyfills & workarounds" and "How the floor is validated" sections describe
  specific fallbacks and CI jobs; confirm each still exists.

## 5. Check every place that states the floor

| Statement                                                                             | Drift guard                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `web/browserTargets.ts` (`BROWSER_TARGETS` → `build.target`)                          | the source of truth                                  |
| `ios/App/App.xcodeproj/project.pbxproj` → `IPHONEOS_DEPLOYMENT_TARGET` (every config) | `web/src/browserFloor.test.ts` (WebKit target ≤ it)  |
| `MIN_IOS_RELEASE` (`/beta`) and `docs/MOBILE/native.md`                               | `web/src/lib/components/beta/iosBeta.test.ts`        |
| `android/variables.gradle` → `minSdkVersion`, `/beta` Android constants, the doc row  | `tools/mobile/android/tests/android-config.test.mjs` |
| `docs/COMPATIBILITY.md` web tables, `docs/MOBILE/ios.md` web note                     | check by eye unless a guard has since been added     |
| Version citations in code comments                                                    | none; the grep in step 2                             |

`ios/App/CapApp-SPM/Package.swift`'s `.iOS(.v15)` is Capacitor's package lower bound, not the app
floor. Skip it. A statement with no guard that disagrees with `BROWSER_TARGETS` is a finding. So is
a new floor statement that appeared without one.

## Output

Write findings to `docs/AUDIT.md` under `## Source: Compatibility audit`, in the canonical format:
`### [Floor]` for a raise, `[Docs]` for register or prose drift, `[Tests]` for a missing drift
guard, `[Cleanup]` for dead guards. Every finding cites the report output or `--feature` line that
proves it in `#### Verification`, with the web-features version when a Baseline fact is the
evidence.

## Shared audit conventions

This is an audit skill. Follow the shared conventions in
[`.claude/audit-conventions.md`](../../../.claude/audit-conventions.md):

* **Merge into `docs/AUDIT.md`, don't overwrite** (§1). Enrich existing items, add new ones, drop
  fixed ones.
* **Log the run** (§2). The `docs/AUDIT-LOG.md` entry records the commit audited, the keep-or-raise
  call with its coverage numbers, the caniuse-lite and web-features versions, and the findings. The
  next run diffs from that commit.
* **Self-heal** (§3). If this run surfaced a durable method learning (a new false-positive shape, a
  data-source quirk), fold it into this file. A deterministic check you did by hand belongs in
  `tools/report-browser-floor.mjs` with a test in `tools/tests/report-browser-floor.test.mjs`.
