---
name: reconcile-agent-memories
description: Reconcile a Claude Code project's persistent MEMORY.md index and memory files with the current repository and GitHub state. Use for a periodic memory cleanup or after skill, file, script, or workflow renames; this is not a transcript analysis or a repository documentation pass.
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
observation as history only when it still teaches a distinct lesson. Delete run snapshots whose
premise is finished or whose lesson now lives in a maintained skill or doc. Merge duplicates only
after checking neither contains unique evidence. Update the index alongside every edit and do not
put secrets, credentials, or private device identifiers into a committed log.

Memory is outside CI and can be changed by another session. Back up the directory before a large
pass, edit only the selected project memory directory, then rerun the check and compare the index
with its files. Record each correction or deletion with its reason in the task's existing issue, PR,
or scratchpad. Separate mechanical drift from judgments and say which live sources resolved the
dated claims. A clean check proves link and script consistency; it does not prove the memories are
true.
