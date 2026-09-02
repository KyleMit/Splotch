# Rival agent simplification — pilot probes and rounds (2026-09-02)

Working notes for the pilot that asks whether two hand-rolled layers of `run-rival-agent` can be
replaced by things the vendors ship. The pairing itself and its build log are in
`rival-agent-pairing-2026-09-02.md`; this note records only what the pilot measured. Vocabulary is
unchanged: the **native handler** runs in the current runner and holds its permissions; the **rival
agent** is the other vendor's CLI in a disposable worktree.

The two layers under test:

* **Layer 1, the broker and handler loop.** The rival cannot execute anything; the handler polls a
  spool and runs each command for it. Candidate substitute: a real shell inside a sandbox scoped to
  the disposable worktree with the network off, so the rival verifies its own claims.
* **Layer 2, the Codex-side trusted install** under `~/.local/libexec/splotch-rival-agent/`, which
  exists because Codex's sandbox cannot read the Keychain holding the Claude login and the GitHub
  token. Candidate substitute: the hosted first-party reviewers (`anthropics/claude-code-action` and
  the Codex GitHub integration).

Versions: `codex-cli 0.149.1`, Claude Code 2.1.251, macOS. Every probe below was run, not read from
documentation, unless it says otherwise.

## Probe 1 — Codex `workspace-write` confined to the disposable worktree

Model-free, using `codex sandbox`, in a worktree created by the launcher's own `worktree.mjs` at
main (`94d15c2ca5be494df02f5cc4c48774e1492cc4a4`, install included, 4.3 s). Note `codex sandbox`
refuses `-C` without `--permission-profile`; the working root is the process cwd instead.

```sh
cd "$WT" && codex sandbox -c 'sandbox_mode="workspace-write"' -- bash -c '…'
```

| Command                                                        | Result                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npx vitest run --config tools/vitest.config.mjs …ledger.test` | 3 passed; `node_modules/.vite-temp` write allowed                                          |
| `touch ./probe-inside`                                         | ok                                                                                         |
| `touch ~/probe-outside`                                        | `Operation not permitted`                                                                  |
| `touch /Users/kylemit/Code/Splotch/probe-outside`              | `Operation not permitted`                                                                  |
| `touch "$TMPDIR/probe"` and `touch /tmp/probe`                 | both allowed — the temp root, where the session spool lives, is writable                   |
| `git commit --allow-empty`                                     | `Unable to create '…/Splotch/.git/worktrees/worktree/index.lock': Operation not permitted` |
| `curl -sS -m 5 -I https://example.com`                         | `Could not resolve host` — network off by default                                          |
| `npm run --silent check`                                       | `1609 FILES 0 ERRORS 0 WARNINGS` in 4.9 s                                                  |
| `npm run --silent build`                                       | exit 0, bundle budgets printed, 4.9 s wall                                                 |

**Holds.** Tests, type check, and build run without escalation; writes outside the worktree and the
temp root are refused; a commit is refused because a linked worktree's gitdir lives under the
canonical checkout's `.git`, which is outside the writable root. The one soft spot is the temp root:
the rival can write into its own session directory and every sibling session's. Both rival rounds
below turned that into a blocking finding; the launcher now gives the sandboxed rival a private
`TMPDIR` inside its session (measured afterwards: the spool root is unwritable from there) and stops
reading the spool for liveness when no broker is attached.

## Probe 2 — both Codex sandboxes read the whole disk

```sh
codex sandbox -c 'sandbox_mode="read-only"'      -- wc -c ~/.codex/auth.json      # 3944
codex sandbox -c 'sandbox_mode="workspace-write"' -- wc -c ~/.codex/auth.json     # 3944
codex sandbox -c 'sandbox_mode="workspace-write"' -- wc -c /Users/kylemit/Code/Splotch/web/.env   # 975
codex sandbox -c 'sandbox_mode="workspace-write"' -c 'sandbox_permissions=[]' -- wc -c ~/.codex/auth.json  # 3944
```

**Confirmed, and there is no read restriction to reach for:** `sandbox_permissions=[]` changes
nothing. So the disposable worktree omitting `.worktreeinclude` secrets protects nothing against a
Codex rival on either path; it only keeps the secrets out of the diff packet.

