---
name: leave-pr-review
description: Splotch conventions that augment (not replace) the built-in review flow when reviewing a pull request — check out the PR branch locally for offline diffs and to run the code and empirically verify critiques, anchor every finding to a diff file + line as you analyze, then post the surviving findings onto the PR as a single inline-comment review; invoking the skill is itself the authorization to post publicly, and mode overrides instead keep the findings in chat, file them as GitHub issues (each blocking finding its own issue, the rest bundled into one PR-feedback issue), or implement them on a follow-up PR. Use in addition to the built-in review whenever asked to review a PR or leave review feedback on one.
---

# Review a PR

These conventions supplement the built-in review flow — follow them *in addition to* whatever the
built-in `/review` behavior already does, not instead of it. The output side of this skill is the
input side of [`address-pr-review`](../address-pr-review/SKILL.md): the comments posted here are
exactly what that skill later triages on the receiving branch, so every comment must stand on its
own as an actionable, anchored critique.

A reviewing session may also arrive here through a review prompt written by
`create-pr-review-prompt` — it enumerates every PR a session produced (a stacked campaign has
several) and appends extra focus areas on top of the full sweep this skill performs.

**Posting is the default — invoking this skill bare is the explicit authorization to post.** A
request to review a PR with this skill authorizes leaving the resulting comments publicly on GitHub:
perform the full analysis below, then submit the surviving findings as a single `COMMENT` review on
the named PR without pausing for a further go-ahead. (`mode=post-comments`, the older orchestrator
spelling, means exactly this default.) The authorization covers `COMMENT` reviews on that PR only —
never approval, request-changes, commits, pushes, merges, closing the PR, or any action on another
PR.

Mode overrides redirect where the findings land instead of the PR:

* **`mode=chat`** — analyze identically, present the findings in the chat reply, post nothing (see
  "`mode=chat`" below). Use it whenever the user's phrasing withholds posting — "review but don't
  post", "what would you flag?", "show me first".
* **`mode=issues`** — file the findings as GitHub backlog issues: each `blocking` finding gets its
  own issue, everything else bundles into one general PR-feedback issue (see "`mode=issues`" below).
* A request to implement the findings skips commenting and fixes them on a follow-up PR (see
  "Implementing the fixes instead" below).

## Setup — always check out the PR branch locally

Never review from API diff hunks alone. Check out the PR's head branch so you can run offline git
diffs and actually execute the code:

1. Read the PR itself and record its repository, number, state, base branch + OID, and head branch +
   OID. The PR metadata is authoritative; never assume the merge target is `main`. The native PR
   read carries all four; the CLI spelling is
   `gh pr view <n> --json baseRefName,baseRefOid,headRefName,headRefOid`. A base OID no local ref
   covers is fetchable directly: `git fetch origin <base-oid>`.
2. Make sure the working tree is clean; never mix a review checkout with local work in progress.
3. Fetch and check out the recorded head branch:

   ```sh
   git fetch origin <head-branch>
   git checkout <head-branch>
   ```

   For a fork PR (head repo ≠ origin), fetch the PR ref instead:
   `git fetch origin pull/<n>/head:pr-<n> && git checkout pr-<n>`.
4. Fetch the recorded base and diff exactly the range defined by the PR:
   `git diff <base-oid>...<head-oid>` (three dots — changes this PR introduces relative to its
   actual merge target). `git log <base-oid>..<head-oid> --oneline` gives the commit story; per-file
   diffs and `git blame` are all offline from here. This is load-bearing for stacked PRs, whose base
   is the preceding feature branch rather than `main`.

## Reviewing a stack

A stacked campaign hands you several PRs at once (`create-stacked-prs` builds them;
`create-pr-review-prompt` enumerates them). The single-PR procedure above runs once per PR; the
stack adds four rules around it:

1. **Resolve the live topology first and work bottom → top.** Read every PR's recorded base and
   head; the chain the handoff listed can have moved. Each PR is diffed against **its own base OID**
   — against `main` every PR above the bottom shows every PR below it too, and the same change gets
   reviewed N times.
2. **Read the existing review threads on each PR before writing findings.** A stack accretes rounds;
   a finding already posted — yours from an earlier round or anyone else's — is deduplicated, not
   re-raised, and a resolved thread is not reopened by a fresh comment saying the same thing.
3. **One atomic review per PR**, exactly as the single-PR flow posts it. A finding about code a
   lower PR introduced anchors on the PR that introduced it, not where the tip's diff happens to
   expose it.
