# Run Claude — design notes

`run-claude` is a direct Codex-only package because its defining boundary is one agent runner
launching another vendor's local authenticated CLI. A shared Claude package would imply Claude
should orchestrate an independent Claude process and would spread Codex exec-policy details into a
provider that cannot use them.

## Capability split

The first issue-stack implementation owned Claude authentication, installation, policy, and PR
publication. That made the capability undiscoverable for ad-hoc second opinions and forced every
future Codex workflow to either depend on issue stacking or rediscover the same Keychain boundary.
The reusable capability now lives here; `implement-issue-stack` owns only stack orchestration and
consumes the fixed PR-review profile.

Three profiles deliberately have different authority:

1. `ask` sends an arbitrary prompt from a bounded prompt file to a fresh Claude process with no
   tools and returns JSON to Codex. It is the safe default for second opinions and smoke tests. The
   file boundary keeps untrusted prompt text out of the parent shell grammar.
2. `inspect` adds only `Read`, `Grep`, and `Glob` inside a validated Splotch worktree. It can review
   repository evidence but cannot run code, edit, browse, or publish.
3. The fixed PR publisher retains the empirical reviewer from the issue-stack workflow: a disposable
   checkout, default tools, Auto + safe mode, the trusted `leave-pr-review` rubric, and one narrowly
   authorized `COMMENT` review on validated base/head OIDs.

An arbitrary full-tool profile was rejected. Once a generic wrapper runs outside Codex's Seatbelt
sandbox, Codex cannot inspect Claude's nested operations after approving the wrapper. The PR
publisher can justify that authority because its target, prompt, checkout, marker, and postcondition
are fixed. An ad-hoc prompt cannot. A future empirical local-only profile should create a disposable
checkout and enforce its command surface before it is added.

## Authentication and policy

Subprocesses inside Codex's Seatbelt sandbox see binaries and config files but cannot read Claude or
GitHub credentials from the macOS Keychain. The installed entry points therefore run outside that
sandbox behind Codex Auto-review. Raw `claude` remains forbidden so caller-controlled flags cannot
remove Claude's second permission layer.

The caller must request host execution for each installed wrapper on its first attempt. A fixed
wrapper's `prompt` policy decision protects the escalation boundary but does not convert a default
sandboxed invocation into host execution. Treating the resulting Keychain failure as a failed
installation creates a false recovery loop: reinstalling cannot change the sandbox's credential
access. The skill therefore carries a CI-drift-guarded host-execution instruction, and installation
recovery begins only after a wrapper fails in that required context.

Codex currently names this tool boundary with the `sandbox_permissions` field and
`require_escalated` value. Those names come from Codex's external tool API; repository code cannot
validate that spelling or pin it to a Codex version. The behavioral signal remains whether the
health wrapper reaches the Keychain outside the sandbox. If that behavior regresses while policy and
installation checks pass, verify the current Codex escalation API before reinstalling.

