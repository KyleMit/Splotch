# ADR-0042: Cache Invalidation for Stable-Filename Static Media

**Status:** Active **Date:** 2026-07

## Context

Splotch serves a set of static media with **stable, non-content-hashed filenames** —
`/sounds/*.mp3`, `/styles/*.webp`, `/icons/*.webp` (referenced by fixed paths in code, e.g.
`<img src="/styles/{style}.webp">`). A Lighthouse page-load audit flagged that these were served
with the CDN default `Cache-Control: public, max-age=0, must-revalidate`, so every repeat visit paid
a per-asset conditional-GET round-trip (`304, 0 bytes`) — real latency on Slow 4G for content that
rarely changes. `netlify.toml` now grants them a one-week lifetime instead:

```toml
[[headers]]
  for = "/sounds/*"   # and /styles/*, /icons/*
  [headers.values]
    Cache-Control = "public, max-age=604800"
```

That immediately raised the question this ADR exists to answer: **if someone later changes one of
these assets, how does the new version reach clients — or does the one-week `max-age` lock them onto
the stale copy?** The filenames don't change, so there is no URL-level cache bust like
`/_app/immutable/*` gets. The answer is non-obvious because **two independent cache layers** sit in
front of these files, and they invalidate differently:

1. **The browser HTTP cache**, governed by the `Cache-Control` header above. With `max-age=604800`
   and no revalidation directive, a browser that already fetched an asset **directly** may reuse it
   for up to a week without contacting the server.
2. **The Workbox service-worker precache** (ADR-0022). `web/vite.config.ts` precaches these assets
   via `globPatterns:
   ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}']` (plus
   `includeAssets:
   ['sounds/*.mp3']`). For a client whose SW is controlling the page — the normal
   repeat-visit path — requests for these URLs are answered **from the precache**, so the HTTP
   header in layer 1 never applies to them.

The load-bearing detail: each precache entry carries a **content revision**, and that revision is
literally the **md5 of the built file's bytes**. The deployed `sw.js` manifest contains, verbatim:

```
{url:"styles/pixel.webp",revision:"d07387bd922d4fb670a766de006995cd"}
```

and `md5sum web/static/styles/pixel.webp` is that same `d07387bd922d4fb670a766de006995cd`. So **the
revision changes if and only if the file's content changes** — the stable filename is irrelevant to
invalidation because the content hash rides alongside it in the manifest.

## Decision

Keep the stable filenames and the one-week `max-age`; **do not** content-hash these paths or mark
them `immutable`. Rely on the Workbox precache content-revision as the real invalidation mechanism,
driven by the existing update lifecycle (ADR-0022). Concretely, to ship a change to one of these
assets a contributor does **nothing special**: change the file's content and deploy. The propagation
path is:

1. The build recomputes that file's revision (new md5) and injects it into a new `sw.js` precache
   manifest. `sw.js` is served `no-cache, no-store,
   must-revalidate`, so every client re-checks
   it.
2. On the next `registration.update()` (ADR-0022 runs these on load, on visibility/focus, and
   hourly), the browser sees the changed `sw.js`, and Workbox re-fetches **only** the entries whose
   revision changed. That fetch is sent with a cache-busting `?__WB_REVISION__=<hash>` query param,
   so it bypasses the layer-1 HTTP cache and gets the fresh bytes even inside the one-week window.