4. **Close with a stack-level verdict in the top PR's review body**: whether the decomposition and
   sequencing hold up, cross-PR concerns no single diff shows (a lower PR's change invalidating an
   upper's assumption), and whether the chain is mergeable in order. Line-level review cannot see
   this; it is the half of a stack review that reviewing the PRs separately misses.

Leave the checkout as you found it: every branch unmodified, nothing pushed, working tree clean —
reviewing a stack authorizes reviews, never commits.

## Analysis — verify empirically, anchor as you go

* **Review adversarially — in both directions.** Assume the diff contains at least one real defect
  that will ship, and hunt for it; an agreeable skim produces an empty review. Then turn the same
  skepticism on your own findings before presenting them: try to refute each one, and drop or
  downgrade whatever doesn't survive.
* **Run the code when a critique depends on behavior.** A claimed bug, race, or regression should be
  reproduced, not asserted: run `npm run check`, the tests covering the touched files (see the
  `testing` skill), or the app itself (see `run-splotch`) as the claim requires. A reproduced
  failure upgrades a critique to fact — cite the repro in the comment. A critique you tried and
  failed to substantiate gets downgraded to a question or dropped; never post speculation phrased as
  fact.
* **Anchor every finding while analyzing, not after.** GitHub inline review comments require a
  `path` + `line` that exist **in the PR's diff** — you cannot comment on an untouched line. So as
  you spot each issue, record where the comment will attach:
  * the file path and the line number in the **new** file version (`side: RIGHT`); use `side: LEFT`
    only for critiques of deleted lines;
  * for a multi-line span, the `startLine`..`line` range;
  * a finding about unchanged code the diff merely exposes → anchor to the nearest changed line that
    motivates it, or plan it for the review summary body instead.

  If you defer anchoring to posting time, you will find some comments have nowhere to attach — think
  about placement during the initial analysis.

## Each critique

Every finding carries, from the moment it's drafted:

* **Anchor** — `path` + `line` (+ range/side) as above.
* **Severity** — `blocking` (defect or real risk; should not merge as-is), `suggestion` (better way,
  author's call), `nit` (style/polish), or `question` (genuine ask, not a request).
* **Claim + why it matters** — one issue per comment; what's wrong and the consequence.
* **Evidence** — the repro, failing test, code path, or ADR that backs it (check the `adrs` skill; a
  critique that contradicts a documented decision is probably wrong — or the ADR is stale).
* **Concrete fix** — what to do instead. When it's a small in-place replacement, include a
  ```suggestion`` block so the author can one-click apply it.

## Posting — the default: one pending review, no further gate

Post every finding that survived the adversarial self-check, without stopping to ask — invoking the
skill was the authorization. An empty review is allowed only after the review made a serious
empirical attempt to find defects; submit its verification summary in the review body.

Post as a **single review**, not N standalone comments (one notification, one atomic unit the author
can respond to):

1. Re-read the PR metadata. If its head OID differs from the OID reviewed, do not post stale
   findings: fetch the new head, repeat the affected analysis, and update every anchor first.
2. `pull_request_review_write` with `method: "create"` to open a pending review.
3. `add_comment_to_pending_review` per finding, with the anchor recorded during analysis (`path`,
   `line`, `side`, `startLine` for ranges). Prefix each comment with its severity tag
   (`**blocking:**`, `**suggestion:**`, `**nit:**`, `**question:**`).
4. `pull_request_review_write` with `method: "submit_pending"` — event `COMMENT` unless the user
   explicitly asked to approve or request changes. Put the overall summary and any un-anchorable
   findings in the review body.

Escape `#`-numbers that aren't deliberate issue/PR references (`\#1` or backticks) — see "Writing on
GitHub" in the root instructions. If a comment fails to attach (anchor not in the diff), fix the
anchor or move it to the review body — don't silently drop it.

When the GitHub MCP is intentionally unavailable (for example, a trusted standalone reviewer), use
the equivalent `gh api` pending-review endpoints. Preserve the same single-review, inline-anchor,
head-OID recheck, and `COMMENT`-only rules.

Afterwards, present the review in the chat reply — each finding with its severity and `file:line`,
the review event, and the overall verdict — so the user sees what landed without opening GitHub.
Working through those comments is the job of `address-pr-review` on the other side.

## `mode=chat` — present in chat, post nothing

When posting authorization is withheld — the user asked to see the review first, said not to post,
or passed `mode=chat` — deliver the full findings as the plain chat reply **and stop**: a numbered
list with severity, `file:line`, and the draft comment text for each, plus the overall verdict and
anything destined for the summary body. Never deliver findings via `AskUserQuestion` — they are the
deliverable, not a multiple-choice prompt. Close by offering the next steps, and end the turn:

* a typed affirmative — "proceed", "do it", "post them", … — posts the findings onto the PR (above);
* "file them as issues" turns the findings into GitHub backlog issues instead (below);
* "no, implement them" skips commenting entirely and fixes the findings on a follow-up PR (below).

The user may first cull, reword, or reprioritize findings — acting only on what survives is the
point of this mode. If the user never says go, the review stays in chat.

## `mode=issues` — filing as GitHub issues instead

If the user asks for backlog issues rather than PR comments, split the surviving findings by
severity:

* **Each `blocking` finding gets its own issue** — that tier is independently actionable work, so
  each one gets its own title and body in the repo's issue format (`docs/ISSUE-WORKFLOW.md` — one
  `type:*`, applicable `area:*`, and normally `priority:high`).
* **Everything else bundles into one general PR-feedback issue** — a single issue titled for the PR,
  holding the remaining suggestions, nits, and questions as a checklist grouped by severity, so the
  backlog isn't scattered with nit-sized issues.

In every issue, link each finding's anchored code via a permalink to the PR's head SHA and reference
the source PR — that reference is deliberate, so its `#`-number stays unescaped. Report the created
issue numbers when done.

## Implementing the fixes instead

If the user says to implement the findings rather than post them:

Inside an active stacked campaign, this path changes shape: basing a fix-up PR on the reviewed PR's
head would add a commit below the top of the stack once it merges — branch off the current tip and
follow `address-pr-review`'s stacked-campaign flow (one feedback PR at the tip) instead. Outside a
stack:

1. Branch off the PR's checked-out head: `git checkout -b <head-branch>-review-fixes`.
2. Implement each finding — smallest correct change matching the surrounding style, one commit per
   finding (or per logical group), the same fix discipline as `address-pr-review`.
3. Verify composed: `npm run check` plus the tests covering everything touched
   (`npm run
   format:check` for Markdown-only fixes).
4. Push and open a PR whose **base is the original PR's head branch** — not `main` — so the fixes
   flow into the original PR for its author to review. Map each commit to its finding in the PR body
   (escaping `#`-numbers that aren't real references), include screenshots per `pr-screenshots` if
   the UI changed, and leave one conversation comment on the original PR pointing at the fix-up PR.
