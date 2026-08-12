# Permission installation

Run `npm run run-claude:install` once from the trusted canonical checkout, approve that fixed Node
command in Codex, and restart Codex so its config and rules reload. The installer:

* sets `approval_policy = "on-request"`, `approvals_reviewer = "auto_review"`, and
  `sandbox_mode = "workspace-write"` in `~/.codex/config.toml`;
* allows only the three fixed run, health, and PR-review wrappers at Codex's approval boundary while
  forbidding raw Claude entry points;
* installs those read-only wrappers and their subscription-authentication guard under
  `/Users/kylemit/.local/libexec/`;
* installs hashed Claude settings, task boundaries, and a manifest outside the reviewed repository.

The generic runner accepts only an absolute bounded prompt file, `ask|inspect` profile,
`sonnet|opus` model, `low|medium|high` effort, and—only for `inspect`—an absolute Splotch worktree
root. `ask` has no tools. `inspect` has only `Read`, `Grep`, and `Glob`. Neither profile authorizes
an external write. Prompt text never enters the parent shell command.

The PR publisher accepts exactly `--pr <positive-integer>` for `KyleMit/Splotch`. It passes that
same narrow authorization to Claude and runs with:

```text
--print --permission-mode auto --tools default --safe-mode
--no-chrome --strict-mcp-config --no-session-persistence
```

It never uses `--bare`, `--dangerously-skip-permissions`, or `bypassPermissions`. Claude's inner
Bash sandbox stays enabled and keeps the Auto classifier involved. The disposable worktree protects
the developer's checkout but does not make arbitrary external actions safe.

All three wrappers reject environment variables that select API-key, Bedrock, Vertex, or Foundry
billing. `CLAUDE_CODE_OAUTH_TOKEN` remains allowed because it is a Claude plan token; local use
normally authenticates through the macOS Keychain. The health wrapper additionally requires
`claude auth status` to report a logged-in, non-API-key session.

The prefix rules are not a complete remote security perimeter. Repository protections and narrowly
scoped credentials remain the hard remote guarantees; Auto-review evaluates operations that reach
the escalation boundary.

Run `npm run run-claude:policy:check` before use. Use
`codex execpolicy check --rules ~/.codex/rules/default.rules --pretty < command.txt` to inspect the
effective decisions after installation.
