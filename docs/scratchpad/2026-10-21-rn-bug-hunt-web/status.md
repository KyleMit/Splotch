# RN web bug hunt status

* 2026-10-21 02:16Z — START: Read the main brief and web addendum. Web-only lane; no Android,
  commits, pushes, or product-source changes. Preparing the inherited plan, RN export,
  coloring-aware host, and remote browser connection.

* 2026-10-21T02:18:10.791Z — SETUP: RN export and post-build guards passed; serving 6150 (PID
  28085), coloring WebP verified. Remote Chromium connected; three-profile D01 admission executed;
  see results. Extended web plan written.

* 2026-10-21T02:21:01.905Z — CHROMIUM drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T02:24:14.908Z — CHROMIUM drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21 02:24Z — REGRESSION TESTS: Added two public-DOM pointer adapter cases in
  tools/tests/native-paper-input-web.test.mjs: blur cancels two held pointers and permits a fresh
  contact; canceling one pointer keeps its peer active. All 13 targeted tests pass. Each new case
  fails against its isolated copied-source deliberate break (removed blur listener; clear-all
  instead of deleting canceled pointer), with assertion failures preserved in
  evidence/negative-blur-take2.log.txt and negative-cancel-all.log.txt. Product source unchanged.

* 2026-10-21 02:25Z — BROWSER ADMISSION: Confirmed separate Chromium 153.0.8010.12, WebKit 26.6 and
  Firefox engines via the supplied websocket endpoint (actual browser type and UA saved in
  evidence/browser-admission.json). All connections closed. Paced-input diagnostic confirms Pen,
  Crayon and Magic render ink and Undo returns the exact settled blank crop; screenshots retained.
  Full corrected Chromium batch running.

* 2026-10-21 02:27Z — PLAN CORRECTION: Repeated 25-stroke runs consistently expose 20 Undo units.
  Source confirms RN imports shared MAX_UNDO_DEPTH=20 from shipping undoHistory.ts; only
  stroke/point caps were removed. Corrected inherited D11 expectation from 25 to 20. This is a bad
  inherited expectation, not a product defect.

* 2026-10-21T02:30:48.911Z — CHROMIUM drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T02:31:52.527Z — chromium UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

* 2026-10-21T02:32:29.377Z — chromium UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

* 2026-10-21T02:35:07.458Z — chromium UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

* 2026-10-21T02:36:25.894Z — chromium Settings action batch ended; public controls used for sound,
  drawer, accessibility, coloring, camera and Parent Center policies/keypad.

* 2026-10-21T02:37:34.705Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T02:38:47.397Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T02:39:27.353Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21 02:40Z — CHROMIUM CHECKPOINT: Phone, tablet, desktop and narrow Settings
  entry/focus/style/viewport runs recorded. Phone sound/drawer/accessibility/coloring/camera
  controls pass. Six AI error fixtures pass; corrected held-success/minimize/report/IndexedDB flow
  passes on phone with one upload and one confirmed fixture report, zero unexpected external
  requests. Typecheck passed; lint exit 0 (three harness unused warnings subsequently cleaned, two
  baseline warnings remain). Input/multitouch and Farm/clear/media cases started. Still no
  twice-reproduced, source-validated defect recorded.

* 2026-10-21T02:40:53.978Z — chromium input batch ended; trusted mouse on three profiles, Chromium
  trusted pen/multitouch where applicable, and idle-gap regression attempted.

* 2026-10-21T02:42:02.762Z — chromium platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

* 2026-10-21T02:42:34.618Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T02:43:03.902Z — chromium Settings action batch ended; public controls used for sound,
  drawer, accessibility, coloring, camera and Parent Center policies/keypad.

* 2026-10-21T02:44:17.744Z — chromium offline/install/storage batch ended; actual SW control and
  offline hydration assertions recorded separately from install event fixtures.

* 2026-10-21T02:45:25.325Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T02:45:46.578Z — chromium offline/install/storage batch ended; actual SW control and
  offline hydration assertions recorded separately from install event fixtures.

* 2026-10-21T02:46:01.877Z — chromium PWA changed-revision fixture ended; proxy 6152 closed. No
  second release artifact claimed.

* 2026-10-21 02:46Z — CHROMIUM PWA: Actual service-worker control/offline reload, drawing, lazy
  Sound and cached Farm passed at all three primary profiles. Install beforeinstallprompt fixture
  passed phone/desktop/narrow after honoring the documented collapsed-drawer visibility guard.
  Changed-worker/version fixture passed: ink prevents hidden reload, blank hidden state
  activates/reloads, subsequent offline drawing works. Proxy 6152 closed. This is a same-artifact
  worker revision test, not a second release artifact. Quota retry candidate reproduced twice;
  deeper recovery probe running before classification.

* 2026-10-21 02:49Z — FINDING WEB-001 (S2): Two fresh-context probes confirm that one transient AI
  preparation put refusal poisons subsequent Try again and reopen attempts after writes are
  restored; exactly one refused put and zero uploads before reload, then fixture generation succeeds
  after reload. Source pins the uncertain-owner/no-reread path. Shipping comparison succeeds without
  a preparation put (different persistence contract explicitly noted). Wrote findings.jsonl and
  minimal repro/ai-quota-recovery.mjs; no product edits or GitHub writes.

* 2026-10-21T02:50:22.356Z — CHROMIUM drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T02:50:36.909Z — chromium gate lockout case ended: three wrong answers, real-clock
  disabled-key interval, recovery and keyboard solution attempted.

* 2026-10-21T02:50:57.177Z — chromium browser Back batch ended; modal dismissal and coarse-pointer
  one-Back guard exercised against a local sentinel fixture.

* 2026-10-21T02:51:48.478Z — chromium platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

* 2026-10-21 02:54Z — PIXEL TRIAGE: Eraser Undo differs on 32 pixels (max channel delta 8); Farm
  Clear differences follow thin outline antialiasing. Added a one-pixel local color-envelope
  diagnostic with raw crops retained. Positive control accepts the art fringe; deliberately removing
  the stroke produces 1,439 violating pixels (evidence/pixel-comparator-control.json), unlike the
  discarded mean-only check that could accept a missing thin stroke. This is diagnostic rendering
  equivalence, not token-exact or final parity acceptance. Corrected Clear and real-clock gate cases
  precede sequential WebKit/Firefox batches.

* 2026-10-21T02:54:51.001Z — chromium platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

* 2026-10-21T02:55:37.726Z — chromium gate lockout case ended: three wrong answers, real-clock
  disabled-key interval, recovery and keyboard solution attempted.

* 2026-10-21T02:55:37.777Z — START webkit/input; one remote browser connection at a time.

* 2026-10-21T02:56:20.314Z — webkit input batch ended; trusted mouse on three profiles, Chromium
  trusted pen/multitouch where applicable, and idle-gap regression attempted.

* 2026-10-21T02:56:20.337Z — END webkit/input: process exit 0, 43s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T02:56:20.338Z — START webkit/drawing; one remote browser connection at a time.

* 2026-10-21T03:02:08.197Z — WEBKIT drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T03:02:08.215Z — END webkit/drawing: process exit 0, 348s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:02:08.216Z — START webkit/ui; one remote browser connection at a time.

* 2026-10-21T03:06:08.207Z — webkit UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

* 2026-10-21T03:06:08.221Z — END webkit/ui: process exit 0, 240s. Product outcomes are the per-case
  observations, not this process exit.

* 2026-10-21T03:06:08.221Z — START webkit/settings-actions; one remote browser connection at a time.

* 2026-10-21T03:09:42.715Z — webkit Settings action batch ended; public controls used for sound,
  drawer, accessibility, coloring, camera and Parent Center policies/keypad.

* 2026-10-21T03:09:42.735Z — END webkit/settings-actions: process exit 0, 215s. Product outcomes are
  the per-case observations, not this process exit.

* 2026-10-21T03:09:42.735Z — START webkit/platform; one remote browser connection at a time.

* 2026-10-21T03:12:51.849Z — webkit platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

* 2026-10-21T03:12:51.864Z — END webkit/platform: process exit 0, 189s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:12:51.864Z — START webkit/ai; one remote browser connection at a time.

* 2026-10-21T03:15:57.713Z — webkit AI batch ended: fixture success/minimize/report and error/retry
  cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T03:15:57.727Z — END webkit/ai: process exit 0, 186s. Product outcomes are the per-case
  observations, not this process exit.

* 2026-10-21T03:15:57.727Z — START webkit/gate-lockout; one remote browser connection at a time.

* 2026-10-21T03:16:44.386Z — webkit gate lockout case ended: three wrong answers, real-clock
  disabled-key interval, recovery and keyboard solution attempted.

* 2026-10-21T03:16:44.400Z — END webkit/gate-lockout: process exit 0, 47s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:16:44.400Z — START webkit/offline-install-storage; one remote browser connection at
  a time.

* 2026-10-21T03:17:32.538Z — webkit offline/install/storage batch ended; actual SW control and
  offline hydration assertions recorded separately from install event fixtures.

* 2026-10-21T03:18:40.536Z — webkit library case ended: held extra-book asset, drawing while
  pending, download inventory, offline extra-book selection, removal and starter retention
  attempted.

* 2026-10-21T03:20:53.204866+00:00 — RESUMED: Prior worker listeners 6150–6189 absent; orchestrator
  6190 retained. Reusing qualified b236d639 export; owned server 6150 PID 33717, tool session 86201.
  WebKit remaining library/save/update/history plus blocked-case triage, then Firefox and final
  regression checks. No product edits.

* 2026-10-21T03:22:44.236Z — webkit repeated-save case ended: 25 distinct PNG downloads, cooldown
  behavior and download object-URL release attempted; result receipt saved.

* 2026-10-21T03:23:52.874Z — START webkit/library; one remote browser connection at a time.

* 2026-10-21T03:25:35.903169+00:00 — WEBKIT TRIAGE: 25 distinct picture downloads pass and release
  all download URLs. Two fresh public AI flows fail before any upload. Captured WebKit canvas PNGs
  contain eXIf; real originalImageGrid rejects all six captured files, while removing only that
  chunk admits the same dimensions (evidence/webkit-png-reader.json). Shipping WebKit comparison
  pending after the current one-browser batch. Increased the library observation window from 60s to
  240s because the prior screenshot showed healthy in-progress downloads. Pointer regressions rerun:
  13 pass; both copied-source deliberate breaks fail assertions.

* 2026-10-21T03:26:12.107Z — webkit library case ended: held extra-book asset, drawing while
  pending, download inventory, offline extra-book selection, removal and starter retention
  attempted.

* 2026-10-21T03:26:12.120Z — END webkit/library: process exit 0, 139s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:26:12.121Z — START webkit/coloring-brushes; one remote browser connection at a time.

* 2026-10-21T03:26:35.630Z — webkit coloring-brush case ended: Magic reveal, erasure, Undo and
  light/night page-art switching attempted.

* 2026-10-21T03:26:35.649Z — END webkit/coloring-brushes: process exit 0, 24s. Product outcomes are
  the per-case observations, not this process exit.

* 2026-10-21T03:26:35.649Z — START webkit/update; one remote browser connection at a time.

* 2026-10-21T03:26:48.728Z — webkit PWA changed-revision fixture ended; proxy 6152 closed. No second
  release artifact claimed.

* 2026-10-21T03:26:48.747Z — END webkit/update: process exit 0, 13s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:26:48.747Z — START webkit/back; one remote browser connection at a time.

* 2026-10-21T03:27:09.023Z — webkit browser Back batch ended; modal dismissal and coarse-pointer
  one-Back guard exercised against a local sentinel fixture.

* 2026-10-21T03:27:09.035Z — END webkit/back: process exit 0, 20s. Product outcomes are the per-case
  observations, not this process exit.

* 2026-10-21T03:27:09.035Z — START firefox/library; one remote browser connection at a time.

