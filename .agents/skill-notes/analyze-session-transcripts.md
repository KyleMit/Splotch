# analyze-session-transcripts — Codex design history

Direct Codex package; this note is edited in place and has no `.ruler/` source. The Claude package
with the same skill name is independently maintained.

## Why the implementations are independent

Claude Code stores project-keyed transcripts with `user`/`assistant` envelopes and content blocks
such as `tool_use` and `tool_result`. Codex uses a SQLite thread index plus active and archived
rollout JSONL with `session_meta`, `turn_context`, `response_item`, `event_msg`, and `compacted`
records. Codex tool calls can be `custom_tool_call` wrappers or `function_call` pairs, and a nested
command failure may sit inside a successful outer `exec` result. Sharing a parser would make schema
branches the core design rather than an exception.

## Decisions and evidence

* **Database catalog plus rollout parser.** The database is the only reliable source for user-facing
  title, archive state, and cross-surface recency. The rollout supplies the lossless event record
  and identifies CLI (`codex-tui`) versus Desktop (`Codex Desktop`). Metadata lookup keys by exact
  rollout path before envelope id because measured historical subagent rollouts carry the parent
  session's id in `session_meta` while the database row and filename carry the child id. An id
  fallback records its provenance, canonicalizes symlink aliases, and withholds database identity
  when it resolves to a genuinely different rollout. That mismatch takes its session identity from
  the rollout filename and records the identity source rather than repeating the known parent id.
* **User surface sources by default.** Local databases also contain exec, guardian, and subagent
  threads whose titles can be entire delegated prompts. The catalog defaults to `cli` and `vscode`
  and checks older CLI rollouts for an initial `Message Type: NEW_TASK` marker, so a request for
  Desktop/local sessions means human-visible threads across schema generations; automated records
  require an explicit flag. Titles are bounded with an explicit truncation flag because historical
  delegated prompts can occupy thousands of lines in the database title column.
* **Skeleton then drill.** Large rollouts are dominated by repeated instructions, schemas, and tool
  output. Streaming keeps the extractor's memory bounded, while raw `L<n>` anchors preserve access
  to complete commands, results, and scripts without loading them all into model context.
* **Never resume for the report.** A large thread may compact on resume. The rollout keeps raw
  pre-compaction records, so reporting from disk avoids asking a lossy continuation context to
  remember its own chronology.
* **Suspected, not asserted, failures.** Codex's nested wrappers and arbitrary output make a generic
  exit-status parser incomplete. Deterministic patterns identify drill targets; the reporting agent
  classifies them from the paired raw call/result and surrounding conversation.
* **Reasoning omitted.** The report is about observable session behavior. Hidden reasoning is not
  needed, must not be exposed, and cannot be used as evidence.

## Open questions

* `state_5.sqlite` and rollout record types are internal and may drift. Parse failures, skipped type
  counts, and fixture tests are the early warning rather than a promise of stable upstream schema.
* Cloud-only sessions are absent until Codex writes a local rollout and database row; this package
  has not established a remote retrieval path.
* Failure heuristics intentionally over-select only failure-shaped fields and phrases. Generic
  `status` values are not signals because successful HTTP statuses otherwise produce routine false
  positives. Future measured false negatives should add narrow patterns; remaining false positives
  are resolved by mandatory raw drilling rather than aggressive parsing.
