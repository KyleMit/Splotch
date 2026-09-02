# Cloud environments — Claude Code on the web

How to run and preview Splotch from a
[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) cloud session, and
the network constraints that shape what's possible.

## The cloud environment

A cloud session runs in an ephemeral, Anthropic-managed container: the repo is cloned fresh on start
and the container is reclaimed after inactivity, so commit and push anything worth keeping.
`pnpm install` + `npm run dev` work as usual — with one install-script caveat covered under "Getting
dependencies ready" below.

The constraint that matters here is **networking**:

* **Outbound only, through an allowlist proxy.** The container can reach allowlisted hosts (npm,
  GitHub, the package registries — the **Trusted** default) and nothing else. Off-list hosts fail
  with `Host not in allowlist: <host>`.
* **No inbound port forwarding.** There is no built-in way to expose a local port to a public URL.
  The container shares no network with your phone or laptop, so the LAN (`dev:host`) and USB
  (`adb:reverse`) flows in the mobile guide do **not** apply in a cloud session.

## Session lifecycle and what persists

The VM is allocated on demand and reclaimed after a period of inactivity whose duration Anthropic
does not publish. Reopening an expired session provisions a **fresh** VM and restores the
**conversation** — it does not restore the disk. Everything below follows from that one asymmetry.

**Startup order.** The environment cache (a filesystem snapshot taken after the setup script's first
successful run) is restored → the repo is cloned fresh from GitHub → SessionStart hooks run. The
setup script re-runs only when it changes, when the allowed-hosts list changes, or when the snapshot
passes its expiry of roughly seven days; resuming a session never re-runs it. The snapshot keeps
files and loses processes, which is why [`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh)
installs binaries while the SessionStart hooks start whatever needs to be running.

| What                                                                             | Survives reclamation? | Where it lives                  |
| -------------------------------------------------------------------------------- | --------------------- | ------------------------------- |
| Commits **pushed** to a branch                                                   | **Yes**               | GitHub — the only durable store |
| Commits made locally, never pushed                                               | No                    | `.git` on the container disk    |
| Staged changes                                                                   | No                    | container disk                  |
| Uncommitted edits to tracked files                                               | No                    | container disk                  |
| Untracked and gitignored files — build output, `playwright-report/`, screenshots | No                    | container disk                  |
| Conversation transcript and the web diff view                                    | **Yes**               | Anthropic, server-side          |
| Tooling the setup script installed                                               | Yes, until expiry     | environment cache snapshot      |

**Work has to be made findable, not merely saved.** Restoring the conversation restores the branch
*name*, which is a weak pointer — it needs that session reopened by someone who knows to look. Push
at the first commit rather than the last, and prefer a pointer that outlives the session: a draft
PR, or a `docs/handoff/` packet from `/create-handoff`, which travels with the repo. A gitignored
artifact worth keeping needs an explicit route out — `npm run scrapbook:publish`, an attachment on
the PR, or `git add -f` onto a scratch branch.

## Bounding long-running work

**Nothing keeps a session alive while work runs.** Session idle is measured on the conversation —
turns and messages — not on container activity, so a healthy background process does not stop
reclamation, and no file, ping loop, or hook can hold a session open. Claude Code does send a real
heartbeat, `POST /v1/code/sessions/{id}/worker/heartbeat`, but the worker sends it itself and reads
no state from the filesystem, so a heartbeat *file* is inert however it is written. (The pattern
that circulates for this — a `PostToolUse` hook plus a background watchdog loop — is worse than
inert: the loop inherits the hook's stdout, the harness reads that pipe to EOF, and every tool call
in the session then stalls until the hook timeout.) The robust mitigation is to chunk work so each
chunk commits and pushes, making a reclamation cost one chunk instead of the session.

The complementary failure is work that never ends, where three mechanisms compound:

* **A foreground Bash call that exceeds its timeout is detached, not killed.** On expiry the harness
  moves the command to the background and reports that it will notify on completion. The stock
  timeout is 120s — short enough that a full test or build run always crosses it — which is why this
  environment raises `BASH_DEFAULT_TIMEOUT_MS`
  ([`.claude/cloud/environment.example`](../../.claude/cloud/environment.example)) to keep such a
  run in the foreground, where it stays bounded.
* **A detached command has no bound at all.** Measured: a detached hang was still running after
  eight minutes with no harness intervention. Its only limit is one baked into the command itself.
* **A completion notification that can never arrive.** A command that never exits never notifies,
  and an agent polling for it resets the subagent stall watchdog on every poll, because
  `tool_heartbeat` progress events fire on elapsed time rather than on actual progress.

Hence the rules `.claude/hooks/cloud-long-running-work.sh` injects at SessionStart: put the bound in
the command (`timeout 600 …`), treat "moved to the background" as a decision point, and read a
background task's output file rather than its reported exit code — that code belongs to the wrapper
shell, so a SIGKILLed command can surface as `exit code 0`.

The test suite is bounded independently of all of this, so a session cannot hang on it:
`globalTimeout` in `web/playwright.shared.ts` ends a wedged run, and the harness probe in
`web/tests/global-setup.ts` aborts rather than waiting on a server that never answers. Playwright's
per-test timeout already covered a hanging *test*; those two cover the gaps around it — globalSetup,
globalTeardown, and the webServer wait.

## Per-session branch + Netlify preview

Cloud sessions follow a fixed branching convention, injected into every session by
`.claude/hooks/cloud-branch-preview.sh` (registered in `.claude/settings.json`, guarded by
`CLAUDE_CODE_REMOTE` so it's a no-op locally; SessionStart stdout becomes context):

* **One feature, one `feat/` branch off `main`.** After the first substantive request, Claude forks
  a fresh branch from the latest `origin/main` named `feat/<feature>` (a short kebab-case summary of
  the ask) and does all work there — even if the session opened on a different auto-generated
  branch.
* **Return the branch preview URL.** When branch previews are enabled for the branch (see the two
  modes below), the `splotchy` Netlify site auto-deploys the pushed branch to
  `https://<slug>--splotchy.netlify.app` (the branch name with each non-alphanumeric character
  replaced by `-`, e.g. `feat/undo-button` → `feat-undo-button--splotchy.netlify.app`). Claude hands
  that link back after pushing so you can watch the committed work in progress; the URL is stable
  for the branch, so it tracks every later push (each deploy takes a minute or two).