* 2026-10-21T03:28:10.111Z — firefox library case ended: held extra-book asset, drawing while
  pending, download inventory, offline extra-book selection, removal and starter retention
  attempted.

* 2026-10-21T03:28:10.128Z — END firefox/library: process exit 0, 61s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:28:10.129Z — START firefox/coloring-brushes; one remote browser connection at a
  time.

* 2026-10-21T03:28:34.551Z — firefox coloring-brush case ended: Magic reveal, erasure, Undo and
  light/night page-art switching attempted.

* 2026-10-21T03:28:34.561Z — END firefox/coloring-brushes: process exit 0, 24s. Product outcomes are
  the per-case observations, not this process exit.

* 2026-10-21T03:28:34.561Z — START firefox/update; one remote browser connection at a time.

* 2026-10-21T03:28:47.997Z — firefox PWA changed-revision fixture ended; proxy 6152 closed. No
  second release artifact claimed.

* 2026-10-21T03:28:48.005Z — END firefox/update: process exit 0, 13s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:28:48.005Z — START firefox/back; one remote browser connection at a time.

* 2026-10-21T03:29:10.044Z — firefox browser Back batch ended; modal dismissal and coarse-pointer
  one-Back guard exercised against a local sentinel fixture.

* 2026-10-21T03:29:10.055Z — END firefox/back: process exit 0, 22s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:29:20.380Z — START webkit/reference-ai; one remote browser connection at a time.

* 2026-10-21T03:29:21.543856+00:00 — QUEUE NOTE: The resumed runner’s plural HUNT_ENGINES setting
  defaulted to both engines despite singular HUNT_ENGINE=webkit. It consequently completed Firefox
  library/update/history admission early, sequentially, after WebKit’s remaining batches; no
  overlapping browsers. The runner now honors either spelling. Finishing WebKit comparison/offline
  triage before the full Firefox matrix.

* 2026-10-21T03:29:25.691Z — END webkit/reference-ai: process exit 1, 5s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:29:25.692Z — START webkit/offline-host-loss; one remote browser connection at a
  time.

* 2026-10-21T03:30:32.202Z — START webkit/reference-ai; one remote browser connection at a time.

* 2026-10-21T03:30:42.691Z — END webkit/reference-ai: process exit 0, 10s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:30:42.692Z — START webkit/offline-host-loss; one remote browser connection at a
  time.

* 2026-10-21T03:30:43.105Z — END webkit/offline-host-loss: process exit 1, 0s. Product outcomes are
  the per-case observations, not this process exit.

* 2026-10-21T03:31:16.657Z — START webkit/reference-ai; one remote browser connection at a time.

* 2026-10-21T03:31:17.822751+00:00 — HARNESS CORRECTION: offline-host-loss first used one stroke,
  below SETTLED_IN_STROKES=3; discard its registration timeout. Direct signal to owned child PID
  74422 was sandbox-denied; an attempted corrected run briefly overlapped that waiting probe and
  collided on owned proxy 6153. Discard that comparison take too. Stopped old run via tool handle
  51743 and server handle 86201; confirmed 6153 released, restarted RN host on 6150 (PID 77040,
  handle 90255). Corrected three-stroke offline probe and shipping comparison rerunning
  sequentially. Orchestrator 6190 untouched.

* 2026-10-21T03:31:27.313Z — END webkit/reference-ai: process exit 0, 11s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:31:27.314Z — START webkit/offline-host-loss; one remote browser connection at a
  time.

* 2026-10-21T03:31:58.232916+00:00 — FINDING WEB-002 (S2): WebKit’s own canvas PNG contains eXIf
  metadata rejected by the RN original-image reader before any upload. Two fresh phone contexts plus
  all-profile matrix symptoms; six captured PNGs rejected, identical PNGs with only eXIf removed
  admitted. Final sequential shipping WebKit comparison shows the fixture picture and Download
  action. Appended finding and focused public-flow/PNG-reader repros; no product edits.

* 2026-10-21T03:32:13.390Z — webkit offline host-loss checks ended; each case stopped only its owned
  proxy 6153.

* 2026-10-21T03:32:13.406Z — END webkit/offline-host-loss: process exit 0, 46s. Product outcomes are
  the per-case observations, not this process exit.

* 2026-10-21T03:32:23.522Z — START webkit/update; one remote browser connection at a time.

* 2026-10-21T03:32:37.594Z — webkit PWA changed-revision fixture ended; proxy 6152 closed. No second
  release artifact claimed.

* 2026-10-21T03:32:37.612Z — END webkit/update: process exit 0, 14s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:35:04.468Z — webkit Settings action batch ended; public controls used for sound,
  drawer, accessibility, coloring, camera and Parent Center policies/keypad.

* 2026-10-21T03:35:25.097Z — WEBKIT drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T03:35:39.104378+00:00 — WEBKIT PHASE COMPLETE ahead of 08:30Z: Library/offline
  extras/removal/starter retention, 25 saves, Farm Magic/eraser/night, Back, controlled offline
  shell and corrected update all pass. Rechecked desktop/tablet drawer/coloring/camera/parent
  policies and desktop custom color: pass. WEB-002 explains pre-upload AI failures; downstream
  fixture cases stay blocked. CSS-zoom surrogate failure and automation offline-toggle errors are
  documented limits, not filed defects. Main Firefox matrix starts next; coverage-scope.md
  enumerates every plan row and its remaining axes.

* 2026-10-21T03:35:39.137Z — START firefox/input; one remote browser connection at a time.

* 2026-10-21T03:36:25.852Z — firefox input batch ended; trusted mouse on three profiles, Chromium
  trusted pen/multitouch where applicable, and idle-gap regression attempted.

* 2026-10-21T03:36:25.869Z — END firefox/input: process exit 0, 47s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:36:25.870Z — START firefox/drawing; one remote browser connection at a time.

* 2026-10-21T03:42:28.312Z — FIREFOX drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

* 2026-10-21T03:42:28.329Z — END firefox/drawing: process exit 0, 362s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:42:28.329Z — START firefox/ui; one remote browser connection at a time.

* 2026-10-21T03:46:43.099Z — firefox UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

* 2026-10-21T03:46:43.112Z — END firefox/ui: process exit 0, 255s. Product outcomes are the per-case
  observations, not this process exit.

* 2026-10-21T03:46:43.112Z — START firefox/settings-actions; one remote browser connection at a
  time.

* 2026-10-21T03:50:58.818Z — firefox Settings action batch ended; public controls used for sound,
  drawer, accessibility, coloring, camera and Parent Center policies/keypad.

* 2026-10-21T03:50:58.829Z — END firefox/settings-actions: process exit 0, 256s. Product outcomes
  are the per-case observations, not this process exit.

* 2026-10-21T03:50:58.829Z — START firefox/platform; one remote browser connection at a time.

* 2026-10-21T03:54:16.855Z — firefox platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

* 2026-10-21T03:54:16.877Z — END firefox/platform: process exit 0, 198s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:54:16.877Z — START firefox/ai; one remote browser connection at a time.

* 2026-10-21T03:57:31.861Z — firefox AI batch ended: fixture success/minimize/report and error/retry
  cases attempted. All /api calls intercepted; request receipts saved.

* 2026-10-21T03:57:31.874Z — END firefox/ai: process exit 0, 195s. Product outcomes are the per-case
  observations, not this process exit.

* 2026-10-21T03:57:31.874Z — START firefox/gate-lockout; one remote browser connection at a time.

* 2026-10-21T03:58:19.986Z — firefox gate lockout case ended: three wrong answers, real-clock
  disabled-key interval, recovery and keyboard solution attempted.

* 2026-10-21T03:58:20.001Z — END firefox/gate-lockout: process exit 0, 48s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:58:26.287Z — START firefox/ai-webkit-diagnostic; one remote browser connection at a
  time.

* 2026-10-21T03:58:27.459729+00:00 — FIREFOX MAIN MATRIX ended: input/drawing, all four-width
  Settings UI checks, all 18 Settings action units, platform fixtures and parent lockout recorded.
  AI fails upstream before generation uploads at all primary profiles, like WebKit; fake-key
  persistence passes. Sequential fresh-context PNG capture, a focused halo check, corrected update
  and local-server-loss offline checks start next. No product changes.

* 2026-10-21T03:58:44.882Z — END firefox/ai-webkit-diagnostic: process exit 0, 19s. Product outcomes
  are the per-case observations, not this process exit.

* 2026-10-21T03:58:44.883Z — START firefox/halo-lift; one remote browser connection at a time.

* 2026-10-21T03:59:56.559Z — firefox halo lift diagnostic ended: 0 retained-halo observations in 8
  independent contexts; see exact public SVG/clock receipts.

* 2026-10-21T03:59:56.597Z — END firefox/halo-lift: process exit 0, 72s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T03:59:56.597Z — START firefox/update; one remote browser connection at a time.

* 2026-10-21T04:00:12.493Z — firefox PWA changed-revision fixture ended; proxy 6152 closed. No
  second release artifact claimed.

* 2026-10-21T04:00:12.514Z — END firefox/update: process exit 0, 16s. Product outcomes are the
  per-case observations, not this process exit.

* 2026-10-21T04:00:12.514Z — START firefox/offline-host-loss; one remote browser connection at a
  time.

* 2026-10-21T04:00:59.340Z — firefox offline host-loss checks ended; each case stopped only its
  owned proxy 6153.

* 2026-10-21T04:00:59.378Z — END firefox/offline-host-loss: process exit 0, 47s. Product outcomes
  are the per-case observations, not this process exit.

* 2026-10-21T04:01:49.453805+00:00 — WEB-002 EXTENDED, not duplicated: Firefox 155 independently
  fails twice on browser-added deBG after IDAT. Six captured Firefox PNGs fail the real reader;
  removing only deBG admits them. Mozilla encoder source confirms that chunk is a browser output
  feature; see firefox-png-provenance.md. Same-commit shipping Firefox completes the recorded
  success fixture with one valid WebP upload. WEB-002 now covers both browser PNG variants. The
  simple halo follow-up observed zero retained halos in eight fresh contexts; no third defect filed.
  Corrected Firefox update and offline host-loss pass at all applicable profiles. Final
  install/two-tab/25-save checks are running.

* 2026-10-21T04:02:04.664Z — firefox offline/install/storage batch ended; actual SW control and
  offline hydration assertions recorded separately from install event fixtures.

* 2026-10-21T04:03:59.053Z — firefox repeated-save case ended: 25 distinct PNG downloads, cooldown
  behavior and download object-URL release attempted; result receipt saved.

* 2026-10-21T04:04:13.369578+00:00 — FIREFOX FINAL SAVE CHECK: Install prompt fixtures and two-tab
  settings pass. First 25-save run passes PNG format/count and URL release. Because Firefox adds
  canvas metadata, strengthened the repeated-save probe to require 25 distinct decoded-pixel hashes
  as well as PNG hashes; running only that changed check again. Earlier receipt and endpoint PNGs
  retained with -encoded-only names.

* 2026-10-21T04:06:01.607Z — firefox repeated-save case ended: 25 distinct PNG downloads, cooldown
  behavior and download object-URL release attempted; result receipt saved.

* 2026-10-21T04:06:19.455593+00:00 — FIREFOX PHASE COMPLETE ahead of 10:30Z: Main matrix plus
  corrected update/offline, install fixtures, two-tab settings and repeated downloads completed. The
  final repeated-save run proves 25 distinct decoded pictures, not merely encoded PNG hashes, and
  releases all 25 download URLs. WEB-002 covers both browser-generated PNG variants; intermittent
  halo/quiet-frame blocks remain documented without a new finding. Every connected browser closed.
  Stopped owned RN server via tool handle 90255; reference 6151 already stopped. Final
  regression/negative-control/format/evidence checks begin.

