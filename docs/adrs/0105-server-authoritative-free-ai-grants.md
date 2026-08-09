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

Free attempts use their own per-IP 15/minute in-memory guard in
`generationAuthorization.ts`/`rateLimitPolicy.ts`, preserving ADR-0014's low-latency rate-limit
model while the durable grant remains the hard spend boundary. Managed access codes and BYOK keep
their existing branches and limits. Successful free responses carry `X-Free-Generations-Remaining`;
`GET /api/free-generation-grant` refreshes the authoritative count without creating or spending a
grant. Exhaustion keeps the AI button visible and routes the already-parent-gated operation to BYOK
setup, following ADR-0094's operation-level gate.

The authenticated web-only `/admin` console (ADR-0101) enumerates the grant store to show aggregate
successes, attempts, failures, active/exhausted grants, active reservations, and recent
pseudonymous-installation detail. Local development uses a server-memory fallback, clearly marked
non-persistent, because plain Vite has no Netlify Blobs context (ADR-0025).

## Consequences

* \+ A fresh installation gets ten successful managed generations with no account, access code, or
  parent-supplied key.
* \+ Conditional reservations make the ten-generation boundary safe under concurrency, while failed
  provider calls do not consume it.
* \+ The server and `/admin` can observe aggregate spend and failure patterns without storing a raw
  device identifier.
* \+ Reloads, app updates, and ordinary Android reinstalls retain the allowance through the chosen
  platform pseudonym.
* − Web site-data clearing and some iOS uninstall sequences can mint a new pseudonym and another
  allowance. This is the explicit cost of declining accounts, fingerprints, advertising IDs, and
  IP-based identity.
* − Every free attempt adds conditional Blobs writes before and after the provider call, and the
  admin aggregate performs a store listing plus record reads.
* − A provider success followed by an unconfirmable accounting write is withheld from the client; it
  can still incur provider cost without consuming a successful user-visible generation.
* − The one-minute reservation lease temporarily reduces the displayed remaining count while a
  request is in flight or after a crashed function.
