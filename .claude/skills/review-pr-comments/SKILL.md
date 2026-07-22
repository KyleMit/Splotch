---
name: review-pr-comments
description: Triage and address every reviewer comment on a pull request — validate each one against the current code, fix the valid ones and reply with the solution, reply to and resolve the invalid ones with the rationale. Use when asked to address, respond to, or work through the comments/feedback/review received on a PR. To produce a review of a PR (author the critique), use review-pr instead.
---

# Review PR Comments

Work through the comments left on a pull request: decide for each one whether it calls for a code
change, make the valid fixes, and answer every thread so the reviewer can see at a glance what
happened. The deliverable is a PR where **no comment is left hanging** — each thread ends with
either a fix (and a reply pointing at it) or a reasoned reply explaining why no change is needed.

This is the receiving side of [`review-pr`](../review-pr/SKILL.md) — that sister skill authors and
posts review comments; this one works through them.

## Setup

1. **Identify the PR.** Use the PR the user named, or the open PR for the current branch. If the
   branch has no open PR, say so and stop — there is nothing to review.
2. **Check out the PR's head branch** and make sure the working tree is clean and up to date with
   the remote (`git pull origin <branch>`). Fixes commit onto this branch; never mix them with
   unrelated local work.
3. **Fetch every kind of comment** — reviewers leave feedback in three places, and a sweep that only
   reads one of them misses comments:
   * **Inline review comments** (threads anchored to a diff line) — GitHub MCP `pull_request_read`
     with `method: "get_review_comments"`.
   * **Review summaries** (the approve/request-changes body text) — `method: "get_reviews"`.
   * **Conversation comments** (top-level comments on the PR itself) — `method: "get_comments"`.

   With `gh` available, `gh pr view <n> --comments` and
   `gh api repos/{owner}/{repo}/pulls/{n}/comments` cover the same ground. In cloud sessions `gh` is
   not available — use the MCP tools.
4. **Filter to what's actionable.** Skip threads that are already resolved, comments you (or a
   previous agent run) already replied to with a fix, and your own comments. Treat bot reviews
   (Copilot, CI annotations) the same as human ones — triage them on merit, not on author.

## Plan the order before starting

With the full comment list in hand, decide the order to address them **before** touching anything —
working comments in arrival order wastes effort when a later comment invalidates an earlier fix. Lay
out the plan (a short ordered list of comments with a one-line reason for the sequencing), then work
it top to bottom:

1. **Ambiguous / scope-changing comments first.** Anything that will need an `AskUserQuestion` (see
   Triage) goes to the front — ask early so the answer arrives while you work the rest, instead of
   blocking the end of the sweep.
2. **Broad before narrow.** A comment questioning an approach, an abstraction, or a file's whole
   structure comes before line-level comments *inside* that structure — a restructure can moot or
   relocate the nits, and fixing the nits first means fixing them twice.
3. **Group comments touching the same file or subsystem** and handle the group consecutively, so the
   code is fresh in context and related fixes can share one commit and one verification run.
4. **Deep-diff order within a group.** Where one fix feeds another (a rename a later comment's fix
   would build on, a helper another fix would call), sequence the dependency first.
5. **Questions and reply-only dispositions last** (or interleaved freely) — they change no code, so
   nothing else depends on them.

If the triage below reclassifies a comment in a way that changes the plan (e.g. a "nit" turns out to
demand the restructure), reorder the remaining items rather than pushing through the stale plan.

## Triage — validate before touching anything

For each remaining comment, read the code it points at **as it exists now** and classify it:

* **Valid** — the comment identifies a real defect, risk, or clear improvement, and the fix is in
  scope for this PR. → Fix it (below).
* **Already addressed / outdated** — the code changed since the comment was written and the concern
  no longer applies. → Reply with the commit that addressed it (or the reason it's moot) and resolve
  the thread.
* **Invalid** — the comment misreads the code, proposes something worse, or conflicts with a
  documented decision (check the `adrs` skill — an ADR is the strongest rationale you can cite). →
  Don't change the code. Reply with the concrete rationale — cite the code path, test, or ADR that
  shows why — and resolve the thread.
* **Question** — the reviewer is asking, not requesting. → Answer it in a reply; change nothing
  unless the answer reveals a real problem.
* **Ambiguous or architecturally significant** — the comment could be read multiple ways, the fix
  would ripple beyond the PR's scope, or valid-vs-invalid genuinely depends on a product call. → Ask
  the user with `AskUserQuestion` before acting, with enough context to answer without scrolling
  back. Never resolve a thread you weren't sure about — a wrong "resolved with rationale" reads as
  dismissing the reviewer.

Validate empirically where the comment admits it: if a reviewer claims a bug, try to reproduce it (a
failing test is the ideal proof the comment is valid — and the regression test then ships with the
fix).

## Fixing the valid ones

1. Implement the fix the comment actually asks for — smallest correct change, matching the
   surrounding code's style. If the reviewer's suggested implementation is flawed but the underlying
   concern is real, fix the concern your way and say so in the reply.
2. Verify: `npm run check` plus the tests covering the touched files (see the `testing` skill). For
   doc/Markdown-only fixes run `npm run format:check` instead — dprint drift is the usual reason a
   fresh push goes red.
3. Commit with a descriptive message — one commit per comment, or one per logical group when several
   comments hit the same spot. Granular commits let each reply point at the exact SHA that addressed
   it.
4. Push once after all fixes (`git push -u origin <branch>`), **before** posting replies — a reply
   that references an unpushed SHA is a dead link.

## Replying — close every loop

* **Fixed** → reply **on the same thread** stating what changed and the commit SHA
  (`Fixed in <sha> — <one line on the approach>`). Use `add_reply_to_pull_request_comment` for
  inline threads, `add_issue_comment` for conversation comments. Leave the thread **unresolved** so
  the reviewer can verify the fix and resolve it themselves.
* **Invalid / already addressed / question** → reply with the rationale or answer, then resolve the
  thread (`resolve_review_thread`). Conversation comments and review summaries have no resolve
  button — the reply alone closes them out.
* Keep replies short and concrete: the code path, test, ADR, or SHA that settles it — not a
  restatement of the comment. Be gracious; the reviewer's time produced the feedback.
* **Escape `#`-numbers** that aren't deliberate issue/PR references (`\#1`, or backticks) — a bare
  `#1` in a reply auto-links to an unrelated issue (see "Writing on GitHub" in the root
  instructions).

## Completion

1. If any fix landed, run the composed verification once — `npm run check` and the tests relevant to
   everything the sweep touched together, not just per-fix.
2. If the PR touched UI and a fix changed what renders, refresh the PR's screenshots per the
   `pr-screenshots` skill.
3. Summarize in the final response: each comment with its disposition — **fixed** (SHA),
   **replied-and-resolved** (rationale in one line), **answered**, or **escalated to the user** —
   plus the overall check/test result. Every comment fetched in Setup must appear; a comment with no
   disposition means the sweep isn't done.
