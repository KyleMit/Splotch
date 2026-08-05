# Handoff — audit burndown (473 findings at launch)

> 2026-08-05 · branch `claude/audit-burndown-overnight-6isff3` · PR
> [#771](https://github.com/KyleMit/Splotch/pull/771) · Bulk-burn the `docs/AUDIT.md` backlog with
> `scripts/audit-burndown/burndown.mjs`, running unattended overnight.

## Current state

Fresh campaign forked from `origin/main` at f775675a996a751dde0cee270219ae3439ef4135. The previous
packet (`audit-burndown-636.md`) was **spent** — its PR
[#627](https://github.com/KyleMit/Splotch/pull/627) merged on 2026-07-29 and a later run merged as
#770 — so it was deleted in this branch's first commit and its still-owed follow-ups are carried
forward at the bottom of this file.

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burndown-overnight-6isff3 \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:scripts && npm run test:asset-gen' \
BUDGET_IMPL=7.00 \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
`BUDGET_VERIFY=3.00`, `BUDGET_REVIEW=3.00`). All overrides are literal strings — nothing depends on
a helper script in gitignored `.audit-work/`.

### Why `BUDGET_IMPL=7.00` (raised from the 4.00 default)

The canary's fifth finding — extracting three hand-rolled segmented controls into one design
primitive — hit exactly `$4.0036` on its fix round and deferred with `error_max_budget_usd`. Every
other role call in the canary finished under `$2`: verify peaked at `$0.94` and review at `$0.89`,
both far below their `$3.00` caps, so those stay at the default.

The cap was binding only on multi-file extraction fix rounds, which are common in a `/code-audit`
tail. A cap set below what the work costs does not save anything — it converts a finished,
gate-passing fix into a deferral and pays for the finding again on the re-run. Dollars are notional
on a Claude subscription; the real ceiling is the usage window.

The deferred finding's draft is recoverable at
`docs/audit-deferred/*-hand-rolled-copies-of-the-ios-style-segmented-cont.patch` (259 lines) — it is
worth re-staging under the raised budget rather than re-deriving.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/audit-burndown-overnight-6isff3`. Preflight echoes `branch: <name>` — read that line and
match it before launching.

### Why the gate overrides

Widened past the defaults to cover this repo's bespoke CI gates, which no per-finding type-check or
unit run can see. **Re-derived from `.github/workflows/test.yml` for this run** (Quality runs 11
steps; Unit runs 3 tiers). Every gate below was timed and run at the base commit and exits 0, so a
red gate mid-run is attributable to a finding rather than pre-existing.

| Gate                    | Cost  | Why it is in the gate                                          |
| ----------------------- | ----- | -------------------------------------------------------------- |
| `check`                 | 13 s  | svelte-check / types                                           |
| `lint:tokens`           | 1 s   | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | 0 s   | Token-generation drift                                         |
| `scrapbook:check`       | 5 s   | Scrapbook index drift                                          |
| `img:audit:check`       | 1 s   | SVG optimization ratchet                                       |
| `check:assets:manifest` | 4 s   | Asset byte-stability drift                                     |
| `lint:dead`             | 3 s   | knip — an extraction/dedup fix routinely orphans an export     |
| whole `CHECK_CMD`       | ~27 s | Sum, measured at base                                          |
| `test:unit`             | 22 s  | Default tier                                                   |
| `test:scripts`          | 7 s   | A finding touching `scripts/` breaks this and nothing else     |
| `test:asset-gen`        | 18 s  | Sole coverage for `tools/asset-gen`, a heavily-audited tree    |
| whole `TEST_CMD`        | ~47 s | Sum, measured at base                                          |

Deliberately **excluded**, each for a reason:

* `format:check` — already covered by the `format-edited-file.sh` `PostToolUse` hook firing inside
  each `claude -p`.
* `ruler:check` — it *writes* files; a mutating gate would land its output in the fix commit. A
  finding editing `.ruler/**` must run `npm run ruler:apply` itself; nothing enforces that.
* `lint` (repo-wide eslint) — the driver's `LINT_CMD` already lints the fix's changed files, which
  is where a finding's violations land.
* `npm audit --audit-level=critical` — needs network and its result is unrelated to any finding.
* `test:driver:smoke` and full `test:e2e` — the driver runs *targeted* E2E for UI-touching findings
  via `E2E_CMD`; CI is the full-suite backstop.

## State

* Base: f775675a996a751dde0cee270219ae3439ef4135 (`origin/main` at launch).
* Progress: **27 fixed · 0 dropped · 4 deferred · 442 remaining** as of 2026-08-05 09:09 (canary 5 +
  overnight run 22). Plus two supervisor commits repairing the startup-bundle regression.
* Backlog at launch: **473** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Priority mix: P1 8 · P2 52 · P3 136 · P4 194 · P5 83 → **277 route to `MODEL_IMPL_MINOR`**.
* Priority parse verified before launch: 473 findings, **0 unparsable** — impl tiering will fire.
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Decisions made (and why)

* **Gate list re-derived from `test.yml`, not copied** from the spent packet. It matched, but the
  Quality job has grown before and the check is cheap.
* **Impl tiering verified before launch**, not assumed — its failure mode is silent (every
  mechanical finding quietly billing Opus at `EFFORT_IMPL=high`).
* **Fresh branch from `main` rather than stacking**, since the previous campaign's PR had merged.

## What this run established (so the next one need not re-derive it)

* **`BUDGET_IMPL=4.00` was too tight for multi-file extraction fix rounds** — one canary finding hit
  exactly `$4.0036` and deferred. Raised to `7.00`; no budget deferral since.
* **A finding can be right about the duplication and wrong about the fix.** `docs/AUDIT.md` contains
  findings that name a *deliberate* boundary as accidental duplication. The folder-save support
  predicate is the worked example: sharing it broke `startup-bundle.spec.ts` (see below). When a
  finding proposes to hoist something that a comment says is inlined on purpose, the comment is the
  evidence, not the defect.
* **Bundle composition is invisible to every per-finding gate.** Only the draft PR's CI sees it, and
  the failing marker can name a module the offending commit never touched — `git bisect` with a
  build-and-grep script is the fast path to attribution.
* **Deferral causes were all distinct** (budget cap, review rejection, verifier turn cap, verifier
  wrote no brief). No mechanism recurred, so none met the bar for a mid-run intervention.

### Known driver rough edge — `verifier gave no usable brief`

One finding deferred after the verifier returned a perfectly good `verdict: VALID` with
`reason: completed` and no error, but never wrote the brief file it named in `brief_path`. The
driver correctly refused to proceed on the *previous* finding's stale brief. This looks **retryable
rather than deferrable** — the verifier call succeeded and simply skipped a side effect, which is
the "check the observable side effect, not just the envelope" pattern the runbook already applies to
`resolveImplSha`. Worth a driver fix if it recurs.

## Unverified assumptions

* That the container survives long enough for a meaningful run. It is reclaimed on inactivity; the
  run resumes cleanly from `origin` every relaunch, which is why `PUSH_EVERY=1`.

## Wall-clock projection — a multi-day campaign, not one night

277 P4/P5 findings on the `sonnet` minor tier at ~5.5 min ≈ 25 h, and 196 P1–P3 on Opus at
`EFFORT_IMPL=high` at ~14 min ≈ 46 h. **≈ 70 hours.** One overnight run clears a fraction of it;
plan for repeated container reclamation and a live session per relaunch. Dollar figures are notional
on a Claude subscription — the real ceiling is the usage window.

## Risks & next 3 steps

1. Canary (`npm run audit:burndown` with the same gate overrides), then audit its commits — entry
   deletion count exactly 1 per finding, no behavior smuggled into a refactor, no moved goalposts.
2. Confirm CI green on the canary's pushes **before** launching the full run.
3. Launch overnight; re-arm the `run.log` monitor every ~30 min (Monitor clamps to 30 min regardless
   of requested timeout), drain the comment store as it fills, and watch CI.

Risks: the container is ephemeral and `.audit-work/` dies with it, so drain PR comments as you go;
CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
sweep up later.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check — `skipped N already posted` must equal the fix count.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`. **It is cumulative** — do not read its length as this run's
  deferral count.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Re-check the eslint `max-lines` caps for findings that raised one rather than clearing it.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Inherited follow-ups (carried from the merged #552, #616 and #627 burndowns)

Still owed; none block this run. All would be better filed as GitHub issues than carried forward
again — the next session to touch them should file and drop them from here.

* **Re-stage a mislabelled deferral.** `[P3][naming] Inconsistent script naming across idea dirs` in
  `docs/AUDIT-DEFERRED.md` reads `fix introduced a lint violation`, which is false — its fix was
  correct and was destroyed by a driver bug since fixed in 40d641b. Its saved
  `docs/audit-deferred/*.patch` should apply.
* **Exercise what CI cannot reach.** Three PR-552 fixes are code-motion in tiers CI excludes:
  b1f327620958 (Maestro smoke runners), e0b9e7b221f4 (Gradle wrapper path constants), d685bdca3929
  (the `blobs-smoke.mjs` half of the admin-client extraction — needs a live deploy + admin secret).
* **`662c908ea936` is half-done.** It left `build-review.mjs:121` and `:212` still emitting
  `IDEAS.md burn-down` in the `<title>`/`<h1>` — the same defect its finding names.
* **Two judgement calls left in place**, each a one-hunk revert: 9efee0d724fc bumped a `MODEL` pin
  in `tools/asset-gen/legacy/`, and 8a364faca967 documented `keepClass`'s 99/96 buckets as
  intentionally stricter than the 92% ship gate.
* **Consider naming `crayon-brush-samples/` exempt** in `tools/asset-gen/CLAUDE.md`; its licence to
  import from repo-root `scripts/lib/` lives only in that subdirectory's README and was read as a
  boundary violation twice.
* **Three `max-lines` caps raised rather than cleared** in the #627 run (`engine.ts` 900 → 913,
  `undoHistory.test.ts` 500 → 529). The right repair is extracting the duplicated helper so the
  grandfathered override can be deleted outright.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `scripts/audit-burndown/lib.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached launch).
