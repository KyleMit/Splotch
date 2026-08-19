# ADR-0025: Netlify Blobs for Server-Side Storage (Requires a V2 Function; Env-Seeded Fallback)

**Status:** Active **Date:** 2026-06

## Context

Two pieces of server-side state outlive a single request and must be mutable at runtime: the **AI
access-token allowlist** (provisioned/revoked from `/admin`, ADR-0006, ADR-0016) and the **per-token
usage tally** that backs the admin console's generation stats. Neither warrants a managed database —
the data is tiny, low-traffic, and read almost exclusively by the admin and the `generate-image`
gate.

Options for persistence:

* **A managed database (Postgres, Redis, etc.)** — durable and consistent, but adds an external
  dependency, credentials to rotate, latency, and cost for a few kilobytes of state.
* **Environment variables only** — the original design (`ALLOWED_TOKENS_LIST`). Zero infrastructure,
  but immutable at runtime: every token change needs a redeploy, and there is nowhere to record
  usage.
* **Netlify Blobs** — a key/value store already provisioned with the Netlify site, requiring no
  extra credentials in the normal runtime, accessible from the SSR function via `@netlify/blobs`.

Netlify Blobs was chosen. But it carries two non-obvious runtime constraints that this ADR exists to
record, because both produced silent, hard-to-diagnose failures:

1. **Blobs only exists in the Netlify runtime.** Under plain `vite dev`, `getStore()` throws
   `MissingBlobsEnvironmentError`. The code must degrade rather than fail.
