# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

Deduplicated review of six `/session-audit` reports. The recurring cloud-session
Playwright-resolution problem (reported by four separate sessions) is merged into a
single finding, with the empirically-correct fix. Findings are ordered by impact.

Not filed (already resolved / already documented, verified this pass):

- **Chromium browser-version drift** (Session 5 & 6 passed on it too). `.claude/cloud/setup.sh`
  now derives the Playwright browser version from `package.json`'s `@playwright/test`
  (`^1.61.1`) instead of the old hard-coded `1.60.0`, and `driver.mjs` / `playwright.config.ts`
  self-heal past a stale snapshot. This closes the "#1 cloud-session E2E failure" class; no
  action needed.
- **`flushSync()` throws inside an effect** (Session 4, passed on by the reporter — one grep).
- **Orphaned `vite dev`** — already folded into `run-splotch/SKILL.md` during a prior session.

---

### [Tooling] The `profiling` skill's headless caveat only warns about *numbers* — `perf:web` is structurally blind to compositing/transparency/overlay bugs

**File(s):** `.claude/skills/profiling/SKILL.md` — "How capture works" section, the
"Headless + CPU throttle approximates a phone" bullet (line 60)

#### Problem

Cost: **slow → blocked** for the change class it governs · recurrence: standing (canvas
context-attribute changes are a recurring category in a drawing app).

A session validated the `desynchronized: true` canvas hint (ADR-0051) with the two tools the
profiling skill points at — `perf:web` (healthy: 59.5 FPS, `engine.draw` 0.5 ms avg) and the
canvas-readback E2E flows (all green) — declared it validated, and pushed. On a real Android
device it rendered the **entire canvas opaque black**: a `desynchronized` 2D canvas is promoted
to a hardware overlay plane that doesn't alpha-composite with the transparent paper/overlay
stack below it (ADR-0050). Headless Chromium in `perf:web` has no real display or overlay-plane
path, so it **structurally cannot observe** this bug class and gave a false green.

The skill *does* caveat headless capture — but only about **absolute frame numbers** ("want the
Android path"). Nothing signals that whole categories of bug (compositing, alpha/transparency,
overlay promotion, presentation latency, tearing) are **invisible**, not merely imprecise. The
next contributor changing a `getContext('2d', {...})` attribute (`alpha`, `desynchronized`,
`willReadFrequently`) or anything touching GPU compositing will validate with `perf:web` + E2E,
get a green, and ship the same false positive. ADR-0051 exists and records the specific
dead-end; this finding is the **general harness blind spot**, not a re-file of that ADR.

#### Proposed solution

Extend the headless caveat in `.claude/skills/profiling/SKILL.md` to name the invisible bug
classes and require on-device verification for compositing changes. After the existing bullet,
add:

```markdown
- **`perf:web` measures compute, not compositing/presentation.** It runs headless with no real
  display, overlay planes, or GPU compositor, so it **cannot** surface transparency/alpha bugs,
  overlay-promotion bugs, tearing, or finger-to-ink presentation latency — a passing run is
  *not* validation that the change renders correctly, and the E2E readback flows don't cover it
  either. Any change to a canvas **context attribute**
  (`getContext('2d', { alpha, desynchronized, willReadFrequently })`) or to GPU compositing
  **must be verified on a real Android device** (`perf:android`, or the `mobile` skill's
  `chrome://inspect` flow) before it counts as validated. (Learned the hard way: a
  `desynchronized` hint passed `perf:web` + E2E and rendered the transparent canvas black on
  Android — ADR-0051.)
