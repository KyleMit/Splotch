# Handoff — rival-agent hybrid stack

> 2026-09-02 · branch `claude/rival-agent-pilot-524082` · PR
> [#1579](https://github.com/KyleMit/Splotch/pull/1579) · Turn the rival-agent pilot into a three-PR
> stack: hybrid sandbox behind a flag, a seeded-defect bench that collapses the flag, and the Claude
> rival on the same shape

This packet is written for a session that has none of the conversation behind it. It carries every
decision, every rejected alternative, and every measured fact the work depends on. It is meant to be
run unattended overnight with the `create-stacked-prs` skill.

## Objective & non-goals

**Objective.** Rework `run-rival-agent` so each rival (the other vendor's CLI) runs inside its own
vendor's sandbox as the primary execution path, with the broker kept only as an escalation door, and
prove the default flip with a seeded-defect bench before collapsing the flag. Ship it as a stack of
three PRs with PR 1579 as the bottom.

**Vocabulary, fixed.** The *native handler* is the agent running in the current runner and holding
its permissions. The *rival agent* is the other vendor's CLI in a disposable worktree. From Claude
the rival is Codex; from Codex the rival is Claude. Never propose profile rungs, a broker allowlist
or denylist, or a command menu; all three were rejected when the pairing was built.

**Non-goals.**

* No ADR. Kyle wants ADRs reserved for product work; tooling decisions go in skill notes (memory:
  `adrs-product-only-tooling-in-skill-notes`).
* No hosted reviewers. `anthropics/claude-code-action` and Codex's GitHub integration are out of the
  architecture, ruled out with evidence below; do not add a workflow, a label, or a mention trigger.
* No web search for the Claude rival. Document the lack of parity; do not add it.
* No deletion of the Codex-side trusted install under `~/.local/libexec/splotch-rival-agent/`. It is
  the Keychain workaround (Codex's sandbox cannot read the Keychain holding the Claude login and the
  GitHub token), not a review-quality choice.
* Do not merge anything. Build the stack, link it, get CI green at the tip, mark PRs ready. Merging
  is Kyle's call.
* Do not rewrite history or force-push (denied in this permission mode). Do not run `npm install` or
  `npm ci`; pnpm installs, npm runs.
* Do not run the Codex-side installer (`npm run run-claude:install`); only Kyle does. The Codex-side
  package can be exercised from the checkout with this session as the handler, which is how it was
  proven originally.

## State

Branch `claude/rival-agent-pilot-524082`, pushed, clean working tree, four commits on top of main
(`94d15c2ca5be494df02f5cc4c48774e1492cc4a4`):

| sha                                      | what                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bea4a8399400f22434943fa3df71889be488817b | `--sandbox read-only\|workspace-write` flag (workspace-write = no broker), prompt partials, single-job hosted workflow, `claude-review` label, scratchpad note |
| 3467e28cbefe2a1bfc13587766facfd323c556f3 | Broker round's three findings: two-job workflow, private `TMPDIR` for the sandboxed rival, head check before posting                                           |
| c2e304cbc583e7fcccdeffdad71767a0a7c53f66 | Sandboxed round's findings: no spool liveness without a broker, `DPRINT_CACHE_DIR`, dash-named gate logs, exposure written into docs                           |
| 1e45ee07749093e2026b117411209dbdb7f64950 | Hosted runs 2 and 3 recorded, same-repo guard on the workflow                                                                                                  |

Files touched on the branch: `tools/rival-agent/{launch,prompt,spool}.mjs`,
`tools/rival-agent/rival-prompt.md`, `tools/rival-agent/rival-prompt-{broker,sandbox}.md` (new),
`tools/rival-agent/README.md`, `tools/rival-agent/tests/{launch,prompt}.test.mjs`,
`tools/tests/launch-codex.test.mjs`, `.claude/skills/run-rival-agent/scripts/launch-codex.mjs`,
`.claude/skills/run-rival-agent/SKILL.md`,
`.claude/skills/run-rival-agent/references/permissions.md`,
`.claude/skill-notes/run-rival-agent.md`,
`.agents/skills/run-rival-agent/scripts/install-run-claude.mjs` (`CORE_FILES` gained the two
partials), `.github/workflows/claude-review.yml` (new), `.github/labels.yml`,
`docs/scratchpad/rival-agent-simplification-2026-09-02.md` (new).

**PR 1579** is an open draft, mergeable, CI green (15 pass, 3 skipped) at 1e45ee077. Its body is the
pilot write-up with a recommendation that this packet supersedes. It carries the `claude-review`
label and two comments from `github-actions[bot]` (the hosted reviews); leave the comments, they are
evidence. Its fate: **keep it as the bottom of the stack**, rework it in place with new commits,
retitle, rewrite the body, remove the label, mark ready when done.

**Outside the repo.**

* GitHub label `claude-review` exists on the repository (created by hand; the `labels.yml` entry was
  added afterwards). Delete it with `gh label delete claude-review --yes` after removing the
  `labels.yml` entry and the label from PR 1579.
* Rival ledger records for this branch under `~/.config/splotch-rival-agent/ledger/` (three files).
  A `--base main` round on this branch would resume the sandboxed round's Codex thread as round 2.
  Use `--fresh` for any new comparison round, and `--end-session --base main` before the bench.
* Three rival session directories from tonight under `$TMPDIR/splotch-rival-agent/` and a probe
  worktree directory `$TMPDIR/splotch-rival-agent-probe-RSFRri/` (unregistered from git, files still
  on disk because the delete was denied). Housekeeping only; safe to remove.
* Nothing uncommitted. Session scratchpad files (probe logs, PR body drafts) are disposable.

## Decisions made (and why)

Each of these was argued out with Kyle on 2026-09-02. The reasons belong in
`tools/rival-agent/NOTES.md` (to be created in PR 1) so they are not re-litigated.

1. **The rival runs inside its own vendor's sandbox as the primary path; the broker is the escape
   hatch only.** Evidence: on the same real diff (this PR's first commit), the same Codex model
   (`gpt-5.6-sol`, high effort), the broker round produced 3 blocking findings in 5m47s with one
   handler turn and 1.40M input tokens (1.27M cached); the workspace-write round produced 4 (the
   same three plus one) in 7m20s with zero handler turns and 1.81M (1.68M cached), running 24
   commands itself. That is n=1 and inside model noise, which is why PR 2 exists; the structural
   evidence is that the sandbox boundary held everywhere probed.
2. **Hybrid, not sandbox-only.** Kyle wants the rival to be able to use the physical device rig
   (iPad and Android capture, see the `start-capture-session` skill and
   `docs/PROFILING-CAMPAIGNS.md`). The rig is host-exclusive, needs USB, the adb daemon, local port
   binding, and writes outside any worktree, so it cannot fit either vendor's sandbox. Options
   weighed and rejected: a bespoke Codex "rig profile" (a second sandbox profile to maintain, and no
   device lock exists, so a rival capture concurrent with the handler's produces plausible wrong
   numbers without error); a full-access rival via `--dangerously-bypass-approvals-and-sandbox`
   (loses the worktree boundary that makes two agents safe on one machine; Claude's unconfined
   sandbox pushed a branch into the canonical repository during probing); Claude as the device rival
   under its richer sandbox knobs (`allowLocalBinding`, `allowMachLookup`, `allowUnixSockets`; same
   contention problem, more pins). The broker as the door needs no new surface and the handler
   already owns the rig procedure. Also rejected: sandbox-only with rig evidence pre-captured into
   the packet (simplest, but the rival could not iterate on the device).
3. **The hybrid does not add a connection model.** Today's Codex rival already has two surfaces (its
   read-only shell plus the broker); the hybrid moves the line between them from "anything that
   writes" to "anything the sandbox refuses". The routing rule gets simpler: "run it here; if the
   sandbox refuses, ask", which also removes the first real round's failure mode of a rival
   reporting its own sandbox's `EPERM` as a handler decline.
4. **Findings-as-channel exposure accepted.** Both Codex sandboxes read the whole disk (measured:
   `~/.codex/auth.json` and the canonical checkout's `web/.env` readable; `sandbox_permissions=[]`
   changes nothing), and the rival's findings are posted verbatim, so a prompt injected through a
   diff could copy a credential into a finding. Accepted because every diff in this repository is
   authored by Kyle, his own Claude and Codex sessions, or Dependabot, and because the same shape
   exists in every unattended post his sessions already make. Rejected: a poster that refuses
   documents containing known credential bytes (maintenance debt for partial coverage); a
   credential-free account or container for the rival (the real fix if the threat ever becomes real;
   not now).
5. **The `/tmp` spool gap accepted under the same premise, knowingly distinct.** Codex's
   workspace-write sandbox always allows writes under `$TMPDIR` and `/tmp`; the spool lives at
   `os.tmpdir()/splotch-rival-agent/`. On macOS the private `TMPDIR` already on the branch removes
   the spool root from the rival's writable set (measured). On Linux `os.tmpdir()` is `/tmp`, which
   stays writable, so a sandboxed rival there could forge a request into a sibling session or
   corrupt its own audit log. That is an integrity threat, not exfiltration, needs an adversarial
   rival, and a forged request is still judged by the handler's permission system. Rejected: moving
   the spool into the handler's checkout (a real fix, moderate change; take it if Linux ever
   matters); refusing to launch when `os.tmpdir()` is `/tmp`. Document in NOTES.md as one accepted
   item with the integrity-versus-exfiltration sentence.
6. **Web search stays on for the Codex rival** (the branch's `web_search="disabled"` pin comes out),
   consistent with decision 4. The Claude rival has no web search under `--restricted` and does not
   get one; document the parity gap.
7. **Hosted reviewers are out.** Measured on PR 1579: a single-job `claude-code-action` review found
   none of three real defects the local rival found in the very workflow running it; a two-job
   version read the gate logs correctly and then raised a blocking finding on a premise GitHub rules
   out (fork PRs cannot reach repository secrets on `pull_request` events); the action restores
   `.claude/`, `CLAUDE.md`, `.mcp.json` and others from `origin/main` before Claude starts ("PR head
   is untrusted"), so it cannot see this repo's direct-provider packages, the thing
   `implement-issue-stack` needs reviewed. Neither vendor's hosted product sees uncommitted work, a
   free-form question about the checkout, the rig, or its own earlier findings (the local ledger
   resumes the same reviewer for three rounds). Codex's GitHub integration reviewed 45 PRs
   automatically until 2026-08-18 and can only be triggered by a comment or push, which a sandboxed
   Codex session cannot make; Kyle ruled it out. Keep the probe results in the scratchpad note as
   the reason not to revisit.
8. **Design history lives in `tools/rival-agent/NOTES.md`**, not in `.claude/skill-notes/` or
   `.agents/skill-notes/`, so neither provider is prioritized. The two provider notes stay as files
   (the direct-provider registry derives their paths; `mirror-skill-notes.mjs` preserves them in
   place) but shrink to a pointer plus what is genuinely handler-side-specific.
9. **The `--sandbox` flag lives for exactly one PR cycle (option C).** Options weighed: delete it
   now (no A/B possible afterwards, the flip rests on n=1); keep it permanently (two contracts to
   maintain, a knob nobody would use, the "second policy engine" smell); keep it until the bench has
   run, then collapse to the winner with evidence. C chosen. PR 1579 merges with default
   `read-only`, so nothing changes behaviour until PR 2.
10. **Sequencing.** PR 1 (1579): hybrid semantics under the flag, prompt, docs, notes, workflow
    removal. PR 2: bench plus collapse. PR 3: the Claude rival on the winning shape.

## Unverified assumptions

Test these first; each is believed, not measured.

* `web_search="disabled"` (the pin being removed) actually removed the tool; only its acceptance by
  `--strict-config` was measured. Moot once removed, but do not cite it as measured.
* Under the hybrid, the Codex rival will route correctly: run locally first, escalate only on
  sandbox refusal, and not file refusals as `unverified`. No round has run this exact shape. The
  first hybrid round on PR 1 is the test; read its stream log for `broker` lines versus
  `cmd failed`.
* The bench's seeded defects are detectable from the diff alone with a repro available in the
  worktree. Seeds that need the network or the rig are not valid seeds.
* Claude's `--settings` sandbox block confines a linked worktree with `denyWrite` on the canonical
  `.git` and `denyRead` on `~/.codex` (measured once on sonnet with one command each) and does not
  break the rival's own state under `~/.claude`. Do not `denyRead` `~/.claude`; the rival is Claude.
* Codex's `exec_command` ergonomics around a mostly idle broker loop (the Codex-handler side) are
  unchanged by the hybrid. Not re-exercised.
* `tools/ruler/tests/skill-notes.test.mjs` and `tools/tests/skill-spec-citations.test.mjs` tolerate
  a shrunk provider note. Run `npm run test:tools` after editing them.

## Done & verified

* Probe results, all on 2026-09-02, `codex-cli 0.149.1`, Claude Code 2.1.251, macOS. Full commands
  and outputs in `docs/scratchpad/rival-agent-simplification-2026-09-02.md`; do not re-run them.
  * Codex `workspace-write` rooted at the disposable worktree: targeted Vitest, `npm run check`, and
    `npm run build` pass; writes to home and the canonical checkout refused; `git commit` refused
    (the linked worktree's gitdir is under the canonical `.git`); DNS off; `$TMPDIR` and `/tmp`
    writable; with a private `TMPDIR`, the spool root becomes `Operation not permitted`;
    `format:check` passes once `DPRINT_CACHE_DIR` points inside the private `TMPDIR`.
  * Both Codex sandboxes read the whole disk; `sandbox_permissions=[]` does not restrict reads.
  * Claude sandboxed Bash in `--print` mode with
    `--settings '{"sandbox":{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false,"autoAllowBashIfSandboxed":true,"network":{"strictAllowlist":true,"allowedDomains":[]}}}'`
    under `--restricted --tools Read,Grep,Glob,Bash`: cwd and `--add-dir` writable, `$TMPDIR`
    writable, `/tmp` not, network denied by the proxy (403), reads of credentials allowed, and the
    canonical `.git` **writable** from a linked worktree (a `git push` to the canonical checkout
    created a branch). Adding
    `"filesystem":{"denyWrite":["<canonical .git>"],"denyRead":["~/.codex"]}` closed both while
    `git status` and Vitest kept working.
  * `codex sandbox` refuses `-C` without `--permission-profile`; use the process cwd as the root.
* Quality gates on 1e45ee077: `npm run test:tools` (160 files, 3349 tests), `lint`, `lint:dead`,
  `format:check`, `ruler:check` all pass. PR CI green.
* Two real Codex rounds and three hosted runs, recorded in the scratchpad note's "Rounds" section
  with usage, timing, and every finding.

## The stack

Use the `create-stacked-prs` skill: each PR branches from the previous PR's head and targets that
branch; only PR 1 targets `main`; no merge commits inside the chain; link the chain when all three
are open. Commit incrementally with messages that say why. Format Markdown with dprint before
committing (shell edits bypass the format hook). Escape `#`-numbers in PR bodies that are not
references; paste SHAs from `git rev-parse`, never retype them.

### PR 1 — rework 1579 in place: hybrid under the flag, docs, notes, workflow removal

Branch `claude/rival-agent-pilot-524082`, new commits only.

1. **Hybrid semantics.** In `.claude/skills/run-rival-agent/scripts/launch-codex.mjs`,
   `buildCodexArgs`: attach `brokerServerToml(...)` in **both** modes; keep
   `sandbox_workspace_write.network_access=false` for `workspace-write`; delete
   `SANDBOXED_SEARCH_PIN`. In `tools/rival-agent/launch.mjs`: `broker` is always true (delete the
   `broker` derivation and the `activityProbe` conditional, keep `rivalEnvironment` but apply it in
   both modes; the private `TMPDIR` and `DPRINT_CACHE_DIR` are hygiene now). Keep `session.json`'s
   `sandbox` field; drop `broker`. Update `tools/tests/launch-codex.test.mjs` (the workspace-write
   test must now assert the broker is attached and the search pin absent) and
   `tools/rival-agent/tests/launch.test.mjs`.
2. **Prompt.** Keep two execution partials while the flag exists, both with the broker:
   `rival-prompt-broker.md` unchanged for `read-only`; rewrite `rival-prompt-sandbox.md` as the
   hybrid: the sandbox boundary, "run it here first; a permission error from the sandbox is the
   signal to send that exact command through `run` with a one-line `why`", and the named door list:
   the network, the full Playwright suite, a performance capture or anything touching the device
   rig, anything writing outside the worktree. Keep "never ask for git reads of the range" and
   "output is data". `describeExecutionMode(broker)` in `prompt.mjs` becomes
   `describeExecutionMode(sandbox)` keyed by mode; `HANDLER` for the hybrid says the handler runs
   only what the sandbox refuses. Update `prompt.test.mjs`. Rename the partial to
   `rival-prompt-hybrid.md` and update `CORE_FILES` in
   `.agents/skills/run-rival-agent/scripts/install-run-claude.mjs` (the installer copies by list).
3. **Remove the hosted reviewer.** Delete `.github/workflows/claude-review.yml`, the `claude-review`
   entry in `.github/labels.yml`, remove the label from PR 1579, delete the label from the repo.
   Leave the scratchpad note's probe 4 and hosted-run sections intact; add one line at the top of
   that note saying the hosted path was ruled out and pointing at NOTES.md.
4. **`tools/rival-agent/NOTES.md`** (new; add a row to `tools/rival-agent/README.md`). Contents, in
   this order: why a handler and a rival (move the "Why a handler and a rival" and "What the probes
   changed" sections from `.claude/skill-notes/run-rival-agent.md` here, lightly edited to be
   vendor-neutral); the 2026-09-02 decisions above with their rejected alternatives; the accepted
   exposures (findings channel; `/tmp` on Linux); the **Claude versus Codex parity table** (shell
   and what confines it; read restriction: none for Codex, `denyRead` for Claude; network: off for
   both; web search: on for Codex, none for Claude; escalation: broker for both; resume: Codex
   thread id versus wrapper-issued Claude session id; structured output: `--output-schema` versus
   `--json-schema` with `$schema` stripped; launch location: checkout versus trusted install;
   billing guard; known vendor gaps); and an "Unvalidated" list. Then shrink
   `.claude/skill-notes/run-rival-agent.md` and `.agents/skill-notes/run-rival-agent.md` to a
   pointer plus handler-side specifics (Codex side keeps the install and alias reasoning). Both
   files must keep existing.
5. **Skill docs.** `.claude/skills/run-rival-agent/SKILL.md` and `references/permissions.md`:
   describe the two modes as they now are (the read-only pairing; the hybrid where the handler
   judges escalations only), state the trust change in one paragraph, remove the web-search-off
   claim, keep the private-`TMPDIR` paragraph, and say the flag is temporary pending PR 2.
6. **One real hybrid round** on this branch:
   `npm run --silent rival:launch -- --fresh --sandbox
   workspace-write --base main` in the
   background, serve `broker next` for any escalation, and record in the scratchpad note under a new
   "Round C" heading: turns, `cmd failed` versus `broker` lines, findings, usage. Fix real findings.
7. Gates: `npm run test:tools`, `lint`, `lint:dead`, `format:check`, `ruler:check`,
   `check:skill-refs`. Retitle the PR "Rival agent: sandbox-first Codex rival behind a flag, broker
   as the escape hatch"; rewrite the body to what landed plus a pointer to NOTES.md; mark ready for
   review.

### PR 2 — seeded-defect bench, then collapse the flag

Branch off PR 1's head, e.g. `claude/rival-agent-bench`.

1. **Corpus** under `tools/rival-agent/bench/seeds/`. One seed per real defect the rival found while
   the pairing was built (each has a fixing commit in the history of PR 1575/1576 and the scratchpad
   `rival-agent-pairing-2026-09-02.md` build log; find them with `git log --grep` and `git log -S`):
   `gh api --paginate` without `--slurp` concatenating pages; the pruned-resume retry reusing the
   exclusively-created log path; a commit scope keyed by the ref as typed; the worktree install
   running a PR-controlled `postinstall`; `broker next` handing out a stale request after the rival
   exited; the packet diff inheriting `diff.context`; `session.json` written late; the diff-header
   parser defect in the acceptance template; the `\n` escape inside shell single quotes. Each seed
   is a patch that reintroduces the defect, plus an answer key: `path`, expected line range after
   the patch applies, severity floor, and the repro command. Add two or three clean patches as
   controls (a comment change, a test rename). Reject any seed whose repro needs the network or the
   rig.
2. **Runner** `tools/rival-agent/bench/run-bench.mjs` (`npm run rival:bench`, documented in
   `scripts-info`, never in CI or `npm test`): for each seed, create a throwaway branch and worktree
   from main, apply the patch, launch the rival on `--uncommitted` scope with `--fresh` and
   `--cwd <worktree>` for each mode, serve the broker loop itself (approve requests that stay inside
   the worktree, decline anything else, record both), collect `findings.json`, score recall by
   anchor match (path plus line inside the expected range or the finding body naming the repro),
   false positives on controls, `unverified` count, usage, turns, wall clock. Two repetitions per
   cell. `--end-session` afterwards so the ledger stays clean. Write a table to
   `docs/scratchpad/rival-agent-bench-<date>.md` and the summary into NOTES.md. Rounds run
   sequentially: 9 seeds × 2 modes × 2 reps at six to seven minutes each is about four hours of plan
   usage; that is the overnight budget.
3. **Collapse.** If the hybrid's recall is at least the broker's and its handler turns are lower,
   delete `read-only`: the flag, `rival-prompt-broker.md`, `LOCAL_TOOL_BOUNDARY`, the mode branches
   in `launch.mjs`, `prompt.mjs`, and the tests, and the `CORE_FILES` entry. If not, delete the
   sandbox path instead and say why in NOTES.md. Either way the acceptance suite changes: under the
   hybrid the Vitest stage runs locally and produces no broker request, so regenerate the stage
   templates in `tools/rival-agent/acceptance/` and the handler brief in `gen-acceptance-suite.mjs`
   so the expected request list is the escalation and decline stages only; its test executes every
   stage command as shipped.
4. Gates, PR body with the bench table, ready for review.

### PR 3 — the Claude rival on the winning shape

Branch off PR 2's head, e.g. `claude/rival-agent-claude-sandbox`. Edit only the registered
Codex-side package (`.agents/skills/run-rival-agent/`) and the shared core.

1. In `.agents/skills/run-rival-agent/scripts/launch-claude.mjs`: `--tools Read,Grep,Glob,Bash`,
   `--allowedTools` adding `Bash`, and a `--settings` JSON with the sandbox block above plus
   `"filesystem":{"denyWrite":[<canonical .git>],"denyRead":["~/.codex", <canonical web/.env and the
   native signing files named in .worktreeinclude>]}`.
   Compute the canonical `.git` from `git rev-parse --git-common-dir` in the repo root passed to the
   launcher. Keep `--restricted`, `--strict-mcp-config`, the broker, `MCP_TOOL_TIMEOUT`, `--add-dir`
   for the packet, the wrapper-issued session id. Add the `sandboxedToolBoundary` text for Claude
   ("your Bash is sandboxed to this worktree, network off; a permission error is the signal to use
   `run`"). Update `tools/tests/launch-claude.test.mjs`.
2. `claude-health.mjs` and the installer: no new files unless the core gained any; bump nothing
   unless the manifest logic requires it (read `install-run-claude.mjs` first).
3. Prove it from the checkout with this Claude session as the handler, the way the original build
   did (see the pairing scratchpad's Codex-side entries): a Claude rival round on `--uncommitted` in
   this checkout through `node .agents/skills/run-rival-agent/scripts/launch-claude.mjs`, then the
   bench corpus on the Claude rival, one repetition, recorded beside the Codex numbers. Read the
   stream log for `tool error` lines naming a sandbox denial.
4. Update NOTES.md's parity table with what was measured, the Codex-side `SKILL.md` and its
   references, and the Codex-side skill note. State plainly that the installed copy under
   `~/.local/libexec` is stale until Kyle runs `npm run run-claude:install`, and that the alias
   `splotch-claude-review-publish.mjs` gains empirical reviews for free once he does (it still
   declines every broker request).
5. Gates, ready for review, link the three PRs as a stack.

## Risks & next 3 steps

Risks: the hybrid rival ignoring the door or overusing it (read Round C's log before building PR 2
on it); bench seeds that are not detectable from the diff (drop them rather than lowering the bar);
plan usage from about forty Codex rounds overnight; the Claude sandbox settings behaving differently
on opus than on the sonnet probe.

1. Start PR 1 with step 1 (hybrid semantics and tests), then steps 2 to 5, then Round C.
2. Open PR 2's branch from PR 1's head and build the corpus before the runner; validate every seed's
   repro fails on the seeded tree and passes on main.
3. Run the bench, collapse, then PR 3.

Completion condition: three open, linked, ready-for-review PRs with CI green at the tip;
`tools/rival-agent/NOTES.md` carrying the decisions, rejections, exposures, parity table, and bench
results; the `claude-review` workflow and label gone; this handoff deleted.

## Reread first

* `docs/scratchpad/rival-agent-simplification-2026-09-02.md` — every probe, round, and hosted run
  with commands and numbers.
* `docs/scratchpad/rival-agent-pairing-2026-09-02.md` — the pairing's plan review and build log; the
  nine real defects for the bench corpus are its build entries.
* `.claude/skill-notes/run-rival-agent.md` and `.agents/skill-notes/run-rival-agent.md` — the
  reasoning to move into NOTES.md.
* `tools/rival-agent/README.md`, `launch.mjs`, `prompt.mjs`, `spool.mjs`, `broker.mjs`,
  `findings.schema.json`, `gen-acceptance-suite.mjs`.
* `.claude/skills/run-rival-agent/scripts/launch-codex.mjs` and
  `.agents/skills/run-rival-agent/scripts/{launch-claude,install-run-claude}.mjs`.
* `tools/ruler/lib/direct-provider-skills.mjs` and `tools/ruler/mirror-skill-notes.mjs` — why the
  provider note files must keep existing.
* Skills: `create-stacked-prs`, `run-rival-agent`, `start-capture-session` (for the rig wording),
  `testing`.
* Root `CLAUDE.md` sections "Concurrent worktrees" and "Writing on GitHub".
