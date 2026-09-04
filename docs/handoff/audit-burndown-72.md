# Handoff — audit burndown (72 triaged findings at launch)

> 2026-08-07 · branch `claude/audit-burn-down-vf4iui` · PR
> [#830](https://github.com/KyleMit/Splotch/pull/830) **(merged)** · Burn down the post-triage
> `docs/AUDIT.md` backlog with `tools/audit-burndown/run-burndown.mjs`, running unattended.

## Current state — wrapped up, resumable

Wrapped on request after **29 fixed · 0 dropped · 0 deferred**; backlog 72 → 43 (canary 5 + full run
24). Nothing is in flight, `HEAD` == `origin/claude/audit-burn-down-vf4iui`, the comment store is
drained, and `capture` reports `skipped 29 already posted` against 29 fixes. The counts close
against git independently: zero `defer —` and zero `drop invalid finding` commits, 29 backlog
entries consumed, and `72 − 29 == 43 == pop-finding.mjs --count`.

The *Silent wrong output* group drained completely (all 25) and its section was removed from
`docs/AUDIT.md`; the other 4 fixes came from *App correctness*, which went 16 → 12. Counted at the
base commit 0ac5e76ae8a0, the launch groups were silent 25 · app 16 · safety 10 · cross-file 12 ·
docs 8 · coverage 1 = 72 — the triage log's table records 26 for the first group, but the later
re-pinning dropped one of them.

The five remaining groups hold 43: app correctness 12 · cross-file agreement 12 · safety/resource 10
· docs that misdirect 8 · coverage gaps 1.

**To continue: PR #830 has merged, so it cannot track further work.** Re-cut the branch from the
current `main` (`git fetch origin main && git checkout -B claude/audit-burn-down-vf4iui
origin/main`), relaunch with the command below, and open a **new** PR to post per-commit comments
to. Do not stack new commits on the merged history.

The 43 remaining findings are still staged in `docs/AUDIT.md` and the relaunch command below is
unchanged — the driver pops from the file, so it resumes at the next finding with no other setup.

**Nothing is owed to this packet.** The inherited follow-ups it used to carry, and the judgement
call in 132a7c20ba48 recorded under Risks, are now issues #833–#840 — see the table at the bottom.
The only work this packet still describes is the 43 findings left in the backlog.

## Objective & non-goals

Clear the **72 findings that survived the 2026-08-07 `audit-triage` pass** (`docs/AUDIT-LOG.md`).
Unlike every previous campaign, this backlog is *not* an indiscriminate tail: 346 findings were cut
to 75 against five explicit keep-criteria, and three more were dropped in b56dd5a0e04f as already
fixed. Every remaining entry earned its place, so the expected drop rate is far lower than the runs
before it and an `INVALID` verdict deserves a closer read than usual.

**Non-goals:** re-triaging the backlog (that decision is made and logged), filing findings as
issues, and any work on `docs/AUDIT-DEFERRED.md`'s cumulative backlog beyond this run's own
deferrals.

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burn-down-vf4iui \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run check:svg-assets && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:tools && npm run test:asset-gen' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
`BUDGET_VERIFY=3.00`, `BUDGET_IMPL=7.00`, `BUDGET_REVIEW=3.00`). All overrides are literal strings —
nothing depends on a helper script in gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`. Preflight echoes two branch
lines: `repo → branch` is just the current git branch and is green regardless, while `resume target
→ branch <name>` is the one that reflects the env var. Read the **resume target** line and match it
before launching.

## State

* Base: 0ac5e76 (`origin/main` at launch), forked clean.
* Backlog at launch: **72** findings (`node tools/audit-burndown/pop-finding.mjs --count`).
* Priority mix: P2 16 · P3 35 · P4 20 · P5 1 · **0 unparsable** → **21 route to
  `MODEL_IMPL_MINOR`**. Tiering was confirmed to parse before launch, not assumed.
* Backlog groups (triage keep-criteria): silent wrong output 26 · app correctness 16 · cross-file
  agreement 14 · safety/resource 10 · docs that misdirect 8 · coverage gaps 1. Roughly half sit in
  tooling and scripts rather than `web/src/`.

### Why the gate overrides

Re-derived from `.github/workflows/test.yml` for this run rather than copied forward: Quality still
runs 11 steps, Unit still 3 tiers, so the override set is unchanged from the previous campaign.

Deliberately **excluded**, each for a reason:

* `format:check` — covered by the `format-edited-file.sh` `PostToolUse` hook firing inside each
  `claude -p`.
* `ruler:check` — it *writes* files (runs `dprint fmt`); a mutating gate would land its output in
  the fix commit. A finding editing `.ruler/**` must run `npm run ruler:apply` itself.
* `lint` (repo-wide eslint) — the driver's `LINT_CMD` already lints the fix's changed files.
* `npm audit --audit-level=critical` — needs network, result unrelated to any finding.
* `test:driver:smoke` and full `test:e2e` — the driver runs *targeted* E2E for UI-touching findings
  via `E2E_CMD`; CI is the full-suite backstop.

## Done & verified (base commit, before launch)

The base was **green**, unlike the 2026-08-06 campaign — but it was checked rather than assumed,
because `test.yml` sets `cancel-in-progress` and a merge commit's push run is routinely cancelled
without ever reporting. Each gate was run **individually**, not `&&`-chained, so no red gate could
hide behind an earlier one:

| Gate                                                                                                                   | Result |
| ---------------------------------------------------------------------------------------------------------------------- | ------ |
| `check`, `lint:tokens`, `gen:tokens:check`, `scrapbook:check`, `img:audit:check`, `check:assets:manifest`, `lint:dead` | all ok |
| `test:unit`, `test:tools`, `test:asset-gen`                                                                            | all 0  |

Preflight OK: deps, auth, clean tree, origin reachable, all three role prompts present, 72 findings
parsed, resume-target branch echoed as `claude/audit-burn-down-vf4iui`.

## Resolved during the run (were unverified assumptions)

* **CI recovered and stayed healthy.** Unlike the 2026-08-06 campaign — where Actions created no
  runs at all — every push here got a full run created and green: Quality, all three unit tiers, all
  three E2E shards, WebKit smoke, release build smoke, ADR drift. The cross-finding backstop was
  real for this campaign. Still check `total_count`, not just conclusions, on the next one.
* **No E2E flake ever surfaced.** The baseline was never established at base, and in the event no
  targeted spec failed across 29 findings, so the question stayed moot. It is still unestablished
  for the next run.

## Risks

* The container is ephemeral and `.audit-work/` dies with it, so **drain PR comments as you go**.
* CI is the only full-suite gate in this configuration, so a red run means pause and diagnose, not
  sweep up later.
* `test.yml` sets `cancel-in-progress`, so a fast-landing finding can cancel the previous commit's
  suite. Judge the run by the final CI result plus the per-finding gates, not a green tick on every
  commit.
* **Drops deserve scrutiny in this campaign specifically.** The backlog is curated, so a high
  `INVALID` rate means the verifier is wrong more often than the backlog is stale — the inverse of
  the previous runs' assumption. Borne out: 29 findings produced zero drops.
* **One unattributed change is on the branch, left in place deliberately.** 132a7c20ba48 raised
  `testTimeout` 5s → 20s in `web/src/lib/audio/drawingSound.test.ts` and
  `web/src/lib/drawing/aiImage.test.ts` to clear a red `TEST_CMD` gate. It is well-formed (named
  constants, explanatory comments, no assertions touched) but is a flake mitigation attributable to
  no finding, so it belongs in its own commit; and its diagnosis is by analogy — the implementer
  states the exact failure was not reproduced, and the mechanism it describes includes mock counts
  bleeding between tests, which a longer timeout makes rarer without fixing. Splitting it now needs
  a history rewrite of pushed commits. **Tracked as #840** — do not revert it blind: if the flake is
  real, its return costs a fix round on every gate-tripping finding, since `TEST_CMD` runs on all of
  them. That is why the issue asks for a diagnosis rather than a revert.

## Supervising traps established by previous runs (do not re-derive)

* **SHAs in role prose.** An implementer routinely cites *its own pre-amend commit*, which the
  driver orphans when it amends the backlog excision in — roughly one fix-round comment in three
  needs a correction. `git rev-parse --verify` resolves orphans happily, so it is **not** the check;
  use reachability: `git merge-base --is-ancestor "$sha" HEAD`.
* **The monitor filter must include `INVALID`.** The driver never logs the word "dropped".
* **Iteration tags count outcomes, not fixes** (`iter${done + dropped + deferred + 1}`), so a drop
  advances the tag exactly like a fix and the tag sequence alone never tells you which happened —
  read the `INVALID` verdict.
* **Never run `npm run ruler:check`, `gen:tokens`, or `gen:assets:manifest` while the driver is
  live** — they mutate the tree and their writes land in the in-flight fix commit.
* **`pgrep -f` and `pkill -f` match their own command line.** Anchor on `'^node
  tools/audit-burndown/run-burndown.mjs'` or a wait loop never exits.
* **A `Monitor` clamps to 30 minutes** regardless of `persistent`/`timeout_ms`. Re-arming is a
  routine chore; close the gap with a scoped `awk` catch-up read after each re-arm.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`,
  one `done` per confirmed post — never batch), then run `capture` as a completeness check —
  `skipped N already posted` must equal the fix count.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`. **It is cumulative** — do not read its length as this run's
  deferral count.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `##` keep-criterion sections in `docs/AUDIT.md`; delete the file outright if
  drained.
* Re-check the eslint `max-lines` caps for findings that raised one rather than clearing it (`git
  log <base>..HEAD -- eslint.config.js`), and judge the rate, not the instance.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Inherited follow-ups — FILED, no longer owed here

These were carried across six campaigns (#552, #616, #627, #771, #805, #821) because none of them
blocked a run. They are now **GitHub issues**, which is where a durable TODO belongs per
`docs/handoff/CLAUDE.md` — the tracker is the live backlog, not this packet. Nothing in this section
is outstanding work for a future burndown session; it is kept only so the trail from packet to issue
is legible.

| Issue | Follow-up                                                                            |
| ----- | ------------------------------------------------------------------------------------ |
| #833  | Re-stage the mislabelled "Inconsistent script naming across idea dirs" deferral      |
| #834  | Re-stage the budget-capped iOS-style segmented-control extraction                    |
| #835  | Exercise the three PR-552 code-motion fixes CI cannot reach                          |
| #836  | Finish the `build-review.mjs` rename — two sites still emit `IDEAS.md burn-down`     |
| #837  | Ratify or revert two judgement calls (the `MODEL` pin, the `keepClass` buckets)      |
| #838  | Document `crayon-brush-samples`' licence to import from `tools/lib`                  |
| #839  | Clear the three grandfathered `max-lines` caps by extracting the duplicated helper   |
| #840  | Diagnose the `drawingSound`/`aiImage` flake instead of masking it with a 20s timeout |

#840 is the one this campaign created — the unattributed `testTimeout` raise recorded under Risks.
The rest predate it.

**Do not re-file these.** A future session finding this packet should read the issues, not this
table; the issues carry the full what/why/where/done-when and this table will go stale as they
close.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `docs/AUDIT-LOG.md` § `2026-08-07 · audit-triage` — why these 72 and not the other 271.
* `tools/audit-burndown/lib/burndown-core.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached
  launch).
