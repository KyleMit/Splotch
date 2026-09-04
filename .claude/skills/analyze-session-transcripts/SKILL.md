---
name: analyze-session-transcripts
description: Mine local Claude Code session transcripts (~/.claude/projects/ JSONL) into factual, evidence-anchored per-session reports — wrong first moves, self-corrections, failures, one-off scripts, empirical discoveries. Use when the user asks to analyze, debrief, or report on past sessions. Claude transcripts only; Codex sessions have a different shape and are out of scope.
disable-model-invocation: true
---

# Analyze session transcripts

Produce factual reports of what happened in past Claude Code sessions by mining their transcript
files. The report spec lives in `report-prompt.md` beside this file; the extraction method below
exists so a 8 MB transcript never lands raw in a context window.

This is a registered direct Claude-only package (`tools/ruler/lib/direct-provider-skills.mjs`) —
Codex session logs have an entirely different shape, so a Codex analyzer would share nothing with
this one. Edit this package in place, never through `.ruler/`.

## Where transcripts live

* `~/.claude/projects/<munged-cwd>/<session-id>.jsonl` — one file per session, `<munged-cwd>` is the
  absolute working directory with `/` replaced by `-` (this repo: `-Users-kylemit-Code-Splotch`).
  Worktrees and other checkouts get their own directories.
* Cloud (claude.ai/code) sessions have no local transcript until teleported (`claude --teleport
  <id>` — note it *moves* the session local rather than copying it, and archived sessions must be
  unarchived first).
* Skip stub files: a transcript of a few KB holding only a `/clear` or `/resume` command has nothing
  to report on.

## Method — skeleton first, drill second

Never read a transcript JSONL wholesale: tool results are ~97% of the bytes and the conversation is
a rounding error (measured on this repo's sessions: an 8.2 MB transcript carries 27 KB of assistant
text).

1. **Skeleton:** `node .claude/skills/analyze-session-transcripts/skeleton.mjs <transcript.jsonl>`
   emits YAML front matter (session id, title, model, CLI version, entrypoint, branch, timestamps,
   counts) plus a turn-by-turn skeleton: full assistant text, truncated user text, tool calls with
   command previews, tool results truncated hard — errored ones (`✗`) kept deep since they are the
   failed-command evidence. Redirect it to a scratch file. Even the largest sessions skeleton to
   ~50k tokens.
2. **Read the skeleton end to end** for the semantic report categories (wrong first moves,
   self-corrections, discoveries). Every skeleton line carries `L<n>`, the record's 1-based line in
   the source JSONL.
3. **Drill** only where the skeleton flags something: `sed -n '<n>p' <transcript> | jq .` retrieves
   the full record (complete tool output, full script text) for quoting as evidence.

## Writing the report

Hand `report-prompt.md` verbatim to whoever writes the report; copy the skeleton's YAML front matter
as the report's front matter. The non-negotiables are in the spec: evidence anchors on every claim,
explicit "none found" for empty categories, no advice or analysis.

## Batch runs (10+ sessions)

One fresh subagent per session, launched in parallel. Each gets: the transcript path, the skill's
directory (for `skeleton.mjs` + `report-prompt.md`), and an output path — it writes the report file
and returns a one-line status. The orchestrator never opens a transcript or a skeleton, so its
context stays flat at any session count. Confirm the output directory with the user before a batch;
`docs/scratchpad/session-reports/` if the reports should be committed, the session scratchpad if
not. Name reports `<start-date>-<first-8-of-session-id>-<slug>.md`.

## Schema notes — probe, don't trust

The transcript format is internal to Claude Code and drifts across CLI versions (this skill was
built against 2.1.220; the front matter records each transcript's version). Useful envelope fields:
`type` (`user`/`assistant`/`summary`/`system`/`ai-title`/…), `timestamp`, `uuid`/`parentUuid`,
`sessionId`, `isSidechain`, `isMeta`, `version`, `gitBranch`, `cwd`, `entrypoint`, `prNumber`/
`prUrl`, `aiTitle`, and `message.content` blocks (`text` | `tool_use` | `tool_result` with
`is_error`). `summary` records mark in-session compaction. If skeleton output looks wrong for a
transcript, inspect its first records with `jq` and adapt — update `skeleton.mjs` and these notes in
the same change.
