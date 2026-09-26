---
name: ship-campaign
description: Ship a queue of GitHub issues unattended — an explicit list, an epic's sub-issues, or the newest unclaimed backlog issues — one at a time through ship-issue mode=autonomous, merging successful PRs before the next starts from fresh main. Proves everything that could stall an overnight run while the user is still present, quarantines a stuck issue instead of stalling the queue, and ends with a verified morning report. Use when asked to run a campaign, work through several issues or an epic overnight or unattended, burn down the backlog, or grab the next issue.
---

# Ship a campaign

A campaign is a queue of issues shipped **merge-as-you-go**:

**preflight (user present) → for each issue: fresh `main` → `ship-issue mode=autonomous` → verify
the merge or quarantine from live state → next → morning report**

Every successful unit merges before the next one starts, branching from the `main` that already
contains its predecessors. That is the point of the shape. A quarantined or skipped unit is
recorded, then the next independent unit branches from fresh `main` without carrying its PR. An
independent reviewer vets each change as it lands, so a mistaken premise is caught in the PR that
introduced it instead of compounding through the layers stacked above it, and no fix ever has to be
carried to the tip of a chain. Ship a chain of unmerged dependent PRs only when the user asks for
one; that is `create-stacked-prs`.

One campaign runs in one session. Several sessions working one epic in parallel is orchestration,
which hands out prompts rather than implementing, and is not this skill.

## Invocation and authority

The input names the queue and, optionally, a deadline:

* **A list** — issue numbers or URLs, shipped in the given order unless a dependency forces another.
* **`epic=<n>`** — the epic's open children, ordered by `enumerate-sub-issues`.
* **`backlog`** (optionally `backlog=<count>`) — the newest open issues nobody has claimed, picked
  one at a time so that parallel sessions each pick a different issue (see step 1).
* **`until=<time>`** or **`hours=<n>`** — the deadline and deadline reserve described in step 5.
* **`profile=performance`** — the unit is a causal performance cluster; see the last section.

Invoking the skill is the user's standing authorization, for every unit in the queue, to: create
branches and worktrees, push, open PRs, post the rival's reviews, apply and remove `in-progress`,
merge each PR through `ship-issue`'s autonomous gate, comment on queued issues and their epic, and
ship two kinds of unqueued **free-form unit**: a trunk-repair PR that fixes `main` forward after it
turns red during the campaign (step 4), and a gate-repair PR for a check proven broken on its own
base (step 3). It does **not** authorize bypassing branch protection, weakening a test or gate to
get green, force-pushing a shared branch, closing an issue except through `Fixes` on merge, filing
new issues, or touching work outside the queue and those two exceptions. Carry this block verbatim
into every unit's instructions: an unattended unit must never have to infer its authority, and a
runner that sees "never merge" anywhere in its instructions will refuse the merge.

**A denied tool call is not a withdrawn authorization.** A single rejected command — a permission
prompt declined, a hook refusing an edit, a call interrupted mid-turn — says nothing about the grant
above, and the campaign already has its own vocabulary for changing that grant: the **pause**,
**wrap up**, and **stop** control messages in step 5. Until one of those arrives, the authorization
holds. So treat a denial as you would any other failed command: adjust and continue. Look for the
route that does not need the denied call — the state it would have fetched is usually already on
disk or one different query away — and if the unit genuinely cannot proceed, that is step 3's
quarantine, not a question for the user. Handing a pre-authorized merge back costs the user the
round trip the campaign exists to spare them, at the moment they are least likely to be watching.
(2026-09-22, unit 12 of the 2161–2170 campaign: a declined `broker.mjs next`, whose rival had
already finished and written its findings to disk, was read as the merge authority lapsing; the
queue stopped with a green, reviewed PR unmerged.)

