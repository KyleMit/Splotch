---
name: orchestrate-sessions
description: Coordinate a multi-issue effort through human-relayed Claude or Codex worker sessions — prioritize batches, emit one copyable worker prompt at a time, and verify pasted reports and preservation of evidence before choosing a follow-up or the next batch. Use when asked to orchestrate separate sessions or manage their prompts and reports; ship-campaign runs an unattended queue inside one worker session.
---

# Orchestrate sessions

The user carries prompts to workers and brings reports back. You maintain the plan and verify the
results. **Do not implement, launch workers, or run their experiments.** Your loop is:

**inventory → decisions → one prompt → pasted report → verify → update the durable plan → follow-up
or next prompt**

Use `ship-issue mode=autonomous` for one shipping issue, or `ship-campaign` with an explicit list
for a batch. Those skills own implementation, review, CI repair, and merging. An investigation or
preservation-only follow-up needs a bounded task, not a ceremonial shipping PR.

## Authority and the durable plan

Invoking this workflow for a named queue authorizes maintaining its plan and commenting on its
existing issues/PRs. Worker prompts carry explicit authority to branch, push, open PRs, post rival
reviews, manage claims, and merge through the named shipping skill's gates. The user handing that
prompt to a worker authorizes that worker's scoped execution. Honor any narrower user instruction
(including planning only or no merge) in the plan and prompt; do not silently restore autonomy. Do
not create issues, close an epic, or operate on unrelated work without existing authorization.

External-review data sharing is a separate boundary: carry only the user's existing authorization
for the necessary private source/diffs, destination provider and review rounds. This skill does not
grant that permission. If the worker's required rival review lacks it, resolve that specific
human-only authorization before dispatch instead of writing permission into the prompt yourself.

**Create a durable plan on the first turn, before issuing a prompt.** Prefer one editable comment on
the existing epic/tracking issue. Without one, use a named persistent file outside disposable
worktrees (default `~/splotch-campaigns/<campaign>/plan.md`) and report its absolute path and
local-only status. Never rely on a chat message, temporary directory, or uncommitted worktree file
as the only plan. A write failure is an outstanding blocker to dispatch, not permission to pretend
the plan was saved. Do not put sensitive machine state in a shared plan.

The plan needs enough information to resume without reading transcripts:

* Queue and scope; each parent's API child counts; batch IDs, issues, dependencies, relevant file
  overlap, order, done-when, and exclusions.
* Decisions and authorization, including limits; pending human choices; worker/session identity when
  known; prompt revision; **prepared, handed off, active, reported, verified, blocked** states.
  Preparing a prompt does not prove anyone started it. Ask for delivery status only when it affects
  a collision or next assignment; check claims and PRs before reassigning.
* Assigned ports and exclusive-host/device owner; rig keep/release policy; cumulative time and
  attempts on each gate across sessions, rather than a fresh budget with every handoff.
* Per-unit PR/head/merge SHA, review rounds, expected CI and observed runs, issue/claim state, last
  verification time, report contradictions, blockers, concrete next obligations, and next owner.
* Preservation inventory: substantive claim/outcome → record and revision → content/access and
  reproduction coverage checked → remaining gaps (including local-only material).

The plan is a view of evidence. On resume, re-read GitHub and the linked records before trusting its
statuses. Preserve useful decision history while replacing stale conclusions.

## Inventory, batch, and resolve decisions

Read every issue body and full comment thread. For an epic, use `enumerate-sub-issues`, including
nested parents and count reconciliation; never scrape its prose for the queue. For an explicit list,
apply the same classification to its members. Distinguish actionable work from claimed work,
decision-blocked work, already completed work, and withdrawn premises. Do not claim issues on a
worker's behalf just because you prepared a prompt; the shipping skill claims them at intake.

Batch about **2–4 related issues** by shared files and dependencies. Keep overlapping files in the
same sequential worker; parallelize only independent batches. Dependencies take precedence, then
priority; bug fixes generally precede refactors and standards changes that reshape their targets.
Each issue still gets its own PR, merged before the next branches from freshly fetched
`origin/main`. Name the actual issues and files reserved by other workers in every prompt.

List all human-only decisions up front, ordered by dependency. Walk through one at a time with
options, concrete pros/cons, and a recommendation using `walk-through-decision`; let the user answer
by number. Record the answer and its limits. Do not ask again for authority already granted. Keep
independent work available while a decision blocks another batch.

