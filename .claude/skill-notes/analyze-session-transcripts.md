# analyze-session-transcripts — design history

Direct Claude-only package; this note is edited in place and has no `.ruler/` source.

## Why a direct Claude-only package

Codex session logs (`~/.codex/`) share no format with Claude Code transcripts — different store,
different record shape. A shared or forked skill would either paper over that or force a Codex
implementation nobody has designed. If a Codex analyzer is ever built, it gets its own independent
package registered in `tools/ruler/lib/direct-provider-skills.mjs`, not a copy of this one.

## Why user-invocation only

`disable-model-invocation: true` because a batch run spawns a subagent per session and real token
spend; "session" is too common a word in ordinary conversation to let the model reach for this on
its own initiative.

## Decisions and what earned them

* **Skeleton-then-drill over resuming sessions.** The first design was `claude -p --resume <id>
  --fork-session` — let the session report on itself. A demo worked on a 53 KB session, but large
  sessions auto-compact at load (and compacted mid-session originally), so the report would be
  written from a lossy summary while the lossless record sits on disk. Measurement killed the
  approach: an 8.2 MB transcript holds only 27 KB of assistant text — tool results are ~97% of the
  bytes — so a deterministic extractor gets the whole conversation into ~50k tokens with line-number
  pointers back into the raw record.
* **Evidence anchors + explicit "none found"** are in the report spec because a reporter required to
  fill seven categories will otherwise pad, and reports feed later cross-session synthesis that must
  be able to verify claims.
* **Benign-failure split.** Raw error greps look scary but hard-errored tool results measured in the
  single digits per session; the noise is expected non-zero exits (no-match greps, probes). The spec
  reports consequential failures in full and benign ones as a count.
* **Fixed YAML front matter** on every report so 10–50 reports are machine-aggregatable. All
  metadata (model, CLI version, `entrypoint`, branch, PR linkage) proved extractable from record
  envelopes — nothing needs guessing.

## Open questions

* Schema drift: built against CLI 2.1.220 records. The skeleton records `parse_failures` and
  `skipped_record_types` as the early-warning signal.
* Cloud sessions: teleport *moves* a session local (not a copy) and refuses archived ones until
  unarchived; the side effects on the web-side session were not yet verified empirically when this
  was written.
* Where batch reports should live long-term (committed in `docs/scratchpad/session-reports/` vs
  ephemeral) is decided per run, not by the skill.