**Decision on web search.** The read-only pairing path keeps web search on, as before; its shell
cannot write and every execution passes through the handler, and the exposure is now written down in
`references/permissions.md`. The workspace-write path pins `web_search="disabled"`: the diff under
review is untrusted input, the sandbox reads every file on the disk, and web search would be the one
outbound channel a prompt injected through the diff could carry a file out on. The key is real —
`codex exec --strict-config` accepts a config with `web_search = "disabled"` and rejects
`web_search_bogus_key` as an unknown field — but whether the pin removes the tool from the model's
list was not observed directly (`codex debug prompt-input` does not render tools). The network pin
`sandbox_workspace_write.network_access=false` restates the measured default explicitly.

## Probe 3 — Claude Code's sandboxed Bash in print mode

Settings from the current sandboxing docs (`code.claude.com/docs/en/sandboxing`), supplied on the
command line, which `--restricted` honours (it ignores settings *files*, not `--settings`):

```sh
claude -p --restricted --permission-mode dontAsk --tools Read,Grep,Glob,Bash \
  --allowedTools Read,Grep,Glob,Bash --strict-mcp-config --no-chrome --model sonnet \
  --add-dir "$PACKET" --settings '{"sandbox":{"enabled":true,"failIfUnavailable":true,
  "allowUnsandboxedCommands":false,"autoAllowBashIfSandboxed":true,
  "network":{"strictAllowlist":true,"allowedDomains":[]}}}' "<run one command, echo it back>"
```

Round one, no filesystem overrides (12.5 s, two turns, $0.04 of plan usage):

| Command                                     | Result                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `touch ./probe-inside`, `touch $PACKET/…`   | ok, ok — cwd and `--add-dir` writable                          |
| `touch ~/probe-outside`, canonical checkout | `Operation not permitted`                                      |
| `touch $TMPDIR/probe` / `touch /tmp/probe`  | ok / `Operation not permitted` — session temp only, not `/tmp` |
| `wc -c ~/.codex/auth.json`, `…/web/.env`    | readable, same as Codex                                        |
| `curl -I https://example.com`               | `CONNECT tunnel failed, response 403` — the proxy denies       |
| targeted Vitest                             | 3 passed                                                       |
| `git commit --allow-empty -q`               | **succeeded** — see below                                      |

Round two, following that commit: `git update-ref` in the canonical checkout succeeded,
`touch
/Users/kylemit/Code/Splotch/.git/rival-probe-file` succeeded, and
`git push /Users/kylemit/Code/Splotch
HEAD:refs/heads/rival-sandbox-push` created a branch there
(all removed afterwards). Claude's sandbox resolves a linked worktree's gitdir and grants write
access to the **whole** canonical `.git`, which Codex's sandbox refuses. A Claude rival confined
only by the defaults can write refs and objects into the shared repository.

Round three, with
`"filesystem":{"denyWrite":["/Users/kylemit/Code/Splotch/.git"],"denyRead":["/Users/kylemit/.codex"]}`
added: `update-ref` → `cannot lock ref … Operation not permitted`; `git status --short` still exits
0; `ls ~/.codex` → `Operation not permitted`; targeted Vitest still passes.

**Holds with two explicit deny lists**, not with the defaults. A Claude-rival sandboxed path would
have to pin `denyWrite` on the canonical `.git` and `denyRead` on the credential directories, and
the launcher would have to compute both from the repo root. Also observed: the sonnet rival refused
one probe outright as a credential-reading trap before the sandbox was consulted, which is a model
judgement the design cannot rely on but should not be surprised by. The Claude-side launcher does
**not** get the flag in this pilot; it is refused with
`the claude rival has no workspace-write
launch path`.

## Probe 4 — the hosted first-party reviewers

**4a, `anthropics/claude-code-action` running the tests.** `CLAUDE_CODE_OAUTH_TOKEN` exists in both
the Actions store (2026-07-16) and the Dependabot store (2026-07-28), so a non-Dependabot workflow
can use it. `.github/workflows/claude-review.yml` was added on this PR: label-gated
(`claude-review`, declared in `.github/labels.yml`), `pull_request: [labeled]` so the workflow file
runs from the PR head and can be exercised on the PR that introduces it, `setup-pnpm` with the
install, and an `allowedTools` list that admits the targeted test runners, `npm run check`, the lint
gates, and `gh pr comment` as the only GitHub write. Whether it runs the tests under the token is
the part the pilot PR itself exercises; see the rounds section below.

