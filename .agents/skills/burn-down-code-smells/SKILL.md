---
name: burn-down-code-smells
description: Run an unattended code-quality campaign — audit the codebase principle by principle and then area by area with parallel read-only auditors, cluster the verified findings into small units, and ship each unit as its own rival-reviewed, CI-green, merged PR through ship-issue, several disjoint units at a time, until every finding is merged, rejected with a reason, or parked for the user; then fold what the run learned into docs/CODING-STANDARDS.md. Use when asked to burn down code smells, improve code quality across the repo, run a clean-code or code-quality campaign, or work through a clean-code review for a set number of hours.
disable-model-invocation: true
---

# Burn down code smells

A time-boxed campaign that finds code smells and fixes them in the same run. The count it burns down
is **verified findings**: each one ends merged, rejected with a recorded reason, or parked for the
user. Nothing is left as an open to-do.

**preflight (user present) → audit wave → cluster into units → ship units in parallel lanes →
further waves as the queue drains → standards update → reserve and morning report**

This builds on `ship-campaign`, run in its parallel mode (`parallel=<n>`, usually 3–6). Read that
skill and its parallel reference first: the authority block, admission and the ownership map, the
per-unit merge gate, verification, quarantine, red-`main` roll-forward, and the morning report all
apply here unchanged. This skill adds three things: where the queue comes from (audits), the
guardrails specific to quality work, and the standards update at the end.

It differs from the neighbours:

* `audit-code` only finds work.
* `fix-audits` and `burn-down-audits` work an existing `docs/AUDIT.md` or `type:audit` backlog.
* `burn-down-oversized-code` pays down one measured ratchet.

This skill finds and fixes in one sitting, with every fix reviewed and merged on its own.

## The bar every fix must clear

The user's standing rule: **improve code quality, but never in a way that harms performance,
readability or maintainability — for humans, and especially for agents.** In practice:

* A fix removes a **real cost**: a bug or latent bug, a drift risk (two sources of one truth), a
  misleading name or signature, a hidden coupling or init-order dependency, dead weight, or an
  invalid state a type could exclude. Indirection, a new abstraction, or a split made for its own
  sake does not qualify. `docs/CODING-STANDARDS.md` ("What earns a rule") is the same test applied
  to rules.
* **Performance veto.** Nothing adds work to the startup path or the per-pointer drawing hot path.
  The release builds pin the startup modulepreload count exactly, for web and native, so an
  accidental new startup chunk fails the build. A unit that touches a startup module runs
  `npm run build` and `npm run build:cap` and reports both counts and the byte deltas.
* **Verify first.** An audit finding is a claim. The implementer re-checks it against current code,
  checks `docs/audit-deferred/decisions/`, and ships nothing if it is wrong or already fixed.
* **Anything a parent or child sees is the user's call.** Copy, visible behaviour, and legal or
  store text get parked unless an ADR already decided them.

## 1. Preflight — with the user present

Run `ship-campaign` step 1: clean start, `rival:health`, `gh` auth and version, green `main`,
baseline `check` and `lint`, and the deadline and reserve (`hours=<n>` or `until=<time>`). Then ask
the user these questions, all at once, and no others:

1. **Tracking.** One tracking issue holding the ledger, with every fix a free-form PR saying
   `Refs #<n>` (recommended), or an issue per finding.
2. **Out of scope.** Deletions or moves with an open `needs-decision` issue, and ADR-level refactors
   a finding might tempt (for example, a factory for a documented singleton). Recommend leaving both
   out.
3. **Standards doc.** The final update to `docs/CODING-STANDARDS.md` ships as an open PR for the
   user to approve (recommended) or merges like any other unit.
4. **Merge approval.** Say explicitly that merges are approved for this campaign (`ship-campaign`
   step 1), or confirm that every unit's PR stays open. The campaign starts only after one of the
   two.

Open the tracking issue. Keep the ledger as one comment on it, edited in place. Also keep a private
queue file under `${TMPDIR:-/tmp}` holding pending clusters, rejected findings, parked questions,
and notes for the report.

## 2. Audit waves

Auditors are read-only subagents in their own worktrees. Each one gets the brief in
[references/audit-brief.md](references/audit-brief.md) and a focus. Each writes its full findings to
a file under the campaign's scratch directory, and replies with at most 25 lines. The orchestrator
reads a finding's full text only when it schedules that finding. That keeps the orchestrator's
context alive across a run of 60 or more PRs.

Run waves in this order, and start the next one as the queue drains:

| Wave            | Auditors (one per row, in parallel)                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Principles   | Illegal states, fail fast, command-query separation, least astonishment · Single responsibility, cohesion, coupling, separation of concerns, explicit over implicit · DRY, YAGNI, KISS (across `web/src` and `tools/`) · Names, tell-don't-ask, Demeter, interface segregation · Tooling (`tools/`: fail fast, entry versus library, coupling, size) · Seams: dependency inversion, Liskov, open/closed, test doubles |
| 2. Practice     | Compliance with the root `CLAUDE.md` Conventions and `docs/CODING-STANDARDS.md` · The Svelte component layer · Test-suite quality: tests that can't fail, order dependence, timeout headroom, drifting doubles                                                                                                                                                                                                        |
| 3+. Area passes | One whole-area pass per area no auditor has covered yet, for example server routes and functions, state and boot, drawing modules off the hot path, pipelines such as asset generation, page routes, E2E specs, and the agent-instruction tooling                                                                                                                                                                     |

