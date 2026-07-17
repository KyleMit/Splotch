# Handoff — Codex Cloud environment

> 2026-07-17 · branch `work` · stand up a reproducible, fast Codex Cloud environment for Splotch

## Objective & non-goals

Configure a new Codex Cloud environment so a new task starts with the Splotch web toolchain,
dependencies, Playwright Chromium, and SvelteKit generated types ready to use. Keep both initial
setup and cached-container maintenance fast.

This handoff does not change application code, revise the Claude Cloud configuration, build native
targets, or create a tunnel/phone-preview path for Codex.

## State

| Item | Value |
| --- | --- |
| Branch | `work` |
| PR | None |
| Commits for this work | Pending handoff commit only |
| Files touched | `docs/handoff/codex-cloud-environment.md` |

The local clone currently has no configured Git remote, so the handoff cannot be pushed from this
container. Commit it locally, then push it from the environment with the intended remote before
starting the replacement session.

## Decisions made and why

### Codex package and cache settings

* Choose **Node.js 22**, the highest Codex Cloud image option. Select the latest available Node 22
  patch release: resolved Vite 8.1.0 requires Node `^20.19.0 || >=22.12.0`. Do not depend on an
  early Node 22 patch release.
* Leave the other language package choices at their defaults. The normal Splotch web workflow only
  depends on Node/npm; do not provision Android/iOS toolchains, emulators, or Xcode.
* Leave container caching enabled. Set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` so the cached
  Playwright browser location is stable and recognized by `web/playwright.config.ts`.
* Do **not** force npm 11. Codex does not expose npm version selection. Use `npm ci`, which
  installs from `package-lock.json` without modifying it; it avoids the npm 10/11 lockfile churn
  workaround that the Claude session hook needs because it uses `npm install`.

### Codex network and variables

Enable internet for both setup and maintenance. Allow at least:

```text
registry.npmjs.org
cdn.playwright.dev
playwright.download.prss.microsoft.com
```

Set as a non-secret environment variable:

```text
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
```

Only add these secrets if an actual task calls the hosted services; do not put them in scripts,
instructions, or Git:

```text
GEMINI_API_KEY
ADMIN_ACCESS_TOKEN
ALLOWED_TOKENS_LIST
```

Do not add `TUNNEL_AUTH` or `TUNNEL_HOST` initially. They are Claude Cloud’s Chisel/Fly phone
preview machinery, not a dependency of Splotch’s normal Codex workflow.

### Fast deterministic Codex setup script

Paste this script into the Codex Cloud **setup** field. It deliberately omits `npm run check` and
`npm run test:unit`: they validate the repository but do not make the environment usable, so they
slow boot with no setup benefit.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"

node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$node_major" != "22" ]; then
  echo "Expected Node 22; found $(node --version)." >&2
  exit 1
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm ci

playwright_version="$(
  node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')"
)"
npx --yes "playwright@${playwright_version}" install chromium

node scripts/web.mjs svelte-kit sync
```

### Fast deterministic Codex maintenance script

Paste this script into Codex Cloud **maintenance**. It runs after a cached container resumes and
the target branch has been checked out. Retain `npm ci` even for branches based on `main`: it
removes dependencies left by another branch and reconciles exactly to the checked-out lockfile.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "${CODEX_PROJECT_DIR:-$PWD}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm ci

playwright_version="$(
  node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')"
)"
npx --yes "playwright@${playwright_version}" install chromium

node scripts/web.mjs svelte-kit sync
```

## Unverified assumptions

* The current Codex Cloud setup/maintenance working directory is the repository root, or it exposes
  `CODEX_PROJECT_DIR`. Both scripts fall back to `$PWD`; confirm the documented working-directory
  contract before saving them.
* Node 22 supplied by Codex Cloud is at least 22.12.0. Verify with `node --version` in the new
  environment before relying on Vite.
* The Codex cache preserves `/opt/pw-browsers`. If it does not, the maintenance command remains
  correct but downloads Chromium on each resume.
* The three proposed domains are sufficient for `npm ci` and Playwright in Codex Cloud. Add further
  domains only in response to a concrete blocked request.
* Codex Cloud’s own preview/browser mechanics have not been evaluated; do not carry the Claude
  Chisel tunnel across without a demonstrated need.

## Done & verified

| Check | Result |
| --- | --- |
| Inspected package lock engine metadata | Vite 8.1.0 requires Node `^20.19.0 || >=22.12.0`; Node 22 is supported. |
| Inspected root package metadata | No committed `engines` or `packageManager`; `postinstall` runs `patch-package`. |
| Inspected Claude Cloud setup/hook and Playwright config | Confirmed dynamic Playwright version derivation, SvelteKit sync, and `/opt/pw-browsers` fallback support. |
| Fetch Codex public docs / `openai/codex-universal` | Not verified: this session’s documentation/web access returned authorization failures. |

No application source code has changed and no full test suite was run.

## Risks & next 3 steps

1. In Codex Cloud, select Node 22 (latest patch), enable caching and setup/maintenance internet, add
   the three allowlisted domains, and set `PLAYWRIGHT_BROWSERS_PATH`.
2. Paste the scripts above, create a fresh environment, and run `node --version`, `npm --version`,
   `test -d node_modules`, `test -d /opt/pw-browsers`, `npm run check`, and `npm run test:unit` as a
   one-time acceptance validation.
3. If setup fails, capture the exact blocked host/error; add only that host or adjust the script.
   If the initial validation succeeds, let normal tasks run relevant checks after their edits rather
   than testing at every boot.

## Reread first

* [Codex Cloud setup documentation](https://learn.chatgpt.com/docs/cloud#setup-scripts) — user
  supplied; consult for the exact setup/maintenance working-directory and cache contract.
* [Codex Universal](https://github.com/openai/codex-universal) — user supplied; consult for the
  current base-image/package details.
* [`docs/CLOUD.md`](../CLOUD.md) — Claude Code Cloud behavior and its networking constraints.
* [`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh) — Claude initial cache bootstrap.
* [`.claude/cloud/environment.example`](../../.claude/cloud/environment.example) — Claude allowed
  domains and secret reference.
* [`.claude/hooks/session-start.sh`](../../.claude/hooks/session-start.sh) — Claude per-session
  dependency/type preparation.
* [`web/playwright.config.ts`](../../web/playwright.config.ts) — browser cache and E2E expectations.
* [`AGENTS.md`](../../AGENTS.md) — repo-wide agent workflow and test commands.