- 2026-10-21T04:08:53.852273+00:00 — FINAL CHECKS: All 13 pointer tests pass again; both isolated
  deliberate breaks fail their intended assertions. Full lint exits 0 with two baseline warnings.
  Evidence audit verifies 392 observation screenshots, all finding evidence and Markdown targets, no
  ignored artifacts, and unchanged tracked product source. The first full format check completed
  Prettier then failed only when dprint tried the sandbox-read-only host cache. Re-running the
  complete command with DPRINT_CACHE_DIR under /private/tmp; Markdown formatting already passed
  there.

- 2026-10-21T04:10:58.150951+00:00 — COMPLETE ahead of 12:15Z: WebKit and Firefox phases, regression
  tests and summary.md delivered. Final ledger: 312 unique case/profile units; 267 pass, 7 fail
  across 2 distinct reproduced S2 findings, 38 blocked/limited. All 13 targeted tests pass; both
  deliberate breaks fail assertions. Typecheck, lint and full formatting exit 0 (lint has two
  baseline warnings). The format reruns resolved the host-cache restriction and one newly generated
  JSON formatting issue. Evidence links/schema/scope validated; final hash manifest follows. No
  product source, commits, pushes, GitHub writes or devices touched; owned app/proxy servers
  stopped, orchestrator 6190 retained.

- 2026-10-21T04:15:33.801004+00:00 — RUN 3 START: Read brief/addendum and prior ledger. Rebuilding
  RN and shipping from unchanged b236d639 source. Blocked-case triage and full requested
  drawing-screen visual matrix; issues 3110/3111 flows excluded from retest. No
  commits/GitHub/product edits; browser server 6190 retained.

- 2026-10-21T04:20:30.431Z — CHROMIUM drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

- 2026-10-21T04:20:46.404094+00:00 — RUN 3 TRIAGE: Chromium corrected drawing batch passes all nine
  requested case/profile checks, including all three history-cap checks and prior tablet/desktop
  brush blocks. Picker landing and Eraser Undo one-pixel AA envelope account for the old blocks.
  Builds both pass. Added coalesced-tail regression: 14/14 pointer tests pass; three isolated
  negative controls fail intended assertions. Visual fixture calibration begins.

- 2026-10-21T04:22:39.107Z — VISUAL chromium: completed phone-390x844 light/buttons/100; 8 pairs
  this process.

- 2026-10-21T04:22:39.109Z — VISUAL chromium: process ended; 8 pairs. Browser connection closed.

- 2026-10-21T04:22:46.698Z — RUN 3 BLOCKED TRIAGE START chromium/ui. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:23:09.682Z — chromium UI batch ended: section entry, appearance persistence, focus,
  Undo shortcut and viewport rotation attempted. Evidence recorded per profile.

- 2026-10-21T04:23:09.697Z — RUN 3 BLOCKED TRIAGE END chromium/ui: process exit 0; case verdicts
  recorded separately.

- 2026-10-21T04:23:09.698Z — RUN 3 BLOCKED TRIAGE START chromium/platform. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:23:27.310Z — chromium platform batch ended: Farm composite, clear, eraser hover,
  narrow bounds and appearance/media fixtures attempted.

- 2026-10-21T04:23:27.327Z — RUN 3 BLOCKED TRIAGE END chromium/platform: process exit 0; case
  verdicts recorded separately.

- 2026-10-21T04:23:27.328Z — RUN 3 BLOCKED TRIAGE START chromium/ai. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:24:00.883Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

- 2026-10-21T04:24:00.923Z — RUN 3 BLOCKED TRIAGE END chromium/ai: process exit 0; case verdicts
  recorded separately.

- 2026-10-21T04:24:00.924Z — RUN 3 BLOCKED TRIAGE START chromium/blocked-zoom. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:24:12.526Z — chromium CSS zoom surrogate revisited with keyboard Escape; actual
  browser-chrome zoom remains outside protocol access.

- 2026-10-21T04:24:12.539Z — RUN 3 BLOCKED TRIAGE END chromium/blocked-zoom: process exit 0; case
  verdicts recorded separately.

- 2026-10-21T04:24:12.539Z — RUN 3 BLOCKED TRIAGE START webkit/blocked-zoom. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:24:25.079Z — webkit CSS zoom surrogate revisited with keyboard Escape; actual
  browser-chrome zoom remains outside protocol access.

- 2026-10-21T04:24:25.098Z — RUN 3 BLOCKED TRIAGE END webkit/blocked-zoom: process exit 0; case
  verdicts recorded separately.

- 2026-10-21T04:24:25.098Z — RUN 3 BLOCKED TRIAGE START firefox/drawing. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:25:36.151Z — FIREFOX drawing batch ended:
  brush/palette/custom-color/width/history/download observations recorded for requested profiles.
  BLOCKED cases require driver triage before defect classification.

- 2026-10-21T04:25:36.171Z — RUN 3 BLOCKED TRIAGE END firefox/drawing: process exit 0; case verdicts
  recorded separately.

- 2026-10-21T04:25:36.171Z — RUN 3 BLOCKED TRIAGE START firefox/coloring-brushes. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:26:04.651Z — firefox coloring-brush case ended: Magic reveal, erasure, Undo and
  light/night page-art switching attempted.

- 2026-10-21T04:26:04.667Z — RUN 3 BLOCKED TRIAGE END firefox/coloring-brushes: process exit 0; case
  verdicts recorded separately.

- 2026-10-21T04:26:04.668Z — RUN 3 BLOCKED TRIAGE START firefox/blocked-zoom. AI
  preparation-failure/PNG-reader issue reproductions excluded.

- 2026-10-21T04:26:13.446Z — firefox CSS zoom surrogate revisited with keyboard Escape; actual
  browser-chrome zoom remains outside protocol access.

- 2026-10-21T04:26:13.462Z — RUN 3 BLOCKED TRIAGE END firefox/blocked-zoom: process exit 0; case
  verdicts recorded separately.

- 2026-10-21T04:26:23.952Z — START chromium/blocked-zoom; one remote browser connection at a time.

- 2026-10-21T04:26:29.745Z — chromium CSS zoom surrogate revisited with keyboard Escape; actual
  browser-chrome zoom remains outside protocol access.

- 2026-10-21T04:26:29.755Z — END chromium/blocked-zoom: process exit 0, 6s. Product outcomes are the
  per-case observations, not this process exit.

- 2026-10-21T04:26:29.755Z — START webkit/blocked-zoom; one remote browser connection at a time.

- 2026-10-21T04:26:36.165Z — webkit CSS zoom surrogate revisited with keyboard Escape; actual
  browser-chrome zoom remains outside protocol access.

- 2026-10-21T04:26:36.185Z — END webkit/blocked-zoom: process exit 0, 6s. Product outcomes are the
  per-case observations, not this process exit.

- 2026-10-21T04:26:44.451Z — VISUAL MATRIX START chromium, owned child 38428. Sequential engine/arm
  contexts, DPR 1, all requested configurations.

- 2026-10-21T04:27:33.584Z — VISUAL chromium: completed phone-320x568 light/buttons/100; 8 pairs
  this process.

- 2026-10-21T04:28:22.184Z — VISUAL chromium: completed phone-320x568 light/buttons/130; 16 pairs
  this process.

- 2026-10-21T04:29:10.364Z — VISUAL chromium: completed phone-320x568 light/bare/100; 24 pairs this
  process.

- 2026-10-21T04:29:58.347Z — VISUAL chromium: completed phone-320x568 light/bare/130; 32 pairs this
  process.

- 2026-10-21T04:30:46.357Z — VISUAL chromium: completed phone-320x568 dark/buttons/100; 40 pairs
  this process.

- 2026-10-21T04:31:34.726Z — VISUAL chromium: completed phone-320x568 dark/buttons/130; 48 pairs
  this process.

- 2026-10-21T04:32:23.549Z — VISUAL chromium: completed phone-320x568 dark/bare/100; 56 pairs this
  process.

- 2026-10-21T04:33:11.807Z — VISUAL chromium: completed phone-320x568 dark/bare/130; 64 pairs this
  process.

- 2026-10-21T04:34:00.388Z — VISUAL chromium: completed phone-375x667 light/buttons/100; 72 pairs
  this process.

- 2026-10-21T04:34:49.223Z — VISUAL chromium: completed phone-375x667 light/buttons/130; 80 pairs
  this process.

- 2026-10-21T04:35:37.770Z — VISUAL chromium: completed phone-375x667 light/bare/100; 88 pairs this
  process.

- 2026-10-21T04:36:39.156150+00:00 — VISUAL COLLECTOR CORRECTION: Found four omitted palette names
  before wide layouts. Stopped only owned matrix job via tool handle 96470 (OS signal to child was
  denied); app servers and orchestrator 6190 retained. Replaced the name whitelist with DOM palette
  ancestry and collect every root button. Completed 320/375 narrow captures contain no omitted
  colors and remain valid. Moved the measurement pilot outside the final matrix so its Settings
  semantic-container box is recaptured. Resume preserves capture pairs and recomputes comparisons.

- 2026-10-21T04:36:39.181Z — VISUAL MATRIX START chromium, owned child 83523. Sequential engine/arm
  contexts, DPR 1, all requested configurations.

- 2026-10-21T04:36:41.032Z — VISUAL chromium: completed phone-320x568 light/buttons/100; 8 pairs
  this process.

- 2026-10-21T04:36:42.334Z — VISUAL chromium: completed phone-320x568 light/buttons/130; 16 pairs
  this process.

- 2026-10-21T04:36:43.626Z — VISUAL chromium: completed phone-320x568 light/bare/100; 24 pairs this
  process.

- 2026-10-21T04:36:45.014Z — VISUAL chromium: completed phone-320x568 light/bare/130; 32 pairs this
  process.

- 2026-10-21T04:36:46.291Z — VISUAL chromium: completed phone-320x568 dark/buttons/100; 40 pairs
  this process.

- 2026-10-21T04:36:47.555Z — VISUAL chromium: completed phone-320x568 dark/buttons/130; 48 pairs
  this process.

- 2026-10-21T04:36:48.963Z — VISUAL chromium: completed phone-320x568 dark/bare/100; 56 pairs this
  process.

- 2026-10-21T04:36:50.271Z — VISUAL chromium: completed phone-320x568 dark/bare/130; 64 pairs this
  process.

- 2026-10-21T04:36:51.578Z — VISUAL chromium: completed phone-375x667 light/buttons/100; 72 pairs
  this process.

- 2026-10-21T04:36:52.886Z — VISUAL chromium: completed phone-375x667 light/buttons/130; 80 pairs
  this process.

- 2026-10-21T04:36:54.261Z — VISUAL chromium: completed phone-375x667 light/bare/100; 88 pairs this
  process.

- 2026-10-21T04:37:41.147Z — VISUAL chromium: completed phone-375x667 light/bare/130; 96 pairs this
  process.

- 2026-10-21T04:38:29.360Z — VISUAL chromium: completed phone-375x667 dark/buttons/100; 104 pairs
  this process.

- 2026-10-21T04:39:17.870Z — VISUAL chromium: completed phone-375x667 dark/buttons/130; 112 pairs
  this process.

- 2026-10-21T04:40:06.323Z — VISUAL chromium: completed phone-375x667 dark/bare/100; 120 pairs this
  process.

- 2026-10-21T04:40:55.726Z — VISUAL chromium: completed phone-375x667 dark/bare/130; 128 pairs this
  process.

- 2026-10-21T04:41:44.595Z — VISUAL chromium: completed phone-390x844 light/buttons/100; 136 pairs
  this process.

- 2026-10-21T04:42:33.391Z — VISUAL chromium: completed phone-390x844 light/buttons/130; 144 pairs
  this process.

- 2026-10-21T04:43:22.237Z — VISUAL chromium: completed phone-390x844 light/bare/100; 152 pairs this
  process.

- 2026-10-21T04:44:11.847Z — VISUAL chromium: completed phone-390x844 light/bare/130; 160 pairs this
  process.

