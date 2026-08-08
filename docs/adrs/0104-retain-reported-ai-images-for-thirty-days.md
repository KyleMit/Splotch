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
