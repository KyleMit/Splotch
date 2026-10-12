# ADR-0104: Retain Reported AI Images for Thirty Days

**Status:** Active **Date:** 2026-08

## Context

Splotch's normal AI generation path intentionally does not retain a child's drawing or the returned
image. That privacy default left no actionable evidence when an AI result was inappropriate: a text
report could not show what Gemini received, what server-owned prompt it used, or what it returned.
Google Play also requires apps that generate AI content to provide in-app reporting.

We considered keeping no evidence and accepting a text-only report, but a parent should not have to
describe an image and a reviewer could not reproduce the exact input/output pair. We also considered
retaining every AI generation, which would make investigations easier but would turn an explicit,
ephemeral feature into background image collection. Permanent retention was rejected because the
evidence has a narrow support purpose and includes child-created content.

## Decision

Normal AI generation remains ephemeral. Only after someone taps “Report this picture,” sees the
evidence disclosure, follows the dedicated image-report policy configured in Parent Center, and
confirms the send does Splotch retain a bundle. That policy defaults to a grown-up check every time
and is independent from text feedback. Every AI result is visibly labelled “AI-generated picture.”

`POST /api/report-image` accepts the input and output image plus a style. It requires the same
active managed token or verified BYO Gemini key as generation and has separate report-specific
limits. The style is a closed server-side `StyleName` enum; arbitrary styles are rejected and the
endpoint accepts no prompt text. The server reconstructs the resolved generation prompt from the
shared base prompt and style suffix, preventing a client from forging report context.

`web/src/lib/server/imageReportStore.ts` stores four objects in the site-wide Netlify Blobs store
`ai-image-reports`, under one opaque timestamp/UUID prefix:

* the input drawing;
* the generated output;
* the resolved server prompt; and
* versioned metadata containing report time, scheduled deletion time, style, and MIME types.

After the complete bundle is saved, the server creates a private support issue through the channel
established by ADR-0060. Its body carries the blob store and key prefix, not the images themselves,
plus the style and deletion time. If notification fails, the bundle is deleted so inaccessible
evidence is not orphaned. A successful response returns the opaque report id so a parent can include
it in a private early-deletion request; it grants no access to the stored bundle. A human reviews
reports within 24 hours.

The retention window is 30 days. `netlify/functions/purge-image-reports.ts` runs daily, iterates all
paginated store results, and deletes every object whose report-id timestamp is older than the shared
retention constant. A deletion request can remove the same prefix sooner. The privacy policy, Google
Play declarations, App Store declarations, and iOS privacy manifest all describe this same boundary.

## Consequences

* \+ A reviewer gets the exact input, server-owned prompt, output, style, and time needed to assess
  and escalate an unsafe result.
* \+ Collection remains deliberate and exceptional: viewing or generating an image retains nothing;
  the disclosure, dedicated Parent Center policy, and confirmation precede the upload.
* \+ The closed style enum prevents the report endpoint from becoming a free-text prompt or
  arbitrary evidence-ingestion surface.
* \+ Daily deletion gives the 30-day policy an executable enforcement mechanism rather than relying
  on a manual reminder.
* − Confirmed reports retain child-created content and AI output for up to 30 days, so store
  disclosures can no longer say that Splotch collects nothing or that all AI content is ephemeral.
* − Review depends on the private support repository and Netlify Blobs. If either write fails, the
  user sees a retryable error and no partial report is accepted.
* − The 24-hour response commitment creates an operational obligation outside the codebase.

## Amendment (2026-08-12): the free tier reports with a signed report token

