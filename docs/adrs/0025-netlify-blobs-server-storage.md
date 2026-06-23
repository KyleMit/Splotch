# ADR-0025: Netlify Blobs for Server-Side Storage (Eventual Consistency, Env-Seeded Fallback)

**Status:** Active  
**Date:** 2026-06

## Context

Two pieces of server-side state outlive a single request and must be mutable at runtime: the **AI access-token allowlist** (provisioned/revoked from `/admin`, ADR-0006, ADR-0016) and the **per-token usage tally** that backs the admin console's generation stats. Neither warrants a managed database — the data is tiny, low-traffic, and read almost exclusively by the admin and the `generate-image` gate.

Options for persistence:
- **A managed database (Postgres, Redis, etc.)** — durable and consistent, but adds an external dependency, credentials to rotate, latency, and cost for a few kilobytes of state.
- **Environment variables only** — the original design (`ALLOWED_TOKENS_LIST`). Zero infrastructure, but immutable at runtime: every token change needs a redeploy, and there is nowhere to record usage.
- **Netlify Blobs** — a key/value store already provisioned with the Netlify site, requiring no extra credentials in the normal runtime, accessible from the SSR function via `@netlify/blobs`.

Netlify Blobs was chosen. But it carries two non-obvious runtime constraints that this ADR exists to record, because both produced silent, hard-to-diagnose failures:

1. **Blobs only exists in the Netlify runtime.** Under plain `vite dev`, `getStore()` throws `MissingBlobsEnvironmentError`. The code must degrade rather than fail.
2. **Strong-consistency reads are unsupported in the `@sveltejs/adapter-netlify` SSR function.** A `consistency: 'strong'` read needs an `uncachedEdgeURL` in the injected Blobs context; the adapter's SSR function receives a context with `edgeURL` (used for writes and eventual reads) but **no** `uncachedEdgeURL`, so every strong read throws `BlobsConsistencyError`. This shipped to production and silently broke both reads (see below).

## Decision

Use Netlify Blobs as the durable store for both server-side concerns, with a **degrade-never-throw** discipline and **eventual consistency** for all reads.

**Two separate stores** (`web/src/lib/server/`):
- `tokens.ts` — store `access-tokens`, single key `list` holding the token array.
- `usage.ts` — store `ai-usage`, keyed by the raw access token, value `{ count, firstUsed, lastUsed, lastStyle, lastPrompt }`.

They are kept in distinct stores so audit writes (one per generation) never contend with allowlist mutations.

**Eventual consistency only.** Both read paths (`tokens.ts` `readStore`, `usage.ts` `getUsage`) use the default (eventual) consistency. Strong consistency is *not an option* in this runtime — it throws `BlobsConsistencyError` 100% of the time, and because both readers swallow Blobs errors and degrade, the symptom was invisible: the token list silently fell back to the env seed and every access code reported "Never used", even though writes (which use eventual consistency) were succeeding the whole time. The data was in Blobs; only the strong reads couldn't fetch it.

**Env-seeded, clobber-safe first run.** `ALLOWED_TOKENS_LIST` seeds the allowlist exactly once: on the first read against an empty store, `tokens.ts` writes the env-derived list with `setJSON(KEY, seeded, { onlyIfNew: true })`. The `onlyIfNew` guard makes the seed atomic — under eventual consistency a lagging replica can report the key absent and re-trip the seed branch, and `onlyIfNew` ensures that write returns `{ modified: false }` instead of clobbering tokens an admin already saved.

**Degrade, never throw.** `getStore()` failure latches `blobsUnavailable` (a permanent property of the instance) and `tokens.ts` serves a per-instance in-memory list seeded from the env var; a *transient* operation error degrades for that one request only (it must not latch, or one blip silently drops every later write). `usage.ts` returns an empty map on any failure so a Blobs hiccup never 500s the admin page; usage writes are best-effort and fire from `generate-image` via `waitUntil` so the image response never waits on them.

**Surface the fallback.** Because the degrade is silent by design, `/admin` must not pretend env-seeded data is live. `tokens.ts` exports `getTokensStatus()` returning `{ tokens, persistent }` where `persistent = (store !== null)` — false whenever Blobs is unconfigured *or* a read failed. `/admin` renders a warning banner when `persistent` is false ("Netlify Blobs is unavailable… edits won't be saved"). The native door (`/admin/native`) can't carry this signal in its JSON snapshot, so the `AdminConsole` prop defaults to `persistent = true` and never warns there.

## Consequences

- **+** No managed database, no extra credentials: the store is provisioned with the Netlify site.
- **+** Tokens are mutable at runtime (add/revoke from `/admin`) and usage is auditable, both without a redeploy.
- **+** The store survives function cold starts and coordinates across concurrent instances (unlike the in-memory rate limiter, ADR-0014).
- **+** The fallback banner means a Blobs outage is visible to the operator instead of masquerading as live data; it also doubles as a smoke signal for the consistency bug — if the banner shows in production, Blobs reads are failing.
- **-** Eventual consistency means the admin can briefly see a slightly stale usage count or token list after a write. Acceptable for this data; strong consistency is unavailable anyway.
- **-** `consistency: 'strong'` must never be reintroduced in any Blobs read from the SSR function — it throws `BlobsConsistencyError` and the degrade path hides it. New Blobs readers must use the default consistency.
- **-** Under plain `vite dev` (and in the Playwright preview server) there are no Blobs, so token edits and usage live in a per-instance in-memory list that resets on restart; the admin E2E (`tests/admin.spec.ts`) asserts the fallback banner is shown there.
