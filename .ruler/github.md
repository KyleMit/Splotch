## Writing on GitHub

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
