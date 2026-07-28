# Copy-pasted CLI `flag()` parser in every perf entry script

**Original finding:** [P1][duplication] — `scripts/perf/scenario.mjs`, `scripts/perf/mount.mjs`,
`scripts/perf/ios.mjs`, `scripts/perf/undo-scenarios.mjs`, `scripts/perf/replay-scenario.mjs`
(module-scope arg parsing, pinned at f934d43) — deferred because the implementer failed to deliver a
fix round against the reviewer's objection. **Verdict:** FIX

## Context

The five perf entry scripts each define the identical 4-line helper at module scope:

```js
const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
```

and then each re-derives the common flags by hand — `--device`, `--throttle`/`--no-throttle`,
`--port`, `--no-build` — with deliberate per-script differences (throttle defaults to `4` in
scenario/mount/undo but `0` in replay; ios takes no throttle at all). Any change to arg handling
(bare `--throttle` without `=`, a typo'd-flag warning) needs five edits.

The burndown draft (kept at
`docs/audit-deferred/p1-duplication-extract-the-copy-pasted-cli-flag-args-parser-shared-by-ev.patch`)
moved only the raw lookup into `scripts/perf/args.mjs` as `flag(argv, name, def)`.

Reviewer's unresolved objection, verbatim in substance:

> `scripts/perf/args.mjs` only centralizes value lookup; the entry scripts still duplicate
> `process.argv.slice(2)` and the common `--no-throttle`, `--no-build`, `--device`, `--throttle`,
> and `--port` derivations. Move these into a shared `parsePerfArgs` result while preserving each
> script's throttle default and optional flags, so common parsing changes and unknown-flag
> validation no longer require edits across every entry point.

## Current state

Verified at HEAD — the finding is **partially fixed since f934d43**, by commit e093621:

* `scripts/perf/args.mjs` now exists, exporting `resolveThrottle(args, defaultRate)` — the throttle
  derivation (including `--no-throttle` and the `tag`/`forSettings` shape) is already centralized,
  with per-script defaults passed in (`4` in scenario/mount/undo, `0` in replay, absent in ios).
* `scripts/perf/devices.mjs` now centralizes the `DEVICES` map and `resolveDevice(name)`.

Still duplicated at HEAD:

* The 4-line `flag()` helper — **5 identical copies** (`scenario.mjs:21`, `mount.mjs:36`,
  `ios.mjs:22`, `undo-scenarios.mjs:44`, `replay-scenario.mjs:33`).
* `const args = process.argv.slice(2)` — 6 copies (the five above plus `android.mjs:28`).
* `const port = Number(flag('port', '4173'))` — 5 copies.
* `const build = !args.includes('--no-build')` — 6 copies (incl. `android.mjs`).
* `const deviceName = flag('device', 'phone')` + `resolveDevice(deviceName)` — 3 copies (scenario,
  mount, ios).

So the problem is real but smaller than when filed: the drift-prone derivations the finding cited as
"drift already visible" (throttle, device map) are the part that already got fixed. What's left is
mechanical copy-paste with no divergence risk beyond the copies themselves. The draft patch no
longer applies cleanly (its context predates the `resolveThrottle` imports).

**A constraint that shapes the fix:** the entry modules are dual-use.
`scripts/tests/perf-cli-inputs.test.mjs` imports `replay-scenario.mjs` and
`scripts/tests/undo-scenarios.test.mjs` imports `undo-scenarios.mjs` as libraries under vitest, so
their module-scope parsing executes against the **vitest worker's argv**, which contains flags and
positionals these scripts never declared. Any parsing that throws on unknown input at module scope
would crash the test suite on import.

## Perf-local module vs sharing with the gate scripts

The sibling decision ([check-flag-parsing.md](check-flag-parsing.md)) settled the repo-wide
question: the shared unit is the **primitive/convention, not a physical module** — gate scripts and
asset-gen call `node:util` `parseArgs` inline, and it explicitly leaves the internals of the perf
module to this doc ("nothing here depends on its choice").

This doc's call: **keep a perf-local `scripts/perf/args.mjs`; do not create
`scripts/lib/args.mjs`.**

* The gate scripts share only the *literal string* `--check` — one boolean per script, no defaults,
  no shared vocabulary. The perf scripts share a real **domain flag vocabulary with defaults**
  (`device=phone`, `port=4173`, throttle semantics, `--no-build`). Centralizing a vocabulary is a
  module concern; parsing one boolean is not.
* HEAD already established the perf-local precedent (`args.mjs`, `devices.mjs`, `paths.mjs`,
  `warnings.mjs` all live in `scripts/perf/`). `scripts/lib/` is for genuinely cross-cutting glue,
  and is itself the subject of the "grab-bag" finding ([utils-grab-bag.md](utils-grab-bag.md)) —
  growing it with a parser only the perf tree uses moves in the wrong direction.
* And the perf module **cannot** be strict-`parseArgs`-based anyway (see the import constraint
  above), so a shared module would force the gate scripts off the stdlib convention the sibling doc
  just adopted. Different constraints, different implementations, cleanly separated.

## Options considered

### Option A — fuller `parsePerfArgs()` in the existing `scripts/perf/args.mjs` (winner)

One function returning the common derivations plus escape hatches for script-specific flags:
`parsePerfArgs(spec, argv = process.argv.slice(2))` →
`{ flag, has, deviceName, device, throttle?,
port, build }`. Per-script variation is expressed in
the spec: `throttleDefault: 4 | 0 | omitted`, `extra: [...]` naming the script's own flags,
`entry: isMain(import.meta.url)` gating a warn-only unknown-flag report.

* Pros: answers the reviewer's objection exactly (common derivations live in one place; per-script
  throttle defaults and optional flags preserved as explicit spec parameters); the known-flag set is
  assembled in one function, so unknown-flag validation is a one-place change; tolerant lookup keeps
  the modules import-safe for the vitest suites; each entry script's parsing block collapses to one
  call.
