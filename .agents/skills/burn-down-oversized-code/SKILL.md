---
name: burn-down-oversized-code
description: Pay the size caps back down to their soft targets — mode=files for the per-file max-lines cap, mode=functions for max-lines-per-function. Measures every covered unit against the cap ESLint resolves for it, has a proposer and an adversarial reviewer decide split-or-raise per unit, implements each split in its own worktree behind an independent commit check, retires stale per-file caps, and ships one themed PR with one commit per unit through drive-pr-to-mergeable. Use when asked to burn down, pay down, or make headroom under the file or function line limits, or when a file or function is at or near its cap.
disable-model-invocation: true
---

# Burn down oversized code

A periodic reconciliation campaign for the two size ratchets in `eslint.config.js`. Each ratchet has
a hard cap CI enforces and a soft target below it (the comment on its rule block states both);
between campaigns, code drifts up toward the cap. This skill pays it back down, one PR per campaign.

| Mode        | Rule                     | Unit     | A raise sets the cap to             |
| ----------- | ------------------------ | -------- | ----------------------------------- |
| `files`     | `max-lines`              | a file   | the file's length + its headroom    |
| `functions` | `max-lines-per-function` | function | the file's longest function + ditto |

The caps, scopes, and rule options live in `eslint.config.js`; the headroom per mode lives in
`measure.mjs`. Read both from the script's output — never from this page or from memory.

**Invoking this skill authorizes the multi-agent fan-out below** (two agents per unit to plan, two
per unit to implement and check). It is user-invoked only for that reason.

## The governing rule

**Line limits are smells, not hard rules.** Split only where the result is genuinely cleaner — a
seam a reader would want even with no counter. Where the code does not separate cleanly, raise that
file's cap instead. A counter-driven split is a defect even when it passes lint. Counter-driven
looks like:

* a single-caller helper that only relocates lines and names no concept;
* a wide parameter bag or accessor object threading a factory's state back into the moved code;
* a test split that duplicates the mock harness instead of clarifying anything;
* **gaming the counter** — deleting or rewording comments (both rules skip comments, so it cannot
  help anyway), joining statements onto one line, or turning statements into `&&`/ternary chains.

## 1. Branch and measure

Branch from fresh `origin/main` as `<runner-prefix>/burn-down-<mode>-<YYYY-MM-DD>` — the active
runner's own branch prefix (`claude/`, `codex/`), with a `-2`, `-3`, … suffix if an earlier run left
that name behind — then:

```
node .claude/skills/burn-down-oversized-code/measure.mjs <mode>
node .claude/skills/burn-down-oversized-code/measure.mjs <mode> --json > <scratchpad>/baseline.json
```

It lists **candidates** (units within the headroom of their cap) and **stale overrides** (per-file
caps to retire or lower). Both lists empty: report that and stop. Otherwise **group into units**: a
unit is one file — in `functions` mode, every candidate function in that file — plus any file whose
tests the same change would touch, so two parallel units never edit the same file. Tell the user the
unit count and agent count, then continue; there is no batch limit.

Stale overrides need no planning: they become config commits in step 5.

## 2. Plan — proposer then adversarial reviewer, per unit

Fan out with your runner's parallel-agent mechanism, **pipelined** so each unit's review starts as
soon as its proposal lands. Both agents are read-only. Brief them from `briefs.md` in this skill's
directory — the **propose** and **review** briefs — filling in the mode section below.

Each unit ends as one plan of record:

* **split** — the exact seams, what moves where, the projected length, the drift guards and docs
  that name the moved code, and (on a hot path) the allocation impact; or
* **raise** — why no seam is genuinely cleaner, and the proposed cap.

The reviewer reads the code itself, attacks the proposal, and endorses, revises, or reverses it; its
version is the plan of record.

## 3. Record the plan

Write `docs/scratchpad/burn-down-<mode>-<YYYY-MM-DD>.md`: the baseline table, then **at most ~10
lines per unit** — decision, seams, hazards, and what the reviewer changed. Keep the full agent
output out of the repo; one campaign committed 3,930 lines of it, two thirds of its PR's diff.
Commit it as the branch's first commit and record its full SHA — the implementers branch from it.

## 4. Implement and check — one worktree per unit

Fan out again, one implementer per `split` unit, each in its **own git worktree** branched from the
pinned plan SHA, pipelined into a fresh read-only checker per commit. Brief them from the
**implement** and **check** briefs in `briefs.md`. The implement brief carries the hard constraints:
no edits to `eslint.config.js` (the integrator owns every config change), no push, full 40-hex SHAs
from `git rev-parse`, and the full gate list. `npm run test:tools` is in that list because repo
scripts under `tools/` read moved code by path, and only that tier catches it. An implementer may
decline its unit after re-judging it; it then commits nothing and returns the raise it wants.

The checker returns `keep`, `fix-needed` (with exact fixes), or `revert-to-raise`. Respect
`revert-to-raise` — the unit becomes a raise.

## 5. Integrate

