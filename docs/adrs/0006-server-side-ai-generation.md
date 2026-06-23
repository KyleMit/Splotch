# ADR-0006: Server-Side AI Image Generation via Netlify Serverless Function

**Status:** Active  
**Date:** 2025

## Context

The AI "color this drawing" feature calls the Gemini API to transform a canvas screenshot into a styled colored version. Calling the Gemini API requires an API key.

Options:
- **Client-side (browser)** — simpler, no server needed, but exposes the Gemini API key to every user, allowing quota abuse.
- **Server-side (Netlify function)** — the key stays in server environment variables; the endpoint can enforce token-gating and rate limiting.
- **BYO Key (native only)** — allow power users to supply their own Gemini API key via secure storage.

## Decision

Image generation runs in a **Netlify serverless function** at `/api/generate-image`. The Gemini key is stored in a Netlify environment variable (`GEMINI_API_KEY`) and never sent to the client.

Access to the managed endpoint is **token-gated**: the client must supply an `access-token` form field that is validated against an allowlist stored in Netlify Blobs (storage details, consistency constraints, and the env-seeded fallback: ADR-0025). Tokens are provisioned via the `/admin` console and can be revoked by removing them from the list.

A **rate limiter** (sliding window, in-memory per instance) caps managed tokens at 15 requests per minute to blunt a leaked token being hammered before it's noticed and revoked.

**Usage is audited** to Netlify Blobs (`ai-usage` store): each generation records the token (masked in logs), style, prompt, and timestamp. This allows admins to detect rogue tokens and track quota consumption without a separate database.

The model is `gemini-2.5-flash-image` (flash tier: lower cost and latency vs. Pro/Ultra, adequate quality for children's coloring-book style transformations).

**Native apps** send requests to the hosted endpoint (`https://splotch.art/api/generate-image`) using the `__NATIVE_API_BASE__` compile-time constant. The BYO Key flow (for users who supply their own Gemini key) bypasses the token gate and rate limit entirely — those requests consume the user's own quota.

## Consequences

- **+** Gemini API key never exposed to clients.
- **+** Token revocation is immediate (no app update needed).
- **+** Usage audit trail without a managed database.
- **-** Adds a server round-trip; generation latency is network-bound in addition to model latency (a 120-second timeout is in place).
- **-** In-memory rate limiting resets on Netlify cold starts and does not coordinate across concurrent instances — it's a cost guardrail, not a hard boundary.
- **-** Netlify Blobs is only available in the Netlify runtime; under local `vite dev` token edits and usage fall back to a per-instance in-memory list. Production carries its own constraint — strong-consistency reads are unsupported in the SSR function and degrade silently — both covered by ADR-0025.
