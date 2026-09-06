# ADR-0162: Measured P95 Allowance for the Android Web Theme Flip

**Status:** Active — amends
[ADR-0160](0160-measured-p95-allowances-for-gpu-attributed-ipad-transitions.md) and
[ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md) **Date:** 2026-09

## Context

The `disable Night Mode in the compact shell` cell on `android-device-web / landscape-dark` read a
post-action P95 of 33.3 ms in all three scored repeats of the e5142fab row capture
(`perf-profiles/evidence/2026-09-06-epic-1567-android-device-web-e514/actions--fc8962c0.json`)
against the 20 ms gate, with no confirmed 33.5 ms max breach. It is the one scoreable red on the
physical Android web row that survived issue #1696's attribution without a tracking issue, and
ADR-0156 requires every red scoreable cell on a release-gate row to end in a recorded product
outcome. Issue #1703 put the outcome to the owner, who accepted its option 1 on 2026-09-06: extend
the theme-flip allowance family that ADR-0160 opened for the iPad row to this row.

What the evidence establishes about the frame (issue #1696's disposition,
`docs/scratchpad/perf/2026-09-06-issue-1696-night-toggle-attribution.md`, paired Chrome trace at
f42d0994b27979731c8acc215e6e1f2385b85955, evidence in
`perf-profiles/evidence/2026-09-06-issue-1696-android-night-toggle/`):

* **The delivery hypothesis is falsified.** In all eight traced toggle repeats the click's
  rAF-aligned input task ran 26–39 ms on `CrRendererMain`: `EventDispatch(click)` 9–12 ms (the
  Svelte flush 6–9 ms of it), `UpdateLayoutTree` 9.5–14.7 ms, `PrePaint` 3–4.7 ms, then a 6–10 ms
  `Commit`, and the compositor logged a `DroppedFrame` at the first `BeginFrame` after every click.
  The driver's share is about 2 ms. A busy main thread under a steady `BeginFrame` is the opposite
  of the scroll study's delivery signature.
