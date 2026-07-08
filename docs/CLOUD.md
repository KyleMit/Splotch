# Cloud sessions (Claude Code on the web)

How to run and preview Splotch from a [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
cloud session, and the network constraints that shape what's possible.

## The cloud environment

A cloud session runs in an ephemeral, Anthropic-managed container: the repo is
cloned fresh on start and the container is reclaimed after inactivity, so commit
and push anything worth keeping. `npm install` + `npm run dev` work as usual.

The constraint that matters here is **networking**:

* **Outbound only, through an allowlist proxy.** The container can reach
  allowlisted hosts (npm, GitHub, the package registries — the **Trusted**
  default) and nothing else. Off-list hosts fail with
  `Host not in allowlist: <host>`.
* **No inbound port forwarding.** There is no built-in way to expose a local
  port to a public URL. The container shares no network with your phone or
  laptop, so the LAN (`dev:host`) and USB (`adb:reverse`) flows in the mobile
  guide do **not** apply in a cloud session.

## Per-session branch + Netlify preview

Cloud sessions follow a fixed branching convention, injected into every session
by `.claude/hooks/cloud-branch-preview.sh` (registered in `.claude/settings.json`,
guarded by `CLAUDE_CODE_REMOTE` so it's a no-op locally; SessionStart stdout
becomes context):

* **One feature, one `feat/` branch off `main`.** After the first substantive
  request, Claude forks a fresh branch from the latest `origin/main` named
  `feat/<feature>` (a short kebab-case summary of the ask) and does all work
  there — even if the session opened on a different auto-generated branch.
* **Return the branch preview URL.** Branch previews are enabled on the
  `splotchy` Netlify site, so every pushed branch auto-deploys to
  `https://<slug>--splotchy.netlify.app` (the branch name with each
  non-alphanumeric character replaced by `-`, e.g. `feat/undo-button` →
  `feat-undo-button--splotchy.netlify.app`). Claude hands that link back after
  pushing so you can watch the committed work in progress; the URL is stable for
  the branch, so it tracks every later push (each deploy takes a minute or two).

### The branch deploy is real production serving — use it to test what dev can't

The branch deploy is served by **real Netlify** — the same CDN, HTTP/2, edge
compression, `netlify.toml` headers, redirects, SSR function, and generated PWA
service worker that `splotch.art` gets. That makes it the *only* place in a cloud
session to verify behavior that exists **solely in production serving** and is
absent from `npm run dev` / `vite preview` / `netlify dev` (which emit no CDN
headers and no built service worker):

* **Response headers** — `Cache-Control` on `/sounds/*`, `/styles/*`, `/icons/*`,
  `/*.js`, `/*.css` (`netlify.toml`), security headers, content types. The egress
  proxy reaches `*.netlify.app`, so `curl -sSI <branch-url>/styles/pixel.webp`
  from the sandbox shows exactly what a browser receives.
* **The service-worker precache** — `curl -s <branch-url>/sw.js` returns the
  Workbox-generated SW with its inlined precache manifest (`{url,revision}`
  entries). The `revision` is the md5 of the file's built content, so you can read
  the deployed invalidation state directly and diff it across pushes.
* **Cache invalidation end-to-end** — because each push produces a fresh deploy,
  you can prove how a static-asset change propagates: change an asset, push, poll
  `<branch-url>/sw.js` until that asset's `revision` flips (and its `ETag` /
  `Content-Length` change), push a second change to confirm updates keep flowing,
  then revert. This is exactly how the strategy in
  [ADR-0042](adrs/0042-static-media-cache-invalidation.md) was verified — see it
  for the mechanism and the recorded run.

Deploys take a minute or two after each push, so poll rather than checking once.

## Getting dependencies ready