- 2026-10-21T04:45:00.647Z — VISUAL chromium: completed phone-390x844 dark/buttons/100; 168 pairs
  this process.

- 2026-10-21T04:45:49.534Z — VISUAL chromium: completed phone-390x844 dark/buttons/130; 176 pairs
  this process.

- 2026-10-21T04:46:38.472Z — VISUAL chromium: completed phone-390x844 dark/bare/100; 184 pairs this
  process.

- 2026-10-21T04:47:27.830Z — VISUAL chromium: completed phone-390x844 dark/bare/130; 192 pairs this
  process.

- 2026-10-21T04:48:17.300Z — VISUAL chromium: completed phone-412x915 light/buttons/100; 200 pairs
  this process.

- 2026-10-21T04:49:06.302Z — VISUAL chromium: completed phone-412x915 light/buttons/130; 208 pairs
  this process.

- 2026-10-21T04:49:55.014Z — VISUAL chromium: completed phone-412x915 light/bare/100; 216 pairs this
  process.

- 2026-10-21T04:50:44.164Z — VISUAL chromium: completed phone-412x915 light/bare/130; 224 pairs this
  process.

- 2026-10-21T04:51:33.290Z — VISUAL chromium: completed phone-412x915 dark/buttons/100; 232 pairs
  this process.

- 2026-10-21T04:52:22.199Z — VISUAL chromium: completed phone-412x915 dark/buttons/130; 240 pairs
  this process.

- 2026-10-21T04:53:11.130Z — VISUAL chromium: completed phone-412x915 dark/bare/100; 248 pairs this
  process.

- 2026-10-21T04:54:00.690Z — VISUAL chromium: completed phone-412x915 dark/bare/130; 256 pairs this
  process.

- 2026-10-21T04:54:50.968Z — VISUAL chromium: completed phone-844x390 light/buttons/100; 264 pairs
  this process.

- 2026-10-21T04:55:40.860Z — VISUAL chromium: completed phone-844x390 light/buttons/130; 272 pairs
  this process.

- 2026-10-21T04:56:31.556Z — VISUAL chromium: completed phone-844x390 light/bare/100; 280 pairs this
  process.

- 2026-10-21T04:57:21.858Z — VISUAL chromium: completed phone-844x390 light/bare/130; 288 pairs this
  process.

- 2026-10-21T04:58:11.667Z — VISUAL chromium: completed phone-844x390 dark/buttons/100; 296 pairs
  this process.

- 2026-10-21T04:59:01.710Z — VISUAL chromium: completed phone-844x390 dark/buttons/130; 304 pairs
  this process.

- 2026-10-21T04:59:52.752Z — VISUAL chromium: completed phone-844x390 dark/bare/100; 312 pairs this
  process.

- 2026-10-21T05:00:43.240Z — VISUAL chromium: completed phone-844x390 dark/bare/130; 320 pairs this
  process.

- 2026-10-21T05:01:33.193Z — VISUAL chromium: completed tablet-820x1180 light/buttons/100; 328 pairs
  this process.

- 2026-10-21T05:01:39.461Z — VISUAL chromium: active
  chromium/tablet-820x1180/light-buttons-130/picker/shipping; 328 completed pairs this process.

- 2026-10-21T05:02:22.607Z — VISUAL chromium: completed tablet-820x1180 light/buttons/130; 336 pairs
  this process.

- 2026-10-21T05:03:12.964Z — VISUAL chromium: completed tablet-820x1180 light/bare/100; 344 pairs
  this process.

- 2026-10-21T05:04:09.412Z — VISUAL chromium: completed tablet-820x1180 light/bare/130; 352 pairs
  this process.

- 2026-10-21T05:05:00.269Z — VISUAL chromium: completed tablet-820x1180 dark/buttons/100; 360 pairs
  this process.

- 2026-10-21T05:05:50.574Z — VISUAL chromium: completed tablet-820x1180 dark/buttons/130; 368 pairs
  this process.

- 2026-10-21T05:06:41.076Z — VISUAL chromium: completed tablet-820x1180 dark/bare/100; 376 pairs
  this process.

- 2026-10-21T05:07:32.350Z — VISUAL chromium: completed tablet-820x1180 dark/bare/130; 384 pairs
  this process.

- 2026-10-21T05:08:22.639Z — VISUAL chromium: completed tablet-1180x820 light/buttons/100; 392 pairs
  this process.

- 2026-10-21T05:09:12.470Z — VISUAL chromium: completed tablet-1180x820 light/buttons/130; 400 pairs
  this process.

- 2026-10-21T05:10:02.564Z — VISUAL chromium: completed tablet-1180x820 light/bare/100; 408 pairs
  this process.

- 2026-10-21T05:10:52.464Z — VISUAL chromium: completed tablet-1180x820 light/bare/130; 416 pairs
  this process.

- 2026-10-21T05:11:41.500Z — VISUAL chromium: completed tablet-1180x820 dark/buttons/100; 424 pairs
  this process.

- 2026-10-21T05:12:31.087Z — VISUAL chromium: completed tablet-1180x820 dark/buttons/130; 432 pairs
  this process.

- 2026-10-21T05:13:21.424Z — VISUAL chromium: completed tablet-1180x820 dark/bare/100; 440 pairs
  this process.

- 2026-10-21T05:14:11.325Z — VISUAL chromium: completed tablet-1180x820 dark/bare/130; 448 pairs
  this process.

- 2026-10-21T05:15:01.719Z — VISUAL chromium: completed desktop-1280x800 light/buttons/100; 456
  pairs this process.

- 2026-10-21T05:15:52.284Z — VISUAL chromium: completed desktop-1280x800 light/buttons/130; 464
  pairs this process.

- 2026-10-21T05:16:42.726Z — VISUAL chromium: completed desktop-1280x800 light/bare/100; 472 pairs
  this process.

- 2026-10-21T05:17:33.342Z — VISUAL chromium: completed desktop-1280x800 light/bare/130; 480 pairs
  this process.

- 2026-10-21T05:18:23.700Z — VISUAL chromium: completed desktop-1280x800 dark/buttons/100; 488 pairs
  this process.

- 2026-10-21T05:19:13.920Z — VISUAL chromium: completed desktop-1280x800 dark/buttons/130; 496 pairs
  this process.

- 2026-10-21T05:20:05.189Z — VISUAL chromium: completed desktop-1280x800 dark/bare/100; 504 pairs
  this process.

- 2026-10-21T05:20:55.417Z — VISUAL chromium: completed desktop-1280x800 dark/bare/130; 512 pairs
  this process.

- 2026-10-21T05:21:46.549Z — VISUAL chromium: completed desktop-1920x1080 light/buttons/100; 520
  pairs this process.

- 2026-10-21T05:22:36.435Z — VISUAL chromium: completed desktop-1920x1080 light/buttons/130; 528
  pairs this process.

- 2026-10-21T05:23:27.459Z — VISUAL chromium: completed desktop-1920x1080 light/bare/100; 536 pairs
  this process.

- 2026-10-21T05:24:19.411Z — VISUAL chromium: completed desktop-1920x1080 light/bare/130; 544 pairs
  this process.

- 2026-10-21T05:25:10.984Z — VISUAL chromium: completed desktop-1920x1080 dark/buttons/100; 552
  pairs this process.

- 2026-10-21T05:26:02.207Z — VISUAL chromium: completed desktop-1920x1080 dark/buttons/130; 560
  pairs this process.

- 2026-10-21T05:26:39.461Z — VISUAL chromium: active
  chromium/desktop-1920x1080/dark-bare-100/width/rn; 560 completed pairs this process.

- 2026-10-21T05:26:53.071Z — VISUAL chromium: completed desktop-1920x1080 dark/bare/100; 568 pairs
  this process.

- 2026-10-21T05:27:44.877Z — VISUAL chromium: completed desktop-1920x1080 dark/bare/130; 576 pairs
  this process.

- 2026-10-21T05:27:44.880Z — VISUAL chromium: process ended; 576 pairs. Browser connection closed.

- 2026-10-21T05:27:44.904Z — VISUAL MATRIX START webkit, owned child 53473. Sequential engine/arm
  contexts, DPR 1, all requested configurations.

- 2026-10-21T05:28:34.146Z — VISUAL webkit: completed phone-320x568 light/buttons/100; 8 pairs this
  process.

- 2026-10-21T05:29:22.491Z — VISUAL webkit: completed phone-320x568 light/buttons/130; 16 pairs this
  process.

- 2026-10-21T05:30:11.152Z — VISUAL webkit: completed phone-320x568 light/bare/100; 24 pairs this
  process.

- 2026-10-21T05:30:59.598Z — VISUAL webkit: completed phone-320x568 light/bare/130; 32 pairs this
  process.

- 2026-10-21T05:31:47.549Z — VISUAL webkit: completed phone-320x568 dark/buttons/100; 40 pairs this
  process.

- 2026-10-21T05:32:35.287Z — VISUAL webkit: completed phone-320x568 dark/buttons/130; 48 pairs this
  process.

- 2026-10-21T05:33:23.600Z — VISUAL webkit: completed phone-320x568 dark/bare/100; 56 pairs this
  process.

- 2026-10-21T05:34:12.669Z — VISUAL webkit: completed phone-320x568 dark/bare/130; 64 pairs this
  process.

- 2026-10-21T05:35:01.335Z — VISUAL webkit: completed phone-375x667 light/buttons/100; 72 pairs this
  process.

- 2026-10-21T05:35:48.909Z — VISUAL webkit: completed phone-375x667 light/buttons/130; 80 pairs this
  process.

- 2026-10-21T05:36:37.522Z — VISUAL webkit: completed phone-375x667 light/bare/100; 88 pairs this
  process.

- 2026-10-21T05:37:26.046Z — VISUAL webkit: completed phone-375x667 light/bare/130; 96 pairs this
  process.

- 2026-10-21T05:38:14.184Z — VISUAL webkit: completed phone-375x667 dark/buttons/100; 104 pairs this
  process.

- 2026-10-21T05:39:02.801Z — VISUAL webkit: completed phone-375x667 dark/buttons/130; 112 pairs this
  process.

- 2026-10-21T05:39:51.334Z — VISUAL webkit: completed phone-375x667 dark/bare/100; 120 pairs this
  process.

- 2026-10-21T05:40:39.711Z — VISUAL webkit: completed phone-375x667 dark/bare/130; 128 pairs this
  process.

- 2026-10-21T05:41:32.013Z — VISUAL webkit: completed phone-390x844 light/buttons/100; 136 pairs
  this process.

- 2026-10-21T05:42:24.785Z — VISUAL webkit: completed phone-390x844 light/buttons/130; 144 pairs
  this process.

- 2026-10-21T05:43:14.163Z — VISUAL webkit: completed phone-390x844 light/bare/100; 152 pairs this
  process.

- 2026-10-21T05:44:02.989Z — VISUAL webkit: completed phone-390x844 light/bare/130; 160 pairs this
  process.

- 2026-10-21T05:44:52.138Z — VISUAL webkit: completed phone-390x844 dark/buttons/100; 168 pairs this
  process.

- 2026-10-21T05:45:41.147Z — VISUAL webkit: completed phone-390x844 dark/buttons/130; 176 pairs this
  process.

- 2026-10-21T05:46:29.967Z — VISUAL webkit: completed phone-390x844 dark/bare/100; 184 pairs this
  process.

- 2026-10-21T05:47:18.450Z — VISUAL webkit: completed phone-390x844 dark/bare/130; 192 pairs this
  process.

- 2026-10-21T05:48:06.543Z — VISUAL webkit: completed phone-412x915 light/buttons/100; 200 pairs
  this process.

- 2026-10-21T05:48:54.675Z — VISUAL webkit: completed phone-412x915 light/buttons/130; 208 pairs
  this process.

