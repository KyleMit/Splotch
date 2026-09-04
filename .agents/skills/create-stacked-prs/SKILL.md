---
name: create-stacked-prs
description: Ship a multi-issue campaign as a stack of sequential pull requests — each PR based on the branch below it — then link the chain into a GitHub stack, judge CI at the tip, and merge the whole chain as one unit when asked. Use when several related issues or a multi-part change ship together, when asked to open stacked or sequential PRs, or when an existing chain of open PRs needs linking, verifying, or merging.
---

# Create stacked PRs

A campaign that touches several issues ships as a **stack**: each PR branches off the previous PR's
head and targets that branch as its base. Only the bottom of the stack targets `main`.

```text
PR A  ->  main
PR B  ->  PR A's branch
PR C  ->  PR B's branch
PR D  ->  PR C's branch     (top of stack)
```

Each PR's diff is then only its own change, later work builds on earlier work instead of conflicting
with it, and the whole chain merges before `main` has a chance to drift. If the campaign is the only
work in flight, **no rebasing should be necessary at any point**.

`gh pr diff <n>` shows only that PR's own change, because its base is the parent branch. Review and
reason about each PR against that, never against `main`.

**Do not merge anything unless the user asks.** Building the stack and merging it are two separate
requests; the default outcome of this skill is an open, linked, reviewable chain.

## What a GitHub stack requires

These are hard requirements of the merge, not style preferences. Every one of them is satisfied for
free if the stack is built as described above and never amended mid-chain:

* **Same repository.** Cross-fork stacks are not supported.
* **Each PR's base is the branch below it**, and the bottom PR's base is the trunk.
* **Linear history between every branch** — no merge commit anywhere inside the stack.
* Stacked PRs are in public preview, and are not supported in GitHub Desktop.

There is no documented or enforced maximum stack size — a 13-PR chain linked in a single command.

## Rules

* **Never add a commit to a PR once a PR sits above it.** This is the rule the whole shape depends
  on. Branch C was cut from B's head; a commit appended to B makes B no longer an ancestor of C,
  which breaks the linear-history requirement and forces a cascade of rebases up the stack. When you
  find a problem in A, B, or C — your own or from review — **do not fix it in place.** Ship the fix
  as a new commit in the PR at the top of the stack. **Nothing enforces this.** A pre-push hook used
  to check it against the live open-PR graph and was removed for the friction it caused, so the rule
  now rests entirely on whoever is pushing. Before pushing any branch, confirm it is not the base of
  another open PR.
* **Plan the sweep-up PR.** The final PR collects every surviving issue from the earlier ones in one
  pass. Expect to write it; plan for it rather than treating it as a failure. One carve-out: a
  finding against a **performance-gate or calibration change** is fixed in an immediate child of the
  PR that introduced it, accepting the rebase cascade — see "Gate-semantics changes ship as their
  own campaign" in `docs/PROFILING-CAMPAIGNS.md`.
* **Open each PR as soon as its first commit lands.** Do not batch them to the end — an unopened PR
  is invisible to review and to CI.
* **Order the stack so cheap, unblocked work sits at the bottom.** Anything above a stuck PR is
  stuck with it. Put risky, slow, or dependency-heavy work near the top.
* **Name what each PR closes** in its body — `Fixes #123`. That is a deliberate issue reference, so
  it stays unescaped; escape every *other* bare `#`-number per the root `CLAUDE.md`.

## Mechanics

**Use the runner's native GitHub capability first.** Creating a PR, listing PR bases, and reading a
head SHA are all operations the native GitHub skill and its MCP/app tools perform, and the root
`CLAUDE.md` requires that path before the `gh` CLI — a sandboxed `gh` cannot reach the host's
Keychain credentials, so a procedure that hardcodes it can fail before the stack is even built. The
`gh` invocations below are the fallback, and the precise statement of what to ask the native tool
for. `gh stack` is the one genuine exception: nothing native covers it (the REST surface underneath
it is in the Notes).

Create each PR against the branch below it:

```bash
git checkout <previous-branch>
git checkout -b <new-branch>
git push -u origin <new-branch>
```

Then open the PR **with its base set to `<previous-branch>`** — the native create-PR tool, or as a
fallback `gh pr create --base <previous-branch> --title "…" --body-file <path>`.

