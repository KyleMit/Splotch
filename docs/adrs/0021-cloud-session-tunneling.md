# ADR-0021: Tunneling the Dev Server from Claude Code Cloud Sessions (ngrok, not Cloudflare)

**Status:** Active
**Date:** 2026-06

## Context

Previewing the running dev server on a phone needs an **outbound** tunnel: a
[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
cloud session runs in a sandbox with no inbound port forwarding, and its egress
is a **transparent, hostname/SNI-based filter on TLS port 443** — off-list hosts
fail with `Host not in allowlist`, and non-443 ports are refused outright.

We already ship `npm run dev:tunnel` (`scripts/dev-tunnel.mjs`), which opens a
[Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
via the `cloudflared` binary — zero account, zero config, ideal off-cloud. The
assumption was that allowlisting the Cloudflare edge hostnames
(`api.trycloudflare.com`, `*.argotunnel.com`, `*.v2.argotunnel.com`) and forcing
`--protocol http2` (to avoid QUIC's UDP/7844) would let it through the 443 SNI
filter. **It does not**, and this ADR records why and what we switched to.

### Why the Cloudflare quick tunnel can't work in a cloud session

`cloudflared` mints the public URL (that part only needs `api.trycloudflare.com`
on 443, which passes), but its **edge control/data connection never uses 443**.
Both transports target the edge on **port 7844**: QUIC on `udp/7844` and
`--protocol http2` on `tcp/7844`. The egress proxy only forwards TLS on 443, so
the edge connection is refused at the TCP layer and the tunnel URL serves a
Cloudflare 1033 error.

`cloudflared`'s own connectivity pre-check is unambiguous:

```
DNS Resolution    region1.v2.argotunnel.com  PASS
UDP Connectivity  region1.v2.argotunnel.com  FAIL   QUIC connection failed
TCP Connectivity  region1.v2.argotunnel.com  FAIL   HTTP/2 connection is blocked or unreachable
Cloudflare API    api.cloudflare.com:443     PASS
ERROR: Allow outbound TCP on port 7844.
```

A raw port probe confirms it's the port, not the host — the SNI filter happily
allows the name on 443:

| Target | Result |
| --- | --- |
| `region1.v2.argotunnel.com:443` | TCP **open** |
| `region1.v2.argotunnel.com:7844` | **refused** |

There is no escape hatch: quick tunnels hardcode the edge port, and the only
edge-related flags (`--region`, `--edge-bind-address`, `--edge-ip-version`) don't
move it off 7844. Allowlisting the hostnames is necessary but **insufficient** —
the port is the wall, and the egress filter doesn't expose a port knob.

### Alternatives considered

* **Allowlist outbound TCP/UDP 7844.** Not possible — the egress control is a
  hostname/SNI allowlist on 443, not a port/firewall rule. Ports aren't
  configurable.
* **A named (account) Cloudflare tunnel instead of a quick one.** Same edge,
  same 7844 requirement. The account buys a stable hostname, not a 443 edge.
* **localtunnel / raw-TCP tunnels.** Need a raw-TCP or non-443 path the SNI
  filter won't carry. Blocked for the same reason.
* **ngrok.** Its agent reaches the ngrok edge over **TCP/443** (e.g.
  `connect.ngrok-agent.com:443`), which the SNI filter forwards once the
  `*.ngrok*` hosts are allowlisted. Costs a free authtoken and three allowlist
  entries, but it's the one tunnel whose transport actually fits a 443-only
  egress.

## Decision

**Cloud sessions tunnel via ngrok; off-cloud stays on Cloudflare.**

* `npm run dev:tunnel:ngrok` → `scripts/dev-tunnel-ngrok.mjs` is the
  cloud-session path. It uses the `@ngrok/ngrok` Node SDK (native binary ships
  with `npm install`, so no setup-script prefetch), spawns `dev:host`, waits for
  the server, then `ngrok.forward({ addr: 5173, authtoken_from_env: true })` and
  prints the `https://*.ngrok.*` URL. Cross-platform per ADR-0017 (pure Node,
  `shell: isWin` for the npm spawn).
* It requires two things the **user** controls and the script can't set itself:
  an `NGROK_AUTHTOKEN` env var (free) and the `*.ngrok.com` / `*.ngrok-agent.com`
  / `*.ngrok.io` hosts on the egress allowlist. Missing either, the script prints
  exactly what's absent and exits non-zero rather than hanging.
* `npm run dev:tunnel` (Cloudflare) is **kept as the off-cloud default** — no
  account, no allowlist, better UX on a machine with normal internet. It only
  fails inside the cloud sandbox.
* `docs/CLOUD.md` documents the current working state (run `dev:tunnel:ngrok`,
  set the token, allowlist the hosts) and links here for the why. The `cloudflared`
  prefetch line was removed from the recommended setup script — it buys nothing in
  a cloud session.

## Consequences

* + A phone preview is actually reachable from a cloud session — the previously
  documented Cloudflare path never was.
* + Cloudflare stays the zero-config tunnel everywhere it works (off-cloud), so
  the common case keeps its no-account UX.
* + The script fails loudly with the precise missing prerequisite instead of
  producing a URL that 404s on the phone.
* − Two tunnel scripts and two tunnel deps (`cloudflared` + `@ngrok/ngrok`) to
  maintain, split by environment.
* − ngrok needs a per-user account/token and three allowlist edits — more setup
  than Cloudflare's zero-config quick tunnel, and the token is a secret the repo
  can't carry.
* − ngrok's free tier has session/time limits and a browser interstitial; fine
  for previewing, not for anything long-lived or shared.
* − The 7844 finding is a property of *this* egress proxy. If the sandbox ever
  allows arbitrary outbound ports (or Cloudflare ships a 443 edge), the
  Cloudflare path could work again and this split would be worth revisiting.
