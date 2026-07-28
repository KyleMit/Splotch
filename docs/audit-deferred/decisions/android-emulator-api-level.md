# Android emulator API level is a second source of truth for the `Pixel_7_Pro_API_33` AVD

**Original finding:** [P3][consistency] — `.github/workflows/android-deploy.yml:58-64` (pinned at
f934d43 as :70-74), `scripts/lib/android.mjs`, `scripts/android-setup.mjs`, `package.json` —
deferred because the implementer failed to deliver a fix round against escalating review objections.
**Verdict:** FIX

## Context

The finding: the Android emulator API level "33" lives in two unrelated places — the CI workflow's
emulator-runner input (`api-level: 33`) and the local tooling's AVD name (`Pixel_7_Pro_API_33` in
`scripts/lib/android.mjs`, plus `android-33` system-image strings in `scripts/android-setup.mjs`). A
bump to API 34 must be made in both or CI and local silently diverge. Secondarily, the workflow's
`emulator-options` value (`-no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none`)
is an undocumented magic string.

The burndown draft (kept at
`docs/audit-deferred/p3-consistency-android-emulator-api-level-is-a-second-source-of-truth-fo.patch`)
introduced `ANDROID_API_LEVEL` in `scripts/lib/android.mjs`, derived `AVD_NAME` and the system-image
strings from it, rewrote the three `android:*` npm scripts to shell out to a new
`scripts/android-avd-name.mjs` via `$(node …)`, and added a CI step that runs Node to read the
constant and feed it to the runner input via `$GITHUB_OUTPUT`.

The reviewer's three unresolved objections:

1. The `emulator-options` magic string is still undocumented — add a brief per-flag explanation.
2. Hard-coded "API 33" / `Pixel_7_Pro_API_33` references remain in
   `scripts/android-emulator-smoke.mjs:10` (header comment), the `scripts-info` descriptions in
   `package.json`, and the `.ruler`-authored mobile/testing guidance — so changing
   `ANDROID_API_LEVEL` still leaves user-facing instructions stale.
3. No test exercises the single-source invariant across `ANDROID_API_LEVEL`, the derived AVD
   name/package commands, local system image, and the workflow input — the exact regression this
   finding targets stays unguarded.

## Current state

Verified at HEAD (63a7aa49): the problem is fully intact, nothing was fixed since f934d43.

* `.github/workflows/android-deploy.yml:60` — `api-level: 33`, `target: google_apis`,
  `arch: x86_64`, and the undocumented `emulator-options` string.
* `scripts/lib/android.mjs:10` — `export const AVD_NAME = 'Pixel_7_Pro_API_33';` (no API-level
  constant exists).
* `scripts/android-setup.mjs:14` and `:53` — literal `android-33` in the system-image ID and the
  image-directory path; header comment says "API 33".
* `package.json:103-105` — three `android:*` scripts with the literal AVD name; `scripts-info`
  entries at :229-231 name "API 33" / `Pixel_7_Pro_API_33`.
* Prose references in `.ruler/skills/mobile/android.md:51` and
  `.ruler/skills/testing/SKILL.md:273,287,291` (mirrored into `.claude/` and `.agents/` by ruler),
  plus `docs/COMPATIBILITY.md:134`.

Two structural facts that shaped the failed review and must anchor any fix:

