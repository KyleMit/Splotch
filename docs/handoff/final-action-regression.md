# Handoff — final discrete-action regression sweep

> 2026-07-31 · branch `experiment/trusted-ipad-input` · PR
> [#682](https://github.com/KyleMit/Splotch/pull/682) · Re-run the complete action plan after the
> two latest retained fixes and classify only reproducible, action-local failures.

## Objective & non-goals

**Objective.** Run the complete current Android-web action suite after `3b8ca269` and `b91fcc08`,
then run only any failing action on its first failing target with an action-aligned trace. Verify
genuine fixes on relevant cross-target focused tests.

**Non-goals.** Do not repair the scorer in this task; consume the idle-frame handoff first if late
static gaps recur. Do not repeat a broad run until it turns green.

## State

The last broad Android action run before `b91fcc08` passed 46 of 47 actions. Advanced controls was
the genuine remaining GPU burst and is fixed:

* baseline 30 repeats: disable max 66.7 ms, enable max 50.0 ms;
* retained Android 30 repeats: both max 16.8 ms;
* Mac WebKit ten repeats: 18/18 ms max;
* iPad Simulator ten repeats: 25/26 ms max.

The screenshot-button setting is also fixed:

* baseline invalidated/repainted a 1440×2780 document and reached 66.7 ms;
* retained Android 30 repeats: off/on both 16.8 ms;
* Mac ten repeats: 20/19 ms;
* iPad Simulator ten repeats: 17/19 ms.

The app preview may need restarting; do not assume the old `4173` server/session is alive.

## Decisions made (and why)

* Run the full suite once after the final code state, then focus. Broad repeated sweeps waste time
  and make ambient failures look reproducible.
* Fix one action at a time, commit separately, and comment on PR #682 with
  baseline/final/cross-check evidence.
* Attribute a failure through the action trace before touching product code. Android Chrome idle
  sampling can produce late no-op gaps.
* Preserve visual transitions and settings behavior. The advanced-controls fix grouped the existing
  220 ms slides; it did not remove animation.

## Unverified assumptions

* No action besides the idle-classified sound sample fails on the current branch.
* The action plan currently contains 47 actions; confirm from the runner rather than relying on this
  count because the plan is code-owned.
* Latest native/emulator fixes did not regress physical iPad web, which has not been fully rerun
  after the final two commits.

## Done & verified

* `3b8ca269` scopes live action state to the panel; focused unit/E2E and three target timings
  passed.
* `b91fcc08` groups advanced-control transitions; focused Parent Center E2E passed 3/3 and three
  target timings passed.
* The full Parent Center spec passed 9/10. The remaining assertion expects five separate What’s New
  date rows, while the grouped release-history UI renders one group. This appears stale and must be
  validated as behavior, not treated as a performance failure.
* PR comments already document both retained fixes.

## Risks & next 3 steps

1. After the idle-frame scorer task, run the complete Android Chrome action plan once with three
   repeats and retain its artifact regardless of result.
2. For each genuine red action, capture the smallest action-aligned trace, trial one change, run
   that focused action on the failing target, then one relevant iPad/Mac cross-check.
3. Validate the What’s New E2E expectation against intended grouping, fix only if stale, then run
   the focused Parent Center spec.

The main risk is conflating transport/idle cadence with application jank. A red result without an
action-local trace is a lead, not a product diagnosis.

## Reread first

* `.agents/skills/run-performance-matrix/SKILL.md`
* `.agents/skills/profiling/SKILL.md`
* `docs/handoff/idle-frame-action-gates.md`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
* PR comments `5148058445` and `5148287838`
