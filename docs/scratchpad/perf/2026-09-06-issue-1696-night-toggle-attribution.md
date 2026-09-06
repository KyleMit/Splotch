# Issue 1696: Android compact-shell Night Mode toggle, attributed

The `android-device-web / landscape-dark` cell `disable Night Mode in the compact shell` read 33.3 /
33.3 / 33.3 ms at e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3 (post-action P95 33.3 against the 20 ms
gate). This note attributes that red from a paired Chrome trace on current main, then records one
bounded product treatment. It does not fold or replace any matrix row.

## Rig and build

The preflight passed the Android checks (trusted input at 1.02 moves/frame and 122 contact moves/s;
the page followed both rotations) and resolved the canonical ports free; the iPad launch check was
not run to completion because no Appium server was up, and the iPad was not used. The ADR-0143 keys
`peak_refresh_rate` and `min_refresh_rate` read `null` before the first capture and `null` after the
last, with the panel reporting 120 Hz both times.

Every capture served the worktree's own `perf:build` of f42d0994b27979731c8acc215e6e1f2385b85955
(current main) over the LAN preview, through the direct-CDP action runner with its 60 Hz pin
verified. The build's provenance reads `dirty: true` for exactly one tracked file: the preflight's
`blocked` row appended to `perf-profiles/evidence/operator/ipad-grant-log.tsv`. The `web/src` tree
served for the control captures is byte-identical to main. Chrome on the phone held eight leftover
same-site tabs from earlier sessions (three dead floor-control verify pages and Splotch pages on
other preview ports); the trace places each in its own renderer process, so none share the capture
page's main thread. They are recorded here as a rig observation and were left alone.

## Attribution

| Capture (landscape/dark, 4 repeats, 1 warmup)         | Disable maxima (ms) | Enable maxima (ms) | Verdict                  |
| ----------------------------------------------------- | ------------------- | ------------------ | ------------------------ |
| Focused `idle,theme` control, untraced                | 16.9 / 16.9 / 16.8  | 16.8 / 16.9 / 16.8 | pass                     |
| Full 49-action plan control, untraced                 | 33.4 / 33.4 / 33.4  | 16.8 / 16.8 / 33.4 | disable fails, P95 33.4  |
| Full-plan prefix through `theme`, traced (diagnostic) | 16.8 / 16.8 / 16.8  | 33.4 / 16.8 / 16.8 | pass, one two-beat frame |

The e514 red reproduces on current main under the full plan and not in isolation. The action
sequence before the toggle is identical in the full plan and the traced prefix, so the difference
between a red and a green reading is not a difference in what the toggle mutates: the probe records
the same 37 DOM mutation targets in both.

The trace answers the delivery question directly. In all eight traced toggle repeats the click's
rAF-aligned input task ran 26–39 ms on `CrRendererMain`: `EventDispatch(click)` 9–12 ms (of which
the Svelte flush is 6–9 ms), `UpdateLayoutTree` 9.5–14.7 ms, `PrePaint` 3–4.7 ms, and the `Commit`
that follows in the next task 6–10 ms. The compositor logged a `DroppedFrame` at the first
`BeginFrame` after the click every time, and the new theme's `DrawFrame` landed 34–47 ms after the
click. Sampled JavaScript inside the task is 3–6 ms; the driver's share is about 2 ms (Playwright's
hit-target `listener`/`expectHitTarget` and an `elementsFromPoint`), and the CDP mouse events
themselves dispatch in one task. There is no per-move await-and-sleep loop in a tap, and the
signature is the opposite of the scroll study's: a busy main thread under a steady `BeginFrame`, not
an idle one. **Attribution: product** — the whole-document restyle of the theme flip with the
compact Settings shell open, sitting just over one 60 Hz period.

The probe's frame clock explains how the same product can read red and green. `action-probe.js`
stamps frames with the `requestAnimationFrame` timestamp argument, which is the vsync time of the
`BeginFrame` that requested the main frame; a late callback keeps its on-time stamp. The probe
therefore reported 16.7 ms gaps in six of the eight traced repeats whose main thread was blocked for
most of two periods, and 33.4 in the two that carried the longest tasks. The probe records timestamp
differences, not their cause: a one-beat gap is not proof the frame fit, and a two-beat gap says a
frame overran without saying what overran it — the trace does. `docs/PROFILING-CAMPAIGNS.md` carries
the rule.

## Bounded treatment

