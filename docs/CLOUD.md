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

The phone-preview tunnel (below) needs no prefetch — the chisel client binary is
a single `curl` away at session time (see [ADR-0021](adrs/0021-cloud-session-tunneling.md)).

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
2. **Two env settings (Claude web env dialog — take effect next session):**
   allowlist `<app>.fly.dev`, and add `TUNNEL_AUTH` equal to the Fly `AUTH`.
3. **Sandbox, each session:**
   ```bash
   curl -sSL https://github.com/jpillora/chisel/releases/download/v1.10.1/chisel_1.10.1_linux_amd64.gz \
     | gunzip > /tmp/chisel && chmod +x /tmp/chisel
   TUNNEL_HOST=<app>.fly.dev npm run dev:host          # background
   /tmp/chisel client --auth "$TUNNEL_AUTH" --keepalive 25s \
     https://<app>.fly.dev R:127.0.0.1:9000:localhost:5173   # background
   curl -s -o /dev/null -w '%{http_code}\n' https://<app>.fly.dev/   # 200 == live
   ```
   `200` ⇒ open `https://<app>.fly.dev` on the phone.

> **Off-cloud this is all unnecessary** — on a machine with normal internet,
> any quick tunnel works with no account and no allowlist, e.g.
> `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`. The
> cloud sandbox is the only hostile case; the chisel relay above exists solely
> to satisfy its egress gateway.
