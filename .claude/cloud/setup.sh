#!/usr/bin/env bash
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

cd "${CLAUDE_PROJECT_DIR:-$PWD}"

warnings=()
warn() {
  warnings+=("$1")
  {
    echo ""
    echo "########################################################################"
    echo "# ⚠️  CLAUDE SETUP WARNING"
    echo "# $1"
    echo "########################################################################"
    echo ""
  } >&2
}

# Put pnpm on PATH at the exact version package.json's packageManager pins, and
# download it now so it lands in the environment snapshot instead of costing every
# session its first-run fetch. `corepack install` with no argument reads that field,
# so the version lives in one place (docs/CLOUD/Claude.md, "package manager note").
corepack enable pnpm && corepack install \
  || warn "pnpm setup skipped — the SessionStart hook's install will fail until corepack can provision pnpm"

# Chromium-only Playwright browser for the E2E tier. Derive the version from the repo's
# @playwright/test (package.json) so the installed Chromium revision matches what
# playwright-core resolves at test time. A hard-coded version drifts silently — e.g.
# pinning 1.60.0 (Chromium 1223) while the repo resolves 1.61.x (Chromium 1228) leaves
# the pinned revision absent, the #1 cloud-session E2E failure. driver.mjs and
# playwright.config.ts self-heal past a stale snapshot, but keeping this in sync avoids
# needing the fallback at all.
# Needs cdn.playwright.dev + playwright.download.prss.microsoft.com on the allowlist.
PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')" 2>/dev/null || true)"
if [[ "$PW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  npx --yes "playwright@${PW_VERSION}" install --with-deps chromium \
    || warn "playwright browser install skipped — allowlist cdn.playwright.dev?"
else
  warn "playwright browser install skipped — could not derive a numeric @playwright/test version from package.json"
fi

# Phone-preview reverse-tunnel client (ADR-0021). Cached into the snapshot at a persisted
# path so later sessions skip the download. Pinned to the version docs/CLOUD/Claude.md references.
CHISEL_VERSION=1.10.1
if ! command -v chisel >/dev/null 2>&1; then
  curl -sSL "https://github.com/jpillora/chisel/releases/download/v${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_amd64.gz" \
    | gunzip > /usr/local/bin/chisel && chmod +x /usr/local/bin/chisel \
    && echo "chisel ${CHISEL_VERSION} installed to /usr/local/bin/chisel" \
    || warn "chisel install skipped — check github release-asset egress"
fi

# Optional per-environment extras. SPLOTCH_CLOUD_PROFILE is a comma-separated list set in the
# environment dialog, so one committed setup script serves several environments and the default
# box stays lean — the android profile alone adds ~5 GB and several minutes to the snapshot build.
# See .claude/cloud/environment.android.example and .claude/cloud/ANDROID-EMULATOR.md.
case ",${SPLOTCH_CLOUD_PROFILE:-}," in
  *,android,*)
    # shellcheck source=./setup-android-emulator.sh
    . "$PWD/.claude/cloud/setup-android-emulator.sh" \
      || warn "android emulator provisioning failed — the android profile's environment has no working emulator"
    ;;
esac

if [ "${#warnings[@]}" -gt 0 ]; then
  {
    echo ""
    echo "==> Claude setup finished with ${#warnings[@]} warning(s):"
    for w in "${warnings[@]}"; do echo "    - $w"; done
    echo "==> The environment is up but may be incomplete; address the warnings above."
  } >&2
fi
