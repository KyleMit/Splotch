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

The mirror-image rule holds for **commit SHAs: leave them bare, never in backticks.** GitHub
auto-links a plain-text SHA into a link to that commit; a code span suppresses the linker and it
renders as dead monospace text. So write "fixed in 863ee85aaa43", not ``"fixed in `863ee85aaa43`"``.
Backticks around file paths, identifiers, and commands are still correct — this is only about SHAs
(and the `#`-numbers above, where backticks are one of the ways to *defuse* an unwanted link).

**Never write a SHA from memory — copy it from command output, and verify before you post.** A SHA
is the one value in agent-authored text with no redundancy: every character is load-bearing, nothing
downstream validates it, and a wrong one renders as ordinary plain text rather than failing. The
specific trap is mixing widths. `git log --format=%h` abbreviates to 7 characters; extending one to
the 12 a comment wants means inventing 5, which yields a string with the right length and the right
leading characters that resolves to nothing. It looks correct in every way except the one that
matters, and the only symptom is a heading that quietly stops being a link.

So take SHAs from `%H` (or `git rev-list`) and paste them, never retype them — and when a batch is
already posted, verify rather than trusting the transcription:

```bash
git rev-parse --verify --quiet "$sha^{commit}" >/dev/null || echo "BAD $sha"
```

Worth running over every SHA in a body you are about to post, and over the whole set after posting a
batch — it is one command and it is the only thing that distinguishes a live link from a dead
string. This bit a 2026-08-05 burndown: 32 of 62 per-commit comments carried a padded 7-char prefix,
were individually plausible, and had to be corrected in a follow-up comment because issue comments
cannot be edited through the GitHub MCP tools.
