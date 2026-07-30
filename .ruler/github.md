## Writing on GitHub

The pull request template is `.github/pull_request_template.md`, and it is the only one — there is
no `PULL_REQUEST_TEMPLATE.md`, no `docs/` copy, and no `.github/PULL_REQUEST_TEMPLATE/` directory,
so don't probe for them. Its headings are the floor for a PR body, not the ceiling: keep them, then
add your own sections for the mechanism, the measurements, what was rejected, what is out of scope,
and which ADRs or docs moved. The `pr-screenshots` skill governs the Screenshots section.

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
