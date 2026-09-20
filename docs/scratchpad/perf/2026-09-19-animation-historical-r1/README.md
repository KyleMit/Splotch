# Animation before/after evidence for PR 1867: what one frozen harness could and could not capture

Unit `animation-historical-r1` of issue 1870, 2026-09-19 (20:00 to about 21:45 EDT). **This package
does not complete the issue's acceptance.** It adds before/after evidence on two device targets,
inventories what the earlier captures do and do not cover, and preserves three ways the validated
harness turned out to be incompatible with the two historical product builds. Those
incompatibilities block every `coloring` cell, and all of physical iPad Safari, until a separate
harness repair lands.

Run `node docs/scratchpad/perf/2026-09-19-animation-historical-r1/check.mjs` (content claims,
rescored from the packaged samples) and `negative-controls.mjs` (seven mutations with refreshed
hashes, each of which must fail its targeted claims). `compare.mjs --all` prints every per-capture
figure quoted below.

## Identity

| Role    | Revision                                                                        |
| ------- | ------------------------------------------------------------------------------- |
| Before  | a9b633c4392de7ca943d3f927ff86686956cdb83, the first parent of the PR 1867 merge |
| After   | 751093de306f08f771f52f85996f55838b7b0d15, the PR 1867 merge                     |
| Harness | 6b533bb7c164e24f07338c5eef0e30d5dbd5fd2c (main at intake), clean, for every run |

Current main was never built or installed as an arm. Each arm was built in its own detached worktree
at its own commit: `perf:build` for web (provenance stamped clean), `perf:build:cap` plus a signed
Debug `xcodebuild` for the iPad app (bundled, no `server.url`). The Android APKs are the overnight
session's, reused by SHA-256; only the before APK was ever installed, for the one pilot in (4)
below. `BUILD-IDENTITY.json` holds the served entries, the served-build digests (recomputed
independently after the captures with `servedBuildBinding` and equal to what the Android artifacts
recorded), file-listing hashes and the compile-time seams found in all four bundles. A web build's
entry name changes on every build, because the historical version string is a timestamp, so these
entries differ from the overnight ones although the source is the same commit.

## Coverage inventory: nine cues, five targets, two arms

`new` = captured by this unit on the frozen harness, ABBA, one warmup plus three scored repeats.
`reused` = the 2026-09-19 overnight ABBA on the harness that merged as PR 2075, packaged here for
the first time and rescored by today's scorer with identical results. `BLOCKED` = no evidence, for
the reason named. Every new sequence, and the reused macOS web and Android native ones, **omit the
`coloring` group**. The reused Android Chrome set ran the *legacy* coloring sequence instead (the
retired bare open, then scroll, select and clear a page; no `open coloring book` action) with its AI
coverage blocked. No sequence here is the canonical one with separate first-open and reopen rows, so
under the campaign rule that only the canonical sequence certifies, every cell below is partial
evidence, not acceptance.

| Cue (actions)                                                    | macOS web              | Android Chrome              | Android native | iPad native | iPad Safari |
| ---------------------------------------------------------------- | ---------------------- | --------------------------- | -------------- | ----------- | ----------- |
| 1 swatch ring (`change ink color`)                               | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 2 clear (`clear drawing`, `clear drawing on a coloring page`)    | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 3 flyouts (brush menu, stroke-width menu and change)             | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 4 undo (`undo latest stroke`)                                    | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 5 brush face roll (four brush selections)                        | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 6 dialog fly-in: Settings, custom color picker                   | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 6 dialog fly-in: coloring picker, `first open` and `reopen` rows | BLOCKED (1, 2)         | BLOCKED (1, 2); legacy only | BLOCKED (2, 4) | BLOCKED (2) | BLOCKED (3) |
| 7 AI waiting print (`show`, `finish`)                            | reused; new pilot pair | **new** (was blocked)       | reused         | new         | BLOCKED (3) |
| 8 unavailable action (`tap unavailable undo`)                    | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |
| 9 screenshot (`save screenshot`)                                 | reused; new pilot pair | reused; new                 | reused         | new         | BLOCKED (3) |

