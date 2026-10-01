# Cloud environments — Codex Cloud

How to prepare a reproducible Codex Cloud environment for Splotch. The files under `.codex/cloud/`
are the version-controlled source of truth for installation, maintenance, and agent startup. Copy
their contents into the corresponding environment settings manually when needed. Record changes to
external environment settings in this guide alongside the scripts; reconcile the repository and
Codex Cloud settings manually.

## Environment settings

* Select the latest available Node 22 patch. The required floor is declared once in the root
  `package.json` `engines.node`; `.codex/cloud/setup.sh` derives its version check from it, so an
  unsupported selection produces a setup warning. (The "22" here is drift-guarded against `engines`
  by `tools/tests/workflow-hygiene.test.mjs`.)
* Enable container caching and internet access for both setup and maintenance.
* The scripts default to writable caches under `/workspace/.cache`: `COREPACK_HOME` uses
  `/workspace/.cache/corepack`, `npm_config_cache` uses `/workspace/.cache/npm`, and
  `PLAYWRIGHT_BROWSERS_PATH` uses `/workspace/.cache/ms-playwright`. Existing values are respected.
  Corepack's pnpm shim is created in `/workspace/.cache/bin`; the startup instructions activate it
  in every shell.
* Set `PLAYWRIGHT_CHROMIUM=/usr/bin/chromium` when using the base image's installed Chromium. This
  environment uses that override because its network policy blocked the pinned browser download.
  Setup and maintenance skip the download when an override is configured and verify that the
  selected browser launches and paints a canvas. Unset the override to install Playwright's pinned
  browser; setup also installs its Linux libraries, while maintenance reuses them.
* Allow `registry.npmjs.org`, `cdn.playwright.dev`, and `playwright.download.prss.microsoft.com`.
  Add another domain only after recording a concrete blocked request.
* GitHub CLI pull-request operations use `api.github.com`. Test the intended repository operation
  with the platform's injected authentication: generic API probes or `gh auth status` can fail while
  scoped pull-request calls work. Add the hostname only when the intended operation is network
  blocked; a successful Git request alone does not establish API access.
* Add credentials only for the live services a task needs; local development and automated tests
  need none. Enter values securely in environment settings and keep secret values out of scripts and
  Git.

### Configured environment variables

This Codex Cloud machine uses the following nonsecret overrides, configured in its environment
settings and available to shell commands:

| Variable              | Configured value             | Purpose                                                         |
| --------------------- | ---------------------------- | --------------------------------------------------------------- |
| `COREPACK_HOME`       | `/workspace/.cache/corepack` | Store downloaded package managers in a writable cache.          |
| `npm_config_cache`    | `/workspace/.cache/npm`      | Keep npm's cache writable inside the cloud workspace.           |
| `PLAYWRIGHT_CHROMIUM` | `/usr/bin/chromium`          | Use the base image's Chromium for browser checks and E2E tests. |

Keep this table in sync with external environment settings by hand. These paths are specific to
Codex Cloud; local Corepack, npm, and Playwright normally use their own defaults. Leave the
overrides unset locally unless a local tool needs them. `web/.env` does not configure these tools.

The committed setup and startup instructions also apply the following defaults, rather than separate
environment-settings entries. Existing overrides are respected:

| Variable                   | Default                           | Purpose                                                                          |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `PLAYWRIGHT_BROWSERS_PATH` | `/workspace/.cache/ms-playwright` | Cache Playwright's downloaded browsers.                                          |
| `XDG_CACHE_HOME`           | `/workspace/.cache`               | Keep user-tool caches in writable storage.                                       |
| `XDG_DATA_HOME`            | `/workspace/.cache/data`          | Keep user-tool data, including pnpm's default store for test fixtures, writable. |
| `DPRINT_CACHE_DIR`         | `/workspace/.cache/dprint`        | Let Markdown formatting and formatter tests write their cache.                   |

The instructions prepend `/workspace/.cache/bin` to `PATH` in each shell to activate the pinned pnpm
shim. Apply that activation before running tooling tests; the base image's fallback pnpm can differ
from `package.json`'s `packageManager` version.

