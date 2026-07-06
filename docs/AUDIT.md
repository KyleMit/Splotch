# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-next-audit`; validate it with `/review-audit`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Lighthouse page-load audit (slow device + slow internet)

Two capture sets, both under Lighthouse's simulated **Slow 4G + 4× CPU** throttle
on two form factors (phone portrait 412×915, tablet landscape 1133×744). Raw HTML
reports are attached to the PR, not committed.

**Production (`https://splotch.art`, real Netlify serving)** — the authoritative
numbers, captured first-visit (cold cache) and repeat-visit (warm cache primed by a
prior load). Two audits so far (baseline, and a **2026-07-05 re-run** that confirmed
every finding still stands); columns below show the range across both where they
differ, illustrating `simulate`-mode variance:

| Run | Visit | Perf | FCP | LCP | TBT | Transfer |
| --- | --- | --- | --- | --- | --- | --- |
| Phone portrait | first | 84–91 | 1.1–1.3 s | 1.9–2.3 s | 360–560 ms | 713 KB |
| Phone portrait | repeat | 99–**100** | 1.0–1.2 s | 1.0–1.2 s | 80–120 ms | ~1–76 KB |
| Tablet landscape | first | 98–99 | 1.1 s | 1.5–1.8 s | 110–140 ms | 713 KB |
| Tablet landscape | repeat | 99–100 | 1.1 s | 1.1 s | 90–100 ms | ~68 KB* |

\* the only repeat-visit byte cost is the HTML document itself (`max-age=0,
must-revalidate`), which Chrome sometimes serves from cache and sometimes
re-downloads; every subresource is served from cache at 0 bytes on repeat.
Accessibility is device- and cache-independent (92 — see the viewport item below);
Best-Practices and SEO are 100 on production. The phone-first swing (Perf 84↔91,
TBT 360↔560 ms) is within the documented ±15-point `simulate` variance — a second
data point, not a regression.

The **LCP element is `<canvas#drawingCanvas>`** on every run. On real Netlify
(HTTP/2 + CDN) first-visit LCP is a healthy 1.9 s / 1.5 s — **much better than the
local `vite preview` run suggested** (that run scored Perf 73 / LCP 5.4 s, but its
HTTP/1.1 single-origin serving with no compression or multiplexing was the
bottleneck, not the app — a preview artifact, not a production problem). Treat the
production table above as the real baseline. Repeat visits are excellent (Perf
99–100) because all static subresources come from cache.

- [ ] **[Performance] Shrink the load-time main-thread work (TBT / input readiness)** — File(s): `web/src/lib/components/DrawingCanvas.svelte`, `web/src/lib/state/*.svelte.ts`
  **⏸ Pending decision:** the web TBT this item measures cannot be moved from within the
  named files. Auto mode audited `DrawingCanvas.svelte` + `state/*.svelte.ts` and deferred
  the one remaining safe candidate — the `pencilEraser` plugin init — but that only helps
  **native iOS**: `pencilEraser` is gated behind `__IS_CAPACITOR__` and tree-shaken out of
  the web bundle entirely, so it does **not** touch the phone/tablet web TBT above. Every
  other candidate in-scope is already deferred (sound preload → idle; paper-texture warm →
  idle in `engine.ts`) or is genuinely first-stroke-critical (the color/stroke/eraser
  `$effect` bridges must be correct on the opening stroke). The real web-TBT lever is
  `web/src/routes/+page.svelte`'s `onMount` — `initPWAUpdates()`, `initInstallPrompt()`,
  and `hydrateApiKey()` (WebCrypto / secure storage) — which is **outside this item's named
  scope**. Decide whether to expand scope to `+page.svelte` and run a real `npm run
  perf:web --device=phone` mount profile there before deferring anything (guessing risks
  breaking PWA-update or install-prompt behavior).
  Even on production, phone first-visit **Total Blocking Time is 360 ms** and
  max-potential-FID is 280 ms (tablet: 140 ms / 250 ms) — the main thread is busy while
  the canvas comes up. Profile mount with `npm run perf:web --device=phone` and move
  non-critical setup (sound context, plugin init such as `pencilEraser`, secondary
  `$effect` bridges) off the first-paint path. Deferring the sound preload (first item)
  moves part of this already.

