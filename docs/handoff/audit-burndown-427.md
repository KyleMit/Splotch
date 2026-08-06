# Handoff — audit burndown (427 findings at launch)

> 2026-08-06 · branch `claude/audit-burn-down-72heuj` · PR
> [#805](https://github.com/KyleMit/Splotch/pull/805) · Bulk-burn the `docs/AUDIT.md` backlog with
> `scripts/audit-burndown/burndown.mjs`, running unattended.

## Current state

Fresh campaign forked from `origin/main` at 6e063e677e4b26b67e0dda6c6cb502dc3ee23741. The previous
packet (`audit-burndown-473.md`) was **spent** — its PR
[#771](https://github.com/KyleMit/Splotch/pull/771) merged 2026-08-05 — so it is deleted in this
branch's first commit and its still-owed follow-ups are carried forward at the bottom of this file.

The packet's "436 remaining" did not match `pop.mjs --count` (427) because work landed on `main`
after it merged. **427 is the launch count for this run.**

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burn-down-72heuj \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:scripts && npm run test:asset-gen' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
`BUDGET_VERIFY=3.00`, `BUDGET_IMPL=7.00`, `BUDGET_REVIEW=3.00`). All overrides are literal strings —
nothing depends on a helper script in gitignored `.audit-work/`.

`BUDGET_IMPL=7.00` is no longer passed explicitly: the previous run's follow-up raised the driver
default to `7.00`, so the override was redundant. Confirmed in `scripts/audit-burndown/burndown.mjs`
before dropping it.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/audit-burn-down-72heuj`. Preflight echoes `branch: <name>` — read that line and match it
before launching.

### Why the gate overrides

Widened past the defaults to cover this repo's bespoke CI gates, which no per-finding type-check or
unit run can see. **Re-derived from `.github/workflows/test.yml` for this run** — Quality runs 11
steps, Unit runs 3 tiers, unchanged from the previous campaign. The whole composed `CHECK_CMD` and
`TEST_CMD` were run **at the base commit** and both exit 0, so a red gate mid-run is attributable to
a finding rather than pre-existing.

| Gate                    | Why it is in the gate                                          |
| ----------------------- | -------------------------------------------------------------- |
| `check`                 | svelte-check / types                                           |
| `lint:tokens`           | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | Token-generation drift                                         |
| `scrapbook:check`       | Scrapbook index drift                                          |
| `img:audit:check`       | SVG optimization ratchet                                       |
| `check:assets:manifest` | Asset byte-stability drift                                     |
| `lint:dead`             | knip — an extraction/dedup fix routinely orphans an export     |
| whole `CHECK_CMD`       | **~24 s**, measured at base                                    |
| `test:unit`             | Default tier                                                   |
| `test:scripts`          | A finding touching `scripts/` breaks this and nothing else     |
| `test:asset-gen`        | Sole coverage for `tools/asset-gen`, a heavily-audited tree    |
| whole `TEST_CMD`        | **~60 s**, measured at base                                    |

Deliberately **excluded**, each for a reason:

* `format:check` — already covered by the `format-edited-file.sh` `PostToolUse` hook firing inside
  each `claude -p`.
* `ruler:check` — it *writes* files; a mutating gate would land its output in the fix commit. A
  finding editing `.ruler/**` must run `npm run ruler:apply` itself; nothing enforces that.
* `lint` (repo-wide eslint) — the driver's `LINT_CMD` already lints the fix's changed files.
* `npm audit --audit-level=critical` — needs network and its result is unrelated to any finding.
* `test:driver:smoke` and full `test:e2e` — the driver runs *targeted* E2E for UI-touching findings
  via `E2E_CMD`; CI is the full-suite backstop.

## State

* Base: 6e063e677e4b26b67e0dda6c6cb502dc3ee23741 (`origin/main` at launch).
* Backlog at launch: **427** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Priority mix: P2 43 · P3 124 · P4 178 · P5 78 · **4 unparsable** → **256 route to
  `MODEL_IMPL_MINOR`**; the 4 unparsable stay on the stronger model, which is the safe default. No
  P1 findings remain.
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Wall-clock projection — a multi-day campaign, not one night

256 P4/P5 findings on the `sonnet` minor tier at ~5.5 min ≈ 23 h, and 171 P2–P3 (plus 4 unparsable)
on Opus at `EFFORT_IMPL=high` at ~14 min ≈ 40 h. **≈ 63 hours.** One overnight run clears a fraction
of it; plan for repeated container reclamation and a live session per relaunch. Dollar figures are
notional on a Claude subscription — the real ceiling is the usage window.

## Risks

* The container is ephemeral and `.audit-work/` dies with it, so **drain PR comments as you go**.
* CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
  sweep up later.
* `test.yml` sets `cancel-in-progress`, so a fast-landing finding can cancel the previous commit's
  suite. Judge the run by the final CI result plus the per-finding gates, not a green tick on every
  commit.

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

## Inherited follow-ups (carried from the merged #552, #616, #627 and #771 burndowns)

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
