# ADR-0064: generate-image takes a raw image body; credentials in headers, not the query string

**Status:** Active\
**Date:** 2026-07-18

## Context

`/api/generate-image` originally accepted `multipart/form-data`: the PNG in an `image` field, the
managed access token / BYO Gemini key in `token` / `apiKey` fields, and the style enum in a `style`
field. On the buffered Netlify function (ADR-0063) that path is wasteful —
`await request.formData()` buffers the whole multipart envelope, parses it, then
`imageFile.arrayBuffer()` copies the image out again. A raw body collapses that to one
`await request.arrayBuffer()`: no multipart parse, one fewer copy, less peak memory (issue #346).

Moving the image to the body forces the other three fields somewhere else. The obvious framing —
"headers plus a query param" — hides a security decision: **the token and the BYO Gemini key are
secrets, and query strings are the one part of a request that routinely leaks.** They land in
Netlify / CDN / proxy access logs, in browser history, and in the `Referer` header sent to any
third-party resource the page later loads. A parent's `apiKey` is a live Google credential tied to
their billing account; the managed `token` gates our paid quota. Neither belongs in a URL. (The
concern is sharper still if we ever accept a free-form custom prompt — user-authored text that could
carry PII — as a generation parameter; that too must never be a query param. Today the only prompt
input is the `style` **enum key**, which the server maps through an allowlist in
`buildPromptForStyle`, so an arbitrary value is simply ignored.)

## Decision

The request contract for `POST /api/generate-image` is:

* **Body:** the raw image bytes. `Content-Type: image/png | image/jpeg | image/webp` carries the
  type (an absent type defaults to PNG); the server validates it against the same allowlist and
  reads the bytes with a single `request.arrayBuffer()`.
* **Credentials — in headers, never the query string:** `X-Access-Token: <managed token>` **or**
  `X-Api-Key: <BYO Gemini key>` (mutually exclusive; a key takes the BYOK path). Request headers are
  not logged by default, not kept in history, and not sent in `Referer`.
* **Style — a query param:** `?style=Magical`. It is a short, non-secret, allow-listed enum, so the
  one field that lands in the URL is the only one that is safe there.

Supporting changes: the CORS allow-list (`hooks.server.ts`) adds `X-Access-Token, X-Api-Key` so the
native apps' cross-origin preflight passes. The oversized-body guard now checks `Content-Length` up
front (cheap reject) and re-checks the actual byte length after the read, since `Content-Length` can
be absent or wrong. The `15 MiB` `MAX_IMAGE_BYTES` cap and the 400/413/415 failure codes are
unchanged.

### CSRF

SvelteKit's CSRF guard only rejects a cross-site POST whose `Content-Type` is a form type
(`multipart/form-data`, `application/x-www-form-urlencoded`, `text/plain`). A raw `image/*` body is
none of those, so the guard no longer fires on this route at all — the native cross-origin call
stops depending on the `csrf.trustedOrigins` allow-list it previously needed. We **keep**
`trustedOrigins: ['https://localhost', 'capacitor://localhost']` anyway as cheap defense-in-depth so
any future cross-origin form POST from the real apps keeps working; the comment in
`svelte.config.js` was rewritten to state that current reality rather than the now-gone multipart
reason.

## Consequences

* **+** One `arrayBuffer()` read replaces buffer-parse-copy: no multipart parse, one fewer image
  copy, lower peak memory on the buffered function.
* **+** The two secrets never touch a URL, so they can't leak through access logs, browser history,
  or `Referer`. Only the non-secret style enum is in the query string.
* **+** The route no longer relies on the CSRF `trustedOrigins` allow-list (kept only as
  defense-in-depth).
* **-** A breaking change to the request contract: web client (`aiImage.ts`), the api smoke test,
  the E2E guards (`generate-image.spec.ts`), the manual red-team runner, and the `api` skill all had
  to move in lockstep. Any out-of-tree caller of the endpoint must update too.
* **-** Absolute bytes saved are small (sub-1 MB screenshots), so the win is cleanliness and a
  smaller memory footprint, not a latency change the child would feel.
