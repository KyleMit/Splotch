# Epic 1567 physical control evidence

Date: 2026-09-04 America/New_York\
Product commit: 3c017796622f374d428ee91c74b731b00964a63f\
Scope: the four physical release-gate targets in issue #1567

This note ties the control corpus used by the September 2026 performance treatments to one product
commit. It is treatment provenance, not a final release-gate verdict: only a complete single-commit
matrix recapture can close the epic.

## Promoted evidence

The drawing and undo representatives are split by deployment target:

* `2026-09-04-epic-1567-control-ipad-web`
* `2026-09-04-epic-1567-control-ipad-native`
* `2026-09-04-epic-1567-control-android-web`
* `2026-09-04-epic-1567-control-android-native`

The complete discrete-action controls are preserved separately because every scored repeat is part
of a causal comparison:

* `2026-09-04-epic-1567-control-actions` contains all four modes for iPad web, iPad native, and
  Android web (12 action suites).
* `2026-09-04-epic-1567-control-actions-android-native` contains all four Android native modes (four
  action suites).

All six evidence indexes name the same product commit. `keep-capture-evidence.mjs` copied each
measurement whole and replaced hardware identifiers only in the tracked copies; the gitignored
source artifacts remain unchanged. Action comparisons derive each scored repeat independently with
`scoredActionFrameGaps()` from `tools/perf/lib/action-stats.mjs`; pooled P95, P99, and maximum
values are never counted as additional repeats.

## Android native retry provenance

The original Android native queue completed its drawing cells under drawing instrument fingerprint
`ca1b854d2e154ddae0081c4667cd6389b8ba6f230d103d3413a96702e676ecc6`, but its generic campaign
attempts could not produce valid action JSON. The actions were rerun as an action-only queue under
the action instrument fingerprint
`dff6b98a58f7a2e26f38e58a806bdd44732eb14241d44fdb0f26e6bfe9796ddb`; all four cells are recorded as
`valid-json-exit-0` in `retry/actions-ledger.tsv`.

That retry kept the control product commit, physical Android target, native Capacitor WebView
runtime, four orientation/theme modes, action plan, and scoring implementation fixed. It changed
only the runner needed to collect the action suite, so its results are comparable with the other
control actions while remaining visibly separate from the drawing corpus.

## Review disposition

Two treatments are preserved as negative results and removed from the stack tip:

* The Settings-wide `will-change` promotion did not establish a consistent WebKit gate win and had
  an unmeasured persistent layer-memory cost.
* Removing the post-retirement frame before clearing a coloring page was measured only on the cheap
  pen/no-retained-Magic-history path. It did not justify changing the real-world Magic-history path.

The brush-trigger promotion remains: the canonical iPad web recapture made `open brush menu` green
in all four modes. The selector decode treatment also remains, but hover now fetches only; decode is
reserved for pointer-down so a mouse pass over the book grid cannot decode every selector.
