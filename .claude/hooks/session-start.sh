#!/bin/bash
set -euo pipefail

# Cloud (Claude Code on the web) only — local sessions manage their own deps.
# See docs/CLOUD.md.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Node deps. `npm install` (not `npm ci`) so the result carries into the
# environment cache and stays correct when package.json changes between rebuilds.
#
# package-lock.json is authored by npm 11; .claude/cloud/setup.sh pins npm 11
# here to match. If the pin is ever missing (snapshot rebuild, image update), a
# different npm major rewrites lockfile metadata in its own dialect and dirties
# the tree at session start (npm 10 and 11 disagree on optional-peer entries, so
# no lockfile shape satisfies both — `--no-save` doesn't stop the repair either).
# Discard that churn, but never touch a lockfile that already had edits.
lock_was_clean=false
if git diff --quiet -- package-lock.json 2>/dev/null; then lock_was_clean=true; fi

# A dependency lifecycle script that fetches from outside the npm registry (old
# sharp's libvips download from GitHub releases was one — see the sharp entry in
# package.json `overrides`) 403s through the session's egress proxy, and under
# `set -e` that used to kill this hook silently, leaving the session with no
# deps at all. Fall back to skipping lifecycle scripts: patch-package is the
# only one the repo needs, so re-running it by hand reproduces the working tree.
if ! npm install; then
  echo "session-start.sh: npm install failed — retrying with --ignore-scripts + patch-package (docs/CLOUD.md 'Getting dependencies ready')"
  npm install --ignore-scripts
  npx patch-package
fi

if [ "$lock_was_clean" = true ] && ! git diff --quiet -- package-lock.json; then
  git checkout -- package-lock.json
fi

# Generate web/.svelte-kit types so `npm run check` and `npm run dev` work
# immediately (the SvelteKit app lives in web/, so sync must run there —
# ADR-0024; scripts/web.mjs is the cwd shim).
node scripts/web.mjs svelte-kit sync