```

#### Verification

A future session making a canvas context-attribute or compositing change reads the profiling
skill, sees `perf:web`'s green is compute-only, and verifies on-device (or explicitly flags the
change as unvalidated for compositing) instead of declaring success from `perf:web` + E2E — the
exact mistake ADR-0051 records.

---

### [Tooling] `svelte.md` doesn't warn that `onDestroy` (and component-init code outside `onMount`/`$effect`) runs during SSR

**File(s):** `.claude/rules/svelte.md`; latent instance at `web/src/lib/components/Slider.svelte:109`

#### Problem

Cost: **slow** (crash only surfaces as the layout ErrorScreen; needs a hand-started `vite dev`
with log capture to find the stack) · recurrence: medium (any component can later be mounted by
a prerendered route).

Svelte runs `onDestroy` — and all component-init code that isn't inside `onMount`/`$effect` —
**on the server** too. A component that assumes client-only mounting and touches
`window`/`document` in that code throws `ReferenceError: window is not defined` the moment a
prerendered route imports it. `Slider.svelte` is exactly this shape today:

```
web/src/lib/components/Slider.svelte:104   window.removeEventListener('pointermove', onPointerMove);
web/src/lib/components/Slider.svelte:109   onDestroy(removeWindowListeners);
```

It's currently safe only because Slider mounts client-side (Parent Center opens after a tap) —
no prerendered route imports it. That's latent, not fixed: the session that reported this hit a
real 500 when a prerendered `/components` catalog route imported a Slider-like component
(`onDestroy(removeWindowListeners)`). That `/components` route is **not in this branch**, so the
crash doesn't reproduce here — but the SSR-unsafe pattern in `Slider.svelte` is live and will
fire the day any prerendered/SSR'd route imports it.

#### Proposed solution

Add a bullet to `.claude/rules/svelte.md`:

```markdown
* **`onDestroy` (and all component-init code outside `onMount`/`$effect`) also runs during
  SSR.** `onMount` never runs on the server, but `onDestroy` does (the component is destroyed
  after server render). Guard `window`/`document` access with `typeof window === 'undefined'`
  early-return (or move it into `$effect` teardown, which never runs on the server). Components
  must be SSR-safe even if only mounted client-side today — a prerendered route renders every
  component it imports at build time (see `Slider.svelte`'s `onDestroy(removeWindowListeners)`
  window listeners).
```

Optionally, also make `Slider.svelte:104–106` SSR-safe now (guard `removeWindowListeners`), so
the latent bug is closed rather than merely documented — but the durable win is the rule.

#### Verification

Reproduce the class: add a temporary prerendered route that imports `Slider.svelte`, run
`npm run build`, and confirm it 500s with `window is not defined` from `removeWindowListeners`
during SSR. After guarding (`typeof window === 'undefined'` early-return, or `$effect` teardown)
the build prerenders cleanly. The rule bullet then steers the next component author to
SSR-safety before the crash.

---

### [Tooling] `svelte.md` doesn't warn that `$state` deep-proxies break identity (`===`) comparison

**File(s):** `.claude/rules/svelte.md`

#### Problem

Cost: **minor** but **invisible in code review** (needs an in-browser `evaluate` to spot) ·
recurrence: medium (any selection-among-constants UI).

`$state` deep-proxies objects and arrays, so a value stored in `$state` is **never** `===` the
raw object it was created from. Identity checks against a plain constant list silently fail —
e.g. radio chips driven by `checked={pickerViewport === vp}` never match because
`$state(PICKER_VIEWPORTS[0])` is a proxy and `vp` is a raw array entry. The markup looks correct;
the bug only shows as "nothing is ever selected." Fixed with `$state.raw(...)` or a key-field
comparison. This is documented Svelte 5 behavior, not a Splotch quirk, so it recurs wherever
selection state is compared by identity.

#### Proposed solution

Add a bullet to `.claude/rules/svelte.md`:

```markdown
* **`$state` deep-proxies objects and arrays** — a value stored in `$state` is never `===` the
  raw object it was created from, so identity checks against a plain constant list silently fail
  (e.g. `checked={selected === option}` never matches). For selection-among-constants state use
  `$state.raw(...)`, or compare by a key field instead of by identity.
