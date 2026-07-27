#!/bin/bash
set -euo pipefail

# Cloud (Claude Code on the web) only — a local session already runs on a branch
# the developer chose, and has no Netlify branch preview to point at. On a cloud
# session, SessionStart stdout is injected into Claude's context, so this prints
# the per-session branching + preview-URL convention. See docs/CLOUD/Claude.md.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cat <<'EOF'
Cloud-session workflow (Claude Code on the web):

1. After the first substantive request, work on a fresh `feat/<feature>` branch.
2. In restricted preview mode, a plain `feat/*` branch has no preview; do not
   claim or invent one.
3. Only when a live preview is needed, create and push a temporary `feature/*`
   branch from the working branch, then switch back.

See docs/CLOUD/Claude.md, "Per-session branch + Netlify preview" and "Two
preview modes — check which one is active", for the full process, current mode,
URL derivation, and command details.
EOF
