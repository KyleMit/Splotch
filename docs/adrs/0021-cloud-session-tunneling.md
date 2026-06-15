# ADR-0021: Tunneling the Dev Server from Claude Code Cloud Sessions

**Status:** Active (rev. 2026-06)
**Date:** 2026-06

> **This revision supersedes two earlier decisions in this ADR.** We first shipped
> a Cloudflare quick tunnel (`dev:tunnel`), then switched the cloud path to ngrok
> (`dev:tunnel:ngrok`) on the belief that the egress was a *transparent, SNI-based
> filter on 443* that would forward ngrok's agent. **That model was wrong, and
> ngrok does not work in a cloud session.** The egress is a TLS-**terminating**,
> HTTP-only L7 proxy (Anthropic "Egress Gateway", an Envoy). This document re-derives
> the constraint from scratch with reproducible probes, proves why every off-the-shelf
> tunnel fails, and documents the one shape that works: a **self-hosted HTTP/WebSocket
> reverse tunnel** (chisel on Fly.io). The findings here are deliberately exhaustive
> because the conclusion — "you must run your own relay" — is expensive enough to
> deserve a full proof.

---

## 1. Context: what we are fighting

Previewing the running dev server on a phone from a
[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
cloud session runs into two hard properties of the sandbox:

1. **No inbound port forwarding.** The container shares no network with your phone
   or laptop. There is no built-in "preview this port" feature. The LAN (`dev:host`)
   and USB (`adb:reverse`) flows in the mobile guide assume you develop on a machine
   on the same network as the phone — neither applies here.
2. **Outbound only, through an allowlisting egress gateway.** Every outbound
   connection is intercepted. Off-allowlist hosts are refused; on-allowlist hosts
   are proxied — but *how* they're proxied is the crux of this whole document.

Because there is no inbound path, the only way to reach a phone is an **outbound
tunnel**: a process inside the sandbox dials *out* to a public relay, and the phone
reaches that relay. The viability of every tunnel therefore depends entirely on
whether its agent's outbound transport can survive the egress gateway. So we have
to characterise the gateway precisely.

---

## 2. The egress gateway, dissected

All of the following is reproducible from any cloud session with `curl` + `openssl`
and a single allowlisted host. We use `cdn.playwright.dev` (already on the Splotch
allowlist for E2E) as the "allowlisted" example and `example.com` as the
"not-allowlisted" control. The complete probe script is in
[Appendix A](#appendix-a-the-reproducible-probe); the per-layer findings:

### L1 — Allowlisting is real, and enforced with a readable error

```
$ curl -s -o /dev/null -w '%{http_code}\n' https://cdn.playwright.dev/
400                       # reached the real upstream (Azure CDN 400s a bare GET)
$ curl -s https://example.com/
Host not in allowlist: example.com. Add this host to your network egress settings…
```

An allowlisted host is **proxied through to its real upstream** (we get the CDN's own
`400`, not a gateway error). A non-allowlisted host is refused by the gateway with an
explicit `Host not in allowlist` body. So the gateway is a *forwarding* proxy with an
allowlist, not a transparent pass-through.

### L2 — It is a TLS-terminating MITM (the keystone finding)

```
$ openssl s_client -connect cdn.playwright.dev:443 -servername cdn.playwright.dev </dev/null \
  | openssl x509 -noout -subject -issuer
subject=CN = *.playwright.dev
issuer=O = Anthropic, CN = Egress Gateway SDS Issuing CA (production)
```

The certificate we receive for `cdn.playwright.dev` is **issued by Anthropic**, not by
the CDN's real public CA. The gateway terminates TLS, inspects it, and re-originates a
*separate* TLS connection to the true upstream. This is a deliberate man-in-the-middle.
It works transparently for `curl`/`node`/Go because the Anthropic CA is injected into
the container's **system trust store**:

```
$ # 4 Anthropic CAs live in the system bundle that NODE_EXTRA_CA_CERTS points at
Anthropic CA certs found in /etc/ssl/certs/ca-certificates.crt: 4
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
$ curl -s -o /dev/null -w 'ssl_verify_result=%{ssl_verify_result}\n' https://cdn.playwright.dev/
ssl_verify_result=0       # 0 == verified OK against the system store
```

**Consequence that decides everything downstream:** any client that ships its **own**
root store instead of using the system one (Rust/`rustls` + `webpki-roots`, or any tool
that pins its provider's CA) will reject the Anthropic-minted cert and fail at the TLS
handshake. Go's `crypto/tls` and `curl`/`node` use the system store and sail through.

### L3 / L4 — It only speaks HTTP (it is an Envoy)

```
$ openssl s_client -connect cdn.playwright.dev:443 -alpn h2,http/1.1 … | grep ALPN
ALPN protocol: h2                          # offers HTTP/2 …

$ printf '\x16\x03…not-http-garbage' | openssl s_client -quiet -connect cdn.playwright.dev:443 …
HTTP/1.1 400 Bad Request                   # … and 400s anything that isn't HTTP
content-type: text/plain
```

The gateway negotiates HTTP ALPNs (`h2` and `http/1.1`) and answers non-HTTP bytes with
`400 Bad Request`. When the *upstream* re-origination fails it returns Envoy's signature
error (`upstream connect error or disconnect/reset before headers. reset reason: …`),
which is how we know the implementation is **Envoy**. It is an L7 **HTTP proxy**: it can
carry HTTP/1.1, HTTP/2, and WebSocket `Upgrade` — and nothing else.

### L5 — There is no CONNECT escape hatch

```
$ printf 'CONNECT cdn.playwright.dev:443 HTTP/1.1\r\nHost: …\r\n\r\n' | openssl s_client -quiet …
HTTP/1.1 403 Forbidden
x-deny-reason: proxy_ip_not_allowed
```

A forward proxy that honoured `CONNECT` would let a client tunnel arbitrary raw TLS/TCP
end-to-end (and thus dodge the MITM). This gateway **refuses `CONNECT`** with
`proxy_ip_not_allowed`. So you cannot ask it to ferry a raw byte stream — only real HTTP
requests to allowlisted hosts.

### L6 — Routing/allowlisting keys on the **Host header**, not just SNI

```
$ curl --connect-to example.com:443:cdn.playwright.dev:443 https://example.com/
…-> HTTP 403            # allowlisted SNI + non-allowlisted Host  => still denied
```

Presenting an allowlisted SNI while addressing a non-allowlisted `Host` is still denied.
You cannot smuggle traffic to an off-list host behind an on-list SNI. The host you talk
to must be genuinely allowlisted.

### L7 — HTTP/2 works end-to-end

```
$ curl --http2 -s -o /dev/null -w '%{http_version} / %{http_code}\n' https://cdn.playwright.dev/
2 / 400                 # real h2 negotiated through to the upstream
```

### The gateway in one paragraph

It is an **Envoy-based, TLS-terminating, allowlisting L7 HTTP proxy.** It forwards
HTTP/1.1, HTTP/2, and WebSocket to hosts that are on the allowlist *by Host header*,
re-originating a fresh upstream TLS connection. It MITMs every connection with an
Anthropic-issued cert that only the **system** trust store knows. It refuses non-HTTP
bytes (`400`) and refuses `CONNECT` (`403`). There are no ports but 443 in play and no
raw-TCP path at all.

---

## 3. What any tunnel must therefore satisfy

From §2, an outbound tunnel can only work if **all three** hold:

1. **HTTP-shaped transport.** The agent → relay link must be HTTP/1.1, HTTP/2, or a
   WebSocket `Upgrade` over HTTPS/443. Anything using raw TLS with a custom ALPN, raw
   TCP, UDP/QUIC, a non-443 port, or HTTP `CONNECT` is dead on arrival.
2. **Allowlisted relay host.** The relay's hostname (matched on the **Host header**)
   must be on the egress allowlist — which means *you* must be able to add it, so it
   has to be a host you control or a stable vendor hostname.
3. **System-trust-store TLS.** The agent must validate the server against the OS trust
   store (or be configurable to), because the gateway presents an Anthropic-minted cert.
   Clients that pin their own roots (`rustls`/`webpki-roots`) reject it.

These three are an unusually tight filter, and they eliminate essentially every
turnkey tunnel product. The paid/free distinction never matters here: tiers change
custom-domain and quota features, **never the agent's wire transport**, which is the
only thing the gateway cares about.

---

## 4. Options explored, and proof each is non-viable

| Option | Transport to its edge | Fails requirement | Evidence |
| --- | --- | --- | --- |
| **Cloudflare quick tunnel** (`cloudflared`) | QUIC `udp/7844`, or `--protocol http2` on `tcp/7844` | #1 (non-443 port; not plain HTTP) | `api.trycloudflare.com` mints the URL but the edge link to `*.argotunnel.com:7844` is refused; `cloudflared` self-check: `TCP …:7844 FAIL`, `UDP …:7844 FAIL`. |
| **Cloudflare named tunnel** (paid) | same `7844` edge | #1 | Account buys a stable hostname, not a 443/HTTP edge. No flag moves the edge off 7844. |
| **ngrok** (free *and* paid) | muxado over TLS/443 with ngrok's **own ALPN**; `rustls` client | #1 and #3 | Agent dies with `failed to connect session: tls handshake error` (rustls rejects the Anthropic MITM cert). Forcing the system store (`rootCas("host")`) gets past TLS, then fails `failed to deserialize rpc response` — and a direct probe of `connect.ngrok-agent.com` shows the gateway re-originates with a standard ALPN that ngrok's edge rejects: `…TLSV1_ALERT_NO_APPLICATION_PROTOCOL`. No HTTP-transport mode exists; `proxy_url` needs `CONNECT` (L5: `403`). |
| **Tailscale Funnel** | WireGuard `udp`; DERP relays | #1, #2 | UDP is unavailable; DERP hosts aren't allowlistable by you and its framing isn't plain HTTP to a host you control. |
| **SSH-based** (localhost.run, pinggy, serveo) | SSH (port 22, or SSH-over-443) | #1 | SSH is not HTTP; the gateway `400`s non-HTTP bytes (L4) and won't `CONNECT` (L5). |
| **Raw-TCP** (bore, classic localtunnel) | raw TCP to a high port | #1 | No raw-TCP path exists; only HTTP to 443. |
| **Built-in "session ingress"** | n/a | — | Env vars (`CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2`) hint at an Anthropic-internal inbound channel, but no documented/user-exposed tool forwards a local port to a public URL. Not usable. |

### Why ngrok in particular looked plausible but isn't

ngrok was our previous decision precisely because its control channel is "TLS on 443",
which *sounds* allowlist-friendly. Two independent walls stop it:

* **CA pinning (req. #3).** ngrok's Rust agent uses `rustls` with bundled `webpki-roots`
  and never consults the system store, so it rejects the Anthropic gateway cert →
  `tls handshake error`. This is the same reason any `rustls` tool fails.
* **ALPN mismatch on re-origination (req. #1).** Even after pointing ngrok at the system
  store, the gateway terminates and re-originates to ngrok's edge using a *standard* HTTP
  ALPN. ngrok's edge speaks its own protocol/ALPN and rejects it
  (`NO_APPLICATION_PROTOCOL`), surfaced to the agent as `failed to deserialize rpc
  response`. The gateway is fundamentally an HTTP proxy; ngrok's edge isn't an HTTP
  server.

No combination of flags or paid features changes either wall.

---

## 5. The shape of a viable solution

The three requirements admit essentially one shape:

> **A reverse tunnel whose agent → relay link is WebSocket (or HTTP/2) over HTTPS/443,
> terminating at a relay you run on a host you can add to the allowlist, using a client
> that trusts the system CA store.**

Concretely that means a **self-hosted** relay (the relay's hostname is the thing you
allowlist, per req. #2) speaking **WebSocket/HTTP** (req. #1), reached by a **Go** client
(req. #3 — Go uses the OS trust store by default). Tools of this shape:
[`chisel`](https://github.com/jpillora/chisel) (Go; TCP-over-WebSocket; reverse mode),
[`wstunnel`](https://github.com/erebe/wstunnel) (WebSocket **or** HTTP/2; built to
traverse MITM proxies), and `frp` with `transport.protocol = websocket`.

We chose **chisel**, because: it is Go (system-store TLS — clears req. #3 with no flags),
its `--backend` flag lets one public hostname serve *both* the tunnel control WS and the
proxied app (clean single-URL HTTPS for the phone), and it is a single static binary on
each end.

---

## 6. Decision

**Cloud-session phone preview uses a self-hosted chisel reverse tunnel, fronted by a
relay on Fly.io (free `*.fly.dev` HTTPS) — or any VPS with a domain.** The
sandbox runs only the chisel **client**; the user runs the **server** once and adds its
host to the egress allowlist.

Data path:

```
phone ──HTTPS──▶  <app>.fly.dev      (Fly edge: real *.fly.dev cert, terminates TLS, supports WS)
                       │ proxies :443 → container :8080
                  chisel server  ──normal HTTP──▶ --backend 127.0.0.1:9000 ┐ reverse listener
                       │ WSS control (Sec-WebSocket-*)                      │
 sandbox ─ chisel client ─WSS─▶ (Anthropic Envoy gateway forwards Upgrade) ┘──▶ localhost:5173 (Vite)
```

Why this clears all three requirements where ngrok could not:

* **req. #1** — chisel's transport is a WebSocket over HTTPS/443; the Envoy gateway
  forwards the `Upgrade` (verified: the 101 completes and the client logs
  `Connected`).
* **req. #2** — `<app>.fly.dev` is a stable hostname you add to the allowlist.
* **req. #3** — chisel is Go and trusts the system store, so the Anthropic MITM cert is
  accepted automatically.

Verified end-to-end: with the client connected, `curl https://<app>.fly.dev/` from inside
the sandbox returns **HTTP 200** and the Splotch app HTML (`<title>Splotch - Drawing for
Kids</title>`), and the page loads in a phone browser. No `wstunnel` fallback was needed.

The earlier `dev:tunnel` (Cloudflare) and `dev:tunnel:ngrok` scripts — and their
`cloudflared` / `@ngrok/ngrok` dependencies — have been **removed**: one never worked in
the sandbox (ngrok) and the other added a dependency for a job that is one `curl` line
off-cloud (`cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173` on a
normal machine). The cloud path is the chisel reverse tunnel documented in §7; off-cloud
needs no repo tooling at all.

---

## 7. Full setup — Fly.io relay + chisel (repeatable)

Everything below is what makes this independently reproducible in a fresh session.

### 7.1 One small repo change (already committed)

`vite.config.ts` gained an env-gated `allowedHosts` so Vite accepts requests arriving
under the tunnel hostname. Inert unless `TUNNEL_HOST` is set — no effect on normal dev or
the web/native builds (commit `feat(dev): allow phone-preview tunnel host via TUNNEL_HOST`):

```ts
server: {
  port: 5173,
  strictPort: true,
  ...(process.env.TUNNEL_HOST ? { allowedHosts: [process.env.TUNNEL_HOST] } : {})
},
```

### 7.2 Server side (user, once) — Fly.io

`Dockerfile` (pins chisel; reads its auth from the `AUTH` env so no secret is committed):

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl \
 && curl -sSL https://github.com/jpillora/chisel/releases/download/v1.10.1/chisel_1.10.1_linux_amd64.gz \
    | gunzip > /usr/local/bin/chisel \
 && chmod +x /usr/local/bin/chisel
ENTRYPOINT ["/usr/local/bin/chisel"]
CMD ["server","--port","8080","--reverse","--backend","http://127.0.0.1:9000","--keepalive","25s"]
```

`fly.toml` (Fly terminates TLS at its edge and proxies to the container; one internal
port; always-on so the tunnel persists):

```toml
app = "splotch-tunnel-kyle"     # your globally-unique app name
primary_region = "iad"          # iad/ewr near the US East Coast; bos is deprecated

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

Deploy (Fly requires a card; an always-on `shared-cpu-1x/256mb` is ~$2/mo):

```bash
curl -L https://fly.io/install.sh | sh        # or: brew install flyctl
fly auth login
cd <folder with the two files>
fly apps create splotch-tunnel-kyle

# generate the shared secret, PRINT it (also goes in the sandbox env), store as a Fly secret:
S="splotch:$(openssl rand -hex 16)"; echo "AUTH = $S"
fly secrets set AUTH="$S" -a splotch-tunnel-kyle

fly deploy
fly scale count 1 -a splotch-tunnel-kyle      # CRITICAL: exactly ONE machine (see §8)
fly status -a splotch-tunnel-kyle             # confirm a single "started" machine
```

### 7.3 Two environment settings (user, in the Claude Code web env dialog)

These bind only at **session start**, so add them, then start a **new** session:

1. **Allowlist** the relay host (same box as the existing entries):
   ```
   splotch-tunnel-kyle.fly.dev
   ```
2. **Env var** carrying the same secret to the sandbox (so it never appears in chat):
   ```
   TUNNEL_AUTH = splotch:<the exact hex you set as Fly's AUTH>
   ```

### 7.4 Sandbox side (the agent, each session)

```bash
# 1. confirm prerequisites (don't print the secret)
[ -n "$TUNNEL_AUTH" ] && echo "TUNNEL_AUTH present"
curl -s -o /dev/null -w 'fly host -> %{http_code}\n' https://splotch-tunnel-kyle.fly.dev/   # 502 = up, no backend yet (good)

# 2. chisel client (Go binary; trusts the system CA)
curl -sSL https://github.com/jpillora/chisel/releases/download/v1.10.1/chisel_1.10.1_linux_amd64.gz \
  | gunzip > /tmp/chisel && chmod +x /tmp/chisel

# 3. dev server, accepting the tunnel host
TUNNEL_HOST=splotch-tunnel-kyle.fly.dev npm run dev:host      # (background)

# 4. open the reverse tunnel: server :9000 → sandbox :5173
/tmp/chisel client --auth "$TUNNEL_AUTH" --keepalive 25s \
  https://splotch-tunnel-kyle.fly.dev R:127.0.0.1:9000:localhost:5173   # (background)

# 5. verify end-to-end from inside the sandbox
curl -s -o /dev/null -w '%{http_code}\n' https://splotch-tunnel-kyle.fly.dev/   # expect 200
```

`200` ⇒ the full path (phone → Fly → chisel → reverse tunnel → Vite) is live; open
`https://splotch-tunnel-kyle.fly.dev` on the phone. `502` ⇒ the chisel client isn't
connected (check `TUNNEL_AUTH` matches the Fly `AUTH` exactly).

### 7.5 VPS alternative (no Fly, your own domain)

Run chisel directly on any Ubuntu VPS, letting chisel do Let's Encrypt on 443 — no
front proxy needed (`--tls-domain` uses port 443 + TLS-ALPN-01, so open 80/443):

```bash
VER=1.10.1
curl -sSL "https://github.com/jpillora/chisel/releases/download/v${VER}/chisel_${VER}_linux_amd64.gz" \
  | gunzip > /usr/local/bin/chisel && chmod +x /usr/local/bin/chisel
# point tun.yourdomain.com A-record at the VPS, then:
AUTH="splotch:$(openssl rand -hex 16)"   # also set as TUNNEL_AUTH in the Claude env
chisel server --port 443 --tls-domain tun.yourdomain.com \
  --reverse --backend http://127.0.0.1:9000 --auth "$AUTH" --keepalive 25s
```

Sandbox side is identical to §7.4 with `splotch-tunnel-kyle.fly.dev` → `tun.yourdomain.com`.

---

## 8. Consequences

* **+** A phone preview is *actually* reachable from a cloud session — for the first
  time. The previously documented ngrok path never worked against this gateway.
* **+** The mechanism is honestly characterised: §2 is a reproducible proof, so the next
  person doesn't re-litigate ngrok/Cloudflare from scratch.
* **+** The repo sheds two tunnel scripts and their `cloudflared` / `@ngrok/ngrok`
  dependencies; off-cloud previewing is a one-line `cloudflared`/`ngrok` invocation that
  needs no committed tooling.
* **−** It requires the user to run and pay for (pennies) a public relay and edit two env
  settings + the allowlist. This is materially more setup than a one-line tunnel — the
  entire point of §2–§4 is to prove that the simpler options are *impossible*, not merely
  inconvenient, so the cost is justified.
* **−** The relay must run **exactly one** machine. Fly's default HA spins up two; the
  reverse tunnel registers on only one, so the other serves `502` for ~half of requests.
  `fly scale count 1` is mandatory, and `min_machines_running = 1` keeps it warm.
* **−** `https://<app>.fly.dev` is publicly reachable by anyone with the URL; `AUTH` only
  gates tunnel *creation*, not the page. Use an unguessable name; add HTTP basic-auth if
  the preview content is sensitive.
* **−** Env-var/allowlist changes only take effect in a **new** session, so the relay
  must be stood up before the session that uses it.
* **−** The cloud path is external to the repo (a Fly relay + chisel binary fetched at
  session time), so it isn't exercised by CI and depends on user-side setup staying alive.
  If the sandbox ever ships real inbound forwarding, or the egress becomes a
  genuine pass-through / honours `CONNECT`, this whole apparatus can be retired —
  re-run [Appendix A](#appendix-a-the-reproducible-probe) to check.

---

## Appendix A: the reproducible probe

Run from any cloud session (`curl` + `openssl` are present). The only input is one
allowlisted host. This is the script that produced every output quoted in §2.

```bash
#!/usr/bin/env bash
# Read-only probe of the Claude Code on the web egress gateway.
ALLOW=cdn.playwright.dev          # an allowlisted host
DENY=example.com                  # a non-allowlisted control
line(){ printf '\n=== %s ===\n' "$1"; }

line "L1 allowlist enforcement"
curl -s -o /dev/null -w "  $ALLOW -> HTTP %{http_code}\n" --max-time 12 "https://$ALLOW/"
curl -s --max-time 12 "https://$DENY/" | head -c 120; echo

line "L2 MITM? cert issuer"
timeout 12 openssl s_client -connect "$ALLOW:443" -servername "$ALLOW" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer | sed 's/^/  /'

line "L3 ALPN offered"
timeout 12 openssl s_client -connect "$ALLOW:443" -servername "$ALLOW" -alpn h2,http/1.1 </dev/null 2>/dev/null \
  | grep -i "ALPN protocol" | sed 's/^/  /'

line "L4 non-HTTP bytes"
printf '\x16\x03\x01\x00\x10not-http-garbage' \
  | timeout 12 openssl s_client -quiet -connect "$ALLOW:443" -servername "$ALLOW" 2>/dev/null | head -c 60 | sed 's/^/  /'; echo

line "L5 CONNECT escape hatch"
printf 'CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\n\r\n' "$ALLOW" "$ALLOW" \
  | timeout 12 openssl s_client -quiet -connect "$ALLOW:443" -servername "$ALLOW" 2>/dev/null | head -c 80 | sed 's/^/  /'; echo

line "L6 Host vs SNI routing"
curl -s -o /dev/null -w "  SNI=$ALLOW Host=$DENY -> HTTP %{http_code}\n" \
  --connect-to "$DENY:443:$ALLOW:443" --max-time 12 "https://$DENY/"

line "L7 HTTP/2 end-to-end"
curl -s -o /dev/null -w "  via --http2 -> %{http_version} / HTTP %{http_code}\n" --http2 --max-time 12 "https://$ALLOW/"

line "CA split: Anthropic CA in the system store?"
awk '/BEGIN CERT/{c=""} {c=c $0 "\n"} /END CERT/{ if (system("echo \""c"\" | openssl x509 -noout -issuer 2>/dev/null | grep -qi Anthropic")==0) n++ } END{print "  Anthropic CAs in bundle:", n+0}' \
  "${NODE_EXTRA_CA_CERTS:-/etc/ssl/certs/ca-certificates.crt}"
```

Expected today: `L1` allow=upstream code / deny=`Host not in allowlist`; `L2`
issuer=`Anthropic … Egress Gateway`; `L3` `h2`; `L4` `400 Bad Request`; `L5` `403
proxy_ip_not_allowed`; `L6` `403`; `L7` `2 / …`; CA split ≥ 1. If `L2` ever stops
showing an Anthropic issuer, or `L5` starts returning `200`, the gateway has changed and
the simpler tunnels may be back on the table.