An ordinary `git push` is valid only for the stack tip. After an intentional `gh stack rebase`, do
not call `gh stack push` directly; publish through:

```bash
npm run stack:push:rebased
```

A rebase may rewrite commit identities, but it must leave every lower PR's *content* untouched, and
a bare `gh stack push` will publish one that does not. That wrapper reads the live PR head/base
identities, compares each lower PR's original patch against the patch its rebased branch now
carries, and refuses to push when any differs — naming the PR. It checks exactly the PRs another
open PR is based on; the tip is excluded, because new commits legitimately land there.

A refusal means the rebase changed that PR's content — the no-commits-below rule broken by another
route. Put the change in a new commit at the tip instead.

Branches follow the repo convention — `claude/issue-<NN>-<slug>`. When falling back to the CLI, use
`--body-file`, not `--body`, for anything longer than a sentence: a body containing backticks, `$`,
`*`, or quotes is mangled by shell expansion, and the failure arrives after you have written the
whole thing (a native tool takes the body as a parameter and has no such hazard). Follow the
`pr-screenshots` skill for any PR that touches something visible in the UI, and give each PR the
rich body the `burn-down-backlog` skill describes — summary, why, what changed, approach, testing,
follow-ups — plus its position in the stack.

Verify the chain after creating each PR — read every open PR's head and base branch, natively or
with the CLI. A wrong base is easy to miss and expensive later:

```bash
gh pr list --state open --limit 50 --json number,headRefName,baseRefName \
  --jq '.[] | "\(.number)\t\(.headRefName)\t<- \(.baseRefName)"' | sort -n
```

Then prove the chain is genuinely linear. Run this in **bash** — the repo's default shell is zsh,
which does not word-split an unquoted string variable, so a `for b in $chain` loop silently runs
once with the whole string and prints nothing:

```bash
#!/bin/bash
chain=(origin/main origin/branch-a origin/branch-b origin/branch-c)   # bottom → top
prev=""
for b in "${chain[@]}"; do
  [ -n "$prev" ] && { git merge-base --is-ancestor "$prev" "$b" \
    && echo "ok    ${prev#origin/} -> ${b#origin/}" \
    || echo "BREAK ${prev#origin/} -> ${b#origin/}"; }
  prev=$b
done

git rev-list --count --merges origin/main..origin/branch-c   # expect 0

mb=$(git merge-base origin/main origin/branch-a)
[ "$mb" = "$(git rev-parse origin/main)" ] \
  && echo "main is exactly the fork point" \
  || echo "main moved ahead by $(git rev-list --count "$mb"..origin/main)"
```

If `main` has moved ahead far enough to matter, reconcile before merging — the `reconcile-with-main`
skill hunts the semantic conflicts a clean merge hides.

## Generated and shared artifacts

A strictly linear stack already contains its predecessors, so **regenerating in the PR that changed
the inputs does not conflict with anything above it** — and each PR stays self-consistent for its
own CI run. In this repo that means:

* Edited `.ruler/**`? Run `npm run ruler:apply` and commit the generated output in the **same** PR.
  `npm run ruler:check` is a per-PR drift gate, so a source-only PR is red on its own.
* Changed `package.json` dependencies? Commit the `pnpm-lock.yaml` change from `pnpm install`
  alongside it — never `npm install`, which writes a competing `package-lock.json` (ADR-0119).

The one-regeneration-PR rule bites when the campaign is **not** strictly linear — parallel branches
off `main` — or when the artifact is a whole regenerated tree large enough to swamp several diffs.
Then put the regeneration in **one** PR, normally the top of the stack, and say so in the bodies of
the PRs whose inputs feed it. Parallel edits to one generated artifact produce exactly the conflicts
stacking exists to avoid.

## CI will be red mid-stack — first check whether that is survivable here

An export added in PR 3 and consumed in PR 5 fails a dead-code check on PRs 3 and 4 only. A fix
shipped downstream instead of amending leaves the PR that introduced the problem red until the stack
merges in order. Whether that is acceptable is a property of the **base branch**, not of stacks, so
establish it before relying on it:

```bash
gh api repos/{owner}/{repo}/rules/branches/main --jq '.[].type' | sort -u
```

