#!/bin/bash
# Claude Code on the web — environment Setup script (committed; see docs/CLOUD.md, ADR-0021).
#
# The env-config "Setup script" field can't be version-controlled, so keep it a one-liner
# that execs this file, and edit the real logic here under review:
#
#   bash .claude/cloud/setup.sh
#
# Repo-independent, cacheable installs only — node deps come from the SessionStart hook
# (.claude/hooks/session-start.sh). Everything here is best-effort: a blocked download must
# never block session startup, so each step swallows its own failure.
set -uo pipefail

# Chromium-only Playwright browser for the E2E tier, pinned to the repo's @playwright/test
# version. Needs cdn.playwright.dev + playwright.download.prss.microsoft.com on the allowlist.
npx --yes playwright@1.60.0 install --with-deps chromium \
  || echo "playwright browser install skipped — allowlist cdn.playwright.dev?"

# Phone-preview reverse-tunnel client (ADR-0021). Cached into the snapshot at a persisted
# path so later sessions skip the download. Pinned to the version docs/CLOUD.md references.
CHISEL_VERSION=1.10.1
if ! command -v chisel >/dev/null 2>&1; then
  curl -sSL "https://github.com/jpillora/chisel/releases/download/v${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_amd64.gz" \
    | gunzip > /usr/local/bin/chisel && chmod +x /usr/local/bin/chisel \
    && echo "chisel ${CHISEL_VERSION} installed to /usr/local/bin/chisel" \
    || echo "chisel install skipped — check github release-asset egress"
fi