**4b, the Codex GitHub integration.** Already installed: `chatgpt-codex-connector[bot]` has
commented on 45 PRs in this repository. Every one was an automatic review posted after the last push
(`### 💡 Codex Review … automated review suggestions`, e.g. PR 1134 at 2026-08-18T21:05Z, reviewing
commit `ae4129577a`), with no `@codex` trigger comment. The activity runs from PR 289 (2026-07-16)
to PR 1134 (2026-08-18) and then stops; 278 PRs have been opened since with none. So the integration
is enabled at the account level but automatic reviews are off, or were turned off on 2026-08-19.
Turning them back on, or confirming the `@codex review` mention path, is an account setting on
chatgpt.com that only the account owner can change; it was not changed here.

## The flagged launcher path

`--sandbox read-only|workspace-write` on the shared launch arguments (default `read-only`, the
pairing). On `workspace-write` the Codex launcher attaches no broker, pins
`sandbox_mode="workspace-write"`, `sandbox_workspace_write.network_access=false`, and
`web_search="disabled"`, keeps every other pin, and the rival prompt swaps its execution section
(`rival-prompt-broker.md` → `rival-prompt-sandbox.md`) so a rival with a shell is never told about a
`run` tool it does not have, nor that its worktree is read-only. A vendor without a
`sandboxedToolBoundary` is refused before a worktree is provisioned. `session.json` records
`sandbox` and `broker`. Tests: `tools/rival-agent/tests/{launch,prompt}.test.mjs` and
`tools/tests/launch-codex.test.mjs`.

## Rounds

All three reviewers saw the same range, `94d15c2ca…bea4a8399` (this PR's first commit against main:
the launcher flag, the prompt partials, the single-job workflow, this note). The Codex rival was
`gpt-5.6-sol` at high effort, the same model both ways.

### Round A — Codex rival through the broker (the pairing as shipped)

`npm run --silent rival:launch -- --base main`, this session serving the broker. Six minutes
(15:26:18 → 15:32:05), twelve read-only shell commands of its own, **one** brokered request, three
blocking findings, zero unverified. Usage: 1,401,074 input tokens (1,270,784 cached), 14,076 output
(10,126 reasoning).

The one request bundled the three changed test files, `npm run check`, and a self-contained probe
under `mktemp -d` that ran `codex sandbox` in workspace-write mode and touched a file shaped like
`splotch-rival-agent/other/requests/1.json` in a sibling directory of the temp root. Approved and
run verbatim; the probe succeeded, which was the point. The findings:

1. **Blocking, the workflow.** The single credentialed job ran PR-controlled code (tests, tools)
   with a `GH_TOKEN` that held `pull-requests: write` and `issues: write`; every child process
   inherits it, so the `allowedTools` list bounding Claude's own `gh` use bounded nothing.
   `test.yml` runs the same code under `contents: read`. Correct, and the reason the workflow is now
   two jobs: `verify` installs and runs every gate under a read-only token and uploads the logs;
   `review` holds the credentials, installs nothing, and reads them.
2. **Blocking, the sandboxed path.** The workspace-write sandbox writes anywhere under the rival's
   `TMPDIR`, which is the spool root, so a sandboxed rival could forge a request into a concurrent
   brokered session for the handler to run. Reproduced by its own probe. Fixed by giving the
   sandboxed rival a private `TMPDIR` inside its session (`rivalEnvironment` in `launch.mjs`);
   measured afterwards with `codex sandbox`: the spool root is `Operation not permitted` while the
   private directory and `/tmp` remain writable. `/tmp` is the spool root on Linux and is left as a
   documented gap.
3. **Blocking, the workflow.** Nothing rechecked that the PR head still matched the event's head
   before posting, and a push during the job neither cancels nor re-triggers a `labeled`-only
   workflow. Fixed in the reviewer prompt: compare `gh pr view --json headRefOid` with the event
   head immediately before `gh pr comment`, and post nothing on a mismatch.

Not caught by anyone but found during the round: the `claude-review` label description in
`labels.yml` was over GitHub's 100-character limit, which `gh label create` refused; shortened.

