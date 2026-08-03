## Talking to GitHub

**The GitHub MCP tools (`mcp__github__*`) are the interface to the GitHub API.** Reach for them
first for PRs, issues, comments, reviews, labels, releases, and checks.

The `gh` CLI is a **local-only** convenience. In a Claude Code on the web cloud session it is not
installed and cannot be made to work — `GH_TOKEN` is inert (the egress proxy injects the real
credential, so even a bogus value authenticates), `origin` is a loopback git proxy rather than a
GitHub remote, GraphQL is refused, and direct REST to `api.github.com` is refused. A `gh` failure
there is never an auth problem to fix: use the MCP tool.
[ADR-0095](../docs/adrs/0095-cloud-sessions-use-github-mcp-not-gh-cli.md) has the probes and the
rejected alternatives — do not re-derive them by installing `gh` or hunting for a token.

Plain git (`fetch`, `commit`, `push`) is unaffected in both environments. Where a skill offers a
`gh` recipe and an MCP equivalent, the `gh` one is for local sessions only.

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
