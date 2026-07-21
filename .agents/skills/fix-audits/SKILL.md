---
name: fix-audits
description: Work through every open type:audit GitHub issue autonomously on a dedicated branch — one commit per issue — validating, fixing, and verifying each. Use when asked to fix, clear, or work through the audit backlog.
---

# Fix Audits

Work through **every** open GitHub issue labeled `type:audit` autonomously on a dedicated branch —
one commit per issue — without stopping to ask the user anything **mid-run**. The `type:audit`
issues are the durable audit backlog; `/vet-audits` files them from validated findings (see
`.claude/audit-conventions.md`). This skill no longer reads `docs/AUDIT.md`.

The one exception to the no-prompts rule is a single upfront question: whether to open a pull
request. Some environments (Claude Code on the web / cloud sessions) can't silently open a PR — the
harness only permits it when the user has explicitly asked, and `gh` may be unavailable — so resolve
that **once, before any work**, then run the whole sweep without further prompts (see Setup). Review
happens on the PR when there is one; otherwise in the final summary.

## Two kinds of issue — adapt the loop to each

The `type:audit` backlog mixes two shapes of issue, and "validate → fix → verify" means something
different for each. Read the issue's labels and body (which name the audit that surfaced it) to tell
them apart before you delegate:

* **Product-code issues** — surfaced by `/code-audit`, `/extract-audit`, `lighthouse-audit`
  (typically carry `type:perf`/`type:bug`/`type:chore` + an `area:*`). The fix changes app source
  under `web/src/` (or a build / perf path). Validate empirically (a failing test, a profile, a
  query) and verify with `npm run check` + the tests covering the touched files, exactly as the
  per-item loop describes.
* **Tooling issues** — surfaced by `/session-audit` and any issue whose fix is a change to Splotch's
  **Claude Code tooling and cloud-session workflow** rather than to production code: a skill under
  `.ruler/skills/`, a path-scoped rule in `.claude/rules/`, an instruction note in the `.ruler/`
  sources (regenerate `CLAUDE.md`/`AGENTS.md` with `npm run ruler:apply`, ADR-0058), a `docs/*`
  reference, an ADR, `.claude/cloud/*`, or a small helper script in `scripts/`. These usually have
  **no product test to turn green** — a Markdown edit has nothing to typecheck. Validate and verify
  against the *tooling itself* (see the per-item loop), and do **not** fabricate or report a passing
  product suite as if it validated a change that never touched product code.

The two classes can coexist in one sweep; decide per issue, not per run.

A `needs-triage` label on a `type:audit` issue means `/vet-audits` judged the finding valid but
couldn't settle the fix approach. Still attempt it — but if the subagent can't reach a confident
approach or the issue needs a product/user decision, that's a **Skip**: leave the issue open with a
comment (per the per-item loop), don't force a shaky fix.

## Setup (once per run)

1. **Fetch the backlog first.** Query the open `type:audit` issues with the GitHub MCP tools
   (`list_issues` with `labels: ["type:audit"]` and `state: OPEN`, or `search_issues` for
   `is:open label:type:audit`). If there are none, there's nothing to fix: report "no open
   `type:audit` issues" and stop cleanly — don't create a branch or PR. Order the issues you did get
   for the sweep: `priority:high` first, then the rest oldest-first (issue number ascending); order
   is not implied by number otherwise.
2. Ensure the working tree is clean; if not, stop and tell the user — never mix their uncommitted
   work into this run.
3. **Resolve the PR question once, upfront — then never ask again.** This is the single thing the
   run is allowed to pause on, and it comes *before* any fixing. Ask with `AskUserQuestion` whether
   to open a pull request for the sweep, offering two modes:
   * **Draft PR** — review happens on the PR; a per-item comment lands as each fix commits, and the
     PR is readied at the end.
   * **Branch only** — commit + push to the branch, deliver the full per-item summary in the final
     response, open no PR.

   If the environment can open a PR without an explicit ask (e.g. `gh` present and no harness
   restriction), skip the question and default to **Draft PR**. Record the chosen mode; every
   PR-touching step below (`gh pr comment`, `gh pr edit`, `gh pr ready`) runs only in Draft-PR mode
   and is replaced by "carry it into the final summary" in Branch-only mode.