Allocate a distinct unused Playwright port per active worker, with `--workers=1`. Workers retry a
different port on `EADDRINUSE` and report the replacement; nobody kills another session's listener.
Full suites, fixed-port Netlify flows, performance captures, and native runs are host-exclusive:
different ports do not make them safe to overlap. Record who owns the host/rig before dispatching
that work; a worker must wait or report the missing slot rather than competing for it.

For device work, name the `start-capture-session` preflight and whether this worker must **keep the
rig running and verified idle** for the next worker or **release it** with
`release-capture-session`. Do not start/stop the rig from the orchestrator. Confirm the receiving
worker was given an amended policy before blaming it for following an older prompt.

## Build one prompt

Emit **exactly one copyable fenced prompt per response that dispatches work**, addressed either to a
new batch or its originating session. If a decision or unavailable resource prevents dispatch, state
that instead. When everything is verified complete, report completion without inventing work.
Several independent batches may be active, but issue their prompts one at a time and record
delivery.

Keep the prompt lean: issue URLs, exact scope, done-when, current decisions, and only the reading
needed for the first step. Route to relevant skills and let workers load references when needed; do
not demand that they read a library of long documents in full. Use bare skill names so the same
prompt works in Claude and Codex. Fill the following rules block with concrete values, including
`none` or `not applicable` where appropriate; never leave placeholders in a delivered prompt.

```text
Authorization: You may create branches/worktrees, push, open PRs, post rival reviews, manage these
issues' claims, and merge through the shipping workflow's autonomous gate. You may preserve scoped
findings in these existing issue/PR discussions and maintained docs/skills. Do not file new issues,
bypass protection, weaken checks, or expand scope. [Replace with any narrower recorded authority.]

Campaign/batch: <ID, plan location and prompt revision>. Work <ordered issue URLs and done-when>.
External review: <the user's already-granted scope and destination, or no private data sharing>.
Use ship-issue mode=autonomous for one issue, or ship-campaign for this explicit batch; honor its
authority and stop conditions. <For a preservation/investigation follow-up, replace this line with
the specific task and remove unnecessary shipping/merge authority.>

Read each issue body AND all comments before implementation; recheck claims and changed premises.
Before implementation, prove the named workflow's current review/auth/merge preflight; use the
installed rival bridge. If blocked, report the exact attempted command and current refusal, with
sensitive values redacted. Do not generalize an old refusal to an untried action or route around it.
Start each issue from freshly fetched origin/main in a clean worktree. One issue per PR; merge and
verify it before starting the next. Any new regression test must fail against pre-change code for
the intended reason (negative control); report the commands/results. For non-code work, state the
appropriate behavioral or document validation instead of manufacturing a red test.

After merge, verify issue closure, explicitly remove in-progress, and re-read to confirm. If still
open, retain the claim and report it; do not close it by hand. Verify applicable checks registered
AND completed on the exact head/merge SHA; an early successful checks --watch is insufficient.

Parallel reservations: <issue numbers and files to avoid, or none>. Playwright port: <port>, with
SPLOTCH_E2E_PORT and --workers=1; on collision pick an unused port and report it. Stop only processes
you own. Host-exclusive slot: <owner/availability>; do not overlap full suites or device/perf work.
Rig policy: <keep running and verified idle / release / not applicable>. <Device preflight if used.>
Limits: <deadline, remaining cumulative gate budget, and bounded follow-up scope>.

Before returning, perform the preservation sweep below even if there is no PR, no product change,
an unmerged PR, a negative result, or a blocker. Assume nobody will read your chat or transcript.
Preserve substantive outcomes, evidence and reproduction inputs, decisions and limits, rejected
experiments worth avoiding, reusable lessons, unfinished patches, blockers, and next obligations.
Use maintained docs/skills for reusable guidance, repository evidence or durable attachments for
reproducible results, and existing issue/PR discussions for scoped findings and follow-ups. Feed
status and cumulative effort back to the campaign plan. Respect the authorized write scope; draft
new issues for the user instead of filing them. Preserve sensitive machine state in an explicit
local handoff outside disposable worktrees; distinguish that local continuation safety from shared
portable evidence. Sanitize published material; never commit secrets, device identifiers, or
diagnostic patches into production code. Preserve unfinished patches in an appropriate handoff.
A table, screenshot, hash, or pathname alone does not preserve the inputs and analysis supporting
its claims. Link existing adequate records; do not duplicate them or create a ceremonial PR.

Return a compact pasteable report: batch/prompt revision and worker session; per issue the PR and
merged/open/no-PR outcome; head and merge SHA copied from output and verified (or not applicable);
rival review rounds/findings; expected CI and exact-head/merge run results; negative control or
other validation; issue state and claim cleanup; decisions, retractions, blockers, leftovers and
next actions; gate effort spent and remaining; actual port and rig state. Include a preservation
inventory: what matters, its record and revision, what content/access/reproduction you checked,
and anything missing, local-only, or blocked. If nothing new needs preservation, explain why.
```

