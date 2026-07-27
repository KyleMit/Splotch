# `+error.svelte` and both `handleError` hooks produce a `{ message }` that nothing ever displays

**Priority/category:** P5[readability] · **Cluster:** C09 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/+error.svelte:1-7`, `web/src/hooks.client.ts:6-9`,
`web/src/hooks.server.ts:52-55` — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch

## Verdict

**FIX — clear winner.** Leave SvelteKit's error contract alone and land the draft's comment-only
documentation, with one sentence reworded to survive the last unresolved objection. Neither of the
finding's two code-change proposals (surface the message, or delete the plumbing) is correct — the
adversarial review itself proved the message is *not* dead data.

## Original finding (condensed)

Both `handleError` hooks return `{ message: GENERIC_ERROR_MESSAGE }` (the `App.Error` shape), but
`+error.svelte` renders `<ErrorScreen />` with no props, and `ErrorScreen` hardcodes its own
"Something went wrong. Let's start a fresh drawing." A reader reasonably assumes the hook message
reaches the UI; it doesn't. Proposed either wiring `page.error?.message` into `ErrorScreen` or
dropping the payload to a comment saying the UI copy is intentionally fixed.

## Why it was deferred

Failed adversarial review. The driver correctly chose a comment-only fix, but three rounds of
comment wording each drew factual objections. Rounds 1-2 objections were all fixed in the draft
(don't claim the message is never surfaced — SvelteKit's default fallback error page renders
`%sveltekit.error.message%` since there is no custom `error.html`; don't claim it's "required by
App.Error" — the hooks may return void; drop the false "data-request error responses" clause — that
path transports the message into `page.error` but `+error.svelte` ignores it; name the real second
consumer, the JSON error body of a thrown `/api/*` `+server.ts` handler; fix `errorLog.ts`'s false
"user-facing fallback stay in step" claim; add the deliberate-ignore note to `+error.svelte`). One
objection remains unresolved against the draft:

* The `+error.svelte` comment attributes `page.error.message` to the two `handleError` hooks, but
  the hooks set it only for *unexpected* errors. For expected `error(4xx)` throws it is the
  `error()` body — the common path in this repo (`web/src/routes/admin/+page.server.ts:45` throws
  `error(403, 'Forbidden')`, plus SvelteKit's own 404 `'Not Found'`) — and `hooks.server.ts` already
  documents that expected 4xx responses never reach `handleError`. The parenthetical must cover both
  sources.

## Current state of the code

Unchanged at HEAD; the finding's surface facts all still hold, and so do the review's counter-facts:

* `web/src/hooks.client.ts:7-10` and `web/src/hooks.server.ts:75-78` both return
  `{ message: GENERIC_ERROR_MESSAGE }` with no comment about who consumes it.
* `web/src/routes/+error.svelte` renders a prop-less `<ErrorScreen />`; `ErrorScreen.svelte`
  hardcodes its copy and is shared with the root layout's `<svelte:boundary>` (`+layout.svelte:30`),
  which has no `page.error` at all.
* `web/src/lib/errorLog.ts:1-3` still carries the actively false claim that the three sinks'
  "user-facing fallback stay[s] in step" — the render boundary never imports
  `GENERIC_ERROR_MESSAGE`.
* There is still no `web/src/error.html`, so SvelteKit's default fallback template (which renders
  `%sveltekit.error.message%`) is live for errors that escape `+error.svelte`, and a thrown `/api/*`
  handler returns the server hook's `{ message }` as its JSON error body.

The patch applies at HEAD only via `git apply --recount` — the final hunk's line counts are
truncated, so a plain `git apply` fails with "corrupt patch at line 54". Content-wise it is current.

## Options considered

1. **Leave the contract, document the flow (winner — the draft).** The return value is framework API
   with two real consumers (fallback error page, `/api/*` JSON error bodies); the only genuine
   defect is misleading comments, and the draft fixes exactly those.
2. **Delete the plumbing** (return void from both hooks). Regresses the two surfaces that *do* show
   the message to SvelteKit's generic `'Internal Error'`, and does nothing about `errorLog.ts`'s
   false comment. The finding's "nothing ever displays it" premise is simply wrong.
3. **Surface `page.error.message` in `ErrorScreen`.** Wrong for this app: the crash screen is
   toddler-facing with deliberately fixed, friendly copy; `ErrorScreen` is shared with the render
   boundary, which has no `page.error`; and on the common expected-error path the message would be
   `'Forbidden'` or `'Not Found'` — developer copy, not a child-appropriate improvement.

## Recommendation

Apply the draft patch (with `--recount`), then make the single change that answers the surviving
objection: reword `+error.svelte`'s added comment so it no longer names the hooks as the setter.
Sketch:

```svelte
// page.error.message is deliberately ignored — ErrorScreen owns the user-facing
// copy. (Its value is the error() body for expected 4xx throws — the admin
// route's 403 'Forbidden', SvelteKit's own 404 'Not Found' — and handleError's
// returned message for unexpected failures.)
```

Everything else in the draft already incorporates the round 1-3 corrections and should land as-is:
the client-hook comment names only the fallback error page (no `/api/*` consumer client-side), the
server-hook comment names the fallback page plus the thrown-`/api/*` JSON body, and `errorLog.ts`
now states the constant is consumed only by the two hooks while the boundary/`+error.svelte` render
`ErrorScreen`'s own copy.

Verify with `npm run check`, eslint on the four touched files, and `npm run test:unit`; optionally
confirm behavior by visiting an unknown route (404 renders `ErrorScreen`, message ignored) and by
curling a throwing `/api/*` route to see `{ "message": "Something went wrong." }` in the JSON body.

## Suggested next step

Apply the patch
(`git apply --recount docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch`),
make the one comment reword above, and commit — small enough to fold into any nearby cleanup PR; no
re-staging in docs/AUDIT.md needed.
