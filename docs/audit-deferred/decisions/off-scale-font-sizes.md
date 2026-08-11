# Off-scale hardcoded font sizes where the token scale is the convention

**Original finding:** [P4][Maintainability] — `web/src/lib/components/SettingsModal.svelte`,
`web/src/lib/components/settings/CompactShell.svelte`,
`web/src/lib/components/settings/SetupInstructions.svelte` — deferred because the verifier was
unavailable **Verdict:** DROP

## Context

The finding (pinned at 9ae62ff1) reported six raw pixel font sizes in files that otherwise use the
type-scale tokens: SettingsModal headings at `24px`/`20px` and a `15px` sidebar nav item,
CompactShell's segment label at `12.5px`, and SetupInstructions' `24px` chevron and `20px` check.
Three of the sizes (`15px`, `12.5px`, `24px`) sat off the then-seven-step scale entirely, so they
were ad-hoc forks of the type ramp, not token-name-forgotten slips. The proposed fix was to round
each onto the scale or give genuine one-offs a named local custom property with a WHY comment.

## Current state

Fully resolved by mainline work between the pinned commit and HEAD (0c1921a). Verified directly:

* Every `font-size` declaration in the three cited files reads a token — SettingsModal uses
  `--font-size-xl/lg/md/sm` (6 declarations), CompactShell `--font-size-lg/sm` (3),
  SetupInstructions `--font-size-xl/lg/sm` (6). No raw px or `font:` shorthand remains in any of
  them.
* `npm run lint:tokens` passes, and its `FONT_SIZE_BASELINE` in `scripts/lint-token-styles.mjs`
  lists only unrelated files (including BrandMark's tagline and AiImageResult's pictorial glyphs) —
  none of the cited files carry an allowance, so any raw `font-size` reintroduced there fails CI.
  The regression the finding worried about is ratchet-gated.
* The finding's premise is itself stale: it describes a seven-step scale (`--font-size-xs` 12px …
  `--font-size-3xl` 28px), but ADR-0098 consolidated the ramp to five steps (`xs/sm/md/lg/xl` =
  12/14/16/18/22px) plus `--font-size-display`. The audit-era `20px`/`24px` headings mapped onto
  that consolidated ramp as part of the same token-prune work.

The pinned commit 9ae62ff1 predates this clone's history horizon, so the exact migrating commit is
not recoverable here, but the current-state evidence above is complete on its own. Visual browser
verification was unavailable in this session; the token-lint gate is the enforcement mechanism and
it passes.

## Options considered

None needed — there is no remaining off-scale size to round, name, or allowlist. The only
conceivable action (re-auditing the tokenized choices for taste) is ordinary design review, not this
finding.

## Decision / lean

DROP. The problem no longer exists at HEAD, and the `lint:tokens` font-size ratchet — zero allowance
for these files — prevents its return. Nothing to implement.

## Why the previous attempt failed, and how this path avoids it

The burndown deferred this finding only because its verifier was unavailable — no reviewer objection
was ever recorded. The verification has now been done directly against HEAD (grep of the three
files, allowlist inspection, a passing `npm run lint:tokens` run), which is exactly what the missing
verifier would have established: resolved.