For a multi-issue worker, carry `ship-campaign`'s own authority block verbatim too; it owns its
gate/trunk-repair exceptions. If the user's scope excludes those exceptions, use separately bounded
`ship-issue` tasks instead of invoking a broader campaign. For a follow-up, keep the applicable
rules and preservation/report contract while narrowing the request to the unresolved obligations.

## Evaluate every returned report

**Verify → update the plan → decide**, in that order. Do this proactively, even if the report says
the session can be archived or no change was needed.

1. **Read the whole returned report**, including pasted progress, caveats, appended corrections, and
   preservation inventory. Match its batch, session, prompt revision, issues and PRs to the plan.
   Reports can be duplicated, partial, or out of order. New evidence can supersede an earlier
   blocker; an old report cannot roll a verified state backward. Query current state rather than
   issuing a second worker or redirecting an active experiment from a partial progress note.
2. **Verify the shipping claims from live state.** Read PR state, current head, posted rival reviews
   and threads, merge SHA, issue state/labels/claims, and full relevant comments. Fetch
   `origin/main` and check the API's merge SHA with
   `git merge-base --is-ancestor <sha> origin/main`. Derive expected applicable CI from workflows
   and conditions as `drive-pr-to-mergeable` does; require registration and completion on the exact
   head and merge, including post-merge jobs. Check current `main` CI too. Missing/pending checks
   are unresolved, not green. Reconcile epic child counts via the API. Record contradictions without
   attributing a cause you have not inspected.
3. **Verify preservation independently of shipping.** Open each claimed record at the relevant
   revision. Check its contents, accessibility to the intended future reader, and whether inputs,
   commands/tool versions, analysis and limitations actually support the report's substantive
   claims. Follow attachment links; a URL or “published” assertion is not verification. Look for
   reusable lessons absent from maintained docs/skills and leftovers hidden in caveats. Distinguish
   missing shared evidence from a verified local handoff retained for sensitive continuation state.
   A merged PR proves neither. A no-PR result still needs its scoped disposition and adequate
   evidence; do not force a PR or infer authority to close its issue.
4. **Update the durable plan**, with verification time, evidence links/revisions, product outcome
   separate from remaining preservation/cleanup obligations, cumulative gate effort, contradictions,
   decisions and next owners. Deduplicate reports by unit and verified revision; do not count the
   same merge, hours, or experiment twice. If time accounting is unclear, record uncertainty and
   request the missing delta rather than resetting the budget.
5. **Choose one next action.** A failed gate, unfinished authorized work, unaddressed finding, or
   preservation gap gets a bounded follow-up to the same worker while it still has context. Name the
   exact missing material/claim, destination, and verification needed. Reuse existing evidence; do
   not rerun completed experiments just to package them. If the worker is unavailable, give one
   replacement preservation prompt through an authorized route and record any irrecoverable gap. If
   every obligation is verified, advance to the next unblocked batch. If independent work can
   continue while a blocker remains, retain that obligation and its owner explicitly in the plan.

Never mark a unit fully complete or recommend discarding its session/worktree while required
knowledge or artifacts exist only in its transcript or disposable files. Inaccessible evidence is an
explicit preservation blocker with the affected claims and next action. Adequate existing records
pass without duplicate publishing, a new PR, or a token “lessons learned” edit.

## Bound effort and finish

For performance work, track cumulative time on the same gate across prompts and workers. After about
eight hours without passing (or the user's tighter budget), stop another round of marginal tuning.
Preserve the best measured valid outcome, failed attempts and remaining gap; propose a new
hypothesis or another batch. **A time limit does not make a failed gate pass or authorize a merge.**
Do not spend the budget again under a renamed batch. Shipping skills retain their own review/repair
limits; the orchestrator does not restart their review loop to chase a zero-findings report.

On pause or wrap-up, issue no new batch; record in-flight owners, exact continuation points, open
decisions, preservation gaps, and the rig policy. Resume starts by verifying the plan against live
state. At completion, report reconciled outcomes and evidence, any unresolved obligations and
current `main` CI, plus the durable plan location. Epic closure and worktree disposal remain
separate actions requiring their existing authority and verified preconditions.
