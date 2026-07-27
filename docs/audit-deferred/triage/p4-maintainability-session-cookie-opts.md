# Session cookie name, scope, and 10-year max-age are scattered inline

**Priority/category:** P4 maintainability · **Cluster:** C08 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/admin/+page.server.ts:28-38, 107` — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**DROP — the finding overstates what was scattered, and the one real hazard is already
behavior-guarded by tests.** What remains is a two-literal cosmetic nit below the cost of staging,
verifying, and reviewing a change.

## Original finding (condensed)

`SESSION_COOKIE` and `SESSION_MAX_AGE` are named, but the cookie options (`path: '/admin'`,
`httpOnly`, `sameSite: 'strict'`) are spelled out at the set site, with `path: '/admin'`
independently repeated at the delete site. If the scope changes, set and delete must stay in
lockstep by hand or logout silently fails (a delete with a mismatched path is a no-op). Proposed: a
`SESSION_COOKIE_OPTS` constant shared by both.

## Why it was deferred

"Verifier gave no usable brief" — no implementation was attempted and no reviewer objections exist.

## Current state of the code

Already substantially the shape the finding asks for — and it was at the pinned SHA too:

* The option bundle is *not* scattered: it lives in exactly one place, the `setSession(cookies)`
  helper (`web/src/routes/admin/+page.server.ts:27-34`), which both writers (the `login` action and
  the sliding renewal in the authed loader) call. The pinned version had the identical helper; the
  finding's ":32-37 set site" *is* `setSession`'s body.
* The sole residual duplication is the `path: '/admin'` literal appearing twice: inside `setSession`
  (line 29) and at the `logout` delete (line 119).
* The lockstep hazard is covered by behavior tests: `web/tests/admin.spec.ts` signs out and asserts
  the Sign in heading returns (lines 50-51 and 70-71). A delete whose path stopped matching the set
  path would leave the cookie live, the 303 back to `/admin` would render the authed console, and
  both tests would fail — exactly the "logout silently fails to clear" failure mode the finding
  warns about, made non-silent.

## Recommendation

Drop it. The finding's substantive ask — one definition of the option bundle, writers sharing it —
is already how the code reads, and the remaining exposure (someone edits the path in one of two
places) is caught by the existing logout E2E rather than shipping silently. A dedicated audit issue,
branch, and review cycle to introduce

```ts
const SESSION_COOKIE_PATH = '/admin';
```

referenced from `setSession` and `cookies.delete` is more process than payoff for a P4 on the admin
console. If anyone touches `+page.server.ts` for other reasons, folding that three-line constant in
as a ride-along is fine and mildly positive — it just does not merit its own work item.

## Suggested next step

Dropped — nothing to do. (Optional ride-along on the next `+page.server.ts` change: hoist the
`'/admin'` path literal into a shared constant used by `setSession` and the logout delete.)
