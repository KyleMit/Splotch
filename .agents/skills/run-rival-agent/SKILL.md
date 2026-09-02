---
name: run-rival-agent
description: Launch the rival agent — a fresh, subscription-authenticated local Claude Code process — from Codex through fixed permission-reviewed wrappers. Use when the user asks Codex to run Claude, wants an independent Claude second opinion or adversarial review, or another Codex-only workflow needs a Claude subprocess; supports output-only prompts, read-only repository inspection, and the fixed Splotch PR-review publisher, with streamed per-event progress and resumable multi-turn sessions. On Claude the same skill name launches Codex instead.
---

# Run Rival Agent: Claude from Codex

This is the Codex-side package of `run-rival-agent`; it launches Claude. The Claude-side package of
the same name launches Codex, so shared prose can name `run-rival-agent` without knowing which
runner it is on — each provider tree carries the package that launches the *other* vendor. The
`run-claude:*` npm scripts and the installed `splotch-claude-*` wrappers keep their names because
they name the process they launch.

Use the installed wrappers, never raw `claude`, a renamed binary, or an indirect shell escape. The
wrappers run outside Codex's sandbox so the Claude CLI can read its macOS Keychain login; Claude's
own sandbox and permission classifier remain active.

## One-time setup

From the trusted canonical checkout, install the fixed wrappers and Codex policy once:

```sh
cd /Users/kylemit/Code/Splotch
npm run run-claude:install
```

Restart Codex so the updated config and rules load. To verify the prepared state explicitly from a
normal restarted session, run the policy check in the normal sandbox, then invoke the health wrapper
through the host-execution boundary below:

```sh
npm run run-claude:policy:check
/Users/kylemit/.local/libexec/splotch-claude-health.mjs
```

No per-invocation setup command is required. Rerun the installer only when the policy check or an
escalated health check reports missing or stale installation state.

## Invocation contract

After one-time setup, complete ordinary `ask` and `inspect` invocations without manual user steps.
Treat an explicit skill invocation or a task matching the skill description as sufficient authority
to select the narrowest profile, run preflight, create and remove the prompt file, invoke Claude,
and return its result. Do not ask the user to run commands, perform preflight, choose a profile, or
approve intermediate steps when the checks pass. The PR publisher still requires authorization for
an exact pull request because it writes externally.

## Host execution

Invoke every installed `/Users/kylemit/.local/libexec/splotch-claude-*.mjs` wrapper through
`exec_command` with `sandbox_permissions: "require_escalated"` on the first attempt and a concise
justification for using the fixed wrapper. Never run an installed wrapper in the sandbox first. The
installed approval policy reviews these exact paths; a sandboxed invocation cannot read the Keychain
login and its failure is not evidence that installation is stale. The one-time installer configures
Auto-review so eligible wrapper escalations route to the reviewer instead of pausing for the user.

## Preflight

Before the first invocation in a task, run the policy check in the normal sandbox:

```sh
npm run run-claude:policy:check
```

Stop and use the installation recovery below if it fails. After it passes, invoke the health wrapper
through the host-execution boundary described above:

```sh
/Users/kylemit/.local/libexec/splotch-claude-health.mjs
```

If that escalated health check fails, stop and ask the user to run this from the trusted canonical
checkout, then restart Codex:

```sh
cd /Users/kylemit/Code/Splotch
npm run run-claude:install
```

The installed runner rejects inherited API-key, Bedrock, Vertex, and Foundry billing selectors;
successful calls therefore use the Claude plan login reported by `claude auth status`, not Anthropic
API credits.

## Choose one profile

### Output-only second opinion

Use the default `ask` profile for reasoning over the prompt itself. Claude receives no tools and
returns one fresh, non-persisted JSON result to Codex. Write the exact task to a uniquely named file
under `/private/tmp` with `apply_patch`, invoke the runner, then remove that temporary file:

```sh
/Users/kylemit/.local/libexec/splotch-claude-run.mjs \
  --prompt-file /private/tmp/splotch-claude-prompt-<unique>.md
```

### Read-only repository inspection

Use `inspect` when Claude must read the Splotch checkout. Supply an absolute checkout path. Claude
gets only `Read`, `Grep`, and `Glob`; it cannot run Bash, browse, edit, or publish:

```sh
/Users/kylemit/.local/libexec/splotch-claude-run.mjs \
  --profile inspect \
  --cwd <absolute-splotch-checkout> \
  --prompt-file /private/tmp/splotch-claude-prompt-<unique>.md
```

