# Dev/preview port numbers are magic values scattered across scripts and configs

**Original finding:** [P3][maintainability] — `package.json` scripts, `web/vite.config.ts`,
`web/netlify.toml`, `tools/*.mjs` — deferred because the implementer failed to deliver a fix round
against two review objections. **Verdict:** DROP

## Context

The finding: `5173` (vite dev), `8888` (netlify dev), and `4173` (vite preview) were restated across
`dev:kill`, the live-reload scripts, `adb:reverse`, `cloud-tunnel.mjs`, and the perf/screenshot
tooling with no single declaration, so moving the vite port would silently strand `dev:kill` and the
device-facing consumers. The rolled-back draft centralized all three in a new
`tools/lib/dev-ports.mjs` and rewrote every consumer (plus four new wrapper scripts) to import it.
The reviewer's unresolved objections: (1) `web/netlify.toml` still hard-coded `targetPort = 5173` —
TOML cannot import JS, so the centralized value needs a drift-guard test, not prose; (2)
`.ruler/skills/mobile/android.md` still named `web/vite.config.ts` as the source of truth, which the
draft's module had displaced.

## Current state

Verified at HEAD b4abd2264d06612375ce3b408f5bc13b535c97c0 — the core of the finding was resolved
independently by the PR \#805 audit-backlog burndown (merged 2026-08-06 as 548d37ccea95), which took
the drift-guard route instead of the module route:

* `tools/tests/dev-ports.test.mjs` (8 tests, in `test:scripts`, in CI, passing) reads
  `web/vite.config.ts`, `web/netlify.toml`, and `package.json` and asserts every executable consumer
  of the vite dev port agrees: netlify `[dev].targetPort`, `cloud-tunnel.mjs`,
  `android-emulator.mjs`, `ios:live`, and both sides of `adb:reverse`; that `dev:kill`'s port list
  equals exactly {vite port, netlify port}; and that the `scripts-info` description of `dev:kill`
  names the ports it kills.
* `web/vite.config.ts` and `web/netlify.toml` each carry a comment naming the enforcing spec — the
  root convention's exact pattern for agreeing sites that cannot share code.
* The finding's verification scenario ("change the vite dev port … today the kill misses the new
  port") can no longer land silently: the guard fails in CI on any one-sided edit.
* The finding's "at minimum" fallback (document the port mapping in `scripts-info`) is implemented
  and test-enforced.

What the guard deliberately leaves out is the `4173` preview port (`tools/perf/serve.mjs`,
`tools/perf/args.mjs`, `tools/e2e-tuning/e2e-sweep.mjs`, `tools/app-driver/driver-smoke.mjs`,
`tools/app-driver/gen-large-image.mjs`, `tools/app-driver/store-shots.mjs`,
`web/playwright.shared.ts`). Every one of those scripts spawns its own preview server from the same
constant it then connects to — self-consistent within one file by construction, so no cross-file
agreement is required for correctness: two of them on different ports would both still work.
`web/playwright.shared.ts` goes further and resolves the port at runtime from `SPLOTCH_E2E_PORT`
precisely so concurrent worktrees pick *different* ports (the root concurrent-worktrees convention);
a shared must-agree constant would misstate that relationship. The `4173` literals in
`tools/tests/*.test.mjs` are the convention's explicit exception ("tests deliberately excepted").

The draft patch no longer applies — 14 of its 15 files conflict at HEAD. Its structure is also
superseded: its `perf-serve.mjs` wrapper exists differently as `tools/perf/serve.mjs` (with LAN URL
filtering), `playwright.shared.ts` gained the runtime port resolver, and its `dev-kill.mjs` wrapper
overlaps a separate still-open deferred finding about `dev:kill`'s bare `npx kill-port`, which stays
untouched here.

## Options considered

1. **Accept the drift-guard resolution at HEAD as complete** — the failure mode the finding named is
   CI-enforced; the remaining `4173` restatements have no shared server to disagree about.
2. **Re-land `tools/lib/dev-ports.mjs` on top of the guard.** Pure indirection now: the guard must
   stay regardless (netlify.toml still cannot import JS), so the module adds an import edge and four
   wrapper scripts without retiring a single test line — and it would make the mobile-skill docs
   objection real again by displacing `web/vite.config.ts` as the stated source of truth.
3. **Extend the guard to pin all `4173` sites to one value.** Asserts an agreement that is not a
   correctness requirement, and fights the worktree convention that wants preview ports to diverge.

## Decision / lean

DROP (option 1). The finding's premise no longer holds at HEAD: the ports whose agreement is
load-bearing are drift-guarded in CI, the config sites name their enforcing spec, and the
`scripts-info` mapping is test-enforced. What remains uncentralized (`4173`) is a set of
independently self-consistent per-script defaults, not a cross-file agreement — centralizing it
fails the repo's own bar of enforcing only agreements that must hold.

## Why the previous attempt failed, and how this path avoids it

* Objection 1 (netlify.toml needs a drift guard, not prose) — satisfied at HEAD in exactly the form
  demanded: `tools/tests/dev-ports.test.mjs` reads both sides, in the pattern of
  `tools/android/tests/android-config.test.mjs`.
* Objection 2 (`.ruler/skills/mobile/android.md` must point at the new source of truth) — moot under
  the adopted resolution: `dev-ports.mjs` was never created, so `web/vite.config.ts` *is* the source
  of truth, and the skill's statement that the port "is pinned to 5173 in `web/vite.config.ts`" is
  accurate — now guaranteed by the guard rather than by convention.