**If the base requires status checks, every PR in the stack must satisfy them.** GitHub evaluates
branch protection and rulesets for each included PR when the merge runs, and bypassing them is not
supported for stacks — admin privileges do not override it. A red lower PR then blocks the atomic
merge, and a fix parked in the tip can never turn that lower check green. There the fix belongs in
the layer that broke it, followed by a cascade rebase-and-push of every branch above — exactly the
cost the no-commits-below rule exists to avoid, and the reason to check this before choosing where
fixes go. Publish that exceptional cascade with the patch check above, since it rewrites lower PRs
by design.

`main` in this repo requires no status checks (its rules are `deletion` and `non_fast_forward`
only), which is what makes the downstream-fix discipline workable here.

Where mid-stack red is survivable, it still looks like neglect, so say so explicitly:

* Note in the affected PR (or its tracking issue) which PR carries the fix and why it is not fixed
  in place.
* Make sure the **top of the stack is green**. That is the check that describes what lands.

### What a green tip does and does not prove

If the chain is linear **and** the trunk sits exactly at the fork point (both proven above), the
union of every PR in the stack *is* the tip commit. Merging the whole stack leaves the trunk at the
tip's tree, so red checks on lower PRs do not describe anything that lands.

That makes the tip a **content** gate — it tells you what the merge produces. It is not a
**permission** gate: whether GitHub will let the stack merge at all is decided per PR, above.

Three things to confirm before trusting a green tip:

```bash
git rev-parse origin/branch-c                    # does CI's result describe the current head…
gh pr view <tip-pr> --json headRefOid --jq .headRefOid   # …or a stale commit? (or read it natively)

grep -lE "^[[:space:]]*(paths|paths-ignore):" .github/workflows/*.yml   # green covering less than it looks
```

And watch for **unpushed local commits** on the tip branch — merging ships what is on the remote and
strands anything local. Jobs gated on `github.event_name == 'push' && github.ref ==
'refs/heads/main'` run *only after* the merge and can never be green beforehand; they are not a
reason to hold the stack.

## Responding to review

Work the feedback with the `address-pr-review` skill — its stacked-campaign mode exists for exactly
this shape, and it detects the chain itself. Inside a stack it sweeps the feedback from **every open
PR in the campaign** into one worklist, collects the fixes into a **single feedback PR stacked on
the current tip** (one commit per finding — its default of committing onto the reviewed PR's own
branch is the one thing the no-commits-below rule forbids), links that PR into the stack, and
commits **each subsequent review round onto that same feedback PR** for as long as it remains the
top. The feedback PR is the sweep-up PR planned above — expect it, don't treat it as a failure.

Everything else in that skill still applies — fetch inline comments, review summaries, *and*
conversation comments (a review body can carry findings that never appear as an inline thread),
reproduce each reported problem before fixing it, then reply on the original thread naming the
commit and what you verified, and resolve it. When a reply names a commit, copy the SHA from command
output and leave it bare — never retype one and never wrap it in backticks (root `CLAUDE.md`).

## Link the chain into a GitHub stack

Once at least two PRs are open, link them. This is verified against `gh` 2.96.0 with the official
`github/gh-stack` extension v0.1.0:

```bash
gh extension install github/gh-stack   # if `gh stack` is missing
gh stack link <pr-url-bottom> <pr-url-2> <pr-url-3>   # bottom → top
```

* **Pass PR URLs, and pass the URL the create step just printed — never one you predicted.** Numbers
  work, but a leading numeric argument is read as a *stack* number when it matches one, and
  branch-name arguments get pushed to the remote automatically.

  The failure this prevents is not a typo. Writing the `link` call before the PR exists means
  guessing its number, and PR numbers are shared with every issue and every other session's PRs — on
  2026-08-24 a guessed number resolved to **an unrelated PR opened six minutes earlier**, whose base
  was repointed into the stack. Nothing errors: linking a valid PR is a valid operation.

  Repairing it is worse than avoiding it, because a PR cannot leave a stack while it is in one — `gh
  pr edit --base` fails with *"Cannot change the base branch because the pull request is part of a
  stack"*. The whole stack has to be dissolved with `gh stack unstack <number>`, the stray PR's base
  restored, and the real chain relinked, which issues a new stack number. Capture the URL from `gh
  pr create` and pass that.