```

#### Verification

In a scratch component, `let sel = $state(OPTIONS[0]); sel === OPTIONS[0]` evaluates `false`
(inspect via the browser or a Vitest+happy-dom check); switching to `$state.raw(OPTIONS[0])`
makes it `true`. A radio group bound with `checked={sel === opt}` visibly selects nothing under
`$state` and selects correctly under `$state.raw`.

---

### [Tooling] No documented single-spec E2E run for ad-hoc cloud validation

**File(s):** `.claude/skills/run-splotch/SKILL.md` (Troubleshooting table) or
`.claude/skills/testing` — wherever the E2E run commands live

#### Problem

Cost: **minor** · recurrence: medium (targeted validation of one change is common in cloud
sessions).

Validating one change often means running a single E2E spec, but the skills only point at
`npm run test:e2e`, which runs the **whole** suite. Reaching for the raw Playwright CLI from the
repo root fails, because `playwright.config.ts` (with `baseURL`) lives in `web/`, not the repo
root (verified: `web/playwright.config.ts:6,43`). A session hit:

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  navigating to "/", waiting until "load"   (baseURL was empty)
```

Note the reconciliation between the two reports: Session 5 recovered with
`cd web && npx playwright test <spec> -g "<title>"`, but Session 6 separately found that bare
`npx playwright test` from the wrong cwd **also** loses the `scripts/web.mjs` Chromium fallback
(cryptic `chrome-headless-shell` error in cloud). The robust, documented, cross-platform path is
the existing npm script with an arg filter — `node scripts/web.mjs` already sets `cwd = web/`
(config + baseURL) and the Chromium fallback. So the fix is to **document the single-spec filter
through the npm script**, not to steer people to raw `npx` from `web/`.

#### Proposed solution

Confirm `test:e2e` forwards trailing args to Playwright (`test:e2e => node scripts/web.mjs
playwright test`, so `npm run test:e2e -- <spec> -g "<title>"` should pass through), then
document it. Add a Troubleshooting row to `run-splotch/SKILL.md` (or a line in the testing
skill):

```markdown
| Want one spec, not the whole suite / `Cannot navigate to invalid URL` from raw `npx playwright test` | The config + `baseURL` live in `web/`, and raw `npx` from the repo root also loses the Chromium fallback. Filter through the npm script instead: `npm run test:e2e -- flows.spec.ts -g "<title>"` — `scripts/web.mjs` sets the `web/` cwd and Chromium path for you. |
```

If `test:e2e` turns out **not** to forward `--` args, that arg-passthrough is the small fix to
make first (it's the reusable primitive), then document it.

#### Verification

`npm run test:e2e -- flows.spec.ts -g "<a real test title>"` runs exactly that one spec, green,
from the repo root with no empty-`baseURL` navigation error and no `chrome-headless-shell`
failure — first try, without `cd web` or raw `npx`.

---

### [Docs] `contain` doesn't create a fixed-position containing block in WebKit — and only Chromium is testable in cloud sessions

**File(s):** `docs/COMPATIBILITY.md` (API risk register); optionally `docs/CLOUD.md`

#### Problem

Cost: **slow** (shipped breakage + a full feedback round-trip) · recurrence: low–medium
(engine-divergent CSS is untestable in the sandbox, so it slips through).

A session used `contain: layout` to re-anchor `position: fixed` chrome into a bounded stage.
Chromium honors it; **WebKit does not implement containment as a containing block for
`position: fixed` descendants** (long-standing bug), so the fixed elements escaped to the real
viewport for Safari/iOS users and the breakage shipped. The sandbox can't catch this: only
Playwright's **Chromium** is installed in cloud sessions (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`,
no WebKit/Firefox), and the risk register had no entry for it. The portable mechanism is a
`transform` on the ancestor — any non-`none` transform creates a fixed-position containing block
in **every** engine.

The specific offending route (`/components`) is **not in this branch**, so there's no live
`contain`-on-fixed usage to cite here — this is a durable platform gotcha + a testability gap,
filed so the register catches the *next* use.

#### Proposed solution

