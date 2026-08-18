# ADR-0105: Server-Authoritative Free AI Grants per Installation Pseudonym

**Status:** Active **Date:** 2026-08

## Context

Every fresh Splotch installation should be able to experience ten successful managed AI image
generations before a parent supplies a Gemini key or managed access code. The allowance spends a
project credential, so a client-only counter is not authoritative: clearing local state can reset
it, concurrent requests can race it, and the server cannot monitor cost or failure volume.

Alternatives considered:

* **Store the count only in localStorage or Capacitor Preferences.** Rejected because the client can
  reset or race its own spend boundary, and `/admin` cannot observe aggregate usage.
* **Create an account or collect a device fingerprint.** Rejected because either adds identity and
  tracking disproportionate to a toddler drawing app.
* **Key the allowance by IP address.** Rejected because families, schools, and mobile carriers share
  addresses, while addresses change and are more revealing than an app-scoped pseudonym.
* **Decrement after the provider returns, without reserving first.** Rejected because eleven
  concurrent requests could all observe one remaining generation and incur eleven provider calls.
* **Return a generated image when the final per-installation accounting write fails and reconcile
  later.** Rejected because the synchronous function has no durable job or idempotent recovery
  channel. Repeated write contention could otherwise deliver uncounted successes. The route remains
  fail-closed after a provider success until such a recovery mechanism exists.
* **Use a new database or Redis service.** Rejected because the grants are tiny, low-traffic records
  and Netlify Blobs is already the server storage boundary established by ADR-0025.

## Decision

The client sends `X-Installation-Id`, an app-purpose SHA-256 pseudonym created in
`lib/state/freeGenerations.svelte.ts`. Native builds hash Capacitor Device's platform-provided
identifier; web hashes a random origin-local installation UUID. The raw platform identifier is never
sent or stored. The pseudonym is not combined with an IP address, account, advertising identifier,
hardware fingerprint, or cross-app identifier.

This privacy model deliberately has reset boundaries. Android's identifier is scoped to the app
signing key, user, and device and ordinarily survives reinstall. iOS uses the vendor identifier,
which may change after every app from the vendor is removed. Web site-data clearing creates a new
random installation. Preventing those resets would require the account, fingerprint, or IP designs
rejected above; the product explicitly accepts that abuse rather than collect more identity.

`lib/server/freeGenerationGrants.ts` stores one grant per pseudonym in the `free-generation-grants`
Netlify Blobs store. A grant records successful generations, attempts, failures, recent failure
kind, timestamps, and short-lived reservations. `reserveFreeGeneration` uses ETag compare-and-set
writes to count a reservation against the ten-slot limit before Gemini is called.
`completeFreeGeneration` conditionally replaces that reservation with a success only after the
provider returned a usable image. Refusals, upstream errors, validation failures, and exhausted
attempts are recorded as failures without spending a successful slot. A one-minute lease recovers a
reservation if a function dies; an expired lease is recorded as abandoned. If final accounting
cannot be confirmed, the route does not return the generated image.

The installation pseudonym is intentionally resettable, so it cannot be the project's hard cost
boundary. A second compare-and-set record counts every free provider start across all installations
for the current UTC day. It is reserved after input validation and before Gemini is called, never
refunded after a provider call, and refuses the 501st call. The durable daily ceiling is therefore
500 provider starts even when clients mint pseudonyms, requests land on different function
instances, or Gemini returns a refusal or error. If Blobs accounting cannot be read or written, the
production generation route fails closed instead of calling the provider. Read-only admin monitoring
in non-Netlify development and test environments retains the existing, explicitly labelled
non-persistent memory fallback.

Free attempts use their own per-IP 15/minute in-memory guard in
`generationAuthorization.ts`/`rateLimitPolicy.ts`, preserving ADR-0014's low-latency rate-limit
model while the durable daily provider-start counter supplies the cross-instance cost boundary. The
project does not persist a per-IP daily sub-cap: doing so would turn the rejected IP-keyed allowance
into durable source tracking while penalizing shared family, school, carrier, and VPN addresses. The
global ceiling bounds cost; the in-memory source limit only slows a single-source availability
attack. Managed access codes and BYOK keep their existing branches and limits. Successful free
responses carry `X-Free-Generations-Remaining`; `GET /api/free-generation-grant` refreshes the
authoritative count without creating or spending a grant and reports unavailable when the project
key or daily budget cannot serve a free generation. Exhaustion keeps the AI button visible and
routes the already-parent-gated operation to BYOK setup, following ADR-0094's operation-level gate.

