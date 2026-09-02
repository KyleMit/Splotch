# Rival agent pairing — plan review and build log (2026-09-02)

Working notes for rebuilding `run-rival-agent` into a native handler / rival agent pairing. The
design was worked out in conversation on 2026-09-02 and handed off unimplemented; this note records
what the review of that plan found before code was written, every empirical probe that shaped a
decision, and the build as it lands. Vocabulary: **native handler** (the agent already running in
the current runner, holds every permission) and **rival agent** (the other vendor's CLI, holds none,
asks the handler to run commands through a broker).

## Plan review — holes found before building

Each item below was checked against the repo and both CLIs on 2026-09-02 (`codex-cli 0.149.1`,
Claude Code 2.1.251). "Verified" means a probe was run, not that the docs say so.

### 1. The existing `mcp_servers={}` isolation pin never worked

`codex mcp list -c 'mcp_servers={}'` still lists `node_repl` as enabled, and a `codex exec` run
launched with the current isolation pins reported `mcp__node_repl__js` among its tools. A `-c`
override of `mcp_servers` **merges** into the configured table; it does not replace it. So every
"read-only" Codex review to date has had a Node REPL server, which runs outside the sandbox, on its
tool list. The test that asserts the pin is present pins a no-op.

**Fix (verified):** `--ignore-user-config` drops `$CODEX_HOME/config.toml` entirely — the same run
with that flag listed only the broker. Auth still resolves from `CODEX_HOME`. The cost is that the
config's `model` is gone too, so the launcher passes `-m` explicitly.

### 2. MCP tool calls are auto-rejected under `approval_policy="never"`

With the broker attached, the rival's first `run` call failed with
`MCP tool call requires approval, but approval policy is never`. The `never` pin the plan keeps for
sandbox escapes also closes the one door the design opens.

**Fix (verified):** `mcp_servers.broker.default_tools_approval_mode = "approve"` (per-tool
`tools.run.approval_mode` also exists). With that key the call completed and returned the broker's
text under `never`. The `granular` approval policy's categories (`sandbox_approval`, `rules`,
`mcp_elicitations`, `request_permissions`, `skill_approval`) do not cover plain MCP tool calls.

### 3. Both CLIs time out a slow tool call by default

Codex's per-tool MCP timeout defaults to 60 s (`mcp_servers.<id>.tool_timeout_sec`). Claude Code has
`MCP_TOOL_TIMEOUT` (ms). A brokered command waits for a handler turn plus the command itself,
routinely minutes. Both launchers must raise the bound to the stall budget or every real request
fails as a timeout.

### 4. The rival's stall watchdog would kill a rival that is waiting on the handler

The stream watchdog terminates the rival after ten silent minutes. A rival blocked inside `run`
emits nothing while the handler decides and runs the command. The watchdog has to treat an
outstanding broker request as activity, or the handler running a long test kills the reviewer it is
serving.

### 5. `--safe-mode` silently disables `--mcp-config` on Claude

The first Claude probe attached no server at all (empty broker log, no `mcp__broker__run` in the
tool list). `--safe-mode` disables MCP along with CLAUDE.md, skills, plugins, and hooks.

**Fix (verified):** `--restricted --strict-mcp-config --mcp-config <json>` attaches exactly the
broker, confines the file tools to the worktree, refuses `bypassPermissions`, and ignores user and
project settings. With
`--permission-mode dontAsk --tools Read,Grep,Glob --allowedTools
Read,Grep,Glob,mcp__broker__run`
the rival called the broker and `--json-schema` returned `structured_output` on the result.

### 6. Broker load is asymmetric between the two rivals

Past Codex reviews ran about 21 shell commands each (read from the stream logs: `git`, `sed`, `nl`,
`rg`, `jq`, a few `npm run` checks). A Codex rival keeps its read-only shell, so only escalations
reach the broker. A Claude rival has no shell at all, so every `git diff` would be a handler turn.

**Mitigation:** the launcher writes a review packet into the worktree's scratch area — the diff, the
commit list, the changed-file list — so both rivals read the range with file tools and reach for the
broker only to execute. The rival prompt also asks for batched requests.

### 7. `codex exec review` cannot carry the rival contract

The `review` subcommand refuses a scope flag together with a custom prompt, and the rival prompt is
the contract (broker rules, schema, rubric). Rather than two launch shapes, both sides run the plain
`exec` path with the shared rival prompt and `--output-schema`. Whether `review` accepts a schema is
therefore moot.

### 8. Worktree provisioning is cheap

Measured in this checkout: `git worktree add` 1 s, `pnpm install --frozen-lockfile
--prefer-offline`
3 s (1060 reused, 0 downloaded), `npm run info` 1 s. The rival's worktree gets none of the
`.worktreeinclude` secrets (`web/.env` and the native signing files) on purpose.

### 9. The uncommitted scope becomes a real OID

Instead of copying a diff into the worktree, the launcher writes the working tree — tracked changes
plus untracked non-ignored files — through a temporary index (`GIT_INDEX_FILE`, `git write-tree`,
`git commit-tree`) into a dangling commit and checks the worktree out at that OID. The ledger and
the review marker then carry one kind of identity for every scope. The shared stash stack is never
touched (see the root `CLAUDE.md` on worktrees).