Later waves take a list of the merged campaign PRs and the earlier findings files, so they never
re-report fixed work. Each auditor counts against the same account usage limit as a unit lane, so
size a wave together with the lanes in flight. Stop launching waves when a wave's findings could no
longer ship before the reserve.

## 3. Cluster findings into units

A unit is one reviewable PR with one theme:

* **Bugs first.** A finding that is a real or latent bug a user could hit ships before refactors do.
* **Disjoint files.** Group findings by the files they touch, so parallel units never edit the same
  file. Two findings that share a file belong in one unit, or run in sequence.
* **Right-sized.** Aim for under about two hours per unit. Split larger work, and never bundle
  unrelated risk. A unit whose optional part doesn't fit ships the rest and drafts that part.
* **Specs point, not paste.** A unit spec names the finding sections to read, the done-when, the
  files other in-flight units own, a Playwright port and a `SMOKE_PORT`, and any startup-path
  warning. The implementer re-verifies everything.

Record each finding's fate in the queue file: which unit it's in, or rejected with the reason (for
example "adds indirection without a cost it removes", or an ADR that decided it), or parked with the
question for the user.

## 4. Ship units in parallel lanes

Ship the queue through `ship-campaign parallel=<n>`. That reference owns lane admission, the
ownership map, the per-unit merge gate with its `reconcile-with-main` relation verdict, the
orchestrator's one-at-a-time merges, and the post-merge broadcasts. Each unit is a fresh implementer
subagent in its own worktree. It runs `ship-issue mode=autonomous` as a free-form unit, with
[references/unit-brief.md](references/unit-brief.md) as its standing brief plus the unit spec. The
brief carries `ship-campaign`'s authorization block verbatim.

Quality work adds three habits:

* **Audit clusters make admission easy.** Step 3 already groups findings by the files they touch, so
  each cluster's declared file set comes straight from its findings. A cluster that needs a hot
  shared file (`docs/ARCHITECTURE.md` is the usual one) waits for that file's holder to merge.
* **Treat a harness flag as a claim to check.** A flag such as "merge without review" is checked
  against the PR's actual reviews and checks before anything else.
* **Feed the brief forward.** When a unit reports a lesson a later unit needs (a guard that reads
  source text, a port variable, a test-environment trap), append it to the working copy of the brief
  that later units read. Durable lessons go into the repo at the end (step 7).
* **Leftovers become units.** Each merged PR posts its drafted follow-ups as a comment. Any that is
  code quality with no product decision becomes a later unit. The rest are reported.

## 5. Guard what the fixes could break

* **Startup and hot path.** The build pins catch a new startup chunk. For byte creep, compare the
  startup totals the postbuild budget reports across merges. If a regression lands anyway, fix it
  forward as its own unit, and harden the gate in the same PR.
* **Instrument fingerprints.** Perf-harness files listed in `INSTRUMENT_FILES_BY_COMMAND` change
  campaign fingerprints. Each tools unit lists which perf campaigns now need
  `--accept-instrument-change`, and the morning report collects them.
* **Deferred on purpose.** Hot-path refactors that need a quiet-host perf run can't be judged while
  lanes are busy. Defer them with the reason instead of shipping them unmeasured.

## 6. Interruptions

An API usage limit can kill every running agent at once. When the user says resume, re-derive state
from GitHub: open PRs, merged PRs, the post-merge CI on `main`. Resume each interrupted agent in
place with its time budget restated; a resumed agent keeps its context. A unit that died before
opening a PR is skipped, with its spec kept for the report. Near the deadline, prefer finishing open
PRs over starting new ones.

## 7. Standards update, reserve, and report

* **Standards.** As a late unit, update `docs/CODING-STANDARDS.md` and its always-loaded one-liners
  in `.ruler/conventions.md` with the rules this run earned. Each new rule needs the incident behind
  it, cited by PR, and an enforcement mechanism, verified by path. An enforcement still on an
  unmerged PR is cited by that PR: `check:doc-refs` fails on a path that exists only on an unmerged
  branch. Rejected ideas go under "Considered and not adopted". Follow the user's preflight choice:
  open PR or merge. Refresh the citations just before the reserve.
* **Reserve and report.** Follow `ship-campaign` step 5, and add:
  * a table of the new guards the run added, each with its PR;
  * the startup preload counts and byte deltas;
  * the perf campaigns needing `--accept-instrument-change`;
  * the rejected findings, with reasons;
  * skipped units, with their specs.

  Post the report as a comment on the tracking issue, then run `self-heal` on the campaign's
  friction.