- 2026-10-21T05:49:42.970Z — VISUAL webkit: completed phone-412x915 light/bare/100; 216 pairs this
  process.

- 2026-10-21T05:50:31.772Z — VISUAL webkit: completed phone-412x915 light/bare/130; 224 pairs this
  process.

- 2026-10-21T05:51:19.959Z — VISUAL webkit: completed phone-412x915 dark/buttons/100; 232 pairs this
  process.

- 2026-10-21T05:52:08.574Z — VISUAL webkit: completed phone-412x915 dark/buttons/130; 240 pairs this
  process.

- 2026-10-21T05:52:45.630Z — VISUAL webkit: active webkit/phone-412x915/dark-bare-100/width/rn; 240
  completed pairs this process.

- 2026-10-21T05:52:57.068Z — VISUAL webkit: completed phone-412x915 dark/bare/100; 248 pairs this
  process.

- 2026-10-21T05:53:45.414Z — VISUAL webkit: completed phone-412x915 dark/bare/130; 256 pairs this
  process.

- 2026-10-21T05:54:34.557Z — VISUAL webkit: completed phone-844x390 light/buttons/100; 264 pairs
  this process.

- 2026-10-21T05:55:23.892Z — VISUAL webkit: completed phone-844x390 light/buttons/130; 272 pairs
  this process.

- 2026-10-21T05:56:14.156Z — VISUAL webkit: completed phone-844x390 light/bare/100; 280 pairs this
  process.

- 2026-10-21T05:57:03.861Z — VISUAL webkit: completed phone-844x390 light/bare/130; 288 pairs this
  process.

- 2026-10-21T05:57:53.464Z — VISUAL webkit: completed phone-844x390 dark/buttons/100; 296 pairs this
  process.

- 2026-10-21T05:58:40.095653+00:00 — RUN 3 SCOPE CLARIFICATION: The earlier generic AI-batch ending
  message mentioned error/retry cases. HUNT_CASES selected only the two Chromium tablet/desktop
  A01-A03-A08 fixture-success units; no error/retry, full-disk or WebKit/Firefox metadata-rejection
  repro ran in run 3. The script ending message now reports its selection. API receipts and case
  rows are authoritative.

- 2026-10-21T05:58:43.309Z — VISUAL webkit: completed phone-844x390 dark/buttons/130; 304 pairs this
  process.

- 2026-10-21T05:59:33.126Z — VISUAL webkit: completed phone-844x390 dark/bare/100; 312 pairs this
  process.

- 2026-10-21T06:00:23.266Z — VISUAL webkit: completed phone-844x390 dark/bare/130; 320 pairs this
  process.

- 2026-10-21T06:01:12.661Z — VISUAL webkit: completed desktop-1280x800 light/buttons/100; 328 pairs
  this process.

- 2026-10-21T06:02:02.698Z — VISUAL webkit: completed desktop-1280x800 light/buttons/130; 336 pairs
  this process.

- 2026-10-21T06:02:53.831Z — VISUAL webkit: completed desktop-1280x800 light/bare/100; 344 pairs
  this process.

- 2026-10-21T06:03:44.912Z — VISUAL webkit: completed desktop-1280x800 light/bare/130; 352 pairs
  this process.

- 2026-10-21T06:04:35.672Z — VISUAL webkit: completed desktop-1280x800 dark/buttons/100; 360 pairs
  this process.

- 2026-10-21T06:05:25.324Z — VISUAL webkit: completed desktop-1280x800 dark/buttons/130; 368 pairs
  this process.

- 2026-10-21T06:06:15.077Z — VISUAL webkit: completed desktop-1280x800 dark/bare/100; 376 pairs this
  process.

- 2026-10-21T06:07:05.190Z — VISUAL webkit: completed desktop-1280x800 dark/bare/130; 384 pairs this
  process.

- 2026-10-21T06:07:55.697Z — VISUAL webkit: completed desktop-1920x1080 light/buttons/100; 392 pairs
  this process.

- 2026-10-21T06:08:46.408Z — VISUAL webkit: completed desktop-1920x1080 light/buttons/130; 400 pairs
  this process.

- 2026-10-21T06:09:38.209Z — VISUAL webkit: completed desktop-1920x1080 light/bare/100; 408 pairs
  this process.

- 2026-10-21T06:10:30.074Z — VISUAL webkit: completed desktop-1920x1080 light/bare/130; 416 pairs
  this process.

- 2026-10-21T06:11:20.570Z — VISUAL webkit: completed desktop-1920x1080 dark/buttons/100; 424 pairs
  this process.

- 2026-10-21T06:12:11.618Z — VISUAL webkit: completed desktop-1920x1080 dark/buttons/130; 432 pairs
  this process.

- 2026-10-21T06:13:02.725Z — VISUAL webkit: completed desktop-1920x1080 dark/bare/100; 440 pairs
  this process.

- 2026-10-21T06:13:54.247Z — VISUAL webkit: completed desktop-1920x1080 dark/bare/130; 448 pairs
  this process.

- 2026-10-21T06:13:54.251Z — VISUAL webkit: process ended; 448 pairs. Browser connection closed.

- 2026-10-21T06:13:54.292Z — VISUAL MATRIX START firefox, owned child 2376. Sequential engine/arm
  contexts, DPR 1, all requested configurations.

- 2026-10-21T06:14:48.118Z — VISUAL firefox: completed phone-320x568 light/buttons/100; 8 pairs this
  process.

- 2026-10-21T06:15:39.766Z — VISUAL firefox: completed phone-320x568 light/buttons/130; 16 pairs
  this process.

- 2026-10-21T06:16:35.120Z — VISUAL firefox: completed phone-320x568 light/bare/100; 24 pairs this
  process.

- 2026-10-21T06:17:28.603Z — VISUAL firefox: completed phone-320x568 light/bare/130; 32 pairs this
  process.

- 2026-10-21T06:18:20.794Z — VISUAL firefox: completed phone-320x568 dark/buttons/100; 40 pairs this
  process.

- 2026-10-21T06:19:12.518Z — VISUAL firefox: completed phone-320x568 dark/buttons/130; 48 pairs this
  process.

- 2026-10-21T06:20:07.363Z — VISUAL firefox: completed phone-320x568 dark/bare/100; 56 pairs this
  process.

- 2026-10-21T06:21:08.655Z — VISUAL firefox: completed phone-320x568 dark/bare/130; 64 pairs this
  process.

- 2026-10-21T06:22:06.486Z — VISUAL firefox: completed phone-375x667 light/buttons/100; 72 pairs
  this process.

- 2026-10-21T06:23:05.211Z — VISUAL firefox: completed phone-375x667 light/buttons/130; 80 pairs
  this process.

- 2026-10-21T06:24:02.585Z — VISUAL firefox: completed phone-375x667 light/bare/100; 88 pairs this
  process.

- 2026-10-21T06:24:54.688Z — VISUAL firefox: completed phone-375x667 light/bare/130; 96 pairs this
  process.

- 2026-10-21T06:25:45.494Z — VISUAL firefox: completed phone-375x667 dark/buttons/100; 104 pairs
  this process.

- 2026-10-21T06:26:37.067Z — VISUAL firefox: completed phone-375x667 dark/buttons/130; 112 pairs
  this process.

- 2026-10-21T06:27:29.684Z — VISUAL firefox: completed phone-375x667 dark/bare/100; 120 pairs this
  process.

- 2026-10-21T06:28:20.379Z — VISUAL firefox: completed phone-375x667 dark/bare/130; 128 pairs this
  process.

- 2026-10-21T06:29:12.357Z — VISUAL firefox: completed phone-390x844 light/buttons/100; 136 pairs
  this process.

- 2026-10-21T06:30:04.206Z — VISUAL firefox: completed phone-390x844 light/buttons/130; 144 pairs
  this process.

- 2026-10-21T06:30:53.443Z — VISUAL firefox: completed phone-390x844 light/bare/100; 152 pairs this
  process.

- 2026-10-21T06:31:42.732Z — VISUAL firefox: completed phone-390x844 light/bare/130; 160 pairs this
  process.

- 2026-10-21T06:32:33.781Z — VISUAL firefox: completed phone-390x844 dark/buttons/100; 168 pairs
  this process.

- 2026-10-21T06:33:24.886Z — VISUAL firefox: completed phone-390x844 dark/buttons/130; 176 pairs
  this process.

- 2026-10-21T06:34:15.804Z — VISUAL firefox: completed phone-390x844 dark/bare/100; 184 pairs this
  process.

- 2026-10-21T06:35:07.272Z — VISUAL firefox: completed phone-390x844 dark/bare/130; 192 pairs this
  process.

- 2026-10-21T06:36:00.258Z — VISUAL firefox: completed phone-412x915 light/buttons/100; 200 pairs
  this process.

- 2026-10-21T06:36:52.046Z — VISUAL firefox: completed phone-412x915 light/buttons/130; 208 pairs
  this process.

- 2026-10-21T06:37:43.177Z — VISUAL firefox: completed phone-412x915 light/bare/100; 216 pairs this
  process.

- 2026-10-21T06:38:33.127Z — VISUAL firefox: completed phone-412x915 light/bare/130; 224 pairs this
  process.

- 2026-10-21T06:38:54.705Z — VISUAL firefox: active
  firefox/phone-412x915/dark-buttons-100/clear-drag/shipping; 224 completed pairs this process.

- 2026-10-21T06:39:24.599Z — VISUAL firefox: completed phone-412x915 dark/buttons/100; 232 pairs
  this process.

- 2026-10-21T06:40:14.881Z — VISUAL firefox: completed phone-412x915 dark/buttons/130; 240 pairs
  this process.

- 2026-10-21T06:41:05.660Z — VISUAL firefox: completed phone-412x915 dark/bare/100; 248 pairs this
  process.

- 2026-10-21T06:41:56.266Z — VISUAL firefox: completed phone-412x915 dark/bare/130; 256 pairs this
  process.

- 2026-10-21T06:42:46.480Z — VISUAL firefox: completed phone-844x390 light/buttons/100; 264 pairs
  this process.

- 2026-10-21T06:43:36.332Z — VISUAL firefox: completed phone-844x390 light/buttons/130; 272 pairs
  this process.

- 2026-10-21T06:44:28.885Z — VISUAL firefox: completed phone-844x390 light/bare/100; 280 pairs this
  process.

- 2026-10-21T06:45:20.841Z — VISUAL firefox: completed phone-844x390 light/bare/130; 288 pairs this
  process.

- 2026-10-21T06:46:12.339Z — VISUAL firefox: completed phone-844x390 dark/buttons/100; 296 pairs
  this process.

- 2026-10-21T06:47:04.289Z — VISUAL firefox: completed phone-844x390 dark/buttons/130; 304 pairs
  this process.

- 2026-10-21T06:47:54.647Z — VISUAL firefox: completed phone-844x390 dark/bare/100; 312 pairs this
  process.

- 2026-10-21T06:48:45.209Z — VISUAL firefox: completed phone-844x390 dark/bare/130; 320 pairs this
  process.

- 2026-10-21T06:49:34.522Z — VISUAL firefox: completed desktop-1280x800 light/buttons/100; 328 pairs
  this process.

- 2026-10-21T06:50:24.201Z — VISUAL firefox: completed desktop-1280x800 light/buttons/130; 336 pairs
  this process.

- 2026-10-21T06:51:13.374Z — VISUAL firefox: completed desktop-1280x800 light/bare/100; 344 pairs
  this process.

- 2026-10-21T06:52:03.334Z — VISUAL firefox: completed desktop-1280x800 light/bare/130; 352 pairs
  this process.

- 2026-10-21T06:52:53.161Z — VISUAL firefox: completed desktop-1280x800 dark/buttons/100; 360 pairs
  this process.

- 2026-10-21T06:53:43.473Z — VISUAL firefox: completed desktop-1280x800 dark/buttons/130; 368 pairs
  this process.

