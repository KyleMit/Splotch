#!/usr/bin/env bash
# Manually paste or sync this script into the Codex Cloud environment-creation UI.
#
# Best-effort by design: `set -e` is intentionally omitted. A failed step prints a loud,
# greppable "CODEX SETUP WARNING" banner and the script keeps going, so one bad step — most
# often an npm-version/lockfile disagreement (see docs/CLOUD/Codex.md) — doesn't abort the
# whole environment build and leave the container unusable. The banners surface in the setup
# log for the chat session to notice and act on, and a summary of every failure prints at the
# end. The script still exits 0 so Codex treats the environment as created.
set -uo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"

warnings=()
warn() {
  warnings+=("$1")
  {
    echo ""
    echo "########################################################################"
    echo "# ⚠️  CODEX SETUP WARNING"
    echo "# $1"
    echo "########################################################################"
    echo ""
  } >&2
}

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor < 12) {
    console.error(`Expected Node 22.12+; found ${process.version}.`);
    process.exit(1);
  }
' || warn "Node version check failed — expected Node 22.12+ (found $(node --version)). Later steps may misbehave."

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm ci --prefer-offline --no-audit --fund=false \
  || warn "npm ci failed — dependencies are incomplete. Usually a package-lock.json/npm-version mismatch; run 'npm install' locally and commit the refreshed lockfile."
node scripts/web.mjs playwright install --with-deps chromium \
  || warn "Playwright Chromium install failed — the E2E test tier will not run."
node scripts/web.mjs svelte-kit sync \
  || warn "svelte-kit sync failed — SvelteKit generated types may be missing until it is re-run."

if [ "${#warnings[@]}" -gt 0 ]; then
  {
    echo ""
    echo "==> Codex setup finished with ${#warnings[@]} warning(s):"
    for w in "${warnings[@]}"; do echo "    - $w"; done
    echo "==> The environment is up but may be incomplete; address the warnings above."
  } >&2
fi