The "new pilot pair" on macOS web is one capture per arm (the compatibility pilot), not an ABBA. The
overnight Android Chrome captures hold the rest of the coloring flow only behind the retired bare
`open coloring books`, which meant "whichever open the harness reached" and is never read here as a
first open or a reopen; `check.mjs` fails if any packaged sample carries either new label.

### Why the blocked cells are blocked

1. **The frozen coloring preparation cannot see a historical build's installed books.**
   `tools/perf/lib/coloring-books-ready.mjs` reads pack markers as `/coloring/.installed/<book>`,
   the layout of 0919be82a8d2238283b2a143bc6bdfb70b3ec6fe. Neither arm contains that commit; both
   write `/coloring/.installed/<appVersion>/<resolution>/<book>`. The desktop pilot stopped at the
   240 s bound reading "0 of 7" (`pilots/p1-*`), while a read-only probe of the same two previews
   found all seven books installed under the versioned path (`pilots/d1-*`). Invalid input, not a
   product or performance result.
2. **The first-open guard refuses the historical picker.** The guard proves "never opened in this
   document" by finding zero rendered tiles in the closed picker, which relies on `holdForOpen`
   (194e0a41ca626863ea13718a04b3d32df3226476 and later), absent from both arms. On the iPad native
   before build the never-opened picker already held three tiles and the sweep stopped in its first
   repeat (`pilots/p2-*`). The same guard runs on every target, so it would stop the web targets too
   once (1) is repaired.
3. **The iPad action runner has no foreign-build escape.** `perf:ios:xcuitest:actions` checks a
   served web build against its own checkout and, unlike the desktop and Android runners, does not
   pass `--allow-foreign-build` through. It refused both historical previews before opening a
   session, four times out of four (`pilots/p3-*`). The guard was left alone; the trusted HTTPS
   fronts were verified (historical entry served, `/dev` and `/api` answered 403) and stopped.
4. **Android native: the same guard, after an install this unit did not control.** `adb install` of
   the before APK first hung for ten minutes behind a Google Play Protect dialog on the phone. A
   security prompt on the owner's phone is the owner's to answer, so nothing was approved and the
   install command was killed. Sixteen minutes later the phone's installed app had changed anyway:
   its `base.apk` hashed to the before APK and the dialog was gone, so either someone at the phone
   answered it or it resolved itself. With the before arm verifiably installed, one pilot ran and
   the first-open guard refused it in sweep 1 (`already holds 6 rendered tiles`, `pilots/p4-*`), as
   in (2). The phone's original APK was then reinstalled and verified by hash. No scored Android
   native capture ran.

None of these was patched. (1) and (2) need a harness repair in a separate bounded unit: read both
marker layouts; prove "never opened" without depending on product structure the historical arms lack
(or record, per arm, that the guard is not applicable and why). (3) has two routes. The repair is to
plumb the foreign-build flag into the iPad action runner, the documented escape the desktop and
Android runners already have. The rival review of this PR showed a route with no code change as
well: the guard compares served chunks with the bytes in the harness checkout's `web/build`, so
staging each historical build and its provenance stamp there satisfies it with the guard enabled.
This unit did not take that route. Its assignment allowed no new workaround for a compatibility
block, and that is the whole reason. (An earlier revision of this paragraph also claimed the staged
artifact would record a verification flag. It would not: `servedBuildBinding` returns only the
entry, digest and product commit, and the iPad runner discards even those, so an iPad Safari
artifact carries no served-build identity by either route. That is a limit of its own for whoever
captures this target.) Whether that is acceptable is the campaign owner's call; the iPad Safari
captures stay blocked until it is made or the flag is plumbed.

## Results

Gates: 20 ms post-action frame P95; 33.5 ms first frame and worst frame, a worst-frame breach
counting only when two of three scored repeats show it (ADR-0156). No allowances were in force.
Observed cadence: about 17 ms frames on the iPad native WebView; Android Chrome pinned to and
observing 60 Hz. Landscape light on the iPad, portrait light on the phone, in both arms.

### Physical iPad native (new; 19 actions x 4 captures, none blocked)