- 2026-10-21T06:54:34.016Z — VISUAL firefox: completed desktop-1280x800 dark/bare/100; 376 pairs
  this process.

- 2026-10-21T06:55:23.922Z — VISUAL firefox: completed desktop-1280x800 dark/bare/130; 384 pairs
  this process.

- 2026-10-21T06:56:14.441Z — VISUAL firefox: completed desktop-1920x1080 light/buttons/100; 392
  pairs this process.

- 2026-10-21T06:57:07.925Z — VISUAL firefox: completed desktop-1920x1080 light/buttons/130; 400
  pairs this process.

- 2026-10-21T06:58:00.217Z — VISUAL firefox: completed desktop-1920x1080 light/bare/100; 408 pairs
  this process.

- 2026-10-21T06:58:55.251948+00:00 — SELF-HEAL: Applied durable harness fixes for DOM-based control
  collection, actual modal-card bounds, lazy Settings admission and accurate filtered-batch
  captions. Added owned-handle lifecycle and final-manifest guidance to the QA README.
  Pair/fixture/gallery verifiers enforce the evidence assumptions. One-off Pillow/import and
  completed-cell wait mistakes need no global tooling changes. No product or generated-instruction
  edits.

- 2026-10-21T06:58:55.516Z — VISUAL firefox: completed desktop-1920x1080 light/bare/130; 416 pairs
  this process.

- 2026-10-21T06:59:48.850Z — VISUAL firefox: completed desktop-1920x1080 dark/buttons/100; 424 pairs
  this process.

- 2026-10-21T07:00:40.325Z — VISUAL firefox: completed desktop-1920x1080 dark/buttons/130; 432 pairs
  this process.

- 2026-10-21T07:02:19.322Z — VISUAL firefox: completed desktop-1920x1080 dark/bare/100; 440 pairs
  this process.

- 2026-10-21T07:03:17.848Z — VISUAL firefox: completed desktop-1920x1080 dark/bare/130; 448 pairs
  this process.

- 2026-10-21T07:03:17.850Z — VISUAL firefox: process ended; 448 pairs. Browser connection closed.

- 2026-10-21T07:07:34.865Z — FINAL AUDIT HARNESS CORRECTION: First matrix completed 1472 pairs, but
  request audit found 56 shipping WebKit coloring receipts where the origin guard blocked local blob
  URLs. No remote request was sent. Preserved all first-pass WebKit captures under
  evidence/visual-discarded/webkit-local-blob-blocked; moved its integrity receipt to
  first-pass-discarded. Allow only same-origin blobs, log full denied request URLs, and wait for
  decoded shipping page art. Re-capturing all 448 WebKit pairs for uniform state histories;
  Chromium/Firefox unaffected. No product finding or source edit.

- 2026-10-21T07:08:28.638Z — VISUAL webkit: completed phone-320x568 light/buttons/100; 8 pairs this
  process.

- 2026-10-21T07:09:16.597Z — VISUAL webkit: completed phone-320x568 light/buttons/130; 16 pairs this
  process.

- 2026-10-21T07:10:05.575Z — VISUAL webkit: completed phone-320x568 light/bare/100; 24 pairs this
  process.

- 2026-10-21T07:10:55.107Z — VISUAL webkit: completed phone-320x568 light/bare/130; 32 pairs this
  process.

- 2026-10-21T07:11:43.042Z — VISUAL webkit: completed phone-320x568 dark/buttons/100; 40 pairs this
  process.

- 2026-10-21T07:12:31.043Z — VISUAL webkit: completed phone-320x568 dark/buttons/130; 48 pairs this
  process.

- 2026-10-21T07:13:19.768Z — VISUAL webkit: completed phone-320x568 dark/bare/100; 56 pairs this
  process.

- 2026-10-21T07:14:08.134Z — VISUAL webkit: completed phone-320x568 dark/bare/130; 64 pairs this
  process.

- 2026-10-21T07:14:56.107Z — VISUAL webkit: completed phone-375x667 light/buttons/100; 72 pairs this
  process.

- 2026-10-21T07:15:44.790Z — VISUAL webkit: completed phone-375x667 light/buttons/130; 80 pairs this
  process.

- 2026-10-21T07:16:33.692Z — VISUAL webkit: completed phone-375x667 light/bare/100; 88 pairs this
  process.

- 2026-10-21T07:17:22.582Z — VISUAL webkit: completed phone-375x667 light/bare/130; 96 pairs this
  process.

- 2026-10-21T07:18:10.792Z — VISUAL webkit: completed phone-375x667 dark/buttons/100; 104 pairs this
  process.

- 2026-10-21T07:18:59.186Z — VISUAL webkit: completed phone-375x667 dark/buttons/130; 112 pairs this
  process.

- 2026-10-21T07:19:48.112Z — VISUAL webkit: completed phone-375x667 dark/bare/100; 120 pairs this
  process.

- 2026-10-21T07:20:38.038Z — VISUAL webkit: completed phone-375x667 dark/bare/130; 128 pairs this
  process.

- 2026-10-21T07:21:31.011Z — VISUAL webkit: completed phone-390x844 light/buttons/100; 136 pairs
  this process.

- 2026-10-21T07:22:20.952Z — VISUAL webkit: completed phone-390x844 light/buttons/130; 144 pairs
  this process.

- 2026-10-21T07:23:10.222Z — VISUAL webkit: completed phone-390x844 light/bare/100; 152 pairs this
  process.

- 2026-10-21T07:23:59.392Z — VISUAL webkit: completed phone-390x844 light/bare/130; 160 pairs this
  process.

- 2026-10-21T07:24:48.616Z — VISUAL webkit: completed phone-390x844 dark/buttons/100; 168 pairs this
  process.

- 2026-10-21T07:25:37.427Z — VISUAL webkit: completed phone-390x844 dark/buttons/130; 176 pairs this
  process.

- 2026-10-21T07:26:26.051Z — VISUAL webkit: completed phone-390x844 dark/bare/100; 184 pairs this
  process.

- 2026-10-21T07:27:14.927Z — VISUAL webkit: completed phone-390x844 dark/bare/130; 192 pairs this
  process.

- 2026-10-21T07:28:04.656Z — VISUAL webkit: completed phone-412x915 light/buttons/100; 200 pairs
  this process.

- 2026-10-21T07:28:53.274Z — VISUAL webkit: completed phone-412x915 light/buttons/130; 208 pairs
  this process.

- 2026-10-21T07:29:42.276Z — VISUAL webkit: completed phone-412x915 light/bare/100; 216 pairs this
  process.

- 2026-10-21T07:30:31.707Z — VISUAL webkit: completed phone-412x915 light/bare/130; 224 pairs this
  process.

- 2026-10-21T07:31:20.298Z — VISUAL webkit: completed phone-412x915 dark/buttons/100; 232 pairs this
  process.

- 2026-10-21T07:32:08.925Z — VISUAL webkit: completed phone-412x915 dark/buttons/130; 240 pairs this
  process.

- 2026-10-21T07:32:37.567Z — VISUAL webkit: active webkit/phone-412x915/dark-bare-100/drawer/rn; 240
  completed pairs this process.

- 2026-10-21T07:32:58.151Z — VISUAL webkit: completed phone-412x915 dark/bare/100; 248 pairs this
  process.

- 2026-10-21T07:33:46.315Z — VISUAL webkit: completed phone-412x915 dark/bare/130; 256 pairs this
  process.

- 2026-10-21T07:34:35.836Z — VISUAL webkit: completed phone-844x390 light/buttons/100; 264 pairs
  this process.

- 2026-10-21T07:35:25.712Z — VISUAL webkit: completed phone-844x390 light/buttons/130; 272 pairs
  this process.

- 2026-10-21T07:36:15.590Z — VISUAL webkit: completed phone-844x390 light/bare/100; 280 pairs this
  process.

- 2026-10-21T07:37:05.446Z — VISUAL webkit: completed phone-844x390 light/bare/130; 288 pairs this
  process.

- 2026-10-21T07:37:54.784Z — VISUAL webkit: completed phone-844x390 dark/buttons/100; 296 pairs this
  process.

- 2026-10-21T07:38:44.359Z — VISUAL webkit: completed phone-844x390 dark/buttons/130; 304 pairs this
  process.

- 2026-10-21T07:39:34.159Z — VISUAL webkit: completed phone-844x390 dark/bare/100; 312 pairs this
  process.

- 2026-10-21T07:40:23.643Z — VISUAL webkit: completed phone-844x390 dark/bare/130; 320 pairs this
  process.

- 2026-10-21T07:41:13.751Z — VISUAL webkit: completed desktop-1280x800 light/buttons/100; 328 pairs
  this process.

- 2026-10-21T07:42:03.290Z — VISUAL webkit: completed desktop-1280x800 light/buttons/130; 336 pairs
  this process.

- 2026-10-21T07:42:53.078Z — VISUAL webkit: completed desktop-1280x800 light/bare/100; 344 pairs
  this process.

- 2026-10-21T07:43:43.346Z — VISUAL webkit: completed desktop-1280x800 light/bare/130; 352 pairs
  this process.

- 2026-10-21T07:44:32.803Z — VISUAL webkit: completed desktop-1280x800 dark/buttons/100; 360 pairs
  this process.

- 2026-10-21T07:45:22.134Z — VISUAL webkit: completed desktop-1280x800 dark/buttons/130; 368 pairs
  this process.

- 2026-10-21T07:46:12.291Z — VISUAL webkit: completed desktop-1280x800 dark/bare/100; 376 pairs this
  process.

- 2026-10-21T07:47:01.101Z — VISUAL webkit: completed desktop-1280x800 dark/bare/130; 384 pairs this
  process.

- 2026-10-21T07:47:50.643Z — VISUAL webkit: completed desktop-1920x1080 light/buttons/100; 392 pairs
  this process.

- 2026-10-21T07:48:39.813Z — VISUAL webkit: completed desktop-1920x1080 light/buttons/130; 400 pairs
  this process.

- 2026-10-21T07:49:29.679Z — VISUAL webkit: completed desktop-1920x1080 light/bare/100; 408 pairs
  this process.

- 2026-10-21T07:50:20.023Z — VISUAL webkit: completed desktop-1920x1080 light/bare/130; 416 pairs
  this process.

- 2026-10-21T07:51:10.249Z — VISUAL webkit: completed desktop-1920x1080 dark/buttons/100; 424 pairs
  this process.

- 2026-10-21T07:52:00.612Z — VISUAL webkit: completed desktop-1920x1080 dark/buttons/130; 432 pairs
  this process.

- 2026-10-21T07:52:50.807Z — VISUAL webkit: completed desktop-1920x1080 dark/bare/100; 440 pairs
  this process.

- 2026-10-21T07:53:41.108Z — VISUAL webkit: completed desktop-1920x1080 dark/bare/130; 448 pairs
  this process.

- 2026-10-21T07:53:41.108Z — VISUAL webkit: process ended; 448 pairs. Browser connection closed.

- 2026-10-21T07:53:55.063494Z — Corrected WebKit capture exit 0; all 1,472 accepted visual pairs
  complete, zero blocked/unsettled, zero non-Settings control-box differences. Begin final integrity
  and command checks. Shared browser connection closed by capture finally block.

- 2026-10-21T07:54:28.881Z — Visual verifier: 1,472 IDs, 2,944 original PNGs and 1,472 diffs
  verified; zero page errors or denied resources; 46 fixture checks. Gallery filtering, empty
  combinations, paging and image loading pass. Owned servers 6150/6151 stopped through recorded tool
  handles (Ctrl-C exit 130); every port 6150–6189 is closed and shared 6190 remains listening.

