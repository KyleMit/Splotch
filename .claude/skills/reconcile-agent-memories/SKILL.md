---
name: reconcile-agent-memories
description: Reconcile a Claude Code project's persistent MEMORY.md index and memory files with the current repository and GitHub state, promoting durable lessons into shared repo guidance. Use for a periodic memory cleanup or after skill, file, script, or workflow renames; this is not a transcript analysis.
---

# Reconcile agent memories

Claude Code project memories live outside the repo under
`~/.claude/projects/<project-slug>/memory/`. Find the directory for this project by inspecting
candidate `MEMORY.md` indexes; a scratch session may have its own separate memory directory. Work on
the intended project's index and every sibling memory file. Never infer current authority from a
memory you are auditing.

## Check the mechanical references

From the repo root, run:

```bash
npm run check:agent-memories -- --memory-dir=<absolute-memory-directory>
```

The read-only check fails on missing or duplicate index entries, missing frontmatter names, broken
`[[wiki links]]`, and nonexistent `npm run` targets. It prints differing display names, entries it
could not scan, repo paths, possible skill names, and flags for review. Treat these as leads, not
automatic edits: ignored local files, output paths, historical counterexamples, prose compounds, and
flags owned by external commands are common false positives. Check real skill names against
`.claude/skills/`, paths against the current tree, and flags against the command's source or help
without executing a command that changes state. A renamed concept may appear in plain prose without
any syntax the checker catches; search for names removed since the last pass.

## Reconcile meaning

Read every memory and its index line. For each `project` memory, verify present-tense PR, issue,
epic, branch, CI, device, and permission claims against live sources before retaining its advice.
Use GitHub's issue and PR metadata and full comments for GitHub state; for an epic, enumerate the
actual sub-issues. Follow live docs and config for procedures and permissions. Preserve a dated
observation as history only when it still teaches a distinct lesson. Merge duplicates only after
checking neither contains unique evidence. Do not put secrets, credentials, or private device
identifiers into a committed log.

## Promote durable lessons before retiring memory

Memory collection during ordinary work is useful. Reconciliation is when a durable lesson gets a
reviewable home. For **every** memory, decide whether its advice is already in a maintained repo
source, is a new durable lesson, or describes transient/local state. Do not treat a clean mechanical
check or a committed list of filenames as proof that the lessons themselves were preserved.

For a new durable lesson, verify it against current code and sources, then put the smallest useful
rule in the source future agents will actually read: `.ruler/` for shared instructions and skills,
`docs/` for human-readable runbooks, or the owning code and its tests for an invariant. Edit a
registered direct-provider package only when the lesson truly belongs to one runner. Apply Ruler
when its sources changed and verify the resulting Claude and Codex copies. Link the exact repo
source in the reconciliation record. Prefer one authoritative rule with pointers from other places
over repeated prose.

Retire a memory only after its durable lesson is committed and its destination verified, when the
same guidance is already maintained elsewhere, or when its premise expired. Keep genuinely useful
local-only context in memory if live configuration cannot replace it; verify it on each pass and
never copy credentials or private device details into Git. Update `MEMORY.md` alongside every edit.

Memory is outside CI and can be changed by another session. Back up the directory before a large
pass, edit only the selected project memory directory, then rerun the check and compare the index
with its files. In the task's PR and scratchpad, show the concrete documentation fixes separately
from the checker implementation, map each retired memory to its canonical source or expiration
reason, and name local-only exceptions. Separate mechanical drift from judgments and say which live
sources resolved dated claims. A clean check proves link and script consistency; it does not prove
the memories are true.

## Findings promoted in the 2026-09-26 Splotch pass

This is a digest for finding the maintained rules, not a second authority for their exact wording.
The [reconciliation record](../../../docs/scratchpad/reconcile-agent-memories-2026-09-26.md) maps
each retired memory to its destination or expiration reason.

* **GitHub work:** Open a draft PR early for long work, commit reviewable steps, use `gh -R` outside
  the checkout, verify copied SHAs, and avoid negated closing keywords. Read issue comments before
  implementation and judge review and CI state against the live PR. See
  [GitHub rules](../../../.ruler/github.md), [ship-issue](../ship-issue/SKILL.md), and
  [drive-pr-to-mergeable](../drive-pr-to-mergeable/SKILL.md).
* **Checks and tests:** Use process exit codes, format before linting, run the applicable checks and
  full test tier before pushing, and inspect unexpectedly slow commands. Recover Linux visual
  baselines from CI artifacts; check dead exports after deletions, the CSP hash after boot-script
  edits, and repo-script references after spec changes. Keep tool tests away from performance
  captures. See [commands](../../../.ruler/commands.md) and [testing](../../../docs/TESTING.md).
* **Worktrees and evidence:** Give each worktree its own install and server port. Capture before and
  after UI shots from one installed worktree, verify the current branch in a PR stack, and check
  ignored log paths before committing evidence. See [worktrees](../../../docs/WORKTREES.md),
  [PR screenshots](../pr-screenshots/SKILL.md), [stacked PRs](../create-stacked-prs/SKILL.md), and
  [conventions](../../../.ruler/conventions.md).
* **Decisions and presentation:** Put agent-tooling decisions in skill notes or tool notes; show
  Splotch UI options visually before asking for a choice; write public copy plainly and with the
  app's real UI terms. See [create-adr](../create-adr/SKILL.md),
  [walk-through-decision](../walk-through-decision/SKILL.md), and [design](../design/SKILL.md).
* **Capture and secrets:** Verify an Android build's installed identity after an interrupted
  install, fix measured product bottlenecks before recapturing, and pass only the API key a
  generator needs. See [Android profiling](../../../docs/PROFILING-ANDROID.md),
  [performance campaigns](../../../docs/PROFILING-CAMPAIGNS.md), and
  [asset-generator instructions](../../../tools/asset-gen/.ruler/AGENTS.md).
* **Local authority:** Host permissions and device access can change. Read live settings and capture
  instructions instead of committing a permission snapshot; never promote credentials or private
  device identifiers. See [iPad profiling](../../../docs/PROFILING-IPAD.md) and the
  [reconciliation record](../../../docs/scratchpad/reconcile-agent-memories-2026-09-26.md).
