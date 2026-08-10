# Codex session report spec

Use this spec verbatim for the agent writing one report.

---

Produce a factual report of what happened in this Codex session. Do not give advice,
recommendations, retrospective judgment, or speculation. State a cause only when the transcript
establishes it. Do not expose or infer hidden reasoning; reasoning records are deliberately absent
from the skeleton and are not evidence.

Copy the skeleton's YAML front matter into the report. Preserve at least: session id, title and its
truncation flag, agent, interface, source, originator, model, reasoning effort, CLI version, git
branch/commit, working directory, archived status, start/end timestamps, transcript path/bytes,
compaction count, parse failures, and skipped record types.

Every substantive claim must cite raw evidence as `L<record-line> <timestamp>` and include the tool
call id when one exists. Drill into the raw JSONL before writing a claim whenever the skeleton is
truncated or marks `?FAILURE`:

```bash
sed -n '<record-line>p' '<transcript-path>' | jq .
```

Treat `?FAILURE` only as a search lead. Codex tool wrappers can report success while a nested
command failed, and outputs can contain words such as "error" while merely displaying source or
logs. Classify a failure from the actual command/result and the surrounding conversation.
Deduplicate event summaries that describe the same tool call. Separate consequential failures from
benign or expected probes; report benign failures as a count with representative anchors.

Write these sections:

* Every wrong first move: an initial action or approach later abandoned, reversed, or materially
  reworked, plus the transcript evidence that triggered the correction.
* Every mistake the agent caught itself, separately from mistakes caught by the user, CI, a tool, or
  a reviewer.
* Everything that went wrong, with only the cause evidenced in the session.
* Every consequential failed command or tool call: intent, exact failure, importance in the session,
  and what happened next.
* Everything learned or discovered through iteration: non-obvious codebase, tool, environment, or
  workflow facts established empirically during the session.
* Every one-off script generated, including inline `node -e`, shell heredocs, temporary scripts, and
  nontrivial JavaScript passed directly to Codex's `exec` wrapper. Routine single-tool wrappers and
  ordinary shell commands are commands, not one-off scripts. Recover complete script source from the
  raw tool-call record and reproduce it verbatim in a fenced code block, with the invoking
  command/tool and one factual sentence describing its purpose. If the complete script is not
  present, say so instead of reconstructing it.
* Every Playwright measurement or screenshot-fidelity incident. Specifically check for harness or
  Playwright overhead polluting/mis-attributing performance timings, screenshots captured during an
  animation rather than at the landed state, and any other Playwright failure mode actually present.
  For each, report symptom, evidence, and the workaround used in-session.

For a category with no evidenced instances, write `none found`. That means no instance was found in
the inspected record, not that none existed outside it. If `parse_failures` is nonzero, a transcript
file is missing, or the session ends mid-operation, add a `Coverage limitations` section stating the
exact gap. Compaction alone is not a coverage loss: the raw pre-compaction JSONL records remain and
must still be inspected.

Never reproduce credentials, tokens, cookies, private keys, or secret values. Replace only the
secret value with `[REDACTED: secret]` and note that the report performed a redaction.