- 2026-10-21T07:59:22.524Z — Run 3 complete: 20 of 38 previous blocked recorder units resolved; 18
  remain blocked by #3111. Latest ledger 287 PASS / 7 existing FAIL / 18 BLOCKED. Full 1,472-pair
  visual matrix complete and verified; zero new confirmed findings. Targeted pointer file: 14
  passing tests, all three copied-source negative controls fail their intended assertions. Type
  check/lint pass (two baseline lint warnings). The initial format check caught its own JSON
  receipt; corrected writer and separate full formatting recheck pass, original failure retained.
  Evidence link/source/build integrity passes. All owned servers stopped, shared 6190 retained;
  product source unchanged, no commits or GitHub activity. Final report formatting and manifest
  hashing follow this line.

- 2026-10-21T08:04:02.427418+00:00 — RUN 4 started at cbfa2dc91a861aa41ba64219c34feb0875a37ce7. Read
  prior briefs and summary. Rebuilding Netlify site export; planned AI unblock reruns, standalone
  pages across engines/JS/layout/theme, and passing regression tests. Product source unchanged; no
  commits/GitHub/device access.

- 2026-10-21T08:07:27.471Z — chromium AI batch ended: fixture success/minimize/report and
  error/retry cases attempted. All /api calls intercepted; request receipts saved.

- 2026-10-21T08:08:18.029322+00:00 — RUN 4 Chromium AI batch: 13 units PASS, including Out of space
  / Try again with one simulated failed IDB write and one successful upload after recovery. Initial
  WebKit success take hit the known same-origin blob guard flaw in the shared driver. Fixed harness
  guard; initial takes retained for audit, and WebKit will be rerun before verdict. No product
  change.

- 2026-10-21T08:10:50.569Z — webkit AI batch ended: fixture success/minimize/report and error/retry
  cases attempted. All /api calls intercepted; request receipts saved.

- 2026-10-21T08:12:35.765648+00:00 — RUN 4 feedback mounted regressions PASS (5 total including 2
  added). Both new tests fail their intended assertion with a separate in-memory source mutation;
  product bytes unchanged. Corrected WebKit fixture generation passes phone/tablet/desktop;
  downstream error/retry batch still running. Page matrix plan recorded in results/pages.md.

- 2026-10-21T08:13:50.842Z — webkit AI batch ended: fixture success/minimize/report and error/retry
  cases attempted. All /api calls intercepted; request receipts saved.

- 2026-10-21T08:16:30.410Z — firefox AI batch ended: fixture success/minimize/report and error/retry
  cases attempted. All /api calls intercepted; request receipts saved.

- 2026-10-21T08:16:39.401Z — RUN 4 pages chromium: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:16:39.579308+00:00 — RUN 4 AI completed: 39/39 accepted recorder units PASS (13 each
  engine), all 18 previously blocked units resolved. Chromium/WebKit/Firefox each show Out of space
  with simulated quota, then Try again reaches a fixture image without reload and without a
  pre-storage upload. WebKit initial blob-guard takes excluded and retained. Page pilot started on
  Chromium phone, both JS modes.

- 2026-10-21T08:17:14.215Z — RUN 4 pages chromium: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:18:25.435Z — RUN 4 pages chromium: completed phone/light/JS false/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:18:44.688Z — RUN 4 pages chromium: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:18:45.095583+00:00 — RUN 4 page pilots complete: Chromium phone JS-on and JS-off
  pages pass after correcting the cold-visit Start drawing label and removing an rAF wait that
  cannot complete with scripts disabled. Beta track toggling uses its actual radio role. Full
  Chromium page matrix started; prior pilots excluded from accepted counts. Reference preview on
  owned port6151 uses test-only environment.

- 2026-10-21T08:21:19.578Z — RUN 4 pages webkit: completed phone/light/JS true/drawing; raw verdicts
  and captures saved.

- 2026-10-21T08:21:37.142574+00:00 — RUN 4 Chromium page matrix completed: 240 units, 231 initial
  PASS and 9 review flags, all in /admin. Six narrow-phone rows hit a 3px masthead overflow before
  form checks; dark/no-JS rows expose a label-selector ambiguity across prerendered theme variants.
  Adjusted harness to finish form checks before recording geometry and to inspect the disabled field
  directly while retaining label association evidence. WebKit matrix started.

- 2026-10-21T08:23:58.421Z — RUN 4 START pages-firefox. One connected browser at a time; local
  fixtures and request guards remain active.

- 2026-10-21T08:23:59.836Z — RUN 4 pages firefox: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:26:08.467405+00:00 — RUN 4 Firefox initial page job interrupted through its owned
  tool handle after its no-JS settle wait hung. Diagnostic proves the document is readable, fonts
  loaded and animations empty, but Promise callbacks evaluated in the disabled page realm never
  settle. Screenshots work. Replaced page-realm promises with Node-side polling of synchronous
  browser state; no product change. Prior ten pass rows and diagnostic retained; restarting
  serialized queue.

- 2026-10-21T08:26:08.488Z — RUN 4 START pages-firefox. One connected browser at a time; local
  fixtures and request guards remain active.

- 2026-10-21T08:26:09.854Z — RUN 4 pages firefox: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T08:28:28.992Z — RUN 4 END pages-firefox: process exit 0; assertion/observation verdicts
  are in the separate case ledger.

- 2026-10-21T08:28:28.993Z — RUN 4 START admin-chromium-recheck. One connected browser at a time;
  local fixtures and request guards remain active.

- 2026-10-21T08:28:30.513Z — RUN 4 pages chromium: completed phone/light/JS true/admin; raw verdicts
  and captures saved.

- 2026-10-21T08:28:39.015Z — RUN 4 END admin-chromium-recheck: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:28:39.016Z — RUN 4 START deep-links-rn-chromium. One connected browser at a time;
  local fixtures and request guards remain active.

- 2026-10-21T08:28:41.526Z — RUN 4 END deep-links-rn-chromium: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:28:41.526Z — RUN 4 START deep-links-rn-webkit. One connected browser at a time;
  local fixtures and request guards remain active.

- 2026-10-21T08:28:48.645Z — RUN 4 END deep-links-rn-webkit: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:28:48.646Z — RUN 4 START deep-links-rn-firefox. One connected browser at a time;
  local fixtures and request guards remain active.

- 2026-10-21T08:28:53.428Z — RUN 4 END deep-links-rn-firefox: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:28:53.429Z — RUN 4 START deep-links-reference-chromium. One connected browser at a
  time; local fixtures and request guards remain active.

- 2026-10-21T08:28:57.637Z — RUN 4 END deep-links-reference-chromium: process exit 0;
  assertion/observation verdicts are in the separate case ledger.

- 2026-10-21T08:28:57.637Z — RUN 4 START deep-links-reference-webkit. One connected browser at a
  time; local fixtures and request guards remain active.

- 2026-10-21T08:29:05.118Z — RUN 4 END deep-links-reference-webkit: process exit 0;
  assertion/observation verdicts are in the separate case ledger.

- 2026-10-21T08:29:05.118Z — RUN 4 START deep-links-reference-firefox. One connected browser at a
  time; local fixtures and request guards remain active.

- 2026-10-21T08:30:39.796Z — RUN 4 END deep-links-reference-firefox: process exit 0;
  assertion/observation verdicts are in the separate case ledger.

- 2026-10-21T08:30:39.798Z — RUN 4 START anchors-chromium. One connected browser at a time; local
  fixtures and request guards remain active.

- 2026-10-21T08:33:14.512865+00:00 — RUN 4 checkpoint: all 720 main page units recorded (latest 702
  PASS, 18 geometry flags for the same 320px admin masthead). All 18 AI blockers resolved;
  results/ai-run4.md written. WEB-003 canonical no-script section-link regression reproduced twice
  in all engines against shipping, recorded in findings.jsonl. Type check and lint exit zero; two
  new mounted feedback regressions and their negative controls pass. Full contents sweeps continue.

- 2026-10-21T08:39:00.692Z — RUN 4 END anchors-chromium: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:39:00.693Z — RUN 4 START anchors-webkit. One connected browser at a time; local
  fixtures and request guards remain active.

- 2026-10-21T08:45:49.654Z — RUN 4 END anchors-webkit: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:45:49.655Z — RUN 4 START anchors-firefox. One connected browser at a time; local
  fixtures and request guards remain active.

- 2026-10-21T08:56:04.271Z — RUN 4 END anchors-firefox: process exit 0; assertion/observation
  verdicts are in the separate case ledger.

- 2026-10-21T08:56:46.166Z — RUN 4 EXTRA START reference-firefox-fonts-only; one connected browser,
  local fixtures only.

- 2026-10-21T08:56:50.409Z — RUN 4 EXTRA END reference-firefox-fonts-only: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T08:56:50.409Z — RUN 4 EXTRA START anchors-chromium-hydration-corrected; one connected
  browser, local fixtures only.

- 2026-10-21T09:03:24.094Z — RUN 4 EXTRA END anchors-chromium-hydration-corrected: exit 0, expected
  0; per-case assertions remain separate.

- 2026-10-21T09:03:24.095Z — RUN 4 EXTRA START admin-rn-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:27.887Z — RUN 4 EXTRA END admin-rn-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:27.887Z — RUN 4 EXTRA START admin-rn-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:33.728Z — RUN 4 EXTRA END admin-rn-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:33.728Z — RUN 4 EXTRA START admin-rn-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:42.595Z — RUN 4 EXTRA END admin-rn-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:42.596Z — RUN 4 EXTRA START admin-shipping-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:44.054Z — RUN 4 EXTRA END admin-shipping-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:44.055Z — RUN 4 EXTRA START admin-shipping-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:46.846Z — RUN 4 EXTRA END admin-shipping-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:46.846Z — RUN 4 EXTRA START admin-shipping-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:49.868Z — RUN 4 EXTRA END admin-shipping-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:49.868Z — RUN 4 EXTRA START sidebar-rn-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:51.805Z — RUN 4 EXTRA END sidebar-rn-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:51.806Z — RUN 4 EXTRA START sidebar-rn-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:54.355Z — RUN 4 EXTRA END sidebar-rn-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:54.355Z — RUN 4 EXTRA START sidebar-rn-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:03:56.998Z — RUN 4 EXTRA END sidebar-rn-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:03:56.999Z — RUN 4 EXTRA START sidebar-shipping-chromium; one connected browser,
  local fixtures only.

- 2026-10-21T09:04:17.630Z — RUN 4 EXTRA END sidebar-shipping-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:04:17.630Z — RUN 4 EXTRA START sidebar-shipping-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:04:39.615Z — RUN 4 EXTRA END sidebar-shipping-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:04:39.615Z — RUN 4 EXTRA START sidebar-shipping-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:05:01.088Z — RUN 4 EXTRA END sidebar-shipping-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:01.088Z — RUN 4 EXTRA START segments-rn-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:05:02.410Z — RUN 4 EXTRA END segments-rn-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:02.411Z — RUN 4 EXTRA START segments-rn-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:05:04.737Z — RUN 4 EXTRA END segments-rn-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:04.737Z — RUN 4 EXTRA START segments-rn-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:05:06.844Z — RUN 4 EXTRA END segments-rn-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:06.844Z — RUN 4 EXTRA START segments-shipping-chromium; one connected browser,
  local fixtures only.

- 2026-10-21T09:05:08.163Z — RUN 4 EXTRA END segments-shipping-chromium: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T09:05:08.163Z — RUN 4 EXTRA START segments-shipping-webkit; one connected browser,
  local fixtures only.

- 2026-10-21T09:05:10.586Z — RUN 4 EXTRA END segments-shipping-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:10.586Z — RUN 4 EXTRA START segments-shipping-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:05:12.768Z — RUN 4 EXTRA END segments-shipping-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:12.768Z — RUN 4 EXTRA START normal-motion-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:05:13.510Z — RUN 4 pages chromium: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:05:42.607Z — RUN 4 EXTRA END normal-motion-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:05:42.607Z — RUN 4 EXTRA START normal-motion-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:05:43.582Z — RUN 4 pages webkit: completed phone/light/JS true/drawing; raw verdicts
  and captures saved.

