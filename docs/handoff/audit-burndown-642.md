# Handoff — audit burndown (642-finding backlog)

> 2026-07-28 · branch `claude/audit-burn-down-skill-1s5jty` · PR
> [#616](https://github.com/KyleMit/Splotch/pull/616) · Bulk-burn the fresh 642-finding
> `docs/AUDIT.md` backlog staged by PR #614.

## Objective & non-goals

Drive `scripts/audit-burndown/burndown.mjs` over the staged backlog: one commit per verified fix
(each also deleting the finding's `docs/AUDIT.md` entry), deferrals to `docs/AUDIT-DEFERRED.md`,
invalid findings dropped with a reasoned commit.

**Non-goals:** filing a GitHub issue per finding (that is `/vet-audits`, impractical at this size);
any hand-editing of `docs/AUDIT.md` (only `pop.mjs` touches it); and triaging the inherited
follow-ups listed at the bottom.

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burn-down-skill-1s5jty \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:scripts && npm run test:asset-gen' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
budgets 3/4/3). Both overrides are literal strings — nothing here depends on a helper script in
gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/audit-burn-down-skill-1s5jty`. Preflight echoes `branch: <name>` — read that line and match
it before launching.

### Why the gate overrides

`CHECK_CMD` and `TEST_CMD` are widened past their defaults to cover this repo's bespoke CI gates,
which no per-finding type-check or unit run can see. Every gate below was run at the base commit and
passes, so a red gate mid-run is attributable to a finding rather than pre-existing. Measured on
this container:

| Gate                    | Cost  | Why it is in the gate                                          |
| ----------------------- | ----- | -------------------------------------------------------------- |
| `lint:tokens`           | 0.2 s | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | 0.3 s | Token-generation drift                                         |
| `scrapbook:check`       | 0.2 s | Scrapbook index drift                                          |
| `img:audit:check`       | 1.0 s | SVG optimization ratchet                                       |
| `check:assets:manifest` | 5.2 s | Asset byte-stability drift                                     |
| `lint:dead`             | 1.4 s | knip — an extraction/dedup fix routinely orphans an export     |
| `test:scripts`          | 3.0 s | A finding touching `scripts/` breaks this and nothing else     |
| `test:asset-gen`        | 8.1 s | Sole coverage for `tools/asset-gen`, a heavily-audited tree    |
| whole `CHECK_CMD`       | 12 s  | Measured end to end at base                                    |

`lint:dead` and `test:asset-gen` are **new relative to the PR-552 run**, which did not gate on
either. Both were added for this backlog specifically: it is 407 P4/P5 findings weighted toward
dead-code, rename, and dedup work — exactly the shape that orphans a knip-visible export — and it
re-audits `tools/asset-gen` in full.

Deliberately **excluded**: `format:check` (~23 s; already covered by the `format-edited-file.sh`
PostToolUse hook firing inside each `claude -p`) and `ruler:check` (it *writes* files — a mutating
gate would land its output in the fix commit). A finding editing `.ruler/**` must run
`npm run ruler:apply` itself; nothing enforces that.

## State

* Base: bfd6db7fdc0f758c342a06e8732c4f6f4ef3f790 (`origin/main` at launch), which merges PR #614.
* Backlog at launch: **642** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Priority mix (from PR #614): P1 11 · P2 64 · P3 160 · P4 263 · P5 144.
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Unverified assumptions

* That the fresh audit does not re-stage work already fixed by the merged PR #552 burndown. It is
  pinned at 9ae62ff, which post-dates that merge, so overlap should be incidental — and the verifier
  drops an already-fixed finding as `INVALID` for ~25 s, so this is self-healing rather than
  dangerous. Watch the drop rate in the canary anyway; a high one means the audit was staged against
  stale code.
* That `lint:dead` is stable per-finding. knip reports repo-wide, so a fix that *reveals* a
  pre-existing unused export would read as a red gate caused by that finding. It passes at base; if
  it starts producing unrecoverable fix rounds, drop it from `CHECK_CMD` and let CI catch it.

## Done & verified

* `npm run audit:preflight` → PREFLIGHT OK, `branch: claude/audit-burn-down-skill-1s5jty`.
* Every gate in the table above run at base: all exit 0.

## Wall-clock projection — a multi-day campaign, not one night

Against the skill's published per-shape timings: 407 P4/P5 findings on the `sonnet` minor tier at
~5.5 min ≈ 37 h, and 235 P1–P3 on Opus at `EFFORT_IMPL=high` at ~14 min ≈ 55 h. **≈ 90 hours.** Plan
for repeated container reclamation and a live session per relaunch; the run resumes cleanly from
`origin` every time.

## Risks & next 3 steps

1. Open the draft PR (head = this branch) and record its number in the status line above.
2. Canary `npm run audit:burndown` with `MAX_ISSUES=5`; audit its commits for behavior smuggled
   inside a refactor, confirm each fix commit deleted exactly one `###` entry, confirm a fix round
   resumed the implementer's own session, and confirm CI is green before launching the full run.
3. Run the loop until drained, relaunching after each container reclamation. Re-arm the `run.log`
   monitor every ~30 min (Monitor clamps to 30 min regardless of requested timeout), drain the
   comment store as it fills, and watch CI.

Risks: the container is ephemeral and `.audit-work/` dies with it, so drain PR comments as you go;
CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
sweep up later.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`. **It is cumulative** — it already held 13 entries before this
  run started, so do not read its length as this run's deferral count.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Inherited follow-ups from the merged PR #552 burndown

`docs/handoff/audit-burndown-236.md` was deleted in this branch's first commit — its PR merged on
2026-07-27, so the handoff was consumed, and its "183 findings remaining" line actively contradicts
the current 642. These items it recorded are **still owed** and are preserved here rather than lost.
None block this run, and all would be better filed as GitHub issues than carried in a handoff:

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

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `scripts/audit-burndown/lib.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached launch).
