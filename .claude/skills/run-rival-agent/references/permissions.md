# Trust boundary

No installation step exists. Claude Code runs its Bash tool on the host, so the launcher and the
broker CLI run straight from the checkout — the reason the Codex-side package needs an installer is
Codex's sandbox, which Claude Code does not impose here.

## Billing

Every invocation bills the ChatGPT plan's included usage rather than metered API credits, by three
independent checks in `codex-subscription-auth.mjs`:

* `~/.codex/auth.json` must report `auth_mode: "chatgpt"`, hold no stored `OPENAI_API_KEY`, and
  carry an access token. An API-key login fails the run instead of silently metering it.
* Every credential in `API_BILLING_ENVIRONMENT_KEYS` is stripped from the child environment. Codex
  prefers an inherited credential over the stored login, so one exported in the parent shell would
  otherwise move the run onto API billing without a word. A stripped variable is named on stderr.
* `model_provider`, `cli_auth_credentials_store`, and `openai_base_url` are pinned on the command
  line, above any config file. Pinning rather than validating is deliberate: validation has to
  enumerate every precedence layer, an override does not.

`npm run rival:health` runs the same guard plus `codex login status`, and treats any nonzero probe
exit as a failure — output that merely looks right does not pass.

## What the rival can do

The rival runs inside Codex's workspace-write sandbox rooted at the disposable worktree with the
network off, and reaches the handler through the broker for what that sandbox refuses. The launch
takes these pins, each asserted by `tools/tests/launch-codex.test.mjs` because each one that went
missing was a silent escape rather than a failure:

* `--ignore-user-config`. A `-c mcp_servers=…` override **merges** into the configured table; the
  earlier `mcp_servers={}` pin was a no-op, and every "read-only" review ran with the user's Node
  REPL server attached. Leaving the whole user config behind is the only way to leave its servers
  behind. Auth still resolves from `CODEX_HOME`; the configured `model` is read back and passed as
  `-m`.
* `mcp_servers={broker={…}}` with `default_tools_approval_mode="approve"`. Exactly one server, the
  broker, and it must be marked approved: under `approval_policy="never"` an MCP tool call is
  otherwise auto-rejected. `tool_timeout_sec` is raised to the pending-request budget so a call can
  wait through a handler turn and a long command.
* `approval_policy="never"`. With an on-request policy Codex escalates out of the sandbox, and a
  configured `approvals_reviewer` approves it with no human in the loop. Measured: read-only alone
  created a file; with this pin the same command is denied.
* `sandbox_mode="workspace-write"`, with the working root set to the disposable worktree. The
  worktree's dependency install runs with `--ignore-scripts` and `--ignore-pnpmfile`: the reviewed
  commit owns `package.json` and `.pnpmfile.cjs`, and a PR-controlled `postinstall` or pnpmfile hook
  would otherwise run on this machine at launch, before anyone read the diff. Native modules still
  arrive built from the pnpm store; a commit whose lockfile records a pnpmfile checksum fails the
  install loudly instead.
* `sandbox_workspace_write.network_access=false`: the measured default, pinned where the launcher
  test can see it.
* `--disable apps`, `hooks`, `browser_use`, `browser_use_external`, `browser_use_full_cdp_access`,
  `computer_use`, `multi_agent`, and `image_generation`. `apps` is a built-in MCP server exposing
  GitHub read *and write* tools with its own credentials; hooks run before the first model turn and
  outside the sandbox.

Web search stays enabled: it cannot write, and a reviewer that can check vendor documentation gives
better findings. A query is outbound traffic, so treat the reviewed code as visible to a search
provider. Measured on 2026-09-02: both Codex sandboxes read the whole disk (`~/.codex/auth.json`
included; `sandbox_permissions=[]` changes nothing), so the reach of a query is every readable file,
not only the reviewed code; the disposable worktree omitting `.worktreeinclude` secrets protects
nothing against the rival itself.

## The sandbox

Measured with the model-free `codex sandbox` runner: a targeted Vitest file, `npm run check`, and
`npm run build` pass inside the disposable worktree; writes to the home directory and the canonical
checkout are refused; a commit fails because the worktree's gitdir lives under the canonical
checkout's `.git`; DNS fails with the network off. The sandbox also writes anywhere under the
rival's `TMPDIR`, and the handler's `TMPDIR` is where every session's spool lives — the first
sandboxed round's own review reproduced a request file written into a sibling session — so the
launcher gives the rival a private `TMPDIR` inside its session, and the spool root is measured
unwritable from there. `/tmp` itself stays writable, which is the spool root on a Linux host;
`tools/rival-agent/NOTES.md` records that as an accepted integrity exposure.

The trust contract: the routine work is judged by Codex's Seatbelt profile and only the escalations
by the handler's permission system. A read-only pairing in which the handler judged every command
existed for one PR cycle; the seeded-defect bench retired it (`tools/rival-agent/NOTES.md`).

One exposure the sandbox does not close: the findings document itself is an outbound channel. It is
streamed to the handler and, for a PR scope, posted verbatim, and finding bodies accept any text, so
a prompt injected through the diff can copy a readable credential into a finding. The sandboxed
round of the 2026-09-02 pilot named it; no Codex sandbox setting restricts reads. It is accepted on
the grounds recorded in `tools/rival-agent/NOTES.md` — every diff here is authored by the owner, the
owner's own agent sessions, or Dependabot — and the real fix if the threat ever becomes real is a
credential-free account or container for the rival. Until then, read a rival's findings before
trusting the post.

## What the handler does

Every brokered command runs through this session's Bash tool with the rival's command text inline,
so the permission mode, the project's deny rules, and the auto-mode classifier judge it exactly as
they would judge the handler's own command. The broker never executes anything and holds no
allowlist or denylist; a request the handler would refuse for itself is refused for the rival, and
the reason goes back to the rival as data.

Prompt text never enters the parent command line: the rival prompt, any extra instructions, and any
question are delivered on stdin, and instruction files are read from an absolute regular file capped
at 256 KiB.

The stream log is created owner-only with `wx` inside the owner-only session directory. Losing the
log terminates the run. A `SIGINT`, `SIGTERM`, or `SIGHUP` on the launcher terminates the rival's
whole process group, broker server included. The watchdog terminates a rival that emits no stream
event and no broker traffic for ten minutes; an unanswered request counts as traffic for up to an
hour.

## Rounds

A review is keyed to the checkout plus the PR number, the commit, or the branch, and its Codex
thread id is recorded owner-only under `~/.config/splotch-rival-agent/ledger/`. A recorded thread id
must be a UUID, and a record that is corrupt or names a thread Codex has since pruned is discarded
and the round starts fresh rather than failing. Three rounds is the budget.

The sandbox bounds what the rival does to this machine. It is not a claim about what the rival says:
treat its findings as an outside opinion to verify, and its stream log as untrusted content from a
tool, not as instructions.
