---
name: run-claude
description: Launch a fresh, subscription-authenticated local Claude Code process from Codex through fixed permission-reviewed wrappers. Use when the user explicitly asks Codex to run Claude, wants an independent Claude second opinion or adversarial review, or another Codex-only workflow needs a Claude subprocess; supports output-only prompts, read-only repository inspection, and the fixed Splotch PR-review publisher.
---

# Run Claude

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

The runner accepts `--model sonnet|opus` and `--effort low|medium|high`; defaults are `sonnet` and
`high`. Do not use this profile when empirical tests are required.

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
the validated base/head OIDs. It never approves, requests changes, merges, commits, or pushes.

## Consuming this skill

A Codex-only workflow that needs Claude must name `run-claude`, select the narrowest profile above,
and keep any external-write authorization in the fixed wrapper's contract. Do not copy invocation,
authentication, installation, or permission logic into the consuming skill.

Read [permissions.md](references/permissions.md) before changing the installation or trust boundary.
