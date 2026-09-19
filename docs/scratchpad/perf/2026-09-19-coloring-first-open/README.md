# Coloring picker: first open and reopen as separate measurements (2026-09-19)

Evidence for the `coloring-coverage-r1` unit of issue 1870. Harness-validity runs only: nothing here
is a historical comparison or a performance verdict.

## What was wrong

PR 2099 made a sweep settle its installed coloring books by opening the picker before the first
measured action. That fixed the unstable plan, and it also meant the one `open coloring books`
sample was always a reopen. The first open in a document (the dialog's first render of its book
grid) had lost its coverage.

## What changed

* A repeat that includes `coloring` prepares its books in one document, then loads a fresh document
  for the sweep and re-reads that the books are still installed. Preparation's duration is recorded
  per repeat as `coloringPreparation`.
* The sweep measures `first open of coloring books`, closes the picker, and measures
  `reopen coloring books`. The bare `open coloring books` label is retired and the sweep refuses to
  record it, so an old artifact can never be matched to either new label.
* Before the first open the sweep checks that the picker holds no rendered tile. The closed dialog
  keeps the tiles of its last open, so any tile means setup (or anything else) already opened the
  picker in this document, and the sweep stops instead of mislabelling a reopen.
* After the first open it compares the listed book count with preparation's and fails by name on a
  difference.

## What "first open" means here

The first picker open in a fresh document, with the catalog already installed in Cache Storage. It
is **not** a first visit and not an empty HTTP cache: the preparation document fetched the covers
seconds earlier, the desktop runs keep one throwaway browser profile per capture, the Android runner
empties Cache Storage once before repeat 1, and the iPad runner empties it only when it finds a
service worker to unregister. The product also warms cover thumbnails at idle for the next open;
that is product behaviour and was left alone.

## Runs (one warmup plus three scored repeats each)

Product under test: the web tree of main 1640c81c607f26adbfdcdb0a566294a63020b344, built as
`perf:build` at 3453f1f28b2f7b23560414700ebad04201d9c3af (clean; `git diff` of `web/`,
`package.json`, the lockfile and the Capacitor config against main is empty). Entry
`start.B76rsZ-2.js`, served catalog `manifest-1.6.820.json`, 8 books. The iPad native run used the
perf Debug app already installed on the rig (an earlier main; native artifacts carry no product
commit, so its exact build is operator provenance only).

| Run                             | Target                                         | Result                                                                                 | Preparation, repeat 1 / later |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| `d1-chromium-coloring`          | desktop Chromium, `coloring` alone             | pass, 6 actions                                                                        | 3.7 s / 3.8 s                 |
| `d2-webkit-full-groups`         | desktop WebKit, the 12 campaign groups         | pass, 26 actions                                                                       | 116 s / 4.0 s                 |
| `a3-android-chrome-full-groups` | physical Android Chrome, same groups, portrait | pass, 26 actions                                                                       | 24.8 s / 4.1 s                |
| `i1-ipad-safari-full-groups`    | physical iPad Safari, same groups, landscape   | pass, 26 actions                                                                       | 144 s / 4.3 s                 |
| `i2-ipad-native-full-groups`    | physical iPad native, the 11 native groups     | pass, 25 actions; nothing to prepare, the sweep's one document never opened the picker | none                          |

Commands are the first lines of each `runs/*.console.txt`. The physical routes are the approved
ones: `adb reverse` to `http://localhost:<port>` for the phone, the name-constrained CA and the
restricted HTTPS front for iPad Safari, and a direct WebDriverAgent with `webDriverAgentUrl` for
both iPad runs (Appium's device discovery is stale on this host).

On both iPad routes every page scroll began with one trusted native `pointerdown` on the picker's
gutter `DIV` at CSS x 685 of a 1366 px wide viewport, two pixels off the centre column, and the grid
scrolled in 4 of 4 repeats. That is the PR 2101 offset, validated on the iPad.

Desktop Chromium shows the two opens are different work: every first open became ready later than
every reopen (2.0 to 3.3 ms against 1.1 to 1.3 ms). Other targets' ready times are dominated by the
dialog's own animation and do not separate; their per-repeat values are in the reduced samples.

## Controls

* `controls/n1-*`: with the fresh-document load removed (the patch is beside it, never committed),
  the capture stops before its first measured coloring action: `already holds 8 rendered tiles`.
* `controls/n2-*`: the new tests run against main's sweep and runners. Exactly the five placement
  tests fail, each for the missing behaviour.

## Android Chrome: a static page stops installing books

The first two phone captures (`android-install-stall/a1-*`, `a2-*`) failed by name at the 240 s
bound with 1 of 7 extra books installed. Probes on the same page (`a0c` to `a0e`) show:

* the connection was allowed (`wifi`, `4g`, no Save-Data), a 185 KB fetch over `adb reverse` took 13
  ms, no lock was held, no fetch was pending and nothing was logged;
* slowing the harness's poll from 0.5 s to 5 s changed nothing (`a2`);
* once the probe requested animation frames, the same page finished the catalog in 21 s (`a0e`).

The product waits on an untimed `requestIdleCallback` before each pack file
(`web/src/lib/coloringPacks/webStore.ts` `waitForIdle`). Reading: Chrome on this phone grants no
idle period to a page that draws nothing, so the first book rode the picker's animation frames and
the rest never started. The harness now requests frames while it waits, in the preparation document
only. Whether a real child on a static screen meets the same stall is **not established** and is a
drafted leftover on the PR.

## Claim support

* **Machine-checked** by `check.mjs`: everything in the tables and bullets above that names a count,
  label, order, duration, error text or hit target.
* **Operator-observed only:** the product identity of the installed iPad app; that the n1 patch was
  the only difference in that run; rig restoration; the `idleCallbackMs` readings in `a0e`, which
  the probe's own frame request makes unrepresentative of a static page.
* **Unsupported:** any performance conclusion; any statement about historical artifacts' opens; the
  cause of the Android stall beyond the two observations above.

`runs/*.actions.reduced.json` keep every scored timing per sample (first frame, ready, each
post-action frame gap) and the source artifact's SHA-256, so each summary can be recomputed;
`reduce-actions.jq` is the reduction. Raw artifacts, unsanitized consoles, the Appium and
WebDriverAgent logs and the probe script stay local with the rig because they name the devices.
`package.mjs` rewrites `MANIFEST.json`.
