# Cloud environments — Codex Cloud

How to prepare a reproducible Codex Cloud environment for Splotch. Codex Cloud configuration lives
in its environment-creation UI, not in the repository; the scripts under `.codex/cloud/` are the
version-controlled source of truth that must be manually synced into that UI.

## Environment settings

* Select the latest available Node 22 patch. The required floor is declared once in the root
  `package.json` `engines.node`; `.codex/cloud/setup.sh` derives its version check from it, so an
  unsupported selection fails fast at setup. (The "22" here is drift-guarded against `engines` by
  `tools/tests/workflow-hygiene.test.mjs`.)
* Enable container caching and internet access for both setup and maintenance.
* Set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` as a non-secret environment variable so the
  browser cache survives resumes and is found by the Playwright configuration.
* Allow `registry.npmjs.org`, `cdn.playwright.dev`, and `playwright.download.prss.microsoft.com`.
  Add another domain only after recording a concrete blocked request.
* Add `GEMINI_API_KEY`, `ADMIN_ACCESS_TOKEN`, and `ALLOWED_TOKENS_LIST` only when a task needs the
  hosted service. Never put secret values in scripts or Git.

## Setup and maintenance scripts

Paste these commands into the respective Codex Cloud UI fields:

```bash
bash .codex/cloud/setup.sh
```

```bash
bash .codex/cloud/maintenance.sh
```

The setup script installs the lockfile-resolved dependencies, Chromium, and Chromium's Linux
libraries. Maintenance reconciles dependencies after a checkout, ensures the required Chromium
revision exists in the cache, and refreshes SvelteKit's generated types. It intentionally omits the
system-library installation because the cached container already has it.

Both scripts run `corepack enable pnpm && corepack install` before installing. `corepack install`
with no argument reads `package.json`'s `packageManager` field, so the container gets the exact pnpm
version local dev and CI use, from the one place that records it. This mirrors
[`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh).

That step replaced a global `npm@11` pin, which existed because the image's npm 11.4.2 and the npm
that authored `package-lock.json` disagreed over transitive **optional-peer** entries and made `npm
ci` fail with `Missing: picomatch@… from lock file`. The class of bug is gone rather than re-pinned:
with `packageManager`, there is no second version of the manager to drift.

Keep `--frozen-lockfile` in maintenance even when a branch is based on `main`: a cached container
may retain dependencies from another branch, and a frozen install reproduces exactly the checked-out
lockfile instead of resolving around the drift.

Both scripts are best-effort: they run without `set -e`, so a failed step prints a loud `CODEX SETUP
WARNING` / `CODEX MAINTENANCE WARNING` banner (plus an end-of-run summary) and the script continues
to exit 0 rather than aborting the whole environment build. This keeps a single bad step — most
often `pnpm-lock.yaml` disagreeing with `package.json` — from leaving the container unusable, while
still surfacing the failure in the log for the chat session to act on. Watch the setup/maintenance
log for those banners; an install banner usually means the lockfile needs a local `pnpm install` and
a commit.

## Initial acceptance check

After creating a fresh environment, run:

```bash
node --version
npm --version
test -d node_modules
test -d /opt/pw-browsers
npm run check
npm run test:unit
```

If setup fails, record the exact failed command, host, and error before changing the environment. Do
not add Android/iOS toolchains, emulators, tunnels, or unrelated allowlist entries to this
environment unless a task demonstrates a need for them.

## Relationship to Claude Code Cloud

Codex Cloud and Claude Code Cloud are separate environments with separate setup mechanisms. For
Claude's proxy, preview, branching, and tunnel workflow, see [Claude Code Cloud](Claude.md). Its
setup source remains [`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh). Both environments now
share the corepack step described above; do not copy Claude's Chisel installation or preview
tunnelling into Codex, which does not need them.

## Related files

* [`.codex/cloud/setup.sh`](../../.codex/cloud/setup.sh) — one-time cached environment setup.
* [`.codex/cloud/maintenance.sh`](../../.codex/cloud/maintenance.sh) — cached-container refresh.
* [`web/playwright.config.ts`](../../web/playwright.config.ts) — browser cache lookup for E2E.
* [`tools/run-web-tool.mjs`](../../tools/run-web-tool.mjs) — invokes SvelteKit and Playwright from
  `web/`.
* [`docs/COMPATIBILITY.md`](../COMPATIBILITY.md) — supported browser and device floor.