### Optional credentials

Choose credentials by workflow:

| Workflow                                    | Variables                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live app AI, admin, and feedback            | `OPENAI_API_KEY`, `ALLOWED_TOKENS_LIST`, `ADMIN_ACCESS_TOKEN`, `REPORT_TOKEN_SECRET`, and `GITHUB_ISSUE_TOKEN`; `USAGE_GRANT_ID_SECRET` enables durable usage tallies |
| Gemini asset generation or model evaluation | `GEMINI_API_KEY`; OpenAI evaluation uses `OPENAI_API_KEY`                                                                                                             |
| Encrypted red-team fixtures and evaluation  | `REDTEAM_FIXTURE_KEY`; live evaluation also needs `OPENAI_API_KEY`                                                                                                    |
| Vectorizer.AI                               | `VECTORIZER_ID` plus `VECTORIZER_SECRET`, or `VECTORIZER_AUTHORIZATION`                                                                                               |
| ElevenLabs sound generation                 | `ELEVENLABS_API_KEY`                                                                                                                                                  |
| Claude CLI plan authentication              | `CLAUDE_CODE_OAUTH_TOKEN`, only if an existing plan login is unavailable; the CLI itself needs separate installation                                                  |

`web/.env.example` documents the loading rules for each credential. A local `web/.env` is not
automatically copied to a cloud machine. API credentials also need access to their provider's
network destinations. HMAC signing keys, access-code lists, and the red-team decryption key need
their actual values available to the application or tool; network-proxy placeholders cannot supply
local cryptographic operations. GitHub repository access through the platform's Git proxy is
separate from `GITHUB_ISSUE_TOKEN`, which grants feedback-issue access.

### Secret destination domains

The **Manage secrets → Allowed domains** field controls which HTTPS destinations can receive a
secret through the proxy. Enter exact hostnames, without a scheme, path, or wildcard. Configure each
credential separately; an empty list leaves a proxy secret inert.

| Secret                     | Destination hostname                        |
| -------------------------- | ------------------------------------------- |
| `GEMINI_API_KEY`           | `generativelanguage.googleapis.com`         |
| `OPENAI_API_KEY`           | `api.openai.com`                            |
| `ELEVENLABS_API_KEY`       | `api.elevenlabs.io`                         |
| `GITHUB_ISSUE_TOKEN`       | `api.github.com`                            |
| `VECTORIZER_AUTHORIZATION` | `api.vectorizer.ai`                         |
| `CLAUDE_CODE_OAUTH_TOKEN`  | `api.anthropic.com` for Claude API requests |

These are the default provider destinations, not evidence that live calls have been validated.
Claude CLI installation and OAuth login/refresh have not been tested in this environment; diagnose
any additional authentication destination before extending that credential's allowed domains.

For Vectorizer proxy secrets, use the prebuilt `VECTORIZER_AUTHORIZATION` value, including its
`Basic ` prefix. The driver base64-encodes `VECTORIZER_ID` and `VECTORIZER_SECRET` locally; encoding
proxy placeholders prevents substitution with the real credentials. The ID/secret pair remains
appropriate when its actual values are available locally.

`ALLOWED_TOKENS_LIST`, `ADMIN_ACCESS_TOKEN`, `REDTEAM_FIXTURE_KEY`, `REPORT_TOKEN_SECRET`, and
`USAGE_GRANT_ID_SECRET` are consumed locally for access checks, signing, or fixture cryptography.
They have no outbound destination to put in this field. Their real values require secure direct
environment-variable injection; assigning a domain to a proxy secret does not make its real value
available to local code. If direct injection is unavailable, leave them out of cloud setup and use
the repository's isolated development/test credentials for the standard workflow.

## Installation, maintenance, and startup instructions

Copy the complete contents of [`.codex/cloud/setup.sh`](../../.codex/cloud/setup.sh) into
`install_script`, and [`.codex/cloud/start.md`](../../.codex/cloud/start.md) into `start_skill`.
Configuration saves persist instructions; they do not execute them or publish a new snapshot.

