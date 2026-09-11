# tools/rival-agent — the vendor-neutral core of `run-rival-agent`

Everything the two `run-rival-agent` skill packages share. A **native handler** (the agent already
running in the current runner, Claude Code or Codex) launches a **rival agent** (the other vendor's
CLI) inside a disposable worktree pinned to one commit id, confined by the rival's own vendor's
sandbox rooted at that worktree with the network off. The rival runs its own tests, checks, and
repros there; the broker is its door out for what the sandbox refuses: it asks, the handler runs the
command under its own permission rules or declines, and the answer flows back. The rival returns
findings against one schema and the handler posts them after a sensitive-value check. `NOTES.md`
holds the design history: why this shape, what was rejected, the accepted exposures, and the Claude
versus Codex parity table.

The runtime files in this folder import nothing from outside it. The Codex-side installer copies
those files into `~/.local/libexec` as hashed trusted bytes, where the rest of the checkout does not
exist. The checkout-only live acceptance generator and its templates are not installed.

## Entry points

| File                       | Role                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `broker-server.mjs`        | The stdio MCP server the rival sees. One tool, `run(command, why)`. Reads `RIVAL_SESSION_DIR`. Child of the rival process.                     |
| `broker.mjs`               | The handler's CLI: `next` blocks for the next request or the finished findings, `reply` answers one request or declines it, `status` reports.  |
| `post-review.mjs`          | Posts a session's findings to a PR as one `COMMENT` review with anchored comments and a hidden marker; adopts an existing marked review.       |
| `validate-findings.mjs`    | Checks a findings document against `findings.schema.json`.                                                                                     |
| `gen-acceptance-suite.mjs` | Generates a nonce-bearing real-agent acceptance question under the temp root.                                                                  |
| `NOTES.md`                 | Design history for both packages: decisions and their rejected alternatives, accepted exposures, the vendor parity table, what is unvalidated. |

## Supporting modules

| File                     | Owns                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `spool.mjs`              | The session directory layout and the request/reply files both broker processes watch.                                      |
| `worktree.mjs`           | Scope resolution to base/head OIDs (the uncommitted scope becomes a snapshot commit), the disposable worktree, the packet. |
| `stream.mjs`             | One NDJSON runner with the stall watchdog, plus the Codex and Claude event renderers and reducers.                         |
| `ledger.mjs`             | Rounds per unit of work, the rival's session id for resuming, the three-round cap.                                         |
| `prompt.mjs`             | Assembles `rival-prompt.md` for a scope, round, the vendor's tool boundary, and any extra instructions.                    |
| `rival-prompt.md`        | The rival's contract: where it is, how it executes, how to review, what to return.                                         |
| `rival-prompt-hybrid.md` | The execution section: the rival's own sandboxed shell first, `run` for what that sandbox refuses.                         |
| `findings.schema.json`   | The findings document both CLIs' structured-output flags enforce and the poster consumes.                                  |

## Session layout

A session lives under `os.tmpdir()/splotch-rival-agent/<uuid>/`, owner-only:

```text
session.json        written by the launcher: rival, scope, worktree, round
packet/             diff.patch, commits.txt, files.txt, scope.json — what the rival reads
requests/<seq>.json the rival's run(command, why) calls, in order
replies/<seq>.json  the handler's answers: exit + output, or declined + reason
outputs/<seq>.out   the full captured output the handler redirected into
findings.json       the validated findings document, once the rival finishes
done.json           written by the launcher when findings validated
failed.json         written by the launcher when the rival exited without valid findings
rival.ndjson        the raw stream log (rival-retry.ndjson for the one retry after a pruned resume)
tmp/                the rival's private TMPDIR and dprint cache, kept out of the sandbox's reach of the spool root
```

The launchers live in the skill packages: `.claude/skills/run-rival-agent/scripts/` (Claude is the
handler, Codex the rival) and `.agents/skills/run-rival-agent/scripts/` (Codex is the handler,
Claude the rival). Each one resolves the scope, creates the worktree and packet, starts the rival
with the broker attached, and on exit validates the final message into `findings.json`.

## Tests

`tests/*.test.mjs`, run by `npm run test:tools`. The broker protocol is exercised end to end with
the test acting as a fake rival over real stdio JSON-RPC.

## Live agent-to-agent acceptance

