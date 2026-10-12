# macOS web coloring capture: why the action plan changed between repeats

Unit `coloring-state-r1` of the performance campaign (issue 1870, campaign plan on issue 1567). Run
on 2026-09-19 against main e9ab82308731cb4927e04afb326c1c961cf5e72f.

`node docs/scratchpad/perf/2026-09-19-coloring-action-plan/check.mjs` re-derives every
machine-checked claim below from the packaged files and exits non-zero if one fails.

## The failure

`perf:web:actions` with the `coloring` group and the rest of the campaign's groups aborted after
sweep 2 on every attempt:

```text
The applicable action plan changed between scored repeats: +open coloring book
```

It was drafted on PR 2075 as a "cold/warm pack-arrival race". That was a hypothesis. The cause is
deterministic, and it has three parts.

## Cause

1. **A web visit's extra coloring books wait for engagement.** `web/src/lib/boot/coloringPacks.ts`
   holds a first visit's downloads until the child draws a few strokes or opens the picker. A fresh
   context held no pack cache through 12 s without input (`probes/pack-timeline-main.json`). After
   the picker's opening tap, WebKit installed one book every 15 to 17 s.
2. **An open picker shows the books known when it opened.** `createColoringPickerBooks` says so in
   its own comment: one known book drills straight into its pages, two or more show a book grid. So
   sweep 1 always met the one-book picker, and its own tap is what released the downloads.
3. **Whether sweep 2 saw those books depended on a service worker.** The desktop runner reloaded the
   app once per sweep inside an ephemeral Playwright context. An ephemeral WebKit context drops
   every Cache Storage entry on reload, for a cache the app knows nothing about as well
   (`probes/reload-cache-control-webkit.json`: 1 entry, then 0). Chromium keeps it, and so does a
   persistent WebKit profile. With the full group list, sweep 1's strokes registered the service
   worker. That worker kept the storage alive across the reload, so the two books sweep 1 installed
   were published before sweep 2 opened its picker.

The instrumented pre-fix run shows parts 2 and 3 together
(`controls/f2-prefix-full-groups-instrumented.console.txt`): sweep 1 opened a picker with 0 book
choices and 6 pages and no controlling service worker; sweep 2 opened one with 3 book choices under
a controlling service worker; the capture aborted.

This also explains the run that did **not** abort. A pre-fix capture of the `coloring` group alone
passed (`runs/f0-prefix-coloring-only.json.gz`) and never met a book choice. No strokes means no
service worker, so every reload emptied the storage. Worse, the reloaded page could not store books
again: for 140 s it held zero entries, and the product logged
`Coloring pack changed while installing: dinosaur` (`probes/post-reload-timeline-webkit.json`). A
second probe that never reads Cache Storage before the reload sees the same, so the probe did not
cause it (`probes/reload-without-cache-reads-webkit.json`).

So the picker a sweep measured depended on which groups ran before it and how long they took. Had
the plan check not caught it, sweeps 2 to 4 would also have measured grids of different sizes (3,
then more books) while downloads ran under the other measured actions.

## Treatment

