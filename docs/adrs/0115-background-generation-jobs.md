# ADR-0115: Finish a Generation in a Background Worker We Own

**Status:** Active **Date:** 2026-08

## Context

ADR-0063 sized the AI deadline ladder against a measured fact: Netlify's synchronous function
ceiling is 26 s, and a typical Gemini generation returned in about 8 s. With ~18 s of headroom, it
recorded that we deliberately did *not* re-architect to a background job flow, and named the
conditions under which that would change — "only if real generations start regularly exceeding 26s".

The provider migration (ADR-0113) is exactly that. Measured over the bake-off corpus, **all six
OpenAI variants exceed the handler's own 24 s deadline at p90**, and five of eight exceed it at the
median. The recommended tier sits at 50.7 s. This is not a slow tail to absorb — the fast path is
past the wall.

So the question was only *where the waiting happens*. Two options could hold a generation open:

1. **The provider holds it.** OpenAI's Responses API takes `background: true`, returns immediately,
   and lets us poll a response it stores. No new infrastructure at all.
2. **We hold it.** A Netlify background function (15 minutes, available on the credit-based plan)
   does the call, and a second endpoint hands the result over.

Option 1 is clearly less code, and it was the plan until ADR-0114 landed. `background: true`
requires `store: true`, and OpenAI's zero-data-retention control — which their under-18 guidance
says we should have before processing personal data of children under 13 — forces `store` to
`false`.

The elegant option becomes unavailable at precisely the moment the compliance posture improves.
Built on it first, enabling ZDR would break image generation outright, and the pressure would be to
delay the compliance control rather than the feature.

## Decision

**Hold the job ourselves** (option 2), in three pieces:

* `POST /api/generate-image` authorizes, validates, and reserves exactly as before, then hands the
  work to the worker and answers **202** with a job id. Everything expensive is unchanged and
  everything slow has moved.
* `netlify/functions/generate-image-background.ts` makes the model call with minutes rather than
  seconds, and writes the outcome.
* `GET /api/generation-result?job=…` hands it over.

Four things about the split are load-bearing:

**The drawing is at rest for the handoff, and no longer.** The first version passed it in the
worker's invocation body so that nothing was written down at all — and a branch preview refused it
with a 413. A Netlify background function's invocation body is capped between 200 KB and 400 KB
(measured), which a drawing exceeds as soon as the client cannot encode WebP: that is every Safari,
and so most of this app's iPads. Background functions are meant to be handed a reference.

So the drawing is written to the job store and the worker takes it in one read-and-delete. It is at
rest between accepting the request and starting the generation, then gone; the finished picture is
at rest until the poll that delivers it deletes it. This is a real change from the single-request
flow, which kept nothing at all, and `/privacy` says so rather than repeating a promise the
architecture no longer keeps.

**The client declares a capability, the server decides.** A caller sends `X-Async-Generation` to say
it can handle a later result; the server still answers in-line wherever there is no worker to hand
the job to (a plain `vite dev`, or an unconfigured signing secret). A client that never sends the
header — every already-shipped native build — gets exactly the old shape. It will usually outrun the
deadline now, which is a real regression for those builds and not one this flow can fix from the
server side.

**The worker is thin, because it has to be.** It is built without SvelteKit's `$lib`/`$env` aliases,
so it cannot reach the free-generation ledger or the report-token signer. Rather than duplicate
them, settlement and token minting stay with the poll request, which is a route and can. The
constraint turned out to be a feature: nothing secret has to be written into the job record for a
later request to pick up — the poll carries the credential again.

**The worker's URL is public, so the invocation is signed.** A work ticket is an HMAC over the job
id *and a digest of the payload*, so an observed ticket cannot be replayed onto different work.
Without it, anyone could drive paid model calls by POSTing to a function URL.

**The free-generation lease had to grow with the job.** It was 60 s, sized against an invariant that
said the platform kills the function well before that — true when settlement happened inside the
request that reserved. It no longer does, and at the shipped effort tier every free generation would
have outlived its lease, found no reservation on completion, and been booked as an *abandoned
failure* while the child's counter never moved. The lease is now the same constant as the job TTL,
so the two cannot drift.

A failed generation is recorded as that job's answer and reported to the platform as success.
Netlify retries a failing background function twice, a minute apart; on a paid model call that is
three generations billed for one drawing, and a child watching an outcome that keeps being
overwritten.

## Consequences

* **+** Generation is no longer bounded by a request/response ceiling, so effort tier becomes a
  quality-and-cost decision instead of a latency one.
* **+** The design is unaffected by turning ZDR on, which is the point.
* **+** A refusal still costs ~2 s and ~$0.002: the orchestrator declines before the image tool is
  ever called, so the async path is only paid for by generations that actually generate.
* **−** **Already-shipped native builds do not send the header and will time out**, because their
  synchronous path now takes 50 s. They recover only by updating.
* **−** More moving parts than a single handler: a job store, a signed invocation, a poll endpoint,
  and a client loop — each a place a picture can be lost. The poll treats a lost job as retryable
  rather than as a refusal, so the failure mode is "try again", never "draw something else". A
  transient answer — a throttle, or a store that cannot be read this second — carries
  `GENERATION_UNAVAILABLE` and the client keeps waiting rather than abandoning a picture that is
  probably sitting there finished; inferring that from a status code three meanings share is exactly
  how a paid generation gets thrown away.
* **−** A run that dies without settling holds its free slot until the job would have expired
  anyway, which is a consequence of sizing the lease to the job. That is the right way round: a slot
  briefly held is recoverable, a picture delivered but never counted is not.
* **−** Background functions bill against the same credit pool as everything else, and a job is now
  three function invocations plus a poll every three seconds instead of one.
* **−** The finished picture is briefly at rest in Netlify Blobs, which the previous flow avoided
  entirely. Bounded by delete-on-collect and a 20-minute ceiling, but it is a real change and
  `/privacy` should not be read as saying otherwise.
