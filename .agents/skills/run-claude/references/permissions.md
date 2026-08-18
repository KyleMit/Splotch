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
`sonnet|opus` model, `low|medium|high` effort, the `--persist`/`--resume <uuid>`/
`--end-session <uuid>` session controls, and—only for `inspect`—an absolute Splotch worktree root.
`ask` has no tools. `inspect` has only `Read`, `Grep`, and `Glob`. Neither profile authorizes an
external write. Prompt text never enters the parent shell command.

Sessions are ephemeral unless `--persist` opts in. The runner keeps one owner-only record file per
session it issues (so concurrent wrapper invocations never contend on shared ledger state) and
refuses to resume or end any id it holds no record for, so resumption can never reach a session
another process created. Resuming may widen a session's profile only from `ask` to `inspect`; every
other transition is rejected, and each resumed turn re-applies its profile's tool list, trusted
settings, and boundary prompt. `--end-session` deletes the session's transcript file and sidecar
directory, then removes the record. The progress stream and stall watchdog change observability only
— the owner-only stream log is exclusively created, terminating a stalled run signals Claude's whole
process group, and no profile gains a tool or an external write from streaming; the PR publisher
keeps a separate owner-only session record bound to one validated PR number. Its later invocations
can resume only that PR's recorded session, and `--pr <number> --end-session` deletes the transcript
and record after delivery or quarantine.

The PR publisher accepts `--pr <positive-integer>` for `KyleMit/Splotch`, optionally with
`--end-session`. It passes that same narrow authorization to Claude and runs with:

```text
--print --permission-mode auto --tools default --safe-mode
--no-chrome --strict-mcp-config --session-id <wrapper-issued-uuid>|--resume <recorded-uuid>
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

The required wrapper invocation is authoritative in [Host execution](../SKILL.md#host-execution). A
`prompt` decision in the installed policy reviews an explicitly escalated command; it does not turn
a default sandboxed invocation into host execution. The sandbox cannot read the Keychain login, so a
sandboxed health failure does not establish that the installation or Claude authentication is stale.

Once installation and policy checks pass, ordinary `ask` and `inspect` executions require no manual
user step. Their escalation requests go to Auto-review, while the fixed prefix rules and each
wrapper's internal contract retain the narrow authority described above. A denial remains a real
stop or safer-path signal; never route around it.

Run `npm run run-claude:policy:check` before use. Use
`codex execpolicy check --rules ~/.codex/rules/default.rules --pretty < command.txt` to inspect the
effective decisions after installation.
