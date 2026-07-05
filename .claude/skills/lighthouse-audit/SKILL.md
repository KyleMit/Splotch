---
name: lighthouse-audit
description: Run a Lighthouse page-load audit of the Splotch web app emulated on a slow device + slow internet (phone portrait + tablet landscape), capturing first-visit and repeat-visit runs, and turn the results into TODO opportunities. Use when asked to audit page-load/Lighthouse performance, measure load on a throttled device/network, check Core Web Vitals (FCP/LCP/TBT/CLS), or compare first vs repeat visit. For drawing/canvas interaction performance use the `profiling` skill instead.
---

# Splotch — Lighthouse page-load audit

Measures **page load** (how fast the app becomes usable) on a throttled device,
as opposed to the `profiling` skill, which measures **drawing interaction** once
loaded. The LCP element is always `<canvas#drawingCanvas>` — "loaded" means the
drawing surface has painted.

The driver [`run-audit.mjs`](run-audit.mjs) runs Lighthouse via `npx lighthouse@12`
(no install needed) for two form factors × two visit types under a fixed
slow-device/slow-internet profile, writes JSON + HTML reports, and prints a
summary table.

## Quick start

```bash
# Full matrix (phone + tablet, first + repeat) against production:
node .claude/skills/lighthouse-audit/run-audit.mjs

# One device / one visit:
node .claude/skills/lighthouse-audit/run-audit.mjs --device phone --visits first

# Audit a branch preview before merge (see "Which target" below):
node .claude/skills/lighthouse-audit/run-audit.mjs \
  --url https://claude-my-branch--splotchy.netlify.app/
```

| Flag | Values | Default |
| --- | --- | --- |
| `--url` | any URL | `https://splotch.art/` |
| `--device` | `phone` \| `tablet` \| `both` | `both` |
| `--visits` | `first` \| `repeat` \| `both` | `both` |
| `--out` | directory | `lighthouse-reports/` (gitignored) |

**What's fixed** (the "slow device + slow internet" definition): Lighthouse's
default mobile emulation — **simulated Slow 4G + 4× CPU throttle** — for every
run. Form factors: **phone portrait** 412×915 (dsf 2.625), **tablet landscape**
1133×744 (dsf 2). Repeat visit is a genuine warm-cache load: the driver primes a
persistent Chrome profile with a first pass, then re-runs with
`--disable-storage-reset` so the disk cache carries over.

## Which target to audit — this matters

There are three things you can point Lighthouse at; they answer different
questions. **For any score you report or track, use production (or a branch
preview) — nothing else is accurate.**

| Target | How | Use it for |
| --- | --- | --- |
| **Production** `splotch.art` | default | The real number. Real minified bundles + Netlify CDN + HTTP/2 + real cache headers. |
| **Branch preview** `<slug>--splotchy.netlify.app` | `--url` | Production-accurate numbers for **unmerged** work (same Netlify serving). The way to measure a perf change before merge. |
| **Local prod preview** `npm run build` + `preview` | `--url http://localhost:4173/` | Measuring the *bundle* in isolation (bytes, DOM count). **Ignore its LCP/network/score** — its HTTP/1.1 no-CDN serving is unrepresentative. |

**Do not audit the dev server (`npm run dev`) for scores.** It serves hundreds of
unbundled ES modules with the HMR client and dev-mode Svelte checks — that
distorts the request graph, TBT and LCP structurally, not by a constant, so the
numbers map to nothing shippable. (Real gotcha: an early local-preview run here
reported LCP 5.4 s / Perf 73; the same build on production was LCP 1.9 s / Perf 91
— the preview's serving layer was the whole gap.)

For the *diagnostic* questions production is bad at, don't reach for the dev
server — use the better-suited tool:

- **Which JS/CSS is unused, and where in source** → audit the **preview build with
  source maps** (real bytes + readable attribution).
- **Why is the main thread busy / drawing jank** → the `profiling` skill
  (`npm run perf:web`), which profiles the production bundle with named marks.

## Running from a Claude-Code-on-web sandbox (the proxy/TLS workaround)

The driver handles this automatically — this section is *why*, so it can be fixed
if it ever breaks. The cloud sandbox's outbound egress is a **TLS-terminating MITM
proxy**. `curl` works (it trusts the CA bundle), but headless Chrome fails to load
an external https origin unless three things are true; the driver adds these
`--chrome-flags` only when it detects the sandbox (`HTTPS_PROXY` set, Linux):

1. **Route through the proxy** — `--proxy-server=$HTTPS_PROXY`. Without it Chrome
   tries a direct connection that the sandbox has no egress for.
2. **Trust the MITM leaf** — `--ignore-certificate-errors-spki-list=<hashes>`. The
   proxy presents a per-host cert signed by an Anthropic CA in
   `/root/.ccr/ca-bundle.crt`; the driver computes the base64-SHA-256 SPKI of
   those signing CAs and allowlists them (matching any cert in the chain is
   enough). Plain `--ignore-certificate-errors` does **not** work: the site sends
   HSTS, which makes cert errors non-bypassable.
3. **Force TLS 1.2** — `--ssl-version-max=tls1.2`. **This is the key fix.** The
   gateway RESETS Chrome's TLS 1.3 ClientHello (`ERR_CONNECTION_RESET`); TLS 1.2
   negotiates cleanly.

Diagnose proxy issues with `curl -sS "$HTTPS_PROXY/__agentproxy/status"`. This only
affects *reaching* the origin — Lighthouse's `simulate` throttling models the
network from the request graph + byte sizes, so the proxy path and TLS version do
**not** skew FCP/LCP/transfer numbers. Off-sandbox (a normal laptop) the driver
adds none of this and runs a plain Lighthouse.

## Reading the results & known findings

`--out` holds `<device>-<visit>.report.{json,html}`. Open the HTML for the full
report; the console summary covers the headline scores. Turn opportunities into
`docs/TODO.md` items in the `/code-audit` format (see `docs/TODO.md` for the
established structure). As of the last audit the standing opportunities were:

- **Defer the pencil-sound preload** (`drawingSound.ts` / `DrawingCanvas.svelte`) —
  357 KB of mp3 warmed at mount is ~half the first-visit transfer; top first-visit win.
- **Longer cache lifetime for immutable media** (`netlify.toml`) — `/sounds`,
  `/styles`, `/icons` are served `max-age=0,must-revalidate`, so repeat visits pay
  a 304 round-trip each; a long `max-age` or content-hashing skips it.
- **Main-thread work / TBT** on first visit; **DOM size** (~1,288 elements);
  **`user-scalable=no`** viewport (the one a11y deduction, likely intentional).

**Variance:** `simulate` mode is not deterministic — Perf can swing ±15 points and
TBT can double between identical runs. Judge trends and medians across a few runs,
not a single number; don't treat a one-off swing as a regression.

Reports are large; the output dir is gitignored. **Do not commit them** — attach
the HTML (zipped; GitHub rejects raw `.html`) to the PR instead.
