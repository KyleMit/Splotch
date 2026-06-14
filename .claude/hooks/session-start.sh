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
npm install

# Generate .svelte-kit types so `npm run check` and `npm run dev` work immediately.
npx svelte-kit sync
