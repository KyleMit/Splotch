---
name: workflow-audit
description: Review the Claude Code configuration and session history, benchmark against current best practice, and recommend and apply updates for an integrated, token-efficient setup. Use when asked to audit or improve the Claude Code workflow, config, permissions, or token efficiency, or to reduce repetitive permission prompts.
---

# Workflow Audit

Review my Claude Code configuration and session history, benchmark it against current best practice,
and recommend (and apply) updates so my setup is an integrated, token-efficient development system
tuned to how I actually work.

The two standing priorities are **token efficiency** and **reducing repetitive permission prompts**
— weigh recommendations against those unless I say otherwise.

## What to look at

1. **User config** — `~/.claude/settings.json` (model, hooks, theme, env).
2. **Project config** — `.ruler/**`, generated `AGENTS.md`/`CLAUDE.md` files,
   `.claude/settings.json`, `.claude/settings.local.json`, generated `.claude/skills/*`, generated
   `.agents/skills/*`, and Claude hooks/cloud files.
3. **Session history** — the JSONL transcripts under
   `~/.claude/projects/-Users-kylemit-Code-Splotch/`. Aggregate across sessions; do not read them
   one line at a time in the main context. Pull out:
   * **Tool usage counts** (Bash, Read, Edit, Write, Skill, ToolSearch, AskUserQuestion, …).
   * **Bash command breakdown by first word** — flag read-only shell
     (`grep`/`ls`/`cat`/`find`/`head`/`tail`/`wc`) that the dedicated Grep/Glob/Read tools should be
     doing instead. This is usually the biggest token leak.
   * **Permission friction** — how often I re-approve similar commands, and how many committed/local
     allowlist entries are dead one-offs (specific tokens, PIDs, absolute paths) that will never
     match again.
   * **Context bloat** — sessions that grew very large (>1 MB) and the workflows that produced them.
   * **Dominant workflows** — which slash commands / loops I actually lean on.
4. **Benchmark** — do a web search for current (this year) Claude Code best practices: Ruler-style
   source files, generated agent files, skills, hooks, subagents, MCP, model tiering, `/clear` vs
   `/compact`. Compare my setup against the modern stack and identify the real gaps (not generic
   advice).

Prefer Grep/Glob/Read and a read-only exploration subagent for the file/transcript sweeps so this
audit doesn't itself burn the main context.

## Ask before finalizing

Use `AskUserQuestion` to confirm alignment before writing the report or changing config. Good things
to confirm:

* Which priorities rank highest right now (tokens, permissions, autonomy, review quality).
* Which manual gates are intentional and must be preserved (e.g. `git commit`/`git push` should keep
  prompting).
* Appetite for new machinery (subagents, hooks, MCP) vs. keeping it lean.

## Applying changes

Apply the changes I approve directly, and keep them reversible via git:

* Broad allowlist of read-only tool families and trusted commands in the **committed**
  `.claude/settings.json`.
* Machine-specific entries (absolute paths, SDK locations, `/tmp`, `~/.claude`) in
  `.claude/settings.local.json` only.
* Deliberately keep prompting for anything mutating outside the repo, `rm`, non-localhost network
  calls, and `git commit`/`git push`.
* Encode behavioral changes (prefer structured tools over shell, delegate fan-out search to a cheap
  read-only subagent, `/clear` between unrelated tasks) in `.ruler`, not just the report.

Note every file you touched so `git diff .ruler .claude .agents AGENTS.md CLAUDE.md` tells the whole
story.

## Output format

Write the report to `docs/claude-workflow-review-YYYY-MM-DD.md` (markdown, dated with today's date —
do **not** overwrite a prior review; each run is a snapshot to compare against the last).

Structure it as:

```markdown
# Claude Code Workflow Review — Splotch

**Date:** YYYY-MM-DD **Goal:** one line **Priorities (confirmed):** …

## TL;DR

3–5 punchy findings.

## What I looked at

Config files, session count/size, benchmark sources.

## Findings from your session history

Tool-usage table + Bash breakdown table + other signals.

## What you're doing right (don't change)

## Benchmark vs. best-in-class

Layer-by-layer table: Ruler source · generated agent files · skills · hooks · subagents · MCP.

## Recommendations (prioritized)

Tier 1 token efficiency / Tier 2 permission friction / Tier 3 optional.

## What I changed this session

Concrete file list, reversible via git.

## Sources

Links from the web search.
```

End by printing a short summary of what changed and what's left as optional follow-up.

## Shared audit conventions

This is an audit skill. Its findings go in the dated `docs/claude-workflow-review-YYYY-MM-DD.md`
report rather than `docs/AUDIT.md`, but the run-tracking conventions in
[`.ruler/skills/audit-conventions/SKILL.md`](../../audit-conventions.md) still apply:

* **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md` linking the dated report and summarizing
  the headline findings in one line.
* **Self-heal** (§3) — if the review surfaced a durable method learning (a transcript metric worth
  pulling, a benchmark source, an analysis trap), fold it into this file.