### PR base branch — inherit the session's `feat/*` branch

The default flow forks off `origin/main`, so the PR merges back into `main`. But when a session
**opens on an existing `feat/*` branch** — a follow-up session stacked on feature work that isn't
merged yet — that starting branch, not `main`, is the integration target. In that case:

* Branch the new work off the session's `feat/*` branch (not `origin/main`), and
* When opening the PR, set its **base branch to that original `feat/*` branch**, not `main`.

This keeps the follow-up stacked on the in-flight feature instead of diffing against `main` (which
would fold in every unmerged change from the parent branch and target the wrong merge destination).
Once the parent `feat/*` branch merges to `main`, GitHub retargets its open child PRs to `main`
automatically.

### Two preview modes — check which one is active

The `splotchy` site runs in one of two preview modes, toggled in the Netlify UI depending on how
tight the build-minute budget is:

* **Full preview mode.** Both deploy previews on pull requests **and** branch previews on **every**
  branch are enabled — any pushed branch auto-deploys to `https://<slug>--splotchy.netlify.app` as
  described above, and every PR gets its own deploy preview.
* **Restricted preview mode.** PR deploy previews are **disabled**, and branch previews build
  **only** for branches whose name starts with `feature/` (`feature/foo` →
  `feature-foo--splotchy.netlify.app`). Every other branch — including the per-session
  `feat/<feature>` and `claude/*` branches — is pushed and stored on GitHub but **not** deployed, so
  it has no preview URL. This mode conserves build minutes.

> **Current mode: restricted.** *(as of 2026-07-09)* Assume a plain push produces **no** live
> preview unless the branch is named `feature/*`. When the mode changes, update this line.

**Getting a live preview while restricted.** If a production preview is genuinely needed —
Lighthouse profiling (see the `lighthouse-audit` skill), or the user asks to see the changes running
live — branch off the current working branch to a `feature/*` branch, push it to `origin` to trigger
the build, then switch back to the working branch to resume work:

```bash
git checkout -b feature/<feature>        # fork off the current working branch
git push -u origin feature/<feature>     # triggers the branch deploy
git checkout -                           # back to the working branch to keep going
```

Don't keep the `feature/*` branch mirrored to the working branch — only refresh it ad hoc when the
user asks. When the user requested a live preview, hand back the branch preview URL using Netlify's
slug convention (each non-alphanumeric character → `-`): `feature/undo-button` →
`feature-undo-button--splotchy.netlify.app`.