* **Same gate verdict in both arms:** 17 of 19 actions pass in all four captures with post P95 17 to
  18 ms in both arms, including both AI waiting actions (every scored maximum at or under 23 ms),
  undo, the unavailable-action flash, the Settings and color-picker fly-ins and the blank clear.
  Passing the same thresholds is not equivalence. The clearest measured difference is the one PR
  1867 intended: `open Settings` becomes ready at a median of 243 and 240 ms in the two before
  captures and 331 and 333 ms in the two after captures, the lengthened fly-in, with no frame-gate
  consequence.
* **Red in both arms, so not attributable to PR 1867:** `clear drawing on a coloring page` fails all
  four captures, with two or three scored maxima of 37 to 45 ms each, and first-frame P95 of 37 to
  43 ms in three of the four. The clear sheet on a coloring page was the issue's first suspect; on
  this target the before build is equally red.
* **Differs between arms, descriptive only:** `select Magic brush` shows one gap of about 80 ms (72
  to 84 ms) in 2 of 6 scored repeats before and 5 of 6 after. The two-of-three rule therefore passes
  both before captures and fails both after captures. The hitch itself predates PR 1867; its
  incidence is higher after, on six scored repeats per arm. That supports a suspicion, not an
  attribution: no trace was taken, and the other three brush selections show nothing similar.

### Physical Android Chrome (new; idle control plus 19 actions x 4 captures, none blocked)

* **AI waiting print, previously blocked coverage, now captured in both arms** over the approved
  `adb reverse` localhost route: every finish sample proves a secure context and exactly one stubbed
  generate request. Both actions pass in all four captures; single scored gaps of 33.3 to 33.5 ms
  appear once in after-1 and twice in before-2, and nowhere else.
* **Red in both arms:** `clear drawing on a coloring page` fails before-1, after-2 and before-2 on
  post P95 (33.3 ms) and passes after-1. The overnight captures of the same two commits passed this
  action in all four. Same product source, a different build of it, a different harness revision, a
  different origin route and a different day; this package cannot say which of those matters, and
  the two sets are not pooled.
* Everything else passes in both arms with post P95 16.7 to 16.8 ms.

### macOS web (new pilot pair) and the reused overnight captures

The pilot pair passes all 20 actions on both builds, which is what shows the rest of the frozen
harness is compatible with the historical arms. The twelve reused captures rescore identically under
today's scorer: every action passes; the Android Chrome set is red only through its blocked AI
coverage (insecure LAN origin, zero requests). Their product identity is weaker than the new
captures': the artifacts carry no commit, entry or digest, so it rests on the overnight session's
record of what each port served.

## What is and is not supported

* **Machine-checked here:** every stored summary recomputed by the repo's scorer; repeat and warmup
  structure; action lists and capture conditions equal across arms; Android Chrome served-build
  identity and AI-run proof per sample; the red and passing cells above from raw scored gaps; the
  three pilot failures and the marker probe by their text; absence of first-open and reopen labels.
  Every maximum quoted here is over the frames the scorer gates (`scoredActionFrameGaps`);
  `compare.mjs` prints the raw maxima beside them.
* **Operator provenance only:** which app was installed for each iPad native capture (native
  artifacts carry no product identity; the install log and bundle listing are local), the desktop
  pilot's served build, capture order and exit codes (`CAPTURE-ORDER.tsv`), rig restoration, and the
  Play Protect dialog (its window could not be read).
* **Not claimed:** acceptance of any cue on any target; any cause for the iPad Safari
  `show AI waiting print` maxima of 40, 30 and 38 ms recorded earlier (iPad Safari could not be
  captured at all here, and the iPad native passes are a different runtime); attribution of the
  Magic brush difference; anything about first open or reopen on a historical arm.

Raw artifacts, unsanitized consoles, Appium and WebDriverAgent logs, install logs, build listings
and the scripts that ran each capture stay with the rig under
`evidence/1870/animation-historical-r1/`; each reduction's `sourceSha256` is its raw artifact's
hash. `sourceSha256` for the reused set points at the overnight originals under `evidence/1870/`.
