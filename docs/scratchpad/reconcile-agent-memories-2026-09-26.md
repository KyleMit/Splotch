# Agent memory reconciliation, 2026-09-26

Issue #2328 phase 1 was run against the Claude Code project memory directory for Splotch. It held 44
entries plus `MEMORY.md`; the index initially named all 44 exactly once. A local backup was made
before editing. The directory now holds 30 entries, each indexed exactly once.

## Retired entries

| Memory                                         | Reason                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `appium-device-discovery-stale-use-direct-wda` | The current preflight and recovery route is maintained in `docs/PROFILING-CAMPAIGNS.md`; the memory still told readers to launch WDA manually.                                 |
| `audit-burndown-relaunch-command`              | PR #540 merged in July; its launch command, branch, outage, and outstanding rescue work were a run snapshot.                                                                   |
| `campaign-skills-cutover-2026-09-18`           | PR #2073 merged and issues #2077 and #2078 closed; its "next task" no longer exists.                                                                                           |
| `capture-rig-actions-blocked-by-classifier`    | The permission state changed and the current capture route is in the capture docs and skills.                                                                                  |
| `codex-issue-stack-policy-blocks-merges`       | PR #2026 removed the old ban; `issue-stack:install` no longer exists.                                                                                                          |
| `epic-1926-orchestration-plan`                 | Epic #1926 closed; its detailed batch queue was complete and could only misdirect a new run.                                                                                   |
| `epic-2020-orchestration-plan`                 | Epic #2020 and its children closed; the file still opened with "all open" despite a later completion paragraph.                                                                |
| `epic-2210-campaign-2-state`                   | It was a dated campaign snapshot. Issue #2238 has since closed while other work remains open; the live epic and ledger are the right inputs.                                   |
| `in-progress-label-outlives-fixes-close`       | The current `ship-issue` skill already requires explicit post-merge label cleanup.                                                                                             |
| `orchestrate-epics-pattern`                    | The maintained `orchestrate-sessions` skill owns this procedure and its plan location.                                                                                         |
| `palette-trim-snapshots-flaky-locally`         | The recent flake burndown changed tests, and its `web/tests/parent-zoom.spec.ts` reference no longer exists. Recheck flakes under equal load instead of trusting a dated list. |
| `rival-agent-pairing-pr-1575-state`            | PR #1575 merged; the "only Kyle can install" and "ship-issue parked" statements expired.                                                                                       |
| `rival-agent-pairing-vocabulary`               | The vocabulary is in the live rival skill and notes; its instructions still named retired campaign skills.                                                                     |
| `rival-agent-simplification-pilot-pr-1579`     | PRs #1579, #1581, and #1587 merged, so the "all open and unmerged" premise expired.                                                                                            |

## Updated entries

| Memory                                        | Change                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `adrs-product-only-tooling-in-skill-notes`    | Replaced `update-adrs` with `reconcile-adrs` and removed a link to the retired pilot snapshot.                                              |
| `chained-device-commands-continue-after-kill` | Pointed to the maintained capture guide instead of a retired permission snapshot.                                                           |
| `gemini-key-and-classifier-permissions`       | Distinguished the canonical checkout's local rules from the home-level auto-mode setting. The working tree's local settings file is absent. |
| `gh-needs-repo-flag-outside-checkout`         | Removed a link to the retired audit run snapshot.                                                                                           |
| `gh-pr-checks-watch-exits-early-after-push`   | Replaced a fixed CI job count with the applicable workflow's expected job set.                                                              |
| `linux-snapshot-baselines-from-ci-artifact`   | Removed a link to the retired flake list.                                                                                                   |
| `negated-closing-keyword-still-closes`        | Removed a link to the redundant label-cleanup memory.                                                                                       |
| `perf-recapture-is-not-the-goal`              | Directed future planning to the live epic instead of a dated campaign snapshot.                                                             |
| `read-the-clock-for-budgeted-units`           | Removed a link to the retired orchestration pattern.                                                                                        |
| `rival-reviewed-prs-are-merge-authorized`     | Scoped the remembered merge permission to autonomous runs and the invoked shipping gate.                                                    |
| `tools-tests-flake-under-perf-build`          | Kept the equal-load lesson without linking a stale list of particular flaky tests.                                                          |
| `worktree-needs-own-pnpm-install`             | Removed a dead `[[dead-pre-push-hook-after-guard-removal]]` link and the obsolete hook-path warning.                                        |

`MEMORY.md` was rebuilt by removing the 14 retired lines and updating the affected summaries.

## Mechanical checks and judgment

Mechanical checks found the broken wiki link, the retired npm script, the missing test path, and the
old skill names. The checker built in phase 2 covers index membership, frontmatter names, wiki
links, npm scripts, and advisory repo paths, possible skills, and flags. The post-edit run reports
zero errors. Paths to local ignored files and tool flags are advisory: `web/.env` and the canonical
checkout's local settings can exist outside Git, while a flag belongs to its command, not to the
repo's script list. `fix-then-recapture` and `release-gate` are prose compounds, not skills.

Judgment was needed to distinguish a durable lesson from a run snapshot, to verify PR and epic
states on GitHub, and to avoid preserving an old permission or merge claim as current authority. The
completed epic details and rival experiments remain in their GitHub discussions, scratchpad records,
and skill notes. The live #2210 epic remains open, so later runs must re-read it.

The checker cannot gate CI because the memory directory is outside the repository and absent on
other machines. This host has no comparable Codex project memory directory under `~/.codex`; its
persisted threads and goals are different from Claude Code's indexed memory files. The skill should
therefore be a Claude-only direct provider package for the observed store. Add a Codex package only
after a concrete Codex memory format and location can be tested.
