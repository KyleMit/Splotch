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

# Pin npm to the major/patch that authors package-lock.json (local dev runs npm 11.13+, Claude
# Cloud 11.18; the Codex image ships npm 11.4.2, an older 11.x patch that disagrees on optional-peer
# lockfile entries — it demands a nested svelte-check/node_modules/picomatch entry that newer npm
# omits, so `npm ci` fails with "Missing: picomatch@… from lock file"). Matching npm@11 (latest 11.x)
# removes the disagreement. Mirrors .claude/cloud/setup.sh; see docs/CLOUD/Codex.md.
# Via npx so the installer isn't the npm being replaced (an in-place self-update can die halfway).
npx -y npm@11 install -g npm@11 \
  || warn "npm 11 pin skipped — npm ci may fail on a package-lock.json/npm-version optional-peer mismatch."

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
