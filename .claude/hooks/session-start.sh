#!/usr/bin/env bash
set -euo pipefail

# Cloud (Claude Code on the web) only — local sessions manage their own deps.
# See docs/CLOUD/Claude.md.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Node deps. A plain `pnpm install` (not --frozen-lockfile) so the result carries
# into the environment cache and stays correct when package.json changes between
# rebuilds — which also means an install that resolves anything new rewrites the
# lockfile. A session should not open on lockfile churn it did not author, so
# discard that, but never touch a lockfile that already had edits.
lock_was_clean=false
if git diff --quiet -- pnpm-lock.yaml 2>/dev/null; then lock_was_clean=true; fi

# Not fatal under `set -e`: a dead install must not kill the hook silently and
# leave the session with no deps at all. There is no --ignore-scripts retry any
# more — pnpm runs no dependency install script unless pnpm-workspace.yaml's
# allowBuilds names it, and none are named, so the old failure this retried
# around (old sharp fetching libvips from GitHub releases, which 403s through the
# session's egress proxy) can no longer happen.
if ! pnpm install; then
  echo "session-start.sh: pnpm install failed — this session has no dependencies (docs/CLOUD/Claude.md 'Getting dependencies ready')" >&2
fi

if [ "$lock_was_clean" = true ] && ! git diff --quiet -- pnpm-lock.yaml; then
  git checkout -- pnpm-lock.yaml
fi

# Generate web/.svelte-kit types so `npm run check` and `npm run dev` work
# immediately (the SvelteKit app lives in web/, so sync must run there —
# ADR-0024; tools/run-web-tool.mjs is the cwd shim).
node tools/run-web-tool.mjs svelte-kit sync ||
  echo 'session-start.sh: svelte-kit sync failed — rerun node tools/run-web-tool.mjs svelte-kit sync before using npm run check'
