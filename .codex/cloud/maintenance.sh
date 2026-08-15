#!/usr/bin/env bash
# Manually paste or sync this script into the Codex Cloud environment-maintenance UI.
#
# Best-effort by design: `set -e` is intentionally omitted. A failed step prints a loud,
# greppable "CODEX MAINTENANCE WARNING" banner and the script keeps going, so one bad step —
# most often an npm-version/lockfile disagreement (see docs/CLOUD/Codex.md) — doesn't abort the
# whole refresh and leave the cached container half-updated. The banners surface in the log for
# the chat session to notice and act on, and a summary of every failure prints at the end. The
# script still exits 0 so Codex treats the maintenance run as successful.
set -uo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"

warnings=()
warn() {
  warnings+=("$1")
  {
    echo ""
    echo "########################################################################"
    echo "# ⚠️  CODEX MAINTENANCE WARNING"
    echo "# $1"
    echo "########################################################################"
    echo ""
  } >&2
}

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

# Provision pnpm at the packageManager-pinned version — see docs/CLOUD/Codex.md.
corepack enable pnpm && corepack install \
  || warn "pnpm setup skipped — the install below will fail until corepack can provision pnpm."

pnpm install --frozen-lockfile --prefer-offline \
  || warn "pnpm install failed — dependencies may be stale or incomplete. Usually pnpm-lock.yaml disagreeing with package.json; run 'pnpm install' locally and commit the refreshed lockfile."
node tools/run-web-tool.mjs playwright install chromium \
  || warn "Playwright Chromium install failed — the E2E test tier may not run until the browser is cached."
node tools/run-web-tool.mjs svelte-kit sync \
  || warn "svelte-kit sync failed — SvelteKit generated types may be missing until it is re-run."

if [ "${#warnings[@]}" -gt 0 ]; then
  {
    echo ""
    echo "==> Codex maintenance finished with ${#warnings[@]} warning(s):"
    for w in "${warnings[@]}"; do echo "    - $w"; done
    echo "==> The container is usable but may be incomplete; address the warnings above."
  } >&2
fi