### The branch deploy is real production serving — use it to test what dev can't

The branch deploy is served by **real Netlify** — the same CDN, HTTP/2, edge compression,
`netlify.toml` headers, redirects, SSR function, and generated PWA service worker that `splotch.art`
gets. That makes it the *only* place in a cloud session to verify behavior that exists **solely in
production serving** and is absent from `npm run dev` / `vite preview` / `netlify dev` (which emit
no CDN headers and no built service worker):

* **Response headers** — `Cache-Control` on `/sounds/*`, `/styles/*`, `/icons/*`, `/*.js`, `/*.css`
  (`netlify.toml`), security headers, content types. The egress proxy reaches `*.netlify.app`, so
  `curl -sSI <branch-url>/styles/crayon.light.webp` from the sandbox shows exactly what a browser
  receives.
* **The service-worker precache** — `curl -s <branch-url>/sw.js` returns the Workbox-generated SW
  with its inlined precache manifest (`{url,revision}` entries). The `revision` is the md5 of the
  file's built content, so you can read the deployed invalidation state directly and diff it across
  pushes.
* **Cache invalidation end-to-end** — because each push produces a fresh deploy, you can prove how a
  static-asset change propagates: change an asset, push, poll `<branch-url>/sw.js` until that
  asset's `revision` flips (and its `ETag` / `Content-Length` change), push a second change to
  confirm updates keep flowing, then revert. This is exactly how the strategy in
  [ADR-0042](../adrs/0042-static-media-cache-invalidation.md) was verified — see it for the
  mechanism and the recorded run.

Deploys take a minute or two after each push, so poll rather than checking once.

## Getting dependencies ready

