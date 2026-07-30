---
name: create-pr
description: Splotch's conventions for a pull request — how the body's sections are chosen per change, the Verification section that always appears, and the honesty rules (state the defect not the symptom, prove a pre-existing failure is pre-existing, name what's weak). Use whenever opening, creating, or updating a pull request or writing its description. There is deliberately no PR template, so this is where the expectations live. For visuals on a UI change, chain to pr-screenshots.
---

# Open a Pull Request

These conventions **augment** the built-in PR flow rather than replacing it — follow them in
addition to whatever it already does.

**There is deliberately no PR template in this repo,** and no probing for one. A template's headings
get mirrored into every body, which is exactly backwards: in a good Splotch PR the sections belong
to the change. A byte-budget rewrite earns "Why it happened" and "Honest downsides"; a test-env fix
earns "The defect" and "The fix"; a two-line refactor earns neither. Only the pieces below are
constant.

## Before you open it

Run the gates first, because the body has to report them:

* `npm run check`, `npm run lint`, `npm run format:check`
* `npm run ruler:check` if you touched anything under `.ruler/`
* the test tiers your change can affect (`npm run test:unit`, `test:e2e`, `test:scripts`,
  `test:assets` — `npm test` is all of them)

Note the counts as you go. "All green" is weaker than "863 unit, 261 script, 205 E2E".

## The title

Say what changed, not which area was touched. Both shapes in the log are fine: a conventional-commit
prefix when the change is one kind of work
(`perf(engine): size the resident snapshot tier by bytes`) and a plain declarative sentence when it
spans several
(`Fix the four thin-margin E2E specs, and give
tests the engine's committed brush mode`).

## First line, then a lead

The first line is the issue reference — `Fixes #NNN.` or `Closes #NNN.`. **Each issue needs its own
keyword** (`Fixes #651. Fixes #652.`); GitHub does not auto-close the second issue in
`Fixes #651, #652`.

Then one paragraph before any heading, leading with the consequence rather than the mechanism:

> Every stroke a child finished on iPad froze the app at finger-lift — 112 ms for a plain pen
> stroke, up to 2390 ms for a crayon scribble, against an 8.3 ms frame budget.

## Name the defect, not the symptom

When the PR is a fix, the body says what was actually wrong, which is often not what was observed.
The E2E env fix is the model: the visible failure was an assertion, but the defect was that the
suite had been **opening real issues in this repository** on every `npm test`. State that plainly
and say which one was the symptom.

## Verification — always present

The one section that appears on effectively every PR, and the one worth keeping even when the change
is small. Name the check and its result, usually as a table:

```markdown
| Check                           | Result               |
| ------------------------------- | -------------------- |
| `npm run check`                 | 1027 files, 0 errors |
| `npm run test:unit`             | 863 passed           |
| `npm run lint` / `format:check` | clean                |
```

Three things that make it worth reading:

* **Measure the thing the PR claims.** A perf change reports before/after on the device or engine
  that showed the problem; a flake fix reports a repeat-each run at the worker count that reproduced
  it (`--workers=8 --repeat-each=25`, 250/250).
* **Report failures you did not cause, and prove it.** Check out the parent commit, confirm the
  failure is there too, and say so — an unexplained red check reads as your bug.
* **Break your own guards.** A new drift guard or gate is only verified once you have watched it
  fail: "deleting a name from either env object fails the scan".

## Visuals

Splotch is a visual app, so a change with a visible surface is not reviewable from the diff. The
[`pr-screenshots`](../pr-screenshots/SKILL.md) skill owns which shots to include (before/after,
every state, gif for animation) and how to host them so they render in the body.

When the change has **no** visible surface, say so in one line rather than omitting it silently —
"No UI surface changed, so there's nothing to screenshot."

## Say what is weak

Splotch PRs self-report their soft spots, under whatever heading fits — "Honest downsides", "Notes
for the reviewer", "Caveat worth reviewing", "What stays manual, deliberately". Include it whenever
one of these is true:

* A fix rests on a convention or checklist rather than an observed failure ("flows-parent-center
  never reproduced — 1 in 1015 on CI — so its fix rests on the checklist").
* Something got worse in a bounded way ("typical resident memory rises 28–34 → 28–60 MiB; inside the
  gate, but the gate is the only thing bounding it").
* A case is knowingly left unfixed, or an assumption is load-bearing and unproven.
* Work is deliberately out of scope, or was filed as a follow-up issue instead.

## Docs reckoning

If the change touched ADRs, skills, or rules, say which and what happened to them — a new record, a
section marked superseded, a claim corrected. When a previously published decision turns out to be
wrong, the correction matters more than the new record and goes first. See
[`create-adr`](../create-adr/SKILL.md) and [`update-adrs`](../update-adrs/SKILL.md).

## Mechanics

* `#`-numbers that are not deliberate references must be escaped, and commit SHAs must stay bare —
  both rules, with the reasoning, are in the "Auto-linking" section of the root agent instructions.
* Keep the Claude Code attribution footer that the PR flow appends.

## After it's open

Drive CI to green — a PR you opened is yours until it merges. When review comments arrive, work them
with [`address-pr-review`](../address-pr-review/SKILL.md).
