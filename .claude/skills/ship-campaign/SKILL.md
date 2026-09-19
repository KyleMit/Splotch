---
name: ship-campaign
description: Ship a queue of GitHub issues unattended — an explicit list, an epic's sub-issues, or the newest unclaimed backlog issues — one at a time, each through ship-issue mode=autonomous and merged before the next starts from fresh main. Proves everything that could stall an overnight run while the user is still present, quarantines a stuck issue instead of stalling the queue, and ends with a verified morning report. Use when asked to run a campaign, work through several issues or an epic overnight or unattended, burn down the backlog, or grab the next issue.
---

# Ship a campaign

A campaign is a queue of issues shipped **merge-as-you-go**:

**preflight (user present) → for each issue: fresh `main` → `ship-issue mode=autonomous` → verify
the merge from live state → next → morning report**

Every unit merges before the next one starts, and every unit branches from the `main` that already
contains its predecessors. That is the point of the shape. An independent reviewer vets each change
as it lands, so a mistaken premise is caught in the PR that introduced it instead of compounding
through the layers stacked above it, and no fix ever has to be carried to the tip of a chain. Ship a
chain of unmerged dependent PRs only when the user asks for one; that is `create-stacked-prs`.

One campaign runs in one session. Several sessions working one epic in parallel is orchestration,
which hands out prompts rather than implementing, and is not this skill.

## Invocation and authority

The input names the queue and, optionally, a deadline:

* **A list** — issue numbers or URLs, shipped in the given order unless a dependency forces another.
* **`epic=<n>`** — the epic's open children, ordered by `enumerate-sub-issues`.
* **`backlog`** (optionally `backlog=<count>`) — the newest open issues nobody has claimed, picked
  one at a time so that parallel sessions each pick a different issue (see step 1).
* **`until=<time>`** or **`hours=<n>`** — the deadline the stop margin in step 5 counts back from.
* **`profile=performance`** — the unit is a causal performance cluster; see the last section.

Invoking the skill is the user's standing authorization, for every unit in the queue, to: create
branches and worktrees, push, open PRs, post the rival's reviews, apply and remove `in-progress`,
merge each PR through `ship-issue`'s autonomous gate, comment on queued issues and their epic, and
open a revert PR for a campaign merge that turned `main` red (step 4). It does **not** authorize
bypassing branch protection, weakening a test or gate to get green, force-pushing a shared branch,
closing an issue except through `Fixes` on merge, filing new issues, or touching work outside the
queue. Carry this block verbatim into every unit's instructions: an unattended unit must never have
to infer its authority, and a runner that sees "never merge" anywhere in its instructions will
refuse the merge.

## 1. Preflight — before the user leaves

A blocker found at 3 a.m. costs the whole night; the same blocker found now costs one question. Run
all of this while the user is present, report the result as one checklist, and get every human-only
fix done before declaring the campaign started.

* **Clean start.** Stop if the tree is dirty — never carry the user's work into a campaign. Fetch
  `origin/main` and work from a fresh worktree at that commit, never an older campaign branch. A new
  worktree needs its own `pnpm install --frozen-lockfile`.
* **Resolve the queue from GitHub, not prose.** Read every issue *and its comment thread*; for an
  epic, run `enumerate-sub-issues`. Drop, with the reason, anything closed, claimed (`in-progress`
  or another session's assignee), or waiting on a decision (`needs-triage`, `needs-scoping`,
  `needs-adr`). Order bug fixes before refactors and standards work, which reshape the modules the
  fixes' tests target. For `backlog`, list the current candidates but do not claim them yet.
* **Prove the review path.** Claude runs `npm run rival:health`; Codex runs
  `npm run run-claude:policy:check`, which also verifies the `gh`, push, and merge approval rules.
  An unattended run whose rival bridge is missing reviews nothing and merges nothing.
* **Prove the merge path.** `gh auth status`, and `gh --version` at or above the release
  `ship-issue` step 5 requires. The latest `main` commit's CI is green; a red trunk fails every
  unit's gate.
* **Baseline.** `npm run check` and `npm run lint` pass on the fresh worktree.
* **Devices — only when a queued unit needs the rig.** Run `start-capture-session`, the
  `perf:preflight` it names, and one known-good control capture, all while the user can unlock a
  device or grant an automation prompt. Grants expire overnight; ask the user to set the devices to
  stay awake and unlocked. Units that need a device the preflight could not prove move out of the
  queue now.
* **Ports.** Choose an unused Playwright port and pass it to every unit.
* **Open the ledger** (below) with the resolved queue.

Then report: the queue in order, what was dropped and why, the decisions only the user can make
(walk them one at a time with options, pros and cons, and a recommendation), the deadline and stop
margin, and the preflight checklist. The campaign starts when the user says go.

### The ledger

One running record of the campaign: the queue, each unit's state (pending, in flight, merged,
quarantined, skipped), PR, merge SHA, review rounds, and the questions parked for the user. Keep it
as a single comment on the epic, edited in place, when there is one; otherwise as a Markdown file in
the session's scratch directory, outside the repository. It is a view, not the truth: GitHub's PR,
issue, and label state are authoritative, and a resumed campaign re-derives the ledger from them
rather than trusting it.

## 2. The per-unit loop

For each unit, finish every step before starting the next:

1. **Refresh.** Fetch `origin/main`. The unit branches from it, never from the previous unit's
   branch.
2. **Re-check the unit.** It is still open and unclaimed — another session may have taken it since
   preflight. For `backlog`, this is where you pick: the newest open issue without `in-progress`,
   `wont-do`, or a `needs-*` label, which you have not already quarantined in this campaign.
