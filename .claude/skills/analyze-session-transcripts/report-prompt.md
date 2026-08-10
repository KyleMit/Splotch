# Session report spec

Hand this spec verbatim to the agent writing a report; it is written to be self-contained.

---

Produce a factual report of what happened in this session — no advice, no recommendations, no
speculation. Causes only as evidenced in the session itself. Every claim must cite its evidence: a
timestamp or short quoted snippet from the transcript. If a category has no instances, write "none
found" — do not stretch.

Start with YAML front matter copied from the skeleton header: session id, title, agent
(claude/codex), interface (`entrypoint`), model, CLI version, git branch, start/end timestamps, and
linked PR if any.

Then report:

* Every wrong first move — an initial approach that had to be abandoned or reworked — and what
  triggered the correction.
* Every mistake the agent caught itself, and every mistake caught by the user, CI, or a reviewer
  instead.
* Everything that went wrong, with the cause as evidenced in-session.
* Every consequential failed command: what it was trying to do, the error, and how it was resolved.
  Benign/expected failures (no-match greps, probes) as a count only.
* Everything the agent learned or discovered through iteration — non-obvious facts about the
  codebase, tools, or environment established empirically.
* Every one-off script generated (including inline `node -e`/heredoc snippets): verbatim in fenced
  code blocks, with the invoking command and a one-line statement of purpose.
* Every Playwright-related measurement or screenshot-fidelity incident: known failure modes include
  harness overhead polluting or mis-attributing performance timings, and screenshots captured
  mid-animation rather than at the landed screen. For each: the symptom, the evidence, and the
  workaround used in the session.
