# Run Rival Agent (Claude side: Claude handles, Codex rivals) — design notes

This is the Claude-side package of `run-rival-agent`. The Codex-side package, with its own note
under `.agents/skill-notes/`, has the roles swapped. The two sides share one name so shared prose
can reference the capability without knowing which runner it is on — each provider tree carries the
package in which *its* agent is the native handler and the *other* vendor's CLI is the rival. The
vendor-neutral half of both packages lives in `tools/rival-agent/`; this package is the Codex
launcher, the Codex billing guard, and the handler procedure in `SKILL.md`.

The working notes and every probe behind the 2026-09-02 rebuild are in
`docs/scratchpad/rival-agent-pairing-2026-09-02.md`. This note keeps the reasoning that should
outlive that log.

## Why a handler and a rival, not a read-only reviewer

The previous shape of this skill gave Codex a read-only sandbox and asked it to review. It could
read and it could run `git`, and that was all: it could not run a test, a type check, or a repro, so
every behavioural claim it made was an assertion. The Codex-side package had gone the other way and
given Claude its full tool set inside a disposable worktree under Auto mode, which made its reviews
empirical and made its permission story a second policy engine nobody could inspect from the
outside.

The pairing keeps the read-only rival and adds one door: a broker MCP server whose single tool asks
the agent that launched it to run a command. The handler already holds every permission the session
has, and it already has a permission system — Claude's permission mode, the project's deny rules,
and the auto-mode classifier here; Codex's sandbox and exec policy on the other side. So the broker
holds no policy at all. It writes the request to a spool and blocks; the handler reads it, runs the
command verbatim through its own Bash tool or declines with a reason, and the answer flows back as
data. A request the handler would refuse for itself is refused for the rival. That is the whole
design, and every alternative that was floated — a broker allowlist, a menu of permitted commands,
profile rungs from "ask" through "inspect" to "review" — would have been a second policy engine
again.

The first two real rounds are the argument for it. Round one, before the rival prompt said its
sandbox could not escalate, Codex tried Vitest locally, hit `EPERM`, and reported two unverified
claims — and still named three real defects it could not prove. Round two, with the prompt fixed, it
sent three self-contained repros through the broker, each was run, and it posted four blocking
findings, all reproduced, all real. Same reviewer, same diff; the difference was whether it could
ask.

## What the probes changed

Every item below was a plan the conversation had settled and a probe then overturned.

* **`mcp_servers={}` never worked.** A `-c` override of `mcp_servers` merges into the configured
  table. `codex mcp list -c 'mcp_servers={}'` still listed the user's Node REPL server, and a run
  with the old pins reported `mcp__node_repl__js` among its tools. Every "read-only" review to date
  had a Node REPL running outside the sandbox on its tool list. `--ignore-user-config` is the only
  pin that leaves the user's servers behind; auth still resolves from `CODEX_HOME`, and the
  configured `model` is read back and passed as `-m` because it goes with the rest.
* **MCP calls are auto-rejected under `approval_policy="never"`** unless the server sets
  `default_tools_approval_mode="approve"`. The `granular` policy's categories do not cover plain
  tool calls. Without this one key the broker attaches and every `run` fails.
* **Both CLIs time out a slow tool call.** Codex defaults to 60 s per MCP tool; Claude has
  `MCP_TOOL_TIMEOUT`. A brokered command waits for a handler turn plus the command, so both are
  raised to the pending-request budget, and the stream watchdog treats an unanswered request as
  activity for the same hour.
* **`--safe-mode` disables `--mcp-config`** on Claude. The rival there runs `--restricted` instead.
* **`codex exec resume` rejects `--cd`** and filters recorded threads by directory. Round two of the
  first real review exited 2 before its first event; resume now drops `-C` and passes `--all`.
* **Worktree provisioning is cheap** (one second plus three for a frozen install from the warm
  store), so a fresh worktree per round costs nothing worth designing around, and the rival's
  uncommitted scope can be a real commit made through a private index rather than a diff applied
  into a live tree.

## What the rival itself found

The rival reviewed its own pull request twice while the package was being built, and the second
round is the best evidence that the pairing works. Four blocking findings, each reproduced through a
brokered command and each fixed the same hour: the worktree install ran a PR-controlled
`postinstall` before anyone had read the diff (`--ignore-scripts` now, measured to keep the native
modules working from the store); `broker next` handed a stale request to the handler after the rival
had exited; the packet diff inherited the developer's `diff.context` and the poster would have
accepted anchors GitHub then rejected; and a provisioning failure was invisible through `next`
because the session record was written late. The first round, running blind, still surfaced
`gh
api --paginate` concatenating pages into non-JSON, the retry reusing an exclusively-created log
path, and a commit scope keyed by the ref as typed.

Re-running the skill on a change to this package remains the cheapest regression test it has.

## The billing guarantee

Unchanged from the previous shape and still enforced three ways, because a metered run looks
identical to a plan run: the stored login must be `auth_mode: "chatgpt"`, API-key environment
variables are stripped from the child, and `model_provider`, `cli_auth_credentials_store`, and
`openai_base_url` are pinned on the command line above any config file. Pinning rather than
validating is deliberate: validation has to enumerate every precedence layer, an override does not.
Any further precedence layer found later should be fixed the same way.

## Rounds

Sessions are keyed to checkout plus PR number, commit, or branch and resumed on later rounds, so a
later round is told which findings it already made, asked to check those were addressed first, and
told outright that no defects is a correct answer. Three rounds is the budget, inherited from the
Codex-side publisher's ledger. `codex exec` spawns a child thread under a thin parent and only the
parent id reaches the stream; the parent carries the verdicts and is what the ledger records.

## Unvalidated

* Whether the broker earns its place against a sandbox. The 2026-09-02 pilot
  (`docs/scratchpad/rival-agent-simplification-2026-09-02.md`) added `--sandbox workspace-write`,
  under which the Codex rival runs its own commands in a network-off Seatbelt profile rooted at the
  worktree and no broker is attached. On one diff it found strictly more than the brokered round
  with no handler turn, and it named an exposure both paths share: the findings document is an
  outbound channel from a rival that can read the whole disk. The pilot's recommendation is to
  retire the broker for the Codex rival behind a stated change of trust contract, once that channel
  is closed or knowingly accepted. Nothing was retired.
* The posting identity. Both sides post as the user's `gh` account with a hidden marker naming the
  rival and the range. Nobody has yet had to tell a rival review from a human one at a glance on the
  PR page; the marker is machine-readable, not visible.
* The economics at scale. Two full-diff rounds on this package cost about 1.8M input tokens each,
  1.7M of them cached, and ten to twelve minutes. A review of a small diff should cost far less; a
  repo-wide question has not been tried.
* The ten-minute stall budget with nothing outstanding and the one-hour budget for a pending request
  are both set by argument rather than measurement. Neither has fired outside a test.
