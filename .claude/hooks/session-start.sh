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
npm install
if [ "$lock_was_clean" = true ] && ! git diff --quiet -- package-lock.json; then
  git checkout -- package-lock.json
fi

# Generate .svelte-kit types so `npm run check` and `npm run dev` work immediately.
npx svelte-kit sync
