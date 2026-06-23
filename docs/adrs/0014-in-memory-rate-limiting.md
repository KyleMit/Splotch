# ADR-0014: In-Memory Rate Limiting (Per-Instance Sliding Window)

**Status:** Active  
**Date:** 2025

## Context

The `/api/generate-image` endpoint consumes the project's Gemini API quota. A leaked or abused access token could exhaust quota rapidly if not throttled. Options for rate limiting:

- **Shared durable store (Redis, Netlify Blobs counter)** — accurate across all Netlify function instances; adds latency and a dependency on an external store being available.
- **In-memory per-instance Map** — zero latency, no external dependency; but each Netlify cold start gets a fresh counter, and concurrent instances don't share state.
- **No rate limiting** — rely solely on token revocation via the `/admin` console.

## Decision

Use an **in-memory sliding-window rate limiter** (`src/lib/server/rateLimit.ts`) backed by a module-level `Map<key, number[]>`. Each entry records timestamps of recent hits; hits older than the window are pruned on each call.

Default limits on the managed (non-BYOK) generate endpoint: **15 requests per 60-second window** per token. BYOK requests (users supplying their own Gemini key) are intentionally not throttled — they spend their own quota.

The limiter also serves the credential-verification endpoints (`/api/verify-access-code`, `/api/verify-key`) to blunt brute-force scanning.

An opportunistic cleanup pass runs when the `buckets` Map exceeds 5,000 entries to prevent unbounded memory growth from large numbers of distinct source IPs.

## Consequences

- **+** Zero added latency — no async I/O on every request.
- **+** No external dependency; works identically in local dev and in production.
- **-** State resets on cold start. A token that hit the limit resets its counter when the function instance is recycled. This is acceptable: the limit is a **cost guardrail** to blunt a tight hammering loop, not a hard security boundary. The real response to a rogue token is revocation via the admin console.
- **-** Concurrent Netlify instances don't share state — a token could exceed the per-instance limit on one instance while staying under limit on another. In practice, Netlify routes similar traffic to the same warm instance, but this is not guaranteed.
- **-** If a durable, cross-instance rate limit is ever required, the `Map` should be replaced with a Netlify Blobs counter (the code already shows this path in a comment; the Blobs storage model and its eventual-consistency constraint are in ADR-0025).
