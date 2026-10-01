#!/usr/bin/env bash
# Manually paste or sync this script into the Codex Cloud environment-maintenance UI.
#
# Failures stay non-fatal so the cached container remains available for troubleshooting.
# Warning banners and the final summary distinguish an incomplete refresh from readiness.
set -uo pipefail

project_dir="${CODEX_PROJECT_DIR:-$PWD}"
if [ -z "${CODEX_PROJECT_DIR:-}" ] && [ ! -f "$project_dir/pnpm-lock.yaml" ]; then
  project_dir=/workspace/Splotch
fi
cd "$project_dir" || exit 1

export COREPACK_HOME="${COREPACK_HOME:-/workspace/.cache/corepack}"
export npm_config_cache="${npm_config_cache:-/workspace/.cache/npm}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/workspace/.cache/ms-playwright}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/workspace/.cache/data}"
export DPRINT_CACHE_DIR="${DPRINT_CACHE_DIR:-/workspace/.cache/dprint}"
export PATH="/workspace/.cache/bin:$PATH"

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

mkdir -p /workspace/.cache/bin "$COREPACK_HOME" "$npm_config_cache" \
  /workspace/.cache/pnpm-store "$PLAYWRIGHT_BROWSERS_PATH" "$XDG_CACHE_HOME" \
  "$XDG_DATA_HOME" "$DPRINT_CACHE_DIR" \
  || warn "Cache directories could not be prepared — check their write permissions."

node - <<'NODE'
const floor = require('./package.json').engines.node.replace(/^>=/, '').split('.').map(Number);
const current = process.versions.node.split('.').map(Number);
for (let index = 0; index < floor.length; index++) {
  if (current[index] > floor[index]) break;
  if (current[index] < floor[index]) {
    console.error(`Node ${process.version} does not satisfy package.json engines.node`);
    process.exit(1);
  }
}
NODE
if [ "$?" -ne 0 ]; then
  warn "Node version check failed — use a runtime satisfying package.json engines.node."
fi

corepack enable --install-directory /workspace/.cache/bin pnpm && corepack install \
  || warn "pnpm setup skipped — the install below will fail until corepack can provision pnpm."

node .agents/skills/run-rival-agent/scripts/install-cloud.mjs \
  || warn "Claude rival refresh failed — check registry.npmjs.org access and the writable CLI/wrapper caches."

pnpm install --frozen-lockfile --prefer-offline --store-dir /workspace/.cache/pnpm-store \
  || warn "pnpm install failed — dependencies may be stale or incomplete. Usually pnpm-lock.yaml disagreeing with package.json; run 'pnpm install' locally and commit the refreshed lockfile."
node tools/run-web-tool.mjs svelte-kit sync \
  || warn "svelte-kit sync failed — SvelteKit generated types may be missing until it is re-run."

if [ -z "${PLAYWRIGHT_CHROMIUM:-}" ]; then
  node tools/run-web-tool.mjs playwright install chromium \
    || warn "Playwright Chromium install failed — check browser download access."
fi

node --input-type=module - <<'NODE'
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from './tools/lib/playwright.mjs';
const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
try {
  const page = await browser.newPage();
  await page.setContent('<canvas id="canvas" width="100" height="100"></canvas>');
  const pixel = await page.evaluate(() => {
    const context = document.getElementById('canvas').getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 100, 100);
    return Array.from(context.getImageData(50, 50, 1, 1).data);
  });
  if (JSON.stringify(pixel) !== '[255,0,0,255]') throw new Error('Chromium canvas check failed');
  console.log(`Chromium ${await browser.version()}: canvas check passed`);
} finally {
  await browser.close();
}
NODE
if [ "$?" -ne 0 ]; then
  warn "Chromium readiness failed — check PLAYWRIGHT_CHROMIUM or install the pinned browser and its Linux libraries."
fi

if [ "${#warnings[@]}" -gt 0 ]; then
  {
    echo ""
    echo "==> Codex maintenance finished with ${#warnings[@]} warning(s):"
    for w in "${warnings[@]}"; do echo "    - $w"; done
    echo "==> The container is usable but may be incomplete; address the warnings above."
  } >&2
fi