- 2026-10-21T09:06:13.639Z — RUN 4 EXTRA END normal-motion-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:06:13.639Z — RUN 4 EXTRA START normal-motion-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:06:14.972Z — RUN 4 pages firefox: completed phone/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:06:39.027Z — RUN 4 EXTRA END normal-motion-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:06:39.027Z — RUN 4 EXTRA START ai-wire-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:06:47.179Z — RUN 4 EXTRA END ai-wire-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:06:47.179Z — RUN 4 EXTRA START ai-wire-webkit; one connected browser, local fixtures
  only.

- 2026-10-21T09:06:55.331Z — RUN 4 EXTRA END ai-wire-webkit: exit 0, expected 0; per-case assertions
  remain separate.

- 2026-10-21T09:06:55.331Z — RUN 4 EXTRA START ai-wire-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:07:03.536Z — RUN 4 EXTRA END ai-wire-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:07:03.536Z — RUN 4 EXTRA START forced-dark-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:07:04.273Z — RUN 4 pages chromium: completed phone/forcedDark/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:07:42.052Z — RUN 4 EXTRA END forced-dark-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:07:42.053Z — RUN 4 EXTRA START forced-dark-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:07:42.915Z — RUN 4 pages webkit: completed phone/forcedDark/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:08:27.873Z — RUN 4 EXTRA END forced-dark-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:08:27.873Z — RUN 4 EXTRA START forced-dark-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:08:29.205Z — RUN 4 pages firefox: completed phone/forcedDark/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:09:09.943Z — RUN 4 EXTRA END forced-dark-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:09:09.943Z — RUN 4 EXTRA START saved-themes-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:09:25.240Z — RUN 4 EXTRA END saved-themes-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:09:25.240Z — RUN 4 EXTRA START saved-themes-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:09:42.556Z — RUN 4 EXTRA END saved-themes-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:09:42.556Z — RUN 4 EXTRA START saved-themes-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:00.805Z — RUN 4 EXTRA END saved-themes-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:00.805Z — RUN 4 EXTRA START worker-pages-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:05.770Z — RUN 4 EXTRA END worker-pages-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:05.770Z — RUN 4 EXTRA START worker-pages-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:10.886Z — RUN 4 EXTRA END worker-pages-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:10.886Z — RUN 4 EXTRA START worker-pages-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:17.387Z — RUN 4 EXTRA END worker-pages-firefox: exit 1, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:17.387Z — RUN 4 EXTRA START beta-details-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:22.383Z — RUN 4 EXTRA END beta-details-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:22.383Z — RUN 4 EXTRA START beta-details-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:30.266Z — RUN 4 EXTRA END beta-details-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:30.266Z — RUN 4 EXTRA START beta-details-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:37.474Z — RUN 4 EXTRA END beta-details-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:37.475Z — RUN 4 EXTRA START local-links-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:10:52.908Z — RUN 4 EXTRA END local-links-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:10:52.908Z — RUN 4 EXTRA START local-links-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:11:18.601Z — RUN 4 EXTRA END local-links-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:11:18.601Z — RUN 4 EXTRA START local-links-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:12:00.622Z — RUN 4 EXTRA END local-links-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:12:00.623Z — RUN 4 EXTRA START web003-minimal-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:12:01.395Z — RUN 4 EXTRA END web003-minimal-chromium: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:12:01.396Z — RUN 4 EXTRA START web003-minimal-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:12:02.603Z — RUN 4 EXTRA END web003-minimal-webkit: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:12:02.603Z — RUN 4 EXTRA START web003-minimal-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:12:04.138Z — RUN 4 EXTRA END web003-minimal-firefox: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:35.493Z — RUN 4 EXTRA START web004-minimal-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:36.086Z — RUN 4 EXTRA END web004-minimal-chromium: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:36.087Z — RUN 4 EXTRA START web005-minimal-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:36.772Z — RUN 4 EXTRA END web005-minimal-chromium: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:36.772Z — RUN 4 EXTRA START web004-minimal-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:37.794Z — RUN 4 EXTRA END web004-minimal-webkit: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:37.794Z — RUN 4 EXTRA START web005-minimal-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:38.991Z — RUN 4 EXTRA END web005-minimal-webkit: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:38.991Z — RUN 4 EXTRA START web004-minimal-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:40.403Z — RUN 4 EXTRA END web004-minimal-firefox: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:40.403Z — RUN 4 EXTRA START web005-minimal-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:41.873Z — RUN 4 EXTRA END web005-minimal-firefox: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:15:41.873Z — RUN 4 EXTRA START short-pages-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:15:42.615Z — RUN 4 pages chromium: completed short/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:16:09.592Z — RUN 4 EXTRA END short-pages-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:16:09.592Z — RUN 4 EXTRA START short-pages-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:16:10.561Z — RUN 4 pages webkit: completed short/light/JS true/drawing; raw verdicts
  and captures saved.

- 2026-10-21T09:16:44.874Z — RUN 4 EXTRA END short-pages-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:16:44.875Z — RUN 4 EXTRA START short-pages-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:16:46.312Z — RUN 4 pages firefox: completed short/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:17:19.096Z — RUN 4 EXTRA END short-pages-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:19.097Z — RUN 4 EXTRA START sidebar-rn-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:17:28.058Z — RUN 4 EXTRA END sidebar-rn-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:28.058Z — RUN 4 EXTRA START sidebar-rn-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:17:34.109Z — RUN 4 EXTRA END sidebar-rn-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:34.109Z — RUN 4 EXTRA START sidebar-rn-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:17:43.936Z — RUN 4 EXTRA END sidebar-rn-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:43.936Z — RUN 4 EXTRA START sidebar-shipping-chromium; one connected browser,
  local fixtures only.

- 2026-10-21T09:17:52.905Z — RUN 4 EXTRA END sidebar-shipping-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:52.905Z — RUN 4 EXTRA START sidebar-shipping-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:17:58.966Z — RUN 4 EXTRA END sidebar-shipping-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:17:58.966Z — RUN 4 EXTRA START sidebar-shipping-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:18:08.713Z — RUN 4 EXTRA END sidebar-shipping-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:19:29.329Z — RUN 4 pages firefox: completed short/light/JS true/beta; raw verdicts
  and captures saved.

- 2026-10-21T09:20:46.857Z — RUN 4 EXTRA START web006-minimal-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:20:48.523Z — RUN 4 EXTRA END web006-minimal-chromium: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:20:48.524Z — RUN 4 EXTRA START web006-minimal-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:20:50.392Z — RUN 4 EXTRA END web006-minimal-webkit: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:20:50.392Z — RUN 4 EXTRA START web006-minimal-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:20:52.721Z — RUN 4 EXTRA END web006-minimal-firefox: exit 1, expected 1; per-case
  assertions remain separate.

- 2026-10-21T09:20:52.721Z — RUN 4 EXTRA START worker-settled-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:21:07.159Z — RUN 4 EXTRA END worker-settled-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:21:07.159Z — RUN 4 EXTRA START worker-settled-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:21:21.602Z — RUN 4 EXTRA END worker-settled-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:21:21.603Z — RUN 4 EXTRA START worker-settled-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:21:44.307Z — RUN 4 EXTRA END worker-settled-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:21:44.307Z — RUN 4 EXTRA START sidebar-shipping-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:21:59.196Z — RUN 4 EXTRA END sidebar-shipping-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:23:04.464Z — RUN 4 EXTRA START keyboard-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:23:21.478Z — RUN 4: 39/39 AI units and three actual-wire fixture generations pass;
  all eighteen prior blocked units resolve. Main page matrix 702 pass / 18 geometry flags across 720
  rows. WEB-003/004/005 confirmed; WEB-006 added after two fresh contexts per engine establish the
  desktop design sidebar’s final label below the viewport. Settled controlled-worker documents pass
  all three engines; Firefox rapid-unload errors are retained separately. Keyboard and
  short-viewport readiness follow-ups active.

- 2026-10-21T09:24:02.680Z — RUN 4 EXTRA END keyboard-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:24:02.682Z — RUN 4 EXTRA START keyboard-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:24:14.424Z — RUN 4 EXTRA END keyboard-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:24:14.425Z — RUN 4 EXTRA START keyboard-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:24:26.356Z — RUN 4 EXTRA END keyboard-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:24:26.356Z — RUN 4 EXTRA START short-firefox-ready-recheck; one connected browser,
  local fixtures only.

- 2026-10-21T09:24:27.744Z — RUN 4 pages firefox: completed short/light/JS true/drawing; raw
  verdicts and captures saved.

- 2026-10-21T09:25:02.368Z — RUN 4 EXTRA END short-firefox-ready-recheck: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T09:25:27.271Z — RUN 4 EXTRA START anchors-keyboard-chromium; one connected browser,
  local fixtures only.

- 2026-10-21T09:25:48.682Z — RUN 4 EXTRA END anchors-keyboard-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:25:48.683Z — RUN 4 EXTRA START anchors-keyboard-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:26:10.804Z — RUN 4 EXTRA END anchors-keyboard-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:26:10.804Z — RUN 4 EXTRA START anchors-keyboard-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:26:33.497Z — RUN 4 EXTRA END anchors-keyboard-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:26:33.497Z — RUN 4 EXTRA START keyboard-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:26:59.424Z — RUN 4 EXTRA END keyboard-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:29:20.731Z — RUN 4 EXTRA START local-links-hydrated-chromium; one connected browser,
  local fixtures only.

- 2026-10-21T09:29:50.497Z — RUN 4 EXTRA END local-links-hydrated-chromium: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T09:29:50.498Z — RUN 4 EXTRA START local-links-hydrated-webkit; one connected browser,
  local fixtures only.

- 2026-10-21T09:30:15.696Z — RUN 4 EXTRA END local-links-hydrated-webkit: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T09:30:15.696Z — RUN 4 EXTRA START local-links-hydrated-firefox; one connected browser,
  local fixtures only.

- 2026-10-21T09:31:36.610Z — RUN 4 EXTRA END local-links-hydrated-firefox: exit 0, expected 0;
  per-case assertions remain separate.

- 2026-10-21T09:32:21.594Z — RUN 4 EXTRA START file-aliases-chromium; one connected browser, local
  fixtures only.

- 2026-10-21T09:32:24.615Z — RUN 4 EXTRA END file-aliases-chromium: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:32:24.617Z — RUN 4 EXTRA START file-aliases-webkit; one connected browser, local
  fixtures only.

- 2026-10-21T09:32:30.778Z — RUN 4 EXTRA END file-aliases-webkit: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:32:30.778Z — RUN 4 EXTRA START file-aliases-firefox; one connected browser, local
  fixtures only.

- 2026-10-21T09:32:36.171Z — RUN 4 EXTRA END file-aliases-firefox: exit 0, expected 0; per-case
  assertions remain separate.

- 2026-10-21T09:37:34.880Z — RUN 4 capture complete: all eighteen AI blocks resolved, 39/39 AI units
  pass, three actual-wire local fixture uploads pass. Main pages 702 clean / 18 admin-width flags;
  540 supplemental combinations have only nine repeats of that width issue. Four new findings
  reproduced twice per engine. Two mounted feedback regressions and both negative controls pass
  their intended checks; type checks and lint exit zero. Owned servers stopped via recorded tool
  handles; ports 6150/6151/6152 closed and orchestrator 6190 still listening. Final evidence
  verifier passes (including 1,008 coloring files and 1,043 Markdown targets); formatting and final
  hashes follow.

- 2026-10-21T09:39:04.070Z — RUN 4 FINAL: full npm run format:check exited zero; type checks and
  final lint already passed. Summary and page report complete, raw diagnostic failures retained,
  prior summary archived. All owned servers are stopped and 6190 remains available. Final integrity
  receipt and the complete evidence manifest are regenerated after the last formatting write; no
  commits or GitHub actions.
