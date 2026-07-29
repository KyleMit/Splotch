# Handoff — audit burndown (636-finding backlog)

> 2026-07-29 · branch `claude/burn-down-audit-skill-ecb5np` · PR *(pending — fill in once opened)* ·
> Bulk-burn the 636-finding `docs/AUDIT.md` backlog with `scripts/audit-burndown/burndown.mjs`,
> relaunching after each container reclamation until drained.

## Current state

Fresh run, forked from `origin/main` at f101386e99b08ad366716ab65b46fcb89ce1c164. The previous
burndown's PR ([#616](https://github.com/KyleMit/Splotch/pull/616)) **merged** on 2026-07-29, so its
packet (`audit-burndown-642.md`) was spent and is deleted in this branch's first commit; its
still-owed follow-ups are carried forward at the bottom of this file.

## Objective & non-goals

Drive `scripts/audit-burndown/burndown.mjs` over the staged backlog: one commit per verified fix
(each also deleting the finding's `docs/AUDIT.md` entry), deferrals to `docs/AUDIT-DEFERRED.md`,
invalid findings dropped with a reasoned commit.

**Non-goals:** filing a GitHub issue per finding (that is `/vet-audits`, impractical at this size);
any hand-editing of `docs/AUDIT.md` (only `pop.mjs` touches it); and triaging the inherited
follow-ups listed at the bottom.

## Relaunch command — use this verbatim

```bash
BRANCH=claude/burn-down-audit-skill-ecb5np \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest && npm run lint:dead' \
TEST_CMD='npm run test:unit && npm run test:scripts && npm run test:asset-gen' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
budgets 3/4/3). Both overrides are literal strings — nothing depends on a helper script in
gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/burn-down-audit-skill-ecb5np`. Preflight echoes `branch: <name>` — read that line and match
it before launching.

### Why the gate overrides

`CHECK_CMD` and `TEST_CMD` are widened past their defaults to cover this repo's bespoke CI gates,
which no per-finding type-check or unit run can see. **The list was re-derived from
`.github/workflows/test.yml` for this run** (the Quality job runs 11 steps). Every gate below was
timed and run at the base commit and exits 0, so a red gate mid-run is attributable to a finding
rather than pre-existing.

| Gate                    | Cost   | Why it is in the gate                                          |
| ----------------------- | ------ | -------------------------------------------------------------- |
| `check`                 | 12.1 s | svelte-check / types                                           |
| `lint:tokens`           | 0.2 s  | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | 0.3 s  | Token-generation drift                                         |
| `scrapbook:check`       | 5.5 s  | Scrapbook index drift                                          |
| `img:audit:check`       | 1.0 s  | SVG optimization ratchet                                       |
| `check:assets:manifest` | 3.8 s  | Asset byte-stability drift                                     |
| `lint:dead`             | 1.6 s  | knip — an extraction/dedup fix routinely orphans an export     |
| whole `CHECK_CMD`       | ~25 s  | Sum, measured at base                                          |
| `test:unit`             | 15.3 s | Default tier                                                   |
| `test:scripts`          | 3.5 s  | A finding touching `scripts/` breaks this and nothing else     |
| `test:asset-gen`        | 8.9 s  | Sole coverage for `tools/asset-gen`, a heavily-audited tree    |
| whole `TEST_CMD`        | ~28 s  | Sum, measured at base                                          |

Deliberately **excluded**, each for a reason:

* `format:check` (~23 s) — already covered by the `format-edited-file.sh` `PostToolUse` hook firing
  inside each `claude -p`.
* `ruler:check` — it *writes* files; a mutating gate would land its output in the fix commit. A
  finding editing `.ruler/**` must run `npm run ruler:apply` itself; nothing enforces that.
* `lint` (repo-wide eslint, 21.5 s) — the driver's `LINT_CMD` already lints the fix's changed files,
  which is where a finding's violations land. Repo-wide would cost ~3.8 h over the backlog to catch
  a rare cross-file case.
* `npm audit --audit-level=critical` — needs network and its result is unrelated to any finding; a
  new advisory would false-red the gate.
* `test:driver:smoke` and `test:e2e` (full suite) — Playwright; the driver already runs *targeted*
  E2E for UI-touching findings via `E2E_CMD`, and CI is the full-suite backstop.

## State

* Base: f101386e99b08ad366716ab65b46fcb89ce1c164 (`origin/main` at launch).
* Backlog at launch: **636** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Priority mix: P1 11 · P2 61 · P3 157 · P4 263 · P5 144 → **407 route to `MODEL_IMPL_MINOR`**.
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Decisions made (and why)

* **Gate list re-derived, not copied.** The previous packet's list was checked against the current
  `test.yml` rather than reused; `scrapbook:check` measured 5.5 s here (0.2 s previously), and the
  exclusions above were each re-justified.
* **Impl tiering verified before launch**, not assumed. The previous run discovered *after the fact*
  that all 642 findings were routed to Opus because `findingPriority` could not parse this backlog's
  format. That fix (91e6fd1) is in main; re-checked here — all 636 findings resolve a priority, zero
  unknown.

## Unverified assumptions

* That the `sonnet` minor tier produces acceptable fixes on this backlog. The previous run's canary
  ran *before* the tiering fix, so every one of its findings used Opus and the minor tier is still
  **unproven**. Read the first few `impl model: sonnet (P4)` findings of this run closely.
* That the E2E flake tracked in [#624](https://github.com/KyleMit/Splotch/issues/624) is genuinely
  fixed. PR [#626](https://github.com/KyleMit/Splotch/pull/626) landed
  `test(e2e): make the /dev/engine harness setup a fixture, not a shared hook` in main; a full E2E
  baseline run at base is the check.

## Done & verified

* `npm run audit:preflight` → PREFLIGHT OK, `branch: claude/burn-down-audit-skill-ecb5np`.
* Every gate in the table above run at base: all exit 0, all timed.
* Priority parse over the live backlog: 636 findings, 0 unparsable.

## Wall-clock projection — a multi-day campaign, not one night

407 P4/P5 findings on the `sonnet` minor tier at ~5.5 min ≈ 37 h, and 229 P1–P3 on Opus at
`EFFORT_IMPL=high` at ~14 min ≈ 53 h. **≈ 90 hours.** Plan for repeated container reclamation and a
live session per relaunch; the run resumes cleanly from `origin` every time. Dollar figures are
notional on a Claude subscription — the real ceiling is the usage window.

## Risks & next 3 steps

1. Open the draft PR (head = this branch) and record its number in the status line above.
2. Canary (`npm run audit:burndown` with the two gate overrides, `MAX_ISSUES=5`), then audit it per
   the skill's steps 4–7: read the diff for smuggled behavior change, confirm each commit deleted
   exactly one `###` entry, confirm the resume handoff fired, and **confirm CI is green** before
   launching the full run.
3. **Run the loop until the backlog is drained**, relaunching after each container reclamation with
   the command above. Re-arm the `run.log` monitor every ~30 min (Monitor clamps to 30 min
   regardless of requested timeout), drain the comment store as it fills, and watch CI.

Risks: the container is ephemeral and `.audit-work/` dies with it, so drain PR comments as you go;
CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
sweep up later.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`. **It is cumulative** — do not read its length as this run's
  deferral count.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Inherited follow-ups (carried from the merged PR #552 and #616 burndowns)

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

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `scripts/audit-burndown/lib.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached launch).
