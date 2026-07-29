# Handoff — audit burndown (642-finding backlog)

> 2026-07-29 · branch `claude/audit-burn-down-skill-1s5jty` · PR
> [#616](https://github.com/KyleMit/Splotch/pull/616) · Resume the bulk burndown of the 642-finding
> `docs/AUDIT.md` backlog staged by PR #614 — 642 → 637 done, PR marked ready, relaunch to continue.

## Current state — wrapped up, resumable

Wrapped on request after the **canary only: 5 fixed · 0 dropped · 0 deferred** (backlog 642 → 637).
The full run was never launched. PR 616 is out of draft; the branch is pushed and the working tree
is clean. **Nothing is in flight** — relaunch with the command below to continue, or open a fresh PR
from the same branch.

Verified at wrap-up: no `burndown.mjs` or `claude -p` process running; `HEAD` == `origin/<branch>`;
all 5 per-commit comments posted and the store drained (`capture` reports
`skipped 5 already
posted`); CI green on the head commit (Quality + Tests both success).

The one thing the canary could not validate: it ran **before** the tiering fix, so every finding
used Opus and the `sonnet` minor tier is still unproven on this backlog. Read the first few
`impl model: sonnet (P4)` findings of the next run closely.

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

The canary measured **9.2 min/finding at $2.63** — but it ran before the tiering fix below, so every
one of its findings used Opus. That rate over the remaining backlog is ~97 h; the projection above
is the post-fix expectation. Dollar figures are notional on a Claude subscription — the real ceiling
is the usage window.

## Driver fix landed before the full run — tiering was off for the whole backlog

`findingPriority()` read the priority from a leading `[P<n>]` **title** tag. This backlog's staging
format (PR #614) tags titles by category — `[Maintainability] …` — and states the priority on a
`**Priority:** P4` **body** line, so all 642 findings scored as unknown and fell back to
`MODEL_IMPL`. Impl-model tiering was silently disabled for the entire run.

Nothing reports this: the driver's tiering log line only prints when tiering *fires*, so its absence
is indistinguishable from a backlog with no P4/P5 findings.

Fixed by giving `findingPriority` a second `body` argument with a body-line fallback, the title tag
still winning where both appear; the driver already had the full entry text in scope at the call
site. Verified against the live backlog: all 637 remaining findings now resolve a priority (zero
unknown) and **407 route to `MODEL_IMPL_MINOR`**. The body-fallback test was mutation-tested against
the previous implementation and fails there.

**Consequence for review:** the canary exercised only the Opus path, so the minor tier is unproven
on this backlog. Read the first few `impl model: sonnet (P4)` findings of the full run closely
rather than assuming that path is sound.

## Risks & next 3 steps

1. ~~Open the draft PR.~~ Done — PR 616, draft.
2. ~~Canary + audit.~~ Done and clean — see **Canary** below. Both comments posted; store drained.
3. **Run the loop until the backlog is drained**, relaunching after each container reclamation with
   the command above. Re-arm the `run.log` monitor every ~30 min (Monitor clamps to 30 min
   regardless of requested timeout), drain the comment store as it fills, and watch CI.

### Canary — 5 fixed, 0 dropped, 0 deferred, 46 min, $13.12

| sha          | finding                                    | rounds | elapsed  |
| ------------ | ------------------------------------------ | ------ | -------- |
| 646bad82112e | `stopDrawing` untracked-pointer early exit | 1      | 33.7 min |
| 8d77bb08ca60 | Single-source the toolState→engine push    | 0      | 9.1 min  |
| 1ef7b34fbd76 | Extract `alphaDataHasInk` predicate        | 0      | 4.2 min  |
| 0dd208ffd19f | Drop `resetEmptyScanScratch` test seam     | 0      | 4.5 min  |
| 369d4a7d3f50 | Derive engine default line width           | 0      | 3.7 min  |

* **Entry accounting exact.** Each fix deleted exactly one `###` entry; the one `removed=0` commit
  (7ad1aaa) is iter0001's intermediate fix round, as designed. Identity closes: 642 − 5 = 637 =
  `pop.mjs --count`.
* **Resume handoff confirmed** on iter0001. The impl round created a `finishStrokeGroup()` helper;
  the fix round reports "`releaseAllPointers` now calls `finishStrokeGroup()` instead of re-inlining
  the sequence" — refining its own construct, not re-deriving from review text. Zero
  `no impl session` lines.
* **The adversarial loop did real work.** iter0001's reviewer rejected the first attempt because the
  relocated commit-at-discard behaviour had no test and the existing harness structurally could not
  produce the required pointer ordering. The implementer added a `pointerEventsSync` seam plus three
  specs and verified each fails against the pre-fix engine by temporarily reverting the hunks.
* **No behavior smuggled inside a refactor.** Checked by hand against the three shapes the skill
  names:
  * `DEFAULT_LINE_WIDTH_PX = getStrokeWidthPx(DEFAULT_SIZE)` — value-preserving and intentional:
    `DEFAULT_SIZE` is 3 and `SIZE_TO_PX[3]` is 8, the exact literal replaced.
  * The `alphaDataHasInk` extraction is loop-identical (early `break` → early `return true`), and
    its new tests use zero `as` casts — they are genuine threshold/boundary cases.
  * The toolState dedup collapsed three `$effect`s into one. `activeStrokeSize()` already read
    `toolState.brush`, so no dependency was added. The one real change: a stroke-size change now
    also fires `setCrayonMode`/`setMagicMode`. Both are semantically idempotent —
    `ensureMagicSheet()` early-returns, and `warmCrayonTiles` schedules an idle warm of a
    `colorTile` cache memoized on `color@pass` — so this is a negligible redundant call on a rare
    interaction, not a regression. Eraser was correctly left out (never restored from storage).
* **CI: `cancel-in-progress` thinned intermediate coverage, as documented.** Findings 2–4 pushed
  faster than a CI run completes, so runs 30409000626 / 30409221348 / 30409459299 were cancelled.
  Finding 1's run passed in full. Judge the run by the final CI result plus the per-finding gates,
  not by a green tick on every commit.

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

## Open: a reproducible E2E flake that will tax every UI-touching finding

**Unfixed.** Investigated at wrap-up and left alone deliberately — four candidate fixes were tried
and all four falsified, and shipping unverified churn to a shared test harness is worse than leaving
the evidence. Fix this **before** the next long run: `E2E_CMD` carries `--retries=1`, so it never
reddens a gate, but every UI-touching finding pays its wall-clock and each implementer re-diagnoses
it from scratch (the canary's first finding already did, reproducing it against a reverted tree).

**Reproduce deterministically:**

```bash
npm run test:e2e -- tests/multitouch.spec.ts tests/engine-pointer-recovery.spec.ts \
  --repeat-each=3 --retries=0 --project=chromium
```

**Evidence gathered:**

* **6 of 60 fail together; 18 of 18 pass alone** (`multitouch.spec.ts --repeat-each=6`). So it is
  cross-spec interference on the shared `/dev/engine` harness, not anything inherent to the spec.
  Only `multitouch.spec.ts` ever fails; `engine-pointer-recovery.spec.ts` never does.
* Two symptoms, one cause:
  `TypeError: Cannot read properties of undefined (reading
  'nonTransparentCount')` on the test's
  *first* `__engine` call, and `#engineCanvas` never appearing within 30 s. Both mean the document
  went away after `beforeEach`'s readiness poll succeeded.
* A `framenavigated` probe showed **3 navigations to `/dev/engine` per test load**, so the page is
  genuinely reloading after mount. The suspected source is the PWA service worker — the preview
  build ships it and `web/src/lib/pwa/updates.ts:163` calls `window.location.reload()` on
  `controllerchange` — but see the falsified list below; that link is **not** established.

**Falsified — do not retry these without new evidence.** Each left the count at exactly 6/60:

1. `waitUntil: 'load'` instead of `'commit'` (theory: the poll was answered by the outgoing
   document).
2. Polling the capability (`typeof window.__engine?.nonTransparentCount === 'function'`) rather than
   the separate `__engineReady` flag.
3. A 1 s continuous-readiness settle streak before handing the page to the spec.
4. `test.use({ serviceWorkers: 'block' })` in `engine-harness.ts` — note this did not verify that
   `test.use` from an imported helper actually applies, so the service-worker theory is untested
   rather than disproven.

**Next moves, cheapest first:** confirm whether `test.use` in the helper took effect (assert
`context.serviceWorkers()` is empty) before writing the SW theory off; instrument *what* triggers
the reloads rather than guessing; and note that `multitouch.spec.ts:44` violates the repo's own
testing rule (`expect(await count()).toBe(n)` should be `await expect.poll(() => count())`), which
would at least make one of the three failing tests ride through a transient.

A wider signal worth chasing at the same time: the canary implementer reported the full suite at
**159 passed / 24 flaky**. That is a lot of amortised cost across a 637-finding backlog.

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
