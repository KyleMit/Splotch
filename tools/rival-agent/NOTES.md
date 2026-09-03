# run-rival-agent — design notes for both packages

The vendor-neutral design history of `run-rival-agent`. Neither provider package is the primary one:
`.claude/skills/run-rival-agent/` makes Claude the **native handler** and Codex the **rival agent**,
`.agents/skills/run-rival-agent/` swaps the roles, and everything they share lives beside this file.
The two provider notes (`.claude/skill-notes/run-rival-agent.md`,
`.agents/skill-notes/run-rival-agent.md`) keep only what is specific to that runner being the
handler. Measurement records with commands and numbers are in
`docs/scratchpad/rival-agent-pairing-2026-09-02.md` (the rebuild) and
`docs/scratchpad/rival-agent-simplification-2026-09-02.md` (the sandbox pilot).

This file is deliberately not linked from either `SKILL.md`: a skill pays context for everything it
references, and this is for someone changing the pairing, not running it.

Vocabulary, fixed on 2026-09-02: the **native handler** is the agent running in the current runner
and holding its permissions; the **rival agent** is the other vendor's CLI in a disposable worktree.
There is one paired profile per side. Profile rungs, a broker allowlist or denylist, and a command
menu were each proposed and each rejected as a second policy engine; do not propose them again
without new evidence.

## Why a handler and a rival, not a read-only reviewer

The previous shape of this skill gave the other vendor's CLI a read-only sandbox and asked it to
review. It could read and it could run `git`, and that was all: it could not run a test, a type
check, or a repro, so every behavioural claim it made was an assertion. The Codex-side package had
gone the other way and given Claude its full tool set inside a disposable worktree under Auto mode,
which made its reviews empirical and made its permission story a second policy engine nobody could
inspect from the outside.

The pairing keeps the rival inside its own vendor's sandbox and adds one door: a broker MCP server
whose single tool asks the agent that launched it to run a command. The handler already holds every
permission the session has, and it already has a permission system — Claude's permission mode, the
project's deny rules, and the auto-mode classifier on one side; Codex's sandbox, exec policy, and
Auto-review on the other. So the broker holds no policy at all. It writes the request to a spool and
blocks; the handler reads it, runs the command verbatim through its own shell tool or declines with
a reason, and the answer flows back as data. A request the handler would refuse for itself is
refused for the rival.

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
* **`--safe-mode` disables `--mcp-config`** on Claude. The Claude rival runs `--restricted` instead.
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
`postinstall` before anyone had read the diff (`--ignore-scripts` and `--ignore-pnpmfile` now,
measured to keep the native modules working from the store); `broker next` handed a stale request to
the handler after the rival had exited; the packet diff inherited the developer's `diff.context` and
the poster would have accepted anchors GitHub then rejected; and a provisioning failure was
invisible through `next` because the session record was written late. The first round, running
blind, still surfaced `gh api --paginate` concatenating pages into non-JSON, the retry reusing an
exclusively-created log path, and a commit scope keyed by the ref as typed.

Re-running the skill on a change to this package remains the cheapest regression test it has, and
those defects are the seed corpus of the bench described below.

## The 2026-09-02 decisions

Each of these was argued out on 2026-09-02 with the repository owner, after the sandbox pilot. The
reasons are here so they are not re-litigated; the measurements are in the simplification note.

1. **The rival runs inside its own vendor's sandbox as the primary execution path; the broker is the
   escalation door.** On the same diff and the same Codex model, the brokered round produced 3
   blocking findings in 5m47s with one handler turn; the workspace-write round produced 4 (the same
   three plus one) in 7m20s with zero handler turns, running 24 commands itself. That is n=1 and
   inside model noise, which is why the bench exists. The structural evidence is that the sandbox
   boundary held everywhere it was probed.
2. **Hybrid, not sandbox-only.** The rival must be able to use the physical device rig (iPad and
   Android capture; see the `start-capture-session` skill and `docs/PROFILING-CAMPAIGNS.md`). The
   rig is host-exclusive, needs USB, the adb daemon, local port binding, and writes outside any
   worktree, so it fits neither vendor's sandbox. Rejected: a bespoke Codex "rig profile" (a second
   sandbox profile to maintain, and with no device lock a rival capture concurrent with the
   handler's produces plausible wrong numbers without error); a full-access rival via
   `--dangerously-bypass-approvals-and-sandbox` (loses the worktree boundary that makes two agents
   safe on one machine; Claude's unconfined sandbox pushed a branch into the canonical repository
   during probing); Claude as the device rival under its richer sandbox knobs (same contention
   problem, more pins); sandbox-only with rig evidence pre-captured into the packet (simplest, but
   the rival could not iterate on the device). The broker as the door needs no new surface, and the
   handler already owns the rig procedure.
