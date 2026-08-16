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
  const floor = require("./package.json").engines.node.replace(/^>=/, "");
  const [floorMajor, floorMinor = 0] = floor.split(".").map(Number);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < floorMajor || (major === floorMajor && minor < floorMinor)) {
    console.error(`Expected Node ${floor}+ (package.json engines); found ${process.version}.`);
    process.exit(1);
  }
' || warn "Node version check failed — expected the package.json engines floor (found $(node --version)). Later steps may misbehave."

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

# Put pnpm on PATH at the exact version package.json's packageManager pins.
# `corepack install` with no argument reads that field, so the version lives in one
# place; full rationale in docs/CLOUD/Codex.md.
corepack enable pnpm && corepack install \
  || warn "pnpm setup skipped — the install below will fail until corepack can provision pnpm."

pnpm install --frozen-lockfile --prefer-offline \
  || warn "pnpm install failed — dependencies are incomplete. Usually pnpm-lock.yaml disagreeing with package.json; run 'pnpm install' locally and commit the refreshed lockfile."
node tools/run-web-tool.mjs playwright install --with-deps chromium \
  || warn "Playwright Chromium install failed — the E2E test tier will not run."
node tools/run-web-tool.mjs svelte-kit sync \
  || warn "svelte-kit sync failed — SvelteKit generated types may be missing until it is re-run."

if [ "${#warnings[@]}" -gt 0 ]; then
  {
    echo ""
    echo "==> Codex setup finished with ${#warnings[@]} warning(s):"
    for w in "${warnings[@]}"; do echo "    - $w"; done
    echo "==> The environment is up but may be incomplete; address the warnings above."
  } >&2
fi
