# Handoff — issue stack coordinator

> 2026-08-01 · branch `codex/issue-stack-coordinator-handoff` · coordinate the ordered issue stack
> with fresh sequential workers

## Objective & non-goals

Resume this packet in a fresh Codex session and make that root session the long-running coordinator
for the ordered issue stack below. The coordinator must spawn exactly one fresh implementation
worker at a time, wait for that issue's PR to pass independent adversarial review and CI, validate
the result, then spawn the next fresh worker.

Each issue gets its own branch, focused diff, rich PR title/body, and GitHub stacked-PR layer. The
implementation worker and its independent reviewer both start without this conversation's history.
The coordinator retains only the queue and compact completion records.

Before spawning any worker, the coordinator must finish the permission and hardware preflight under
**Decisions made (and why)**. Delegates do not seek new permission grants themselves. A delegate
that encounters an unapproved operation returns the exact command and reason to the coordinator; the
coordinator obtains or denies the permission and then resumes the same delegate.

Non-goals:

* Do not merge the PRs. Leave a reviewed, green stack for the user to merge bottom-up.
* Do not implement issue fixes in the coordinator context.
* Do not run issue workers in parallel or let two agents edit the checkout concurrently.
* Do not invoke `burn-down-backlog` unchanged: its newest-first selection and `main` PR base are
  wrong for this fixed stack.
* Do not add a reusable orchestration skill to the product branches for this one queue.
* Treat the second occurrence of issue 686 in the original list as a duplicate unless the user
  explicitly says it represents a second PR layer.

## State

* Coordinator handoff branch: `codex/issue-stack-coordinator-handoff`.
* Product stack trunk: latest `origin/main` after this packet is consumed.
* PR 682 is merged; its tiled renderer is available on `main`.
* Local `gh` is 2.96.0.
* The official `github/gh-stack` extension is installed.
* `gh stack link` is the stack operation; it does not require persistent local stack tracking.
* An unrelated handoff, `docs/handoff/audit-burndown-636.md`, also exists. Resume this packet by
  naming `issue-stack-coordinator` explicitly.
* No product implementation has started and no issue in this queue was claimed by this session.

| Commit              | What                                                      |
| ------------------- | --------------------------------------------------------- |
| none before handoff | This branch exists only to carry and consume this packet. |

Files touched by this handoff:

* `docs/handoff/issue-stack-coordinator.md`

### Ordered layers