* Cons: five scripts consume different subsets, so some returned fields go unused (undo/replay
  ignore `device`) — mild, side-effect-free over-return, not over-abstraction: nothing is computed
  that costs anything, and no script is forced through behavior it doesn't want.

### Option B — continue the composable-helper direction only

Move `flag(argv, name, def)` into `args.mjs` (the draft), add `resolvePort(argv)` and
`resolveBuild(argv)` beside `resolveThrottle`.

* Pros: smallest diff; pure continuation of what e093621 started; zero unused returns.
* Cons: each entry still enumerates the commons line-by-line (as one-liner calls), and — decisive —
  **no single place ever sees the full set of a script's known flags**, so the reviewer's
  unknown-flag-validation point stays structurally unanswerable. This is the shape the review
  already rejected once, lightly upgraded; choosing it re-litigates the review.

### Option C — strict `node:util` `parseArgs`, per the new repo convention

* Pros: stdlib, zero custom code, strict typo rejection, matches the gate-script/asset-gen
  convention.
* Cons: **unsafe here.** Parsing happens at module scope, and these modules are imported by
  `perf-cli-inputs.test.mjs` / `undo-scenarios.test.mjs` under vitest, where `process.argv` carries
  vitest's own flags and positionals — `strict: true` throws on import and kills the suite.
  `strict: false` forfeits exactly the benefits that justify the switch, and changes edge behavior
  (bare `--throttle` becomes boolean `true` → `Number(true) === 1` instead of falling back to the
  default). Restructuring all five scripts to parse lazily inside their `run*()` functions would fix
  the import problem but is a much larger churn (undo-scenarios uses `HZ`/`LONG_OPS`/`STROKES` at
  module scope to build scenario tables). Rejected; the sibling doc's convention explicitly does not
  bind this module's internals.

### Option D — DROP

* Pros: the worst of the drift (throttle, device map) was already centralized by e093621; what's
  left is copy-paste with low divergence risk.
* Cons: five byte-identical helper copies is exactly the mechanical duplication the repo's own
  audits exist to remove, the fix is small and low-risk, and the finding's remaining wish (typo'd
  flag warning — a real footgun when a typo silently wastes a multi-minute profiled run) is only
  reachable through centralization. Cost/benefit still positive. Not chosen — though the residual
  severity is closer to P2 than the filed P1.

## Decision / lean

**FIX — Option A.** Extend the existing `scripts/perf/args.mjs` with `parsePerfArgs`; migrate the
five entry scripts. Exact scope:

1. `scripts/perf/args.mjs` — add `parsePerfArgs` (sketch below). `resolveThrottle` stays (called
   internally; its export can remain for direct use).
2. `scripts/perf/scenario.mjs`, `mount.mjs` — `parsePerfArgs({ throttleDefault: 4, entry: … })`;
   destructure `deviceName, device, throttle, port, build`.
3. `scripts/perf/ios.mjs` — `parsePerfArgs({ entry: … })` (no `throttleDefault` → no `throttle` key,
   and `--throttle`/`--no-throttle` are *not* in ios's known set, so a user passing them gets the
   new warning instead of today's silent ignore — an improvement that matches the documented flag
   surface).
4. `scripts/perf/undo-scenarios.mjs` —
   `parsePerfArgs({ throttleDefault: 4, extra:
   ['cold-tier-timeout-ms', 'hz', 'long-seconds', 'long-ops', 'multi-seconds', 'strokes',
   'scenarios'], entry: … })`;
   keep reading those extras through the returned `flag`.
5. `scripts/perf/replay-scenario.mjs` —
   `parsePerfArgs({ throttleDefault: 0, extra: ['recording',
   'turbo'], entry: … })`;
   `recordingPath` via returned `flag`, `turbo` via returned `has`.
