# Handoff — issue-burndown-jul22

> 2026-07-22 · branch `feat/issue-burndown` · Burn down issues #457–#463 (filed 2026-07-22) as one
> draft PR, one commit-and-PR-comment per issue, subagent implement/review loop

## Objective & non-goals

Work through the seven issues filed 2026-07-22 (#457–#463) sequentially on this branch, in the order
below, as a single draft PR. For each issue: implement in a subagent, review with a second subagent,
iterate until the review passes, run the relevant checks, commit, push, and post a thorough PR
comment describing what changed. When all seven are done (or explicitly deferred), give the PR its
final title and body summarizing everything.

Non-goals:

* Do **not** touch #443 beyond the pre-flight close (already fixed on main, see below).
* Do **not** trim the 37 MB coloring-art precache (#462 explicitly keeps the manifest intact).
* Do **not** lazy-load the crayon/magic brush modules (#461 explicitly declines this).
* Do **not** attempt the pre-hydration stroke buffer (#460 explicitly defers it).
* The crayon-prototype issues (#424–#426) and #430/#446 are separate work — leave them alone.

## Startup sequence (do this first, in order)

1. Consume this handoff: `git rm docs/handoff/issue-burndown-jul22.md`, commit
   (`Consume issue-burndown handoff`), push `feat/issue-burndown`.
2. Open a **draft PR** from `feat/issue-burndown` → `main` (that deletion commit is the PR's first
   commit). Placeholder title is fine — e.g. `Draft: burn down 2026-07-22 issue batch` — the real
   title/body come at the end. Body should list the seven issues as a checklist (escape any
   `#`-number that is *not* a deliberate reference, per root `CLAUDE.md`; these seven references are
   deliberate, so leave them linked).
3. Pre-flight: close **#443** with a comment — `npm audit --audit-level=critical` exits 0 on current
   main; the fix (`"tar": "^7.5.19"` override, `package.json:291`) landed via the dependency-routine
   merges on 2026-07-21/22. Verify the exit code yourself before commenting.

## Issue order (and why)

Small-and-isolated first to bank green commits, the two boot-path companions in dependency order,
the PWA change after them, tests next, CSP last because its verification sweep must cover the app
*after* every other change has landed.

| Order | Issue | What                                                                    | Sizing / risk                                                         |
| ----- | ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | #463  | Server-side `handleError` hook in `web/src/hooks.server.ts`             | Small, isolated                                                       |
| 2     | #459  | `[[headers]]` rule for `/_app/immutable/*` in root `netlify.toml`       | Tiny; full verification needs a deploy                                |
| 3     | #461  | Dynamic-import export/screenshot modules + modulepreload guard test     | Medium                                                                |
| 4     | #460  | Pre-hydration engine init ("adopt" contract) + **new ADR**              | Largest, riskiest; builds on the slimmer critical path from \#3       |
| 5     | #462  | Defer SW registration behind stroke-count + idle gate                   | Medium; reworks `updates.ts` lifecycle, touches same boot area as \#4 |
| 6     | #458  | axe-core Playwright a11y checks for `/admin`, `/privacy`, Parent Center | Independent; new devDependency + violation fixes                      |
| 7     | #457  | CSP report-only → enforcing                                             | Do last: manual sweep must run against the final state of the branch  |

(The `\#N` escapes in the table refer to *rows of this table*, not issues — keep that distinction
when writing PR comments.)

## Per-issue loop (repeat for each row)

1. **Implement** in a subagent (`general-purpose`). Give it: the full issue body (fetch it fresh via
   the GitHub MCP tools — the "Done when" criteria are the spec), the relevant skill(s) to read
   first (see Reread first), and the repo conventions (no comments, TypeScript, Svelte 5 runes only,
   deps-split rule from ADR-0070 — #458's `@axe-core/playwright` goes in `devDependencies`; anything
   the Netlify build imports goes in `dependencies`).
2. **Review** with a second subagent: give it the diff (`git diff main...HEAD` scoped to this
   issue's commit-to-be), the issue body, and ask it to verify each "Done when" item, hunt for bugs,
   and check convention compliance. If it finds real problems, send them back to an implement pass.
   Repeat until clean.
3. **Verify** locally: `npm run check` always; `npm run test:unit` when unit-testable code changed;
   `npm run test:e2e` for #458/#460/#461/#462 (or targeted specs); `npm run
   format:check` if
   Markdown was written outside the edit hook; `npm run perf:mount` for #460/#461/#462 against
   baseline `perf-profiles/2026-07-21T22-59-50-192Z-mount-phone-4x` (container numbers are for
   shape, not absolutes — say so in the PR comment).
4. **Commit** (one commit per issue, message references the issue, e.g.
   `Add server-side
   handleError hook (#463)`), **push** with
   `git push -u origin feat/issue-burndown` (retry 4× with backoff on network failure only).
5. **PR comment**: what changed and why, files touched, checks run + results, anything deferred or
   unverifiable in the container (e.g. #459's deploy-header check), and the issue's remaining "Done
   when" items if any. Tick the PR-body checklist item.
6. If an issue turns out to be blocked or wrong-headed on inspection, comment on the *issue* with
   findings, skip it, and note the skip in the PR body — don't stall the loop.

## Wrap-up

* Final PR title + body: summarize all changes, link each issue ("fixes #463" style only for the
  ones actually fully resolved; #459 and #457 may only be *advanced* if deploy verification is
  pending — link with "refs" instead). Keep it a draft; the user flips it ready.
* #460 requires a committed ADR (`/create-adr`) amending ADR-0004's mount contract — that ADR is
  part of #460's commit, not an afterthought.
* #458's "Done when" includes documenting the a11y tier in the `testing` skill — edit
  `.ruler/skills/testing/SKILL.md` (never the generated copies) and run `npm run ruler:apply`.
* UI-visible changes are unlikely in this batch, but if any commit changes something visible, follow
  the `pr-screenshots` skill for the PR body.
* Consider `/update-adrs` at the end — #460 definitely, #462 possibly (SW registration timing).

## Decisions made (and why)

* **#443 excluded from the PR** — fix already on main (verified, see Done & verified); it just needs
  closing, not code.
* **Order puts #457 last** — flipping CSP to enforcing requires sweeping the *final* app surface;
  doing it earlier would invalidate the sweep when #460/#462 change boot behavior. If a clean sweep
  can't be completed in-session, ship the `report-to` receiver + sweep notes and leave the enforcing
  flip as a follow-up comment on #457 rather than flipping blind.
* **#461 before #460** — both touch the boot path; #461 is mechanical and shrinks the module graph
  #460's early-init module joins. Landing the mechanical one first keeps #460's diff reviewable.
* **One branch, one draft PR, commit-per-issue** — per the user's instruction; PR comments are the
  per-issue record.

## Unverified assumptions

* The container can run `npm run test:e2e` and `npm run perf:mount` (Playwright + preinstalled
  Chromium at `/opt/pw-browsers/chromium`). Not yet run in this session.
* `perf-profiles/2026-07-21T22-59-50-192Z-mount-phone-4x` exists in the repo as the baseline the
  perf issues reference. Not checked.
* Netlify preview mode is **restricted** (per session-start hook, as of 2026-07-09): a plain
  `feat/*` push gets **no** branch deploy, so #459's header verification and any live preview need
  the `feature/*` fork trick from the hook, or must be deferred to the user.
* The seven issue bodies haven't changed since 2026-07-22T03:01Z — refetch each before implementing.

## Done & verified

* `npm audit --audit-level=critical` → exit 0 on `origin/main` (3b67577), 2026-07-22. Basis for
  closing #443.
* `feat/issue-burndown` created from `origin/main` @ 3b67577; no code changes yet besides this
  handoff.

## Risks & next 3 steps

Risks: #460 is an architectural change to boot sequencing (double-init under HMR / client-side nav
is the failure mode — its issue body lists the guards); #462 can silently break offline support if
`initPWAUpdates()` isn't correctly reworked for late registration; #457 flipped carelessly can break
the app for real users (report-only → enforcing is the one change here with production blast
radius).

Next 3 steps: (1) startup sequence above — consume handoff, open draft PR, close #443; (2) issue 1
of the loop (#463); (3) issue 2 (#459).

## Reread first

* Root `CLAUDE.md` — conventions, `#`-escaping rule for GitHub text, ruler rule
* `docs/ISSUE-WORKFLOW.md` — label glossary, close/won't-do flow (for #443 and any skips)
* `.claude/rules/server-api.md` + `api` skill — before #463 and #457's `/api/*` receiver
* `.claude/rules/svelte.md` + `architecture` skill — before #460/#461/#462
* `.claude/rules/testing.md` + `testing` skill — before #458, and for E2E commands generally
* `profiling` skill — before running `perf:mount` for #460–#462
* `adrs` skill + ADR-0004, ADR-0066, ADR-0070 — before #460 (mount contract, module-level undo
  history, deps split)
* `docs/CLOUD/Claude.md` — preview modes / network constraints (relevant to #459 verification)
* Issue bodies for #457–#463 — the spec; refetch fresh
