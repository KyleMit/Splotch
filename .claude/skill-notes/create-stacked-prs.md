<!-- Source: .ruler/skill-notes/create-stacked-prs.md.template -->

# create-stacked-prs — design notes

## Provenance

Merged from two session handoff packets: one campaign-discipline packet (how to shape and sequence
the PRs while the work is in flight) and one mechanics packet (`gh stack` behavior, verified
empirically against `gh` 2.96.0 and `github/gh-stack` v0.1.0 on a real 13-PR chain, including a
successful `--merge` landing). Everything in the merge and linking sections was observed, not read
off the docs — GitHub's own documentation for stacked PRs is thin and the feature is in public
preview.

## The single load-bearing rule

"Never add a commit to a PR once a PR sits above it." The first packet stated it as "never amend a
PR once it is open", which is both too narrow and slightly wrong: `git commit --amend` is not the
hazard, *any* new commit on a lower branch is. Branch C was cut from B's head, so a commit appended
to B makes B stop being an ancestor of C, and `git merge-base --is-ancestor` — the exact predicate
`gh stack merge` enforces — starts failing. The skill states the mechanism rather than the
prohibition because an agent that knows why will also recognize the variants (a cherry-pick onto a
lower branch, a force-push that drops a commit, a merge of `main` into a middle branch).

Corollary that is easy to miss: this rule collides head-on with `address-pr-review`, whose setup
step says to check out the reviewed PR's branch and commit fixes there. Left unstated, an agent
running both skills does the natural thing and desynchronizes the stack. The skill names the
collision explicitly instead of trusting the reader to notice.

## Where the merged packets disagreed, and how it was resolved

* **PR numbers vs. URLs for `gh stack link`.** The mechanics packet said "pass PR numbers, not
  branch names" (numbers do resolve, branch names get pushed). The Codex `implement-issue-stack`
  skill uses URLs, because a leading numeric argument is read as a *stack* number when one matches.
  URLs win: they are unambiguous in every position, and the packet's real point was "not branch
  names".
* **Generated artifacts.** The discipline packet said to put all regeneration in one PR at the top.
  That rule comes from parallel-branch campaigns; in a strictly linear stack each PR already
  contains its predecessors, so regenerating in the PR that changed the inputs conflicts with
  nothing — and it is *required* here, because `npm run ruler:check` is a per-PR gate that fails a
  source-only PR. The skill keeps the one-PR rule but scopes it to the case it actually applies to.

## Deliberately kept, though it reads like trivia

* **The bash-not-zsh warning on the linearity loop.** This is not pedantry about shells — the
  failure mode is silent. zsh runs the loop once with the whole string and prints nothing, which is
  indistinguishable from "no breaks found" to an agent skimming output. The repo's default shell is
  zsh, so the trap fires by default.
* **"The tip PR's checks are the ship gate."** Without it, mid-stack red reads as work to do, and an
  agent will start fixing PR 3 in place — the one thing the load-bearing rule forbids. The two
  preconditions (linear chain, trunk at fork point) are stated with the commands that prove them,
  because the claim is false without them.
* **The single-merge-commit surprise.** `--merge` on a linear stack produces one merge commit at the
  top, not one per PR. Anyone expecting per-PR merge commits in first-parent history will read the
  landing as a bug and consider reverting.

## What the first review corrected

Four claims in the initial version were wrong or under-qualified, and each failure mode is worth
keeping because none of them errors — they all produce a runbook that reads fine and fails late.

* **"The tip PR's checks are the ship gate."** True as a statement about *content* — with a linear
  chain and the trunk at the fork point, the tip's tree is what lands. False as a statement about
  *permission*: GitHub evaluates branch protection and rulesets per included PR when the stack merge
  runs, and bypassing is unsupported even for admins. The original packet reached its conclusion on
  a repo whose `main` has no required status checks, so the precondition was invisible in the
  evidence. The skill now checks the base's rules first and splits the two gates apart.
* **`gh stack merge` with no argument** uses the stack for the *current branch*, while
  `gh stack
  link` deliberately writes no local state — so the documented flow produced a merge
  command with nothing to target. Caught by reading `gh stack merge --help`, which says so plainly.
* **Hardcoded `gh`.** A shared runbook that reaches straight for the CLI contradicts the root
  instructions (native GitHub tooling first) and breaks in a sandbox with no Keychain access. The
  `gh` lines survive as the fallback and as the precise statement of the operation; `gh stack` is
  the only mandatory CLI use because nothing native covers it.
* **"`gh stack` is the only programmatic path."** The GraphQL half was right and the conclusion was
  not: REST exposes `/repos/{owner}/{repo}/stacks` plus `add`, `unstack`, and an asynchronous
  `merge-async` endpoint. Verified by calling the live endpoint, which also returned this repo's own
  stack history.

The pattern across all four: a claim generalized from one successful run on one repository, stated
without the precondition that made it true.

## Open questions

* Whether `gh stack` beyond 0.1.0 preserves `link`'s numeric ambiguity, the `--base` flag, and
  `unstack`. `implement-issue-stack` pins 0.1.0 and treats another version as a global blocker; this
  skill does not pin, because a human-driven run can adapt. If a version bump changes behavior, both
  need updating.
* Unsigned commits from a GitHub-side `--rebase` are flagged but not decided. This repo has no
  signing requirement today, so it stays a "check whether it matters" rather than a prohibition.
* No stack has yet been landed here with `main` ahead of the fork point. The skill routes that case
  to `reconcile-with-main` and stops short of describing what the linking and merge do afterwards.
