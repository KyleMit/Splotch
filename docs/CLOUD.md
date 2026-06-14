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

## Getting dependencies ready

### Automatic: the SessionStart hook

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`) runs at
the start of every cloud session: `npm install` + `svelte-kit sync`, guarded by
`CLAUDE_CODE_REMOTE` so it's a no-op on local machines. Once it's on the default
branch, every cloud session starts with deps installed — `npm run check` and the
unit tests (`npm run test:unit`) work out of the box.

### Recommended setup script (environment config)

The hook covers deps, but the Playwright **E2E** tier needs a browser binary the
hook can't fetch. Put heavy, cacheable installs in the environment's **Setup
script** field (env settings dialog) — it's snapshotted, so later sessions skip
it:

```bash
#!/bin/bash
set -e
npm install
npx playwright install --with-deps chromium   # E2E browser (chromium-only)
```

The phone-preview tunnel (`dev:tunnel:ngrok`, below) needs no prefetch — its
native binary comes down with `npm install`.

Keep it under ~5 min so the cache builds. **Skip the Android/iOS/Capacitor
toolchains** — there's no emulator, Xcode, or USB device in a cloud container, so
the `android:*` / `ios:*` / `test:android` scripts can't run there.

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
an **outbound** tunnel. In a cloud session that tunnel is **ngrok** — the
Cloudflare quick tunnel (`npm run dev:tunnel`) can't reach its edge through the
egress proxy, so it's the wrong tool here (the why is in
[ADR-0021](adrs/0021-cloud-session-tunneling.md)).

```bash
npm run dev:tunnel:ngrok
```

This runs `dev:host` and opens an [ngrok](https://ngrok.com) tunnel, printing a
public `https://*.ngrok.*` URL to open in any phone browser. `Ctrl-C` shuts down
both the tunnel and the dev server. Two things must be in place first:

1. **An ngrok authtoken** in the `NGROK_AUTHTOKEN` env var — free from the
   [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken),
   set via the environment's env settings dialog.
2. **The ngrok hosts on the egress allowlist** — add these to the environment's
   **Custom** allowed domains (see the
   [network access docs](https://code.claude.com/docs/en/claude-code-on-the-web#network-access)):

   ```
   *.ngrok.com
   *.ngrok-agent.com
   *.ngrok.io
   ```

ngrok's agent reaches its edge over TCP/443, which the SNI-based allowlist proxy
forwards once those names are allowed. Without the token or the allowlist
entries, `dev:tunnel:ngrok` prints what's missing and exits.

> **Off-cloud, use `npm run dev:tunnel` instead** — the Cloudflare quick tunnel
> needs no account and no allowlist on a machine with normal internet access.
> It only fails inside the cloud sandbox.