Add a row to the API risk register in `docs/COMPATIBILITY.md` (no source-file citation, since
there's no current usage — state the rule and the portable mechanism):

```markdown
| CSS `contain` / `container-type` as a *fixed-position containing block* | (avoid — use `transform` instead) | Chromium honors it; **WebKit does not** implement containment as a containing block for `position: fixed` descendants (long-standing bug) | ⚠️ not testable in cloud (Chromium-only sandbox) | never rely on `contain` to trap `position: fixed`; a transformed ancestor (`transform: translate(0)`) is the portable, all-engine mechanism |
```

Optionally add one line to the `docs/CLOUD.md` environment section:

```markdown
Only Playwright's **Chromium** is installed in a cloud session (no WebKit/Firefox), so
engine-divergent CSS (containment as a containing block, top-layer, `:has` edge cases) can't be
tested here — check the `docs/COMPATIBILITY.md` risk register instead of assuming a local pass
covers Safari.
```

#### Verification

The register row exists and names the portable `transform` mechanism. A future session reaching
for `contain` to trap a fixed element finds the entry, uses `transform` instead, and — lacking
WebKit in the sandbox — knows to flag it for on-Safari review rather than trusting a Chromium
green.

---

### [Docs] Whether `/fix-audits` and `/vet-audits` log to `AUDIT-LOG.md` is contradictory and unstated in the skill files

**File(s):** `.claude/audit-conventions.md` (§2 + the "Consumers" note), `.claude/commands/fix-audits.md` (Completion section), `.claude/commands/vet-audits.md` (Output section)

#### Problem

Cost: **minor** · recurrence: high (every consumer run hits the same fork).

The convention is genuinely ambiguous about whether the consumer skills log a row. During a
`/fix-audits` run the agent reasoned "fix-audits is a consumer, not an audit producer, so skip
the `AUDIT-LOG.md` row" and finished without logging — a reasonable read of the contradiction:

- `.claude/audit-conventions.md` §2 says "After a run, add one row to `docs/AUDIT-LOG.md`" and
  the section intro says "§2 and §3 apply to all audits" — but the same file labels
  `/fix-audits` and `/vet-audits` as "**Consumers** … (not audits themselves)." A consumer that
  is "not an audit itself" reasonably reads itself out of "all audits."
- Neither skill file names the log step. Verified this pass: `.claude/commands/fix-audits.md`'s
  Completion section (steps 1–5) never mentions `AUDIT-LOG.md`, and `vet-audits.md`'s Output
  section doesn't either.

Yet established practice is that consumers **do** log: `docs/AUDIT-LOG.md` already contains
`fix-audits` rows (2026-07-07 PR #81, 2026-07-06) and `vet-audits` rows (2026-07-06, 2026-07-03).
So a sweep can go missing from the "history of **every** audit-skill run" the log claims to be.

#### Proposed solution

Resolve it in the two places that disagree, plus each skill's own checklist so it doesn't depend
on remembering a cross-referenced convention.

1. **`.claude/audit-conventions.md` §2** — append after the existing paragraph:

   ```markdown
   This includes the **consumer** skills (`/fix-audits`, `/vet-audits`): log the run
   (branch/PR for fix-audits, prune summary for vet-audits) even though they don't write
   findings into `docs/AUDIT.md`. "Not audits themselves" (see the Inventory) scopes §1 only —
   §2 applies to every run.
   ```

2. **`.claude/commands/fix-audits.md` — `## Completion`** — insert a step before the final
   "In your final response" step:

   ```markdown
   5. Add one row to `docs/AUDIT-LOG.md` for this run per `.claude/audit-conventions.md` §2
      (date · `fix-audits` · one-line summary with the PR link), committed and pushed with the
      completion changes.
   ```

3. **`.claude/commands/vet-audits.md`** — add an equivalent log step to its Output section
   (date · `vet-audits` · one-line prune summary), since it currently has none.

#### Verification

After the fix, `grep -n "AUDIT-LOG" .claude/commands/fix-audits.md` returns a Completion-step
line, `vet-audits.md` has its own, and §2 of `.claude/audit-conventions.md` names the consumer
skills explicitly — so the next `/fix-audits` or `/vet-audits` logs its row without re-deriving
whether "consumer" means "exempt from §2."