Merged upstream change [openai/codex#36350](https://github.com/openai/codex/pull/36350) confirms the
unified `exec_command` call requires explicit `sandbox_permissions` whenever it carries a
`justification`; an incomplete call is rejected before execution with a model-visible instruction to
request `require_escalated` or omit the justification. Codex composes calls against its live tool
schema, so a future schema rename should fail toward the live schema while this note remains only
human-facing provenance.

Automatic model selection may consume Claude plan quota for `ask` or `inspect` without a separate
human prompt. That residual cost risk is accepted for repository-scoped sessions because seamless
model invocation is the capability's purpose, and those profiles remain bounded to no tools or
read-only repository access. The PR publisher retains its separate exact-PR authorization gate.

The installer hashes the wrappers, shared subscription-auth guard, trusted settings, prompt
boundaries, and review rubric. Every wrapper rejects environment variables that select API-key,
Bedrock, Vertex, or Foundry billing; the health probe also requires `claude auth status` to report a
logged-in, non-API-key session. `CLAUDE_CODE_OAUTH_TOKEN` remains valid because it draws from the
Claude plan, while local runs normally use the Keychain login.

The PR publisher additionally validates the repository remote, PR identity and state, same-repo
status, branch names, and exact OIDs. Its hidden base/head marker makes publication idempotent and
lets `address-pr-review mode=autonomous` recognize the independent review even when Claude and Codex
share one GitHub identity.

## Intermediate feedback and multi-turn resume

The original wrappers ran `spawnSync` with `--output-format json`, so a 5–20 minute PR review was
indistinguishable from a hung process until exit. The wrappers now run Claude with
`--output-format stream-json --verbose`, reduce each NDJSON event to one compact stderr line, tee
the raw stream to a log under `/private/tmp`, and keep stdout as final-result JSON only. Raw
stream-json is deliberately not forwarded: tool_result events embed entire file contents, which
would poison the parent agent's context over a long run. A stall watchdog in the shared
`splotch-claude-stream.mjs` module kills the child after a long silent gap — the bound lives in the
wrapper rather than the orchestrator because a parent agent cannot be relied on to keep polling. The
publisher's bound is longer because a build or test run emits nothing between `tool_use` and
`tool_result`.

Streaming also narrows the gap that justified rejecting a generic full-tool profile: once a wrapper
runs outside Codex's sandbox, Codex could not inspect Claude's nested operations after approving the
wrapper. With per-event progress, every nested tool call is visible to the orchestrator as it
happens.

Multi-turn interaction uses session resume (`--persist` to create, `--resume` to continue,
`--end-session` to clean up), not a live `--input-format stream-json` stdin channel. Resume keeps
every turn a discrete wrapper invocation that Codex's approval policy and the prompt-file boundary
review individually, and a crash between turns loses nothing; a live stdin channel would make the
wrapper a long-lived proxy whose later turns bypass the policy layer, hand-rolls what is effectively
the Agent SDK's undocumented wire protocol, and loses the whole conversation if the exec session
drops. A `--permission-prompt-tool` MCP handshake for mid-turn permission grants was considered and
deferred — resume-with-widened-grant covers the need at turn granularity.

The widened grant is bounded to the existing profile vocabulary: a resumed session may go `ask` →
`inspect` and nothing else. Arbitrary `--allowedTools` widening on resume was rejected for the same
reason as the generic profile — the fixed profiles are the reviewed authority surface. The runner's
session records exist so `--resume` and `--end-session` can only reach sessions this wrapper
created; without them, resume would be a door into any local Claude session and end-session could
delete a human's interactive transcript. The records are one owner-only file per session rather than
one shared ledger JSON — the first review of this design reproduced concurrent wrappers losing each
other's entries through the shared file's read-modify-write cycle. The same review hardened the
stream log (owner-only, exclusively created, because raw tool_result events embed file contents into
a listable temp directory) and the watchdog kill (Claude runs detached at the head of its own
process group, terminated group-wide with a bounded SIGKILL escalation, because SIGTERM to the
Claude PID alone leaves a hung tool grandchild running — the vite-server.mjs precedent).

The PR publisher originally stayed one-shot because its disposable worktree teardown was part of its
contract. Issue-stack review rounds showed the opposite failure mode: a fresh adversarial
conversation on every repaired head has no memory of its earlier scope and is rewarded for finding a
new problem, so a shippable change can accumulate unrelated nits. The publisher now separates
conversation lifetime from checkout lifetime. It keeps one owner-only session record bound to the
validated PR number, creates a fresh disposable checkout for every head, resumes the same Claude
conversation there, and injects a continuation prompt that limits new findings to regressions or
blockers that could not have been seen earlier. The orchestrator explicitly ends the session after
delivery or quarantine. This preserves empirical isolation per head without resetting review intent
between rounds.

Open validation questions:

* Whether Claude adds a stable machine-readable subscription field that should become a required
  health-check assertion.
* Whether a future local empirical profile can permit a useful test vocabulary without allowing
  untrusted package scripts to turn that vocabulary into arbitrary host execution.
* The widened-grant path resumes an `ask` session (created with cwd `~/.config/splotch-run-claude`)
  from an `inspect` checkout cwd, which relies on Claude's machine-wide session lookup (added in
  v2.1.223); on an older CLI the resume may fail to find the session. Unvalidated against the
  installed CLI version.
* Whether the reviewer's phase-announcement rubric line produces useful milestones in practice or
  gets drowned out by tool-event lines.
