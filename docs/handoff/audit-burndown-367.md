# Handoff — audit burndown (367 findings at launch)

> 2026-08-06 · branch `claude/audit-burn-down-727egi` · PR TBD · Bulk-burn the `docs/AUDIT.md`
> backlog with `scripts/audit-burndown/burndown.mjs`, running unattended.

## Current state

Fresh campaign forked from `origin/main` at b8f7013283f8e3e5aa9337b7cc0a8e7450385947. The previous
packet (`audit-burndown-427.md`) was **spent** — its PR
[#805](https://github.com/KyleMit/Splotch/pull/805) merged 2026-08-06 — so it is deleted in this
branch and its still-owed follow-ups are carried forward at the bottom of this file.

That packet's "367 remaining" **did** match `pop.mjs --count` exactly, unlike the previous handover.
367 is the launch count for this run.

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burn-down-727egi \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:scripts && npm run test:asset-gen' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
`BUDGET_VERIFY=3.00`, `BUDGET_IMPL=7.00`, `BUDGET_REVIEW=3.00`). All overrides are literal strings —
nothing depends on a helper script in gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/audit-burn-down-727egi`. Preflight echoes `branch: <name>` — read that line and match it
before launching.

## The base commit was red — repaired before launch

**`main` itself was failing two Quality gates**, both landed by the settings-icon refresh merged
hours earlier. Repaired in this branch's first commit 3ba2b56 rather than worked around, because
both sit in `CHECK_CMD`: left alone they would have gated *every* finding red, burned a fix round
each, and halted the run on three consecutive deferrals.

| Gate              | Cause                                                                              | Repair                                            |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `img:audit:check` | 4b53d57bcc3e landed 11 un-optimized SVGs                                           | `npm run img:audit` + `scrapbook:index` (cascade) |
| `lint:dead`       | knip: `PUNCHED_BACKGROUND_STYLES` exported but consumed only inside its own module | dropped the `export` keyword                      |

Two things worth keeping:

* **The icon fix cascades into the scrapbook index.** `scrapbook/index.html` inlines
  `line-weight.svg` as a card emoji, so optimizing the icon made the committed index stale —
  `scrapbook:check` passed at base and only went red *after* `img:audit`. Both files must land in
  one commit. Anyone re-deriving this will hit the same two-step.
* **The optimization was verified as byte-only, not assumed.** All 11 icons were rasterized at 384
  DPI before and after and pixel-compared: zero pixels differ beyond an 8/255 threshold, worst
  single-subpixel delta 4/255. No gate in the repo asserts render equivalence, so this is the only
  evidence that a freshly-designed icon set still looks the same.

**Why nobody noticed main was red:** the merge commit b8f7013283f8 has *no CI run at all* —
`test.yml` sets `cancel-in-progress`, and its push run was cancelled by a later one. Do not assume a
green history means a green base; run the composed gates at the base commit, which is what surfaced
this.

## State

* Base: b8f7013283f8e3e5aa9337b7cc0a8e7450385947 (`origin/main` at launch).
* Backlog at launch: **367** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Priority mix: P2 40 · P3 110 · P4 151 · P5 62 · **4 unparsable** → **213 route to
  `MODEL_IMPL_MINOR`**; the 4 unparsable stay on the stronger model, which is the safe default. No
  P1 findings remain.
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present, branch
  echoed correctly.

### Why the gate overrides

Widened past the defaults to cover this repo's bespoke CI gates, which no per-finding type-check or
unit run can see. **Re-derived from `.github/workflows/test.yml` for this run** rather than copied
forward — Quality still runs 11 steps and Unit still 3 tiers, so the override set is unchanged from
the previous campaign. The whole composed `CHECK_CMD` (~24 s) and `TEST_CMD` (~60 s, 2185 tests)
were run **at the base commit** and both exit 0 *after* the repair above.

Deliberately **excluded**, each for a reason:

* `format:check` — covered by the `format-edited-file.sh` `PostToolUse` hook firing inside each
  `claude -p`.
* `ruler:check` — it *writes* files (runs `dprint fmt`); a mutating gate would land its output in
  the fix commit. A finding editing `.ruler/**` must run `npm run ruler:apply` itself.
* `lint` (repo-wide eslint) — the driver's `LINT_CMD` already lints the fix's changed files.
* `npm audit --audit-level=critical` — needs network, result unrelated to any finding.
* `test:driver:smoke` and full `test:e2e` — the driver runs *targeted* E2E for UI-touching findings
  via `E2E_CMD`; CI is the full-suite backstop.

## Risks

* The container is ephemeral and `.audit-work/` dies with it, so **drain PR comments as you go**.
* CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
  sweep up later.
* `test.yml` sets `cancel-in-progress`, so a fast-landing finding can cancel the previous commit's
  suite. Judge the run by the final CI result plus the per-finding gates, not a green tick on every
  commit.

## Supervising traps established by the previous run (do not re-derive)

* **SHAs in role prose.** An implementer routinely cites *its own pre-amend commit*, which the
  driver orphans when it amends the backlog excision in — hit 3× last run, and again on 2026-08-06.
  It also sometimes writes a 7-char abbreviation where the renderer's heading uses 12. Neither is
  caught by `git rev-parse --verify`, which resolves orphaned objects happily. Use reachability:
  `git merge-base --is-ancestor "$sha" HEAD`. Roughly one fix-round comment in three needs a
  correction before posting.
* **The monitor filter must include `INVALID`.** The driver never logs the word "dropped"; it logs
  the verdict verbatim. Four drops arrived silently last run before the filter was widened.
* **Iteration tags repeat on a drop** (`iter${done + deferred + 1}` excludes drops), so two or three
  consecutive `iterNNNN` lines with a falling remaining-count is a drop signature, not a bug.
* **Stale findings cluster by consolidation commit** — a backlog pinned before a big refactor shows
  a run of cheap `INVALID` drops sharing one culprit.
* **Never run `npm run ruler:check` while the driver is live** — it mutates the tree.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check — `skipped N already posted` must equal the fix count.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`. **It is cumulative** — do not read its length as this run's
  deferral count.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Re-check the eslint `max-lines` caps for findings that raised one rather than clearing it
  (`git log <base>..HEAD -- eslint.config.js`), and judge the rate, not the instance.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Inherited follow-ups (carried from the merged #552, #616, #627, #771 and #805 burndowns)

Still owed; none block this run. All would be better filed as GitHub issues than carried forward
again — the next session to touch them should file and drop them from here.

* **Re-stage a mislabelled deferral.** `[P3][naming] Inconsistent script naming across idea dirs` in
  `docs/AUDIT-DEFERRED.md` reads `fix introduced a lint violation`, which is false — its fix was
  correct and was destroyed by a driver bug since fixed in 40d641b. Its saved
  `docs/audit-deferred/*.patch` should apply.
* **Re-stage the budget-capped extraction.** The #771 canary deferred "hand-rolled copies of the
  iOS-style segmented control" at exactly `$4.0036` under the old `BUDGET_IMPL=4.00`. The default is
  now `7.00`, and its 259-line draft survives at
  `docs/audit-deferred/*-hand-rolled-copies-of-the-ios-style-segmented-cont.patch` — worth
  re-staging rather than re-deriving.
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