3. **The hybrid does not add a connection model.** The Codex rival already had two surfaces (its
   read-only shell plus the broker); the hybrid moves the line between them from "anything that
   writes" to "anything the sandbox refuses". The routing rule gets simpler — run it here; if the
   sandbox refuses, ask — and the first real round's failure mode, a rival reporting its own
   sandbox's `EPERM` as a handler decline, no longer exists.
4. **Findings-as-channel exposure accepted.** See the accepted exposures below.
5. **The `/tmp` spool gap accepted, knowingly distinct.** See the accepted exposures below.
6. **Web search stays on for the Codex rival.** The pilot's `web_search="disabled"` pin on the
   sandboxed path came out with the hybrid, consistent with decision 4: with the findings document
   already an outbound channel, pinning search off closed nothing and cost the reviewer vendor
   documentation. Whether the pin removed the tool was never observed directly; only its acceptance
   by `--strict-config` was. The Claude rival has no web search under `--restricted` and does not
   get one; that is a parity gap, documented in the table below.
7. **Hosted reviewers are out.** Measured on the pilot PR: a single-job `claude-code-action` review
   found none of three real defects the local rival found in the very workflow running it; a two-job
   version read the gate logs correctly and then raised a blocking finding on a premise GitHub rules
   out (fork PRs cannot reach repository secrets on `pull_request` events); and the action restores
   `.claude/`, `CLAUDE.md`, `.mcp.json` and others from `origin/main` before Claude starts, so it
   cannot see this repository's direct-provider packages — the thing `implement-issue-stack` needs
   reviewed. Neither vendor's hosted product sees uncommitted work, a free-form question about the
   checkout, the rig, or its own earlier findings. Codex's GitHub integration reviewed 45 PRs
   automatically until 2026-08-18 and can only be triggered by a comment or push, which a sandboxed
   Codex session cannot make. The workflow and label were removed; the probe results stay in the
   simplification note as the reason not to revisit.
8. **Design history lives here**, not in either provider's skill note, so neither provider is
   prioritized. The two provider notes stay as files (the direct-provider registry derives their
   paths and `mirror-skill-notes.mjs` preserves them in place) and shrink to a pointer plus what is
   genuinely handler-side-specific. No ADR: ADRs are reserved for product decisions; tooling
   decisions live in notes beside the code.
9. **The `--sandbox` flag lives for exactly one PR cycle.** Rejected: deleting it at once (no A/B
   possible afterwards, the flip rests on n=1); keeping it permanently (two contracts to maintain, a
   knob nobody would use, the second-policy-engine smell). It stays until the seeded-defect bench
   has run, then collapses to the winner with evidence. The default stays `read-only` until then, so
   nothing changes behaviour before the bench.
10. **Sequencing.** One PR for the hybrid under the flag with these notes; one for the bench and the
    collapse; one for the Claude rival on the winning shape.

## The seeded-defect bench

The flip from n=1 to evidence. One seed per real defect the rival found while the pairing was built
(the list under "What the rival itself found", plus the diff-header parser defect and the `\n`
escape inside shell single quotes from the acceptance suite), each a patch that reintroduces the
defect on top of `main` with an answer key naming the path, the expected line range, a severity
floor, and a repro command that fails on the seeded tree and passes on `main`. Two or three clean
patches are controls. A seed whose repro needs the network or the rig is not a valid seed. The
runner launches the rival on each seed under each mode, serves the broker itself (approving requests
that stay inside the worktree, declining the rest, recording both), and scores recall by anchor
match, false positives on controls, unverified count, usage, turns, and wall clock. Its results are
recorded in this file when it has run.

## Accepted exposures

Both accepted on 2026-09-02 under the same premise: every diff in this repository is authored by the
owner, the owner's own Claude and Codex sessions, or Dependabot, and the same shape already exists
in every unattended post those sessions make.

* **The findings document is an outbound channel.** Both Codex sandboxes read the whole disk
  (measured: `~/.codex/auth.json` and the canonical checkout's `web/.env` readable;
  `sandbox_permissions=[]` changes nothing), the Claude sandbox reads everything not on a `denyRead`
  list, and the rival's findings are posted verbatim. A prompt injected through a diff could copy a
  credential into a finding. Rejected: a poster that refuses documents containing known credential
  bytes (maintenance debt for partial coverage); a credential-free account or container for the
  rival (the real fix if the threat ever becomes real; not now). Until then, read a rival's findings
  before trusting the post.