The authenticated web-only `/admin` console (ADR-0101) reads the exact daily provider-start counter
and samples at most 200 installation grants. Sample-derived successes, attempts, failures,
active/exhausted grants, reservations, and activity are labelled as sampled; enumeration stops once
the bounded sample is full. Local development uses a server-memory fallback, clearly marked
non-persistent, because plain Vite has no Netlify Blobs context (ADR-0025).

## Consequences

* \+ A fresh installation gets ten successful managed generations with no account, access code, or
  parent-supplied key.
* \+ Conditional reservations make the ten-generation boundary safe under concurrency, while failed
  provider calls do not consume it.
* \+ A durable global UTC-day counter caps project-funded provider calls at 500 even if installation
  pseudonyms are reset or requests span function instances.
* \+ The server and `/admin` can observe aggregate spend and failure patterns without storing a raw
  device identifier.
* \+ Reloads, app updates, and ordinary Android reinstalls retain the allowance through the chosen
  platform pseudonym.
* − Web site-data clearing and some iOS uninstall sequences can mint a new pseudonym and another
  allowance. This is the explicit cost of declining accounts, fingerprints, advertising IDs, and
  IP-based identity.
* − Every free provider call adds a global conditional write as well as the per-installation writes.
  Provider starts serialize on that daily record, so a sufficiently concurrent burst can exhaust the
  bounded compare-and-set retries and receive a busy failure before the daily ceiling. The admin
  view intentionally samples installation records rather than reporting an exact lifetime aggregate.
* − The global ceiling is a shared availability budget. One source can consume the day’s allowance
  by minting installation pseudonyms; the per-IP in-memory limiter slows that denial but cannot
  prevent it across cold starts or function instances. This is accepted instead of durably storing
  source IPs or imposing a sub-cap that blocks families and classrooms behind shared addresses.
* − A provider success followed by an unconfirmable accounting write is withheld from the client; it
  can still incur provider cost without consuming a successful user-visible generation.
* − The one-minute reservation lease temporarily reduces the displayed remaining count while a
  request is in flight or after a crashed function.

## Amendment (2026-08-11): strong grant reads, and a delivered image is never withheld

Production measurement forced two reversals. Roughly half of all free generations answered `503`
"Could not confirm the free generation allowance" with a finished image already in hand — reproduced
against `splotch.art` at 4 failures in 7 requests, each failing about a second faster than a success
because it threw before writing anything.

**Cause.** The grant store used ADR-0025's default eventual-consistency reads. A generation performs
two read-modify-write cycles on one key around a multi-second provider call, and the second read
routinely served an edge copy predating the first write, so `completeFreeGeneration` could not find
the reservation the same request had just made. `free-generation-grants` now reads with
`consistency: 'strong'`. ADR-0025's eventual-read rationale still holds for `access-tokens` and
`ai-usage`, where no request depends on seeing its own write; it does not hold for a ledger whose
whole job is read-your-writes within one invocation. The strong-read hazard that ADR-0025 records
(`BlobsConsistencyError` when the Blobs context has no `uncachedEdgeURL`) belongs to the V1-function
era it also documents, and was re-verified against a real Netlify deploy before this shipped.

**One rejected alternative is now accepted.** *A provider success followed by an unconfirmable
accounting write is withheld from the client.* The route now logs the failure, omits
`X-Free-Generations-Remaining`, and returns the image. The rejected alternative feared uncounted
successes under repeated write contention; the durable UTC-day ceiling this same ADR establishes is
what actually bounds project spend, and it is charged before the provider call, so uncounted
successes cost availability accuracy rather than money. Destroying a picture a child waited for, to
protect a count the daily ceiling already backstops, was the worse trade.

**Holding a live reservation stays the proof that a completion owns a slot**, and the review of this
amendment is why. Spending the slot for a lapsed lease as well was drafted here and rejected: a
reclaimed lease can already have been re-reserved and spent by a later request, so two completions
would claim one slot and store `successful = 11`, which `normalizeGrant`'s clamp then hides rather
than prevents. The motivating case does not exist either — ADR-0063's ladder aborts the provider
call at `GENERATE_DEADLINE_MS` and the platform kills the invocation at `NETLIFY_SYNC_TIMEOUT_MS`,
both far below `RESERVATION_LEASE_MS`, so no live invocation can reach completion with an expired
lease. `completeFreeGeneration` therefore still rejects a missing or reclaimed reservation; the
fail-open above is what keeps the child's image in that anomalous case, and the expire → reuse →
both-complete interleaving is pinned by a test.

## Amendment (2026-08-17): OpenAI is the current provider

ADR-0113 replaced Gemini with OpenAI after this allowance decision. The original provider name is
historical; the reservation, ten-success allowance, pseudonym, and 500-start daily ceiling are
provider-independent and now govern project-funded OpenAI calls. After the free allowance, the BYOK
credential is an OpenAI key rather than a Gemini key.
