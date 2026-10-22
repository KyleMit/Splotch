# Splotch cloud startup

Use the existing checkout at `/workspace/Splotch`, or `CODEX_PROJECT_DIR` when configured. Each
cloud task is already isolated; do not create a Git worktree unless the user explicitly requests
one. Read the repository's `AGENTS.md` and relevant nested instructions. Preserve user changes and
keep tracked files, dependency declarations, and lockfiles unchanged during environment setup.

The snapshot retains dependencies, Corepack/pnpm caches, generated SvelteKit types, and installed
browsers. Live servers do not survive publication or new tasks and must be restarted.

Activate the tools in each shell:

```bash
cd "${CODEX_PROJECT_DIR:-/workspace/Splotch}"
export COREPACK_HOME="${COREPACK_HOME:-/workspace/.cache/corepack}"
export npm_config_cache="${npm_config_cache:-/workspace/.cache/npm}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/workspace/.cache/ms-playwright}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/workspace/.cache/data}"
export DPRINT_CACHE_DIR="${DPRINT_CACHE_DIR:-/workspace/.cache/dprint}"
export PATH="/workspace/.cache/bin:$PATH"
```

Node must satisfy `package.json`'s `engines.node`; pnpm's exact version comes from `packageManager`.
Install with pnpm and run scripts with npm. If dependencies need refreshing, run
`bash .codex/cloud/maintenance.sh`. Setup and maintenance report failures through warning banners
and a final summary while keeping the container usable; an exit code of zero alone does not prove
readiness. Investigate warnings before continuing. Never use `npm install` or `npm ci` in the
checkout.

The standard workflow is local SvelteKit web development and Chromium testing. No secrets are
required. This environment configures `PLAYWRIGHT_CHROMIUM=/usr/bin/chromium`, the
repository-supported override, because the pinned browser CDN download was blocked by network
policy. Setup and maintenance validate the selected browser by launching it and painting a canvas.
When that override is unset, the scripts install the browser revision pinned by the installed
Playwright package; setup also installs its Linux libraries. Native toolchains, real model calls,
Netlify deployment, and hosted Blobs integration require separate setup. Firefox, WebKit, and
visual-baseline parity have not been validated.

Build the RN web export before opening it:

```sh
npm run check
npm run test:unit
npm run build:site
SPLOTCH_PREVIEW_PORT=$(npm --silent run show:free-port)
node e2e/server/serve.ts --port "$SPLOTCH_PREVIEW_PORT"
```

Retain the server's process handle. The local host serves the export and the real Netlify Function
under isolated credentials from `e2e/server/serverEnv.ts`; it reads no dotenv or model secrets. Use
the selected port for readiness checks and inspect the drawing screen in a real browser. On
`EADDRINUSE`, select another port. Stop only a server this task started, and never expose this test
host as a public preview.

For a representative browser check, let Playwright own its server:

```sh
SPLOTCH_E2E_PORT=$(npm --silent run show:free-port)
SPLOTCH_E2E_PORT="$SPLOTCH_E2E_PORT" npm run test:e2e -- persistence.spec.ts --project=chromium --workers=1
```

Use `SPLOTCH_E2E_PREBUILT=1` only immediately after building the same checkout. Do not run builds or
mutating tests over an export while a browser check is reading it.

For the local HTTP contract, stop this task's dev server, select
`SPLOTCH_SMOKE_PORT=$(npm --silent run show:free-port)`, then run
`SMOKE_PORT="$SPLOTCH_SMOKE_PORT" npm run test:api:smoke`. This runner supplies isolated test
credentials, makes no model calls, and cleans up its server. Read the repository's testing and API
skills before extending these checks.

Inspect `git status --short` before and after setup. Expected outputs belong in ignored paths or
`/workspace/.cache`; investigate any tracked change and undo only unintended changes made by this
task.

## Claude rival reviews

Setup and maintenance install a pinned Claude Code CLI separately from the app dependencies, plus
hashed trusted wrappers at `/workspace/.cache/splotch-rival-agent`. Before using the
`run-rival-agent` skill, run:

```bash
node .agents/skills/run-rival-agent/scripts/install-cloud.mjs --check
/workspace/.cache/splotch-rival-agent/claude-health.mjs
```

Use the configured `CLAUDE_CODE_OAUTH_TOKEN`, proxy, and CA trust; do not reveal the token or launch
an interactive login. Authentication status is a local configuration check, so validate actual
remote access with a small question round before the first review. Read the skill's **Codex Cloud**
section for the fixed launcher, broker, and PR publication instructions. Claude reads its disposable
worktree and packet with restricted file tools and requests every command through the Codex broker.
The platform controls approvals; no desktop Codex policy or Keychain setup is needed here.

Missing or stale wrapper bytes need a setup/maintenance refresh from the trusted canonical checkout.
Never copy wrappers from the rival's reviewed worktree. Review transcripts and the round ledger are
under `/workspace/.cache`, and may survive container caching; live reviewer processes must be
restarted for a new task. Pass `--fresh` for the first review of new work so a reused branch name
does not resume another task's reviewer; omit it for subsequent rounds of the same review. GitHub
CLI access for `--pr` and automatic posting needs separate validation. A local branch or commit
review can use the native GitHub app for publication.

The source files for this configuration are `.codex/cloud/setup.sh`, `.codex/cloud/maintenance.sh`,
and `.codex/cloud/start.md`. Sync their contents to the environment settings and any local copies
manually when needed.