The Decision above requires "the same active managed token or verified BYO Gemini key as
generation." That was accurate when generation took exactly those two credentials. Generation has
since gained a third — the free tier, which authorizes with a bare `X-Installation-Id` — and the
report endpoint kept only the original two, so every picture made on the default no-setup path was
unreportable: `POST /api/report-image` answered `403 Invalid access token` (issue #960). Reporting
being harder to reach than generation is a safety defect, since the report is the child-safety path
for the very output that credential produced.

Reporting now accepts all three, but the free one is **not** generation's credential. An
installation id is a client-generated 64-hex string; accepting it alone would make an endpoint that
writes image blobs to storage and opens issues in the private tracker an unauthenticated public
write, bounded only by the per-instance rate limiter — which ADR-0014 defines as a throttle that
resets on cold start and shares nothing across instances, not an authorization boundary.

So `/api/generate-image` mints a **report token** on a successful free run: an HMAC over the
installation id and a short expiry, keyed by `REPORT_TOKEN_SECRET`, returned in `X-Report-Token`.
`/api/report-image` requires it back. That keeps the property this ADR cares about — every retained
bundle traces to a generation this server actually performed — without a stored-state read in front
of a child-safety path.

Two alternatives were rejected. **Shape-only acceptance** (installation id plus a per-IP limit) was
implemented first and rejected in review: it is locally mintable, and `/api/report` is not the
precedent it appeared to be, because that endpoint retains no image bytes. **Requiring an existing
free-generation grant record** is durable but weak — any caller mints a grant with one
`generate-image` call under the same per-IP budget — and it puts a strong-consistency Netlify Blobs
read in front of reporting, so a blobs outage would fail a safety report closed.

The endpoint additionally caps the raw multipart body before parsing. The 4 MiB bundle limit is
checked after `formData()` has already buffered the payload and only ever weighed the two images it
keeps, so oversized bytes hidden in a discarded field passed it.

* \+ Free-tier users can report, and every accepted report still proves server-side provenance.
* \+ No blob read on the report path, so reporting does not inherit the grant store's availability.
* − `REPORT_TOKEN_SECRET` is new required deploy configuration. Unset, the BYOK and managed paths
  keep working and the free path alone answers 503, logged server-side.
* − A report token expires, so a result left open long enough can no longer be reported.

## Amendment (2026-08-13): confirmed false-positive refusals use the same retention boundary

Safety refusals were still a blind spot after the original reporting flow shipped: the parent could
report an inappropriate generated picture, but could not report that a harmless drawing had been
blocked. Issue #988 extends the same deliberate feedback boundary to false positives without
weakening the safety classifier or retaining every refusal.

The refusal UI offers a visibly parent-facing “Report this refusal” action only for the `422` safety
state. It uses the existing AI-report Parent Center policy, then a distinct confirmation naming the
evidence before the send. Until that confirmation, the rejected drawing remains only in the open
client state and normal generation remains ephemeral.

`POST /api/report-image` now accepts the closed report kinds `picture` and `false-positive-refusal`.
An absent kind remains `picture` for already-installed clients. Both reports retain the input
drawing, server-reconstructed prompt, style, timestamps, and a versioned metadata category; only a
picture report accepts and stores an output image. Refusal metadata and private notifications also
carry the provider's authenticated refusal reason so support can distinguish an inappropriate result
from an over-aggressive refusal without trying to reproduce a non-deterministic model response.

The free tier's `422` response now mints the same short-lived report token as a successful image
response. Every refusal mode extends that token with an HMAC-authenticated context bound to the
generation credential and carrying the normalized provider reason. The client returns the opaque
token but cannot forge the retained reason. This keeps the context stateless and preserves the
ephemeral boundary: neither the refusal drawing nor its reason is written anywhere unless the parent
confirms. Managed-token and BYO-key setups continue to authorize the report with their existing
credentials; their signed context is required only for refusal reports.

* \+ False-positive refusals become visible to human review with the input, exact server-owned
  instruction, and authenticated provider reason needed to investigate them.
* \+ Refusals remain ephemeral by default and use the same 30-day purge and orphan-cleanup
  guarantees as picture reports.
* \+ The report endpoint remains a closed evidence surface: a refusal cannot smuggle an output image
  or client-authored prompt into its bundle.
* − Every refusal response now carries a credential-bound report token for its short lifetime, even
  when the parent never opens the report action.

## Amendment (2026-08-17): current provider and deletion timing

ADR-0113 replaced Gemini with OpenAI, so references in the original Decision to Gemini describe the
provider at the time rather than the current report authorization. The managed access-code and BYOK
paths now use OpenAI; the free-tier report-token amendment remains the third authorization path.

The original “up to 30 days” consequence also describes the intended retention threshold, not an
instantaneous deletion guarantee. The purge runs daily and deletes bundles once their report-id
timestamp is older than the shared 30-day constant. Current parent and store disclosures therefore
say a confirmed bundle is scheduled for deletion after 30 days by a daily purge. An early-deletion
request can still remove the same prefix sooner.
