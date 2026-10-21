# RN web bug hunt, 2026-10-21

Candidate: b236d639160459eecd60900926c759af5d4ae080. This is a diagnostic browser run, not final
migration parity acceptance. The web addendum overrides the original worker brief: this lane never
uses Android or iOS devices, commits, pushes, or GitHub writes. Product source is unchanged.

* [Status](status.md): timestamped progress and phase boundaries.
* [Plan](plan.md): inherited inventory, corrected source expectations and web additions.
* [Findings](findings.jsonl): only defects reproduced twice; WEB-001 and WEB-002 have executable
  repros.
* [Summary](summary.md): final counts, confirmed defects, verification and coverage limits.
* [Coverage scope](results/coverage-scope.md): every plan row and its remaining axes.
* [Results](results/): every attempted case/profile, including failed harness takes.
* `evidence/observations.jsonl`: machine-readable assertion outcomes. Process exit zero does not
  imply every product assertion passed: the runner keeps blocked cases and continues.
* `evidence/engine-batches.json`: serialized engine/script process receipts.
* `evidence/server-ownership.json` and `evidence/server-ownership-resumed.json`: server ownership
  before and after the interruption. Port 6190 is external and must never be stopped by this worker.

## Run the probes

Run commands from the checkout root with the installed dependencies. Build first:

```sh
npm run native:web:build
node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/serve.mjs
```

The server uses port 6150 and mounts `web/static/coloring` at `/coloring/**`. Missing coloring files
return 404, not the app shell. The shipping reference is built with `npm run build`, then served
with `npm run preview -- --host 127.0.0.1 --port 6151`. Pick another allowed port on `EADDRINUSE`;
never stop an unrelated listener.

Playwright connects to the orchestrator's server at `ws://127.0.0.1:6190/`; it never launches a
local browser. `HUNT_ENGINE` selects `chromium`, `webkit` or `firefox`. Run one browser at a time:

```sh
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/drawing.mjs
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/ui.mjs
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/settings-actions.mjs
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/platform.mjs
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/ai.mjs
```

`HUNT_PROFILES=phone,tablet,desktop,narrow` filters scripts that advertise that variable.
`HUNT_CASES` is a comma-separated list of complete case IDs; skipped cases produce no observation.
`engine-batch.mjs` runs the engine scripts sequentially, appends status at each boundary and adds a
25-minute heartbeat. Use `HUNT_ENGINES=firefox` to select an engine queue,
`HUNT_SCRIPTS=input,drawing` to select batches, and `HUNT_RECEIPT=<name>` to preserve separate batch
receipts. Singular `HUNT_ENGINE` also selects one engine. Its full default engine queue is WebKit
then Firefox. `input.mjs`, `gate-lockout.mjs`, `back.mjs` and `update.mjs` cover trusted input, the
real-clock lockout, browser history and a changed-worker revision fixture. The update script owns a
temporary proxy on 6152 and closes it. `offline-install-storage.mjs` also invokes the library,
repeated-save and coloring brush probes after its first browser connection has closed.

AI requests are intercepted by the existing AI-1 fixture. Every unmatched remote page request is
aborted, and the static host refuses `/api/*`. Dummy-key cases use a deliberately fake key. No real
key or access code is needed. Fixture success does not establish hosted delivery or spend a grant.

```sh
node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/ai-quota-recovery.mjs
node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/reference-quota.mjs
HUNT_ENGINE=webkit node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/ai-webkit-diagnostic.mjs
node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/read-webkit-png.mjs
npm run test:tools -- tests/native-paper-input-web.test.mjs
node docs/scratchpad/2026-10-21-rn-bug-hunt-web/repro/pointer-negative-controls.mjs
```

The last command creates copied-source mutants, runs the real pointer tests against them, requires
an assertion failure, proves the product file stayed unchanged, and deletes the temporary copies. It
invokes the installed Vitest CLI with one custom config because `test:tools` already supplies a
config and Vitest rejects a second `--config`. The normal positive run uses the npm script.

## Harness lessons applied

* Wait for `data-drawing-live` and `data-controls-live`; a prerendered paper is not a ready engine.
  Admit the driver with three separate contacts versus one joined contact. Keep samples inside the
  dropped-pointer interval and allow the renderer to settle between commands.
* Chromium CDP provides trusted continuous touch, multiple contacts and pen packets. WebKit and
  Firefox use trusted mouse paths and separate trusted touch taps. Their configured touch viewports
  do not establish continuous-touch, pen or multi-finger fidelity.
* Wait for a dismissed dialog to disappear before reopening Settings. Wide Settings uses pressed
  chips where the phone uses switches. Enabling protection can immediately replace the wide Parent
  Center with its public unlock card; unlock that card before typing an answer.
* Web defaults are all five protections **Never**. Gate cases enable protection through the UI. The
  shared `MAX_UNDO_DEPTH` is **20**; removal of stroke/point caps did not remove the Undo cap.
* The picker deliberately sends pointer events through its color buttons to the grid. Tap the grid
  at the landed hexagon's center; do not force-click an inaccessible hit-test target.
* The install banner is hidden while the drawer is expanded. Collapse it before testing its
  appearance or a `beforeinstallprompt` fixture.
* The held AI fixture logs a request after its reply resolves. Observe the browser request event to
  count uploads while a reply is held. The ready wand is named **Show your finished picture**.