Hypothesis: themed artwork behind closed dialogs has no reason to follow the flip. The AI prompt's
eight style thumbnails and the coloring-book picker's covers, page tiles and active-page preview
re-sourced on every flip while their dialogs were closed. `createDialogTheme` (in
`web/src/lib/state/dialogTheme.svelte.ts`) follows `resolvedTheme()` only while its modal is open
and catches up in a pre-render effect on open, so the first painted frame of the dialog carries the
current theme's art. Prefetches and the picked overlay keep the live theme. The toggle's DOM
mutation targets drop from 37 to 9.

| Capture (landscape/dark, same session)                    | Disable maxima (ms) | Enable maxima (ms) | Verdict                  |
| --------------------------------------------------------- | ------------------- | ------------------ | ------------------------ |
| Full-plan control, clean main                             | 33.4 / 33.4 / 33.4  | 16.8 / 16.8 / 33.4 | fail                     |
| Full-plan treatment, provisional build                    | 16.8 / 33.6 / 16.9  | 16.8 / 16.8 / 16.8 | pass                     |
| Full-plan prefix through `theme`, traced, treatment build | 33.3 / 16.9 / 16.8  | 16.8 / 16.8 / 16.8 | pass, one two-beat frame |
| Full-plan control repeat, clean main, after the treatment | 16.8 / 33.4 / 16.8  | 16.8 / 16.8 / 16.8 | pass                     |

The clean-main full plan that failed 33.4 / 33.4 / 33.4 an hour earlier passed 16.8 / 33.4 / 16.8
when repeated after the treatment on the same product tree (built at
f53f69d2fac4cc76b5a1d63c556759dd0ccade7c with `web/src` checked out from
f42d0994b27979731c8acc215e6e1f2385b85955, so the served web tree is main's). The untraced A/B is
therefore not evidence of a treatment effect either way; it is the probe's clock.

The traces are the faithful comparison, because the probe's clock hides a blocked frame. Per scored
repeat, the click's input task on `CrRendererMain` measured 35.5 / 32.1 / 29.4 ms (disable) and 35.9
/ 26.0 / 29.8 ms (enable) on clean main against 35.2 / 28.5 / 27.5 ms and 29.2 / 28.3 / 19.6 ms with
the treatment. The part the treatment targets did shrink: `EventDispatch(click)`, which holds the
Svelte flush and the DOM mutations, fell from 8.6–11.8 ms to 3.8–7.0 ms in the enable direction and
reads 4.9–5.8 ms for disable with the treatment. `UpdateLayoutTree` did not move in range (9.5–14.7
ms clean, 8.0–19.6 ms treated): the whole-document restyle of the token flip is what the frame is
made of, and it alone is most of one 60 Hz period. Every scored treatment repeat still blocked the
main thread past 16.7 ms and the compositor still logged a `DroppedFrame` at the first `BeginFrame`
after the click. **Recorded negative against the gate**: the treatment removes 2–5 ms of genuinely
wasted work from every theme flip and does not make the flip fit one vsync; the untraced pass above
is the probe's clock, not the frame fitting. The change ships on that measured merit with the gate
still owed.

## Provenance

Raw roots, both gitignored: `perf-profiles/issue-1696/` holds the clean-main captures, promoted
whole by the evidence keeper into
`perf-profiles/evidence/2026-09-06-issue-1696-android-night-toggle/`;
`perf-profiles/issue-1696-local/` holds the provisional treatment captures, which stay local until
the committed product is certified, and both traces, which stay local.

| Raw source beneath the root                                | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `control-untraced/actions.json`                            | `abaa5569e219ed5bffce57ed39308684592efaf617e9482a609c5d18ae4f43af` |
| `control-full-untraced/actions.json`                       | `abe8983dead98724f6b80b00c1107ed44a556d18b5600758de5074e4d853c2b0` |
| `trace-prefix/actions.json`                                | `cbac7e1d744a1ebf5fbb4319d27bbe14d8dfecfaaca3150bc658f1e71b2a8fed` |
| `trace-prefix/trace.json`                                  | `655a0e0f0fe14c75e4a4ab34dfc293601340566d892b1043e4038d73ff03571b` |
| `../issue-1696-local/treatment-full-untraced/actions.json` | `0fa6f294129e6eb5b5a64705c568221025e2b7aa820977a89a326608a3868a72` |
| `treatment-trace-prefix/actions.json`                      | `3012c36f6240f3ab9db91cbcabc3706a681235c864803fca76334f69868df843` |
| `treatment-trace-prefix/trace.json`                        | `f3109b2254dc4e853a4bb6b473eb1775e96dcb3650f3071f0b782cecf6519753` |
