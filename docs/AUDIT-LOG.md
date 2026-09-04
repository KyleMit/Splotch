# Audit Log

A committable history of every audit-skill run. Each audit appends **one entry here when it runs**
(see `.claude/audit-conventions.md` §2). Most recent first.

An entry is two parts: a row in the index below — date, and the audit name linked to its section —
and an `## <date> · <audit>` section further down holding the summary. Keep the index to those two
columns; all the prose goes in the section, where it wraps at the normal line width instead of
stretching the table. The findings themselves live in `docs/AUDIT.md` (or the audit's own report),
not here.

When a day already has an entry for the same audit, suffix every one of that day's headings with
`(run N)`, numbered chronologically so the earliest run of the day is `run 1`. A new run then takes
the next number and no existing anchor changes.

Entries dated before 2026-07-06 were reconstructed from the git history of `docs/AUDIT.md` (formerly
`docs/TODO.md`) and its inferred source.

| Date       | Audit                                                           |
| ---------- | --------------------------------------------------------------- |
| 2026-08-07 | [burn-down-audits](#2026-08-07--burn-down-audits-run-3)         |
| 2026-08-07 | [burn-down-audits](#2026-08-07--burn-down-audits-run-2)         |
| 2026-08-07 | [audit-triage](#2026-08-07--audit-triage)                       |
| 2026-08-07 | [burn-down-audits](#2026-08-07--burn-down-audits-run-1)         |
| 2026-08-06 | [burn-down-audits](#2026-08-06--burn-down-audits)               |
| 2026-08-05 | [vet-audits](#2026-08-05--vet-audits)                           |
| 2026-08-05 | [session-audit](#2026-08-05--session-audit)                     |
| 2026-08-05 | [burn-down-audits](#2026-08-05--burn-down-audits-run-2)         |
| 2026-08-05 | [burn-down-audits](#2026-08-05--burn-down-audits-run-1)         |
| 2026-07-29 | [burn-down-audits](#2026-07-29--burn-down-audits-run-3)         |
| 2026-07-29 | [burn-down-audits](#2026-07-29--burn-down-audits-run-2)         |
| 2026-07-29 | [burn-down-audits](#2026-07-29--burn-down-audits-run-1)         |
| 2026-07-28 | [burn-down-audits](#2026-07-28--burn-down-audits-run-2)         |
| 2026-07-28 | [code-audit](#2026-07-28--code-audit)                           |
| 2026-07-28 | [burn-down-audits](#2026-07-28--burn-down-audits-run-1)         |
| 2026-07-28 | [deferred-triage](#2026-07-28--deferred-triage)                 |
| 2026-07-27 | [deferred-triage](#2026-07-27--deferred-triage)                 |
| 2026-07-27 | [session-audit](#2026-07-27--session-audit)                     |
| 2026-07-27 | [burn-down-audits](#2026-07-27--burn-down-audits-run-3)         |
| 2026-07-27 | [burn-down-audits](#2026-07-27--burn-down-audits-run-2)         |
| 2026-07-27 | [burn-down-audits](#2026-07-27--burn-down-audits-run-1)         |
| 2026-07-26 | [burn-down-audits](#2026-07-26--burn-down-audits-run-4)         |
| 2026-07-26 | [burn-down-audits](#2026-07-26--burn-down-audits-run-3)         |
| 2026-07-26 | [burn-down-audits](#2026-07-26--burn-down-audits-run-2)         |
| 2026-07-26 | [burn-down-audits](#2026-07-26--burn-down-audits-run-1)         |
| 2026-07-25 | [burn-down-audits](#2026-07-25--burn-down-audits-run-4)         |
| 2026-07-25 | [burn-down-audits](#2026-07-25--burn-down-audits-run-3)         |
| 2026-07-25 | [burn-down-audits](#2026-07-25--burn-down-audits-run-2)         |
| 2026-07-25 | [burn-down-audits](#2026-07-25--burn-down-audits-run-1)         |
| 2026-07-24 | [burn-down-audits](#2026-07-24--burn-down-audits-run-2)         |
| 2026-07-24 | [burn-down-audits](#2026-07-24--burn-down-audits-run-1)         |
| 2026-07-23 | [code-audit](#2026-07-23--code-audit-run-2)                     |
| 2026-07-23 | [session-audit](#2026-07-23--session-audit)                     |
| 2026-07-23 | [fix-audits](#2026-07-23--fix-audits)                           |
| 2026-07-23 | [vet-audits](#2026-07-23--vet-audits)                           |
| 2026-07-23 | [code-audit](#2026-07-23--code-audit-run-1)                     |
| 2026-07-22 | [session-audit](#2026-07-22--session-audit)                     |
| 2026-07-22 | [lighthouse-audit](#2026-07-22--lighthouse-audit)               |
| 2026-07-17 | [dependency-health-audit](#2026-07-17--dependency-health-audit) |
| 2026-07-17 | [session-audit](#2026-07-17--session-audit)                     |
| 2026-07-14 | [fix-audits](#2026-07-14--fix-audits-run-2)                     |
| 2026-07-14 | [vet-audits](#2026-07-14--vet-audits-run-2)                     |
| 2026-07-14 | [vet-audits](#2026-07-14--vet-audits-run-1)                     |
| 2026-07-14 | [extract-audit](#2026-07-14--extract-audit)                     |
| 2026-07-14 | [lighthouse-audit](#2026-07-14--lighthouse-audit)               |
| 2026-07-14 | [code-audit](#2026-07-14--code-audit)                           |
| 2026-07-14 | [fix-audits](#2026-07-14--fix-audits-run-1)                     |
| 2026-07-14 | [session-audit](#2026-07-14--session-audit)                     |
| 2026-07-12 | [session-audit](#2026-07-12--session-audit)                     |
| 2026-07-10 | [fix-audits](#2026-07-10--fix-audits-run-2)                     |
| 2026-07-10 | [session-audit](#2026-07-10--session-audit-run-2)               |
| 2026-07-10 | [fix-audits](#2026-07-10--fix-audits-run-1)                     |
| 2026-07-10 | [session-audit](#2026-07-10--session-audit-run-1)               |
| 2026-07-09 | [fix-audits](#2026-07-09--fix-audits-run-2)                     |
| 2026-07-09 | [session-audit](#2026-07-09--session-audit-run-2)               |
| 2026-07-09 | [fix-audits](#2026-07-09--fix-audits-run-1)                     |
| 2026-07-09 | [session-audit](#2026-07-09--session-audit-run-1)               |
| 2026-07-08 | [fix-audits](#2026-07-08--fix-audits)                           |
| 2026-07-08 | [session-audit](#2026-07-08--session-audit)                     |
| 2026-07-07 | [fix-audits](#2026-07-07--fix-audits)                           |
| 2026-07-06 | [vet-audits](#2026-07-06--vet-audits)                           |
| 2026-07-06 | [code-audit](#2026-07-06--code-audit)                           |
| 2026-07-06 | [fix-audits](#2026-07-06--fix-audits)                           |
| 2026-07-05 | [lighthouse-audit](#2026-07-05--lighthouse-audit-run-2)         |
| 2026-07-05 | [lighthouse-audit](#2026-07-05--lighthouse-audit-run-1)         |
| 2026-07-03 | [vet-audits](#2026-07-03--vet-audits)                           |
| 2026-07-03 | [code-audit](#2026-07-03--code-audit)                           |
| 2026-06-25 | [dependency-audit](#2026-06-25--dependency-audit)               |
| 2026-06-25 | [code-audit](#2026-06-25--code-audit)                           |

## 2026-08-07 · burn-down-audits (run 3)

Bulk burndown on PR [#865](https://github.com/KyleMit/Splotch/pull/865) (branch
`audit/burndown-20260807-2`): **33 fixed · 1 dropped · 6 deferred**, backlog 40 → 0. The accepted
work covered user-facing correctness, API validation and policy sharing, native-shell behavior,
performance and production-asset hygiene, cross-file drift guards, type safety, and generated
documentation accuracy. `docs/AUDIT.md` was deleted after the zero-count check.

The dropped full-resolution asset finding contradicted the experiment directories' documented
reproducibility contract and misstated their contents. Four implementation/review deferrals retain
three reusable patches plus one sandbox-boundary post-mortem; the final two findings were deferred
without implementation when the isolated verifier repeatedly returned empty envelopes. All six are
recorded in `docs/AUDIT-DEFERRED.md`.

Every accepted finding passed deterministic local gates and an isolated adversarial review. The
supervisor checkpointed at most five outcomes per segment, required exact-head GitHub Actions green
between segments, and posted per-commit explanations on the PR. No stable visible UI changed, so the
PR does not need screenshot evidence; the native shell change affects only transient prepaint
backgrounds before the web view renders.

## 2026-08-07 · burn-down-audits (run 2)

Bulk burndown on PR [#830](https://github.com/KyleMit/Splotch/pull/830) (branch
`claude/audit-burn-down-vf4iui`), the first campaign against the triaged backlog rather than the raw
tail: **29 fixed · 0 dropped · 0 deferred**, backlog 72 → 43, across a 5-finding canary and a
24-finding unattended run wrapped on request. The *Silent wrong output* group drained completely —
all 25 findings — and its section was removed. The other 4 fixes came from *App correctness*, which
went 16 → 12.

**Zero drops and zero deferrals is the result worth recording**, because it is the first campaign
where that happened and it is a direct measurement of the triage. Previous runs against the
untriaged backlog produced clusters of stale `INVALID` drops (a consolidation commit orphaning every
finding that named the moved code) plus roughly one deferral per twenty findings. Here every finding
the verifier examined was still real at HEAD and every one survived adversarial review. The
corollary for the next run: with a curated backlog, a drop should be read as the verifier being
wrong rather than the backlog being stale — the inverse of the old assumption.

The base commit was green, but was verified rather than assumed: all seven `CHECK_CMD` gates and all
three unit tiers were run **individually** at `main`, not `&&`-chained, so no red gate could hide
behind an earlier one. That mattered on the previous run, where `main` was silently red.

Quality signals across the 29: **no eslint `max-lines` cap was raised, no ratchet baseline widened,
and no allowlist touched** — the goalpost-moving that took 3 of 43 findings on the 2026-07-29 run
did not recur, and one finding explicitly dropped an optional test rather than raise a cap it was
sitting against. The reviewer rejected the first attempt on roughly a third of findings, twice for
regression tests that were *vacuous* (passing identically before and after the fix); both were
rebuilt and verified red-before-green. A cluster of findings improved the burndown harness itself —
the iteration tag now counts drops so envelopes cannot be clobbered, `resolveImplSha` no longer
trusts an LLM-authored SHA over git, a failed final push now warns and exits non-zero, and
`audit:status` stops counting drops as completions.

One blemish, left in place deliberately: 132a7c20ba48 raised `testTimeout` 5s → 20s in
`drawingSound.test.ts` and `aiImage.test.ts` to clear a red gate. The change is sound in itself
(named constants, no assertions touched) but is a flake mitigation attributable to no finding, so it
belongs in its own commit, and its diagnosis was by analogy — the implementer states the exact
failure was not reproduced. Splitting it would now require rewriting pushed history; it is recorded
here and on the PR instead.

## 2026-08-07 · audit-triage

Manual triage pass over the whole of `docs/AUDIT.md`, run on request to decide whether the backlog
was still worth spending on: **346 findings cut to 75, the other 271 deleted.** No code changed and
no issues were filed — this pass only decided what deserves to survive.

The question behind it was whether to keep burning down the backlog or drop it and wait for real bug
reports. The evidence said neither, quite. The value *had* been extracted: two `vet-audits` passes
had already drained the severity head into issues #774–#785 and successive burndowns had fixed
roughly 300, so what remained was by construction the tail — **zero P1, and 183 of 346 (53%) sitting
in P4/P5.** The composition had also shifted away from the product: only ~108 of the 346 were in
shipped `web/src/` code, against ~238 in tooling, tests, config, and docs. Continuing uniformly
meant paying full verify → implement → review cost to rename constants in the asset-gen pipeline.

But "wait for bug reports" was wrong for one specific class, and that class became the first keep
criterion. A meaningful share of the remaining Correctness findings are **instruments that lie**:
`perf:undo` presenting last-scenario frame and heap metrics as session-wide, `heapBefore ?? 0`
rendering "unavailable" as a confident zero, `diffGoldenPage` silently skipping metric paths missing
from the score shape so a renamed producer key disables its own gate, `cost.mjs` reporting zero
tokens for every Claude run, `status.mjs` counting invalid drops as completions. Nobody files a bug
against a number that is wrong but plausible — they just make decisions on it. Three were
spot-checked against `main` and confirmed still live before the pass committed to the criterion.

The five criteria, in the order they are grouped in `docs/AUDIT.md`:

| Group                               | Kept | What earns a place                                                             |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------ |
| Silent wrong output                 | 26   | Produces a confident wrong answer, or lets a failure pass as success           |
| App correctness reaching users      | 16   | Behaviour defects in shipped `web/src/` and native-shell code                  |
| Safety, resource, ships-to-prod     | 10   | Unbounded work, unvalidated input reaching a shell, unpinned remote code       |
| Cross-file agreement held by prose  | 14   | Two sides that can diverge *silently* and ship — one already has               |
| Documentation that misdirects       | 8    | Read as instruction by an agent or contributor, and sends them somewhere wrong |
| Coverage gaps on load-bearing paths | 1    | Untested surface whose silent breakage is expensive and not otherwise visible  |

What went, went by category rather than by luck: 98 Maintainability, 60 Readability, 29 Testing, 24
Docs, 16 Performance, 14 Architecture. The 11 deleted Correctness findings were the ones whose
failure mode is loud and cheap — a script that crashes when run from the wrong cwd announces itself.
18 P2s were deleted too, which is the point of the exercise: P2 is a *within-section* rank, so a P2
in the asset-gen tests never meant what a P2 in the drawing engine meant.

Two structural notes. Findings are grouped by criterion rather than by the usual `## Source:
<audit>` sections, because after a triage pass the criterion is the argument for keeping a finding
and the source is not; `.claude/audit-conventions.md` §1 now documents the curated-group shape
alongside the producer shape, and the burndown parser is heading-agnostic so `pop.mjs --count` reads
75 unchanged. And every citation in the file is still pinned to `9ae62ff1` from 2026-07-28 — all
cited paths were re-checked and still exist, but line numbers have drifted through several hundred
fixes, so the header now tells whoever picks one up to re-verify first.

The deleted 271 are recoverable from this file's git history and were deliberately not moved to
`docs/AUDIT-DEFERRED.md`: parking them there would recreate the same standing backlog under a
different name.

**The intake is the actual defect.** 649 raw findings came from a single comprehensive per-section
sweep with no scope boundary — it audited the workshop as thoroughly as the product. Scope the next
`code-audit` to shipped `web/src/` plus surfaces that changed since the last run, so the backlog
never again reaches a size that needs a pass like this one.

## 2026-08-07 · burn-down-audits (run 1)

Bulk burndown on PR [#821](https://github.com/KyleMit/Splotch/pull/821) (branch
`claude/audit-burn-down-727egi`), forked fresh from `main` because the previous campaign's PR #805
had merged: **20 fixed · 0 dropped · 1 deferred**, backlog 367 → 346, across a 5-finding canary and
a 16-finding unattended run wrapped on request. Work concentrated in the actions panel and its
flyouts, the drag-to-clear gesture, and the install banner / crash screen. One `## Source:` section
(Core UI controls) drained completely and was removed.

**The base commit was red before any finding ran, and repairing it was the run's precondition.**
Running the composed gates at `main` surfaced two failing Quality gates left by the settings-icon
refresh merged hours earlier: `img:audit:check` (11 un-optimized SVGs) and `lint:dead` (knip
flagging `PUNCHED_BACKGROUND_STYLES`, exported but consumed only inside its own module). Both sit in
`CHECK_CMD`, so left alone they would have gated every finding red, burned a fix round each, and
halted the run on three consecutive deferrals. Repaired in 3ba2b5666e4b. Two things that repair
taught: the icon fix **cascades** — `scrapbook/index.html` inlines `line-weight.svg` as a card
emoji, so `scrapbook:check` passed at base and went red only *after* `img:audit` ran — and nothing
in the repo asserts an optimized SVG still *renders* the same, so all 11 were rasterized at 384 DPI
before and after and pixel-compared (zero pixels differing past an 8/255 threshold). The reason
nobody noticed: the merge commit b8f7013283f8 has **no CI run at all**, because `test.yml` sets
`cancel-in-progress` and its push run was cancelled.

**GitHub Actions was not running for the whole session** — runs sat `queued` for hours and PR #821
never had one created — so the cross-finding backstop was absent. Substituting `PUSH_TEST_CMD='npm
test'` would have cost ~5–6 min across 346 findings, so the full suite was run locally instead:
green at the base commit, at the canary head, and at the final head (2193 unit + 279 e2e).

The adversarial reviewer rejected roughly one fix in three. Its sharpest catch was a **vacuous
test**: extracting the global Ctrl+Z shortcut into `lib/boot/undoShortcut.ts` left an existing
Playwright test asserting a cue that the new keyboard path can no longer trigger, so both assertions
passed trivially — it demanded the test be rewritten to the new contract *and* that a test actually
prove the route-level listener works. It also caught that a comment merely *mentioning*
`@vitest-environment` is honoured by vitest from any leading comment, which had silently moved
`app.html.test.ts` onto the node environment; and that renaming `data-drawer-open` would leave every
test green while the boot script diverged.

No goalposts moved: `eslint.config.js` is untouched and no `max-lines` cap was raised. The one
ratchet edit went the *right* way — a red `lint:tokens` gate caused by a fix being an improvement
(hoisting a shared `#000` keyline out of three components) was resolved by bumping `app.css` 2 → 3
and **deleting** three now-zero allowlist entries. The single deferral was a type-check failure that
rolled back cleanly with a post-mortem and an applicable draft patch.

## 2026-08-06 · burn-down-audits

Bulk burndown on PR [#805](https://github.com/KyleMit/Splotch/pull/805) (branch
`claude/audit-burn-down-72heuj`), forked fresh from `main` because the previous campaign's PR #771
had merged: **54 fixed · 4 dropped · 2 deferred**, backlog 427 → 367, across a 5-finding canary and
a 55-finding unattended run. Work concentrated in the admin console and token backend, the app shell
and dev harness, and the design-system/icon layer — four `## Source:` sections drained completely
and were removed.

The correctness fixes were the valuable half: `installWakeLock`'s teardown never released its
sentinel, so navigating off the drawing route held the screen awake for the tab's life; a failed
first wake-lock request was never retried, so one unlucky tap disabled screen-sleep prevention for
the whole session; `mountBootHiddenOverlays` discarded its idle-callback cancel handle and mounted
overlays after unmount; `StatusMessage`'s explicit `aria-live="polite"` silently downgraded its own
`role="alert"`; and `Disclosure`'s chevron rotation only worked because every caller happened to
blockify the pseudo-element from outside.

The adversarial reviewer rejected roughly one fix in four, and twice caught the same subtle failure:
a fix that removed one hand-written copy of a closed set while leaving or creating another, so the
new drift guard would have stayed green through exactly the divergence it was written to catch. It
also rejected rewriting an ADR's Decision paragraph in place (retroactively falsifying what that
decision recorded) in favour of a dated amendment. On the `Disclosure` fix the implementer then
found the reviewer's *own* proposed assertion insufficient — Chromium reports a specified transform
matrix even on a non-transformable inline box — and proved it by reverting the fix and watching the
test still pass.

All four drops were stale rather than wrong: three targeted files that ADR-0096's design-system
consolidation had deleted, and the fourth named four icons as deferrable when three are core toolbar
icons rendered on first paint. Both deferrals were 3-round review exhaustions that rolled back
cleanly, each leaving a post-mortem and an applicable draft patch under `docs/audit-deferred/`.

One incidental repair worth noting: an implementer diagnosed a red gate as a pre-existing 1-in-49
flake in the parental-gate backspace test — a fixed digit typed into a randomly generated challenge
auto-submitted when `randomOperand()` drew 3×3 — reproduced it by pinning `Math.random`, and fixed
it in its own commit (e1e4810bfb33).

## 2026-08-05 · vet-audits

Partial drain of the high-priority head of `docs/AUDIT.md`, run on request rather than as a full
vetting pass: **12 findings filed as issues #774–#785**, backlog 436 → 424. Scope was every P1 in
the file (8) plus four P2 correctness findings whose blast radius outranked their within-section
rank — priority in that file is ranked *within* each section, so a P1 in the agent-instruction
section and a P2 in the drawing section are not comparable.

From the P1 set: the Blobs-degraded token mutation that reports success while a revocation
evaporates (#774), the unguarded Clear Button under ADR-0038's Scribble contract (#775), picker taps
dropped in the very hexagon gaps the snap machinery exists to catch (#777), the internal
COLORING-BOOK planning doc served publicly from `web/static/` with third-party IP character rosters
(#781), the burndown.mjs step-extraction refactor (#782), CONTRIBUTING.md's three wrong server
env-var names (#783), run-splotch's driver committing the orphaned-vite anti-pattern its own
SKILL.md forbids (#784), and the testing/run-splotch skills citing spec files deleted in the spec
split (#785).

Promoted from P2 on severity: the cache-bust redirect that discards an in-progress drawing after
every deploy (#778), release.mjs's hand-rolled flag parsing where a typo'd `--dry-run` performs the
real release (#780), pinchTextZoom's phantom-pointer leak that deadens every subsequent tap (#776),
and the api-smoke burst that can still create real GitHub issues (#779).

Three findings were re-checked against the tree at 0feabf0a8ce7e8e2ca73750ff0ded2ff977f6129 and
confirmed still live — `web/static/coloring/COLORING-BOOK.md` present, `parseReleaseArgs` still on
`args.includes`, `checkVersionMismatch` still unguarded. The rest carry the 2026-07-28
adversarial-verification blockquote or were filed as written. Nothing was dropped: this pass filed
only, and the remaining 424 findings still await a full `vet-audits`.

## 2026-08-05 · session-audit

Retrospective on a session that addressed a nine-comment review round on PR #771, wrote the
`ai-image-offscreen-canvas` handoff, and filed issue #772. Filed four instruction/doc findings, all
scoped to wording changes that would have prevented the friction.

Lead finding: the `testing` skill warns against raw `npx playwright test` and names the exact error
it produces, but its Vitest sibling one screen up carries no equivalent warning and no filtering
example — and neither block says that paths after `--` resolve relative to `web/`. Running one new
unit test took four attempts, and the raw-`npx` failure surfaced as `Tests  no tests`, a load
failure wearing the shape of a result. Also filed: partial `vi.mock` factories breaking when the
mocked module gains an export (the testing analogue of the repo's own cross-file-agreement rule);
`create-handoff` citing a worked-example handoff that its own folder lifecycle guarantees will be
deleted; and "Writing on GitHub" covering auto-linking but not tag stripping, which silently
truncated a sentence in issue #772.

Passed on three candidates that did not clear the recurrence bar: a single unreproducible unit-test
flake (unnamed, possibly pre-existing, flagged on the PR instead); a guessed ADR filename caught by
this session's own verification step; and the escalated-review-thread handling, which
`address-pr-review` already covers correctly.

## 2026-08-05 · burn-down-audits (run 2)

Scripted burndown on
[`claude/audit-burndown-overnight-6isff3`](https://github.com/KyleMit/Splotch/pull/771): **31
fixed**, 1 dropped and 5 deferred across 37 findings; backlog 473 → 436. Three driver sessions — a
5-finding canary, a 22-finding overnight run, and a 4-finding run after a mid-campaign pause — each
finding going through verify → implement → adversarial review → fix inside one-shot `claude -p`
subprocesses.

`BUDGET_IMPL` was raised 4.00 → 7.00 after the canary. Every other role call finished under $2
(verify peaked at $0.94, review at $0.89 against $3.00 caps), but a three-component extraction hit
exactly $4.0036 on its fix round and deferred — the cap was binding only on multi-file extraction
fix rounds, which are common in a code-audit tail. No budget deferral followed the raise.

The run was paused once, on a red CI run rather than on any driver signal. `startup-bundle.spec.ts`
failed — the save pipeline had been pulled onto the startup critical path — and `git bisect` over a
build-and-grep script pinned 42960c3fbf84, which had implemented a finding that read
`saveFolder.svelte.ts`'s inlined support check as duplication maintained by prose. The inlining was
deliberate: that module is on the startup path and reaches the save pipeline only through a dynamic
import, so a static import into `lib/drawing/` — even of a six-line predicate — gives the bundler an
edge into the save graph, and Rollup's re-partitioning landed `screenshotFeedback`'s body in a
modulepreloaded chunk. The failing marker named a module the commit never touched, so bisect rather
than diff-reading was the path to attribution. 62236bff532c reverts it and 0ef58358e0fd rewrites the
comment to state the constraint and name the enforcing spec; the finding was not re-staged, because
its premise is wrong as written. Bundle composition is invisible to the type-check, unit, lint and
targeted-E2E gates by construction, so the draft PR's CI was the only thing that could have caught
it.

The five deferrals had five distinct causes — implementer budget cap, a genuine review rejection, a
verifier turn cap, a verifier that returned `verdict: VALID` without writing its brief, and an
implementer turn cap — so no mechanism recurred and none met the bar for intervention. Both turn
caps landed on sweeping multi-file findings. The single drop was a finding already fixed since its
pin. No eslint `max-lines` cap was raised and no ratchet baseline widened across all 31 fixes; the
one ratchet edit lowered a raw-hex baseline to 0 after a dead declaration was removed. Entry
accounting reconciles exactly: 473 − 37 == 436 == `pop.mjs --count`, with commit-derived deferral
and drop counts matching the run logs independently, and `capture` reporting `skipped 31 already
posted` against 31 fixes. Four `## Source:` sections were emptied and removed in the closeout.

## 2026-08-05 · burn-down-audits (run 1)

Hand-driven cherry-pick on
[`claude/audit-burndown-sprint-ewc5s2`](https://github.com/KyleMit/Splotch/pull/770): **58 fixed**
and 4 dropped across 62 findings, one commit each; backlog 535 → 473. The scripted driver was not
used — the brief was to take only findings small enough to verify and implement completely in a
couple of minutes and leave the larger ones in place, so selection ran over the shortest P4/P5
entries and every fix was written, gated, and committed inline.

The work concentrated on naming (tuning literals gaining their units, constants moving beside what
they document, sentinels and magic bytes getting names), dead code (unreachable CSS rules and
guards, inert component state, speculative exports), and cross-file agreements that were being held
by prose — which produced three new drift guards: `scripts/tests/dev-ports.test.mjs`, an `appName`
pass in `check-native-app-id.mjs`, and a cwd-independence case for the Claude cloud setup script.
Two real correctness repairs landed: blank env values were parsing as `0` and silently shipping
`quality: 0` webp output, and the AI access-token scrub was replacing the whole URL rather than
deleting its own parameter.

Drift was the recurring theme, and four findings were dropped rather than force-fitted: `targetRepo`
had gained a second caller, `a11y.spec.ts` had already adopted `gotoApp`, and the two icon findings
both assumed a `KNOWN_ORPHANS` carve-out that no longer exists — the /design styleguide now
references both icons, so deleting them would break it. Three more findings were fixed only in part
because the rest had already landed (`releases/README.md`'s path, `/dev/design` having moved to the
public `/design` route), with the drift recorded in the commit and the PR comment.

Every fix commit deleted exactly one backlog entry apart from the one deliberate paired drop, and
`535 − 62 == 473` reconciles against `pop.mjs --count`. New assertions were checked against
deliberately broken sources rather than assumed: the viewport-sync, blank-env, app-name, and
dev-port guards each fail when the behaviour they cover is removed. One CI failure was
self-inflicted and fixed in 17ab66b — a script-driven edit bypassed the `format-edited-file.sh`
hook, so `format:check` is now part of the per-batch gate.

## 2026-07-29 · burn-down-audits (run 3)

OpenAI Codex continuation on
[`audit/burndown-2026-07-29-codex-2`](https://github.com/KyleMit/Splotch/pull/656): **34 fixed**, 1
dropped, and 2 deferred across a five-finding canary and seven bounded supervised segments; backlog
584 → 547. Scoped post-baseline accounting is exact, every accepted fix has a per-commit PR comment,
and no commit removed more than one finding.

The run concentrated on drawing export and save correctness, AI-generation lifecycle and response
typing, MIME-aware filenames, module-state isolation, cross-file drift guards, and small
readability/design-system repairs. Adversarial review forced repairs for stale navigation and
architecture docs, asynchronous save-folder races, request-timeout accounting, E2E behavior, and
generated Ruler outputs. One finding was dropped because its claimed rotation crash path did not
exist at the pinned commit. Two findings whose verifiers returned no usable brief were preserved in
`docs/AUDIT-DEFERRED.md`.

Every bounded segment stopped for comment and exact-head CI checkpoints. One Tests job was cancelled
when an unusually slow Playwright dependency install consumed almost all of its 15-minute job
timeout; the exact-SHA rerun completed cleanly, including E2E and app-driver smoke. The session
closed on request with the remaining 547 findings still staged for a future continuation.

## 2026-07-29 · burn-down-audits (run 2)

Codex continuation on
[`audit/burndown-2026-07-29-codex`](https://github.com/KyleMit/Splotch/pull/630): **8 fixed**, 0
dropped, 1 deferred across a 5-finding canary and a bounded full-run segment; backlog 593 → 584.
Scoped log accounting is exact, all 8 accepted fixes have per-commit PR comments, and the remaining
testing finding preserved its rejected three-commit draft under `docs/audit-deferred/`.

The fixes concentrated on drawing-history internals: paper-surface creation, cold-snapshot
vocabulary and result types, fold-region naming and mutation, cheap magic-sheet gating, and
cap-boundary tests that derive from their production constants. The adversarial loop forced a cap
fixture to distinguish the guarded branch and deferred a paper-growth test whose no-shrink assertion
could pass on stale target content.

The session also self-healed the direct Codex runbook: managed hosts now request explicit
campaign-scoped repository-context consent before creating external checkpoint state, and
active-driver observation uses tool boundaries no longer than 20 seconds so pause/wrap messages are
not delayed behind compound sleep polls.

## 2026-07-29 · burn-down-audits (run 1)

Bulk burndown of the 636-finding backlog left by PR #616's merge, on
`claude/burn-down-audit-skill-ecb5np` → [PR #627](https://github.com/KyleMit/Splotch/pull/627): **39
fixed**, 4 dropped, 0 deferred across a 5-finding canary and a ~6-hour full run; backlog 636 → 593.
Entry accounting is exact — no commit drained more than one finding, and 636 − 43 consumed = 593 =
`pop.mjs --count`. All 39 fixes carry a per-commit PR comment (`capture` confirms `skipped 39
already posted`); CI green throughout.

Work concentrated in the drawing engine and its neighbours, and several findings were structural
rather than local: the WebKit merged-stream pen quirk, the crayon pass buffer, the pointer-halo UI,
and the fold-region geometry each moved into their own module, and `engine.ts`'s six parallel
callback `let`s collapsed into one record. The correctness fixes were the valuable half — a failed
magic-sheet decode that wedged the brush and the undo fold forever, an `emptyScan` scratch that
cached a broken context and then reported inked canvases as empty, and an `ensurePaperCovers` grow
path that discarded the entire committed drawing when the grown context failed.

Two things this run established that the previous one could not. **Impl-model tiering was verified
before launch rather than after** — all 636 findings parsed a priority, 407 routing to the minor
tier — and the `sonnet` path, unproven at the last wrap-up, held up: it took review rounds like any
other and produced no deferrals. And **the gate list was re-derived from `test.yml`** (the Quality
job is 11 steps now) with every candidate timed and run green at base, so no gate went red on a
pre-existing failure. `lint:tokens` earned its place immediately, catching a raw-hex baseline left
pointing at the wrong file after a component extraction.

The adversarial reviewer did real work at a rate of roughly one rejection in three: it caught a
default parameter evaluating `canvas.getBoundingClientRect()` before its own `if (!canvas) return`
guard; a paired-marks change that would have moved the two hottest ops onto WebKit's ~1 ms-clamped
mark deltas and destroyed ADR-0066's commit-hitch attribution; a four-corner-union test using a pure
scale+translate matrix, under which two corners give the identical rect, so it passed without
testing its own invariant; an LRU eviction that freed tile canvases while leaving full bitmap copies
in the pattern cache; and — the case the design specifically anticipates — **acceptance criteria the
verifier got wrong**, declaring no E2E spec covered a surface that `engine-snapshot-tier.spec.ts`
did cover. The reviewer is handed the original finding precisely because the verifier has no other
independent check.

One pattern worth a follow-up: three findings raised an eslint `max-lines` cap (`engine.ts` 900 →
913, `undoHistory.test.ts` 500 → 529) to fit their own additions. Each was pinned exactly and
disclosed, but a ratchet that yields whenever it binds stops constraining. The loop began correcting
this itself — a fourth attempt was **rejected on review** for contradicting the adjacent "shrink,
never grow" comment, and the implementer extracted a shared test harness instead, which dropped the
file under the default and let the grandfathered override be deleted outright. Worth a pass over the
remaining caps.

Left open: 593 findings, and a load-dependent `pwa-registration.spec.ts:60` flake found in the
baseline E2E run (fails under full-suite parallelism, passes 3/3 isolated) recorded but deliberately
not "fixed", since raising its timeout is wrong if the cause is a lost stroke.

## 2026-07-28 · burn-down-audits (run 2)

Opening canary of the bulk burndown of the 642-finding backlog staged by the same day's code-audit,
on `claude/audit-burn-down-skill-1s5jty` → [PR #616](https://github.com/KyleMit/Splotch/pull/616):
**5 fixed**, 0 dropped, 0 deferred; backlog 642 → 637. All five were in the drawing engine —
`stopDrawing`'s untracked-pointer fall-through, the duplicated toolState→engine push, an extracted
`alphaDataHasInk` predicate, a shipped test-only reset export, and the engine's unlinked default
line width. Each landed one commit that drained exactly one finding, with a per-commit PR comment;
CI green on the final head.

The canary audit found no behavior smuggled inside a refactor, and confirmed the adversarial loop
working: one finding was rejected on review for relocating an untested behaviour the existing E2E
harness structurally could not exercise, and the resumed implementer built the missing seam and
three differentially-verified specs.

It also surfaced a **silent tiering outage**: `findingPriority()` read the priority from a leading
`[P<n>]` title tag, but this backlog's staging format tags titles by category and states the
priority on a `**Priority:**` body line, so all 642 findings fell back to the expensive model.
Nothing logs this — the tiering line only prints when tiering fires. Fixed in the same PR with a
body-line fallback; 407 of the remaining findings now route to the minor tier. The full run was not
launched — the session was wrapped after the canary.

## 2026-07-28 · code-audit

Comprehensive per-section quality pass over the whole codebase: 31 parallel section auditors, one
per `docs/CODE-MAP.md` area (using the subcategory splits for the drawing engine, the other web/src
domains, asset-gen, and scripts), each applying the performance / readability / maintainability /
architecture lenses plus the repo conventions, deduping against the 163 open issues. **642
findings** (649 raw, less six merged by a dedup sweep and one refuted on verification) staged into
`docs/AUDIT.md` under one `## Source: Code audit — <section>` header per section, each pinned to
commit 9ae62ff1 with file/function/line citations and ranked P1–P5.

The dominant theme, by a wide margin and in nearly every section, is the repo's own "cross-file
agreement is never maintained by prose" convention being violated: mirrored constants and
vocabularies linked only by "keep in sync" comments — the `app.html` boot script's `data-*` names
and brush/theme literals, engine constants copied across the perf harness, server policy values
re-declared in E2E specs, dev/preview ports, token values baked into CSS, `chromiumExecutablePath`
in four copies, asset-gen gate thresholds re-declared in test mocks. Several have already drifted
(the scrapbook palette disagrees on six values; four asset-gen test constants no longer match their
source). Secondary themes: unnamed tuning literals against the named-constant rule; long functions
and files mixing concerns that want extraction (`engine.ts` at 1,487 lines, `undoHistory.ts`
spanning five concerns, `burndown.mjs`'s numbered-step main loop, the crayon pass-buffer subsystem
inside `strokeOps.ts`); module-scope mutable state outside a `createX()` factory forcing
`vi.resetModules` gymnastics; and CLI scripts skipping the documented `isMain` gate (~30 of 42 in
`scripts/`, none of the eight in `audit-burndown/`).

An adversarial verification sample re-checked 26 findings — every P1 plus a P2 sample — against the
cited code: 23 confirmed, 2 partial, 1 refuted. The refuted one (`forgetKey()` fire-and-forgets a
secure-storage clear) was removed: `clearSecret()` is a documented best-effort swallow that never
rejects. One P1 was narrowed — the scribbleGuard gap is real for `ClearButton` but not
`FullscreenToggle`, which never renders on a WebKit surface, the only place iPadOS Scribble exists.
Verified findings carry a dated blockquote in `docs/AUDIT.md`; the remaining ~95% are unvalidated
and still belong to the `vet-audits` skill.

Eleven P1s, five spot-verified against the code: a `perf:mount` crash (`join` used but never
imported — invisible because the `no-undef` lint carve-out covers `tools/asset-gen` but not
`scripts/**`), two Active ADRs both numbered 0077 (`create-adr`'s count-based numbering rule is
broken), an internal coloring-book planning doc listing trademarked characters publicly served from
`web/static/`, a missing `onerror` in `magicBrush.ts` that wedges the magic sheet forever, and token
mutations reporting success into the per-request memory fallback during transient Blobs failures —
including revocations that never persist. Also notable: `FullscreenToggle`/`ClearButton` violate
ADR-0038's scribbleGuard rule, and dark mode never reached the native layer (Android theme
hard-coded Light, both platforms pinning a white WebView background).

## 2026-07-28 · burn-down-audits (run 1)

OpenAI Codex bulk burndown of the 45-finding backlog re-staged from deferred-audit triage on
`audit/burndown-20260727-codex-2` → [PR #583](https://github.com/KyleMit/Splotch/pull/583): **27
fixed**, 5 dropped as invalid, stale, or not worth changing, and 13 preserved in the deferred audit
record after bounded implementation, gate, or adversarial-review rounds; backlog 45 → 0. The
successful re-runs included API request/body helpers, build-time native gating, book-path typing,
design-token alignment, shared Gemini transport, shared asset-region/morphology helpers, CLI
responsibility cleanup, and corrected asset-exploration documentation. Every accepted fix received a
per-commit PR comment, terminal commits each drained exactly one finding, rejected drafts retained
their diagnostics, and local repository/unit/script/asset/API/Ruler gates plus exact-head CI were
enforced through supervised checkpoints.

## 2026-07-28 · deferred-triage

Fanned 15 parallel triage agents over the 15 findings deferred since the 07-27 pass and drained
`docs/AUDIT-DEFERRED.md` again — this time into standing decision docs under
`docs/audit-deferred/decisions/` (verdict index in its README) instead of re-staging, so each
verdict carries its full options/pros-cons reasoning. Outcome: **13 FIX** (single clear winner each,
incl. how every recorded review objection is resolved or argued out of scope) and **2 DROP**
(capacitor-single-signal: two one-liners not worth a `.mjs`+`.d.mts` module pair;
crayon-test-helpers: the finished consolidation is empirically net **+8 LOC** and its
`setupCrayon()` provably breaks a snapshot-count invariant via `clearCanvas()`'s unconditional undo
push). Recurring discoveries: three drafts died on doc-drift objections that one `.ruler` source
edit satisfies; two died on the gitignored `web/build/` path (settled convention: build-time helpers
live as tracked `web/`-root modules per the `defines.ts` precedent); the browser-floor invariant was
confirmed stated **backwards in four places** (web iOS floor must be ≤
`IPHONEOS_DEPLOYMENT_TARGET`); `allowBackup=true` currently uploads a plaintext AI access token
while drawings already migrate via the gallery; and the flag-parsing pair settled on
convention-over-module (`node:util` `parseArgs` inline for gate scripts, perf keeps a domain-local
`args.mjs`).

## 2026-07-27 · deferred-triage

Fanned 14 parallel review agents over all **49** findings in `docs/AUDIT-DEFERRED.md` (the burndown
deferrals that failed implementation or multi-round adversarial review) and drained the file: every
finding was dispositioned (the triage docs and their index were removed once dispatched — see git
history): the 30 FIX verdicts were re-staged in `docs/AUDIT.md` with resolution guidance, the 9
OPTIONS verdicts filed as `needs-triage` issues 564-572, and the 10 DROP verdicts retired. Outcome:
30 FIX (single clear winner, incl. exactly what a resurrected draft must change to survive its
recorded review objections), 9 OPTIONS (ranked, with a stated lean), 10 DROP (half already resolved
on main by later burndown merges, half not worth the churn). Key discoveries: the pinned SHA was
stale in load-bearing ways (several findings' premises had been overtaken by PRs 544-553), two
rejected-review verdicts were reversed on evidence (handleError's `{message}` IS displayed by
SvelteKit's fallback; the box-vs-cross erosion impasse in scoreCompositeEyes has an
exact-equivalence fix), and the idea-dirs archive question was settled as "frozen evidence, thin
living Status layer".

## 2026-07-27 · session-audit

Filed one tooling finding: the generated Codex session-audit skill resolves its shared-conventions
link to nonexistent `.agents/audit-conventions.md`; use a provider-neutral path to the directly
maintained `.claude/audit-conventions.md`.

## 2026-07-27 · burn-down-audits (run 3)

OpenAI Codex continuation on branch `audit/burndown-20260727-codex` →
[PR #561](https://github.com/KyleMit/Splotch/pull/561), wrapped up on request after a 12-outcome
canary and 21 bounded supervised segments: **75 fixed**, 28 dropped as invalid, stale, or not worth
changing, and 11 deferred after bounded implementation, gate, or review rounds; original backlog 128
→ 14. The remaining findings stay staged for a future continuation, and the session audit added one
new tooling finding afterward. All 75 accepted fixes received per-commit PR comments, every handled
outcome was reconciled against the driver log, rejected drafts retain diagnostics where available,
and exact-head CI was enforced at every relaunch boundary.

## 2026-07-27 · burn-down-audits (run 2)

OpenAI Codex continuation on branch `audit/burndown-20260727` →
[PR #554](https://github.com/KyleMit/Splotch/pull/554), wrapped up on request after a nine-finding
canary and ten bounded supervised segments: **38 fixed**, 13 dropped as invalid, stale, or not worth
changing, and 4 deferred after bounded implementation or adversarial-review rounds; backlog 183
→ 128. The run concentrated on script and scrapbook maintainability: shared process/CLI helpers,
safer argv spawning and command discovery, WebView/Vite/app-driver lifecycle handling, image parsing
and Chromium-path cleanup, theme/eval drift guards, registry/card/frontmatter contracts, and focused
regression coverage. All 38 accepted fixes received per-commit PR comments, every handled outcome
reconciled against the post-baseline driver log, the remaining backlog stays staged for a future
continuation, and exact-head CI remained green through the supervised checkpoints.

## 2026-07-27 · burn-down-audits (run 1)

Claude Code bulk burndown on branch `claude/burn-down-audit-skill-hidj17` →
[PR #552](https://github.com/KyleMit/Splotch/pull/552) (five-fix canary + two unattended runs,
wrapped up on request): **47 fixed**, 4 deferred, 2 dropped; backlog 236 → 183. Cleared all three
`tools/asset-gen` sections (pipeline core, tests/samples/legacy, and the 25-idea R&D archive —
status banners, ~8 MB of regenerable/misfiled artifacts pruned) and most of `scripts` (shared
`chromiumExecutablePath`/`argFlag`/`runId`/`isMain`/`requireEnv`/`openInOS` helpers, an extracted
admin-API client and redteam report module, `api-smoke` split into eight suites, and the store-shot
scenes moved behind the rot-guarded app driver). Paused mid-run to fix a real driver bug: the lint
gate ran eslint on paths a fix had deleted or renamed away, which exits 2 and reddened the gate
unrecoverably, destroying one correct rename-only fix and mislabelling it `fix introduced a lint
violation` — now filtered by a unit-tested `lintablePaths()` (40d641b). All 47 fixes received a
per-commit PR comment, emptied source sections were removed, and CI stayed green throughout.

## 2026-07-26 · burn-down-audits (run 4)

OpenAI Codex bulk burndown on branch `codex/audit-burndown-20260726-3` →
[PR #551](https://github.com/KyleMit/Splotch/pull/551), wrapped up on request with **70 fixed**, 40
dropped as invalid or not worth changing, and 16 deferred after bounded implementation or
adversarial-review rounds; backlog 362 → 236. The run cleared the remaining gesture, persistence,
server/API, PWA, coloring-book, miscellaneous-lib/audio, and asset-generation CLI sections, then
continued into asset-generation core. It also repaired the driver so rollback and resume remove only
untracked files created by the failed role, preventing failed tests from contaminating later
findings. Every accepted fix received a per-commit PR comment, empty source sections were removed,
and the remaining deferrals retain their post-mortems and rejected drafts where available.

## 2026-07-26 · burn-down-audits (run 3)

OpenAI Codex continuation on branch `codex/audit-burndown-20260726-2` →
[PR #550](https://github.com/KyleMit/Splotch/pull/550) (five-fix canary + unattended run, stopped on
request): **24 fixed**, 8 dropped as invalid or not worth changing, 0 deferred; backlog 394 → 362.
The run centered the storage-key registry and native reconciliation order, made IndexedDB helpers
typed and retryable, unified secure-storage backends and error semantics, decomposed folder-save
persistence, and cleared smaller palette/storage maintainability findings. Every consumed entry
reconciled exactly, all implementer repair rounds resumed their original thread, every reviewer used
a fresh thread, and all 24 per-fix comments were posted.

## 2026-07-26 · burn-down-audits (run 2)

First OpenAI Codex-native canary, on branch `codex/audit-burndown-fixes-20260726` →
[PR #549](https://github.com/KyleMit/Splotch/pull/549), stacked on the runner/tooling changes in
[PR #548](https://github.com/KyleMit/Splotch/pull/548): **4 fixed**, 1 dropped as invalid, 0
deferred; backlog 399 → 394. The fixes named and centralized selection-ring geometry,
honeycomb/picker offsets, the repeated hex-center record type, and the 9×9 palette dimensions;
adversarial review caught that the first picker-token pass still left its two distinct row-overlap
magnitudes unnamed. The canary also self-healed four runner-boundary defects in PR #548: nested
Codex cannot bind Playwright’s localhost listener or write `.git/index.lock`, so the outer driver
owns E2E and commits; failed gate feedback now carries bounded command output; and reviewers inspect
the complete finding commit range instead of only the latest repair commit. Codex used `gpt-5.6-sol`
for Opus-tier roles and `gpt-5.6-terra` for Sonnet-tier roles; all four per-finding comments were
posted, the five consumed entries reconcile exactly, and the run stopped on request.

## 2026-07-26 · burn-down-audits (run 1)

Bulk burndown (canary + unattended run, halted on 3 consecutive deferrals; wrap-up requested
mid-run) on branch `claude/burn-down-audit-skill-zyb764` →
[PR #547](https://github.com/KyleMit/Splotch/pull/547): **40 fixed**, 6 dropped as invalid/stale, 4
deferred; backlog 449 → 399. Themes: gesture-action cleanup in
`dragToClear`/`pinchZoom`/`pinchTextZoom` (shared spread-tracker, named timing constants, collapsed
duplicate teardown, mid-drag `destroy()` leak fix), `colorRing`'s hex/luminance helpers (deduped
parsing, renamed a WCAG-misnomer function, named magic thresholds), and a P1 that replaced ~20
hand-derived responsive-breakpoint literals with a geometry module plus a mutation-tested drift
guard (10 mutations, each independently confirmed to redden the suite). The reviewer caught two
fixes that were green on every deterministic gate and still wrong: a font-family dedup with one
consumer (de-duplicating nothing) and a `scheduleReset`-return-value refactor whose only test
coverage was the behavior it removed, confirmed by neutering the fix and watching the test that
should catch it stay green. Two drop commits conceded the finding was factually accurate at HEAD and
dropped on judgment (excluded from `lint:tokens`'s scope; hedged/inconsistent-scope) rather than
falsity — worth knowing before reading the drop count as "how much of the audit was wrong." One drop
mis-attributed *why* a finding was stale, claiming the pinned SHA was unchanged when the finding had
actually been obsoleted by an earlier commit in this same run — verdict was still correct, only the
recorded reason was false, so the drop-commit record needs the fix, not the drop. The halt's cause
was environment, not the model: a container event mid-run reset workspace trust
(`hasTrustDialogAccepted: false`), so every subsequent `claude -p` subprocess errored immediately
(`is_error`, 0 tokens, `terminal_reason: api_error`) regardless of role, surfacing as the
ordinary-looking `implementation failed` / `verifier unavailable` deferral labels — still broken as
of wrap-up and left for the operator to fix (`/root/.claude.json`, outside repo/permission scope)
rather than worked around. All 40 fix comments posted to the PR; CI green through the canary and
most of the run, then red only on the unrelated `npm audit` registry endpoint (`invalid json
response body`, reproduced independently, zero dependency files touched) from ~04:32 onward.
(5-finding canary + unattended run, stopped on request): **10 fixed**, 3 dropped as
already-fixed-at-HEAD, 3 deferred; backlog 465 → 449. Cleared the highest-priority end first — four
P1s including the drawing shell's ~140-line inline boot sequence (extracted to `lib/boot/`), the
`app.html` pre-paint script's hardcoded key/default duplication (now drift-guarded by a test), and
two runtime `isNative()` guards swapped to build-time `__IS_CAPACITOR__` so the native bundle
tree-shakes the PWA code. Also fixed a driver path that discarded finished work: the verifier could
name `npm test` in its acceptance criteria, and an implementer that ran out of time on it declined
to commit a fully-green fix, so the criteria are now constrained to the four gates the driver
actually runs.

## 2026-07-25 · burn-down-audits (run 4)

Bulk burndown on PR #545 (5-finding canary + partial unattended run, stopped on request): 7 fixed, 1
dropped as already-fixed-at-HEAD, 2 deferred; backlog 475 → 465, mostly admin-console and API
duplication/extraction. Also fixed a driver data-loss path where a verifier returning VALID without
writing its brief handed the implementer the previous finding's brief.

## 2026-07-25 · burn-down-audits (run 3)

Third cloud run, on the 496-finding remainder of the code-audit backlog, on branch
`claude/audit-burn-down-cexhfp` → [PR #544](https://github.com/KyleMit/Splotch/pull/544). A
5-finding canary plus a full run landed **14 fixes** (one commit each), 3 dropped as already-fixed
at HEAD, 4 deferred; 475 remain. Every canary check passed, including the two that have caught real
data loss before: each commit deleted exactly one backlog entry (496 − 21 consumed = 475,
reconciling exactly), and the `--resume` handoff was confirmed *structurally* rather than by reading
a summary — within an iteration `impl` and `fix1` share one minted session id, each `review` has its
own, and none match the container's pinned `CLAUDE_CODE_SESSION_ID`. The adversarial review paid for
itself on the run's P1: deduplicating the admin login flow across both front doors, the first
implementation moved the throttle to run *after* body parsing, so a rate-limited caller sending
malformed JSON would get 400 instead of 429 and the form action would parse `formData()` before
throttling — every gate was green on that version. The reviewer named the drift with both line
ranges and proposed the two-step `beginAdminLogin(ip)` → `verify(key)` shape that shipped; the
landed fix also replaced a bucket key the two doors shared only *by string coincidence* (an inline
literal on one side, a module constant on the other) with one owner plus an integration test driving
both real handlers against the real limiter. **Deferrals now keep their reasoning and their draft**:
`defer()` records the reviewer's unresolved objections and the implementer's account of each round
into the `AUDIT-DEFERRED.md` entry, and writes the rolled-back draft to
`docs/audit-deferred/<slug>.patch` — captured before the `git reset --hard`, since the draft's
commits are unreachable afterwards and the role envelopes are gitignored, container-local, and
overwritten by the next run's same-numbered iteration (this run lost two review rounds to exactly
that collision). Two deferrals were `implementation failed` and neither was a model failure: one
brief proposed a fix that cannot compile (a re-export creates no local type binding), and one ran
against a **stale `current-brief.md`** — the verifier marked a finding VALID but never wrote its
brief, and the implementer refused to commit because doing so would have deleted an unimplemented
finding by title. That driver defect is recorded but unfixed. The run ended when the container
restarted mid-finding and left the driver wedged with no `claude -p` child; its in-flight finding
was rolled back intact and returned to the backlog.

## 2026-07-25 · burn-down-audits (run 2)

Second cloud run, on the 506-finding remainder of the code-audit backlog, on branch
`claude/burn-down-audit-skill-qd23tg` → [PR #543](https://github.com/KyleMit/Splotch/pull/543). Two
5-finding canaries landed **9 fixes** (one commit each) and 1 drop, 0 deferred; 496 remain. The run
never reached full size, because **the first canary silently destroyed three findings out of five
while reporting `5 fixed, 0 dropped, 0 deferred` with every gate green.** The driver folds the
`docs/AUDIT.md` excision in by amending *after* the review approves, so a landed burndown commit
contains its entry deletion but the commit under review does not — the reviewer saw that discrepancy
against neighbouring commits and rejected three fixes for "not deleting the entry", the implementer
complied by running `pop.mjs --delete`, and the driver's own positional `deleteFirstEntry()` then
removed what had become the first entry: the next, never-verified finding, inside a commit about
something else. Nothing flagged it — no deferral, no red gate, no log line, and the run's counts
were true as far as they went; the only tell was the backlog falling by 8 across 5 findings, and the
canary checklist's own `:(exclude)docs/AUDIT.md` is what hid it. Fixed in f389dd39 by keying
deletion on identity rather than position (`deleteEntryByTitle` at all three call sites, so a
duplicated delete is a no-op) plus a tripwire log line, with both role prompts corrected as backstop
(reviewer: the excision is the driver's job, never raise it; implementer: never touch the backlog
file); four unit tests lock it, and 6bbe678a added a canary step that counts entries deleted per
commit. All three destroyed findings were recovered from the pre-run backlog, re-filed, and
correctly reprocessed on the second canary (two fixed, one dropped as invalid — ADR-0044 documents
the SplotchyIcon `<img>` as a deliberate page-weight mitigation), which deleted exactly one entry
per finding. The same adversarial review step also earned its keep three times over: it caught a
compile-time guard inversion that would have shipped a Capacitor plugin into the web bundle, a token
"fix" that silently shrank the crash screen heading from 32px to 28px, and a new orphan-icon guard
test whose bare-substring match was permanently satisfied for `close`/`download`/`home`/`folder` —
tightening it surfaced a third real orphan. Noted for human review: the `Button` primitive finding
grew into a five-call-site migration that amended ADR-0071 and edited the `design` skill.

## 2026-07-25 · burn-down-audits (run 1)

First `burn-down-audits` session run from a Claude Code **cloud** session rather than a Mac, on the
514-finding remainder of the code-audit backlog. Two runs (5-finding canary, then a 3-finding smoke
of the reworked driver) landed **7 fixes** one-commit-each on `claude/burn-down-audit-skill-1q8v2l`
→ [PR #542](https://github.com/KyleMit/Splotch/pull/542); 1 deferred (an a11y finding the reviewer
rejected three times), 0 dropped; 506 of 613 remain. The runs were mostly a vehicle for the
environment: the canary surfaced two broken assumptions and the session cut the skill and driver
over to run cloud-native. **The `--resume` implementer handoff was silently inverted** — CCR pins
`CLAUDE_CODE_SESSION_ID`, so every `claude -p` role subprocess reported the same `session_id` and
appended to one shared transcript (167 root conversation trees in a single file), and `--resume`
therefore resolved to whichever role wrote last; walking `parentUuid` chains showed both fix rounds
attached to the *reviewer's* leaf, so the implementer had been fixing its work while holding the
critic's context, with nothing in any log to show for it. Fixed by minting `--session-id` per call
(unsetting the env var does not work), and verified on the smoke run: `fix1`'s session id is now
byte-identical to `impl`'s and the reviewer's is separate. **`gh` is structurally unusable in a
cloud container** (no github.com credential, and an `origin` the CLI rejects as a non-GitHub host),
so the driver is out of the GitHub business entirely — it commits and pushes, and the supervising
agent owns the PR and its per-commit comments through the MCP tools via a `next` → post → `done`
loop. Also: `PUSH_EVERY` 10 → 1 and the local full-suite gate off by default (CI on the draft PR is
the backstop) because the container is reclaimed mid-run without warning; comment records written
the instant a fix lands rather than held in memory; `caffeinate`/`tmux`/`pmset` deleted. Two smaller
defects found by running it: deferral and drop commits did not count toward the push cadence, so a
run ending on either left that commit unpushed; and one canary fix snapped an InstallBanner shadow
to `--shadow-pop` (opacity .18 → .3) with no screenshot gate — flagged on the PR for an eyeball.

## 2026-07-24 · burn-down-audits (run 2)

Second `burn-down-audits` session on the same 613-finding code-audit backlog, resuming after
[PR #535](https://github.com/KyleMit/Splotch/pull/535) merged. Three runs (5-finding canary, then 13
and 20 findings) landed **35 fixes** one-commit-each on `audit/burndown` →
[PR #540](https://github.com/KyleMit/Splotch/pull/540); deferred 4, dropped 3 as invalid; 514 of 613
remain. Themes: design-system consolidation (extracted `Segmented`, disclosure-chevron,
status-message, and flyout primitives; z-index scale; token-ized off-scale sizes/shadows/radii),
duplication removal across SettingsModal's sections, and a11y (`aria-describedby` on ToggleRow,
consistent radiogroup semantics). Four driver defects found and fixed mid-session, all one class — a
**tooling failure being recorded as a model verdict**: an implementer that committed but omitted the
optional `sha` had its finished fix `reset --hard`-ed away and deferred (hit 2 of 14 findings, ~$4
of Opus work once; now recovers the sha from `HEAD`), and a budget-capped reviewer was logged as
"failed adversarial review" when nothing had reviewed the code (now defers as `reviewer
unavailable`; `BUDGET_REVIEW` raised 2.00 → 3.00). Also added P4/P5 impl-model tiering to Sonnet, a
`backfill-comments.mjs` tool that reconstructs per-commit PR comments from logs + git, and
stale-`pr-number` self-heal. A multi-hour GitHub outage blocked PR creation entirely (GraphQL +
REST, HTTP 500); the 5 canary fixes' comments were banked in a committed store and drained onto #540
once it recovered.

## 2026-07-24 · burn-down-audits (run 1)

Bulk adversarial burndown of the 613-finding code-audit backlog via the `burn-down-audits` skill
(verify → implement → Opus-5 adversarial review → layered check/unit/lint/targeted-E2E gates, one
`claude -p` subprocess per role per finding). Landed 41 fixes one-commit-each on `audit/burndown` →
[PR #535](https://github.com/KyleMit/Splotch/pull/535); deferred 11 to `docs/AUDIT-DEFERRED.md`,
dropped 4 as invalid. Paused mid-backlog at the user’s request with 557 of 613 remaining, PR marked
ready.

## 2026-07-23 · code-audit (run 2)

Comprehensive whole-codebase pass: 29 parallel area agents (one per `docs/CODE-MAP.md`
section/subsection) → 613 prioritized, line-pinned (SHA `f934d43`) findings merged into
`docs/AUDIT.md` under per-section `## Source: Code audit — <area>` headers (P1×42, P2×142, P3×210,
P4×176, P5×43). Dominant cross-cutting themes: pervasive magic-value/constant duplication that
silently drifts (luma/ink thresholds reimplemented across asset-gen `lib`, storage keys with no
registry, palette hexes re-typed in tests + scripts, auth header names, HTTP status codes, z-index,
off-scale design values vs tokens); god-modules/functions to split (`engine.initDrawingCanvas`,
`SettingsModal` 771 LOC, `ActionsPanel`, `settings.svelte.ts`, `api-smoke.mjs`,
`engine.spec`/`flows.spec` ~2k LOC each); runtime `isNative()` gates that should be build-time
`__IS_CAPACITOR__`; missing shared helpers (Gemini transport + keep-best-of-N ladder reimplemented
5–6× in asset-gen bin, CLI arg parsing, canvas pixel scanners, flyout/segmented UI primitives); dead
code (unused `Button` primitive, orphan icons, vestigial Windows path-normalization post-ADR-0062);
and stale docs (`.js` references to `.ts` files, `jsdom`→happy-dom). Not yet vetted — run the
`vet-audits` skill next.

## 2026-07-23 · session-audit

Retrospective on the vet → burndown → adversarial-review session (PR #524; 10 `type:audit` issues +
the `#518` B/B triage decisions). Filed 2 findings, both about executing the burndown: (1)
`fix-audits` never describes the cloud-session execution model — subagents run async even with
`run_in_background: false`, share one working tree so the per-item loop must be serialized by hand,
and ruler-generated fixes need source-only edits + a post-commit `ruler:check`; (2) leftover
`.claude/worktrees/` agent checkouts aren't ignored by prettier/dprint/git, so `format:check` failed
spuriously on files inside them and I hand-pruned the worktrees twice. Passed on: the
`?raw`-vs-`fileURLToPath(import.meta.url)` test-read slip (self-inflicted, immediately corrected —
the codebase already uses `?raw`) and the `list_issues` 251k-char overflow (already covered by the
GitHub MCP pagination guidance + the 2026-07-22 finding). Self-healed the skill with a "forced
manual serialization is a tell against the skill that assumed concurrency" method note.

## 2026-07-23 · fix-audits

Burned down the 10 `type:audit` issues from the same-day vet run on branch
`claude/vet-audits-skill-run-0f5sze` ([PR #524](https://github.com/KyleMit/Splotch/pull/524)), one
commit per issue via a fresh subagent each. Fixed 9: `#514` verify-access-code now peeks then
charges only failed verifications (limiter unit + real-Map integration tests; 20 successes cost
nothing); `#515` `engines.node` → `>=22.6`; `#516` cheap `pendingCommandCount()` accessor off the
commit hot path; `#517` non-cloning crayon-pass accessors (pixel-parity by construction); `#519`
extracted `aiCredential.ts` + `latestRequest.ts` and deduped the superseded-response guard across
AiKeyManager/ReportForm; `#520` single `prefers-color-scheme` owner in `appearance.svelte.ts`
driving the theme-color meta from one `$effect.root`; `#521` `onDurableRestore` registry so
persisted stores self-wire their native-restore reload; `#522` shared paint-aware `iconChroma.mjs` +
a `COLOR_ICONS` guard test (caught a real gap — `trash-closed`/`trash-open` were missing); `#523`
flipped `page()` night/chalk to all-orientations defaults, dropping 96 redundant literals (resolved
BOOKS byte-identical). `#518` (ActionsPanel god-component, `needs-triage`) partially addressed —
shipped the safe `publishActionPanelState()` extraction (`Refs`, not `Fixes`) and left the
size-formula unification + flyout decomposition open as human triage decisions. Final compose check:
`npm run check` 0/0, full `npm test` green (171 E2E passed). An independent adversarial reviewer per
commit (isolated worktrees) then tried to break each diff — all 10 behavior verdicts SOLID (no
bugs); 5 non-blocking refinements applied: `engines.node` → `>=22.13` (the ESLint 10 dev-tooling
floor, not just strip-types' 22.6), single-quote-safe `COLOR_ICONS` paint regex, asset-gen
`page()`-signature doc fix, and stronger `data-off-*` + real-module native-restore tests. `#518` was
then fully resolved after human triage picked "Option B" for both open halves: named the last
size-formula magic numbers (`WORST_CASE_CHROME`/`PALETTE_BAR_RESERVE`) + added a drift-guard test
that fails if the CSS fallback literals diverge from the constants (kept the CSS literal for zero
first-paint risk), and extracted the two flyout menu popovers into
`BrushMenu.svelte`/`StrokeWidthMenu.svelte` (triggers + `openFlyout` coordination + `.action-button`
stay in the parent; `ActionsPanel` 952 → 788 lines). Both were adversarially reviewed SOLID (the
flyout extraction empirically verified the `#eraserButton` hide rule survives the scope move).

## 2026-07-23 · vet-audits

Adversarially vetted the 14 code-audit findings via five parallel area agents against current
source, ADRs, tests, and configs. Filed 10 as `type:audit` issues: `#514` (verify-access-code shared
bucket charged on success → shared-NAT lockout, `type:bug`), `#515` (`engines.node >=20.12` breaks
the 10 `--experimental-strip-types` scripts; contradicts ADR-0012), `#516` (`getHistoryDebug()`
triple-reduce on every stroke commit), `#517` (per-op `getCrayonPasses` clone in the draw hot path —
narrowed; the per-pointermove double-map was scoped out as low-value), `#518` (`ActionsPanel.svelte`
— reframed from "975-line god component" since 519 lines are CSS, down to flyout extraction +
triple-sourced size-formula + publish-effect sync hazard, `needs-triage`), `#519` (AI-credential
classify/verify + latest-request guard extraction), `#520` (dual `prefers-color-scheme` trackers),
`#521` (durable-restore reload fan-out → `onDurableRestore` registry, the strongest finding), `#522`
(`COLOR_ICONS` allowlist guard, split from finding 13), `#523` (`books.ts` 96 redundant orientation
literals, split from finding 13). Dropped 6: op padded-bounds dup (divergence inert in prod —
`crayonScale=1`, `PATCH_AA_PAD=2`); `/api` plumbing consolidation (already behind
`throttled()`/`readJsonBody()`; the "one true 429 violation" was a false positive — admin form
actions must use `fail()`, not a JSON `Response`); error-contract unification (intentional
verify-200 vs gate-4xx + raw-bytes semantics, client already copes); `getElementById` coupling
(ADR-0072/0004 imperative-DOM-adoption pattern, E2E locators catch renames, test seam already
exists); `TRIM_ORDER` dup (already guarded by `colors.svelte.test.ts`); `measureSafeAreaInsets`
reflow (real but off the drawing hot path, already single-probe-minimized). `docs/AUDIT.md` drained
and deleted.

## 2026-07-23 · code-audit (run 1)

Full-repo pass via six parallel area agents (drawing engine, toddler UI, Settings + admin,
state/storage/PWA, server + `/api`, scripts/build/CI) → 15 merged findings. Top themes: two `/api`
endpoints share one rate-limit bucket with opposite charging policies (a valid family behind one NAT
can be locked out of their first generation); pervasive duplication that silently drifts
(rate-limit/bounded-body/error-shape plumbing across endpoints, op padded-bounds math diverged
between undo and live render, dual system-dark trackers, cross-module `getElementById` coupling,
hand-mirrored palette/icon/book lists); hot-path waste in the drawing loop (`getHistoryDebug()`
reduce on every commit, per-op crayon-pass clones, per-pointermove double-map, unthrottled safe-area
reflow); `engines.node >=20.12` is below the Node 22.6 the `--experimental-strip-types` scripts need
and CI (Node 24) never tests it; and `ActionsPanel.svelte` has grown into a ~975-line god-component.
Verified the top 6 claims against source before filing.

## 2026-07-22 · session-audit

Burn-down-backlog session (closed already-done #502, shipped #490 scrapbook-index fix as PR #506).
One finding: burn-down-backlog's prescribed `search_issues` returns `total_count: 0` in this
cloud/MCP env while `list_issues` returns all 146 open issues — risks a silent false-empty "no
unclaimed issues" stop; fix routes the pick through `list_issues` with client-side label filtering.

## 2026-07-22 · lighthouse-audit

Production phone/tablet matrix: first visits Perf 82/98, LCP 1.5 s, 759 KB; repeats Perf 97/100, LCP
0.9–1.1 s, 1–42 KB; CLS 0 throughout. Phone-first TBT 640 ms was 418 ms Lighthouse
`_lighthouse-eval.js` self-attribution + ~295 ms app hydration (main chunk, consistent with the
known ~77 ms real-device `perf:mount` floor); largest LCP subpart is simulated-Slow-4G document TTFB
(~2.3 s), not app work. 47% of first-visit transfer is the intentional post-load pencil-sound
prefetch (357 KB) + category cover thumbs (167 KB), both after LCP. No new finding filed.

## 2026-07-17 · dependency-health-audit

First full run: 50 direct deps (18 prod + 32 dev), 1179 total installed. Verdicts: 45 keep, 4
monitor (`@capacitor/assets` dormant + high-sev vuln chain, `cross-env` upstream archived, `idb`
single-maintainer, `scripts-info` bus factor/self-published), 1 investigate-replacement
(`capacitor-set-version` — upstream repo archived since 2023, only used in `scripts/release.mjs`).
`npm audit`: 19 advisories (6 high all from dev-only `@capacitor/assets`/`@capacitor/cli` bundled
tar, no upstream fix, none reach shipped runtime). Filed `#332` (`type:chore`+`area:infra`) to
replace archived `capacitor-set-version`. Wrote `docs/DEPENDENCIES.md`.

## 2026-07-17 · session-audit

Clean startup evaluation — dependencies and generated SvelteKit types were already present, the
prescribed `svelte-check` tool resolved successfully, and this session had no repeated commands,
failed commands, or wrong-path detours that clear the recurring-friction bar.

## 2026-07-14 · fix-audits (run 2)

Swept all 17 findings on [PR #156](https://github.com/KyleMit/Splotch/pull/156): fixed 16 across
asset shipping/golden/target tooling, AI request/key/response ownership, token races,
drawing/PWA/gesture state, admin persistence, CI coverage, keyboard color selection, and startup SVG
loading; stabilized the new AI-key E2E under parallel load; left 1 explicit architecture decision
for moving image generation out of Netlify's confirmed 10-second streaming-function envelope. Final
verification: typecheck clean, app unit 395/395, asset pipeline 58/58, Playwright 116/116.

## 2026-07-14 · vet-audits (run 2)

Second adversarial pass over the 20 surviving findings via four parallel area agents against current
source/ADRs: removed 3 (night-composite punch — divergence is immaterial to the gates it feeds since
the screen blend whitens chalk pixels regardless of base and both eye gates sample un-punched pupil
pixels; `processChalkPage`/`processNightPage` extractions — CLIs aren't import-safe, so extraction
needs a main-guard refactor for low-payoff I/O-orchestration glue around already-extracted pure
scorers); down-scoped the broad magic-brush architecture item to just its non-cosmetic
fold-during-sheet-decode data-loss bug (recoloring symptom is intentional per ADR-0043); enriched 6
keepers — narrowed the Netlify finding to the concrete `verifyKey`-no-abort + 120 s-vs-sync-ceiling
pieces and flagged its 6 MB/60 s envelope as unverified/likely-wrong; downgraded the token-seed race
(ADR-0025 already accepts brief staleness, empty-env already fails closed) and native-persistence
finding (ADR-0025 documents it as accepted, value is fixing the wrong test comment); confirmed the
AI-generation and credential-persistence ordering bugs and corrected drifted line refs.

## 2026-07-14 · vet-audits (run 1)

Adversarially checked all 25 findings against current code, tests, ADRs, built output, and Netlify
limits: kept/enriched all 15 code-audit findings plus 5 actionable extraction candidates; removed 5
low-payoff extractions where a helper or structural snapshot would add more indirection and
brittleness than protection; corrected the Netlify invocation-mode claim, outline-helper caller
scope, keyboard activation guidance, and CLI importability requirements.

## 2026-07-14 · extract-audit

Added 10 extraction candidates: centralized outline-target resolution and best-candidate retry
policy across asset tools; page-level chalk/night orchestration and pure night-result formatting;
named API authorization and AI response decoding; pure durable-storage reconciliation; isolated
engine listener binding; and testable Clear tutorial geometry. Self-healed the skill with a
`page.evaluate` serialization false-positive guard.

## 2026-07-14 · lighthouse-audit

Production phone/tablet matrix: first visits Perf 84 / LCP 1.4–1.7 s / 749 KB, repeats Perf 87 / LCP
0.8 s / 1 KB, CLS 0 throughout; all reported 510–630 ms TBT was self-attributed to Lighthouse's
`_lighthouse-eval.js`. Independent `perf:mount` measured ~77 ms real blocking across 67/110 ms
tasks, dominated by the intentional idle pencil-sound warm-up; caching/delivery passed, the sole
A11y deduction remains ADR-0041's viewport-lock tradeoff, and no app finding was filed.

## 2026-07-14 · code-audit

Full-repo pass via parallel drawing, UI, backend, state/admin, automation, and asset-pipeline
reviews → 15 findings; top themes: known-failing light fills can overwrite shipped assets, stale
AI/magic-brush operations can corrupt newer or older state, Netlify's real request/runtime envelope
disagrees with the API contract, token seeding can fail open under eventual consistency,
composite/golden image gates drifted from the shipped punch, and several destructive/update/admin
paths lack lifecycle or regression coverage.

## 2026-07-14 · fix-audits (run 1)

Swept all 4 session-audit findings on [PR #144](https://github.com/KyleMit/Splotch/pull/144):
documented the in-tree requirement (+ absolute-path escape hatch) for ad-hoc asset-gen analysis
scripts that import `sharp`/`lib/*.mjs`, naming `tools/asset-gen/.coloring-samples/` as the drop
spot; made `gen-coloring-fills-dark` result lines state gate outcomes (`kept least-bad attempt
2/8` + explicit `*-gate FAILED (value vs bar)` markers instead of `ok` + `⚠` glyphs and the
kept-attempt-index `(N tries)`); closed both night-fill shipping path traps (repo-root note +
debug-sibling-safe batch loop in pipeline.md/README, and `punch-fill-outlines.mjs` now skips stray
`*.input.*.raw.webp` with a warning instead of crashing). The chalk keep-gate finding was already
resolved by `4892c6a` (IDEAS #11, verified offline: trex-tall 71.2% → 95.6%, zero regressions) —
removed without changes. 0 skipped; `docs/AUDIT.md` cleared and deleted.

## 2026-07-14 · session-audit

Composite blank-orb night-eye gate session (PR #142): built `lib/composite-eye.mjs` (whole-pupil
check on the chalk-over-night composite for the band-blind solid-pen class `judgeNightEyes` misses),
wired it into the night generator + `audit-fill-eyes` `orb` column, re-fixed
`dinosaur/stegosaurus-tall`'s half-white eye, and wrote a burndown handoff + `review-orb-eyes.mjs`
review tool. One new `[Execution]` finding: ad-hoc asset-gen analysis scripts can't resolve repo
deps (`sharp`, `lib/*.mjs`) from the `/tmp` scratchpad (ESM ignores `NODE_PATH`; the sibling fix in
`run-splotch` is siloed under "screenshots") — cost the opening ~4 calls and recurs in the burndown.
Enriched two open findings with fresh recurrence: the samples-dir-is-repo-root trap (hit again via a
hard-coded `tools/asset-gen/.coloring-samples-dark`), and the `gen-coloring-fills-dark` "ok"+`⚠`
result-line ambiguity (this session added a 4th warning glyph, blank-orb). Fixed in-session (not
filed): `review-orb-eyes.mjs` shipped with no `<title>` — the exact gap a 2026-07-09 audit fixed for
sibling `gen-contact-sheet.mjs`; added the tag rather than re-file. Passed on: the from-scratch
eye-locator detour (now self-documented in `composite-eye.mjs`'s header — reuse `scoreEyeFill`'s
reference set) and the designated-branch-vs-PR-branch ask (session-setup, not repo tooling).

## 2026-07-12 · session-audit

Full-catalog chalk migration session (7 categories, 83 chalks + 83 night fills, 16 commits). Three
findings: `[Tooling]` the chalk worst-tile keep gate rejects correct whitened-pupil chalks with no
sanctioned apply path (13 hand-`cp` ships across 6 categories — whiten pen solids out of the keep
reference like the normalizer, or add `--apply-reviewed`); `[Tooling]` `gen-coloring-fills-dark`
result lines misreport outcomes (`ok` + `⚠` = a gate never passed, `(2 tries)` = kept-attempt index
— misread as a broken retry loop until the source settled it); `[Execution]` the night-fill shipping
step's two path traps (samples dirs are repo-root-relative; `*.input.webp` debug siblings break
batch cp and crash the punch). Passed on: the composite-render one-liner (worked first try,
technique now in pipeline.md), the `git add -A`-vs-background-`--apply` race and `origin/main..HEAD`
on a single-branch clone (both self-inflicted/one-off).

## 2026-07-10 · fix-audits (run 2)

Swept the single `[Execution]` session-audit finding on branch `claude/fix-audits-skill-ez6ma9`:
fixed the fresh-cloud `npm install` failure by overriding `@capacitor/assets`' sharp 0.32.6 → root
`$sharp` (0.35 ships `@img/*` registry binaries, no proxy-403 GitHub libvips fetch; upgrade path
ruled out — latest 3.0.5 still pins 0.32.6); hardened `session-start.sh` with a loud
`--ignore-scripts` + `patch-package` fallback and fixed its root-cwd `svelte-kit sync` to run in
`web/` via `scripts/web.mjs`; corrected `docs/CLOUD/Claude.md`'s "installs work as usual" claim.
Verified: clean `npm install` exits 0 under the proxy, sharp imports, `capacitor-assets --help`
runs, full hook run green. 0 skipped; `docs/AUDIT.md` cleared and deleted.

## 2026-07-10 · session-audit (run 2)

Contact-sheet consolidation session (review sheet retired into `gen-contact-sheet.mjs`, PR #117).
One `[Execution]` finding: fresh-cloud `npm install` fails on `@capacitor/assets`' transitive sharp
0.32.6 (libvips GitHub download → proxy 403), which silently kills the SessionStart dep install
under `set -e` while `docs/CLOUD/Claude.md` claims installs "work as usual"; workaround `npm install
--ignore-scripts && npx patch-package`. Passed on: Playwright headless-shell mismatch in a
hand-rolled verify script (run-splotch/README already carry the fix — failure to apply,
fourth-recurrence watch), Edit-before-Read tool errors (self-inflicted), branch-choice ambiguity
(hook text already covers it).

## 2026-07-10 · fix-audits (run 1)

Swept all 4 `[Docs]` session-audit findings on branch `claude/fix-audits-command-x014k5`
([PR #112](https://github.com/KyleMit/Splotch/pull/112)): added a >16 MB Artifact-cap warning to
`gen-contact-sheet.mjs` + routed the asset-gen `CLAUDE.md`/`README.md` to per-category publishing;
surfaced the sharp `joinChannel`→alpha gotcha as an asset-gen `CLAUDE.md` rule pointing at the
raw-RGBA construction; inlined `driver.mjs`'s `chromiumExecutablePath()` into run-splotch's
custom-script example (verified: launches from `chromium-1194` first try); swapped pr-screenshots'
proxy-masked `curl -sI` check for the `-w "%{http_code} %{content_type}"` form (verified: prints
`404` on a missing object). 0 skipped; `docs/AUDIT.md` cleared and deleted.

## 2026-07-10 · session-audit (run 1)

Build-time twin-punch session (raws → `twin-src/`, `gen:coloring-punch`, PR #111). Four `[Docs]`
findings: the prescribed `-- all --source shipped` contact sheet (28.8 MB) exceeds the Artifact 16
MB cap; sharp `joinChannel`→webp silently drops the alpha plane (cost a full 154-file re-encode);
run-splotch's custom-script example isn't runnable as written (unset `PLAYWRIGHT_CHROMIUM`, resolver
only pointed at — third recurrence of the cloud-Chromium class); pr-screenshots' `curl -sI` check
reads the proxy CONNECT `200`, not the origin status. Passed on: wrong `duck-tall` page guess
(single `ls`), worktree-remove-from-inside (skill block already has `cd -`).

## 2026-07-09 · fix-audits (run 2)

Swept the single `[Tooling]` session-audit finding on branch `claude/fix-audits-skill-dy5up2`
([PR #108](https://github.com/KyleMit/Splotch/pull/108)): prepended a self-labeling `<title>` to
`gen-contact-sheet.mjs`'s HTML template (mirroring sibling `gen-coloring-sheet.mjs`), so the
prescribed "publish as Artifact every asset touch" step names the sheet by its title rather than the
temp filename. Guarded an empty `counts` against a dangling separator; verified via `node --check` +
running `gen:contact-sheet`. 0 skipped; `docs/AUDIT.md` cleared and deleted.

## 2026-07-09 · session-audit (run 2)

Renamed `night-twins-gallery.mjs` → `gen-contact-sheet.mjs` + documented
rebuild-and-publish-per-asset-touch session. One `[Tooling]` finding: `gen-contact-sheet.mjs` emits
HTML with **no `<title>`** (its sibling `gen-coloring-sheet.mjs` sets one), so the now-prescribed
"publish as Artifact every asset touch" step names the sheet after the temp file — surfaced by a
failed `Artifact({title})` call. Passed on the invalid-`title`-param mistake itself (self-inflicted,
immediately corrected) and the review-sheet discoverability gap (already fixed 2026-07-09 and
confirmed working this run).

## 2026-07-09 · fix-audits (run 1)

Swept the single `[Docs]` session-audit finding on branch `claude/fix-audits-skill-w1gzmm`: added a
"Viewing a review sheet" note to `tools/asset-gen/README.md` routing cloud-session reviewers to
publish the self-contained HTML with the Artifact tool (linking `night-twins.md`), use
`night-twins-gallery.mjs`'s page/cell + `--theme light` targets for a focused pass, and reuse
`run-splotch`'s `chromiumExecutablePath()`/`PLAYWRIGHT_CHROMIUM` fallback if a raw PNG is needed.
Skipped the optional `run-splotch` trigger-widening (its `driver.mjs` can't screenshot arbitrary
standalone HTML). 0 skipped; `docs/AUDIT.md` cleared and deleted.

## 2026-07-09 · session-audit (run 1)

Magic-brush ghosting → colored-twin drift session (worst-tile drift gate +
`gen:coloring-fills:audit`, 5 twins regenerated, gallery focus/`--theme`). One `[Docs]` finding:
viewing an asset-gen review sheet in a cloud session cost ~6 failed Playwright attempts because the
answers (publish as Artifact; reuse `run-splotch`'s Chromium fallback) are siloed in
`night-twins.md`/`run-splotch` and unreachable from the general `tools/asset-gen/README.md` review
path. Passed on vitest-cwd and node-`-e`-cwd (already covered / self-inflicted).

## 2026-07-08 · fix-audits

Swept all 8 session-audit findings on branch `claude/fix-audits-command-vgv09g`: fixed the
`app-driver.mjs` missing-`sleep` import + stale drawer probe and added a CI `test:driver:smoke`
guard; documented the custom-Playwright-script location (repo `screenshots/`, not scratchpad;
`NODE_PATH` is ESM-blind) in `run-splotch`; warned that `perf:web` is blind to
compositing/transparency bugs (`profiling`); added `svelte.md` rules for SSR-unsafe `onDestroy` (and
made `Slider.svelte` SSR-safe) and `$state` proxy identity; documented single-spec E2E via
`test:e2e -- <spec>`; registered the WebKit `contain`-on-fixed gotcha in
`COMPATIBILITY.md`/`CLOUD/Claude.md`; and resolved the `AUDIT-LOG.md` consumer-logging contradiction
across `audit-conventions.md`, `fix-audits.md`, `vet-audits.md`. 0 skipped; `docs/AUDIT.md` cleared
and deleted.

## 2026-07-08 · session-audit

Clean run (escape hatch exercised) — first invocation, run on the session that authored the skill
itself; no tell fired (no re-reads, failed commands, or wrong guesses). The one candidate — audit
files split across `.claude/commands/` vs `.claude/skills/`, undocumented in `audit-conventions.md`
— was a single sub-bar lookup and deliberately not filed.

## 2026-07-07 · fix-audits

Swept 7 of 9 items on PR #81: Playwright cache + CI concurrency + dependency-free blobs-smoke, three
ADR-0017 cross-platform script breaks, the secure-storage master-key race (with new tests), guarded
`localStorage` reads, platform-detection consolidation, corner-button/brand-purple tokens, and 429
messaging in both parent and child flows. The two canvas/engine items (undo-keyframe memory cap,
`scheduleIdle` extraction) were deferred by user request pending the engine refactor on another
branch.

## 2026-07-06 · vet-audits

Adversarial verification of all 15 same-day code-audit items via five parallel area agents: all 15
kept (none removed), each enriched — corrected citations/counts, reframed triggers (secure-storage
race → two-tab legacy migration; engine singleton → intentional per ADR-0004 but leaky teardown),
and implementation gotchas (failure-path-only limiter, CAS must error not concede, IDB txn
auto-commit, `__IS_CAPACITOR__ && isNative()` test contract).

## 2026-07-06 · code-audit

Full-repo pass via six parallel area agents → 15 items in a fresh `docs/AUDIT.md`; themes: an
orphaned rAF loop after AI failure, an unthrottled token oracle + bare Blobs read-modify-write on
the server, engine replay/lifecycle gaps (mid-stroke clear, singleton remount state, unbounded
keyframes), silent admin error paths, CI waste, and three ADR-0017 cross-platform script breaks.

## 2026-07-06 · fix-audits

Resolved the last item (load-time TBT): a new `perf:mount` profile showed the suspected
`+page.svelte` onMount work is only ~18 ms of the ~470 ms hydration long task; the real lever was
hydrating the six boot-hidden overlays — now idle-mounted (Settings dialog on first open), cutting
the load long task to ~256–325 ms with no idle long tasks. `docs/AUDIT.md` is empty and deleted.

## 2026-07-05 · lighthouse-audit (run 2)

First production audit (real Netlify serving) corrected the local-preview numbers (LCP 5.4 s → 1.9
s); filed TBT / main-thread page-load opportunities in `docs/AUDIT.md`.

## 2026-07-05 · lighthouse-audit (run 1)

Initial slow-network page-load audit (PR #57); the seed numbers came from a local `vite preview`
(Perf 73 / LCP 5.4 s) and were later corrected on production — the preview's HTTP/1.1 no-CDN serving
was the whole gap.

## 2026-07-03 · vet-audits

Adversarial review of the code-audit items: corrected the JSON-parse dedup target, the
Capacitor-bundle file list + ~16 KB estimate, and the orientation-tracking scope (5 → 3 reactive
components).

## 2026-07-03 · code-audit

Full-repo pass (PR #38) → prioritized perf / readability / maintainability / architecture findings
in `docs/AUDIT.md`; themes: duplicated CSS/helpers, canvas resize/replay cost, unauthenticated BYOK
path, Blobs read-modify-write races.

## 2026-06-25 · dependency-audit

Surveyed `npm outdated`; flagged the coordinated Capacitor and Svelte/Vite families as landmines,
upgraded the safe leaf/dev packages one commit at a time.

## 2026-06-25 · code-audit

First audit list: swept every sticky `:hover` rule that stays stuck after tap on touch devices,
ordered toddler-UI → Settings → web-only, each to be guarded with `@media (hover: hover)`.
