# ADR-0063: Size AI request deadlines to Netlify's measured 26s function ceiling

**Status:** Active\
**Date:** 2026-07-18

## Context

`/api/generate-image` (and the `/api/verify-key` oracle) call Gemini from inside SvelteKit's SSR
serverless function. The code carried 120-second deadlines on both the server model call
(`gemini.ts`, `AbortSignal.timeout(120_000)`) and the client fetch (`aiImage.ts`,
`AI_TIMEOUT_MS = 120_000`), and `verifyKey()` had **no** abort at all. A code audit flagged that
these deadlines are far larger than Netlify's real function ceiling, so on a slow model call the
**platform**, not Splotch, ends the request — returning Netlify's bare error instead of the app's
controlled 502 and its kid-friendly retry UI. The audit's premise was that the deployed function ran
in *streaming* mode with a *10-second* ceiling, but that was never confirmed.

We resolved it empirically instead of from the docs, because the docs/UI were misleading (the Free
plan exposes no timeout setting, which reads as "fixed at 10s" but actually means "not
configurable").

### What we measured

The deployed function is a **single synchronous, buffered Netlify Node function** — the adapter
(`@sveltejs/adapter-netlify` v6) emits one catch-all function
(`config = { path: ["/*"], preferStatic: true }`) that returns a single buffered `Response`; there
is no streaming and no per-function timeout config in either `netlify.toml`. A throwaway
`/api/slowtest` endpoint deployed to a branch preview, swept from a client, gave:

| Requested sleep      | Result              | Server actually ran |
| -------------------- | ------------------- | ------------------- |
| 5s / 10s / 15s / 20s | 200 (clean)         | matched request     |
| **26s**              | 200 (clean)         | 26.0s               |
| **30s**              | **502**, empty body | killed              |

| POST body   | Result                         |
| ----------- | ------------------------------ |
| 1 MB / 4 MB | 200 (full body received)       |
| **6 MB**    | **500** before the handler ran |

So the real synchronous execution ceiling is **26 seconds** (not 10s, and not the "60s" the audit
also speculated), and the buffered request-body cap sits between **4–6 MB**. Corroborating
production data: a real Watercolor generation logged `Duration: 8049.77 ms`, and generations
returning in 11–13s have been observed — both impossible under a 10s wall, both comfortable under
26s. The Free plan cannot raise the 26s ceiling (26s is a paid-plan-configurable maximum).

## Decision

Derive every AI deadline from the measured ceiling, in one shared module
(`web/src/lib/ai/limits.ts`), so the relationship is explicit rather than three unrelated magic
numbers:

```
GENERATE_DEADLINE_MS      = 24_000   // server aborts the model call…
NETLIFY_SYNC_TIMEOUT_MS   = 26_000   // …below the platform ceiling…
CLIENT_REQUEST_TIMEOUT_MS = 27_000   // …and the client waits just past it.
VERIFY_KEY_DEADLINE_MS    = 10_000   // a one-token key probe should never linger
```

**Invariant:** `GENERATE_DEADLINE_MS < NETLIFY_SYNC_TIMEOUT_MS < CLIENT_REQUEST_TIMEOUT_MS`. The
server aborts first (so its controlled 502 is serialized and returned before the platform would kill
the invocation), and the client only gives up after the platform would have — so a Splotch error
always beats a bare Netlify one. `verifyKey()` now passes an abort signal so a hung probe can't
squat on an invocation until the platform reaps it.

On the client, a 5xx from `/api/generate-image` (an upstream Gemini failure **or** the server's own
deadline abort) now surfaces the kid-friendly "let's try again" retry (`AiErrorKind = 'retry'`)
instead of a dead-end generic error.

We deliberately did **not** re-architect to a background/async job flow: with ~18s of headroom over
a typical 8s generation, the sync function is fine. That option (and moving generation to a host
with a longer sync window) stays on the table only if real generations start regularly exceeding
26s.

The 15 MiB `MAX_IMAGE_BYTES` route cap is left as-is: it is unreachable (the platform rejects at ~6
MB first) but the client only ever uploads a sub-1 MB screenshot, so no legitimate request hits
either bound. Shrinking the upload (WebP) and dropping multipart are tracked as separate efficiency
tickets, not blockers.

## Reconstructing the measurement

The ceiling is a third-party value that Netlify has changed before (it was 10s historically), so if
a future change is suspected, re-measure rather than trust the docs. The throwaway probe was:

```ts
// web/src/routes/api/slowtest/+server.ts  (temporary; deployed to a branch preview)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const GET: RequestHandler = async ({ url }) => {
  const ms = clamp(Number(url.searchParams.get('ms') ?? '0') || 0, 0, 60_000);
  await new Promise((r) => setTimeout(r, ms));
  return json({ ok: true, requestedMs: ms });
};
// POST reads request.arrayBuffer() and reports byteLength to probe the body cap.
```

Sweep it from a client and watch for the status flip (200 → 502) and the body-size flip (200 → 500):
`for ms in 5000 … 30000; do curl -w '%{http_code} %{time_total}\n' "$BASE/api/slowtest?ms=$ms"; done`.

### Invariant guard (not currently wired as a live test)

If we want a CI guard that we never regress the ladder ourselves, this is enough to reconstruct it —
a colocated `web/src/lib/ai/limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CLIENT_REQUEST_TIMEOUT_MS,
  GENERATE_DEADLINE_MS,
  NETLIFY_SYNC_TIMEOUT_MS,
  VERIFY_KEY_DEADLINE_MS,
} from './limits';

describe('AI deadline ladder', () => {
  it('aborts on the server before the platform, and on the client after it', () => {
    expect(GENERATE_DEADLINE_MS).toBeLessThan(NETLIFY_SYNC_TIMEOUT_MS);
    expect(NETLIFY_SYNC_TIMEOUT_MS).toBeLessThan(CLIENT_REQUEST_TIMEOUT_MS);
  });
  it('keeps the key probe well under the generation deadline', () => {
    expect(VERIFY_KEY_DEADLINE_MS).toBeLessThan(GENERATE_DEADLINE_MS);
  });
});
```

Note this guards only the *relationship between our constants* — it cannot detect Netlify moving the
26s ceiling. For that, a passive alert on the rate of platform-`502`s from real generate traffic, or
an occasional re-run of the sweep above, is the right tool; neither is wired today.

## Consequences

* **+** A slow or hung model call now fails as Splotch's controlled 502 + retry UI, not Netlify's
  bare error.
* **+** `verifyKey()` can no longer be made to occupy a full invocation by a hung/rate-limited
  probe.
* **+** The three deadlines live in one module with a stated invariant, so the coordination can't
  silently drift.
* **-** The 26s ceiling is a measured third-party value with no live guard; a future Netlify change
  is caught only by re-measuring or by watching platform-502 rates.
* **-** On the Free plan the 26s ceiling can't be raised, so a genuinely slow generation (>26s)
  still fails; the async-job-flow escape hatch is documented above but unbuilt.
