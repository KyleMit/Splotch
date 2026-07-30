## Writing on GitHub

### The pull request body

**There is deliberately no PR template** — no `.github/pull_request_template.md`, no
`PULL_REQUEST_TEMPLATE.md`, no `docs/` copy, no `.github/PULL_REQUEST_TEMPLATE/` directory. Don't
probe for one. A template's headings get mirrored into every body, and that is the opposite of what
these PRs want: the sections belong to the change, so a UI fix carries before/after shots, a
protocol spike carries the three facts that shaped its client, and a small refactor carries neither.

Shape the body around what the change actually needs, over this floor:

* Open with the issue reference (`Fixes #NNN.`) and a short paragraph on what changed and why.
* Name the changes under a heading of your choosing, then add sections for whatever needs explaining
  — the mechanism, what was measured, what was rejected, what is out of scope, which ADRs or docs
  moved.
* Include a **Verification** section — the checks actually run and their results, usually a table.
  This is the one worth keeping even when the PR is small.
* Visuals whenever the change is visible, and an explicit note when it isn't. The `pr-screenshots`
  skill decides which shots and how to host them.

### Auto-linking

GitHub auto-links a `#` followed by digits (`#12`) into a reference to the issue or pull request
with that number. So a plain list like "#1 done, #2 pass" in a PR body or comment silently turns
into links to unrelated issues/PRs.

**When you write a PR body or a GitHub comment, escape any `#`-number that isn't a deliberate
issue/PR reference.** Prefer one of:

* Backslash-escape the hash: `\#1 done, \#2 pass`.
* Wrap it in backticks: `` `#1` done, `#2` pass ``.
* Reword so no bare `#`-number appears: "item 1 done, item 2 pass".

This applies everywhere agent-authored text lands on GitHub — PR descriptions, PR comments, review
comments, and issue comments. A `#`-number you *do* mean as a reference (e.g. "fixes #123") should
stay unescaped.

The mirror-image rule holds for **commit SHAs: leave them bare, never in backticks.** GitHub
auto-links a plain-text SHA into a link to that commit; a code span suppresses the linker and it
renders as dead monospace text. So write "fixed in 863ee85aaa43", not ``"fixed in `863ee85aaa43`"``.
Backticks around file paths, identifiers, and commands are still correct — this is only about SHAs
(and the `#`-numbers above, where backticks are one of the ways to *defuse* an unwanted link).
