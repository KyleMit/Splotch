# tools/rival-agent — the vendor-neutral core of `run-rival-agent`

Everything the two `run-rival-agent` skill packages share. A **native handler** (the agent already
running in the current runner, Claude Code or Codex) launches a **rival agent** (the other vendor's
CLI) read-only inside a disposable worktree pinned to one commit id. The rival's only way to execute
anything is the broker: it asks, the handler runs the command under its own permission rules or
declines, and the answer flows back. The rival returns findings against one schema and the handler
posts them verbatim.

This folder imports nothing from outside itself. The Codex-side installer copies it into
`~/.local/libexec` as hashed trusted bytes, where the rest of the checkout does not exist.

## Entry points

| File                    | Role                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `broker-server.mjs`     | The stdio MCP server the rival sees. One tool, `run(command, why)`. Reads `RIVAL_SESSION_DIR`. Child of the rival process.                    |
| `broker.mjs`            | The handler's CLI: `next` blocks for the next request or the finished findings, `reply` answers one request or declines it, `status` reports. |
| `post-review.mjs`       | Posts a session's findings to a PR as one `COMMENT` review with anchored comments and a hidden marker; adopts an existing marked review.      |
| `validate-findings.mjs` | Checks a findings document against `findings.schema.json`.                                                                                    |

## Supporting modules

| File                   | Owns                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `spool.mjs`            | The session directory layout and the request/reply files both broker processes watch.                                      |
| `worktree.mjs`         | Scope resolution to base/head OIDs (the uncommitted scope becomes a snapshot commit), the disposable worktree, the packet. |
| `stream.mjs`           | One NDJSON runner with the stall watchdog, plus the Codex and Claude event renderers and reducers.                         |
| `ledger.mjs`           | Rounds per unit of work, the rival's session id for resuming, the three-round cap.                                         |
| `prompt.mjs`           | Assembles `rival-prompt.md` for a scope, round, and any extra instructions.                                                |
| `rival-prompt.md`      | The rival's contract: where it is, what `run` is, how to review, what to return.                                           |
| `findings.schema.json` | The findings document both CLIs' structured-output flags enforce and the poster consumes.                                  |

## Session layout

A session lives under `os.tmpdir()/splotch-rival-agent/<uuid>/`, owner-only:

```text
session.json        written by the launcher: rival, scope, worktree, round, log path
packet/             diff.patch, commits.txt, files.txt, scope.json — what the rival reads
requests/<seq>.json the rival's run(command, why) calls, in order
replies/<seq>.json  the handler's answers: exit + output, or declined + reason
outputs/<seq>.out   the full captured output the handler redirected into
findings.json       the validated findings document, once the rival finishes
done.json           written by the launcher when findings validated
failed.json         written by the launcher when the rival exited without valid findings
rival.ndjson        the raw stream log (rival-retry.ndjson for the one retry after a pruned resume)
```

The launchers live in the skill packages: `.claude/skills/run-rival-agent/scripts/` (Claude is the
handler, Codex the rival) and `.agents/skills/run-rival-agent/scripts/` (Codex is the handler,
Claude the rival). Each one resolves the scope, creates the worktree and packet, starts the rival
with the broker attached, and on exit validates the final message into `findings.json`.

## Tests

`tests/*.test.mjs`, run by `npm run test:tools`. The broker protocol is exercised end to end with
the test acting as a fake rival over real stdio JSON-RPC.

## Failure behaviour

Every CLI prints one JSON document on stdout and diagnostics on stderr, and exits nonzero on any
failure. The stream watchdog terminates the rival's whole process group after ten minutes with
neither a stream event nor broker traffic. The poster refuses a head or base that moved since the
review and never posts twice for one range.
