#!/usr/bin/env bash
# Manually paste or sync this script into the Codex Cloud environment-creation UI.
set -euo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor < 12) {
    console.error(`Expected Node 22.12+; found ${process.version}.`);
    process.exit(1);
  }
'

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm ci --prefer-offline --no-audit --fund=false
node scripts/web.mjs playwright install --with-deps chromium
node scripts/web.mjs svelte-kit sync