### Hosted run 1 — `anthropics/claude-code-action`, single-job workflow

Run 33673253743 on the pilot PR, triggered by applying the label: nine and a half minutes, verdict
**NO BLOCKERS**, posted as one comment with the marker. What it establishes for probe 4a: the
Actions-store OAuth token works for a non-Dependabot event, the runner installed dependencies and
the reviewer ran `npm run check`, `format:check`, and the whole `tools/` Vitest tier itself, and the
comment landed through `gh pr comment` under the read-then-write `permissions` block.

Two things it also establishes, neither flattering:

* It did not find any of the three defects the Codex rival found in the same diff — including the
  token-inheritance defect in the very workflow that was running it.
* It reported two `launch-codex.test.mjs` failures and blamed "a pre-existing uncommitted local
  revert of `launch-codex.mjs`" in the checkout. The run log explains it: claude-code-action
  restores `.claude/`, `CLAUDE.md`, `.mcp.json`, `.claude.json`, `.husky` and a few more paths from
  `origin/main` before Claude starts (`PR head is untrusted`) and keeps the PR's copies under
  `.claude-pr/`. This repository keeps tested code under `.claude/skills/` (the direct-provider
  packages), so the reviewer's tree was the PR's tests against main's launcher. The two-job split
  runs the gates before the action can touch the tree, and the prompt now says where the PR's copies
  are.

### Round B — Codex rival in the workspace-write sandbox, no broker

`npm run --silent rival:launch -- --fresh --sandbox workspace-write --base main`, nothing for the
handler to serve. Seven minutes twenty (15:32:24 → 15:39:44, overlapping round A's tail and the
hosted run), twenty-four shell commands of its own (two failed), zero broker requests, four blocking
findings, one unverified. Usage: 1,814,091 input tokens (1,679,744 cached), 19,864 output (14,459
reasoning).

It ran the five focused test files (141 tests), `npm run check`, `npm run lint`, and `format:check`
itself, wrote its own repro scripts under the worktree, and found:

1. The token-inheritance defect in the workflow — the same as round A's first finding, with the
   added observation that it contradicts ADR-0081's rule that the privileged reviewer never executes
   checkout code.
2. The stale-head defect — the same as round A's third.
3. The spool defect from a different angle: not forging requests into a sibling session but
   corrupting its **own** session's control files, which the launcher still trusted. Its repro:
   malformed JSON in `requests/1.json` makes `spoolActivityAt` throw inside the watchdog. The
   private `TMPDIR` closes the write path; the launcher now also stops probing the spool for
   liveness at all when no broker is attached, so nothing in the session directory is read while a
   sandboxed rival runs.
4. **The channel nobody had written down.** With the network and web search off, the rival's own
   findings document is still an outbound channel: it is streamed to the handler and, for a PR
   scope, posted verbatim, and finding bodies accept arbitrary text. A prompt injected through the
   diff can copy `~/.codex/auth.json` into a plausible-looking finding. This is true of the
   read-only pairing path today as well — it reads the same disk and posts the same way — and no
   Codex sandbox setting closes it (probe 2). Not fixed here; see the recommendation.

Its one unverified item was `format:check`: dprint exited 12 trying to compile its plugin cache
under `~/Library/Caches`, outside the sandbox. The launcher now sets `DPRINT_CACHE_DIR` inside the
rival's private `TMPDIR`; measured with `codex sandbox`, `format:check` then passes.

### Hosted runs 2 and 3 — the two-job workflow

Run 2 (33674600075) ran all six gates in `verify` and then failed at the artifact upload:
`upload-artifact` rejects a colon in a file name, and the logs were named after the npm scripts
(`format:check.log`). Renamed with dashes. Run 3 (33675063475) on
`c2e304cbc583e7fcccdeffdad71767a0a7c53f66` succeeded end to end: `verify` 3m06s with every gate at
`exit=0` (3,349 tools tests, 2,180 unit tests), `review` 7m10s, one comment posted with the marker
and the head check. So the split works and the reviewer reads the logs as intended.

