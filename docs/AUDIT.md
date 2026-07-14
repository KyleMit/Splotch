# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`). Clear the whole list
> autonomously with `/fix-audits`; validate it with `/vet-audits`. Skills **merge** into this file —
> they never overwrite each other's sections.

## Source: Code audit

### [Architecture] Fit AI requests inside Netlify's deployed function envelope

**⏸ Pending decision:** Production metadata confirms `sveltekit-render` runs in streaming mode with
a 10-second ceiling. Choose an asynchronous job flow, a suitable buffered runtime, or another host
before setting generation, verification, upload, and output budgets; a timeout-only change would
either preserve uncontrolled termination or make legitimate image generation unusable.

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`MAX_IMAGE_BYTES`, multipart parsing,
and response buffering, lines 35–41 and 112–130), `web/src/lib/server/ai/gemini.ts`
(`generateImage`/`verifyKey`, lines 44–95), `web/src/lib/drawing/aiImage.ts` (client deadline, lines
41 and 64–81), `web/svelte.config.js` (Netlify adapter)

#### Problem

The route accepts 15 MiB only *after* `request.formData()` buffers the multipart body, while current
Netlify limits buffered requests to 6 MB and says base64 overhead reduces effective binary uploads
to about 4.5 MB. Netlify's synchronous invocation limit is 60 seconds, far below the server and
client's 120-second Gemini deadlines. Streaming functions have a still-shorter 10-second limit, but
the generated fetch-style `sveltekit-render` wrapper does not prove which invocation mode the
deployed route receives; that must be confirmed from the deploy rather than inferred from adapter
output.

Consequently production can reject uploads well below the application's advertised cap and kill a
slow model call before Splotch returns its controlled 413/422/502 response. The local 16 MiB E2E
guard proves behavior the deployment cannot exercise. `verifyKey()` has no upstream abort at all, so
a merely rate-limited public probe can occupy an invocation until the platform terminates it. See
[Netlify's function limits](https://docs.netlify.com/build/functions/configuration/) and
[streaming-function API limits](https://docs.netlify.com/build/functions/api/#streaming-responses).

#### Proposed solution

Define one deployment-aware budget: cap image bytes below the effective request limit (including
multipart overhead), reject an oversized `Content-Length` before `formData()` when present, bound
output bytes, and abort both generation and key verification with headroom below the confirmed
invocation limit. Put the client deadline slightly beyond the server's so the server controls the
error contract. If deploy telemetry shows streaming invocation, the 10-second ceiling requires a
different architecture for image-generation latency rather than another timeout adjustment.

**Vet 2026-07-14 — split the concrete from the speculative; do the concrete first:**

* **Actionable now (no deploy telemetry needed):**
  * `verifyKey()` (`gemini.ts:82–95`) has **no upstream abort at all** — unlike `generateImage`
    (`gemini.ts:61`, `AbortSignal.timeout(120_000)`). A rate-limited public probe can occupy an
    invocation until the platform kills it. Add a bounded timeout. **Highest-value, lowest-cost
    sub-fix.**
  * The 120 s deadlines (`gemini.ts:61`, `aiImage.ts:41` `AI_TIMEOUT_MS = 120_000`) exceed **any**
    plausible Netlify *synchronous* function ceiling (single-digit-to-low-tens of seconds), so on a
    slow model call the platform, not Splotch, returns the error. Pull the server deadline under the
    real ceiling and keep the client deadline just beyond it.
* **Speculative — confirm before acting, don't implement blind:** the "6 MB buffered / ~4.5 MB
  effective / 60 s sync" envelope rests on deploy behavior the repo can't prove (does the deployed
  SvelteKit function buffer or stream its response?), and the specific **"60 s synchronous limit"
  figure in the Problem above is unverified and likely wrong** — Netlify's sync ceiling is far
  lower. The 15 MiB cap (`MAX_IMAGE_BYTES = 15 * 1024 * 1024`, `+server.ts:37`) also has **no
  practical trigger for legitimate traffic**: the client only ever uploads a sub-1 MB canvas
  screenshot, so the cap-exceeds-envelope concern is a DoS-surface note, not a functional bug.
  Reject an oversized `Content-Length` early if cheap, but gate the byte-budget rewrite on measured
  deploy limits.

#### Verification

**Do first (unit, no deploy):** add a fake-timer test proving `verifyKey()` aborts on a hung
provider, and one proving `generateImage`/`verifyKey` deadlines are set below the target ceiling.
**Then, gated on deploy access:** inspect the built function manifest to determine
buffered-vs-stream invocation and the real request/time limits; run a deploy-preview smoke at
just-under/over upload boundaries and against a deliberately delayed provider, confirming Splotch
(not the platform) returns the timeout. Reconcile ADR-0006 and the API skill with the *measured*
budget — do not hard-code the unverified 6 MB / 60 s numbers.

## Source: Extract audit

### [Extract] readAiImageResponse

**File(s):** `web/src/lib/drawing/aiImage.ts` (`generateAiImage` response handling, lines 82–104)

#### Problem

The generation orchestrator decodes four HTTP outcomes inline while also owning export, request
construction, timeout, UI state, and auto-save. Safety refusal and throttling are early-return UI
side effects, generic errors throw with response text, and success reads the blob. That makes the
client's API interpretation difficult to test as a response matrix and hides the intent of the
happy-path call site.

#### Proposed solution

Extract `async function readAiImageResponse(response: Response): Promise<AiImageResponse>` in
`aiImage.ts` or a nearby client-only module, returning a discriminated union such as `image`,
`safety`, `throttled` (including `Retry-After` and diagnostic detail), or `error`. Keep the
child-facing UI transition and logging in `generateAiImage`; the helper should only translate the
HTTP contract into domain data.

#### Verification

Unit-test synthetic 200, 422, 429-with/without-`Retry-After`, generic non-OK, and unreadable-body
responses. Assert the extracted function never mutates `ui`; then retain orchestration tests showing
each union arm produces the same safety/retry/generic state and only the image arm can auto-save.