2. **Automatic Blobs configuration only reaches a *V2* Netlify Function.** Netlify injects the Blobs
   context (`NETLIFY_BLOBS_CONTEXT`) into the modern (V2) function runtime. A **legacy V1
   (Lambda-compatibility) function never receives it**, so `getStore()` with no explicit
   `siteID`/`token` throws `MissingBlobsEnvironmentError` on every call in production.
   `@sveltejs/adapter-netlify` emitted V1 functions through v5; **v6 migrated to V2 functions**
   ([sveltejs/kit#15203](https://github.com/sveltejs/kit/pull/15203)). The app must be on
   adapter-netlify ≥ 6 (which needs `@sveltejs/kit` ≥ 2.31), or Blobs is dead on arrival in
   production.

### How constraint 2 first manifested (and was misdiagnosed)

In production, `/admin` permanently showed the "Netlify Blobs is unavailable" banner and both stores
stayed empty — no token edit or usage tally ever persisted. The original version of this ADR blamed
a **strong-consistency read** (`consistency: 'strong'` throwing `BlobsConsistencyError` because the
SSR function's Blobs context lacked an `uncachedEdgeURL`) and switched all reads to eventual
consistency. That changed nothing, because the real failure was one level down: on adapter-netlify
4.x the SSR function was a **V1 function**, so `getStore()` itself threw
`MissingBlobsEnvironmentError` before any read ran. The production function log was unambiguous:

```
WARN [tokens] Netlify Blobs unavailable, using in-memory list:
The environment has not been configured to use Netlify Blobs.
```

Every Blobs op degraded to the per-instance in-memory fallback, the env-seed write never landed, and
the banner was permanent. Upgrading the adapter to v6 (V2 functions) fixed it, verified end-to-end
on a deploy preview: a code added from `/admin` persisted and appeared in the Netlify Blobs UI for
the first time.

## Decision

Use Netlify Blobs as the durable store for both server-side concerns, deployed on a **V2 function**
(adapter-netlify ≥ 6), with a **degrade-never-throw** discipline and **eventual-consistency** reads.

**Adapter floor.** `@sveltejs/adapter-netlify` is pinned to `^6` and `@sveltejs/kit` to `^2.31`.
Downgrading the adapter below 6 silently reverts the SSR function to V1 and breaks Blobs in
production with no build-time error — only the runtime banner. Treat the adapter major as
load-bearing for storage, not just routing.

**Two separate stores** (`web/src/lib/server/`):

* `tokens.ts` — store `access-tokens`, single key `list` holding the token array.
* `usage.ts` — store `ai-usage`, keyed by a dedicated-secret HMAC grant ID, value
  `{ count, firstUsed, lastUsed, deleteAfter, lastStyle, lastOutcome }`.

They are kept in distinct stores so audit writes (one per generation) never contend with allowlist
mutations.

**Eventual-consistency reads.** Both read paths use the default (eventual) consistency. Eventual is
sufficient for this data, and it sidesteps the strong-read context requirements entirely. The one
cost — a replica lagging the latest write can briefly report a key as absent and trip the
seed-on-empty branch — is neutralized by the clobber-safe seed below. This holds because no request
here depends on observing its own write; it is **not** a site-wide default. The
`free-generation-grants` store added later reserves and then finalizes a slot within one invocation,
so it reads strongly — see ADR-0105's 2026-08-11 amendment, which also confirms on a live deploy
that the V2 function's Blobs context supplies the `uncachedEdgeURL` a strong read needs.

**Env-seeded, clobber-safe first run.** `ALLOWED_TOKENS_LIST` seeds the allowlist exactly once: on
the first read against an empty store, `tokens.ts` writes the env-derived list with
`setJSON(KEY, seeded, { onlyIfNew: true })`. The `onlyIfNew` guard makes the seed atomic — under
eventual consistency a lagging replica can report the key absent and re-trip the seed branch, and
`onlyIfNew` ensures that write returns `{ modified: false }` instead of clobbering tokens an admin
already saved.

**Degrade, never throw.** `getStore()` failure latches `blobsUnavailable` (a permanent property of
the instance) and `tokens.ts` serves a per-instance in-memory list seeded from the env var; a
*transient* operation error degrades for that one request only (it must not latch, or one blip
silently drops every later write). **Degrading covers reads, not writes:** outside Vite dev, a token
mutation is refused (`503`) whenever `getStore()` or a Blobs operation fails rather than written to
the fallback — banking it there would report an add or a revocation that the durable list never saw.
`tokens.ts` uses SvelteKit's `$app/environment` `dev` flag to reserve writable memory for local Vite
development; a deployed V1 function, production preview, or other unrecognized runtime fails closed.
This inverse check is deliberate: the V1 failure is defined by missing Blobs context, and `NETLIFY`
is a build-time signal rather than a reliable deployed-function runtime discriminator. `usage.ts`
returns an empty map on any failure so a Blobs hiccup never 500s the admin page; usage writes are
best-effort and fire from `generate-image` via `waitUntil` so the image response never waits on
them.

**Surface the fallback.** Because the degrade is silent by design, `/admin` must not pretend
env-seeded data is live. `tokens.ts` exports `getTokensStatus()` returning `{ tokens, persistent }`
where `persistent = (store !== null)` — false whenever Blobs is unconfigured *or* a read failed.
`/admin` renders a warning banner when `persistent` is false. This banner is also the canary that
caught (and, once misread, masked) the V1-function bug: **if it shows in production, the function is
not getting the Blobs context — check the adapter major first.** The JSON `/api/admin/tokens`
snapshot also carries `persistent`, so the deploy smoke test can assert it and the native console
can surface the same warning after every successful snapshot.

## Consequences

* **+** No managed database: the store is provisioned with the Netlify site. Usage pseudonyms use
  one dedicated HMAC secret, separate from the codes and every other signing/authentication key.
* **+** Tokens are mutable at runtime (add/revoke from `/admin`) and usage is auditable, both
  without a redeploy.
* **+** The store survives function cold starts and coordinates across concurrent instances (unlike
  the in-memory rate limiter, ADR-0014).
* **+** The fallback banner means a Blobs outage is visible to the operator instead of masquerading
  as live data.
* **−** **Storage is coupled to the adapter major.** adapter-netlify must stay ≥ 6 (V2 functions); a
  downgrade re-breaks Blobs with only the runtime banner to show for it. Any adapter or
  Netlify-config bump should re-verify Blobs on a deploy preview — run `npm run test:blobs:smoke`
  against the preview URL (it asserts `persistent:true` and round-trips a token), which is the
  automated guard against this regression.
* **−** Local `vite dev` has no Blobs, so token edits and usage live in a per-instance in-memory
  list that resets on restart. A production preview without Blobs still serves env-seeded reads but
  refuses token edits, matching a deployed function whose durable store is unavailable; the admin
  E2E (`tests/admin.spec.ts`) covers that fail-closed contract.
* **−** Eventual consistency means the admin can briefly see a slightly stale usage count or token
  list after a write. Acceptable for this data.
* **−** Deploy previews/branch deploys share the site-wide stores (they are not deploy-scoped), so a
  code added from a preview's `/admin` lands in the real `access-tokens` store. Useful for
  verification, but remember to clean up test entries.

## Amendment (2026-08-19): Minimized, expiring usage records

The original tally used the raw access code as its blob key and retained the latest fully resolved
prompt indefinitely unless an admin revoked the code. Replace that shape with an opaque key:
`grant-v1/HMAC-SHA256(key = USAGE_GRANT_ID_SECRET, "splotch-managed-usage-v1\0" + code)`. The
dedicated secret is required for durable usage tracking and must not reuse `ADMIN_ACCESS_TOKEN`,
`REPORT_TOKEN_SECRET`, a managed code, or any provider credential. Unset, generation remains
available but the best-effort tally is disabled. Rotation deliberately starts fresh IDs; records
under the previous secret are inaccessible from the current code and age out independently.

The blob contains only the request count, first/latest timestamps, a fixed `deleteAfter`, the latest
validated art-style category, and the latest outcome category (`accepted`, `succeeded`, `refused`,
or `failed`). Prompt text and provider error/refusal details are absent from both blobs and
operational logs. Logs carry only time, credential category, style category, and outcome category;
Netlify's documented function-log availability is at least 24 hours and up to 7 days depending on
plan.

Each tally's `deleteAfter` is exactly 30 days after its first recorded request. Later requests
increment the tally without moving that boundary; a request at or after the boundary overwrites it
with a fresh window. Admin reads delete and omit an expired record. Revocation requests immediate
best-effort deletion, while `netlify/functions/purge-usage-records.ts` scans the store daily so an
inactive record is normally removed within 24 hours after expiry. The purge also deletes malformed
records and every legacy non-HMAC key, dropping the old raw-code/prompt blobs without reading them.