**Decide the final commit order before the first cherry-pick**, and build the branch in that order —
history is then right by construction, with no rebase to be refused. Order:

1. the plan commit;
2. the kept splits, grouped by theme (a module area, then components, then pages, then unit-test
   splits, then E2E splits is the order that has read well);
3. the config commits: one per raise, one per stale override retired or lowered. Each raise's
   comment states the WHY in one line, in the shape of the existing override blocks.

Cherry-pick each kept commit; fold a `fix-needed` fix into its commit (`git cherry-pick -n`, apply,
`git commit -C <sha>`). **Stop at the first conflict** and resolve it by hand — never a loop that
carries on past a failure.

**Do not push until step 6 passes.** A defect found before the first push is folded into its commit
by rebuilding the branch (a fresh branch from `origin/main`, the same cherry-picks, the fix folded
in), not appended as a trailing fix commit.

## 6. Verify the tip

All of these, judged by exit code:

* `measure.mjs <mode> --check` — exits 0 once nothing is left inside the headroom band and no
  override is stale.
* `npm run check:quality`, `npm run test:unit`, `npm run test:tools`.
* `npm run build:cap` — a split that moves web-only code can defeat tree-shaking and leak it into
  the native bundle, which no web-side gate sees.
* `files` mode with E2E splits: the Playwright test count (`npm run test:e2e -- --list`) is equal at
  the base and the tip.
* A split on a drawing or gesture hot path: name the `npm run perf:*` capture that would confirm it,
  and run it only if the machine is free (see "Concurrent worktrees" in CLAUDE.md).

## 7. PR and review

Push, then open the PR. The body carries: why; how each unit was decided; the theme order; a
before/after table (unit, lines before, lines after or new cap); **the diff's composition** (moved
code, per-file boilerplate the moves add, new tests, the plan record) so a lopsided `+/-` is
answered before anyone asks; verification. List any new unit tests an implementer added, since they
go beyond a pure move.

Then run `drive-pr-to-mergeable`. The rival reads the combined diff from its review packet and is
told not to spend commands on `git show`, so per-commit review needs per-commit input: write each
commit's patch to its own file (`git show <sha> > <dir>/<nn>-<short-sha>.patch`) in an absolute
directory the rival can read, and name that directory in the steering prompt. Require one verdict
per patch on three questions: (1) counter-driven or genuinely cleaner, including the gaming patterns
above; (2) behaviour preserved, and on hot paths allocations too; (3) repo conventions. Before
posting a zero-findings review, confirm from the rival's run log that it read every patch file —
reviewing only the combined diff has happened. Never push while a rival round is running.

## 8. Report

The PR URL; the per-unit outcome table (split, raise, retired, and every reviewer or checker
reversal); findings per review round; CI on the exact head SHA; and the leftover implementer
worktrees and `<runner-prefix>/burn-down-<mode>-<plan-short-sha>-*` branches — list them for the
user and point at `prune-git-workspace`.

## Mode: files

Scope covers app code **and** tests, so expect test and spec files among the candidates.

**Seams that have held up:** a child component with its own props contract (as `ColorControl` and
`BrushControl` are to `ActionsPanel`); a module that owns one responsibility; a test group moved to
a sibling file named with the dot-joined convention (`storage.hydrate.test.ts`); an E2E spec group
moved to its own spec with its helpers in a shared helper module.

**Hazards:**

* Scoped CSS stops reaching markup moved into a child component — the parent's show/hide rules must
  be rewritten, within `npm run lint:tokens`' budget of unscoped `:global()` overrides.
* A static import into a startup-path module re-partitions chunks
  (`web/tests/startup-bundle.spec.ts` pins the startup bundle).
* Test placement (`tools/tests/test-file-placement.test.mjs`); a split that must re-declare a large
  `vi.mock` harness is usually counter-driven — Vitest mocks cannot be shared across files.
* E2E groups carry `test.use()` settings (touch device, viewport) that must move with them.

## Mode: functions

Scope is app code only; tests are excluded because they are mostly `describe()` callbacks. Component
top-level `<script>` bodies are not functions and are out of scope.

**Seams that have held up:** a pure helper hoisted to module scope; a named step with a narrow
signature; a sub-factory that owns its own state (a timer set, a tap run, a re-prompt schedule).

**Hazards:**

* `createX()` factories are mandated (CLAUDE.md) and dominate the long list. A factory is not too
  long because its methods are closures; one state machine over shared `$state` and timers is an
  honest raise.
* The hot-path rule in `.claude/rules/svelte.md`: code reached per pointermove, resize, or frame
  must not allocate. A helper that captures a closure or returns an object on that path is a
  regression — every split under `lib/drawing/` or a gesture action states its allocation impact.
* Hoisting a factory's pieces to module scope can make the bundler unable to prove an unused
  instance side-effect-free, keeping web-only code in the native build. That is what `build:cap` in
  step 6 catches; the fix is a `/* @__NO_SIDE_EFFECTS__ */` annotation with a WHY comment.
