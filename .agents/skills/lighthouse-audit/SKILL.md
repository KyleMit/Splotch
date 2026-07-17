---
name: lighthouse-audit
description: Run a Lighthouse page-load audit of the Splotch web app emulated on a slow device + slow internet (phone portrait + tablet landscape), capturing first-visit and repeat-visit runs, and turn the results into audit opportunities. Use when asked to audit page-load/Lighthouse performance, measure load on a throttled device/network, check Core Web Vitals (FCP/LCP/TBT/CLS), or compare first vs repeat visit. For drawing/canvas interaction performance use the `profiling` skill instead.
---

# Splotch — Lighthouse page-load audit

Measures **page load** (how fast the app becomes usable) on a throttled device, as opposed to the
`profiling` skill, which measures **drawing interaction** once loaded. The LCP element is the full
drawing surface (currently `.paper-sheet`; earlier builds used `<canvas#drawingCanvas>`) — "loaded"
means that surface has painted. Confirm the element from each report instead of assuming it stayed
the same across UI changes.

The driver [`run-audit.mjs`](run-audit.mjs) runs Lighthouse via `npx lighthouse@12` (no install
needed) for two form factors × two visit types under a fixed slow-device/slow-internet profile,
writes JSON + HTML reports, and prints a summary table.

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

| Flag       | Values                        | Default                            |
| ---------- | ----------------------------- | ---------------------------------- |
| `--url`    | any URL                       | `https://splotch.art/`             |
| `--device` | `phone` \| `tablet` \| `both` | `both`                             |
| `--visits` | `first` \| `repeat` \| `both` | `both`                             |
| `--out`    | directory                     | `lighthouse-reports/` (gitignored) |

**What's fixed** (the "slow device + slow internet" definition): Lighthouse's default mobile
emulation — **simulated Slow 4G + 4× CPU throttle** — for every run. Form factors: **phone
portrait** 412×915 (dsf 2.625), **tablet landscape** 1133×744 (dsf 2). Repeat visit is a genuine
warm-cache load: the driver primes a persistent Chrome profile with a first pass, then re-runs with
`--disable-storage-reset` so the disk cache carries over.

## Which target to audit — this matters

There are three things you can point Lighthouse at; they answer different questions. **For any score
you report or track, use production (or a branch preview) — nothing else is accurate.**

| Target                                             | How                            | Use it for                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Production** `splotch.art`                       | default                        | The real number. Real minified bundles + Netlify CDN + HTTP/2 + real cache headers.                                                                                                                                                                                                                                                      |
| **Branch preview** `<slug>--splotchy.netlify.app`  | `--url`                        | Production-accurate numbers for **unmerged** work (same Netlify serving). The way to measure a perf change before merge. In restricted preview mode only `feature/*` branches deploy — see [Claude Code Cloud § Two preview modes](../../../docs/CLOUD/Claude.md#two-preview-modes--check-which-one-is-active) for how to get a preview. |
| **Local prod preview** `npm run build` + `preview` | `--url http://localhost:4173/` | Measuring the *bundle* in isolation (bytes, DOM count). **Ignore its LCP/network/score** — its HTTP/1.1 no-CDN serving is unrepresentative.                                                                                                                                                                                              |

**Do not audit the dev server (`npm run dev`) for scores.** It serves hundreds of unbundled ES
modules with the HMR client and dev-mode Svelte checks — that distorts the request graph, TBT and
LCP structurally, not by a constant, so the numbers map to nothing shippable. (Real gotcha: an early
local-preview run here reported LCP 5.4 s / Perf 73; the same build on production was LCP 1.9 s /
Perf 91 — the preview's serving layer was the whole gap.)

For the *diagnostic* questions production is bad at, don't reach for the dev server — use the
better-suited tool:

* **Which JS/CSS is unused, and where in source** → audit the **preview build with source maps**
  (real bytes + readable attribution).
* **Why is the main thread busy / drawing jank** → the `profiling` skill (`npm run perf:web`), which
  profiles the production bundle with named marks.

## Running from a Claude-Code-on-web sandbox (the proxy/TLS workaround)

The driver handles this automatically — this section is *why*, so it can be fixed if it ever breaks.
The cloud sandbox's outbound egress is a **TLS-terminating MITM proxy**. `curl` works (it trusts the
CA bundle), but headless Chrome fails to load an external https origin unless three things are true;
the driver adds these `--chrome-flags` only when it detects the sandbox (`HTTPS_PROXY` set, Linux):

1. **Route through the proxy** — `--proxy-server=$HTTPS_PROXY`. Without it Chrome tries a direct
   connection that the sandbox has no egress for.
2. **Trust the MITM leaf** — `--ignore-certificate-errors-spki-list=<hashes>`. The proxy presents a
   per-host cert signed by an Anthropic CA in `/root/.ccr/ca-bundle.crt`; the driver computes the
   base64-SHA-256 SPKI of those signing CAs and allowlists them (matching any cert in the chain is
   enough). Plain `--ignore-certificate-errors` does **not** work: the site sends HSTS, which makes
   cert errors non-bypassable.
3. **Force TLS 1.2** — `--ssl-version-max=tls1.2`. **This is the key fix.** The gateway RESETS
   Chrome's TLS 1.3 ClientHello (`ERR_CONNECTION_RESET`); TLS 1.2 negotiates cleanly.

Diagnose proxy issues with `curl -sS "$HTTPS_PROXY/__agentproxy/status"`. This only affects
*reaching* the origin — Lighthouse's `simulate` throttling models the network from the request
graph + byte sizes, so the proxy path and TLS version do **not** skew FCP/LCP/transfer numbers.
Off-sandbox (a normal laptop) the driver adds none of this and runs a plain Lighthouse.

## After every run — do this every time (not optional)

These steps are part of *running* the skill, so a caller can just invoke it and get them for free.
Do them in order.

### 1. Read the results

`--out` holds `<device>-<visit>.report.{json,html}`. Open the HTML for the full report; the console
summary covers the headline scores. For attribution beyond the headline (which node blew up DOM
size, LCP phase breakdown, main-thread cost by category) read the JSON — e.g.
`node -e 'const a=require("./lighthouse-reports/phone-portrait-first.report.json").audits; …'` lets
you pull `dom-size`, `largest-contentful-paint-element`, `mainthread-work-breakdown`, and
`bootup-time` `details.items` without opening the 464 KB HTML. Always inspect `long-tasks` too. If
every item is attributed to `_lighthouse-eval.js`, the reported TBT and derived performance score
include Lighthouse's own injected work; the driver marks those TBT values with `*`. Do not turn that
value into an app finding — use `npm run perf:mount` for an independent startup trace first.

### 2. Merge findings into `docs/AUDIT.md` — combine, don't overwrite

This is an audit skill; it follows the shared conventions in
[`.claude/audit-conventions.md`](../../audit-conventions.md). Turn opportunities into
`docs/AUDIT.md` findings under a `## Source: Lighthouse page-load audit` section, using the
canonical finding format documented there. **Merge into that section — do not clobber it (§1):**

* **An existing item still stands** → keep it; *enrich* it with any sharper attribution this run
  gave you (e.g. a specific file/node the report now points at), and refresh its numbers.
* **The score table** → update it to reflect this run. Prefer showing a *range* across runs over
  replacing the single number, and note the audit date — that preserves the variance picture instead
  of erasing the prior data point.
* **A genuinely new opportunity** → add it as a new `###` finding (canonical format).
* **An item that's since been fixed** → remove its whole `###` block (confirm against the report
  first).

