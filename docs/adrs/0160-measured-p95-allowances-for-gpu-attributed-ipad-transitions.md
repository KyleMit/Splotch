# ADR-0160: Measured P95 Allowances for GPU-Attributed iPad Safari Transitions

**Status:** Active — amends
[ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md),
[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md), and
[ADR-0137](0137-lost-frame-gate-exceptions.md) **Date:** 2026-09

## Context

The complete four-mode physical iPad Safari control at e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3
(`perf-profiles/evidence/2026-09-05-epic-1567-ipad-e514-control/`, issue #1686) holds eleven action
reds on the only calibrated release-gate row. Every one is a post-action P95 failure at 21–27 ms
against the inclusive 20 ms gate; none is a confirmed 33.5 ms max breach under ADR-0156's
two-of-three rule. They fall on five actions: `open Settings` (three modes), `close Settings` (two),
`select coloring page` (three), `switch light theme to dark` (one), and
`with ink: PORTRAIT to LANDSCAPE rotation` (two).

What the evidence establishes about those frames:

* **The cost is attributed off the app.** An all-process Instruments recording aligned to the
  probe's own timestamps places the slow `select coloring page` frame in GPU-process work —
  `IOSurfacePool::tryEvictOldestCachedSurface`, surface creation, Metal command submission, path
  rendering — with six WebContent main-thread samples of reactive/mutation work, paint, and SVG
  submission and no `PageRuntimeAgent::evaluate` inside the frame. The `open Settings` trace aligns
  its late frame with animation completion, compositing-hierarchy changes, touch-region updates,
  layer removal, and paint; the rotation trace holds GPU surface-pool eviction and command
  submission beside WebContent layout in the first full post-resize interval
  (`docs/scratchpad/perf/2026-09-05-epic-1567-resumed-campaign.md`).
* **The bounded product mechanisms are exhausted.** Seven were measured on the widest-spread cell
  and every one was negative or insufficient: backdrop-blur removal under a coarse pointer
  (ADR-0157, took portrait/light green), `decoding="async"` on the paper image, apply-art-after-
  dialog-retirement sequencing, raster line-art tiers (ADR-0152 amendment), hidden-until-ready
  overlay visibility, activation-time predecode, and paper-sheet compositor pre-promotion. Bitmap
  substitution and layer pre-promotion both failing triangulates the residual to the full-screen
  paper-layer swap the current architecture requires on selection (issue #1569, 2026-09-06
  disposition). For `open Settings`, the pane is already prewarmed (ADR-0049 amendment) and the
  bounded `contain: layout paint` candidate measured negative.
* **Control-to-control variance straddles the gate.** Back-to-back unchanged-main controls on the
  same cell read P95 22 and 18 ms, so a 2–5 ms residual cannot be reliably resolved with three
  scored repeats; a campaign can spend indefinite rig time re-measuring noise.

ADR-0156 already requires every red scoreable cell on a release-gate row to end in a recorded
product outcome, and these have one. But the `improve-performance-matrix` completion gate still read
"zero current, scoreable red cells", so a cell whose recorded outcome is "attributed to WebKit
surface churn, mechanisms exhausted" kept the epic unfinishable and invited unbounded
re-experimentation. Issue #1569's quarantine comment explicitly declined to take an allowance
autonomously because it is a release-gate policy change; issue #1692 put that decision to the owner,
who accepted its option 1 on 2026-09-06.

Options weighed in #1692:

1. **Per-action measured P95 allowances on the calibrated iPad web row** for the attributed
   transition cells, each carrying its evidence and a reopen condition — the ADR-0090 shape, with
   ADR-0137's crayon lost-frame exception and the `open Settings` 56 ms max allowance as precedent —
   plus the completion-gate rewording. **Chosen.**
2. Keep every cell red and reword completion only ("zero unexplained reds"). Honest, but the matrix
   then permanently renders red that the release process ignores, which is the state ADR-0137 built
   its rendered exception table to prevent.
3. Raise the base 20 ms P95 action gate globally. Already rejected in ADR-0156's max-gate analysis
   for waving through real recurring hitches; every action on every target would inherit a budget
   sized for five transition cells on one device.

## Decision

### 1. Five measured P95 allowances on `ipad-device-web`

`IOS_ACTION_FRAME_P95_ALLOWANCES` in `tools/perf/lib/action-stats.mjs` gains four entries and raises
one. Each value is sized by ADR-0137's rule — **from the worst committed single capture of the cell,
never a median** — and set exactly one rounding quantum above it: the scorer's percentile rounds to
whole milliseconds, so a value equal to the worst observation is the zero-margin number ADR-0137's
own history warns against, and one millisecond is the smallest step that clears it. The measured
basis is every committed iPad web action capture in `perf-profiles/evidence/` at product commits
3c017796 through e5142fab (September 2026, all after ADR-0157). The re-score of all 85 covered
readings under the ledger is in `docs/scratchpad/perf/2026-09-06-adr-0160-allowance-rescore.md`: 33
flip to PASS and none stays red.

| Action                                     | Allowance | Worst committed P95                                                          | Other committed readings                                     | Attribution                                                                                                                                           |
| ------------------------------------------ | --------: | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open Settings`                            |     29 ms | 28 (`2026-09-05-epic-1567-advanced-controls-certification`, landscape/dark)  | 27 in seven captures across three modes; 23–26 in eight more | Traced: animation completion, compositing-hierarchy changes, layer removal, paint; `contain` candidate negative                                       |
| `close Settings`                           |     22 ms | 21 (`…-ipad-e514-control` landscape/light and dark; `…-ipad-paper-control`)  | 17–20 in fifteen captures                                    | Shared with the picker: dialog retirement over the full-screen paper layer; **no dedicated trace**                                                    |
| `select coloring page`                     |     30 ms | 29 (`2026-09-05-epic-1567-landscape-retirement-controls`, landscape/dark)    | 26–28 in seven captures; portrait/light 17–19                | Traced in-frame: GPU IOSurface pool eviction, surface creation, Metal submission; seven mechanisms negative                                           |
| `switch light theme to dark`               |     23 ms | 22 (`…-ipad-e514-control`, portrait/light)                                   | 17 in fifteen captures                                       | Single-capture excursion; the full-document restyle recomposites every layer in one frame (ADR-0087); **no dedicated trace**                          |
| `with ink: PORTRAIT to LANDSCAPE rotation` |     26 ms | 25 (`2026-09-05-epic-1567-ipad-paper-control`, portrait/light, two captures) | 22–24 in four captures; landscape-origin direction 17–18     | Traced: first full post-resize interval, GPU surface-pool eviction and command submission beside WebContent layout; compositor pre-promotion negative |

Two of the five carry no dedicated trace. They are granted on the same evidence class as their
traced siblings — the same dialog-retirement surface swap, the same one-frame recomposite — and the
ADR says so rather than implying a trace that was not taken; their reopen conditions below are
correspondingly stricter.

Everything else about the ledger is unchanged. It applies to the calibrated physical iPad Safari
capture only: the iOS harness still records it into each capture as `gateAllowances`, the matrix
generator applies it by target id (§3), and the iPad native row, both Android physical rows, every
simulator and emulator, and every desktop engine stay on the base 20 ms gate. The
`with ink: LANDSCAPE to PORTRAIT rotation` direction gets nothing: it reads 17–18 ms in seventeen
committed captures and 23 ms once. The `open Settings` 56 ms max allowance keeps its
capture-environment reopen condition from ADR-0090's 2026-08-26 amendment. The 33.5 ms max gate, the
first-frame gate, and every drawing and undo gate are untouched — an allowance covers a measured P95
residual, never a confirmed max breach.

**Reopen conditions.** Each entry retires, and its cell returns to red for a product fix, when:

* a trace isolates an avoidable app-owned component of the frame — for `close Settings` and
  `switch light theme to dark`, any first aligned trace that shows main-thread app work saturating
  the frame retires the entry, since neither was granted on a trace of its own;
* a WebKit or iPadOS update changes the surface-churn cost in either direction — a canonical
  four-mode control after an OS update that reads under the base gate lowers or removes the entry,
  and one that reads past the allowance is a red cell, not a reason to raise it;
* a product change alters the transition — a different paper-layer architecture, a Settings pane
  that no longer swaps a full-screen surface, a theme switch that no longer restyles the whole
  document — after which the entry is re-measured and lowered or removed;
* a canonical capture reads past the allowance. That is a red cell. Entries only ratchet down;
  raising one needs the same evidence as adding it: device measurements, three scored repeats, and
  the alternatives tried and rejected (ADR-0137).

### 2. The completion gate counts unexplained reds

The `improve-performance-matrix` completion gate now reads **zero current, scoreable, unexplained
red cells on the release-gate rows**. A red cell is explained when an ADR records its disposition
with the measured basis, the trace attribution, and the reopen condition — this ADR's allowances are
the shape — and a disposition granted by the campaign itself rather than recorded by the owner does
not count. The skill's description, opening paragraph, Goal-mode objective, and completion gate all
carry the wording; the `skills-guide` entry matches.

### 3. The matrix applies the shipped policy by target

`gen-performance-matrix` no longer re-scores an action capture under the `gateAllowances` it
recorded. It applies `actionGateAllowancesFor(targetId)` — the ledger for `ipad-device-web`, the
empty map for every other target — exactly as ADR-0137's lost-frame exceptions are keyed by matrix
target id. The recorded field stays as the capture-time verdict's provenance. This is what makes a
policy change reach every published cell on regeneration so that the regeneration diff is the record
(the ADR-0156 pattern); under the recorded-metadata rule of ADR-0090's amendment the published row
would have kept scoring under the ledger it was captured with, and this decision could never have
reached it. A capture whose runner omitted tablet classification and recorded `{}` (the trap in
`docs/PROFILING-CAMPAIGNS.md`) now scores under the declared policy in the matrix rather than under
its own omission.

Each result scored under an allowance carries `gateAllowance: { p95Ms, maxMs }` in `data.json`, the
heat ratio prices it against that budget rather than the base gate, the tooltip verdict reads "PASS
under a recorded allowance", and both the Markdown and HTML reports render the whole ledger with
each entry's basis beside the acceptance gates — ADR-0137's mitigation, so a passing cell is never
read as a base-gate pass.

### 4. What did not change

The iPad native row stays at base gates; its dark-mode Settings toggles are issue #1694. The drawing
lost-frame budgets for pen, Magic, and eraser are deliberately held for the rig session's
real-finger reproduction check (issue #1693); this ADR grants nothing there. The published matrix
keeps its product commit (9af487b3745c0c1237644c92d5a243b1825911d7) until the android-device-native
row lands (issue #1563).

## Consequences

* \+ The epic has a finite remainder again: the eleven attributed transition reds are explained, the
  campaign stops re-measuring surface churn, and rig time goes to the cells that can still move.
* \+ Every allowance is visible where the number is read — the ledger renders beside the gates with
  its basis, and each allowed cell says so in its tooltip and its `data.json` entry.
* \+ A regression is still caught. Every entry sits one quantum above its worst committed reading,
  so the next capture that reads past it is a red cell; the max gate is untouched, so a recurring
  two-beat hitch on any of these actions still fails.
* − Five actions on the release-gate row are now documented rather than solved, and two of them on
  shared attribution rather than a trace of their own. The reopen conditions are conventions the
  tooling cannot enforce; the ratchet-down rule is the only thing holding the line.
* − One millisecond of headroom is deliberately thin. Control-to-control variance on these cells is
  2–5 ms, so a faithful recapture can land on the allowance boundary; when it does, ADR-0137's rule
  is to read it as the raw number plus this table, and to recapture before treating it as a
  regression.
* − **The published matrix cannot record this change on its own diff yet.** Its physical rows are
  built from `perf-profiles/epic-1567-final-9af487b3/`, a gitignored raw corpus that no longer
  exists on any checkout; the generator fails on the first missing source, and the preserved-
  evidence path cannot substitute because it deliberately withholds a current verdict. The rescore
  in this ADR's scratchpad note is the record for now; the first regeneration with raw inputs — the
  #1563 fold — is where the eleven cells flip in `data.json`.
* − The matrix's action verdict is now the shipped policy's, not the artifact's. A capture command
  still prints its own verdict under the ledger it was given, so a capture with base-gate
  classification prints `FAIL` for a cell the matrix passes — the same reading rule ADR-0137 already
  set for the lost-frame table.
