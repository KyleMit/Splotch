#!/bin/bash
# Claude Code on the web — environment Setup script (committed; see docs/CLOUD/Claude.md, ADR-0021).
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

# Match the npm major that authors package-lock.json (local dev runs npm 11; the
# container image ships npm 10, whose install rewrites lockfile metadata in its
# own dialect and dirties the working tree every session — the two majors
# disagree on optional-peer entries, so no lockfile shape satisfies both).
# The SessionStart hook also discards such churn as a fallback if this pin is
# ever missing.
# Via npx so the installer isn't the npm being replaced — npm 10 updating itself
# in place dies halfway (MODULE_NOT_FOUND on its own half-overwritten files).
npx -y npm@11 install -g npm@11 \
  || echo "npm 11 pin skipped — sessions may see package-lock.json churn (the SessionStart hook discards it)"

# Chromium-only Playwright browser for the E2E tier. Derive the version from the repo's
# @playwright/test (package.json) so the installed Chromium revision matches what
# playwright-core resolves at test time. A hard-coded version drifts silently — e.g.
# pinning 1.60.0 (Chromium 1223) while the repo resolves 1.61.x (Chromium 1228) leaves
# the pinned revision absent, the #1 cloud-session E2E failure. driver.mjs and
# playwright.config.ts self-heal past a stale snapshot, but keeping this in sync avoids
# needing the fallback at all.
# Needs cdn.playwright.dev + playwright.download.prss.microsoft.com on the allowlist.
PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')" 2>/dev/null || true)"
npx --yes "playwright@${PW_VERSION:-1.61.1}" install --with-deps chromium \
  || echo "playwright browser install skipped — allowlist cdn.playwright.dev?"

# Phone-preview reverse-tunnel client (ADR-0021). Cached into the snapshot at a persisted
# path so later sessions skip the download. Pinned to the version docs/CLOUD/Claude.md references.
CHISEL_VERSION=1.10.1
if ! command -v chisel >/dev/null 2>&1; then
  curl -sSL "https://github.com/jpillora/chisel/releases/download/v${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_amd64.gz" \
    | gunzip > /usr/local/bin/chisel && chmod +x /usr/local/bin/chisel \
    && echo "chisel ${CHISEL_VERSION} installed to /usr/local/bin/chisel" \
    || echo "chisel install skipped — check github release-asset egress"
fi