* **The `/tmp` spool root on Linux.** Codex's workspace-write sandbox always allows writes under
  `$TMPDIR` and `/tmp`, and the spool lives at `os.tmpdir()/splotch-rival-agent/`. On macOS the
  rival's private `TMPDIR` inside its session removes the spool root from its writable set
  (measured). On Linux `os.tmpdir()` is `/tmp`, which stays writable, so a sandboxed rival there
  could forge a request into a sibling session or corrupt its own audit log. That is an integrity
  threat, not exfiltration: it needs an adversarial rival, and a forged request is still judged by
  the handler's permission system before anything runs. Rejected: moving the spool into the
  handler's checkout (a real fix, moderate change; take it if Linux ever matters); refusing to
  launch when `os.tmpdir()` is `/tmp`.

## Claude versus Codex parity

What differs between the two rivals, as built. "Measured" means a probe was run on 2026-09-02;
anything else is read from the launcher.

| Aspect            | Codex rival (Claude handles)                                                                                                 | Claude rival (Codex handles)                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Shell             | Its own, confined by Codex's Seatbelt profile: `read-only`, or `workspace-write` rooted at the worktree with the network off | None under `--restricted`; `Read`, `Grep`, `Glob` only. A sandboxed Bash is the third PR of the stack                              |
| Read restriction  | None; `sandbox_permissions=[]` does not restrict reads (measured)                                                            | `--restricted` confines the file tools to the worktree and `--add-dir`; a sandboxed Bash needs `denyRead` on the credential stores |
| Writes            | Worktree, `$TMPDIR`, `/tmp` (measured); the canonical `.git` refused                                                         | Under a default sandbox the canonical `.git` is **writable** from a linked worktree (measured: a push landed); needs `denyWrite`   |
| Network           | Off: `sandbox_workspace_write.network_access=false`, DNS fails (measured)                                                    | Off by the sandbox proxy with an empty allowlist (measured: `403`)                                                                 |
| Web search        | On; a query is outbound traffic (accepted exposure)                                                                          | None under `--restricted`; not added                                                                                               |
| Escalation        | The broker, `run(command, why)`                                                                                              | The broker, the same tool                                                                                                          |
| Resume            | Codex thread id from `thread.started`; `exec resume --all` because the worktree moves                                        | Wrapper-issued session id (`--session-id`, then `--resume`); Claude reports none of its own                                        |
| Structured output | `--output-schema <file>`                                                                                                     | `--json-schema <json>` with the draft 2020-12 `$schema` key stripped (its validator refuses it)                                    |
| Launch location   | The checkout; Claude Code's Bash runs on the host                                                                            | A trusted install under `~/.local/libexec`, because Codex's sandbox cannot read the Keychain holding the Claude login              |
| Billing guard     | `auth_mode: "chatgpt"` in `~/.codex/auth.json`, API-key env stripped, provider and base URL pinned on the command line       | API-billing env refused (`ANTHROPIC_API_KEY`, Bedrock, Vertex, Foundry); `claude auth status` must report a plan login             |
| Isolation pins    | `--ignore-user-config`, `approval_policy="never"`, `--disable apps hooks browser_use …`                                      | `--restricted`, `--strict-mcp-config`, `--no-chrome`, `--permission-mode dontAsk`                                                  |
| Known vendor gaps | `codex sandbox` refuses `-C` without `--permission-profile`; the process cwd is the root instead                             | `--safe-mode` drops `--mcp-config`; the sonnet probe once refused a credential-reading command on its own judgement                |
| Orchestrated use  | None; a Claude session is always the handler                                                                                 | `splotch-claude-review-publish.mjs` declines every request; `implement-issue-stack` calls it by fixed path                         |

## Unvalidated

* Whether the hybrid rival routes as intended — runs locally first, escalates only on a sandbox
  refusal, and never files a refusal it did not escalate as `unverified`. The first hybrid round
  (Round C in the simplification note) is the test; read its stream log for `broker` lines against
  `cmd failed` lines.
* Whether the bench's seeded defects are all detectable from the diff with a repro available in the
  worktree. A seed that is not is dropped rather than the bar lowered.
* Whether Claude's `--settings` sandbox block, with `denyWrite` on the canonical `.git` and
  `denyRead` on `~/.codex`, behaves the same on opus as on the sonnet probe, and whether it leaves
  the rival's own state under `~/.claude` intact. Never `denyRead` `~/.claude`; the rival is Claude.
* Whether Codex's `exec_command` ergonomics around a mostly idle broker loop (the Codex-handler
  side) are unchanged by the hybrid. Not re-exercised; a Claude session cannot.
* The posting identity. Both sides post as the user's `gh` account with a hidden marker naming the
  rival and the range; nobody has yet had to tell a rival review from a human one at a glance.
* The economics at scale. Two full-diff rounds cost about 1.8M input tokens each, 1.7M of them
  cached, and ten to twelve minutes; a repo-wide question has not been tried.
* The ten-minute stall budget with nothing outstanding and the one-hour budget for a pending request
  are both set by argument rather than measurement. Neither has fired outside a test.