3. The new SW enters `waiting`, and `updates.ts` activates it **when the canvas is blank**
   (ADR-0022's toddler-safe guard). After activation the new asset is live from the precache.

So the effective invalidation gate is the **SW update cycle**, not the HTTP `max-age`. The
`max-age=604800` only governs the residual paths that layer 2 doesn't cover:

* the very first load, before the SW is installed and controlling;
* clients where the SW isn't in control (registration failed, unsupported, or cleared).

On those paths a returning browser can serve a stale copy for up to a week. This is an accepted,
bounded trade-off: it is the price of dropping the per-visit revalidation round-trip, and it does
not affect SW-controlled repeat visitors (the common case), for whom the precache is authoritative.

### Rejected alternative — fingerprinted filenames + `immutable`

The audit's "better" option was to content-hash these filenames (e.g. `crayon.abc123.webp`) and
serve them `immutable` like `/_app/immutable/*`, so a change mints a new URL and busts **every**
layer instantly with zero staleness window. Not adopted now because it is a build-step change (hash
the `static/` files and rewrite every reference site) for a benefit that only closes the narrow
non-SW-fetch window — layer 2 already handles the SW-controlled majority. It remains the correct
escalation **if** that residual window ever causes a real problem, or if an asset must invalidate
instantly for correctness rather than freshness.

### When a contributor *does* need to act

* **New asset path or file type** not matched by `globPatterns` / `includeAssets`: add it, or it
  will be covered by layer 1 (one-week HTTP cache) only, with no SW revisioning.
* **Instant, guaranteed invalidation required** (not just eventual freshness): fingerprint that
  asset per the rejected-alternative above.
* **Mid-drawing users**: by ADR-0022's guard, a returning user gets the new asset after the waiting
  SW activates (canvas blank / next launch), not necessarily on the first reload. This is
  intentional.

## Verification

Verified empirically against a live Netlify branch deploy (real CDN + generated SW, which
`vite preview` / `netlify dev` cannot reproduce — see `docs/CLOUD/Claude.md`). For each step the
asset was changed, pushed, and the deploy polled until its `sw.js` precache revision flipped:

| Step     | Commit    | `pixel.webp` md5 = **precache revision** | Netlify `ETag`  | `Content-Length` |
| -------- | --------- | ---------------------------------------- | --------------- | ---------------- |
| Baseline | `95f18f0` | `d07387bd…95cd`                          | `ba15e0f4…-ssl` | 4896             |
| Change A | `ee4f4b0` | `fff8c349…07b4`                          | `b84a8885…-ssl` | 4068             |
| Change B | `72ab4c2` | `5f33fddc…67dd`                          | `98593a8e…-ssl` | 3202             |
| Revert   | `84c558b` | `d07387bd…95cd`                          | `ba15e0f4…-ssl` | 4896             |

Observations:

* The deployed precache revision tracked the file's content md5 exactly at every step — each content
  change produced a new revision (so the SW re-ships it), and a **second** change re-shipped again
  (updates keep flowing, not just first-time caching).
* Reverting to byte-identical content restored the **identical** revision, ETag, and size —
  confirming the revision is a pure function of content, so no-op "changes" don't churn the
  precache.
* `Cache-Control: public, max-age=604800` was served unchanged throughout, confirming the layer-1
  header is live in production independent of the layer-2 revisioning.

(The three `test(temp):` commits above were a throwaway probe; the net asset change is zero —
`pixel.webp` ends byte-identical to baseline.)

## Consequences

* **+** Static-media changes ship automatically on content change with no filename bookkeeping — the
  Workbox revision handles it, gated by the ADR-0022 update cycle. No manual cache-bust step.
* **+** Repeat visits skip the per-asset `304` revalidation round-trip the audit flagged (the reason
  for the `max-age` in the first place).
* **+** The two-layer behavior and the "revision == content md5" fact are now written down, so the
  one-week `max-age` isn't mistaken for a hard lock, and the branch-deploy verification recipe is
  repeatable (`docs/CLOUD/Claude.md`).
* **−** A **non-SW-controlled** fetch (first load, or SW absent/cleared) can serve a stale copy for
  up to one week. Bounded and accepted; fingerprinting is the escalation if it ever matters.
* **−** Invalidation depends on the SW update lifecycle (ADR-0022): a mid-drawing user sees the
  change only after the waiting SW activates (canvas blank / next launch), not guaranteed on the
  first reload.
* **−** The `globPatterns` coverage is now load-bearing for invalidation: an asset type added
  outside it silently falls back to layer-1-only caching. Called out above and in ADR-0022.
