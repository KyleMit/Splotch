# Android configuration survival sweep — 2026-10-21

Completed on API 34 phone (`emulator-5688`), API 36 tablet (`emulator-5690`) and API 28 phone
(`emulator-5686`). **59 executed cases: 47 pass, 4 failing device/case observations, 5 observations
of known RTL issue 3140, and 3 blocked freeform attempts. Two unique defects are confirmed, each on
two fresh API 34 runs.** Five API 28 checks are not applicable and excluded from executed totals.

| Device        | Executed | Pass | Fail | Known RTL | Blocked | N/A |
| ------------- | -------: | ---: | ---: | --------: | ------: | --: |
| API 34 phone  |       21 |   16 |    2 |         2 |       1 |   0 |
| API 36 tablet |       21 |   17 |    1 |         2 |       1 |   0 |
| API 28 phone  |       17 |   14 |    1 |         1 |       1 |   5 |
| Total         |       59 |   47 |    4 |         5 |       3 |   5 |

One listed setting/flow is one case, including application and restoration; diagnostics and fresh
reproductions do not inflate counts. See the
[machine-readable case ledger](results/case-ledger.json) and reports for
[API 34](results/android-api34.md), [API 36](results/android-api36-tablet.md), and
[API 28](results/android-api28.md).

## Findings

* **RN-CONFIG-001 — S2:** high-contrast text can make existing ink disappear until Undo or another
  drawing update repaints it. Two fresh API 34 processes reproduced sustained blank paper with the
  same PID, activity and create count. Undo recovered the drawing, demonstrating retained history.
  Also observed once per configuration round trip on API 36 and API 28. Likely presentation/surface
  invalidation; source attribution remains a hypothesis.
* **RN-CONFIG-002 — S3:** expanded action icons become blank white tiles in the smallest API 34
  phone split pane (effective 234×231dp). Two fresh runs reproduced it. Drawing and Undo survive,
  and icons return at full size. The suspected layout calculation clamps button size without
  proportionately reducing padding.

[findings.jsonl](findings.jsonl) contains numbered steps, expected/actual behavior, API level, two
fresh reproductions, evidence paths, source locations and shipping-comparison limits.
[Repro scripts and instructions](repro/README.md) reproduce both findings. Known mirrored/partly
unpainted RTL behavior from issue 3140 was recorded and not re-filed. No GitHub issues were created.

## Survival results

No accepted configuration transition caused an additional activity create or process change. Font
extremes, density changes, supported locales, dark mode, bold text, actual hardware keyboard
attachment, available navigation modes, phone portrait locking, tablet rotation, and real
split-window entry/resizing/exit were exercised. Failures above concern visible presentation; the
underlying drawing and Undo history survived. Screenshots, UI XML, lifecycle-event receipts and
activity dumps accompany the observations.

The API 28 save flow passed after font scale 2.0 with a real storage-permission dialog. The
resulting 1079×1888 PNG contains the drawn house; its bytes remain unchanged after background
process death. Existing media was preserved, and the new test image was retained for inspection. See
`evidence/emulator-5686/save-result.json` and `save-after-process-death.json`.

Accepted background trim commands retained drawing/history. Intentional `am kill` on each device
lost the unsaved drawing and Undo as expected by the supplied brief; this is not a filed defect.
These checks establish command-level behavior, not sustained low-memory pressure or instrumented
trim-callback delivery. Shipping was not run, so no independent shipping-runtime equivalence is
claimed.

An earlier cumulative tablet portrait-to-landscape sequence produced one blank-ink capture before
Undo. Two fresh isolated round trips with five-second settling and additional untouched landscape
captures retained ink and working Undo. This remains an **unconfirmed sequence-dependent lead**, not
a twice-reproduced finding; the full preceding churn sequence was not repeated. See
`results/api36-rotation-recheck.txt` and `rotation-recheck-*` evidence.

## Validation and limits

The existing `tools/migration/tests/native-config-changes.test.mjs` guard passed all three tests.
The offline [survival validator](repro/validate-survival.mjs) passes on all three devices and
rejects six deliberate evidence mutations per device (18 negative controls): changed PID, activity,
create count, blank ink, disabled Undo and ineffective Undo. Results:
[survival-validation.json](results/survival-validation.json). No product source or permanent CI test
files were changed; reusable automation is contained in this scratchpad as requested.

Freeform requests never produced an actual freeform window on these emulator configurations, so all
three are blocked rather than passes. API 28 lacks per-app locales, bold-text adjustment and the
tested modern navigation-overlay pair. API 24–27, physical devices, iOS, web, other app features and
AI flows were outside this run. This was targeted configuration regression testing, not a full
suite.

The supplied Release APK was installed directly. Its SHA-256 is
`61a951a9dc2b8278e0c91975623a1dfcd4594924f1c71d0299a2a69944573539`. The inspected checkout is
43affe93cf1ad844ffb653c6fe23cad16e61a23a; the supplied APK filename references a different revision,
so exact build-to-checkout source identity is not asserted.

## Teardown and handoff

All changed system settings, density, rotation, locales (including exact original backing property),
navigation overlays, virtual input devices, drawer preference and API 28 permission
flags/preferences were restored. Per-device restoration receipts and empty `stopped-pid.txt` files
are under `evidence/`; the final tablet receipts follow its fresh rotation retests. Probe apps and
session-started helper processes are stopped. Pre-existing emulators remain running. No servers were
started.

Everything new is under this directory. Product source and earlier hunt evidence were left alone;
nothing was committed or pushed, and no `gh`, web work or AI requests were used. [plan.md](plan.md)
describes the protocol, [status.md](status.md) records progress, and
[evidence-manifest.json](evidence-manifest.json) inventories final artifact sizes and SHA-256
hashes.

## After this run

* RN-CONFIG-001 was filed as #3141 and fixed by #3144.
* RN-CONFIG-002 was filed as #3142 and is still open.
* The right-to-left paper band seen here (#3140) was fixed by #3143.
* The `evidence/` folder (about 400 MB) and the compiled helpers (`repro/config-input-arm64` and the
  `.class`/`.dex` files in `repro/locale-helper/`) stay local and aren't committed. Links into them
  are local-only. Rebuild the helpers from the committed `config-input.c` and `.java` sources.
