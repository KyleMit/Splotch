#!/usr/bin/env bash
set -euo pipefail

# Cloud (Claude Code on the web) only — locally `gh` is installed and works, so this
# rule must not fire there. On a cloud session, SessionStart stdout is injected into
# Claude's context, which is the only layer that reliably pre-empts a `gh` attempt.
# Full proof of why `gh` cannot work here: docs/adrs/0095-cloud-sessions-use-github-mcp-not-gh-cli.md
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cat <<'EOF'
GitHub access in this cloud session:

Use the GitHub MCP tools (`mcp__github__*`) for EVERY GitHub API interaction —
PRs, issues, comments, reviews, labels, releases, checks.

Do NOT use the `gh` CLI, and do not try to install or authenticate it. It is not
installed, and four separate layers make it unusable here: `GH_TOKEN` is inert (a
bogus value authenticates identically — the proxy injects the real credential),
`origin` is a loopback git proxy rather than a GitHub remote, GraphQL is refused,
and direct REST to api.github.com is refused. A failing `gh` command is never an
auth problem to fix — reach for the MCP tool instead.

Plain git (fetch/commit/push through `origin`) is unaffected and works normally.

Skills may list `gh` recipes for local use; in this session take the MCP branch.
See docs/CLOUD/Claude.md, "GitHub access", and ADR-0095.
EOF
