# Native page hand-rolls type guards that duplicate the server's response shape

**Priority/category:** P2 type-safety · **Cluster:** C08 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/admin/native/+page.svelte:45-70, 113-136`,
`web/src/routes/api/admin/tokens/+server.ts:44` — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p2-type-safety-native-page-hand-rolls-type-guards-that-duplicate-the-ser.patch

## Verdict

**FIX — clear winner.** The draft's substance is correct and survived two full review rounds; only
one narrow objection remained (an invented 409 string in a test mock). It cannot be applied verbatim
— two of its four files drifted at HEAD — so the fix is "port the patch by hand, correcting the
string", not "git apply".

## Original finding (condensed)

The `{ ok, tokens, invites, persistent }` snapshot contract lives authoritatively in
`tokens/+server.ts`'s `snapshot()`, but `/admin/native` re-describes it as a hand-written inline
guard annotation, and `login()` parses its response as untyped `any` (`data?.ok`, `data?.session`).
A field added server-side never surfaces as a client type error. Proposed: export `TokenSnapshot` /
`LoginResponse` wire types from the endpoints, type the guard as `value is TokenSnapshot`, and type
the login parse against the response union.

## Why it was deferred

Failed adversarial review after two fix rounds — but rounds 1-2's objections (bind the producers
with `satisfies`, drop the endpoint's client-component import, add a wire integration test, keep
`reason` off the wire) were all fully addressed and verified load-bearing. The single unresolved
objection: the new `wire.integration.test.ts` mocks the CAS-conflict rejection with an invented
string, `'Could not save. Please try again.'`, while the real 409 body carries
`TOKEN_CONFLICT_ERROR` (`'The token list changed while saving — please try again'`,
`web/src/lib/server/tokens.ts:162`) — in a file whose header claims to pin "the bytes on the wire".

## Current state of the code

The finding fully holds at HEAD. None of the draft landed:

* `web/src/routes/api/admin/tokens/+server.ts` — `snapshot()` (line 43) and `mutationError()` (lines
  50-53) still build untyped literals; nothing is exported for clients to name.
* `web/src/routes/api/admin/login/+server.ts` — both bodies untyped (lines 23, 25).
* `web/src/routes/admin/native/+page.svelte` — `isSnapshot` still carries the hand-copied inline
  annotation (lines 52-54); `login()`'s parse is still `any` (lines 140-142).

Drift that breaks `git apply` (both from later burndown PRs in the f934d43..HEAD range):

* 44f80ad split `parseSnapshot` out of `applySnapshot` on the native page — the draft's typed-parse
  hunk targets the old combined function. The typed cast now belongs on `parseSnapshot`'s
  `response.json()` (line 80).
* 348d813/01de4be reworked `login/+server.ts` (`stringField`, `throttled` before parse) — context
  mismatch only; the type export and `satisfies` edits are unaffected in substance. `throttled()`'s
  429 body is `{ ok: false, error }` (`http.ts:33`), so the draft's claim that the 429 matches the
  failure arm of `LoginResponse` is still accurate.
* The `tokens/+server.ts` hunks and the new test file still apply cleanly. Also relevant: 782cf6e
  already landed the `reason` discriminant (`MutationFailure`) the draft's round 3 builds on, so
  that part needs no porting. HEAD's `login.integration.test.ts` /
  `tokenActions.integration.test.ts` cover throttle sharing and status-code parity — complementary
  to, not overlapping with, the wire test's byte-shape pinning.

## Options considered

Skipped ranking — the only real alternative (write fresh, ignoring the draft) throws away three
reviewed, gate-green commits to arrive at the same design. Porting wins outright.

## Recommendation

Re-implement the draft's three commits on HEAD (mostly mechanical), with exactly two deviations:

1. **Fix the invented conflict string** — the one objection that killed the draft. In the test's
   `addToken` mock (patch line 166) and the 409 expectation (patch line 307), replace
   `'Could not save. Please try again.'` with the real text, inlined:

   ```ts
   return {
     ok: false,
     error: 'The token list changed while saving — please try again',
     reason: 'conflict',
   };
   // ...
   const conflict: TokenMutationError = {
     ok: false,
     error: 'The token list changed while saving — please try again',
   };
   ```

   Inline, not imported: `vi.mock('$lib/server/tokens', ...)` replaces the module, so
   `TOKEN_CONFLICT_ERROR` can't be imported there. Its sibling `'Token already exists'` is already
   the verbatim real string — this makes the pair honest.
2. **Rebase the native-page hunks onto the parseSnapshot split**: type the cast in `parseSnapshot`
   (`as TokenSnapshot | TokenMutationError | null` at line 80) rather than in `applySnapshot`, and
   apply the `LoginResponse | null` cast plus the union-narrowed error read
   (`(data && !data.ok ? data.error : null) ?? 'Sign in failed.'`) in `login()`.

Everything else ports as-is: `TokenSnapshot` (with `invites: ReturnType<typeof buildInvites>` — not
the console's `Invite`, which carries `usage`) and `TokenMutationError` exported from
`tokens/+server.ts` with `snapshot()`/`mutationError()` bound via typed payload / `satisfies`;
`LoginResponse` exported from `login/+server.ts` with both bodies `satisfies`-bound; the 5-test
`wire.integration.test.ts`. Type-only imports of `+server` modules into the native page erase at
build, so the native static bundle stays server-free. Response shapes are unchanged, so no `api`
skill update is needed; run `npm run test:api:smoke` anyway per the server-api rule.

## Suggested next step

Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with a brief that says: port the draft
patch onto HEAD around the parseSnapshot/stringField drift, and inline the real
`TOKEN_CONFLICT_ERROR` text in the wire test's mock and expectation.