### Automatic: the SessionStart hook

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`) runs at
the start of every cloud session: `npm install` + `svelte-kit sync`, guarded by
`CLAUDE_CODE_REMOTE` so it's a no-op on local machines. Once it's on the default
branch, every cloud session starts with deps installed — `npm run check` and the
unit tests (`npm run test:unit`) work out of the box.

**npm-version note:** `package-lock.json` is authored by npm 11 (local dev), but
the container image ships npm 10, and the two majors rewrite lockfile metadata
in incompatible dialects (they disagree on optional-peer entries, so no lockfile
shape satisfies both — `--no-save` doesn't prevent the rewrite either). Two
layers keep sessions clean: the setup script pins `npm@11` globally so the churn
never happens, and the hook discards any lockfile diff its install produces
(only when the lockfile was clean beforehand, so real in-session lockfile edits
survive a resume).

### Recommended setup script (environment config)

The hook covers deps, but the Playwright **E2E** tier needs a browser binary the
hook can't fetch, and the phone-preview tunnel wants its client binary cached. Both
are heavy, cacheable, repo-independent installs — the job of the environment's
**Setup script** field (env settings dialog), which is snapshotted so later sessions
skip it.

That field can't be version-controlled, so keep it a one-line bootstrap and commit
the real logic in [`.claude/cloud/setup.sh`](../.claude/cloud/setup.sh):

```bash
bash .claude/cloud/setup.sh
```

The script installs the chromium E2E browser and caches the chisel tunnel client (so
the per-session `curl` the tunnel steps below would otherwise need is skipped). Keep
it under ~5 min so the cache builds. **Skip the Android/iOS/Capacitor toolchains** —
there's no emulator, Xcode, or USB device in a cloud container, so the `android:*` /
`ios:*` / `test:android` scripts can't run there.

Only Playwright's **Chromium** is installed in a cloud session (no WebKit/Firefox), so
engine-divergent CSS (containment as a containing block, top-layer, `:has` edge cases)
can't be tested here — check the `docs/COMPATIBILITY.md` risk register instead of
assuming a local pass covers Safari.

> **Chromium revision must match `@playwright/test`.** The setup script derives the
> browser version from `package.json` for exactly this reason: Playwright pins a
> specific Chromium *revision* (e.g. `@playwright/test@1.61.x` → Chromium 1228), and a
> hard-coded install version (or a stale env snapshot) leaves that revision absent —
> every E2E run and `run-splotch` screenshot then dies with `Executable doesn't
> exist … chromium-<rev>`. As a backstop, `playwright.config.ts` and
> `.claude/skills/run-splotch/driver.mjs` self-heal: if the pinned binary is missing
> they fall back to any Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default
> `/opt/pw-browsers`), overridable with `PLAYWRIGHT_CHROMIUM`. **Never** run
> `npx playwright install` in a session — it's forbidden here and fetches the wrong
> revision anyway.

### Committing the environment config

There is **no** official as-code or CLI provisioning for these environments — the
allowed domains, env vars, and setup script are edited only in the web dialog. The
committed record of how to fill that dialog lives in
[`.claude/cloud/environment.example`](../.claude/cloud/environment.example); paste
from it. Secret **values** stay in the dialog and are never committed.

### Allowlist additions for E2E

`npm run test:e2e` (and `npm test`) need the Playwright browser CDN, which is
**not** in the Trusted defaults. Add to **Custom** allowed domains alongside the
defaults:

```
cdn.playwright.dev
playwright.download.prss.microsoft.com
```

## Previewing the dev server on a phone

Because there's no inbound forwarding, viewing the running app on a phone needs
an **outbound** tunnel — but the cloud egress is a TLS-terminating, HTTP-only
MITM gateway (Anthropic's Envoy "Egress Gateway"), not the SNI pass-through we
once assumed. That rules out **every** turnkey tunnel: Cloudflare's quick tunnel
targets a non-443 edge, and ngrok dies on the gateway's cert pinning and ALPN
re-origination. The full proof, the
reproducible probe, and the list of dead ends are in
[ADR-0021](adrs/0021-cloud-session-tunneling.md) — **read it before trying any
other tunnel here.**

The one shape that works is a **self-hosted HTTP/WebSocket reverse tunnel**: a
relay you run on a host you can allowlist, reached by a Go client that trusts
the system CA. We use [chisel](https://github.com/jpillora/chisel) fronted by a
[Fly.io](https://fly.io) relay (free `*.fly.dev` HTTPS).

**Quick version** (ADR-0021 §7 has the complete, repeatable steps):

1. **Server, once (your machine):** deploy chisel on Fly with the ADR's
   `Dockerfile` + `fly.toml`, then `fly scale count 1` (exactly one machine —
   HA breaks the tunnel). Set the shared secret as a Fly secret `AUTH`.
2. **Env settings (Claude web env dialog — take effect next session):** allowlist
   `<app>.fly.dev` and set `TUNNEL_AUTH` to the Fly `AUTH` (full config in
   [`.claude/cloud/environment.example`](../.claude/cloud/environment.example)).
3. **Sandbox, each session — one command:**
   ```bash
   npm run dev:tunnel
   ```
   It starts `vite dev`, connects the chisel client, waits for the public URL to
   answer `200`, and prints it. `Live: https://<app>.fly.dev` ⇒ open it on the phone.

`dev:tunnel` defaults `TUNNEL_HOST` to the relay host and injects it into vite, so it
runs plain `npm run dev` under the hood — **`--host` is not needed in the cloud** (no
LAN; chisel forwards via localhost). The only thing the tunnel needs from vite is
`server.allowedHosts`, which `TUNNEL_HOST` drives (`web/vite.config.ts`). Set `TUNNEL_HOST`
in the env config too if you want a bare `npm run dev` to accept the tunnel host.

> **One live tunnel at a time, and it's public while live.** The relay binds the
> reverse port once: the *first* session to connect owns the URL; a second session's
> client just retries forever (`server cannot listen on R:…`) and never serves — there
> is no priority. And while a tunnel is up, `https://<app>.fly.dev` is reachable by
> anyone with the URL — chisel's `AUTH` gates *establishing* the tunnel, not HTTP access
> to the served app (ADR-0021 §security). Don't leave tunnels running unattended.

> **Off-cloud this is all unnecessary** — on a machine with normal internet,
> any quick tunnel works with no account and no allowlist, e.g.
> `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`. The
> cloud sandbox is the only hostile case; the chisel relay above exists solely
> to satisfy its egress gateway.