### Automatic: the SessionStart hook

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`) runs at the start of every
cloud session: `pnpm install` + `svelte-kit sync` in `web/`, guarded by `CLAUDE_CODE_REMOTE` so it's
a no-op on local machines. Once it's on the default branch, every cloud session starts with deps
installed — `npm run check` and the unit tests (`npm run test:unit`) work out of the box.

**Install-script note: lifecycle scripts can't download from arbitrary hosts.** The install reaches
`registry.npmjs.org` fine, but a dependency postinstall that fetches a binary from anywhere else
gets `403 Forbidden` from the session's egress proxy. `@capacitor/assets` used to hit exactly this —
it pins sharp 0.32, whose postinstall downloads libvips from GitHub releases — which killed the
hook's install silently and left sessions with an **empty `node_modules`**. Two layers now prevent
it, and neither is a fallback: `pnpm-workspace.yaml`'s `overrides` lifts the nested sharp to the
root `sharp` (0.33+ ships its binaries as `@img/*` npm packages, no download step), and pnpm runs no
dependency install script at all unless `allowBuilds` names it — nothing is named, so there is no
host for a postinstall to reach. A dep that reintroduces the pattern surfaces as a failed install
naming the package, not as a silent empty tree.

**package-manager note:** pnpm's version is pinned by `package.json`'s `packageManager` field, and
the setup script's `corepack install` provisions exactly that version, so the container and local
dev cannot disagree about who authored the lockfile. (This replaced a global `npm@11` pin that
existed because npm 10 and npm 11 rewrite `package-lock.json` metadata in incompatible dialects.)
The hook still discards any lockfile diff its install produces — only when the lockfile was clean
beforehand, so real in-session lockfile edits survive a resume.

### Recommended setup script (environment config)

The hook covers deps, but the Playwright **E2E** tier needs a browser binary the hook can't fetch,
and the phone-preview tunnel wants its client binary cached. Both are heavy, cacheable,
repo-independent installs — the job of the environment's **Setup script** field (env settings
dialog), which is snapshotted so later sessions skip it.

That field can't be version-controlled, so keep it a one-line bootstrap and commit the real logic in
[`.claude/cloud/setup.sh`](../../.claude/cloud/setup.sh):

```bash
bash .claude/cloud/setup.sh
```

The script installs the chromium E2E browser and caches the chisel tunnel client (so the per-session
`curl` the tunnel steps below would otherwise need is skipped). Keep it under ~5 min so the cache
builds. **Skip the Android/iOS/Capacitor toolchains on this environment** — there's no Xcode and no
USB device in a cloud container, so the `ios:*` and on-device `test:android` scripts can't run here.

An **Android emulator is the one exception**, and it belongs on its own environment rather than this
one. It does run — headless, under software emulation, since the container has no `/dev/kvm` — but
it costs ~5 GB of snapshot, takes ~20 minutes to boot, and cannot render Splotch's WebView. The
setup script provisions it only when `SPLOTCH_CLOUD_PROFILE` lists `android`, so this environment is
unaffected. See [`.claude/cloud/ANDROID-EMULATOR.md`](../../.claude/cloud/ANDROID-EMULATOR.md) for
what it can and cannot do — read it before creating one.

Only Playwright's **Chromium** is installed in a cloud session (no WebKit/Firefox), so
engine-divergent CSS (containment as a containing block, top-layer, `:has` edge cases) can't be
tested here — check the [`docs/COMPATIBILITY.md`](../COMPATIBILITY.md) risk register instead of
assuming a local pass covers Safari.

> **Chromium revision must match `@playwright/test`.** The setup script derives the browser version
> from `package.json` for exactly this reason: Playwright pins a specific Chromium *revision* (e.g.
> `@playwright/test@1.61.x` → Chromium 1228), and a hard-coded install version (or a stale env
> snapshot) leaves that revision absent — every E2E run and `run-splotch` screenshot then dies with
> `Executable doesn't
> exist … chromium-<rev>`. As a backstop, `playwright.config.ts` and
> `.claude/skills/run-splotch/driver.mjs` self-heal: if the pinned binary is missing they fall back
> to any Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`), overridable with
> `PLAYWRIGHT_CHROMIUM`. **Never** run `npx playwright install` in a session — it's forbidden here
> and fetches the wrong revision anyway.

### Committing the environment config

There is **no** official as-code or CLI provisioning for these environments — the allowed domains,
env vars, and setup script are edited only in the web dialog. The committed record of how to fill
that dialog lives in [`.claude/cloud/environment.example`](../../.claude/cloud/environment.example);
paste from it. Secret **values** stay in the dialog and are never committed.

A second environment records only its **deltas** from that file, so the shared parts stay in one
place:
[`.claude/cloud/environment.android.example`](../../.claude/cloud/environment.android.example) is
the worked example. Both point the dialog's Setup script field at the same
`bash .claude/cloud/setup.sh`; what differs is `SPLOTCH_CLOUD_PROFILE`, which the script dispatches
on. Add a profile rather than a second setup script when a use case needs extra tooling.

### Allowlist additions for E2E

`npm run test:e2e` (and `npm test`) need the Playwright browser CDN, which is **not** in the Trusted
defaults. Add to **Custom** allowed domains alongside the defaults:

```
cdn.playwright.dev
playwright.download.prss.microsoft.com
```

## Codex reviews on the ChatGPT plan

The `run-rival-agent` skill launches the Codex CLI for an independent review, and its wrapper
refuses anything but a ChatGPT-plan login (the billing guard described in
`.claude/skills/run-rival-agent/references/permissions.md`). A cloud session has neither the CLI nor
a login by default, and the container disk does not survive reclamation, so a `codex login` would be
needed on every fresh VM. Instead:

* **The CLI is installed by the setup script** (`.claude/cloud/setup.sh`, pinned by its
  `CODEX_VERSION`) and lives in the environment snapshot. Its binary ships as an npm optional
  dependency, so the install needs only `registry.npmjs.org`.
* **The login is seeded per session** by `tools/seed-codex-auth.mjs`, a SessionStart hook registered
  in `.claude/settings.json`. When no `$CODEX_HOME/auth.json` exists yet it writes one from the
  `CODEX_AUTH_JSON` environment variable, after checking that it is a ChatGPT login with a refresh
  token, and prints one status line into the session's context. A file already on disk is never
  overwritten, because Codex refreshes it in place. The snapshot never holds the credential.

### Seeding

On your own machine, create a **dedicated** login and copy it as base64:

```bash
CODEX_HOME=~/.codex-cloud codex login
base64 < ~/.codex-cloud/auth.json | tr -d '\n' | pbcopy
```

Set `CODEX_AUTH_JSON` to the clipboard contents in the environment dialog; it takes effect on the
next session. If the environment's network access is Trusted or Custom rather than Full, also allow
`chatgpt.com` and `auth.openai.com` — `.claude/cloud/environment.example` carries both entries.

Dedicated means a separate `CODEX_HOME`, never a copy of the working `~/.codex/auth.json`. OAuth
refresh rotates the refresh token and retires the previous one **within the same chain**: two
machines holding the same file log each other out at the first refresh, while two independent logins
on one account coexist indefinitely. Plan rate limits are shared across all of them.

### Shelf life

Codex refreshes a bundle whose `last_refresh` is older than about eight days (or on a 401), and the
refresh rotates the token on the cloud VM's disk, which nothing writes back into the dialog. The
first session that refreshes therefore retires the seed for every later VM: expect to re-seed
roughly weekly, and the hook's status line warns from day six. Two VMs seeded from the same value
collide only if both refresh, which is that same moment. Extending past the ceiling means giving
sessions a store they can restore the file from and write it back to — the pattern OpenAI documents
for ephemeral CI runners at <https://learn.chatgpt.com/docs/auth/ci-cd-auth>; the dialog has no API
to receive a refreshed file.

If `npm run --silent run-codex:health` fails in a cloud session, relay the hook's status line and
re-seed. Do not run `codex login` from the sandbox (device-code auth does work there, but it is a
login per VM), and never fall back to an API key: the guard rejects it, and it bills metered
credits.

## Previewing the dev server on a phone

Because there's no inbound forwarding, viewing the running app on a phone needs an **outbound**
tunnel — but the cloud egress is a TLS-terminating, HTTP-only MITM gateway (Anthropic's Envoy
"Egress Gateway"), not the SNI pass-through we once assumed. That rules out **every** turnkey
tunnel: Cloudflare's quick tunnel targets a non-443 edge, and ngrok dies on the gateway's cert
pinning and ALPN re-origination. The full proof, the reproducible probe, and the list of dead ends
are in [ADR-0021](../adrs/0021-cloud-session-tunneling.md) — **read it before trying any other
tunnel here.**

The one shape that works is a **self-hosted HTTP/WebSocket reverse tunnel**: a relay you run on a
host you can allowlist, reached by a Go client that trusts the system CA. We use
[chisel](https://github.com/jpillora/chisel) fronted by a [Fly.io](https://fly.io) relay (free
`*.fly.dev` HTTPS).

**Quick version** (ADR-0021 §7 has the complete, repeatable steps):

1. **Server, once (your machine):** deploy chisel on Fly with the ADR's `Dockerfile` + `fly.toml`,
   then `fly scale count 1` (exactly one machine — HA breaks the tunnel). Set the shared secret as a
   Fly secret `AUTH`.
2. **Env settings (Claude web env dialog — take effect next session):** allowlist `<app>.fly.dev`
   and set `TUNNEL_AUTH` to the Fly `AUTH` (full config in
   [`.claude/cloud/environment.example`](../../.claude/cloud/environment.example)).
3. **Sandbox, each session — one command:**
   ```bash
   npm run dev:tunnel
   ```
   It starts `vite dev`, connects the chisel client, waits for the public URL to answer `200`, and
   prints it. `Live: https://<app>.fly.dev` ⇒ open it on the phone.

`dev:tunnel` defaults `TUNNEL_HOST` to the relay host and injects it into vite, so it runs plain
`npm run dev` under the hood — **`--host` is not needed in the cloud** (no LAN; chisel forwards via
localhost). The only thing the tunnel needs from vite is `server.allowedHosts`, which `TUNNEL_HOST`
drives (`web/vite.config.ts`). Set `TUNNEL_HOST` in the env config too if you want a bare
`npm run dev` to accept the tunnel host.

> **One live tunnel at a time, and it's public while live.** The relay binds the reverse port once:
> the *first* session to connect owns the URL; a second session's client just retries forever
> (`server cannot listen on R:…`) and never serves — there is no priority. And while a tunnel is up,
> `https://<app>.fly.dev` is reachable by anyone with the URL — chisel's `AUTH` gates *establishing*
> the tunnel, not HTTP access to the served app (ADR-0021 §security). Don't leave tunnels running
> unattended.

> **Off-cloud this is all unnecessary** — on a machine with normal internet, any quick tunnel works
> with no account and no allowlist, e.g. `cloudflared tunnel --url http://localhost:5173` or
> `ngrok http 5173`. The cloud sandbox is the only hostile case; the chisel relay above exists
> solely to satisfy its egress gateway.