Its verdict was **BLOCKERS FOUND**, on one finding: because a `pull_request` event runs the workflow
file from the PR head, a fork PR could edit the workflow and, once a maintainer labels it,
exfiltrate `CLAUDE_CODE_OAUTH_TOKEN`. That is wrong: GitHub withholds repository secrets and write
scopes from a `pull_request` run triggered from a fork, so the secret resolves to nothing there —
the rule the *first* hosted run's own Unverified item had stated correctly. The reviewer listed
"whether this repository accepts fork PRs" as unverified, which was the wrong question. A
same-repository guard was added to the `verify` job's `if:` anyway, as explicit intent and to save
runner minutes; that guard is the one change to the workflow after run 3, and it was not run again.

Two hosted runs, then: one that missed three real defects in its own workflow, and one that raised a
blocking finding on a premise GitHub's documentation rules out. Neither found anything a local round
did not.

## Comparison

Same head, same Codex model both local rounds, one hosted Claude run.

| Reviewer                  | Wall clock | Handler turns | Input tokens (cached) | Output | Blocking findings, real | Ran the gates itself |
| ------------------------- | ---------- | ------------- | --------------------- | ------ | ----------------------- | -------------------- |
| A: Codex, broker          | 5m47s      | 1             | 1.40M (1.27M)         | 14.1k  | 3                       | via the handler      |
| B: Codex, workspace-write | 7m20s      | 0             | 1.81M (1.68M)         | 19.9k  | 4 (A's three plus one)  | yes, 24 commands     |
| Hosted Claude, single job | 9m30s      | 0             | not reported          | —      | 0                       | yes, in the action   |
| Hosted Claude, two jobs   | 10m16s     | 0             | not reported          | —      | 1 (premise wrong)       | yes, in `verify`     |

Round B cost about thirty percent more cached input than round A and produced a strictly better
review with no handler involvement. The hosted runs cost nothing local; one found nothing and its
runner tree was not the PR's for the paths that mattered, the other found one thing that was not so.

## Recommendation

**Layer 1, the broker and handler loop: retire it for the Codex rival, in favour of the
workspace-write path, once two things land.** The evidence is one pair of rounds on one diff, but it
points one way: the sandboxed rival verified more, found more, and needed no handler turn, and the
sandbox's boundary held everywhere it was probed except the two places this PR closed (the shared
temp root, the dprint cache). The two things:

* **Say the trust change out loud.** On the pairing path the handler judges every command; on the
  sandboxed path the handler's only decision is whether to launch, and Codex's Seatbelt profile is
  the whole policy. That is a different contract, and the skill text should say so rather than
  describing the sandbox as a stricter version of the same thing. The `--sandbox` flag's default
  should flip only when the skill and the notes have been rewritten around the new contract.
* **Close, or knowingly accept, the findings-as-channel exposure (round B, finding 4).** It is not
  specific to the sandboxed path, it is the pairing's exposure too, and no Codex setting closes it.
  The options are a credential-free account or container for the rival (the real fix), or a
  handler-side check that refuses to post a findings document containing the bytes of any known
  local credential (cheap, partial, and easy to add to `post-review.mjs`). Either is a decision for
  the owner, not the pilot.

Keep the broker for the Claude rival until its sandbox is pinned: Claude's default sandbox writes
into the canonical `.git` from a linked worktree (probe 3) and needs `denyWrite` on that path and
`denyRead` on the credential stores; the Codex-side launcher does not carry those pins yet.

**Layer 2, the Codex-side trusted install: keep it for now; the hosted substitute is not ready to
replace it.** The hosted Claude review works end to end — token, install, tests, comment — but on
this diff it found none of the three defects the local rival found, and claude-code-action's
restoration of `.claude/` from main means it cannot even see the PR's version of the direct-provider
packages that live there, which is precisely what `implement-issue-stack` asks it to review. The
two-job workflow is worth keeping as a cheap, no-install second opinion on ordinary PRs; it is not a
substitute for the alias contract until a run of it catches something a local round catches. The
Codex GitHub integration, the mirror image, is installed but has posted nothing since 2026-08-18;
whether to turn automatic reviews back on is an account setting for the owner.

**Not done here, on purpose:** no deletion, no default flip, no ADR. The decision this evidence
supports — retire the Codex-rival broker behind a stated trust change, keep the install — is worth
an ADR amendment to ADR-0058's trust-boundary note once the owner has made it.