4. Set up the branch, and in **Draft-PR mode** the PR. If an open draft PR from a previous run
   exists (branch `claude/audit-sweep-*`), check out that branch and resume. Otherwise, from `main`,
   create `claude/audit-sweep-<YYYY-MM-DD>` (or reuse the session's designated working branch if one
   is set), and push it with `git push -u origin <branch>`. Then, **in Draft-PR mode only**, open a
   **draft PR** titled "Audit sweep: <date>" with a body noting the run is in progress (final
   summary comes at the end). Create it with `gh pr create
   --draft` where `gh` is available,
   otherwise the GitHub MCP `create_pull_request` tool with `draft: true`.

## Per-item loop

Process the issues in the sweep order chosen in Setup. For each issue:

1. **Delegate to a fresh subagent.** Launch a `general-purpose` agent whose prompt contains the
   issue's full text verbatim (number, title, body, labels) plus repo conventions. A fresh agent per
   issue is what keeps each fix's context clean — do not implement issues in the orchestrator
   conversation, and do not pull the subagent's diff into your own context; rely on its report.
   Instruct the subagent to work in this order:

   1. **Validate the problem first — empirically where possible.** Before changing anything, confirm
      the finding is real against the *current* code: run the issue's verification steps if it has
      them, otherwise reproduce it yourself (a failing test, a profile capture, a log line, a query
      — whatever the issue admits) rather than trusting the write-up. If the problem no longer
      holds, is intentional, or can't be reproduced, that's a **Skip** carrying the evidence.

      For a **tooling issue**, "reproduce it" means confirming the gap against the *current*
      tooling, not against product behaviour: the doc really is missing the note, the script really
      throws, the rule really doesn't warn (grep the skill / rule / `CLAUDE.md`, run the script,
      re-run the issue's verification). If the tooling has since been fixed — someone added the
      note, the import was already corrected — that's a **Skip** with the grep/run that proves it.
   2. **Brainstorm the fix — the issue's recommendation is a starting point, not gospel.** The
      suggested fix in the issue was written by an earlier pass (`vet-audits`) without
      implementation context, so treat it as one candidate among others. Weigh it against
      alternatives and choose the approach that is genuinely best for this codebase, even if that
      means diverging from or improving on the recommendation. Carefully consider the best way to
      proceed.

      **When a tooling fix calls for automation, keep it small and composable.** A cloud-session or
      Claude-tooling fix that needs a script must be a **small, single-purpose, non-brittle helper
      that many different sessions can reuse** — not a god script that grows flags and branches to
      cover every case. Lots of small, focused commands handed to Claude beat one big configurable
      command with a pile of args, *as long as each is documented*. So:

      * Prefer several focused commands, each doing one thing, over one command switched by
        arguments. If an issue's proposed solution sketches a broad do-everything script, decompose
        it — build the smallest reusable primitive, then let callers compose primitives.
      * Reuse before you add: check `scripts/lib/` (`utils.mjs`, `vite-server.mjs`, `smoke.mjs`,
        `android.mjs`) for glue that already exists rather than re-implementing it.
      * Name and document every new script per ADR-0019: a `namespace:variant` npm script with a
        matching one-line `scripts-info` entry, plus a `scripts/CLAUDE.md` bullet where it earns
        one. An undocumented helper is **not** a finished fix — if `npm run info` and the skill /
        rule that will invoke it don't point at the new command, a future session can't find it, so
        discoverability is part of the fix, not an extra.
   3. **Implement the chosen fix, then verify it — matched to what the fix touched.**
      * If the fix changed **code or a script** (`.ts`, `.mjs`, config): run `npm run check` and the
        tests covering the touched files, and where the problem was reproduced empirically in step
        1, re-run that same reproduction to prove the fix resolves it — not merely that the suite
        stays green. A new helper script must actually run (invoke it, or its smoke).
      * If the fix only changed **docs / skills / rules / `CLAUDE.md` / ADRs**, there is nothing to
        typecheck — `npm run check` and `npm test` are irrelevant, so don't report a green run you
        didn't need as if it validated the edit. Instead re-run the issue's verification, grep for
        the guidance you added to confirm it landed, and read the surrounding section to be sure the
        new text is correct, self-consistent, and doesn't contradict a sibling skill / rule / doc.

   The subagent must report back one of:
   * **Fixed** — with a summary of what changed and why, the approach chosen (and how/why it
     diverged from the issue's recommendation, if it did), the empirical validation of both the
     problem and the fix, files touched, check/test results, and any caveats or follow-ups.
   * **Skip** — the finding didn't hold up (couldn't be reproduced, already fixed, or intentional),
     the fix turned out riskier than the issue claims, or it requires a product/user decision to
     proceed. It must revert all its changes (`git restore .` + delete any new untracked files) and
     state the evidence plus exactly what decision is needed or why the finding doesn't hold up.
