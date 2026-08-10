#!/usr/bin/env bash
set -euo pipefail

# Cloud (Claude Code on the web) only — local sessions manage their own deps.
# See docs/CLOUD/Claude.md.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Node deps. `npm install` (not `npm ci`) so the result carries into the
# environment cache and stays correct when package.json changes between rebuilds.
#
# .claude/cloud/setup.sh pins npm@11 to match package-lock.json's authoring major.
# If the pin is ever missing, a different npm rewrites lockfile metadata in its own
# dialect (docs/CLOUD/Claude.md, "npm-version note") — discard that churn, but
# never touch a lockfile that already had edits.
lock_was_clean=false
if git diff --quiet -- package-lock.json 2>/dev/null; then lock_was_clean=true; fi

# A dependency lifecycle script that fetches from outside the npm registry (old
# sharp's libvips download from GitHub releases was one — see the sharp entry in
# package.json `overrides`) 403s through the session's egress proxy, and under
# `set -e` that used to kill this hook silently, leaving the session with no
# deps at all. Fall back to skipping lifecycle scripts — the repo itself defines
# none, so an --ignore-scripts install still reproduces the working tree.
if ! npm install; then
  echo "session-start.sh: npm install failed — retrying with --ignore-scripts (docs/CLOUD/Claude.md 'Getting dependencies ready')"
  npm install --ignore-scripts
fi

if [ "$lock_was_clean" = true ] && ! git diff --quiet -- package-lock.json; then
  git checkout -- package-lock.json
fi

# Generate web/.svelte-kit types so `npm run check` and `npm run dev` work
# immediately (the SvelteKit app lives in web/, so sync must run there —
# ADR-0024; tools/web.mjs is the cwd shim).
node tools/web.mjs svelte-kit sync ||
  echo 'session-start.sh: svelte-kit sync failed — rerun node tools/web.mjs svelte-kit sync before using npm run check'