* **A workflow YAML cannot import a JS constant.** True single-sourcing across CI and local is
  impossible without either a generation step or a runtime bridge (the draft's extra CI step). The
  reviewer kept demanding "single source" while the medium forbids it.
* **CI and local do not even use the same image.** CI runs `google_apis`/x86_64; local setup
  installs `google_apis_playstore` with an arch-dependent ABI. The only genuinely shared value is
  the API-level *number* — which is also baked into the user-facing AVD identity
  (`Pixel_7_Pro_API_33`), so a truly "version-neutral" presentation is unattainable without renaming
  the AVD scheme.

Related: `docs/AUDIT.md:165` holds a separate open P3 finding ("AVD name `Pixel_7_Pro_API_33` is
hard-coded across four scripts") whose verification is `grep -c Pixel_7_Pro_API_33 package.json`
returning 0. The fix below supersedes that framing (see Decision); whoever drains it should point it
at this doc.

## Options considered

**(a) Full single-source + derivation (the draft's path, completed).** Derive everything at runtime:
`AVD_NAME` from `ANDROID_API_LEVEL`, npm scripts via `$(node scripts/android-avd-name.mjs)`, a CI
step piping the constant into the runner input, version-neutral prose everywhere, plus the invariant
test.

* Pros: one edit truly changes everything mechanical.
* Cons: an extra CI step and a Node subprocess per `android:boot`/`android:emulator`/`android:live`
  invocation purely to print a string; `package.json` scripts become unreadable
  (`emulator -avd $(node …)` — you can no longer see which AVD a script targets, and `npm run info`
  descriptions go vague); prose can never be derived anyway, so objection 2's tail (skills,
  `scripts-info`) still needs manual edits or awkward version-neutral wording that strips real
  documentation value ("the AVD" vs. the exact name a dev must pick in Android Studio). This is the
  path that already failed twice — each derivation layer exposed another literal the reviewer then
  demanded be derived too.

**(b) Literal values + enforced drift test ("checked invariant").** Keep the readable literals where
readers benefit from them (workflow YAML, npm scripts, skill prose), declare `ANDROID_API_LEVEL` in
`scripts/lib/android.mjs` as the *named* canonical source, derive only what JS can cheaply derive
(`AVD_NAME`, the system-image strings in `android-setup.mjs`), and add a small Vitest file in
`scripts/tests/` that fails whenever any enforced file's literal disagrees with the constant.
Document the `emulator-options` flags in the workflow.

* Pros: equal protection against divergence (the test *is* the single source — CI goes red on any
  stale reference, including the prose ones no derivation scheme can reach); zero runtime cost; npm
  scripts and workflow stay grep-able and readable; smallest diff.
* Cons: a bump is still a multi-file edit (constant + workflow line + npm scripts + two `.ruler`
  files) — but the test converts "must remember every site" into "run `npm test`, fix what's red",
  which is the actual risk being bought down.

**(c) DROP, keeping only the flags comment.** The value changes maybe once every 1–2 years, the AVD
name bakes the API level into user-facing identity anyway, and a mismatched bump would likely be
noticed quickly.

* Pros: near-zero cost.
* Cons: forfeits objection 3's real point — the divergence failure mode is silent (CI would happily
  smoke-test API 33 while local tests API 34, and nothing flags it); the drift test in (b) is ~40
  lines and permanently closes the question. Given the repo already has a `scripts/tests/` harness
  wired into CI, (b)'s marginal cost is too low for DROP to win.

Ranking: **(b) > (c) > (a)**.

## Decision / lean

**FIX — option (b).** Concretely:

1. **`scripts/lib/android.mjs`** — add the constant and derive the AVD name (this slice of the draft
   was clean and is reused verbatim):

   ```js
   export const ANDROID_API_LEVEL = 33;
   export const AVD_NAME = `Pixel_7_Pro_API_${ANDROID_API_LEVEL}`;
   ```

2. **`scripts/android-setup.mjs`** — import `ANDROID_API_LEVEL` and template the two `android-33`
   strings (system-image ID and image-dir path), as in the draft. Make the header comment
   version-neutral ("installs the Play-Store system image for the API level in
   `scripts/lib/android.mjs`").

3. **`scripts/android-emulator-smoke.mjs:10`** — reword the header comment to reference
   `AVD_NAME`/`android:setup` instead of the literal name (it already imports `AVD_NAME`; the
   comment is the only literal).

4. **`.github/workflows/android-deploy.yml`** — keep `api-level: 33` as a literal, preceded by a
   two-part comment: (i) "must match `ANDROID_API_LEVEL` in `scripts/lib/android.mjs` —
   `scripts/tests/android-config.test.mjs` enforces this" and (ii) one line per `emulator-options`
   flag:

   ```yaml
   # Keep in sync with ANDROID_API_LEVEL in scripts/lib/android.mjs
   # (enforced by scripts/tests/android-config.test.mjs).
   api-level: 33
   ...
   # -no-snapshot-save: throwaway VM — never persist state between runs
   # -no-window: headless (no display on the CI runner)
   # -noaudio / -no-boot-anim: skip audio init and boot animation for faster boot
   # -camera-back none: no camera emulation (unused by the app; avoids extra init)
   emulator-options: -no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none
   ```

5. **`package.json`** — leave the three `android:*` scripts and their `scripts-info` entries with
   the literal name (readability wins; the test guards them). No `$(node …)` subshells, no
   `android-avd-name.mjs` helper.

6. **New `scripts/tests/android-config.test.mjs`** (name flexible; runs under the existing
   `test:scripts` Vitest config, so it is in CI via `npm test`) — the invariant test:

   ```js
   import { readFileSync } from 'node:fs';
   import { describe, expect, it } from 'vitest';
   import { ANDROID_API_LEVEL, AVD_NAME } from '../lib/android.mjs';

   const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

   // Files allowed to carry the literal API level / AVD name. Anything listed
   // here goes red the moment it disagrees with ANDROID_API_LEVEL.
   const ENFORCED = [
     'package.json',
     '.github/workflows/android-deploy.yml',
     '.ruler/skills/mobile/android.md',
     '.ruler/skills/testing/SKILL.md',
     'docs/COMPATIBILITY.md',
   ];

   describe('Android API level single source', () => {
     it('derives the AVD name from ANDROID_API_LEVEL', () => {
       expect(AVD_NAME).toBe(`Pixel_7_Pro_API_${ANDROID_API_LEVEL}`);
     });

     it('workflow api-level input matches', () => {
       const yml = read('.github/workflows/android-deploy.yml');
       expect(yml.match(/api-level:\s*(\d+)/)[1]).toBe(String(ANDROID_API_LEVEL));
     });

     for (const file of ENFORCED) {
       it(`${file} carries no stale AVD/API-level literals`, () => {
         const text = read(file);
         for (const [, n] of text.matchAll(/Pixel_7_Pro_API_(\d+)/g)) {
           expect(Number(n)).toBe(ANDROID_API_LEVEL);
         }
         for (const [, n] of text.matchAll(/\bAPI (\d\d)\b/g)) {
           expect(Number(n)).toBe(ANDROID_API_LEVEL);
         }
       });
     }
   });
   ```

   Deliberately an explicit allowlist, not a repo-wide grep: historical documents (`docs/AUDIT*.md`,
   `docs/audit-deferred/**`, `docs/DEPENDENCIES.md`, `/scrapbook`) legitimately mention old values.
   Only `.ruler/` sources are enforced, not the generated `.claude/`/`.agents/` mirrors —
   `npm run ruler:check` already gates mirror drift.

7. **`scripts-info` for `test:scripts`** in `package.json`: extend the one-line description to
   mention the new Android-config invariant (ADR-0019 requires descriptions to track reality).

Tradeoff accepted by the owner: an API-level bump remains a ~5-file edit rather than a one-line
edit. What is bought is that a *partial* bump can no longer ship — the exact silent-divergence risk
the finding named — at zero runtime/CI-step cost and with no readability loss in `package.json` or
the workflow.

The overlapping open finding at `docs/AUDIT.md:165` (AVD name hard-coded in package.json, with "grep
count reaches 0" as its verification) should be re-verified against this decision when vetted: its
proposed mechanism (`$(node …)` interpolation) is rejected here as option (a); its underlying risk
is covered by the same drift test. Recommend closing it as superseded once this fix lands.

## Why the previous attempt failed, and how this path avoids it

The draft failed because it chose derivation, and derivation cannot reach YAML or prose — so every
review round surfaced another literal that the chosen mechanism could not absorb, and the
implementer ran out of rounds. The checked-invariant approach flips the mechanism: literals stay,
the test absorbs them all.

* **Objection 1 (undocumented `emulator-options`)** — resolved directly by step 4's per-flag
  comments. Cheap and clearly right; would be worth doing even under DROP.
* **Objection 2 (stale literals in smoke-script comment, `scripts-info`, `.ruler` guidance)** — the
  smoke-script comment is reworded to be version-neutral (step 3); `scripts-info` and the two
  `.ruler` skill sources *keep* their concrete names — the exact string a developer must type or
  select is documentation value, and "version-neutral" wording would degrade it — but all of them
  are in the test's enforced list, so they can no longer go stale silently. The objection's demand
  is thus satisfied by enforcement rather than by neutralization; the neutralize-everything reading
  is ruled out of scope as it strips useful specificity without adding safety the test doesn't
  already provide.
* **Objection 3 (no invariant test)** — resolved directly by step 6, and more broadly than the
  reviewer asked: the test also covers the prose references from objection 2, which no
  derivation-based design could.

## Implementation sketch

Covered inline above (steps 1–7). Reusable from the draft patch: the `scripts/lib/android.mjs` hunk
verbatim, and the `scripts/android-setup.mjs` hunks minus nothing. Discard from the draft: the CI
`$GITHUB_OUTPUT` bridge step, `scripts/android-avd-name.mjs`, and the `package.json` script
rewrites. Estimated size: ~80 lines total including the test.

## Post-merge addendum (2026-07-28, after PR 583 merged)

PR 583 independently implemented the `package.json` neutralization half of this decision: the three
`android:boot`/`android:emulator`/`android:live` scripts now delegate to a new
`scripts/android-emulator.mjs` that imports `AVD_NAME` from `scripts/lib/android.mjs`, so the
committed AVD-name literals in `package.json:103-105` are gone (the enumeration above predates
this). The rest of the decision is unchanged and still needed: `AVD_NAME` remains a hard-coded
composite in `android.mjs`, `scripts/android-setup.mjs` still carries two `android-33` system-image
literals, the workflow still pins `api-level: 33` with the undocumented `emulator-options` string,
and no drift test exists. Steps 1–7 apply as written minus the `package.json` items; the drift
test's enforced-file list should still include `package.json` (it guards against literals coming
back).
