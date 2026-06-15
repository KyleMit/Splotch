# ADR-0021-temp — Microsoft Dev Tunnels probe (in-progress, NOT yet decided)

**Status:** SCRATCH / hand-off. Delete or fold into `0021-cloud-session-tunneling.md`
once the live test below is finished. This is working memory for picking the
investigation back up in a fresh cloud session.

**Question being tested:** Can Microsoft Dev Tunnels (`devtunnel`) tunnel the Vite
dev server out of a Claude Code cloud session, as a simpler alternative to the
self-hosted chisel relay that ADR-0021 currently ships?

---

## TL;DR

The Dev Tunnels **runtime path is viable** through the egress gateway — it clears all
three of ADR-0021 §3's requirements, and unlike ngrok/Cloudflare nothing fails at the
transport layer. The **only** blocker is installing the `devtunnel` CLI binary: it is
closed-source (no GitHub release), distributed only from Microsoft blob storage, and
those download hosts were not on the allowlist. Once the download hosts are added (see
below) and a new session is started, the end-to-end `devtunnel host -p 5173` test can
run. **No decision has been made; chisel remains the shipped path until the test passes.**

---

## What was verified live (session on branch `claude/wonderful-bardeen-emcx5c`, 2026-06-15)

Allowlist at probe time (added by the user for this test):

```
global.rel.tunnels.api.visualstudio.com
*.rel.tunnels.api.visualstudio.com
*.devtunnels.ms
```

Findings, mapped to ADR-0021 §3's three requirements:

| Req. | Meaning | Dev Tunnels | Evidence (reproducible) |
| --- | --- | --- | --- |
| #1 | HTTP/WSS over 443 only | ✅ | Relay is `wss://…rel.tunnels.api.visualstudio.com`; public preview URL is `https://…devtunnels.ms` — both plain HTTPS/WSS. |
| #2 | Relay host is allowlistable | ✅ | `*.rel.tunnels.api.visualstudio.com` + `*.devtunnels.ms` already added and reachable. |
| #3 | Trusts the system CA store | ✅ (expected) | `devtunnel` is a .NET binary → uses the OS/OpenSSL trust store on Linux, so it should accept the Anthropic "Egress Gateway" MITM cert automatically (same reason Go-based chisel works; the opposite of ngrok's `rustls`). **Not yet hardware-confirmed** because the binary isn't installed — this is the one assumption the live test must validate. |

**The keystone positive result — the management/control plane actually answers** (this is
what ngrok could never do: its edge isn't an HTTP server). The control plane is served
from the `.rel.` host, NOT from a separate `global.tunnels.api.visualstudio.com`:

```
$ curl -s https://global.rel.tunnels.api.visualstudio.com/api/v1/clusters
[{"clusterId":"auc1","uri":"https://auc1.rel.tunnels.api.visualstudio.com",...},
 {"clusterId":"use","uri":"https://use.rel.tunnels.api.visualstudio.com","azureLocation":"EastUs"}, ...]
```

Other reachability probes (all from inside the sandbox):

```
global.rel.tunnels.api.visualstudio.com   -> 404   (allowlisted, real upstream answering — good)
*.devtunnels.ms (global.devtunnels.ms)    -> 302 -> /diagnostic  (allowlisted, reachable)
github.com                                -> 200   (for `devtunnel user login -g` device flow)
login.microsoftonline.com                 -> 302   (reachable, if MS login is used instead of -g)
```

Note: a non-`.rel.` host (`global.tunnels.api.visualstudio.com`) does **not resolve**
(`Could not resolve host`) — but that host is NOT needed; Microsoft's firewall doc lists
only the `.rel.` hosts + `*.devtunnels.ms`. So the current allowlist covers the full
*runtime*.

## The blocker — CLI binary download is NOT allowlisted

```
aka.ms                                  -> "Host not in allowlist: aka.ms…"
tunnelsassetsprod.blob.core.windows.net -> "Host not in allowlist: tunnelsassetsprod.blob.core.windows.net…"
```

Official install (per MS docs) is one of:

```
curl -sL https://aka.ms/DevTunnelCliInstall | bash          # script installer
wget https://aka.ms/TunnelsCliDownload/linux-x64            # direct binary; mv -> devtunnel; chmod +x
```

Both go through `aka.ms` → redirect → `tunnelsassetsprod.blob.core.windows.net`. The CLI
is closed-source: there is **no** GitHub release to pull from, and the AUR
`devtunnel-cli-bin` package just re-fetches the same MS blob. So the binary cannot be
obtained without allowlisting the download host(s).

## Hosts to add to the machine allowlist before the next session

(Any listing is fine for the test — broad is OK since this is throwaway probing.)

```
aka.ms
tunnelsassetsprod.blob.core.windows.net
*.blob.core.windows.net
```

Allowlist changes only bind at **session start**, so add these, then open a NEW session.

## Exact test to run next session (once the binary installs)

```bash
# 1. install the CLI (now that the download hosts are allowlisted)
wget -q https://aka.ms/TunnelsCliDownload/linux-x64 -O /tmp/devtunnel && chmod +x /tmp/devtunnel
/tmp/devtunnel --version

# 2. log in (GitHub device flow — github.com is already reachable)
/tmp/devtunnel user login -g -d        # follow the device-code prompt

# 3. start Vite, accepting the tunnel host (reuse the TUNNEL_HOST allowedHosts hook
#    from ADR-0021 §7.1 — the devtunnels.ms hostname is only known after `host` starts,
#    so may need `--host`/a wildcard allowedHosts, or set allowedHosts to the printed host)
npm run dev:host                       # background

# 4. host the port — this is the "open this Vite port on my phone" shape
/tmp/devtunnel host -p 5173 --protocol http --allow-anonymous --verbose
#    expect: a connection over wss://<cluster>.rel.tunnels.api.visualstudio.com/…
#    and a printed public URL like https://<id>-5173.<cluster>.devtunnels.ms/

# 5. verify end-to-end from inside the sandbox, then open the URL on a phone
curl -s -o /dev/null -w '%{http_code}\n' https://<printed-id>-5173.<cluster>.devtunnels.ms/   # expect 200
```

### Things the live test still has to confirm
1. **Req. #3 in practice** — does the .NET client actually accept the Anthropic MITM cert,
   or does it pin its own roots and fail the WSS handshake the way ngrok did? (If it fails,
   try `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt` / `NODE_EXTRA_CA_CERTS` is already
   set; .NET honours `SSL_CERT_FILE`/`SSL_CERT_DIR`.)
2. **Vite `allowedHosts`** — the `devtunnels.ms` hostname is allocated at `host` time, so
   the existing `TUNNEL_HOST` env hook (ADR-0021 §7.1) needs the printed host, or a
   wildcard. Decide whether to widen `allowedHosts` for the devtunnels.ms domain.
3. **Anonymous access** — `--allow-anonymous` makes the URL world-reachable (same caveat as
   the chisel `*.fly.dev` URL); fine for a preview, note it.

### If the test passes
Fold this into `0021-cloud-session-tunneling.md` as a new superseding revision: Dev Tunnels
replaces the self-hosted Fly.io + chisel apparatus with **zero self-hosting** (no relay to
run/pay for) — the user only allowlists the MS hosts and the cloud-preview script becomes
`devtunnel host`. Update `docs/CLOUD.md` and the `dev:tunnel` script
(`scripts/cloud-tunnel.mjs`) accordingly. Then delete this temp file.

### If the test fails
Record exactly where (TLS handshake? control API auth? Vite host check?) in §4's table of
0021, keep chisel as the shipped path, and delete this temp file.