2. **On Fixed:**
   * Verify the tree has changes and the reported checks passed (re-run `npm run check` if the
     report is ambiguous).
   * Commit the fix as one commit with a descriptive message that **references the issue so it
     closes on merge** — `Fixes #<NN>` in the commit body — then push.
   * Record — the issue number/title, the commit SHA, the subagent's summary, test/check results,
     and any caveats worth a reviewer's attention. **In Draft-PR mode**, post it as a PR comment
     (`gh pr comment`, or the GitHub MCP `add_issue_comment` tool on the PR number). **In
     Branch-only mode**, accumulate it for the final response instead.
3. **On Skip:**
   * Confirm the working tree is clean again (revert it yourself if the subagent didn't).
   * **Leave the issue open** and add a comment to it (GitHub MCP `add_issue_comment` on the issue
     number) stating the evidence and — if it needs a decision — exactly what the user must decide
     and why the sweep couldn't proceed. If the finding simply didn't hold up (already fixed /
     intentional / not reproducible), say so in the comment; a human can then close it. If it's
     blocked on a decision and the issue isn't already `needs-triage`, add that label
     (`issue_write`). Do **not** reference the issue in any commit — a skipped issue must not close.
   * Flag the skipped issue and its reason — as a PR comment in Draft-PR mode (`gh pr comment`, or
     the GitHub MCP `add_issue_comment` tool on the PR), or in the final summary in Branch-only
     mode.
4. Move to the next issue. Do not stop between issues, do not ask the user anything mid-run — a
   decision point is handled by step 3, not by pausing.

## Completion

When every issue is either fixed or skipped:

1. **One final verification — of whatever the sweep actually touched.** With all fixes now
   accumulated on the branch, confirm they *compose* — that no later fix silently undermined an
   earlier one and the branch is coherent as a whole, not just item-by-item.
   * If any commit touched **code or a script**, run the full suite once more (`npm run check` and
     `npm test`) and resolve anything that fails (delegate if it's substantial) before proceeding.
   * If the sweep only touched **Claude tooling** (docs / skills / rules / `CLAUDE.md` / ADRs), the
     compose check is that the edited guidance is mutually consistent — no two skills or rules now
     say contradictory things, and every new helper the sweep introduced is referenced from the
     skill / rule / `scripts-info` that should invoke it. Running `npm test` on a docs-only branch
     proves nothing; skip it unless a commit touched code.
2. The `type:audit` issues are the backlog — this skill doesn't touch `docs/AUDIT.md`. Fixed issues
   close automatically when the PR merges (each commit references them with `Fixes #<NN>`); skipped
   issues stay open with the comment step 3 of the per-item loop added.
3. Add one row to `docs/AUDIT-LOG.md` for this run per `.claude/audit-conventions.md` §2 (date ·
   `fix-audits` · one-line summary with the PR link, or the branch name in Branch-only mode),
   committed and pushed with the completion changes.
4. **In Draft-PR mode**, update the PR description (`gh pr edit --body`, or the GitHub MCP
   `update_pull_request` tool's `body`): a one-line summary per change (linking each commit and the
   issue it closes), plus — if any — a **"Needs your decision"** section listing each skipped issue
   and what it's waiting on. **In Branch-only mode** there is no PR description — this content goes
   in the final response instead.
5. **In Draft-PR mode**, mark the PR ready for review (`gh pr ready`, or the GitHub MCP
   `update_pull_request` tool with `draft: false`). Branch-only mode has no PR to ready.
6. In your final response: how many issues were fixed (with their numbers), how many were skipped
   (and what each is waiting on), and — in Draft-PR mode — the PR URL, or in Branch-only mode the
   branch name plus the per-item summaries accumulated above.