* **`tools/perf/lib/coloring-books-ready.mjs`.** A sweep that includes `coloring` settles the
  installed books before its first measured action. It opens and closes the picker (the product's
  own engagement path), waits for an install marker for every book in the served catalog, and then
  confirms through the picker that the product lists them all. Both waits are bounded (240 s and 30
  s) and fail with the missing books or both counts named. The listed count is recorded as
  `actionPlan.context.listedColoringBooks`, so the unchanged stable-plan check now also refuses a
  book count that differs between repeats. A target without web pack storage (a native shell) is
  left as it was. The install state is a page Promise, so it travels over a transport that awaits
  one (`page.evaluate`, or Appium's `/execute/async` through `executePagePromise`), and every read
  has its own deadline: the page aborts its fetches at 15 s and the harness stops waiting at 20 s.
  Both came from the rival review of PR 2099, which reproduced the iPad route returning `{}` over
  `/execute/sync` and a stalled fetch outliving both waits.
* **`tools/perf/web/capture-desktop-actions.mjs`.** The capture runs in a throwaway browser profile
  instead of an ephemeral context, so storage carries across the per-sweep reloads as it does in a
  real browser. The profile starts empty and is deleted afterwards.

Rejected: treating the book grid as warm-only or dropping `open coloring book` (omits a required
action); a fixed delay (Chromium's whole four-sweep capture took 50 s, while WebKit's install alone
took about 110 s); waiting only for markers (a prepared context publishes its books at idle after
boot, so the markers exist before the picker would list them); keeping the ephemeral context and
waiting in every sweep (tried first: sweep 1 passed, sweep 2 failed with
`0 of 7 extra books installed` after 240 s, for the broken post-reload storage above).

## Runs

Each run is one warmup plus three scored repeats at 1512x982@2x, headless, against one preview of
the instrumented build.

| Id | Harness                                                        | Engine, groups                                | Result                                                                              |
| -- | -------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| f0 | pre-fix                                                        | WebKit, `coloring`                            | passed, one-book picker in all four sweeps, no `open coloring book`                 |
| f1 | pre-fix                                                        | WebKit, the 12 campaign groups                | **aborted after sweep 2**, `+open coloring book`                                    |
| f2 | pre-fix plus `controls/f2-diagnostic.patch.txt` (logging only) | the same                                      | aborted the same way; picker and service-worker state per sweep                     |
| p1 | post-fix                                                       | WebKit, `coloring`                            | passed; fresh context in sweep 1, prepared in 2 to 4; 8 books listed in every sweep |
| p2 | post-fix                                                       | WebKit, the 12 campaign groups (f1's command) | passed, 25 actions, 8 books listed in every sweep                                   |
| p3 | post-fix                                                       | Chromium, `coloring`                          | passed, 8 books listed in every sweep                                               |
| q1 | final (after review round one)                                 | WebKit, the 12 campaign groups (f1's command) | passed, 25 actions, 8 books listed in every sweep                                   |
| q2 | final                                                          | WebKit, `coloring`                            | passed, 8 books listed in every sweep                                               |
| q3 | final                                                          | Chromium, `coloring`                          | passed, 8 books listed in every sweep                                               |

In p1 to p3 and q1 to q3 every sweep ran the real picker: open the book grid, open a book, scroll
its pages with a trusted wheel, select a page, clear it. `check.mjs` asserts each of the five
actions has repeats 1 to 4 with repeat 1 the warmup.

`controls/n1-new-tests-against-prefix-harness.txt`: with the sweep and the desktop runner reverted
to main, the new test file fails exactly its three placement tests (no settle before the first
measured action, no recorded book count, no browser profile) and passes the other 13.

These are harness-validity runs. Their frame figures are current-main numbers from a headless
desktop and are not a historical comparison for issue 1870.

## Identity

* Product: main e9ab82308731cb4927e04afb326c1c961cf5e72f, `perf:build`, provenance file clean, app
  version 1.6.791, entry `start.zye73Geg.js`. **Operator-observed**: the desktop artifact records no
  product commit, so this rests on the build log and the provenance file read in the session.
* Harness: f0 to f2 ran main's harness. p1 to p3 ran the working tree that became commit
  13f2d06839d5f5b6e131a5a8cfa8edd8ae7e0aad (the first post-fix harness). q1 to q3 ran the working
  tree that became the review-fix commit after it, with the promise transport and the bounded reads.
  The harness files were not edited between each set of runs and its commit. **Operator-observed.**
* The probes ran importing `playwright`; the packaged copies import the same classes from
  `@playwright/test`, which the repo's lint rule requires, and were re-run once in that form.
* The stack-trace paths in f1 and f2 had the local checkout prefix replaced with `<checkout>`.

## Not supported by this package

* **No device target was recaptured.** The shared sweep now runs the readiness step on iPad Safari,
  Android Chrome and both native shells as well. Only desktop WebKit and Chromium ran it for real.
  The iPad route is covered by a model of Appium's two execute transports in
  `tools/perf/tests/coloring-books-ready.test.mjs`, not by a device. The iPad runner also clears the
  device web cache and blocks service-worker registration for measurement, so how long its install
  wait takes is unknown.
* **The measured `open coloring books` is now always a warm open.** Setup opens the picker at least
  twice before the first measured action, so the lazy dialog chunk and the cover images are already
  loaded. Before this change the measured open was the first open after each reload. These captures
  cannot speak to cold-open cost.
* The service worker's role is consistent with the evidence (f2's `sw` flag, and both no-worker
  probes losing storage) and was not isolated by toggling the worker alone.

* The first ephemeral-context attempt's console was not kept. Its failure text above is
  operator-observed; `probes/post-reload-timeline-webkit.json` is the packaged evidence for it.
* Why a reloaded ephemeral WebKit page cannot store packs again is not explained. It is a property
  of the test context, not shown in a real Safari profile.
* WebKit's 15 to 17 s per book against Chromium's much faster install is recorded, not explained.
* `--headed` was not re-run. The original report used it; the cause above does not depend on it.
* A pre-fix capture **without** the `coloring` group still restarts downloads at boot in later
  sweeps once sweep 1's strokes engage, so downloads can overlap its measured actions. Not changed
  here.

## Android native is a different failure

The overnight Android-native captures failed with `Timed out waiting for coloring pages to scroll`
in **sweep 1**, in the three runs after the first. The first run passed all four sweeps with
`open coloring book` present in each. So the book grid was there and the plan never changed: the
native touch swipe over the dialog produced no scroll. That target has no web pack storage, and the
readiness step returns without acting there. Nothing in this package applies to it, and no Android
capture was run. Hypotheses, none tested: the rig's known dead spot for swipes that start near the
screen centre (PR 2084's leftover); state left by the APK reinstall between arms; the gesture being
taken as a press on a tile.
