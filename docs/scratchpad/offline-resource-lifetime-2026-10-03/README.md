# Incomplete offline-resource lifetime probe, 2026-10-03

Status: abandoned fixture attempt, preserved as evidence. No resource-lifetime defect was
established. This record is separate from the three product fixes in PR #2631.

## Question and intended falsifier

Can an already prepared screenshot lose its selected downloadable coloring-page resource when the
user removes downloaded pictures while offline, then completes the same valid camera press? A
product failure requires an attributed canonical-resource read or export failure after real
installation and actual cache deletion, with the original pointer still valid. A canceled press,
missing pack, or broken fixture is not that falsifier.

The archived probe contains useful scaffolding: installed-file size and SHA-256 verification,
service-worker ownership, exact online/offline no-removal PNG controls, real UI removal through
keyboard navigation during a held camera pointer, original-coordinate hit testing before release,
and exact output dimension/RGBA comparison. Those later stages were never reached.

## What ran and why it did not answer the question

Two initial attempts failed before launching a browser: config module-mode/import.meta handling,
then inherited relative globalSetup resolution. A later import attempt used the wrong installed
Sharp entry point; a broad testDir then collected archived copies of the spec. These are runner
failures, not product findings.

The exact-collection release attempt at 5cff2c1190effb6ac5e7383cc7431508afa33083 ran on 2026-10-03,
10:03:43.639–10:03:54.630 UTC, with one Chromium worker, zero retries, exit 1 and no timeout. It
opened the app and selected Pen, then failed its first brush-state assertion: expected
`data-brush="pen"`, received a missing attribute. This occurred before engagement strokes, pack
installation, service-worker proof, offline controls, preparation, removal, or export.

`publishActionPanelState` in `web/src/lib/actionButtonLayout.ts` deliberately omits `data-brush` for
the default Pen and sets it for other brushes. The assertion was wrong; disabling the dev harness
was not the cause. The original failing assertion is retained in the archived probe. A future
attempt must use the production default-Pen contract before claiming it reached any lifetime stage.

The question remains unproved. Matching PNGs in a future valid run would support only that tested
browser/cache case; it would not establish selected-folder grants, native resource lifetime, disk
loss behavior, or physical-phone performance.

## Preserved source and restart boundary

`offline-resource-lifetime.spec.ts.txt` is the latest failed release probe with absolute host
imports replaced by ordinary package/repository imports. Its logic, including the faulty Pen
assertion, is retained. Formatting changes are cosmetic. The `.txt` suffix keeps this abandoned
fixture out of automatic test collection.

`playwright.offline-resource-evidence.config.ts.txt` is a normalized configuration recipe with
repository-relative paths, exact single-file collection, one worker, zero retries, and a fresh
production build with dev/performance harnesses disabled. It is not a validated portable runner.
Neither archived file is a new successful execution or a finished regression test.

To reconsider this question, copy the fixture to `web/tests/offline-resource-lifetime.spec.ts` and
its config to `web/playwright.offline-resource-evidence.config.ts` on a new isolated branch. Fix the
production Pen witness, select an unused explicit `SPLOTCH_E2E_PORT`, reserve the host, and run the
exact config through `node tools/run-web-tool.mjs playwright test`. A prebuilt flag does not
suppress the recipe's build command. Preserve the first result and prove every prerequisite before
interpreting the lifetime arm. Do not weaken or bypass a canceled-input result.

No runtime code, default test discovery, or current product decision changes in this evidence
branch. Raw logs, traces, images, private campaign packets, and host/device information remain
local; only sanitized source and this account are published.