* **The bounded product treatment did not move the structural half.** Freezing closed dialogs'
  themed art until they open (PR #1702) cut `EventDispatch(click)` to 3.8–7.0 ms and the flip's DOM
  mutation targets from 37 to 9, but `UpdateLayoutTree` did not move (9.5–14.7 ms clean, 8.0–19.6 ms
  treated) and every scored treatment repeat still blocked the main thread past 16.7 ms with a
  dropped compositor frame. It shipped on its 2–5 ms merit and was recorded negative against the
  gate. The residual is the whole-document restyle of the theme token flip — the same structural
  cost the iPad row carries as its `switch light theme to dark` allowance (ADR-0160).
* **The verdict flaps on the same product, and the flap is explained.** The clean-main full plan
  read 33.4 / 33.4 / 33.4 and, an hour later on the same served tree, 16.8 / 33.4 / 16.8.
  `action-probe.js` stamps frames with the `requestAnimationFrame` timestamp argument — the vsync
  the frame was scheduled for — so a late main frame keeps its on-time stamp, and the probe reported
  16.7 ms gaps in six of the eight traced repeats whose main thread was blocked for most of two
  periods (issue #1704, `docs/PROFILING-CAMPAIGNS.md`). On this probe a two-beat red is faithful and
  a green is not proof the frame fit. Three scored repeats pool about 52 scored gaps, so the pooled
  P95 is the third-highest gap: it reads two beats only when every repeat's request slipped the
  extra vsync, and one beat when any repeat's did not. The cell therefore flips between two readings
  of the same frame, not between two frames.

Options weighed in #1703:

1. **Extend the ADR-0160 theme-flip P95 allowance to `android-device-web`**, measured basis this
   trace, reopen condition an attribution isolating an avoidable restyle component or a
   token-architecture change that shrinks `UpdateLayoutTree`. **Chosen.**
2. Fund one bounded containment experiment scoping the token flip's invalidation surface before
   deciding. The treatment already showed the dispatch half is not where the cost lives, and the
   restyle half is the token architecture itself; the experiment would spend rig time to reach
   option 1 with a second negative.
3. Leave the cell red and untracked. Not an option: the four-row fold (issue #1563) requires every
   surviving red to be a tracked cell.

## Decision

### 1. One measured P95 allowance on `android-device-web`

`tools/perf/lib/action-stats.mjs` gains a second ledger, `ANDROID_WEB_ACTION_GATE_ALLOWANCES`, with
one P95 entry and an empty max ledger:

| Action                                    | Allowance | Worst committed P95                                                                               | Other committed readings                                                                                                                                             | Attribution                                                                                                                                                                                                         |
| ----------------------------------------- | --------: | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `disable Night Mode in the compact shell` |   33.5 ms | 33.4 (`2026-09-06-issue-1696-android-night-toggle`, landscape/dark full-plan control at f42d0994) | 33.3 in the e5142fab row capture (landscape/dark) and once in landscape/light (`2026-09-05-epic-1567-night-mode-control-trace` at a9438fc7); 16.7–17.1 in ten others | Traced: 26–39 ms input task on `CrRendererMain`, `UpdateLayoutTree` 9.5–14.7 ms immovable under treatment, `DroppedFrame` at the first `BeginFrame` after every click; the whole-document restyle of the token flip |

**Sizing.** The value follows ADR-0137's rule as ADR-0160 applied it — from the worst committed
single capture of the cell, never a median, set exactly one rounding quantum above it — in this
probe's own quantum. ADR-0160's quantum was one millisecond because Safari's rAF clock resolves to
whole milliseconds; Chrome's resolves to 0.1 ms, so the worst committed reading of 33.4 ms is
cleared by 33.5 ms and by nothing smaller. That lands the allowance exactly on the 33.5 ms max gate,
and the coincidence is the point rather than an accident: a pooled P95 past 33.5 requires every
scored repeat to carry a frame past 33.5, which is a confirmed max breach under ADR-0156's
two-of-three rule. The allowance therefore admits the recurring two-beat frame and nothing the max
gate would not already fail; the P95 gate on this cell is retired into the max gate rather than
loosened past it. The whole-millisecond alternative, 34 ms, produces identical verdicts on every
three-repeat capture — a P95 between 33.5 and 34 is still three breaching repeats — and was rejected
only because it would be the first entry in the family to sit above the max gate, inviting the
reading that a frame the max gate calls a breach is one the P95 gate tolerates. The 33.5 ms max
gate, the first-frame gate, and every drawing and undo gate are untouched; the enable direction and
every other action on the row stay on the base 20 ms gate. The three-beat frame (50 ms) fails both
gates.

The measured basis is every committed `android-device-web` action capture in
`perf-profiles/evidence/` that offers the compact shell — the landscape modes at product commits
3c017796 through f42d0994. The re-score of all thirteen readings under the ledger is in
`docs/scratchpad/perf/2026-09-06-adr-0162-android-night-flip-rescore.md`: the three two-beat
readings flip to PASS and none stays red. The value is pinned to that corpus rather than typed:
`tools/perf/tests/xcuitest-actions.test.mjs` re-scores every committed capture of the cell and fails
if the allowance is not one 0.1 ms quantum above the worst of them, or is not the max gate.

**Why the allowance is granted despite the flapping.** The allowance covers a cost the trace shows
recurring on every activation — the main thread blocked for most of two periods in all eight traced
repeats — not a reading that sometimes appears. The probe's stamp-slip behavior (issue #1704) means
the red is the faithful reading and the green is the optimistic one; a recapture that reads green
under this allowance is not evidence that the frame fit, and a recapture that reads 33.3–33.4 is not
a regression. Neither reading changes what the allowance is for. The probe's stamping semantics are
issue #1704's decision and are unchanged here.

**Reopen conditions.** The entry retires, and its cell returns to red for a product fix, when:

* a paired trace isolates an avoidable app-owned component of the restyle — a selector, a token
  fan-out, or an invalidation surface that a bounded change removes — or a token-architecture change
  shrinks `UpdateLayoutTree` on the flip;
* a Chrome or Android update changes the flip's cost in either direction — a canonical
  landscape-mode control after a browser update that reads under the base gate removes the entry,
  and one that reads past it is a red cell, not a reason to raise it;
* a product change alters the transition — a theme switch that no longer restyles the whole
  document, or a compact shell that no longer offers the quick toggle — after which the entry is
  re-measured and lowered or removed;
* a canonical capture reads past the allowance. That is a red cell and, on this cell, a confirmed
  max breach. Entries only ratchet down; raising one needs the same evidence as adding it: device
  measurements, three scored repeats, and the alternatives tried and rejected (ADR-0137).

### 2. The ledgers become a per-target registry

ADR-0160 decision 3 keyed the shipped policy on one target id. `ACTION_GATE_ALLOWANCE_LEDGERS` in
`tools/perf/lib/action-stats.mjs` now maps each ledger target to its allowances, its rendered
entries, and the ADRs that grant it — `ipad-device-web` under ADR-0090 and ADR-0160,
`android-device-web` under this record — and `actionGateAllowancesFor(targetId)` reads it. Every
target absent from the registry stays on the base gates whatever its artifact recorded, exactly as
before. `gen-performance-matrix` renders one ledger paragraph per target beside the gates and names
the granting ADRs in each allowed cell's verdict, so an Android cell passing under this record is
never read as a base-gate pass or as an ADR-0160 grant. The Android CDP action runner is unchanged:
it records no `gateAllowances` and prints base-gate verdicts, so its capture-time `FAIL` on this
cell is the reading rule ADR-0160 already set — the matrix's verdict is the shipped policy's, the
capture's is its own.

### 3. What did not change

The iPad ledger, its five entries, and its reopen conditions are untouched. The
`enable Night Mode
in the compact shell` direction gets nothing: it reads a P95 of 16.7–16.9 in
twelve of thirteen committed captures and two beats once (d92ba50b, before the settings-shell
treatment shipped); the one other base-gate failure (a9438fc7) is a first-frame P95 of 42.5 ms under
tracing overhead, not a post-action frame. Both Android physical rows keep their drawing, undo,
first-frame, and max gates. The probe's frame-stamp semantics (issue #1704), the iPad native
dark-mode toggles (issue #1694), and the drawing lost-frame budgets held for the real-finger check
(issue #1693) are each their own decision. The published matrix keeps its product commit
(9af487b3745c0c1237644c92d5a243b1825911d7) until the android-device-native row lands (issue #1563).

## Consequences

* \+ The physical Android web row's remainder is finite again: the one surviving red is explained
  under ADR-0160's completion rule, and rig time stops re-measuring a frame whose composition the
  trace already settled.
* \+ The allowance is visible wherever the number is read — its own ledger paragraph beside the
  gates, its basis in the paragraph, and `ADR-0162` in the cell's tooltip.
* \+ A regression is still caught. The allowance is the max gate, so a P95 past it is a confirmed
  two-of-three max breach and a three-beat frame fails outright; nothing the max gate would fail now
  passes.
* − One action on a release-gate row is documented rather than solved, and the P95 gate on that cell
  no longer adds anything the max gate does not: the cell's verdict is the two-of-three rule alone.
  The reopen conditions are conventions the tooling cannot enforce; the ratchet-down rule and the
  evidence-pinned test are what hold the line.
* − The allowance does not repair the probe. A green on this cell remains a reading the main thread
  may have overrun (issue #1704); the allowance stops the red from being counted as an unexplained
  remainder, and stops the green from being counted as a fix.
* − **The published matrix still cannot record this change on its own diff.** Its physical rows are
  built from `perf-profiles/epic-1567-final-9af487b3/`, the gitignored corpus ADR-0160 already found
  gone from every checkout; `npm run gen:performance-matrix` fails with `ENOENT` on its first
  source. The published cell already reads PASS at 9af487b3 (its row capture read 16.7 / 33.3), so
  the regeneration at the android-device-native fold will add this allowance's provenance to the two
  landscape cells rather than flip a verdict; the e5142fab red flips there. The rescore note is the
  record until then.
* − The Android CDP runner prints `FAIL` for a cell the matrix passes, the same
  capture-versus-policy split ADR-0160 accepted for an iPad capture without tablet classification.
  Teaching the runner to resolve the physical row's ledger is deliberately not part of this record.
