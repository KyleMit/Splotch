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
