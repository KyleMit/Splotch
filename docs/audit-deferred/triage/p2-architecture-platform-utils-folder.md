# Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**Priority/category:** P2[architecture] · **Cluster:** C12 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`,
`orientation.ts`, `safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**FIX — clear winner.** Move the cluster to `web/src/lib/platform/` with `index.ts` carrying the
current `platform.ts` exports (so the `$lib/platform` specifier and its 21 importers don't change),
siblings imported by full path, and — the part the failed attempt could not finish — regenerate the
ruler output so the Codex architecture mirror isn't left stale. The design already survived
implementation; only the environment killed it.

## Original finding (condensed)

Seven closely related "what device/platform am I on and how do I adapt" modules sit loose in the
`lib/` root among unrelated utilities. They form a natural import cluster (`deviceInfo`,
`orientation`, `haptics`, `notchBand` all lean on `platform.ts`; `safeArea` feeds
`notchBand`/layout), but answering "where does the app detect iOS / read insets / lock rotation?"
requires already knowing each filename. Proposal: group them under `lib/platform/` (or `device/`)
with an index re-export; pure move, no behavior change.

## Why it was deferred

Implementation *succeeded* functionally — cluster moved, consumers and tests rewired, the `.ruler/`
architecture source updated — but the sandbox could not write `.agents/skills/` when running
`npm run ruler:apply`, so the generated Codex mirror of the architecture skill stayed stale and the
change was rolled back rather than land with drifted generated output (which `npm run ruler:check`
gates in CI). An environmental blocker, not a design objection.

## Current state of the code

The finding fully holds at HEAD: all seven files still sit loose in `web/src/lib/` (confirmed by
listing), alongside topic folders that already exist for other clusters (`pwa/`, `plugins/`,
`boot/`, `audio/`, `ai/`, `design/`, …) — `updates.ts` itself moved into `lib/pwa/` since the pin,
so the repo is actively converging on this layout. Import churn measured at HEAD: `$lib/platform`
has 21 importers; the six siblings total ~15 (`deviceInfo` 1, `deviceReport` 4, `orientation` 2,
`safeArea` 3, `haptics` 3, `notchBand` 2). The `architecture` skill's file map lists only
`platform.ts` and `orientation.ts` — the other five are entirely absent, which strengthens the
grepability claim (the map won't help you find them either).

## Options considered

1. **`lib/platform/` with a detection-only `index.ts` (winner).** `platform.ts` becomes
   `platform/index.ts` verbatim; `$lib/platform` keeps resolving for all 21 importers with zero
   edits. Siblings move to `platform/deviceInfo.ts` etc. and their ~15 import sites update to
   `$lib/platform/<name>`. Colocated tests move along. Deliberately *not* an everything-barrel:
   re-exporting `orientation.ts` from the index would route `state/settings` → `storage` →
   `$lib/platform` → `orientation` → `state/settings` into an import cycle (`orientation.ts` imports
   `$lib/state/settings.svelte`). Detection-only index avoids that class of cycle entirely.
2. **Same move, folder named `device/`.** Rejected: `$lib/platform` is the established specifier (21
   importers, ADR-0013, the CLAUDE.md src map, and the `Platform` type all say "platform");
   `device/` would force edits at every one of those sites for a name that is no more accurate.
3. **Status quo + complete the `architecture` skill file map instead.** Cheaper, and the map
   *should* list all seven files regardless — but rejected as the resolution: it fixes the skill,
   not the grep (`ls web/src/lib` and editor fuzzy-find still interleave the cluster with
   `idle.ts`/`storage.ts`/`imagePrefetch.ts`), and the finding's brief explicitly accepts the
   one-time churn.

Membership judgment calls, decided: include `deviceReport.ts` — it is the client/server-shared shape
of device info (imported by `/api/report`), and server code importing `$lib/platform/deviceReport`
is fine since the module is deliberately dependency-free; keeping it beside `deviceInfo.ts` (which
imports its type) beats stranding it. Include `haptics.ts` — it is "adapt output to the platform"
and imports `platform.ts`.

## Recommendation

Redo the validated move in an environment where `npm run ruler:apply` can write both generated trees
(a normal checkout can). Concretely: `git mv` the seven modules (+ their colocated `*.test.ts`
files: `platform.test.ts`, `platform.osLabel.test.ts`, `deviceReport.test.ts`, `safeArea.test.ts`,
`notchBand.test.ts`) into `web/src/lib/platform/`, rename `platform.ts` → `platform/index.ts`,
update the ~15 sibling-import sites, update the `.ruler/` sources (the architecture skill's file map
— adding the five currently-missing modules while there — and the `web/src/.ruler/AGENTS.md` line
that names `lib/platform.ts`), run `npm run ruler:apply`, and commit the regenerated output.
Verification: `npm run check`, `npm test`, and `npm run
ruler:check` green — the last one is
precisely the gate the failed attempt could not satisfy.

Sequencing within C12: land the Orientation-type patch (see `p2-duplication-orientation-type.md`)
**before** this move — that draft patches `web/src/lib/platform.ts` by path and stops applying once
the file is renamed. This move then carries the canonical `Orientation` export along into
`platform/index.ts` with no further edits, and the `$lib/platform` import specifier in all its
consumers survives unchanged.

## Suggested next step

Re-stage in `docs/AUDIT.md` as the move described above, with an explicit acceptance criterion of
`npm run ruler:check` passing (the recorded failure mode), and ordered after the Orientation-type
patch lands.