### 3. Log the run

Add a row to `docs/AUDIT-LOG.md` (§2 of the shared conventions) — today's date, `lighthouse-audit`,
and a one-line summary (headline scores + the standout lever).

### 4. Self-heal this skill

If anything surprising surfaced that a future caller would want to know — a durable **method**
gotcha (a false-positive audit, a proxy quirk, an interpretation trap) — fold it into this
`SKILL.md` as part of the same task (§3 of the shared conventions). **Do not** record the specific
findings/opportunities here: those live in `docs/AUDIT.md` and are removed from there as they're
fixed, so a copy in the skill would only go stale. The skill carries *how to audit and how to read
the numbers*; `docs/AUDIT.md` carries *what's currently wrong*.

## Interpretation caveats

**False positive — Lighthouse's own work can dominate TBT:** Lighthouse labels its
`Runtime.evaluate` scripts `_lighthouse-eval.js`. With simulated CPU throttling, that injected task
can be scaled and counted in TBT even though Lighthouse excludes the same URL from `bootup-time`.
This reproduced in both Lighthouse 12.8.2 and 13.4.0. When every `long-tasks` item has that URL,
treat TBT and the derived Perf score as contaminated, inspect the observed `main-thread-tasks`, and
confirm any startup concern with `npm run perf:mount` before filing it. If an app URL also appears,
investigate that app-attributed work normally.

**False positive — don't file an audit item for it:** the `lcp-discovery-insight` audit currently
flags *"`fetchpriority=high` should be applied: false"*. The LCP is `.paper-sheet`, whose tiny CSS
background texture is already discoverable in the initial document and requested at high priority;
the `<div>` cannot itself take `fetchpriority`. Earlier builds used the painted canvas and had no
LCP resource at all. Confirm the current LCP node plus `lcp-breakdown-insight` and request priority;
only file this if a future LCP resource has meaningful discovery delay.

**Variance:** `simulate` mode is not deterministic — Perf can swing ±15 points and TBT can double
between identical runs (observed: phone-first Perf 84↔91, TBT 360↔560 ms across two production
audits). After ruling out the self-attribution artifact above, judge trends and medians across a few
runs, not a single number; don't treat a one-off swing as a regression.

Reports are large; the output dir is gitignored. **Do not commit them** — attach the HTML (zipped;
GitHub rejects raw `.html`) to the PR instead.
