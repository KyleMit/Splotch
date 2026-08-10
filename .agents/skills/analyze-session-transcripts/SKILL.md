---
name: analyze-session-transcripts
description: Mine local Codex CLI and Desktop rollout transcripts, including archived sessions, into factual evidence-anchored reports. Use only when the user explicitly asks to analyze, debrief, or report on past Codex sessions; Claude Code transcripts use an independent provider package.
---

# Analyze Codex session transcripts

Produce factual reports from Codex's lossless local rollout JSONL without resuming the original
thread. Resuming can load compacted context; the rollout retains the raw records needed for a
forensic report.

This is the registered direct Codex implementation of `analyze-session-transcripts`. Its Claude
counterpart has the same skill name but an independent package and parser because the stores and
record envelopes do not match. Edit this package in place, never through `.ruler/`.

## Storage and session selection

Codex's local thread database is `~/.codex/state_5.sqlite`. It indexes both surfaces:

* CLI: database `source=cli`; rollout `originator=codex-tui`.
* Desktop: database `source=vscode`; rollout `originator=Codex Desktop`.

Active rollouts live under `~/.codex/sessions/YYYY/MM/DD/`; archived Desktop or CLI rollouts live
under `~/.codex/archived_sessions/`. Do not infer recency from filenames or directory mtimes. Query
the database's recency field, which covers both locations:

```bash
node .agents/skills/analyze-session-transcripts/catalog.mjs --limit 10 --cwd "$PWD" --json
```

The default excludes automated exec, guardian, and subagent threads by accepting only `cli` and
`vscode` sources and checking older CLI rollouts for their initial delegated-task marker. Use
`--all-cwds` only when the user asked across projects, and `--include-automated` only when they
explicitly want non-human threads. Confirm the chosen sessions and output directory before a batch
that will spend model tokens.

## Skeleton first, raw drill second

Never load a rollout wholesale. Codex rollouts contain repeated instructions, tool schemas, large
tool outputs, and compaction replacement histories. Generate a compact semantic skeleton:

```bash
node .agents/skills/analyze-session-transcripts/skeleton.mjs '<rollout.jsonl>' > '<scratch-skeleton.md>'
```

The extractor streams JSONL, omits developer/system instructions and hidden reasoning, removes the
synthetic AGENTS/environment user envelope, preserves actual user/assistant messages, previews every
tool call/result, flags suspected failures for inspection, marks compaction, and emits `L<n>` raw
record anchors. It looks up title/archive/surface/model metadata from the thread database. The
database lookup uses the exact rollout path before `session_meta.session_id`; historical subagent
rollouts can retain their parent's id in that envelope.

Read the skeleton end to end. Then drill only into relevant raw records:

```bash
sed -n '<n>p' '<rollout.jsonl>' | jq .
```

Always drill for `?FAILURE`, truncated evidence, and one-off scripts. A `custom_tool_call` named
`exec` contains JavaScript orchestration in `payload.input`; its paired
`custom_tool_call_output.payload.output` can contain a nested command failure even when the outer
wrapper says `Script completed`. `function_call`/`function_call_output` use a different envelope but
the same `call_id` pairing. Treat raw pre-compaction records as authoritative; do not substitute the
`replacement_history` summary.

## Write the report

Give `report-prompt.md` verbatim to the reporting agent. Copy the skeleton front matter. Evidence
anchors, `none found` for empty categories, failure deduplication, exact-script recovery, secret
redaction, and the ban on advice/speculation are mandatory.

Name each report `<start-date>-<first-8-of-session-id>-<slug>.md`. Reports meant to remain local go
in a user-approved directory outside tracked docs; reports intended as repository evidence go in a
user-approved `docs/scratchpad/session-reports/` directory.

## Batch runs

Use one fresh subagent per session in bounded parallel batches up to the available agent slots. Give
each subagent only: this skill directory, one transcript path, one scratch path, one report path,
and the instruction to run the skeleton, read it completely, drill raw evidence, apply
`report-prompt.md`, write the report, and return a one-line status. The orchestrator reads only the
catalog and final statuses, so its context stays nearly flat across 10–50 sessions. Do not ask the
original sessions to report on themselves.

If subagents are unavailable, process sessions sequentially with a fresh context where the runner
supports it. Never combine multiple raw transcripts in one reporting context.

## Schema drift

Codex's database and rollout schemas are internal. The extractor records parse failures and skipped
record types as drift signals. If expected messages or tools are missing, inspect a few raw records,
update only this Codex package and its tests/note, and leave the Claude implementation unchanged.