### 10. The handler must run the command where the rival is looking

The rival's request resolves against its worktree, not the handler's checkout. `broker next` returns
the worktree path and the handler runs the command verbatim as `cd <worktree> && <command>`,
capturing output to a spool file. The command text stays visible to the handler's permission system
— a `Bash(git push --force*)` deny rule and the auto-mode classifier both read it — which is the
reason the broker never wraps or executes commands itself.

### 11. Anchors that miss the diff must not sink the whole review

GitHub rejects an entire review when one inline comment names a line outside the diff. The poster
parses the range's hunks, keeps comments whose `path`/`line`/`side` land on a diff line, and moves
the rest into the review body under "Unanchored findings" rather than failing or silently dropping
them.

### 12. Blocking wait has to fit each handler's tool timeout

Claude's Bash tool caps a call at ten minutes; Codex's `exec_command` yields earlier. `broker next`
takes `--timeout-seconds` and returns `{"state":"waiting"}` on expiry so the handler loops instead
of erroring.

## Decisions carried from the plan unchanged

One paired profile on both sides; no rungs, no broker allowlist or denylist, no command menu. The
handler's own permission system is the only policy engine. Findings post verbatim through the
poster, one `COMMENT` review with a hidden base/head marker, adopted if already present. The
three-round ledger cap stays. `implement-issue-stack` keeps calling
`~/.local/libexec/splotch-claude-review-publish.mjs --pr <n> [--end-session]` by fixed path; that
file becomes an alias onto the new Codex-side launcher.

## Probe commands

The toy broker used for the probes lived in the session scratchpad and is not committed; the
production broker in `tools/rival-agent/` replaces it. The shapes that worked:

```sh
codex exec --json --ignore-user-config --skip-git-repo-check -s read-only \
  -c 'approval_policy="never"' --disable apps --disable hooks --disable browser_use \
  --disable browser_use_external --disable browser_use_full_cdp_access --disable computer_use \
  -c 'mcp_servers={broker={command="node",args=["<broker>"],default_tools_approval_mode="approve"}}' \
  -c 'model_provider="openai"' -c 'cli_auth_credentials_store="file"' \
  -c 'openai_base_url="https://chatgpt.com/backend-api/codex"' -m <model> \
  --output-schema <schema.json> - < prompt.md
```

```sh
claude -p --restricted --permission-mode dontAsk --tools Read,Grep,Glob \
  --allowedTools Read,Grep,Glob,mcp__broker__run \
  --mcp-config '{"mcpServers":{"broker":{"command":"node","args":["<broker>"]}}}' \
  --strict-mcp-config --no-chrome --output-format stream-json --verbose \
  --json-schema '<schema>' <prompt>
```

## Build log

* 2026-09-02 — plan reviewed, probes run, note written. Build order: shared core and tests, Claude
  side, Codex side, deletions and notes.
* 2026-09-02 — shared core landed under `tools/rival-agent/` with the broker protocol tested end to
  end (the test is the rival, over real stdio JSON-RPC). One more hole closed while building: a
  request the handler is still working on has to hold the rival's watchdog open, so an unanswered
  request counts as activity for up to an hour and both CLIs' MCP tool timeouts are set to match.
* 2026-09-02 — Claude side rebuilt: `launch-codex.mjs` replaces `codex-run.mjs`,
  `codex-session.mjs`, and `codex-stream.mjs`; the `ask` and `review` profiles are gone; npm scripts
  moved from `run-codex:*` to `rival:*`. The marker becomes `splotch-rival-review:rival=<vendor>;…`
  — the `splotch-claude-review` consumers in `address-pr-review` and `implement-issue-stack` are
  updated in the Codex-side pass.
* 2026-09-02 — first real round, Codex reviewing this PR at
  dc716a5819342ff74f145e9bc6e9edb4108fe85e. Ten minutes, about 1.8M input tokens (1.6M cached), zero
  findings, two unverified, posted through the new poster as review 5090705253. The rival never
  called the broker: it ran Vitest in its own read-only sandbox, hit `EPERM` on
  `node_modules/.vite-temp`, and reported that as a handler decline. Its unverified list still named
  three real defects that landed as fixes — `gh api
  --paginate` without `--slurp` concatenates
  pages into non-JSON, the one retry after a pruned resume reused the exclusively-created log path,
  and a commit scope was keyed by the ref as typed rather than its OID. The rival prompt now says
  outright that the sandbox cannot escalate and that anything that writes goes through `run` the
  first time.