`npm run gen:rival-acceptance` creates a unique owner-only directory under the system temp root with
`question.md`. Give its absolute path to a Codex or Claude Code native handler for one non-posting
`run-rival-agent` question round: the rival runs six stages in its own sandboxed shell (chained
outputs, a nonzero exit with both streams, instruction-as-data, the parser probe plus a targeted
Vitest write inside the disposable worktree) and then meets two commands its sandbox refuses — a
marker write into the session directory the handler approves, and a write into the canonical
checkout the handler declines. The command's JSON output carries `handlerBrief` beside
`questionPath`: the two requests to expect in order, which to decline, and what to judge afterwards,
so the handler's side of the exchange travels with the question. A request for any local stage means
the rival did not use its shell. The parser probe and targeted test command are preserved from the
first real Codex-native-handler review.

This suite intentionally uses the real rival CLI and plan login. It is manual, nondeterministic in
wording, and never part of `npm test` or CI. The generated nonce and the broker spool provide the
objective evidence; the native handler decides whether the rival understood it.

## Failure behaviour

Every CLI prints one JSON document on stdout and diagnostics on stderr, and exits nonzero on any
failure. The stream watchdog terminates the rival's whole process group after ten minutes with
neither a stream event nor broker traffic. The poster refuses a head or base that moved since the
review and never posts twice for one range.

## Sensitive findings and safe manual recovery

Both the standalone poster and the fixed orchestrated publisher call the same pre-publish guard. It
checks the rendered review body (including off-diff findings and unverified commands), inline
comment bodies and inline paths before the POST. A match fails closed: no review is created, the
original session files are untouched, and diagnostics name only the field and detection category.
Clean reviews publish unchanged.

The guard recognizes modern physical iOS UDIDs and the Samsung serial shape used by the repository's
canonical device guard. Generic identifiers (including 16-digit hexadecimal Android identifiers and
legacy 40-digit iOS UDIDs) require a serial/UDID/device-ID field or common device command, because
an unlabelled value can also be a checksum or Git OID. Labelled identifiers must contain a digit or
be a full hexadecimal device-ID shape, so ordinary prose about device fields stays publishable.
Credential checks cover common GitHub, OpenAI, AWS and Google token shapes, private-key headers,
quoted secret assignments, bare assignments excluding common code expressions, and Basic/Bearer
authorization headers or opaque tokens. Ordinary authentication prose remains publishable. This is a
conservative shape check, not a universal secret detector: unusual unlabelled identifiers, encoded
values and unknown credential formats still need human inspection. False positives must be removed
from the public wording, never bypassed by disabling the guard.

Bare assignments to credential-named fields remain conservative: an identifier-like right-hand side
can be either a code reference or an actual shell/environment credential value. A terminating
semicolon cannot safely distinguish them, since shell assignments also use semicolons. Reword a
non-sensitive reference as a description when necessary; do not exempt all semicolon-terminated
assignments.

To recover a blocked review:

1. Keep `findings.json` in the owner-only session directory. Make a separate local copy there named
   `sanitized-findings.json`; do not attach either file or raw diagnostics to GitHub.
2. Inspect every summary, finding and unverified entry. Replace sensitive literal values with
   `[REDACTED]`, preserving the substantive claim, evidence and fix. Keep every finding in order,
   with its path, line, startLine, side and severity unchanged, and retain every unverified entry.
3. Re-run the standalone poster for the same session and PR with
   `--sanitized-findings <absolute-path-to-copy>`. Codex uses the installed
   `/Users/kylemit/.local/libexec/splotch-rival-agent/post-review.mjs` wrapper; the Claude handler
   uses `node tools/rival-agent/post-review.mjs`. Keep the normal `--pr` and `--session` arguments.
   This also recovers a blocked orchestrated run: use the session path printed in its progress log,
   rather than launching another reviewer round.
4. The copy is schema-checked, checked for unchanged finding anchors/severities, scanned again and
   explicitly marked as sanitized. Base/head OIDs and the hidden attribution marker still come from
   the original session; moved ranges remain blocked. Verify the posted review and its inline
   comments before declaring recovery complete.

There is no force-publish option. If a sensitive value is part of an anchor path or the session
metadata, leave publication blocked; fix the source path or metadata and review the corrected range.
Do not alter the reviewed range to disguise the original review as one of different code.

Installed Codex publishers gain these checks only after the trusted canonical checkout contains the
change and its normal `npm run run-claude:install` procedure refreshes the installed bytes. Do not
copy a PR worktree's publisher over the trusted wrapper to review that same PR.
