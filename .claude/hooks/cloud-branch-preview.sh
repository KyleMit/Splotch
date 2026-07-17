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
Cloud-session workflow (Claude Code on the web) — follow this for every session:

1. One feature, one `feat/` branch off main. After the user's first substantive
   request, and before writing any code, fork a fresh branch from the latest
   origin/main named `feat/<feature>`, where <feature> is a short kebab-case
   summary of the request (e.g. "add an undo button" -> feat/undo-button). Do
   this even if the session opened on a different auto-generated branch:
     git fetch origin main && git checkout -B feat/<feature> origin/main
   Commit all work there and push it:
     git push -u origin feat/<feature>

2. Netlify preview mode. The "splotchy" site runs in one of two modes (see
   docs/CLOUD/Claude.md "Two preview modes"):
     - Full: PR deploy previews + branch previews on every branch.
     - Restricted: PR previews off; branch previews build ONLY for feature/*
       branches. Every other branch (including feat/* and claude/*) is pushed
       but NOT deployed, so it has no preview URL.
   CURRENT MODE: restricted (as of 2026-07-09). Assume a plain `feat/*` push
   produces NO live preview.

3. Hand back a preview URL only when one exists. A branch preview auto-deploys
   to https://<slug>--splotchy.netlify.app, where <slug> is the branch name with
   every non-alphanumeric character replaced by "-" (feature/undo-button ->
   feature-undo-button--splotchy.netlify.app). The deploy takes a minute or two;
   the URL is stable for the branch, so the same link tracks every later push.
     - In restricted mode this URL only exists for feature/* branches, so a
       normal feat/* session has no preview to hand back — don't invent one.
     - If a live preview is genuinely needed (Lighthouse profiling, or the user
       asks to see the changes running live), fork the current working branch to
       a feature/* branch and push it to trigger the deploy, then switch back to
       keep working:
         git checkout -b feature/<feature>
         git push -u origin feature/<feature>
         git checkout -
       Don't keep the feature/* branch mirrored — only refresh it when the user
       asks. Then hand back its <slug>--splotchy.netlify.app URL.
EOF