* Later observations include full-frame settling metadata: three identical frames, sampled at least
  250 ms apart after a one-second quiet period, bounded at ten seconds. Early captures without that
  metadata are raw diagnostic frames, not qualified settled visual acceptance.
* The repeated-save probe also checks decoded-pixel hashes: browser metadata must not make identical
  pictures count as distinct.
* PNG hashes can change when unchanged vector art becomes a raster checkpoint. Keep the original
  crops and inspect the differences. The diagnostic one-pixel color-envelope comparator accepts the
  observed outline fringe and rejects a deliberately removed stroke (1,439 violating pixels in
  `evidence/pixel-comparator-control.json`). It is not a token-color or final-parity validator.
* Browser CSS zoom is a labeled surrogate. A failure there does not establish a browser-chrome zoom
  defect. Screen-reader speech, physical pen/touch fidelity and OS install UI remain separate.
* Same-artifact worker/version overrides exercise update lifecycle and offline coherence, not a
  second real release or a deploy-race integrity acceptance test.
* Deferred worker registration needs three completed strokes, as declared by `SETTLED_IN_STROKES`. A
  one-stroke probe cannot judge offline behavior.
* The browser automation offline toggle can fail navigations in WebKit/Firefox despite an active
  worker. `offline-host-loss.mjs` instead stops its own local proxy after control is established,
  then reloads and uses cached drawing, Sound and Farm. `update.mjs` uses the same connection-loss
  method after activation. This does not change `navigator.onLine` or emulate OS airplane mode.
* Remote shipping checks use paced mouse input outside Chromium; the inherited `contact` helper uses
  Chromium's touch API. Fixture comparison must not fail before a user action is attempted.
* Stop processes through their recorded execution handles when a direct signal is sandbox-denied. A
  failed signal is not a stopped process; verify completion before opening another browser.

The shared palette exposes names without a selected state in both implementations. That is noted as
an accessibility inspection gap, not counted as an RN regression or spoken-screen-reader proof.

In a sandbox that cannot write the host dprint cache, set `DPRINT_CACHE_DIR` to a task-owned
directory under `/private/tmp` for `dprint` and `npm run format:check`. A cache-write failure is not
a formatting verdict; rerun with the writable cache and judge the exit code.

## Run 3

* [Blocked-case reconciliation](results/blocked-run3.md) accounts for every previously blocked unit.
* [Visual matrix](results/visual-parity.md) holds the shipping/RN pixel and geometry comparisons;
  image pairs and exact DOM rectangles live under `evidence/visual/`.
* `repro/visual-run3.mjs` drives Chromium, WebKit and Firefox sequentially through
  `repro/visual-parity.mjs`; `repro/visual-report.mjs` regenerates the viewport tables from each
  pair's `comparison.json`. Existing captures can resume without a retake.
* `repro/blocked-run3.mjs` records the functional reruns. `repro/blocked-report.mjs` reconciles the
  original 38 blocked units against the latest observations and the existing server-loss evidence.
* The third passing pointer regression covers a coalesced batch that omits the current event's
  endpoint. Its negative control removes that endpoint append from a disposable source copy.

## Harness lessons applied in run 3

* `repro/visual-metrics.mjs` collects every root button and identifies palette swatches by DOM
  ancestry. A color-name whitelist omitted valid wide-layout swatches. The collector also measures
  the actual `modal-surface` card instead of RN's full-screen semantic dialog. The discarded
  measurement pilot is retained in `evidence/visual-pilot/`.
* `repro/visual-inspect.mjs` retries lazy Settings admission and matches the section name at a word
  boundary; shipping's row summary does not use RN's comma separator.
* `repro/ai.mjs` reports the selected `HUNT_CASES` in its ending message. A generic batch caption
  can otherwise claim cases the filter never ran; the raw case rows and fixture receipts remain
  authoritative.
* `evidence/active-run3.json` records owned tool handles and ports. Stop those handles with Ctrl-C.
  The sandbox denied a direct signal to the owned child; the tool handle stopped its process group.
  Never stop the shared browser server on 6190.
* `repro/verify-visual.mjs` proves requested pair completeness, dimensions, screenshot hashes,
  settled captures, drag movement, computed box lists and fixture effects. Style/theme comparisons
  hash decoded pixels so browser PNG metadata cannot masquerade as changed artwork.
* `repro/review-sheet.mjs` regenerates labelled contact sheets. `repro/verify-gallery.mjs` checks
  that filtering to an excluded engine/viewport clears previous images and disables paging, so an
  absent capture cannot display stale evidence.
* Run `repro/summarize.mjs --manifest-only` after the final formatting, status and log writes. Send
  its stdout to the terminal, not a file inside this evidence package: a log written after its own
  hash was recorded would immediately make that hash stale.

These fixes stay in the QA harness, runbook and regression tests; this run makes no commits.

The final request audit also caught a local-resource guard error: WebKit requested same-origin
`blob:` resources while preparing shipping coloring art. A blob's `hostname` is empty even when its
`origin` is the local app. `visual-parity.mjs` now permits blobs only from the two local app
origins, logs full denied request URLs, and requires decoded shipping page art. The entire first
WebKit matrix is retained under `evidence/visual-discarded/webkit-local-blob-blocked/`; the accepted
matrix is the complete corrected recapture. The final verifier rejects any denied-resource receipt.

The final-check runner formats every incremental JSON receipt before writing it. Raw JSON.stringify
updates after code formatting can make the full formatting check fail on its own receipt. Preserve
the failed attempt and record a separate recheck after correcting the writer.
