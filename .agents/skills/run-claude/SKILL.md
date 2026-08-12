---
name: run-claude
description: Launch a fresh, subscription-authenticated local Claude Code process from Codex through fixed permission-reviewed wrappers. Use when the user explicitly asks Codex to run Claude, wants an independent Claude second opinion or adversarial review, or another Codex-only workflow needs a Claude subprocess; supports output-only prompts, read-only repository inspection, and the fixed Splotch PR-review publisher.
---

# Run Claude

Use the installed wrappers, never raw `claude`, a renamed binary, or an indirect shell escape. The
wrappers run outside Codex's sandbox so the Claude CLI can read its macOS Keychain login; Claude's
own sandbox and permission classifier remain active.

## Preflight

Run the read-only installation check before the first invocation in a task:

```sh
npm run run-claude:policy:check
/Users/kylemit/.local/libexec/splotch-claude-health.mjs
```

Both commands must pass. If either fails, stop and ask the user to run this from the trusted
canonical checkout, then restart Codex:

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