**Report an interruption from live state, never from assumption.** What step 5 requires of
**status** binds harder on an unplanned stop, because that report is what the user decides on:
re-read the PR, the checks, the issue's labels, and the reviewer's session directory before
describing any of them. In the incident above the interruption report asserted the rival was
mid-request and might hang for an hour. Both claims were false, both were contradicted by files
already sitting in the session directory, and both made stopping look better founded than it was.

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
(walk them one at a time with options, pros and cons, and a recommendation), the deadline and
deadline reserve, and the preflight checklist. The campaign starts when the user says go.

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
3. **Ship it.** Run `ship-issue <n> mode=autonomous` — or, for a free-form unit (a performance
   cluster, a trunk repair, a gate repair), `ship-issue mode=autonomous` with the unit's written
   spec in place of an issue number — with the authorization block, the assigned port, and the
   issues other sessions are working on (so the unit stays off their files). When the runner
   supports subagents, give each unit a **fresh implementer subagent** with only that context, and
   resume the same subagent for that unit's own repairs. A long campaign run inline compacts its
   context repeatedly and loses what the early units learned; a fresh context per unit carries only
   what the unit needs.
4. **Verify from live state, never from the unit's report.** The PR reads merged; its merge commit
   is on `origin/main` (`git merge-base --is-ancestor <sha> origin/main`); the post-merge jobs on
   that SHA registered and finished green; and, for an issue unit, the issue is closed and
   `in-progress` is gone. `ship-issue` assigns the issue when it claims it and does not unassign it,
   so remove that assignee here and re-read the issue to confirm. A free-form unit has no issue to
   check; its PR body carries the spec, and the ledger records it. Copy every SHA from command
   output. A report and the API disagreeing is itself a finding for the morning report.
5. **Update the ledger** and continue.

**A unit that stops before opening a PR is skipped.** `ship-issue` stops without a PR when the work
is far larger than it read or needs a product decision. For an issue unit, verify its rollback from
live state — no `in-progress` label and a comment naming the blocker — then remove the assignee
`ship-issue` added and re-read the issue to confirm. A free-form unit has no issue: record its spec
and blocker in the ledger, and on the tracking issue when the unit has one. Either way, record the
unit as skipped, with the blocker and the question it raises, and continue using the successor check
in step 3.

Never end the turn to ask a question. The user is not there, and a campaign that stops to ask sits
idle until morning. Park the question in the ledger, apply the unit's quarantine or skip rule, and
continue with the next independent eligible unit.

## 3. When a unit fails — quarantine it, don't stall

`ship-issue` bounds review at two rival rounds but iterates on a CI failure the PR caused until it
is green, which an unattended run cannot afford unbounded. The campaign adds its own budget per
unit:

* **Two product repair attempts** for CI failures the unit caused — a change to the unit's code in
  response to a failure whose causality (below) is established. Polling, one rerun of a cancelled or
  infrastructure-failed job, and the head-versus-base diagnosis do not count.
* **Forty-five minutes of waiting per head** for the expected checks to register and finish. At the
  deadline, inspect the runs: retry a cancelled or infrastructure run once, treat GitHub being
  unavailable as queue-wide, and classify anything else by causality.

A unit that exhausts either budget, still carries a valid blocking rival finding after round two, or
runs out of campaign time before its review and merge gate finishes is **quarantined**:

* **Every unit:** convert the PR to draft and add a postmortem to its body — head and base SHAs, the
  failing commands or CI links, what was tried, the rival's open findings, and the concrete next
  step. Record it in the ledger and continue with the next independent eligible unit.
* **An issue unit, also:** replace `Fixes #<n>` with `Refs #<n>` and confirm the PR's
  `closingIssuesReferences` is empty — a closing keyword left in a commit message, or even a negated
  one, still links the issue for closure. Comment on the issue with the PR link and a one-paragraph
  summary, then release the claim: remove `in-progress` and the assignee `ship-issue` added, and
  re-read the issue to confirm both are gone. A leftover label or assignee strands the issue from
  every future pickup, including the preflight of the next campaign.
* **A free-form unit, also:** post the postmortem's summary to the tracking issue when the unit has
  one. There is no issue lifecycle to unwind.

After quarantine or skip, check each queued successor against live `main`. Record a successor that
needs the unfinished unit as dependency-blocked and skipped, naming that prerequisite in the ledger;
continue with the first unit whose prerequisites are present and which passes step 2's open/claim
check. A quarantine or skip never blocks unrelated queued work.

**Establish causality before blaming the unit.** Before spending a repair attempt or quarantining,
compare the failing head with its exact base under the same command and runner. The failure belongs
to the gate, not the unit, when the base fails the same way, the head and base distributions are
indistinguishable, or the diff cannot run on the failing path. One green rerun is diagnostic
evidence, not a fix, and gate failures spend no repair attempt. A broken gate threatens every later
unit, so repairing it becomes the next unit — a free-form gate-repair unit under the authority
block, through the same loop, with a negative control that still fails for the defect the gate
exists to catch — and the blocked unit retries afterward. The exception covers only a check proven
broken on its own base; anything wider is a queue-wide blocker. Never quarantine a unit for a flake,
a cancelled job, or an outage.

