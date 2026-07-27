# Handoff — audit burndown (183 findings remaining)

> 2026-07-27 · branch `claude/burn-down-audit-skill-hidj17` · PR
> [#552](https://github.com/KyleMit/Splotch/pull/552) · Resume the bulk burndown of `docs/AUDIT.md`
> — 236 → 183 done, PR marked ready, relaunch to continue.

## Current state — wrapped up, resumable

Wrapped on request after **47 fixed · 4 deferred · 2 dropped** (backlog 236 → 183). PR 552 is out of
draft; the branch is pushed and the working tree is clean. **Nothing is in flight** — relaunch with
the command below to continue, or open a fresh PR from the same branch.

Reconciled from git rather than a `finished:` line, because run 2 was stopped mid-finding:

```
deferred=4  dropped=2  consumed=53  =>  fixed=47      236 - 53 = 183 = pop.mjs --count ✓
```

The last finding (`[P3][naming] Brand palette hex values hardcoded in generators`) was abandoned
mid-implementation when a transient `aborted_streaming` hit the implementer and the STOP file took
effect during the retry backoff. Its entry was never removed, so it is **intact in the backlog** and
will simply be re-processed. Its partial, unreviewed work was discarded.

> One diagnostic trap worth knowing: every role's `.err` log carries
> `this workspace has not been trusted`, which the skill lists as the signature of a systemic
> trust-loss failure. Here it is **benign noise** — byte-identical in a role that succeeded minutes
> earlier. Always compare a failing role's `.err` against a *successful* one before believing it.

## Objective & non-goals

Drive `scripts/audit-burndown/burndown.mjs` over the whole staged backlog: one commit per verified
fix, deferrals to `docs/AUDIT-DEFERRED.md`, invalid findings dropped. **Non-goals:** filing GitHub
issues per finding (that is `/vet-audits`, impractical at this size), and any hand-editing of
`docs/AUDIT.md` (only `pop.mjs` touches it).

## Relaunch command — use this verbatim

```bash
BRANCH=claude/burn-down-audit-skill-hidj17 \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
budgets 3/4/3). No helper script backs any knob — the two overrides above are literal strings, so
nothing here depends on a file in gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/burn-down-audit-skill-hidj17`. Preflight echoes `branch: <name>` — read that line and match
it before launching.

### Why the two gate overrides

`CHECK_CMD` and `TEST_CMD` are widened past their defaults to cover the repo's bespoke CI gates,
which no per-finding type-check or unit run can see. Measured cost on this container:

| Gate                    | Cost  | Why it is in the gate                                          |
| ----------------------- | ----- | -------------------------------------------------------------- |
| `lint:tokens`           | 0.2 s | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | 0.3 s | Token-generation drift                                         |
| `scrapbook:check`       | 0.2 s | Free                                                           |
| `img:audit:check`       | 1.0 s | Image ratchet                                                  |
| `check:assets:manifest` | 6.3 s | Asset-manifest drift                                           |
| `test:scripts`          | 1.0 s | A finding touching `scripts/` breaks this and nothing else     |

Deliberately **excluded**: `format:check` (~23 s; already covered by the `format-edited-file.sh`
PostToolUse hook firing inside each `claude -p`) and `ruler:check` (it *writes* files — a mutating
gate would land its output in the fix commit). A finding editing `.ruler/**` must run
`npm run ruler:apply` itself; nothing enforces that.

## State

* Base: 522970ba1e43 (`origin/main` at launch). Branch forked clean from it.
* Backlog at launch: **236** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Unverified assumptions

All three of the original assumptions were **tested against the canary and confirmed** — see below.
What remains unverified is only whether they keep holding on the P1–P3 findings, which run on Opus
rather than the cheap tier and are where the canary gave no signal.

## Done & verified

* `npm run audit:preflight` → PREFLIGHT OK, `branch: claude/burn-down-audit-skill-hidj17`.
* Every gate script above run at base and passing (exit 0), so a red gate mid-run is attributable to
  a finding rather than pre-existing.

### Canary — 5 fixed, 0 dropped, 0 deferred, 28 min, $8.48

| sha          | finding                            | P  | rounds | elapsed |
| ------------ | ---------------------------------- | -- | ------ | ------- |
| a193d1f7cd64 | Scorer JSDoc typedefs              | P4 | 1      | 8.7 min |
| 6ddec6cd3a54 | `ringBands` incremental dilation   | P4 | 0      | 4.1 min |
| cb3a25dceee3 | Hotspot tile constants / key pack  | P4 | 0      | 4.2 min |
| dcfd789a9cf6 | `alignToSource` edge cutoff const  | P4 | 0      | 4.2 min |
| afb1601f21f1 | Centralize backslash normalization | P4 | 0      | 6.9 min |

* **Entry accounting exact.** Each fix commit deleted exactly one `###` entry (the one intermediate
  fix-round commit deleted zero, as designed). Identity closes: 236 − 5 = 231 = `pop.mjs --count`.
* **Resume handoff confirmed** on iter0001. impl left `bandStats`/`hotspots` as bare `object[]`;
  review rejected exactly that; fix1's summary says "replacing the bare `object[]` placeholders" —
  it is continuing its own edit, not re-deriving from review text.
* **No behavior smuggled inside a refactor.** Checked by hand, and the two risky ones were
  differential-tested rather than taken on the reviewer's word:
  * `ringBands` — 4320 cases (grids 1×1…40×31, densities 0→1, maxD 1–5, forced boundary-touching): 0
    mismatches. Safe because `dilateMask` is separable *box* morphology, so radius-*d* decomposes
    into *d* radius-1 passes; this would **not** hold for a Euclidean disc structuring element.
  * Hotspot key repack (number → `"col,row"` string) — the risk is tie-breaking, since the sort
    compares counts only and ties fall back to `Map` insertion order. 600 randomized cases with
    deliberate tie pressure + an explicit all-ties case: 0 mismatches.
  * The 13-site backslash dedup preserved operation ordering in *both* directions (strip-then-
    normalize sites and the one normalize-then-strip site), and the deleted `normalizeTarget` was
    byte-identical to the new `toPosix`. Its two test-file edits are additions to a
    `vi.mock('../lib/paths.mjs')` factory — a required stub, not a bent assertion.
* **CI green** on every completed canary push (runs 1424–1427); none were cancelled, because each
  finding took longer than a CI run.

### Wall-clock projection — this is a multi-day campaign, not one night

The canary was **all P4 on the `sonnet` minor tier**, so its 5.6 min/finding badly flatters the
rest. Remaining mix: P1 16 · P2 55 · P3 78 · P4 67 · P5 15 = 231, so 64% run on Opus at
`EFFORT_IMPL=high`. Against the skill's published per-shape timings that is **~40 hours**. Plan for
repeated container reclamation and a live session per relaunch; the run resumes cleanly from
`origin` every time.

## Risks & next 3 steps

1. ~~Open the draft PR.~~ Done — PR 552, draft. Per-commit comments go here; CI runs on every push.
2. ~~Canary + audit.~~ Done and clean — see **Canary** above. All 5 comments posted; store drained.
3. **Run the loop until the backlog is drained**, relaunching after each container reclamation with
   the command above. Re-arm the `run.log` monitor every ~30 min (Monitor clamps to 30 min no matter
   what timeout is requested), drain the comment store as it fills, and watch CI on PR 552.

Risks: the container is ephemeral and `.audit-work/` dies with it, so drain PR comments as you go;
CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
sweep up later.

## Driver bug found and fixed mid-run (2026-07-27, 40d641b)

The run was **paused deliberately** at 05:33 and relaunched after fixing a real driver defect. Do
not treat the pause as a crash.

**Symptom.** iter0027 (a rename-only naming fix) burned three fix rounds against a lint gate that
could never go green, escalated into the implementer editing the driver's own
`scripts/audit-burndown/*.mjs` trying to satisfy it, then had a complete fix rolled back and filed
in `docs/AUDIT-DEFERRED.md` as `fix introduced a lint violation`.

**Cause.** `burndown.mjs` built the lint list from `git diff --name-only`, which reports the paths a
commit *touched* — including deletions and the rename-from side of a rename.
`npx eslint <missing
path>` exits **2**, so the gate read red on a fix with no lint violation at
all, unrecoverably (no edit brings a deleted path back). Earlier delete-fixes escaped it only
because they removed `.json` and `.webp`, which are not lintable extensions.

**Fix.** `lintablePaths(paths, exists)` in `lib.mjs` now filters to paths that still exist;
`burndown.mjs` passes `existsSync`. Regression tests cover the rename-from and delete-only cases —
both verified to **fail** against the previous behavior (mutation-tested) while the other 98 pass.

**Owed follow-up:** the iter0027 deferral in `docs/AUDIT-DEFERRED.md`
(`[P3][naming] Inconsistent
script naming across idea dirs`) is **mislabelled** — its fix was
correct and was destroyed by this bug, not rejected on merit. Re-stage it; the saved
`docs/audit-deferred/*.patch` should apply. It is the only deferral of the four that is not a
genuine verdict.

## Owed follow-ups (nothing blocking)

* **Re-stage the mislabelled deferral.** `[P3][naming] Inconsistent script naming across idea dirs`
  in `docs/AUDIT-DEFERRED.md` reads `fix introduced a lint violation`, which is **false** — its fix
  was correct and was destroyed by the driver bug fixed in 40d641b. Its saved
  `docs/audit-deferred/*.patch` should apply. The other three deferrals are genuine verdicts.
* **Exercise what CI cannot reach.** Three fixes are code-motion changes in tiers CI excludes, so
  they rest on reading rather than a run: b1f327620958 (Maestro smoke runners, Android + iOS),
  e0b9e7b221f4 (Gradle wrapper path constants), d685bdca3929 (the `blobs-smoke.mjs` half of the
  admin-client extraction — needs a live deploy + admin secret). Worth a device run and a
  `blobs:smoke` before relying on them.
* **Two judgement calls left in place**, each a one-hunk revert if you disagree: 9efee0d724fc bumped
  a `MODEL` pin in `tools/asset-gen/legacy/` (fine if that tree is a maintained template, wrong if
  it is a frozen record), and 8a364faca967 documented `keepClass`'s 99/96 buckets as *intentionally*
  stricter than the 92% ship gate — the finding only asked whether they were.
* **`662c908ea936` is half-done.** It fixed the dashboard's stale subtitle/footer but left
  `build-review.mjs:121` and `:212` still emitting `IDEAS.md burn-down` in the `<title>`/`<h1>` —
  the same defect the finding names. A two-line follow-up.
* **Consider naming `crayon-brush-samples/` exempt** in `tools/asset-gen/CLAUDE.md`. Its licence to
  import from repo-root `scripts/lib/` lives only in that subdirectory's README, and it was read as
  a boundary violation twice during this run.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `scripts/audit-burndown/lib.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached launch).