* 2026-09-02 — second real round at 57415c7b971bb02150e40bb132bfed0c67ddbd65. The resume failed
  first (`codex exec resume` rejects `--cd` with a usage error and filters recorded threads by
  directory, so the launcher now drops `-C` and passes `--all` on resume) and the launcher fell back
  to a fresh reviewer as designed. This time the rival used the broker three times, each request a
  self-contained repro under tmp, and every one was approved and run as the handler. Four blocking
  findings, all reproduced, all posted as anchored inline comments (review 5090878454), all fixed:
  the worktree install ran a PR-controlled `postinstall` (now `--ignore-scripts`, measured to keep
  sharp and esbuild working from the store), `broker next` handed out a stale request after the
  rival had exited (terminal files now win), the packet diff inherited `diff.context` (now
  `--unified=3` from the poster's constant), and a provisioning failure was invisible through `next`
  because `session.json` was written late (now written first). About twelve minutes and 1.8M input
  tokens, 1.7M of them cached.
* 2026-09-02 — Codex side rebuilt on the core. The launch flow lives in
  `tools/rival-agent/launch.mjs` behind a vendor adapter; each launcher is now only its CLI's pins.
  The Claude rival runs `--restricted` print mode with `Read`, `Grep`, `Glob`, and the broker. The
  installer copies the core and the package into `~/.local/libexec/splotch-rival-agent/` with a
  manifest every wrapper verifies, keeps `splotch-claude-review-publish.mjs` as an alias that
  declines every broker request (an orchestrated review has no handler to serve one), and removes
  the files earlier installers wrote. The installer is fixed to the canonical checkout, so it was
  not run from this worktree; the Codex-side path was exercised from the checkout with this Claude
  session serving as the handler.
* 2026-09-02 — Claude-rival smoke from the checkout, sonnet, this session as handler. Two defects
  before the rival started: the ledger key lacked the vendor, so the Claude launcher tried to resume
  the Codex thread recorded for the same PR (the key now includes the rival and `planRound` refuses
  the other vendor's record), and Claude's `--json-schema` validator refuses the draft 2020-12
  `$schema` key (stripped for Claude only). Once running, the prompt on stdin, restricted mode, the
  packet under `--add-dir`, and the broker all worked; the rival's first requests were cheap git
  reads, which is the broker-load asymmetry the plan review predicted showing up in practice. Eight
  requests in all, seven of them `git diff`/`git show` of a range the packet already held and one
  test run; every one approved. Zero findings, zero unverified, posted as review 5091158063. The
  rival prompt now names those git reads as requests it must not make. Cost: about 2.1M cache-read
  tokens and 20k output tokens on sonnet, roughly seven minutes.
* 2026-09-02 — first real Codex-native-handler round at a13c6212f2db1aac53746e676a2d95c7913b7f6f,
  Claude opus as the rival. Policy and health checks passed after installation; the health probe
  verified the manifest, and all eight legacy paths named by the installer were absent. The rival
  made three broker requests. One was a forbidden `wc` of the supplied packet and was declined; the
  other two were an approved parser repro plus tools tier and its approved targeted retry. The
  targeted rival-agent suite passed inside the temp-root worktree without escalation, including
  Vitest's `node_modules/.vite-temp` write.
* 2026-09-02 — Codex's 30-second `exec_command` yield is shorter than a 60-second `broker next`:
  each quiet wait returned a live handle and needed one follow-up poll before reporting `waiting`.
  The launcher handle survived throughout the broker loop, and sandboxed `tail` of its redirected
  stderr was sufficient to follow the rival's tools and requests. The broad brokered tools tier
  produced its parser output but did not finish after fourteen minutes, so the handler interrupted
  it, replied with exit 130 and the captured output, and accepted the rival's targeted retry.
* 2026-09-02 — the Claude rival posted five anchored comments as review 5092335442. Its reproduced
  diff-header parser defect, vendor-inaccurate local-shell prompt, overstated manifest prose, and
  stale ADR survived validation. Its resumed-session-id question did not: the orchestrated alias
  resumed round two with the same Claude session id, then adopted review 5092335442 without posting
  again. The alias completed normally while declining its one brokered tools-tier request.
* 2026-09-02 — added the checkout-only `gen:rival-acceptance` manual suite for real agent-to-agent
  testing, generating a question that can be given to either a Codex or Claude native handler. The
  first Codex-handler/Claude-rival run reported all six stages passing with exactly seven sequential
  broker requests and no extras: local packet read, random-token reply chaining, exit 23 with
  stdout/stderr plus recovery, 60,118-byte truncation with both boundary markers and an inert
  instruction, the earlier parser repro plus 8-file/68-test worktree-local Vitest run, and one real
  out-of-worktree decline accepted without retry. The suite remains outside `npm test` and CI.
* 2026-09-02 — the reciprocal Claude-handler/Codex-rival run made the same seven sequential
  requests, six approved and one declined, and reported the parser stage as FAIL: the template's
  `\\n` inside shell single quotes reached Node as two characters, so the shipped probe printed
  `[]`. The earlier Claude rival had rewritten the escape to `\n` on its way through the broker and
  so passed a stage the shipped command could not. The review of that run fixed the template and
  added a generator test that executes every filled stage command as shipped, printed the handler's
  brief beside the question path, added `--ignore-pnpmfile` to the worktree install (measured:
  `--ignore-scripts` alone still ran a committed `.pnpmfile.cjs`), moved the documented broker wait
  under the Bash tool's default timeout, and quoted the brokered command as one `bash -c` argument
  so a trailing shell comment cannot strand the reply.