**Queue-wide blockers stop the queue:** lost GitHub authentication, GitHub unavailable after retry,
a gate that cannot be repaired safely, or `main` red for a reason no campaign merge caused. Write
the morning report and stop.

**A reviewer outage downgrades the queue instead of stopping it.** If the rival cannot run after one
retry, a substituted review withdraws the merge authority (`ship-issue` step 4). Keep going in
`ship-issue`'s default mode: each unit ends as an open, mergeable PR branched from `main`, and the
morning report lists them for the user to merge.

## 4. When `main` goes red during the campaign — roll forward

Never revert a campaign merge. The red may be a flaky test the merge only surfaced rather than a
defect it introduced, and a revert would throw away reviewed work to hide it. Instead:

1. **Pause the queue.** Start no new unit; a red `main` fails every later unit's merge gate anyway.
2. **Find the red.** Read the failing job's logs on the merge SHA, then compare that SHA with its
   parent under the same command and runner, rerunning or interleaving when timing or randomness is
   involved. Classify it: a defect the merge introduced, a flaky test or gate, or an infrastructure
   failure. One green rerun is diagnostic evidence, not a fix.
3. **Fix it forward** as a free-form trunk-repair unit through the same loop — fresh branch from
   `origin/main`, rival review, the merge gate. A product defect gets the fix and a regression test;
   a flaky test gets its cause repaired with a negative control that still fails for the defect the
   test exists to catch, never a skip, a retry wrapper, or a loosened assertion. An infrastructure
   failure gets one rerun and, if it persists, becomes a queue-wide blocker.
4. **Resume** once the post-merge jobs on the repair's merge SHA finish green, and record the red,
   its classification, and the repair PR in the ledger and the morning report.

A trunk repair that exhausts the unit budget in step 3 is a queue-wide blocker: `main` stays red, so
write the morning report and stop.

## 5. Stop and report

**Deadline reserve.** Unless a queue-wide blocker (step 3), a red-`main` pause (step 4), or a pause
or wrap-up control message has stopped the queue, keep taking the next independent eligible unit
after each merge, quarantine, or skip. Reserve only the final 15 minutes before the deadline for
live-state verification, ledger updates, and the morning report; never scale that reserve to the
longest completed unit. Before starting another unit, choose a bounded checkpoint whose work and, if
needed, full step 3 quarantine can finish before the reserve begins. Scope the work to the time left
instead of idling through hours of review, CI, or device waits from an earlier unit. If its review
and merge gate cannot finish in time, apply step 3 quarantine by the reserve start: leave a draft PR
with the exact evidence, blocker, and next step, unwind any issue claim, and do not call it shipped.
At reserve start, begin no new unit; verify live state and report by the deadline. If an unexpected
in-flight unit remains, quarantine it promptly. Do not overrun the deadline merely to merge.

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
* The questions parked or held for the user, as a numbered decision list, each with its walkthrough.
* **Decisions made in autonomous mode** — every `walk-through-decision` record the units produced,
  each laid out briefly: the question, the pick, why it wins, and the rival outcome (agreed,
  converged, split on a low-stakes call, or unreviewed). The user reads this list to catch a call
  they would have made differently.
* Follow-ups the units drafted, for the user to file; the campaign files none.
* The final state of `main` CI, and the device rig: released, or left running as the user asked.

Run `git rev-parse --verify --quiet "<sha>^{commit}"` over every SHA in the report before sending
it. Then run `self-heal` on the campaign's friction.

## Performance campaigns — `profile=performance`

`improve-performance-matrix` owns what a performance unit is: one causal product cluster, proven
with faithful A/B evidence on the release-gate rows, under its evidence and physical-device rules.
This skill supplies the queue, the merge-as-you-go loop, and the ledger around it. Each cluster is a
free-form unit: its spec is the cluster's hypothesis and target cells, it has no issue to claim or
close, and the performance tracking issue carries the ledger. Three rules are added for unattended
performance work:

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