The runner accepts `--model sonnet|opus` and `--effort low|medium|high`; defaults are `opus` and
`high`. It also accepts the session controls described under Multi-turn sessions below. Do not use
this profile when empirical tests are required.

Never interpolate prompt text into the shell command. The prompt-file boundary prevents arbitrary
task content from becoming shell syntax before the wrapper starts.

### Empirical Splotch PR review

Use the fixed publisher only when the user or consuming workflow authorizes posting a review to an
exact Splotch PR:

```sh
/Users/kylemit/.local/libexec/splotch-claude-review-publish.mjs --pr <number>
```

This profile creates a disposable worktree, gives Claude its normal empirical-review tools under
Auto + safe mode, injects the trusted `leave-pr-review` rubric, and permits one `COMMENT` review on
the validated base/head OIDs. It never approves, requests changes, merges, commits, or pushes. It
streams progress like the runner (see Intermediate feedback).

The first invocation creates one persistent reviewer conversation bound to that PR. A later
invocation for a changed head automatically resumes the same conversation in a new disposable
worktree, so Claude retains its earlier findings and treats the new round as a focused verification
of the fixes and delta instead of inventing a fresh review surface. Publication remains idempotent
per base/head. End the conversation after delivery or quarantine:

```sh
/Users/kylemit/.local/libexec/splotch-claude-review-publish.mjs --pr <number> --end-session
```

The disposable worktree is still removed after every invocation; only the narrowly bound review
conversation persists between rounds. The publisher enforces the issue-stack budget of three
published review rounds and retries once with a new conversation if the recorded session was never
created or later disappeared. `--end-session` verifies the installed wrapper before cleanup and
removes an unreadable or invalid record without following its contents into the transcript tree.

## Intermediate feedback

Every wrapper invocation streams progress while Claude works, so a long run is observable instead of
silent. stderr carries one compact timestamped line per stream event — session start, each tool
call, assistant text, tool errors, and the final result — and the first line names an NDJSON log
under `/private/tmp` holding every raw event for later inspection. stdout stays machine-readable: it
carries only the final result JSON.

Treat an `exec_command` yield during a run as a checkpoint, not a failure: read the new progress
lines and decide whether to keep waiting. On Codex, retain the complete `exec_command` result when
it yields. Printing only `result.output` discards `result.session_id`: Claude keeps running, but the
session can no longer poll it and may launch a duplicate review. Poll the returned handle with
`write_stdin` until it exits, or use the redirected-log pattern below. A progress log without the
terminal `result` event is not a completed review.

For a long run such as a PR review, prefer launching the wrapper once through the host-execution
boundary with output redirected to a file, then polling that file with plain sandboxed reads
(`tail -n 20 <file>`) so observation never re-crosses the approval boundary.

If the stream stays silent past the stall timeout declared in `splotch-claude-stream.mjs` (the PR
publisher uses its own longer bound for silent build/test gaps), the wrapper terminates Claude and
exits nonzero, naming the last event and the full log path — a hung process can no longer look like
a slow one.

## Multi-turn sessions

The runner is one-shot by default: no session persists. Pass `--persist` on the first invocation to
create a resumable session; the wrapper prints `session id: <uuid>` on stderr (the id is also in the
result JSON). Send each follow-up turn with a fresh prompt file:

```sh
/Users/kylemit/.local/libexec/splotch-claude-run.mjs \
  --resume <session-id> \
  --prompt-file /private/tmp/splotch-claude-prompt-<unique>.md
```

The wrapper resumes only sessions recorded in its own ledger. Each resumed turn selects a profile as
usual, and the only permitted widening is `ask` → `inspect` — the resume-with-widened-grant path:
when an `ask` session reports it needs repository evidence, resume it with
`--profile inspect --cwd <absolute-splotch-checkout>` instead of starting over. Any other profile
transition is rejected.

When the task that created a session concludes, end it so no transcript outlives the work:

```sh
/Users/kylemit/.local/libexec/splotch-claude-run.mjs --end-session <session-id>
```

## Consuming this skill

A Codex-only workflow that needs Claude must name `run-rival-agent`, select the narrowest profile
above, and keep any external-write authorization in the fixed wrapper's contract. Do not copy
invocation, authentication, installation, or permission logic into the consuming skill.

Read [permissions.md](references/permissions.md) before changing the installation or trust boundary.
