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

The SessionStart hook already handles node deps, so the **Setup script** field
(env settings dialog) is **optional**. Leave it empty unless you want to run the
Playwright **E2E** tier in the cloud.

> **Do not run `npm install` / `npm ci` in the setup script.** It executes in a
> phase where the repo (and its `package-lock.json`) isn't at the working
> directory, so npm fails with `can only install with an existing
> package-lock.json`. Node deps belong in the SessionStart hook above. The setup
> script is for **repo-independent**, cacheable system installs only.

The one thing worth caching here is the E2E browser (the snapshot keeps it, so
later sessions skip the ~150 MB download):

```bash
#!/bin/bash
# Repo-independent installs only — node deps come from the SessionStart hook.
# Chromium-only, pinned to the repo's @playwright/test version. Non-fatal so a
# blocked download never blocks session startup.
npx --yes playwright@1.60.0 install --with-deps chromium \
  || echo "playwright browser install skipped — allowlist cdn.playwright.dev?"
```

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
an **outbound** tunnel:

```bash
npm run dev:tunnel
```

This runs `dev:host` and opens a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/),
printing a public `https://*.trycloudflare.com` URL to open in any phone
browser. No Cloudflare account is needed; the `cloudflared` binary downloads on
first run. `Ctrl-C` shuts down both the tunnel and the dev server.

> The same command works from your own machine, where it needs no extra setup —
> handy for testing on a phone that isn't on your Wi-Fi.

### Making the tunnel reachable from a cloud session

The tunnel is itself an outbound connection, so it hits the egress allowlist.
By default `npm run dev:tunnel` in a cloud session prints setup guidance and
exits. To allow it, add these hosts to the environment's **Custom** allowed
domains (see the [network access docs](https://code.claude.com/docs/en/claude-code-on-the-web#network-access)):

```
api.trycloudflare.com
*.argotunnel.com
*.v2.argotunnel.com
```

The egress proxy is a transparent, hostname/SNI-based filter on standard TLS, so
443-based transports traverse it once allowlisted — that's why `dev:tunnel`
passes `--protocol http2` (Cloudflare's default QUIC on UDP/7844 is blocked).
Raw-TCP tunnels like localtunnel won't work regardless. If the Cloudflare edge
still won't connect, [ngrok](https://ngrok.com) is the most proxy-tolerant
alternative (free authtoken via an `NGROK_AUTHTOKEN` env var; allowlist
`*.ngrok.com`, `*.ngrok-agent.com`, `*.ngrok.io`). Running `dev:tunnel` from a
machine with normal internet access needs none of this.