6. New focused test `scripts/tests/perf-args.test.mjs` (~5 cases, argv passed explicitly): defaults;
   `--device=`/`--port=` overrides; `--no-throttle` beats `--throttle=`; omitted `throttleDefault`
   yields no throttle; unknown-flag warning fires only with `entry: true`. Bounded — this locks the
   shared seam, not every consumer.

Out of scope, deliberately:

* `scripts/perf/android.mjs` — it has **no** `flag()` copy (only `--no-build`), was not in the
  finding's file list, and adopting `parsePerfArgs` there would falsely advertise
  `--device`/`--port` as known flags it doesn't honor.
* Making the unknown-flag report **fatal**. Warn-only preserves today's behavior for any stray flag
  a workflow might pass; upgrading to a hard error later is a one-line change in exactly one place —
  which is the point of this fix.
* Per-script pruning of *common* flags from the known set (e.g. `--device` is accepted-but-unused by
  undo/replay, same as today). Solvable later inside `parsePerfArgs` alone if it ever matters.

Behavior is otherwise byte-identical: same lookup semantics (`--name=` prefix match, first hit,
default fallback), same defaults, same throttle objects from the unchanged `resolveThrottle`.

## Why the previous attempt failed, and how this path avoids it

The one unresolved objection decomposes into three demands, each answered structurally:

1. *"Entry scripts still duplicate `process.argv.slice(2)` and the common derivations."* →
   `parsePerfArgs` defaults `argv = process.argv.slice(2)` and returns `deviceName`, `device`,
   `throttle`, `port`, `build` computed once, in one file. The entry scripts' parsing blocks become
   a single call + destructure; the grep for `const flag = (name, def)` in `scripts/perf/` goes to
   zero.
2. *"…while preserving each script's throttle default and optional flags."* → the defaults are
   explicit spec parameters (`throttleDefault: 4` vs `0` vs omitted for ios), and script-specific
   flags stay per-script via the returned `flag`/`has` — no lowest-common-denominator flattening.
3. *"…so common parsing changes and unknown-flag validation no longer require edits across every
   entry point."* → the known-flag set (commons + conditional throttle pair + declared extras) is
   assembled inside `parsePerfArgs`; the warn-only report ships with this change, gated to
   direct-entry execution so library imports under vitest stay silent and safe.

The failed draft died because it centralized the 4-line lookup while leaving every derivation in
place — the reviewer's ask was legitimate, not scope creep, and Option A is that ask implemented
with the two repo-specific constraints (import-safe module-scope parsing; per-script defaults as
spec, not forks) made explicit.

## Implementation sketch

```js
// scripts/perf/args.mjs
import { resolveDevice } from './devices.mjs';

export const resolveThrottle = (args, defaultRate) => {
  /* unchanged from HEAD */
};

const COMMON_FLAGS = ['device', 'port', 'no-build'];

export function parsePerfArgs(
  { throttleDefault, extra = [], entry = false } = {},
  argv = process.argv.slice(2),
) {
  const flag = (name, def) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
  };
  const has = (name) => argv.includes(`--${name}`);

  if (entry) {
    const known = new Set([
      ...COMMON_FLAGS,
      ...(throttleDefault === undefined ? [] : ['throttle', 'no-throttle']),
      ...extra,
    ]);
    for (const arg of argv) {
      const name = /^--([^=]+)/.exec(arg)?.[1];
      if (name && !known.has(name)) {
        console.warn(`Unknown flag ${arg} — known flags: ${[...known].sort().join(', ')}`);
      }
    }
  }

  const deviceName = flag('device', 'phone');
  return {
    flag,
    has,
    deviceName,
    device: resolveDevice(deviceName),
    throttle: throttleDefault === undefined ? undefined : resolveThrottle(argv, throttleDefault),
    port: Number(flag('port', '4173')),
    build: !has('no-build'),
  };
}
```

```js
// scripts/perf/scenario.mjs (consumer shape; mount.mjs identical, ios drops throttleDefault)
import { isMain, runMain /* … */ } from '../lib/utils.mjs';
import { parsePerfArgs } from './args.mjs';

const { deviceName, device, throttle, port, build } = parsePerfArgs({
  throttleDefault: 4,
  entry: isMain(import.meta.url),
});
```

Verification: `grep -rn "const flag = (name, def)" scripts/perf` → empty;
`grep -rn "process.argv.slice(2)" scripts/perf` → only `args.mjs` (and `android.mjs`, out of scope);
`npm run perf:web -- --no-build --device=tablet` and
`npm run perf:undo -- --scenarios=mixed --no-throttle --no-build` behave identically;
`npm run test:scripts` green (proves the vitest imports of `replay-scenario.mjs` /
`undo-scenarios.mjs` still load cleanly and `expectCliFailure`'s exact-stderr assertions still
hold).
