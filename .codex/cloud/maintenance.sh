#!/usr/bin/env bash
# Manually paste or sync this script into the Codex Cloud environment-maintenance UI.
set -euo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm ci --prefer-offline --no-audit --fund=false
node scripts/web.mjs playwright install chromium
node scripts/web.mjs svelte-kit sync