The local copies `/workspace/.cache/splotch-install.sh` and `/workspace/.cache/splotch-start.md`
carry the same contents as those two source files. Reconcile and copy them manually alongside
environment settings after future edits.

Run installation and maintenance from the checkout:

```bash
bash .codex/cloud/setup.sh
bash .codex/cloud/maintenance.sh
```

The scripts accept `CODEX_PROJECT_DIR`, otherwise use the current checkout when it has a
`pnpm-lock.yaml`, and fall back to `/workspace/Splotch` when run from the workspace root. Both
install lockfile-resolved dependencies, refresh SvelteKit's generated types, and verify the selected
Chromium. Only setup installs Linux libraries when downloading the pinned browser.

Both scripts run `corepack enable --install-directory /workspace/.cache/bin pnpm` and
`corepack install` before installing. `corepack install` with no argument reads `package.json`'s
`packageManager` field, so the container gets the exact pnpm version local dev and CI use, from the
one place that records it. The writable shim directory avoids modifying the base image's tools.

That step replaced a global `npm@11` pin, which existed because the image's npm 11.4.2 and the npm
that authored `package-lock.json` disagreed over transitive **optional-peer** entries and made
`npm ci` fail with `Missing: picomatch@… from lock file`. The class of bug is gone rather than
re-pinned: with `packageManager`, there is no second version of the manager to drift.

Keep `--frozen-lockfile` in maintenance even when a branch is based on `main`: a cached container
may retain dependencies from another branch, and a frozen install reproduces exactly the checked-out
lockfile instead of resolving around the drift.

Both scripts are best-effort: they run without `set -e`, so a failed step prints a loud
`CODEX SETUP WARNING` / `CODEX MAINTENANCE WARNING` banner (plus an end-of-run summary) and the
script continues to exit 0 rather than aborting the whole environment build. This keeps a single bad
step from leaving the container unusable, while still surfacing the failure in the log for the chat
session to act on. An invalid project directory is fatal because there is no checkout to prepare.
Watch the setup/maintenance log for banners and resolve every warning before calling the environment
ready; an exit code of zero alone does not demonstrate readiness. A lockfile mismatch needs a local
`pnpm install` and a commit, rather than an unfrozen cloud install.

## Initial acceptance check

After creating a fresh environment, run:

```bash
node --version
npm --version
test -d node_modules
npm run check
npm run test:unit
```

The setup script's canvas check verifies browser availability. Follow
[`.codex/cloud/start.md`](../../.codex/cloud/start.md) to start the dev server, check its drawing
page and version endpoint, run a production build with its release checks, and exercise drawing,
undo, and persistence in Chromium. Startup instructions restart processes after publication or a new
task; retained dependencies do not imply a server is running.

If setup fails, record the exact failed command, host, and error before changing the environment. Do
not add Android/iOS toolchains, emulators, tunnels, or unrelated allowlist entries to this
environment unless a task demonstrates a need for them.

## Relationship to Claude Code Cloud

Codex Cloud and Claude Code Cloud are separate environments with separate setup mechanisms. For
Claude's proxy, preview, branching, and tunnel workflow, see [Claude Code Cloud](Claude.md). Its
setup source remains [`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh). Both environments use
Corepack to provision the `packageManager`-pinned pnpm version. Codex uses the writable cache paths
and startup instructions described above; Claude's preview and tunnel setup stays in its own
environment.

## Related files

* [`.codex/cloud/setup.sh`](../../.codex/cloud/setup.sh) — installation and browser readiness.
* [`.codex/cloud/maintenance.sh`](../../.codex/cloud/maintenance.sh) — cached-container refresh.
* [`.codex/cloud/start.md`](../../.codex/cloud/start.md) — agent startup and workflow validation.
* [`web/playwright.config.ts`](../../web/playwright.config.ts) — browser cache lookup for E2E.
* [`tools/run-web-tool.mjs`](../../tools/run-web-tool.mjs) — invokes SvelteKit and Playwright from
  `web/`.
* [`docs/COMPATIBILITY.md`](../COMPATIBILITY.md) — supported browser and device floor.
