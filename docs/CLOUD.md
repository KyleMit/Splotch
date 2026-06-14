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

Even allowlisted, the proxy-only transport can limit the tunnel; running
`dev:tunnel` from a machine with normal internet access is the reliable path.
