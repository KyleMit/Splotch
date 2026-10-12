# Personal device identifiers are hard-coded into committed scripts

**Original finding:** [P3][maintainability] — `package.json` scripts `android:run:device`,
`ios:run:emulator`, `ios:run:device` — deferred because the burndown attempt (which deleted the
scripts and updated the mobile guidance) hit a sandbox that could not write the generated
`.agents/skills/mobile` mirrors during `ruler:apply`. **Verdict:** FIX for the physical pins
(reopened and implemented by issue #1645); DROP stands for the simulator pin.

## Reopened 2026-09-06 by issue #1645

Two of the DROP's premises went stale. The pinned `ANDROID_SERIAL` named the SM-S938U1 phone, but
every committed physical-Android matrix target is the SM-G990U1 — the pin no longer anchored the
matrix to its hardware. And #1645 (the identifier-scrub follow-up to #1643) made committed
physical-device identifiers a privacy defect, not just a portability nit: the scrub removes every
tracked hardware identifier and adds `check:device-identifiers` to keep them out, which forbids the
committed literals this record had accepted.

The remediation is close to the original option 1, minus the committed fallback: `run-on-device.mjs`
wrappers (`tools/mobile/android/`, `tools/mobile/ios/`) resolve the sole attached physical device
dynamically and fail with guidance on ambiguity, with `ANDROID_SERIAL` / `IOS_UDID` as explicit
overrides. The zero-config single-device desk workflow is preserved without a committed serial.
`ios:run:emulator`'s pinned simulator UDID stays: a simulator UUID identifies no physical hardware,
the guard does not match it, and the original DROP reasoning still applies to it.

The section below is the superseded 2026-08 analysis, kept for its option survey.

## Context

Three npm scripts pin one developer's hardware: `ANDROID_SERIAL=[redacted]` (the SM-S938U1 phone),
`cap run ios --target C6012C49-…` (a simulator UDID), and `cap run ios --target 00008103-…` (the
physical iPad). The finding argued these are personal config committed to the shared `package.json`,
dead for any other contributor or CI, and proposed env-var resolution through the Node helpers, a
gitignored overrides file, or — at minimum — documenting the literals as placeholders. The prior
attempt's failure was environmental (the `.agents/` write denial), not a review verdict, so the
question here is whether any remediation is actually an improvement.

## Current state

Verified at HEAD (`package.json` scripts block and `scripts-info`):

* The pinned variants sit beside portable, generically named siblings: `android:run` targets
  whatever device/emulator adb sees, and `ios:run` prompts to choose a simulator or device. Anyone
  who is not the repo owner already has a working, documented path.
* The finding's "at minimum" fallback is already implemented. `scripts-info` labels
  `android:run:device` with the serial, when to use it ("when an emulator is also connected"), and
  the discovery command ("find your serial with `adb:devices`"); `ios:run:emulator` says "use
  ios:run to pick a device"; `ios:run:device` names the personal device outright and points at the
  mobile guide. Nothing masquerades as portable.
* The pinned scripts are load-bearing references: `.ruler/skills/mobile/android.md` prescribes
  `npm run android:run:device` as the fix for adb's "more than one device/emulator" error, and
  `.ruler/skills/capture-performance-matrix/references/platforms.md` uses both pinned run commands
  so performance-matrix captures land on the exact devices the committed matrix
  (`scrapbook/performance/`) was recorded against. Pinning known hardware in a named script is what
  keeps those snapshots comparable — it is a feature here, not an accident.

## Options considered

1. **Env var with the current serial as committed fallback** (resolution in `scripts/gradle.mjs` or
   a wrapper, since the helpers are Node and portable). The personal serial stays committed — the
   finding's core complaint survives intact — and the only user's behavior is unchanged. Pure
   indirection.
2. **Env var with no fallback.** Removes the serial from the repo but breaks the zero-config
   workflow of the repo's only regular user and every skill reference to the pinned commands; each
   machine then needs shell configuration to restore what a committed literal already provides.
3. **Gitignored local overrides file.** npm has no native script-override mechanism, so this means
   wrapper scripts plus a config format plus documentation — machinery serving hypothetical
   contributors who already have `android:run` / `ios:run`.
4. **Delete the pinned scripts** (the prior attempt). Removes working tooling and orphans the mobile
   and capture-performance-matrix skill references. Wrong on the merits, independent of the sandbox
   failure that stopped it.
5. **Resolve simulator by name at runtime** (helper mapping "iPad mini (A17 Pro)" → UDID via
   `xcrun simctl list --json`). Makes `ios:run:emulator` machine-portable, but it is macOS-only glue
   solving a portability problem no second machine currently has.

## Decision / lean

DROP. This is a solo-maintainer repo, and the `:device`/`:emulator` variants are deliberate
convenience pins for the owner's real desk — the multi-device disambiguation problem
`ANDROID_SERIAL` exists to solve. Portable siblings cover everyone else, `scripts-info` already
discloses exactly what the pins are and how to derive your own, and the pins anchor the committed
performance matrix to reproducible hardware. Every candidate remediation either keeps the serial
committed (1), degrades the sole user's workflow (2, 4), or adds machinery with no present
beneficiary (3, 5). If the project ever gains regular second contributors with their own device
labs, option 1 or 3 becomes worth revisiting; until then the current state is the right shape.

## Why the previous attempt failed, and how this path avoids it

The attempt failed environmentally — the sandbox denied writes to the generated
`.agents/skills/mobile` tree during `ruler:apply`, leaving the mirrors stale. That blocker does not
exist in this session, but the approach it was delivering (deletion) is rejected on substance above.
DROP touches no generated trees at all.