3. **Ship it.** Run `ship-issue <n> mode=autonomous` with the authorization block, the assigned
   port, and the issues other sessions are working on (so the unit stays off their files). When the
   runner supports subagents, give each unit a **fresh implementer subagent** with only that
   context, and resume the same subagent for that unit's own repairs. A long campaign run inline
   compacts its context repeatedly and loses what the early units learned; a fresh context per unit
   carries only what the unit needs.
4. **Verify from live state, never from the unit's report.** The PR reads merged; its merge commit
   is on `origin/main` (`git merge-base --is-ancestor <sha> origin/main`); the issue is closed and
   `in-progress` is gone; the post-merge jobs on that SHA registered and finished green. Copy every
   SHA from command output. A report and the API disagreeing is itself a finding for the morning
   report.
5. **Update the ledger** and continue.

Never end the turn to ask a question. The user is not there, and a campaign that stops to ask sits
idle until morning. Park the question in the ledger, apply the unit's quarantine or skip rule, and
continue with the next unit.

## 3. When a unit fails — quarantine it, don't stall

`ship-issue` bounds each unit: two rival review rounds, and CI failures the PR caused are fixed. A
unit that still cannot pass its gate is **quarantined**:

* Replace `Fixes #<n>` with `Refs #<n>` in the PR, convert it to draft, and add a postmortem to the
  PR body: head and base SHAs, the failing commands or CI links, what was tried, the rival's open
  findings, and the concrete next step. Confirm the PR's `closingIssuesReferences` is empty — a
  closing keyword left in a commit message, or even a negated one, still links the issue for
  closure.
* Comment on the issue with the PR link and a one-paragraph summary, and remove `in-progress` so the
  issue is not stranded from every future pickup.
* Record it in the ledger and continue with the next unit.

**Establish causality before blaming the unit.** Before spending a repair attempt or quarantining,
compare the failing head with its exact base under the same command and runner. The failure belongs
to the gate, not the unit, when the base fails the same way, the head and base distributions are
indistinguishable, or the diff cannot run on the failing path. One green rerun is diagnostic
evidence, not a fix. A broken gate threatens every later unit, so it becomes the next unit: repair
it on its own PR through the same loop, with a negative control that still fails for the defect the
gate exists to catch, then retry the unit it blocked. Never quarantine a unit for a flake, a
cancelled job, or an outage.

**Queue-wide blockers stop the queue:** lost GitHub authentication, GitHub unavailable after retry,
a gate that cannot be repaired safely, or `main` red for a reason no campaign merge caused. Write
the morning report and stop.

**A reviewer outage downgrades the queue instead of stopping it.** If the rival cannot run after one
retry, a substituted review withdraws the merge authority (`ship-issue` step 4). Keep going in
`ship-issue`'s default mode: each unit ends as an open, mergeable PR branched from `main`, and the
morning report lists them for the user to merge.

## 4. When `main` goes red after a campaign merge

Stop taking new units. If the failure reproduces on the campaign's merge commit and not on its
parent, open a revert PR and put it through the same loop, rival review and merge gate included. A
revert is the smallest reversible fix; a forward fix is a new unit that needs its own issue. Resume
the queue once `main` is green again. A red `main` the campaign did not cause is a queue-wide
blocker.

## 5. Stop and report

**Stop margin.** Start no new unit when the time left before the deadline is shorter than the
longest unit this campaign has completed (90 minutes before any unit has completed). Finish the unit
in flight: through merge, or through quarantine.

**Control messages** steer the running campaign; they do not replace it.

* **status** — answer from live state: shipped, in flight (unit, phase, PR), quarantined, parked
  questions, and the estimate left. Keep working afterward; a status question is not a stop.
* **pause** — pick no new unit, bring the in-flight unit to a coherent pushed checkpoint, and report
  the exact resume point.
* **resume** — re-derive the ledger from GitHub, re-run the preflight items that can go stale
  (review path, trunk CI, devices), then continue.
* **wrap up** — pick no new unit, finish the in-flight unit through merge or quarantine, and write
  the morning report. Wrap up means stop; it never resumes the queue.

**The morning report** leads with a table: issue, PR, outcome (merged, quarantined, skipped, open
for the user), merge SHA, review rounds, and CI. Then:

* **What a user would notice** — the product-facing change of each merged unit, in plain words,
  separate from any speed gain.
* Quarantined and skipped units, each with its reason and next step.
* The questions parked for the user, as a numbered decision list.
* The autonomous decisions each unit made.
* Follow-ups the units drafted, for the user to file; the campaign files none.
* The final state of `main` CI, and the device rig: released, or left running as the user asked.

Run `git rev-parse --verify --quiet "<sha>^{commit}"` over every SHA in the report before sending
it. Then run `self-heal` on the campaign's friction.

## Performance campaigns — `profile=performance`

`improve-performance-matrix` owns what a performance unit is: one causal product cluster, proven
with faithful A/B evidence on the release-gate rows, under its evidence and physical-device rules.
This skill supplies the queue, the merge-as-you-go loop, and the ledger around it. Three rules are
added for unattended performance work:

* **The device preflight is mandatory**, with the user present, including the control capture.
* **Device loss ends device work.** When the rig drops and the documented non-human recovery does
  not restore it, stop capturing. Continue with queued units that need no device, or wrap up.
  Evidence-only or harness-only PRs are never a substitute for the product work the rig was meant to
  measure.
* **One gate gets a bounded share of the night.** After about eight hours on the same release-gate
  cell without it passing, record the best measured version as that cell's outcome and move on;
  further marginal tuning belongs to a later campaign that starts with a new hypothesis.
* **The ledger separates product, harness, and evidence commits**, and the morning report says
  plainly when no product change landed.
