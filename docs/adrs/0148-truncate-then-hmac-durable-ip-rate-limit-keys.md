# ADR-0148: Truncate, Then HMAC, Durable IP Rate-Limit Keys

**Status:** Active **Date:** 2026-08

## Context

[ADR-0014](0014-in-memory-rate-limiting.md) deliberately keeps request-rate limits inside one
function instance. `web/src/lib/server/rateLimitKeys.ts` interpolates the exact address returned by
SvelteKit's `getClientAddress()` into a purpose-prefixed string, and
`web/src/lib/server/rateLimit.ts` uses that string only as a key in a process-local `Map`. Those raw
addresses disappear on cold start or opportunistic cleanup; they are not durable identifiers.

Issue #1097 is the implementation consumer for durable managed-code budgets and, optionally, durable
per-IP oracle limits. Moving an IP-derived key into the Netlify Blobs boundary established by
[ADR-0025](0025-netlify-blobs-server-storage.md) changes the privacy and abuse tradeoff: a store
snapshot can outlive an instance, be correlated across requests, and accumulate unless expiry is
part of the record contract.

Four key schemes were considered:

* **Raw address.** Exact enforcement, but it stores directly identifying network data and exposes it
  to anyone who can inspect the store.
* **Truncation without HMAC.** Grouping addresses reduces precision, but the stored prefix still
  identifies a source network and is immediately readable.
* **Exact-address HMAC.** The store does not reveal the address without the secret, but it preserves
  exact-address linkage and lets IPv6 clients evade limits by rotating addresses within their
  routinely assigned prefix.
* **Truncate, then HMAC.** A keyed opaque identifier hides the source prefix at rest, while prefix
  grouping resists address rotation. The cost is deliberate false sharing among unrelated clients
  behind the same network.

The durable global provider-start ceiling and installation allowance in
[ADR-0105](0105-server-authoritative-free-ai-grants.md) remain separate. This decision neither makes
an IP-derived key an account nor invents an IP-based product allowance.

## Decision

Any durable limiter record derived from a client IP uses **truncate-then-HMAC**:

1. Parse and canonicalize the address by network value, not presentation text. Treat an IPv4-mapped
   IPv6 address as IPv4. Clear host bits to an IPv4 `/24` or IPv6 `/48` network prefix.
2. Compute HMAC-SHA-256 with a high-entropy secret dedicated to durable IP limiting. It must not
   reuse an admin token, provider credential, managed code, report-token secret, usage-pseudonym
   secret, or another signing key.
3. Domain-separate the authenticated input with a versioned application purpose, limiter identity,
   address family/prefix length, and the canonical prefix bytes. The conceptual input is
   `splotch-durable-ip-rate-limit-v1\0<limiter>\0<family/prefix>\0<prefix-bytes>`; distinct limiter
   purposes therefore cannot correlate or spend one another's buckets through a shared digest.
4. Store only the versioned HMAC-derived key and limiter state. Never put the raw address, canonical
   prefix, or reversible address text in the blob key, value, or application logs.

HMAC is pseudonymization, not anonymization. Anyone holding the secret and candidate addresses can
reproduce identifiers, and equality within one limiter purpose remains observable. The dedicated
secret limits the blast radius of disclosure and domain separation prevents the durable key from
becoming a reusable cross-purpose identifier.

Expiry is a hard part of the limiter contract. Every durable record must carry an expiry derived
only from the time range whose events can still affect that limiter's answer. For a sliding window,
the record expires no later than one configured window after its newest retained event. An active
write may advance that boundary only as the decision-relevant window advances. Reads treat an
expired record as absent and delete it best-effort; a bounded scheduled purge must remove inactive
or malformed records so they cannot accumulate indefinitely. A consumer may choose a shorter
retention period, but not an unrelated product budget or indefinite history.

Rotating the dedicated secret intentionally creates a new keyspace. Active limits reset because the
new code cannot find records keyed by the prior secret; old records remain unreadable to the new
limiter and expire on their original schedule. Rotation must therefore be treated as a temporary
enforcement reset, not as a transparent credential change. Changing the prefix widths, domain, or
encoding likewise requires a new version and has the same reset consequence.

Issue #1097 must apply these invariants if it implements its optional durable per-IP oracle limits.
The existing in-memory keys remain exact raw-address strings under ADR-0014 because they do not
cross a persistence boundary; this ADR does not implement or replace that limiter.

## Consequences

* \+ A stolen blob snapshot does not directly expose client addresses or network prefixes, and the
  same IP cannot be correlated across limiter purposes from stored keys alone.
* \+ Prefix grouping makes inexpensive IPv6 address rotation and nearby IPv4 address changes less
  effective at evading a durable limiter.
* \+ Expiry limits both privacy exposure and storage growth to the limiter's actual enforcement
  need.
* − A `/24` IPv4 or `/48` IPv6 bucket can combine unrelated households, classrooms, carrier users,
  VPN users, or institutional clients. One client's traffic can therefore rate-limit others sharing
  the prefix.
* − Truncation reduces precision and HMAC adds secret management and computation. It cannot prevent
  evasion by moving between prefixes or through a sufficiently distributed source set.
* − A secret or scheme rotation resets active limits. Old records consume storage until their
  already-bounded expiry and cannot be migrated without retaining the previous secret.
* − The digest remains a stable pseudonym inside one limiter purpose for the record's lifetime; this
  design minimizes durable linkage but does not make the data anonymous.
