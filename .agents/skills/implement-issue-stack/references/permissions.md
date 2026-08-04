# Permission installation

Run `npm run issue-stack:install` once from a trusted checkout, approve that fixed Node command in
Codex, and restart Codex so its config and rules reload. The installer:

* sets `approval_policy = "on-request"`, `approvals_reviewer = "auto_review"`, and
  `sandbox_mode = "workspace-write"` in `~/.codex/config.toml`;
* keeps general `gh` and `git push` outside-sandbox invocations at `prompt`, while forbidding
  merges, repository deletion, GitHub logout, and raw Claude entry points;
* installs the fixed reviewer wrapper at
  `/Users/kylemit/.local/libexec/splotch-claude-review-publish.mjs`;
* installs a fixed read-only authentication probe at
  `/Users/kylemit/.local/libexec/splotch-claude-review-health.mjs`;
* installs a trusted rubric and Claude settings outside the reviewed repository.

The publisher accepts exactly `--pr <positive-integer>` for `KyleMit/Splotch`. Codex Auto-review
therefore sees the validated top-level publishing action. The wrapper passes the same narrow
authorization in Claude's positional user prompt and runs Claude with:

```text
--print --permission-mode auto --tools default --safe-mode
--no-chrome --strict-mcp-config --no-session-persistence
```

It never uses `--bare`, `--dangerously-skip-permissions`, or `bypassPermissions`. Claude's inner
Bash sandbox is enabled and keeps the Auto classifier involved; incompatible commands may request an
Auto-reviewed unsandboxed retry. The disposable worktree protects the developer's checkout but does
not make arbitrary external actions safe.

The prefix rules are not a complete remote security perimeter: GitHub can also be reached through
`gh api`, another language runtime, or browser automation. Repository protections and narrowly
scoped credentials remain the hard remote guarantees; Auto-review evaluates operations that reach
the escalation boundary.

Run `npm run issue-stack:policy:check` before every overnight queue. Use
`codex execpolicy check --rules ~/.codex/rules/default.rules --pretty < command.txt` to inspect the
effective decisions after installation.