* If the bases are already chained correctly this is structurally a no-op — it creates the stack
  association without rewriting bases or moving branches. Confirm nothing moved: `git status
  --porcelain` empty, and `git rev-parse <branch>` equal to `git rev-parse origin/<branch>`.
* **Do not pass `--open`** unless you want every PR marked ready for review — it un-drafts drafts.
* Append to an existing stack by passing its stack number first: `gh stack link 7 <pr-url>
  <pr-url>`.
* **Record the stack number `link` prints.** It is the handle for every later command, and `link`
  creates no local tracking state — nothing else will hand it back to you.
* Stack propagation is asynchronous. Re-read the bases for a few seconds until every one is correct;
  a wrong base after that is infrastructure to repair, not to work around.
* Local view: `gh stack checkout <stack-number>` imports the stack from GitHub, then `gh stack view
  --short`. Escape hatch: `gh stack unstack`.

## Merging — only when the user asks

```bash
gh stack merge <stack-number> --merge --yes    # merge commits — matches this repo's trunk
gh stack merge <stack-number> --rebase --yes   # linear, all commits preserved, every SHA rewritten
gh stack merge <stack-number> --squash --yes   # one commit per PR; discards intra-PR history
```

**Pass the stack number.** With no argument `gh stack merge` uses the stack for the *current
branch*, and `gh stack link` deliberately writes no local state — so unless someone ran `gh stack
checkout <stack-number>` first, the bare form has nothing to target. A bare number is read first as
a stack number and then as a PR number; passing a PR number instead merges everything up to and
including that PR.

`--yes` skips the interactive wizard and is required non-interactively. The merge is **atomic and
bottom-to-top**: if any PR cannot merge, none do. Only open-and-not-draft is checked client-side;
branch protection and rulesets are evaluated by GitHub when the merge runs, per included PR, and a
failure there is reported back rather than bypassed. A stacked PR also cannot be set to auto-merge
once its requirements are met.

**Pick by what the trunk already looks like.** `main` here is a merge-commit trunk, so `--merge` is
the default choice. Never `--squash` a campaign whose per-commit history is the record — it
collapses each PR to a single commit.

**A merge-commit stack does not produce one merge commit per PR.** With a strictly linear chain and
the trunk at the fork point, every intermediate PR fast-forwards and GitHub creates a **single**
merge commit at the top. All individual commits are preserved at their **original SHAs**; only the
per-PR boundaries in first-parent history are lost. `--rebase` rewrites every SHA instead, and
GitHub-side rebases produce **unsigned** commits — check whether that matters (`git log
--format='%G?'`).

### Verify the landing

```bash
git fetch origin
[ "$(git rev-parse origin/main^{tree})" = "$(git rev-parse <tip-sha>^{tree})" ] \
  && echo "IDENTICAL — main is what the tip's CI tested"

git rev-list --count <old-main-sha>..origin/main            # commits landed
git rev-list --count --merges <old-main-sha>..origin/main   # merge commits
```

Then watch the post-merge-only jobs, since this is their first and only chance to run. Merged stacks
auto-delete their remote branches when the repo is set to do so, and `gh stack view` renders the
whole stack as merged; delete the local branches with `git branch -d` — they are all ancestors of
the trunk by then.

## Notes

* `gh pr stack` does not exist; the extension is top-level `gh stack`.
* The public GraphQL schema exposes **no** stack mutations, but REST does — `gh stack` is the
  convenience client, not the only programmatic path. Stacks are listed and created at
  `/repos/{owner}/{repo}/stacks`, extended with `POST …/stacks/{number}/add`, dissolved with `POST
  …/stacks/{number}/unstack`, and landed with the asynchronous `PUT
  /repos/{owner}/{repo}/pulls/{number}/merge-async`, which returns a UUID to poll at
  `…/merge-async/{uuid}` until it reaches a terminal state. All of it is reachable through `gh api`
  or a native REST call when the extension is unavailable.
* A force-push that rewrites every branch does **not** break the stack association.
* Merge queues split a group larger than its configured maximum across consecutive groups. `main`
  here has no merge queue, so stack size is unconstrained in practice.
* Codex has an unattended orchestrator for this shape — `implement-issue-stack` drives an ordered
  issue list into reviewed, green stacked PRs on its own. This skill is the procedure for doing it
  by hand, in either agent.
