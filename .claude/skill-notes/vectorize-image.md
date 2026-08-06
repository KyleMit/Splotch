<!-- Source: .ruler/skill-notes/vectorize-image.md.template -->

# `vectorize-image` — design notes

Why the skill is shaped the way it is. Not linked from `SKILL.md` on purpose (see `README.md` in
this folder).

## The integration choice was measured, not assumed

The opening assumption was "we call it from Node scripts, so the official Node SDK is probably the
right fit." That was checked rather than taken, on 2026-08-06, by installing `@vectorizer-ai/sdk`
and running the same test-mode vectorization through it and through `curl`. Both returned a
byte-identical 1,959,267-byte SVG, which is expected — SDK, CLI, and HTTP are three front doors on
one engine.

What decided it against the SDK:

* **The header problem.** Every credit-saving workflow (`X-Image-Token` for extra formats,
  `X-Receipt` for the discounted post-preview downloads, `X-Credits-Charged` for the budget) lives
  in response headers. The SDK's ergonomic methods return a bare `Blob`; headers require the
  `postVectorizeRaw` variant, which hands back a response object. So the ergonomic win evaporates in
  exactly the flows that matter.
* **Name divergence.** The SDK flattens parameters to camelCase (`processingShapesMinAreaPx`), so
  the inlined documentation would not line up 1:1 with the code an agent writes. `--param` with
  verbatim dotted names keeps `reference/api.md` authoritative.
* **Maturity and dependency cost.** v1.0.0, one published version, 2026-06-02, OpenAPI-generated.
  Adding it means an ADR-0070 conversation about which dependency block it belongs in, for what
  Node's built-in `fetch` + `FormData` do in ~20 lines.

The CLI was rejected for a structural reason rather than a quality one: it is a standalone binary
from GitHub Releases, so a repo skill depending on it gains a non-reproducible per-machine install
step. It is genuinely the nicest option for a human converting a folder on their laptop, which is
why `SKILL.md` mentions it rather than pretending it doesn't exist.

**The SDK's one real advantage** is that the OpenAPI spec is richer than the HTML docs — it carries
`processing.color_profile.*`, per-shape parameterized-shape toggles, and PDF/EPS version and
compression parameters that no docs page mentions. Those are listed in `reference/api.md` under
*Undocumented parameters*, with the dotted names **inferred** from the SDK's camelCase. They are
unverified: no smoke test exercised them, and the inference could be wrong for a nested name. If one
is ever needed, confirm it in test mode (free) before trusting it.

Revisit the SDK if vectorization ever moves into app or asset-pipeline code instead of agent-run
scripts — typed enums would start to pay for themselves there, and that would deserve an ADR.

## Free test mode is the whole safety design

The account is a 50-credit metered plan and credits do not come back, so a skill that can silently
spend them in a loop is the main hazard. `mode=test` supports every parameter and costs nothing,
which makes the safety story structural rather than advisory: the driver defaults to `test`, and
spending requires typing `--production`. `X-Credits-Calculated` on the free response tells you what
the real call would cost before you authorize it.

Deliberately **not** added: a confirmation prompt before production calls. The driver is run
non-interactively by an agent, so a prompt would either hang or get auto-answered — the explicit
flag is the consent.

## Smoke-test evidence (2026-08-06, ~1.1 credits of 50)

Ordered cheapest first, on purpose:

1. `GET /account` — free. Confirmed the credentials and a 50-credit active plan.
2. `curl` + `mode=test` on `owl-tall.outline.webp` — free, `X-Credits-Charged: 0`,
   `X-Credits-Calculated: 1`, 19.8s, 1.9 MB SVG.
3. Same call through `@vectorizer-ai/sdk` — free, byte-identical result. This is the evidence behind
   the integration decision above.
4. `mode=production` with `retention_days=1`, `max_colors=2`, gap filler off — **1.0 credit**, 9.1s,
   124 KB SVG, `X-Image-Token` returned.
5. `/download` PNG from that token — **0.1 credit**, 1.0s, a real 1024×1536 RGBA PNG.
6. Deliberate 400 (no image source) and `/delete` of the retained token — both free.
7. Driver pass over every code path — `--account`, file input, URL input, `token:` input,
   `--download`, `--delete`, and four error surfaces — all in test mode, all free.

Step 7 turned up the thing that made the driver worth trusting: **`mode=test` with
`policy.retention_days > 0` issues a real `api-test-…` Image Token**, and `/download`, `/delete`,
and a token-input `/vectorize` all honor it at 0 credits while still reporting
`X-Credits-Calculated`. The docs never say this. It means the multi-format and multi-option
workflows — the fiddly ones, the ones with header bookkeeping — can be debugged end to end for free,
so the only call that ever needs to cost anything is the final keeper.

Two numbers worth remembering from that run: test-mode output was **15× larger** than production for
the same input (watermarking, not complexity — do not use test output to judge file size), and the
production trace was **twice as fast** as the test one.

## Open questions

* Nothing in the repo calls this yet. It is agent-invoked tooling, not pipeline code — if a real
  asset-gen use lands (tracing coloring outlines to SVG for resolution-independent line art), the
  parameter recommendations in `SKILL.md` are a starting point that has been *run* but not
  *evaluated for quality*: nobody has compared a traced owl against the WebP it came from at app
  sizes.
* **No centerline tracing** is the constraint most likely to disappoint. Outlines come back as two
  paths hugging each side of the ink rather than one stroked path down the middle, which rules the
  service out for anything wanting stroke-width control. Worth checking before proposing this for
  line-art work.
* The retention/token flow is only worth its complexity above one output format per image. A single
  SVG per input should just pay the 1 credit and skip `--retain` — one extra day of storage is 0.01,
  but the real cost is the token bookkeeping.