| Layer | Issue                                                | Branch                               | PR base        | Special gate                                      |
| ----: | ---------------------------------------------------- | ------------------------------------ | -------------- | ------------------------------------------------- |
|     1 | [684](https://github.com/KyleMit/Splotch/issues/684) | `codex/stack-684-dev-seams`          | `main`         | Web and Capacitor release-seam builds             |
|     2 | [683](https://github.com/KyleMit/Splotch/issues/683) | `codex/stack-683-live-tile-budget`   | layer 1 branch | Real-iPad campaign and ADR amendment              |
|     3 | [687](https://github.com/KyleMit/Splotch/issues/687) | `codex/stack-687-webkit-ci-gate`     | layer 2 branch | PR and release-tag CI behavior                    |
|     4 | [686](https://github.com/KyleMit/Splotch/issues/686) | `codex/stack-686-engine-counters`    | layer 3 branch | Deterministic counter ceilings from layer 2 data  |
|     5 | [689](https://github.com/KyleMit/Splotch/issues/689) | `codex/stack-689-ipad-release-rig`   | layer 4 branch | External Mac/iPad automation setup                |
|     6 | [691](https://github.com/KyleMit/Splotch/issues/691) | `codex/stack-691-fast-subset-drift`  | layer 5 branch | Depends on layers 3 and 5                         |
|     7 | [694](https://github.com/KyleMit/Splotch/issues/694) | `codex/stack-694-polaroid-animation` | layer 6 branch | Candidate implementations and real-iPad profiling |
|     8 | [693](https://github.com/KyleMit/Splotch/issues/693) | `codex/stack-693-overlay-swap`       | layer 7 branch | Cold-cache Slow 3G visual verification            |
|     9 | [695](https://github.com/KyleMit/Splotch/issues/695) | `codex/stack-695-undo-depth-budget`  | layer 8 branch | Real-iPad undo-depth measurement                  |
|    10 | [696](https://github.com/KyleMit/Splotch/issues/696) | `codex/stack-696-run-splotch-ready`  | layer 9 branch | Ruler regeneration and real driver smoke test     |

## Decisions made (and why)

### Coordinator and context isolation

After consuming this packet, create one persistent goal with this completion criterion:

> Build the ten-layer ordered GitHub PR stack for issues 684, 683, 687, 686, 689, 691, 694, 693,
> 695, and 696. For each layer, use a fresh no-history implementation worker and a separate
> no-history adversarial reviewer; address all review findings and reach green CI before starting
> the next layer. Do not merge. Stop rather than skip when the next ordered issue is genuinely
> blocked.

The root session is orchestration-only. Spawn each implementation worker with no inherited turns.
Give it only the repository, issue number, exact head branch, exact PR base branch, and the worker
contract below. Wait for it to finish before starting another. Require a compact final record:

```text
ISSUE=<number>
BRANCH=<branch>
BASE=<base branch>
COMMIT=<full sha>
PR=<url>
STACK=<stack number or pending-second-layer>
REVIEW=<finding count and disposition>
CI=<green or blocker URL>
WORKTREE=<clean|dirty with paths>
```

Do not stream raw worker logs into the coordinator unless intervention is required.

### Permission gate — complete before worker 1

Codex subagents inherit the parent session's sandbox and permission mode, but reusable command
approvals must still be verified in the fresh session. The coordinator owns every approval. Do not
spawn worker 1 until all applicable rows below are confirmed or explicitly marked coordinator-only.

| Capability                        | Coordinator preflight                                                                                                                                                  | Policy                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Git ref creation                  | Verify `git switch -c` is approved.                                                                                                                                    | Reusable approval is appropriate.                                                                                              |
| Git staging and commits           | Verify `git add <explicit paths>` and `git commit -m ...` can update `.git`.                                                                                           | Approve the narrow Git command prefixes; never use `git add -A` in a mixed tree.                                               |
| Branch pushes                     | Verify `git push -u origin <explicit-branch>` with a disposable/no-op-safe coordinator branch.                                                                         | Approve `git push -u origin`; never approve force-push or deletion.                                                            |
| GitHub reads/writes               | Verify the GitHub connector can fetch issue 684, label issues, create draft PRs, read reviews, and inspect CI metadata.                                                | Use the connector first; no delegate CLI auth prompts.                                                                         |
| GitHub stack linking              | Run `gh auth status`, `gh extension list`, and `gh stack link --help`.                                                                                                 | `github/gh-stack` is installed; approve only `gh stack link`, not merge/unstack commands.                                      |
| Git fetch                         | Run `git fetch origin`; verify a clean tree and `main` can fast-forward to `origin/main`.                                                                              | Fetch is read-only remote access; stack branches after layer 1 branch from the preceding layer, not moving `main`.             |
| Standard checks                   | Run a cheap repository check before delegation and confirm `npm`/Playwright commands work in the workspace sandbox.                                                    | Use issue-relevant commands from the testing skill; do not preapprove package installation.                                    |
| Physical iPad                     | Verify USB attachment, unlocked/trusted state, foreground Safari tab, Web Inspector, `ios_webkit_debug_proxy`, Appium/XCUITest when needed, and reachable LAN serving. | Hardware runs are coordinator-owned if the delegate lacks device access. Never let a delegate broaden host/device permissions. |
| Machine-level setup for issue 689 | Resolve the exact push-model `launchd` files, commands, credentials, and targets before spawning the issue 689 worker.                                                 | Request exact coordinator approval before that worker. Do not grant broad `launchctl`, home-directory, or credential access.   |

Known reusable approvals established while creating this packet:

* `git switch -c`
* `git add`
* `git commit -m`
* `git push -u origin`
* `gh extension install`
* `gh stack link`

Do not assume those approvals survived into a different permission profile: verify them and record
their result in the resume delta before delegation.

The physical-iPad requirements cannot be made purely permission-driven. The device must be
USB-connected, unlocked, trusting the Mac, on reachable Wi-Fi, and Safari must remain foregrounded
with a tab open. Confirm this once up front. If the rig is not ready, stop before claiming issue 684
rather than discovering the blocker after several PR layers exist.

Delegate prompt rule:

> Do not request new approval rules. Use inherited approved commands only. If an operation is
> outside the sandbox but its exact command prefix was approved by the coordinator, invoke it with
> the existing approval and do not propose a new rule. If an operation has no existing approval or
> is denied, stop that operation, send `PERMISSION_BLOCKED` with the exact command, target, reason,
> and safest reusable prefix to the coordinator, and wait. Do not substitute a broader or less safe
> command.

### Per-issue worker contract

For the assigned issue only:

1. Verify the checkout is clean and at the exact base SHA supplied by the coordinator.
2. Apply `in-progress` before editing and leave it until the issue closes on merge.
3. Read the issue in full and load the relevant Splotch skills. Use the issue as the spec. Stop on a
   genuine missing decision instead of silently changing scope.
4. Create the exact layer branch from the preceding layer's head. Never branch later layers from
   `main`.
5. Implement and verify the issue. Preserve a linear history and aim for one final logical commit;
   finish automated review before the next layer exists so fixes do not require an upstack rebase.
6. Push the branch and create a rich draft PR through the GitHub connector. The first PR targets
   `main`; every later PR targets the preceding layer branch. Include `Fixes #<issue>` in the PR
   body. Follow `pr-screenshots` for visible changes.
7. After PR creation, the coordinator links it into the native stack. For layer 2:
   `gh stack link <layer-1-pr> <layer-2-pr>`. For later layers:
   `gh stack link <stack-number> <new-pr>`.
8. Spawn a fresh no-history reviewer with only the repository and PR number. It runs
   `leave-pr-review` and posts its findings. The implementation worker then runs
   `address-pr-review`, fixing or rebutting every finding and resolving every thread.
9. Drive CI green. File a separate issue for a demonstrated pre-existing failure rather than
   absorbing it into the layer.
10. Return the compact completion record. The coordinator independently verifies the PR base, head
    SHA, stack membership, review resolution, CI, and clean tree before advancing.

The first PR cannot form a GitHub stack alone. Record its stack state as `pending-second-layer`.
Layer 2 creates the native stack object; subsequent layers append to its stack number.

### Review and later lower-layer changes

Automated adversarial review happens before the next branch is created. If later human review
changes a lower layer after higher branches exist, make the fix on the owning lower branch and use
the GitHub stack cascading rebase/push workflow. Do not work around a lower-layer defect in a higher
PR and do not merge during this coordinator run.

### Handoff branch isolation

This coordinator branch must never become part of the product stack. `resume-handoff` consumes and
commits the deletion here, pushes the consumed state if needed, then switches to updated `main`.
Layer 1 starts from `origin/main`, not from either handoff commit.

## Unverified assumptions

* The second issue 686 URL in the user's original list was an accidental duplicate. If it was
  deliberate, pause before layer 4 and ask whether to split it into a non-closing counter-plumbing
  PR (`Refs #686`) and a post-689 measured-cap PR (`Fixes #686`).
* The real iPad rig is currently attached and usable. Verify every requirement in
  `ipad-device-profiling.md` before claiming the first issue.
* The existing GitHub connector authorization can perform every issue/PR/review write needed by the
  worker contract.
* Reusable command approvals granted in this session will be visible in the resumed session's
  permission profile.
* Issue 691 can use the full-run output created by issue 689 without issue 688 landing first. Its
  issue body names 687 and 689 as its actual dependencies; confirm against current GitHub state.
* No other session will mutate this checkout or any stack branch while the coordinator runs.

## Done & verified

* Read `create-handoff`, `resume-handoff`, and the handoff directory conventions in full.
* Read the Codex long-running-work/permission guidance through the current OpenAI manual.
* Inspected all ten unique issues; all were open on 2026-08-01.
* Verified PR 682 is merged into `main`.
* Verified local `gh` 2.96.0.
* Installed the official `github/gh-stack` extension successfully.
* Ran `gh stack link --help`; the command supports appending existing PRs without local stack
  tracking.
* Staged an explicit path, created the handoff commit, and pushed its tracked branch to `origin`.
* Ran `npm run info` before naming repository scripts.
* Read the profiling skill and its physical-iPad runbook.
* No issue was claimed, no product file was edited, and no PR was opened.

## Risks & next 3 steps

1. Resume this exact packet, verify every **Unverified assumptions** item, consume the packet, and
   create the persistent coordinator goal. Keep the coordinator branch isolated from the stack.
2. Complete the parent-level permission and hardware preflight. Do not spawn a worker or claim an
   issue until every required capability is confirmed; stop if the iPad rig or machine-level
   authority is missing.
3. Fast-forward `main`, spawn the fresh layer-1 worker for issue 684, and follow the worker contract
   through draft PR, adversarial review, green CI, and coordinator verification before layer 2.

## Reread first

* [Root agent instructions](../../AGENTS.md)
* [Handoff conventions](AGENTS.md)
* [Resume handoff skill](../../.agents/skills/resume-handoff/SKILL.md)
* [Burn-down backlog lifecycle](../../.agents/skills/burn-down-backlog/SKILL.md)
* [Leave PR review](../../.agents/skills/leave-pr-review/SKILL.md)
* [Address PR review](../../.agents/skills/address-pr-review/SKILL.md)
* [Testing guide](../../.agents/skills/testing/SKILL.md)
* [Profiling guide](../../.agents/skills/profiling/SKILL.md)
* [Physical-iPad profiling runbook](../../.agents/skills/profiling/ipad-device-profiling.md)
* [PR screenshot conventions](../../.agents/skills/pr-screenshots/SKILL.md)
* [ADR index](../../.agents/skills/adrs/SKILL.md)
* [GitHub stacked PR CLI reference](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands)
* [GitHub stacked PR management](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests)
* [Codex long-running work](https://learn.chatgpt.com/docs/long-running-work)
