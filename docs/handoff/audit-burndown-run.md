# Handoff — audit burndown run

> 2026-07-25 · branch `claude/audit-burn-down-cexhfp` · PR
> [#544](https://github.com/KyleMit/Splotch/pull/544) · Burn down the 496-finding `docs/AUDIT.md`
> backlog with the scripted `burn-down-audits` driver.

This is the **durable checkpoint** for a `burn-down-audits` run (see
`.claude/skills/burn-down-audits/SKILL.md`). It exists so a compacted or brand-new session can
relaunch, monitor, and close out the run without re-deriving anything. Keep it current as the run
progresses.

## Objective & non-goals

* **Objective:** clear `docs/AUDIT.md` (496 findings at launch) via the scripted verify → implement
  → adversarial review → fix loop, one commit per finding, pushed after every finding.
* **Non-goals:** no manual editing of `docs/AUDIT.md` (only `scripts/audit-burndown/pop.mjs` touches
  it); no hand-fixing findings outside the driver; no scope beyond what each finding asks for.

## Relaunch command — exact, with every override

```bash
BRANCH=claude/audit-burn-down-cexhfp npm run audit:burndown:overnight -- 600
```

`BRANCH` is the **only** non-default knob. It matters: the driver defaults to `audit/burndown` and
would silently fork a second branch, abandoning this run's commits. The override must ride on every
relaunch — `LAUNCH_KNOBS` in `scripts/audit-burndown/lib.mjs` forwards it into the detached job.

Canary (5 findings, foreground): `BRANCH=claude/audit-burn-down-cexhfp npm run audit:burndown`

No helper scripts are referenced by any knob, so nothing else needs reconstructing if `.audit-work/`
is lost. All other knobs are at their documented defaults, notably `PUSH_EVERY=1` and
`PUSH_TEST_CMD=''` (CI on the draft PR is the full-suite backstop).

## State

* **Branch:** `claude/audit-burn-down-cexhfp`, forked from `main` at 95a9616.
* **PR:** [#544](https://github.com/KyleMit/Splotch/pull/544), draft. Find it again with
  `mcp__github__list_pull_requests` filtered by head branch. The driver never opens or comments on
  one; that is the supervising agent's job.
* **Backlog at launch:** 496 findings.

## Supervising-agent duties (the driver does none of these)

1. **Post the per-commit comments.** The driver appends a record to
   `.audit-work/pending-comments.jsonl` per fix. Drain with
   `node scripts/audit-burndown/backfill-comments.mjs next` → post via
   `mcp__github__add_issue_comment` → `… done <sha>`. Drain *as you go*: `.audit-work/` dies with
   the container.
2. **Watch CI on the draft PR.** With `PUSH_TEST_CMD` empty it is the only full-suite gate.
3. **Monitor event-driven**, not by polling:
   ```bash
   tail -f -n 0 .audit-work/logs/run.log | grep -E --line-buffered \
     "HALT|hit a cap|red at batch|red on the final|push failed|no impl session|DEFERRED|finished:|iter"
   ```

## Unverified assumptions

* None outstanding — preflight and the full canary checklist both passed (below).

## Done & verified

* `BRANCH=claude/audit-burn-down-cexhfp npm run audit:preflight` → `PREFLIGHT OK` (2026-07-25).
* **Canary: 5 fixed · 1 dropped · 2 deferred**, 496 → 488. Every checklist item passed:
  * **Entry deletion:** 8 commits with `removed=1`, none with `removed=2`; 496 − 8 = 488 closes
    exactly. No finding silently destroyed.
  * **Diffs read** for behavior smuggled inside a refactor — none found. The `app.css` token
    substitution was verified byte-exact against `tokens.ts` (`space2: '8px'`, `space3: '12px'`,
    `durationBase: '0.2s'`), so it is not a coincidental-equality fix. The one `as CommonIconName`
    cast added to `Icon.svelte.test.ts` is on the test's own glob-derived loop variable and does not
    disable the runtime guard the test exercises.
  * **Resume handoff confirmed structurally**, not just by reading a summary: within an iteration
    `impl` and `fix1` share one minted session id while each `review*` has its own, and **none**
    match the container's pinned `CLAUDE_CODE_SESSION_ID`. The blind writer/verifier pairing
    (invariant 3) genuinely holds here.
  * **No capped or errored calls**, so the budget knobs are sized correctly and the one
    `implementation failed` deferral was a real failure, not budget truncation.

## Cost & wall-clock (measured, 8 findings)

`$27.03` total, `$4.50`/finding → **`$2198` projected** for the remaining 488 — *notional* on a
Claude subscription; the real ceiling is the usage window.

**Wall-clock is the binding constraint: 65 min for 8 findings ≈ 8 min each → ~65 hours for 488.**
That is ~4× the skill's 13–16h reference figure, so this run will span many container lifetimes.
That is survivable by design (`PUSH_EVERY=1`, state is git + `docs/AUDIT.md`), but it means the run
is expected to be stopped by a `wrap up` long before the backlog drains.

## Risks & next 3 steps

1. Drain the comment store onto PR #544 as fixes land — `.audit-work/` dies with the container.
2. Watch CI on #544; it is the only full-suite gate.
3. On `wrap up`: run the closeout tasks below. The backlog will still hold findings — expected.

## Closeout tasks

* Drain the comment store fully (`next` / post / `done` until empty; then `capture` as a
  completeness check — it reports `skipped N already posted`).
* Confirm CI is green on the final push.
* Add one row to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2, taking counts from each
  run's `finished:` line (`N fixed, N dropped, N deferred`), not from commit counts.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file entirely if the backlog
  fully drains.
* Triage `docs/AUDIT-DEFERRED.md` by hand.
* Mark the PR ready (`mcp__github__update_pull_request`, `draft: false`), then delete this handoff.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions.
* `.audit-work/compact-snapshot.md` — if it exists and its header timestamp is recent, the most
  concrete record of how the live run was launched.
