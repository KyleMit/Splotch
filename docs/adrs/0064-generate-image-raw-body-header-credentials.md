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

The **client** contract for `POST /api/generate-image` is:

* **Body:** the raw image bytes. `Content-Type: image/png | image/jpeg | image/webp` carries the
  type (an absent type defaults to PNG); the server validates it against the same allowlist and
  reads the bytes with a single `request.arrayBuffer()`.
* **Credentials — in headers, never the query string:** `X-Access-Token: <managed token>` **or**
  `X-Api-Key: <BYO Gemini key>` (mutually exclusive; a key takes the BYOK path). Request headers are
  not logged by default, not kept in history, and not sent in `Referer`.
* **Style — a query param:** `?style=Magical`. It is a short, non-secret, allow-listed enum, so the
  one field that lands in the URL is the only one that is safe there.

The **server** accepts that raw shape **and the legacy `multipart/form-data` shape**
(`token`/`apiKey`/`image`/`style` fields) it replaced. This backward-compat window is not optional:
the native apps are a static export that calls the **hosted** API and can only be updated through an
app-store release, and PWA web clients can run a cached service-worker bundle across a deploy — so a
server rollout is never atomic with its clients. If the server accepted only the raw shape, every
already-installed client would post multipart with no credential headers, read `null` credentials,
and get a `403` before the body is even inspected — breaking AI generation until each user updated.
The handler branches on `Content-Type`: multipart requests are parsed as before (credentials from
form fields), everything else is read as a raw body. The multipart branch is a labelled shim to
delete once the oldest supported client sends the raw body.

Supporting changes: the CORS allow-list (`hooks.server.ts`) adds `X-Access-Token, X-Api-Key` so the
native apps' cross-origin preflight passes. The raw path checks `Content-Length` up front (cheap
reject) and re-checks the actual byte length after the read, since `Content-Length` can be absent or
wrong. The `15 MiB` `MAX_IMAGE_BYTES` cap and the 400/413/415 failure codes are unchanged on both
paths.

### CSRF

SvelteKit's CSRF guard only rejects a cross-site POST whose `Content-Type` is a form type
(`multipart/form-data`, `application/x-www-form-urlencoded`, `text/plain`). A raw `image/*` body is
none of those, so the guard never fires on the new contract. But the retained legacy multipart shape
**is** a form type, and shipped native builds send it cross-origin, so
`csrf.trustedOrigins: ['https://localhost', 'capacitor://localhost']` (ADR-0007) is **still actively
required** — not merely defense-in-depth — until those clients age out. Once the multipart branch is
removed, the route stops depending on `trustedOrigins`.

## Consequences

* **+** For the raw path, one `arrayBuffer()` read replaces buffer-parse-copy: no multipart parse,
  one fewer image copy, lower peak memory on the buffered function. New clients get this
  immediately; legacy multipart clients keep the old cost until they update.
* **+** The two secrets never touch a URL, so they can't leak through access logs, browser history,
  or `Referer`. Only the non-secret style enum is in the query string.
* **+** No flag-day break: shipped native builds and stale-SW PWA clients keep generating across the
  deploy because the server still speaks multipart.
* **-** The endpoint carries two request shapes (a `Content-Type` branch) until the legacy shim is
  removed; the CSRF `trustedOrigins` dependency and the multipart parse both live on for that
  window.
* **-** Absolute bytes saved are small (sub-1 MB screenshots), so the win is cleanliness and a
  smaller memory footprint, not a latency change the child would feel.
