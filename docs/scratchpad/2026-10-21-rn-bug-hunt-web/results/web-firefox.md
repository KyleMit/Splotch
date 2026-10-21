# firefox results

Candidate b236d639160459eecd60900926c759af5d4ae080. Browser 155.0. Remote engine admission
confirmed; phase complete. See summary.md and coverage-scope.md for final adjudication and remaining
axes. PASS applies only to stated assertions. BLOCKED includes harness failures pending triage.

* 2026-10-21T03:27:11.972Z — phone C02-C03-C04-S06-library: **PASS**.
  {"heldDownloadDidNotBlockInk":true,"installed":"Coloring\nColoring book\n\nShow coloring pages and
  download new books automatically\n\nDownload over mobile data\n\nAllows automatic picture
  downloads when Wi-Fi isn't available\n\nDownloaded pictures\n\n7 of 7 extra books · 16.8
  MB\n\nEvery coloring book is ready offline\n\nRemove downloaded
  pictures","extraBookDrewOffline":true,"removed":"Coloring\nColoring book\n\nShow coloring pages
  and download new books automatically\n\nDownload over mobile data\n\nAllows automatic picture
  downloads when Wi-Fi isn't available\n\nDownloaded pictures\n\n0 of 7 extra books · 0.0
  MB\n\nRemove downloaded pictures","starterSurvivedRemovalOffline":true,"limits":"Named held asset
  fixture; Save-Data policy and cancel-in-flight removal remain separate."} Evidence:
  [screenshot](../evidence/firefox-phone-C02-C03-C04-S06-library-1792553288641.webp),
  [tree](../evidence/firefox-phone-C02-C03-C04-S06-library-1792553288641.aria.txt).

* 2026-10-21T03:28:11.777Z — phone D04-D05-page-magic-eraser-theme: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator:
  locator('[data-testid=\"pointer-halos\"]')\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall
  log:\n - Expect \"toHaveCount\" locator('[data-testid=\"pointer-halos\"]') with timeout 5000ms\n -
  waiting for locator('[data-testid=\"pointer-halos\"]')\n 14 × locator resolved to 1 element\n -
  unexpected value \"1\"\n"} Evidence:
  [screenshot](../evidence/firefox-phone-D04-D05-page-magic-eraser-theme-1792553313074.webp),
  [tree](../evidence/firefox-phone-D04-D05-page-magic-eraser-theme-1792553313074.aria.txt).

* 2026-10-21T03:28:36.287Z — desktop W04-W14-update-revision-fixture: **BLOCKED**.
  {"error":"page.reload: NS_ERROR_OFFLINE\nCall log:\n\u001b[2m - waiting for navigation until
  \"load\"\u001b[22m\n"} Evidence:
  [screenshot](../evidence/firefox-desktop-W04-W14-update-revision-fixture-1792553326460.webp),
  [tree](../evidence/firefox-desktop-W04-W14-update-revision-fixture-1792553326460.aria.txt).

* 2026-10-21T03:28:49.634Z — phone L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/firefox-phone-L03-browser-back-1792553334958.webp),
  [tree](../evidence/firefox-phone-L03-browser-back-1792553334958.aria.txt).

* 2026-10-21T03:28:56.668Z — tablet L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/firefox-tablet-L03-browser-back-1792553342151.webp),
  [tree](../evidence/firefox-tablet-L03-browser-back-1792553342151.aria.txt).

* 2026-10-21T03:29:03.982Z — desktop L03-browser-back: **PASS**.
  {"coarse":false,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":false,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/firefox-desktop-L03-browser-back-1792553348689.webp),
  [tree](../evidence/firefox-desktop-L03-browser-back-1792553348689.aria.txt).

* 2026-10-21T03:35:42.023Z — phone W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/firefox-phone-W06-mouse-contact-1792553749285.webp),
  [tree](../evidence/firefox-phone-W06-mouse-contact-1792553749285.aria.txt).

* 2026-10-21T03:35:51.887Z — tablet W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/firefox-tablet-W06-mouse-contact-1792553759235.webp),
  [tree](../evidence/firefox-tablet-W06-mouse-contact-1792553759235.aria.txt).

* 2026-10-21T03:36:01.425Z — desktop W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/firefox-desktop-W06-mouse-contact-1792553769243.webp),
  [tree](../evidence/firefox-desktop-W06-mouse-contact-1792553769243.aria.txt).

* 2026-10-21T03:36:11.146Z — phone W06-trusted-touch-dots: **PASS**.
  {"events":[{"tool":"touch","trusted":true},{"tool":"touch","trusted":true},{"tool":"touch","trusted":true}],"undo":3,"limits":"Trusted
  touch taps only. Continuous touch/pen/multitouch in WebKit and Firefox remains unproven without a
  supported remote touch drag API."} Evidence:
  [screenshot](../evidence/firefox-phone-W06-trusted-touch-dots-1792553774300.webp),
  [tree](../evidence/firefox-phone-W06-trusted-touch-dots-1792553774300.aria.txt).

* 2026-10-21T03:36:16.107Z — tablet W06-trusted-touch-dots: **PASS**.
  {"events":[{"tool":"touch","trusted":true},{"tool":"touch","trusted":true},{"tool":"touch","trusted":true}],"undo":3,"limits":"Trusted
  touch taps only. Continuous touch/pen/multitouch in WebKit and Firefox remains unproven without a
  supported remote touch drag API."} Evidence:
  [screenshot](../evidence/firefox-tablet-W06-trusted-touch-dots-1792553779166.webp),
  [tree](../evidence/firefox-tablet-W06-trusted-touch-dots-1792553779166.aria.txt).

* 2026-10-21T03:36:21.057Z — desktop D07-idle-gap: **PASS**.
  {"connectingMidpointUnchanged":true,"limits":"Recheck of known fixed 3019; 1.5s idle intentionally
  crosses dropped-pointer cutoff."} Evidence:
  [screenshot](../evidence/firefox-desktop-D07-idle-gap-1792553784288.webp),
  [tree](../evidence/firefox-desktop-D07-idle-gap-1792553784288.aria.txt).

* 2026-10-21T03:36:27.615Z — phone D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator:
  locator('[data-testid=\"pointer-halos\"]')\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall
  log:\n - Expect \"toHaveCount\" locator('[data-testid=\"pointer-halos\"]') with timeout 5000ms\n -
  waiting for locator('[data-testid=\"pointer-halos\"]')\n 14 × locator resolved to 1 element\n -
  unexpected value \"1\"\n"} Evidence:
  [screenshot](../evidence/firefox-phone-D02-D05-brush-ink-undo-1792553815690.webp),
  [tree](../evidence/firefox-phone-D02-D05-brush-ink-undo-1792553815690.aria.txt).

* 2026-10-21T03:36:57.182Z — phone D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/firefox-phone-D08-palette-1792553835016.webp),
  [tree](../evidence/firefox-phone-D08-palette-1792553835016.aria.txt).

* 2026-10-21T03:37:16.453Z — phone D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/firefox-phone-D09-custom-color-1792553845987.webp),
  [tree](../evidence/firefox-phone-D09-custom-color-1792553845987.aria.txt).

* 2026-10-21T03:37:27.397Z — phone D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/firefox-phone-D10-widths-1792553859629.webp),
  [tree](../evidence/firefox-phone-D10-widths-1792553859629.aria.txt).

* 2026-10-21T03:37:41.075Z — phone D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/firefox-phone-D11-deep-history-1792553899609.webp),
  [tree](../evidence/firefox-phone-D11-deep-history-1792553899609.aria.txt).

* 2026-10-21T03:38:21.036Z — phone P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_23-38-22.png","format":"png","width":780,"height":1538,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/firefox-phone-P01-P02-download-1792553902612.webp),
  [tree](../evidence/firefox-phone-P01-P02-download-1792553902612.aria.txt).

* 2026-10-21T03:38:25.648Z — tablet D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/firefox-tablet-D02-D05-brush-ink-undo-1792553936098.webp),
  [tree](../evidence/firefox-tablet-D02-D05-brush-ink-undo-1792553936098.aria.txt).

* 2026-10-21T03:38:57.691Z — tablet D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/firefox-tablet-D08-palette-1792553955910.webp),
  [tree](../evidence/firefox-tablet-D08-palette-1792553955910.aria.txt).

* 2026-10-21T03:39:17.424Z — tablet D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/firefox-tablet-D09-custom-color-1792553967099.webp),
  [tree](../evidence/firefox-tablet-D09-custom-color-1792553967099.aria.txt).

* 2026-10-21T03:39:28.653Z — tablet D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-D10-widths-1792553981099.webp),
  [tree](../evidence/firefox-tablet-D10-widths-1792553981099.aria.txt).

* 2026-10-21T03:39:42.634Z — tablet D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/firefox-tablet-D11-deep-history-1792554020700.webp),
  [tree](../evidence/firefox-tablet-D11-deep-history-1792554020700.aria.txt).

* 2026-10-21T03:40:22.209Z — tablet P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_23-40-23.png","format":"png","width":1640,"height":2210,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/firefox-tablet-P01-P02-download-1792554024069.webp),
  [tree](../evidence/firefox-tablet-P01-P02-download-1792554024069.aria.txt).

* 2026-10-21T03:40:26.873Z — desktop D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator:
  locator('[data-testid=\"pointer-halos\"]')\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall
  log:\n - Expect \"toHaveCount\" locator('[data-testid=\"pointer-halos\"]') with timeout 5000ms\n -
  waiting for locator('[data-testid=\"pointer-halos\"]')\n 14 × locator resolved to 1 element\n -
  unexpected value \"1\"\n"} Evidence:
  [screenshot](../evidence/firefox-desktop-D02-D05-brush-ink-undo-1792554055158.webp),
  [tree](../evidence/firefox-desktop-D02-D05-brush-ink-undo-1792554055158.aria.txt).

* 2026-10-21T03:40:56.664Z — desktop D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/firefox-desktop-D08-palette-1792554074498.webp),
  [tree](../evidence/firefox-desktop-D08-palette-1792554074498.aria.txt).

* 2026-10-21T03:41:16.060Z — desktop D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/firefox-desktop-D09-custom-color-1792554085985.webp),
  [tree](../evidence/firefox-desktop-D09-custom-color-1792554085985.aria.txt).

* 2026-10-21T03:41:27.528Z — desktop D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-D10-widths-1792554101553.webp),
  [tree](../evidence/firefox-desktop-D10-widths-1792554101553.aria.txt).

* 2026-10-21T03:41:43.091Z — desktop D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/firefox-desktop-D11-deep-history-1792554141698.webp),
  [tree](../evidence/firefox-desktop-D11-deep-history-1792554141698.aria.txt).

* 2026-10-21T03:42:23.237Z — desktop P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_23-42-25.png","format":"png","width":2392,"height":1600,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/firefox-desktop-P01-P02-download-1792554145717.webp),
  [tree](../evidence/firefox-desktop-P01-P02-download-1792554145717.aria.txt).

* 2026-10-21T03:42:33.032Z — phone S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/firefox-phone-S01-section-entry-1792554183410.webp),
  [tree](../evidence/firefox-phone-S01-section-entry-1792554183410.aria.txt).

* 2026-10-21T03:43:05.795Z — phone S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/firefox-phone-S02-appearance-persist-1792554193045.webp),
  [tree](../evidence/firefox-phone-S02-appearance-persist-1792554193045.aria.txt).

* 2026-10-21T03:43:15.182Z — phone X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"DIV","label":"AppearanceNight Mode · portrait lockSoundVolume 50%Tool DrawerPen,
  crayon, magic","inDialog":true},{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true},{"tag":"BUTTON","label":"Parent Center, Choose when grown-up checks
  appear","inDialog":true},{"tag":"BUTTON","label":"Install, Install & lock the
  app","inDialog":true},{"tag":"BUTTON","label":"Feedback, Report a bug or share an
  idea","inDialog":true},{"tag":"BUTTON","label":"What's New, See what's
  changed","inDialog":true},{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"DIV","label":"AppearanceNight
  Mode · portrait lockSoundVolume 50%Tool DrawerPen, crayon,
  magic","inDialog":true},{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true}],"focusRestored":true} Evidence:
  [screenshot](../evidence/firefox-phone-X04-W07-settings-focus-1792554197408.webp),
  [tree](../evidence/firefox-phone-X04-W07-settings-focus-1792554197408.aria.txt).

* 2026-10-21T03:43:19.616Z — phone X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/firefox-phone-X06-undo-shortcut-1792554208205.webp),
  [tree](../evidence/firefox-phone-X06-undo-shortcut-1792554208205.aria.txt).

* 2026-10-21T03:43:30.823Z — phone L02-viewport-rotation: **PASS**.
  {"original":{"width":390,"height":844},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/firefox-phone-L02-viewport-rotation-1792554215645.webp),
  [tree](../evidence/firefox-phone-L02-viewport-rotation-1792554215645.aria.txt).

* 2026-10-21T03:43:37.785Z — tablet S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/firefox-tablet-S01-section-entry-1792554249716.webp),
  [tree](../evidence/firefox-tablet-S01-section-entry-1792554249716.aria.txt).

* 2026-10-21T03:44:11.622Z — tablet S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/firefox-tablet-S02-appearance-persist-1792554258606.webp),
  [tree](../evidence/firefox-tablet-S02-appearance-persist-1792554258606.aria.txt).

* 2026-10-21T03:44:20.664Z — tablet X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"Appearance","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer","inDialog":true},{"tag":"BUTTON","label":"Accessibility","inDialog":true},{"tag":"BUTTON","label":"Coloring","inDialog":true},{"tag":"BUTTON","label":"AI
  Art","inDialog":true},{"tag":"BUTTON","label":"Saving","inDialog":true},{"tag":"BUTTON","label":"Parent
  Center","inDialog":true},{"tag":"BUTTON","label":"Install","inDialog":true},{"tag":"BUTTON","label":"Feedback","inDialog":true},{"tag":"BUTTON","label":"What's
  New","inDialog":true},{"tag":"BUTTON","label":"About","inDialog":true},{"tag":"DIV","label":"AppearanceThemeLightDarkSystemButton
  styleRaisedFlatSoundSoundVolume50%What
  make","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"BUTTON","label":"Drawing","inDialog":true},{"tag":"BUTTON","label":"Deleting","inDialog":true},{"tag":"BUTTON","label":"Enable
  tool
  drawer","inDialog":true},{"tag":"BUTTON","label":"Crayon","inDialog":true},{"tag":"BUTTON","label":"Magic
  brush","inDialog":true},{"tag":"BUTTON","label":"Eraser","inDialog":true},{"tag":"BUTTON","label":"Stroke
  width","inDialog":true}],"focusRestored":true} Evidence:
  [screenshot](../evidence/firefox-tablet-X04-W07-settings-focus-1792554262445.webp),
  [tree](../evidence/firefox-tablet-X04-W07-settings-focus-1792554262445.aria.txt).

* 2026-10-21T03:44:24.356Z — tablet X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/firefox-tablet-X06-undo-shortcut-1792554273112.webp),
  [tree](../evidence/firefox-tablet-X06-undo-shortcut-1792554273112.aria.txt).

* 2026-10-21T03:44:35.164Z — tablet L02-viewport-rotation: **PASS**.
  {"original":{"width":820,"height":1180},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/firefox-tablet-L02-viewport-rotation-1792554280138.webp),
  [tree](../evidence/firefox-tablet-L02-viewport-rotation-1792554280138.aria.txt).

* 2026-10-21T03:44:42.381Z — desktop S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/firefox-desktop-S01-section-entry-1792554312222.webp),
  [tree](../evidence/firefox-desktop-S01-section-entry-1792554312222.aria.txt).

* 2026-10-21T03:45:14.231Z — desktop S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/firefox-desktop-S02-appearance-persist-1792554320710.webp),
  [tree](../evidence/firefox-desktop-S02-appearance-persist-1792554320710.aria.txt).

* 2026-10-21T03:45:23.005Z — desktop X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"DIV","label":"AppearanceSoundTool DrawerAccessibilityColoringAI ArtSavingParent
  CenterInstallF","inDialog":true},{"tag":"BUTTON","label":"Appearance","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer","inDialog":true},{"tag":"BUTTON","label":"Accessibility","inDialog":true},{"tag":"BUTTON","label":"Coloring","inDialog":true},{"tag":"BUTTON","label":"AI
  Art","inDialog":true},{"tag":"BUTTON","label":"Saving","inDialog":true},{"tag":"BUTTON","label":"Parent
  Center","inDialog":true},{"tag":"BUTTON","label":"Install","inDialog":true},{"tag":"BUTTON","label":"Feedback","inDialog":true},{"tag":"BUTTON","label":"What's
  New","inDialog":true},{"tag":"BUTTON","label":"About","inDialog":true},{"tag":"DIV","label":"AppearanceThemeLightDarkSystemButton
  styleRaisedFlatSoundSoundVolume50%What
  make","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"BUTTON","label":"Drawing","inDialog":true},{"tag":"BUTTON","label":"Deleting","inDialog":true},{"tag":"BUTTON","label":"Enable
  tool
  drawer","inDialog":true},{"tag":"BUTTON","label":"Crayon","inDialog":true},{"tag":"BUTTON","label":"Magic
  brush","inDialog":true},{"tag":"BUTTON","label":"Eraser","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/firefox-desktop-X04-W07-settings-focus-1792554325080.webp),
  [tree](../evidence/firefox-desktop-X04-W07-settings-focus-1792554325080.aria.txt).

* 2026-10-21T03:45:26.988Z — desktop X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/firefox-desktop-X06-undo-shortcut-1792554335188.webp),
  [tree](../evidence/firefox-desktop-X06-undo-shortcut-1792554335188.aria.txt).

* 2026-10-21T03:45:37.075Z — desktop L02-viewport-rotation: **PASS**.
  {"original":{"width":1280,"height":800},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/firefox-desktop-L02-viewport-rotation-1792554342065.webp),
  [tree](../evidence/firefox-desktop-L02-viewport-rotation-1792554342065.aria.txt).

* 2026-10-21T03:45:44.075Z — narrow S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/firefox-narrow-S01-section-entry-1792554373323.webp),
  [tree](../evidence/firefox-narrow-S01-section-entry-1792554373323.aria.txt).

* 2026-10-21T03:46:15.114Z — narrow S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/firefox-narrow-S02-appearance-persist-1792554381305.webp),
  [tree](../evidence/firefox-narrow-S02-appearance-persist-1792554381305.aria.txt).

* 2026-10-21T03:46:23.111Z — narrow X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"DIV","label":"AppearanceNight Mode · portrait lockSoundVolume 50%Tool DrawerPen,
  crayon, magic","inDialog":true},{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true},{"tag":"BUTTON","label":"Parent Center, Choose when grown-up checks
  appear","inDialog":true},{"tag":"BUTTON","label":"Install, Install & lock the
  app","inDialog":true},{"tag":"BUTTON","label":"Feedback, Report a bug or share an
  idea","inDialog":true},{"tag":"BUTTON","label":"What's New, See what's
  changed","inDialog":true},{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"DIV","label":"AppearanceNight
  Mode · portrait lockSoundVolume 50%Tool DrawerPen, crayon,
  magic","inDialog":true},{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true}],"focusRestored":true} Evidence:
  [screenshot](../evidence/firefox-narrow-X04-W07-settings-focus-1792554384974.webp),
  [tree](../evidence/firefox-narrow-X04-W07-settings-focus-1792554384974.aria.txt).

* 2026-10-21T03:46:26.824Z — narrow X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/firefox-narrow-X06-undo-shortcut-1792554394999.webp),
  [tree](../evidence/firefox-narrow-X06-undo-shortcut-1792554394999.aria.txt).

* 2026-10-21T03:46:36.781Z — narrow L02-viewport-rotation: **PASS**.
  {"original":{"width":320,"height":740},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/firefox-narrow-L02-viewport-rotation-1792554401540.webp),
  [tree](../evidence/firefox-narrow-L02-viewport-rotation-1792554401540.aria.txt).

* 2026-10-21T03:46:44.801Z — phone S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/firefox-phone-S03-volume-sources-1792554411470.webp),
  [tree](../evidence/firefox-phone-S03-volume-sources-1792554411470.aria.txt).

* 2026-10-21T03:46:53.443Z — phone S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/firefox-phone-S04-drawer-brush-disable-1792554425796.webp),
  [tree](../evidence/firefox-phone-S04-drawer-brush-disable-1792554425796.aria.txt).

* 2026-10-21T03:47:07.645Z — phone S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/firefox-phone-S05-accessibility-endpoints-1792554435904.webp),
  [tree](../evidence/firefox-phone-S05-accessibility-endpoints-1792554435904.aria.txt).

* 2026-10-21T03:47:18.631Z — phone S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/firefox-phone-S06-coloring-toggle-1792554445116.webp),
  [tree](../evidence/firefox-phone-S06-coloring-toggle-1792554445116.aria.txt).

* 2026-10-21T03:47:26.923Z — phone S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/firefox-phone-S08-camera-autosave-1792554453440.webp),
  [tree](../evidence/firefox-phone-S08-camera-autosave-1792554453440.aria.txt).

* 2026-10-21T03:47:35.231Z — phone G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/firefox-phone-G01-G03-G04-parent-policy-keyboard-1792554482049.webp),
  [tree](../evidence/firefox-phone-G01-G03-G04-parent-policy-keyboard-1792554482049.aria.txt).

* 2026-10-21T03:48:03.921Z — tablet S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/firefox-tablet-S03-volume-sources-1792554491017.webp),
  [tree](../evidence/firefox-tablet-S03-volume-sources-1792554491017.aria.txt).

* 2026-10-21T03:48:12.829Z — tablet S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/firefox-tablet-S04-drawer-brush-disable-1792554506045.webp),
  [tree](../evidence/firefox-tablet-S04-drawer-brush-disable-1792554506045.aria.txt).

* 2026-10-21T03:48:27.892Z — tablet S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-S05-accessibility-endpoints-1792554516445.webp),
  [tree](../evidence/firefox-tablet-S05-accessibility-endpoints-1792554516445.aria.txt).

* 2026-10-21T03:48:38.266Z — tablet S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-S06-coloring-toggle-1792554524870.webp),
  [tree](../evidence/firefox-tablet-S06-coloring-toggle-1792554524870.aria.txt).

* 2026-10-21T03:48:46.807Z — tablet S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/firefox-tablet-S08-camera-autosave-1792554533801.webp),
  [tree](../evidence/firefox-tablet-S08-camera-autosave-1792554533801.aria.txt).

* 2026-10-21T03:48:55.652Z — tablet G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-G01-G03-G04-parent-policy-keyboard-1792554569392.webp),
  [tree](../evidence/firefox-tablet-G01-G03-G04-parent-policy-keyboard-1792554569392.aria.txt).

* 2026-10-21T03:49:31.467Z — desktop S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/firefox-desktop-S03-volume-sources-1792554578243.webp),
  [tree](../evidence/firefox-desktop-S03-volume-sources-1792554578243.aria.txt).

* 2026-10-21T03:49:40.338Z — desktop S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/firefox-desktop-S04-drawer-brush-disable-1792554593914.webp),
  [tree](../evidence/firefox-desktop-S04-drawer-brush-disable-1792554593914.aria.txt).

* 2026-10-21T03:49:55.811Z — desktop S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-S05-accessibility-endpoints-1792554604419.webp),
  [tree](../evidence/firefox-desktop-S05-accessibility-endpoints-1792554604419.aria.txt).

* 2026-10-21T03:50:06.360Z — desktop S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-S06-coloring-toggle-1792554612964.webp),
  [tree](../evidence/firefox-desktop-S06-coloring-toggle-1792554612964.aria.txt).

* 2026-10-21T03:50:14.923Z — desktop S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/firefox-desktop-S08-camera-autosave-1792554622061.webp),
  [tree](../evidence/firefox-desktop-S08-camera-autosave-1792554622061.aria.txt).

* 2026-10-21T03:50:24.018Z — desktop G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-G01-G03-G04-parent-policy-keyboard-1792554657127.webp),
  [tree](../evidence/firefox-desktop-G01-G03-G04-parent-policy-keyboard-1792554657127.aria.txt).

* 2026-10-21T03:51:00.616Z — phone C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":780,"height":1538},"coloringRequests":303,"badColoringResponses":[],"networkReceipt":"evidence/firefox-phone-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/firefox-phone-C01-P01-farm-composite-1792554674930.webp),
  [tree](../evidence/firefox-phone-C01-P01-farm-composite-1792554674930.aria.txt).

* 2026-10-21T03:51:16.879Z — phone D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"d9e172a89d653b32e9c3de9d1eed6dee3a04521e04439845b869ffc6c1a45fb9","restoredDigest":"d9e172a89d653b32e9c3de9d1eed6dee3a04521e04439845b869ffc6c1a45fb9","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/firefox-phone-D12-short-full-clear-drag-1792554688980.webp),
  [tree](../evidence/firefox-phone-D12-short-full-clear-drag-1792554688980.aria.txt).

* 2026-10-21T03:51:30.818Z — phone W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/firefox-phone-W05-eraser-hover-1792554693610.webp),
  [tree](../evidence/firefox-phone-W05-eraser-hover-1792554693610.aria.txt).

* 2026-10-21T03:51:35.469Z — phone W08-root-overflow: **PASS**.
  {"overflow":{"scroll":390,"width":390,"height":844},"picker":{"x":44,"y":167.5,"width":302,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/firefox-phone-W08-root-overflow-1792554696973.webp),
  [tree](../evidence/firefox-phone-W08-root-overflow-1792554696973.aria.txt).

* 2026-10-21T03:51:38.790Z — tablet C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":1640,"height":2210},"coloringRequests":253,"badColoringResponses":[],"networkReceipt":"evidence/firefox-tablet-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-C01-P01-farm-composite-1792554713823.webp),
  [tree](../evidence/firefox-tablet-C01-P01-farm-composite-1792554713823.aria.txt).

* 2026-10-21T03:51:55.752Z — tablet D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"15e5458a3d06241eba0d5779e3821fbac38e571f52065390498eb70236a0c623","restoredDigest":"15e5458a3d06241eba0d5779e3821fbac38e571f52065390498eb70236a0c623","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/firefox-tablet-D12-short-full-clear-drag-1792554728291.webp),
  [tree](../evidence/firefox-tablet-D12-short-full-clear-drag-1792554728291.aria.txt).

* 2026-10-21T03:52:10.207Z — tablet W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/firefox-tablet-W05-eraser-hover-1792554733181.webp),
  [tree](../evidence/firefox-tablet-W05-eraser-hover-1792554733181.aria.txt).

* 2026-10-21T03:52:15.041Z — tablet W08-root-overflow: **PASS**.
  {"overflow":{"scroll":820,"width":820,"height":1180},"picker":{"x":109,"y":335.5,"width":602,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/firefox-tablet-W08-root-overflow-1792554736579.webp),
  [tree](../evidence/firefox-tablet-W08-root-overflow-1792554736579.aria.txt).

* 2026-10-21T03:52:18.633Z — desktop C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":2392,"height":1600},"coloringRequests":302,"badColoringResponses":[],"networkReceipt":"evidence/firefox-desktop-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-C01-P01-farm-composite-1792554753219.webp),
  [tree](../evidence/firefox-desktop-C01-P01-farm-composite-1792554753219.aria.txt).

* 2026-10-21T03:52:35.290Z — desktop D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"eabbfb9ea5b3eee8c6e9f6e8ed8c619ff1ede60c445976cb3c108add33ff6e61","restoredDigest":"eabbfb9ea5b3eee8c6e9f6e8ed8c619ff1ede60c445976cb3c108add33ff6e61","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/firefox-desktop-D12-short-full-clear-drag-1792554767682.webp),
  [tree](../evidence/firefox-desktop-D12-short-full-clear-drag-1792554767682.aria.txt).

* 2026-10-21T03:52:49.761Z — desktop W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-eraser-hover-1792554772551.webp),
  [tree](../evidence/firefox-desktop-W05-eraser-hover-1792554772551.aria.txt).

* 2026-10-21T03:52:54.789Z — desktop W08-root-overflow: **PASS**.
  {"overflow":{"scroll":1280,"width":1280,"height":800},"picker":{"x":339,"y":145.5,"width":602,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/firefox-desktop-W08-root-overflow-1792554776221.webp),
  [tree](../evidence/firefox-desktop-W08-root-overflow-1792554776221.aria.txt).

* 2026-10-21T03:52:58.207Z — narrow C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":192,"height":332,"changedPixels":390,"mean":0.008011211512717538,"max":3,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":640,"height":1330},"coloringRequests":309,"badColoringResponses":[],"networkReceipt":"evidence/firefox-narrow-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/firefox-narrow-C01-P01-farm-composite-1792554792413.webp),
  [tree](../evidence/firefox-narrow-C01-P01-farm-composite-1792554792413.aria.txt).

* 2026-10-21T03:53:14.466Z — narrow D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"f1da10bb92f0b4725a2b8fa273f4a6f785f590e82618e758ad81aa2a03deb025","restoredDigest":"f1da10bb92f0b4725a2b8fa273f4a6f785f590e82618e758ad81aa2a03deb025","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/firefox-narrow-D12-short-full-clear-drag-1792554806606.webp),
  [tree](../evidence/firefox-narrow-D12-short-full-clear-drag-1792554806606.aria.txt).

* 2026-10-21T03:53:28.427Z — narrow W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/firefox-narrow-W05-eraser-hover-1792554811291.webp),
  [tree](../evidence/firefox-narrow-W05-eraser-hover-1792554811291.aria.txt).

* 2026-10-21T03:53:33.255Z — narrow W08-root-overflow: **PASS**.
  {"overflow":{"scroll":320,"width":320,"height":740},"picker":{"x":39,"y":115.5,"width":242,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/firefox-narrow-W08-root-overflow-1792554814704.webp),
  [tree](../evidence/firefox-narrow-W08-root-overflow-1792554814704.aria.txt).

* 2026-10-21T03:53:36.544Z — phone X01-X03-W09-W10-dark: **PASS**.
  {"mode":"dark","media":{"dark":true,"reduce":false,"forced":false,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-dark-1792554821858.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-dark-1792554821858.aria.txt).

* 2026-10-21T03:53:43.686Z — phone X01-X03-W09-W10-reduce: **PASS**.
  {"mode":"reduce","media":{"dark":false,"reduce":true,"forced":false,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-reduce-1792554828921.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-reduce-1792554828921.aria.txt).

* 2026-10-21T03:53:50.836Z — phone X01-X03-W09-W10-forced: **PASS**.
  {"mode":"forced","media":{"dark":false,"reduce":false,"forced":true,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-forced-1792554836098.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-forced-1792554836098.aria.txt).

* 2026-10-21T03:53:57.841Z — phone X01-X03-W09-W10-text200: **PASS**.
  {"mode":"text200","media":{"dark":false,"reduce":false,"forced":false,"font":"32px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-text200-1792554843248.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-text200-1792554843248.aria.txt).

* 2026-10-21T03:54:05.140Z — phone X01-X03-W09-W10-cssZoom200: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Close',
  exact: true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\"
  aria-label=\"Close\" aria-disabled=\"false\" data-focus-ring=\"radiusBlob2\" class=\"x1y0btm7
  x1ghz6dp x9f619 x1n2onr6 x78zum5 x6s0dn4 xl56j7k x2lah0s xc342km xjbqb8w x1ypdohk x11xpdln
  x12nm00m x5lhr3w x16ye13r x3oybdh xp6p8kk x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-cssZoom200-1792554855299.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-cssZoom200-1792554855299.aria.txt).

* 2026-10-21T03:54:18.392Z — phone A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/firefox-phone-A01-A03-A08-fixture-success-1792554870612.webp),
  [tree](../evidence/firefox-phone-A01-A03-A08-fixture-success-1792554870612.aria.txt).

* 2026-10-21T03:54:32.216Z — tablet A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/firefox-tablet-A01-A03-A08-fixture-success-1792554883737.webp),
  [tree](../evidence/firefox-tablet-A01-A03-A08-fixture-success-1792554883737.aria.txt).

* 2026-10-21T03:54:45.423Z — desktop A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/firefox-desktop-A01-A03-A08-fixture-success-1792554897607.webp),
  [tree](../evidence/firefox-desktop-A01-A03-A08-fixture-success-1792554897607.aria.txt).

* 2026-10-21T03:54:59.353Z — phone A04-A05-serverError: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/firefox-phone-A04-A05-serverError-1792554906323.webp),
  [tree](../evidence/firefox-phone-A04-A05-serverError-1792554906323.aria.txt).

* 2026-10-21T03:55:07.906Z — phone A04-A05-bare502: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/firefox-phone-A04-A05-bare502-1792554914592.webp),
  [tree](../evidence/firefox-phone-A04-A05-bare502-1792554914592.aria.txt).

* 2026-10-21T03:55:16.237Z — phone A04-A05-malformedJson: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/firefox-phone-A04-A05-malformedJson-1792554923331.webp),
  [tree](../evidence/firefox-phone-A04-A05-malformedJson-1792554923331.aria.txt).

* 2026-10-21T03:55:24.928Z — phone A04-A05-wrongType: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/firefox-phone-A04-A05-wrongType-1792554932025.webp),
  [tree](../evidence/firefox-phone-A04-A05-wrongType-1792554932025.aria.txt).

* 2026-10-21T03:55:33.656Z — phone A04-A05-throttled: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/firefox-phone-A04-A05-throttled-1792554940913.webp),
  [tree](../evidence/firefox-phone-A04-A05-throttled-1792554940913.aria.txt).

* 2026-10-21T03:55:42.504Z — phone A04-A05-refusal: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Report
  this refusal', exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not
  found\n\nCall log:\n - Expect \"toBeVisible\" getByRole('button', { name: 'Report this refusal',
  exact: true }) with timeout 15000ms\n - waiting for getByRole('button', { name: 'Report this
  refusal', exact: true })\n"} Evidence:
  [screenshot](../evidence/firefox-phone-A04-A05-refusal-1792554964333.webp),
  [tree](../evidence/firefox-phone-A04-A05-refusal-1792554964333.aria.txt).

* 2026-10-21T03:56:05.981Z — phone S07-dummy-key-persistence: **PASS**.
  {"dummyOnly":true,"verifiedThroughFixture":true,"masked":true,"noPlaintextLocalStorage":true,"reloadRetained":true,"forgetPersisted":true,"fieldShortcutDidNotUndoInk":true,"requests":[{"at":1792554970915,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792554971014,"method":"POST","host":"splotch.art","path":"/api/verify-key","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"application/json","bytes":53},"credential":[],"reply":200},{"at":1792554975514,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792554976069,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792554976137,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"No
  real key; encryption implementation covered by existing vault tests, not inferred from masking."}
  Evidence: [screenshot](../evidence/firefox-phone-S07-dummy-key-persistence-1792554979064.webp),
  [tree](../evidence/firefox-phone-S07-dummy-key-persistence-1792554979064.aria.txt).

* 2026-10-21T03:56:20.988Z — phone A06-ticket-poll-success: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  30000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/firefox-phone-A06-ticket-poll-success-1792555018020.webp),
  [tree](../evidence/firefox-phone-A06-ticket-poll-success-1792555018020.aria.txt).

* 2026-10-21T03:56:59.696Z — phone A07-offline-reconnect: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  15000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/firefox-phone-A07-offline-reconnect-1792555041729.webp),
  [tree](../evidence/firefox-phone-A07-offline-reconnect-1792555041729.aria.txt).

* 2026-10-21T03:57:23.375Z — phone W13-ai-idb-quota: **BLOCKED**.
  {"error":"expect(received).toBeGreaterThan(expected)\n\nExpected: > 0\nReceived: 0"} Evidence:
  [screenshot](../evidence/firefox-phone-W13-ai-idb-quota-1792555050382.webp),
  [tree](../evidence/firefox-phone-W13-ai-idb-quota-1792555050382.aria.txt).

* 2026-10-21T03:57:33.708Z — phone G02-wrong-answer-lockout: **PASS**.
  {"wrongAnswers":3,"problems":["What is 6 times 3?","What is 7 times 4?","What is 9 times
  4?"],"lockedMs":30091,"disabledDuringLockout":true,"recoveredAndSolved":true,"limits":"Real 30s
  base lockout; subsequent exponential lockouts not exercised."} Evidence:
  [screenshot](../evidence/firefox-phone-G02-wrong-answer-lockout-1792555098530.webp),
  [tree](../evidence/firefox-phone-G02-wrong-answer-lockout-1792555098530.aria.txt).

* 2026-10-21T03:58:32.746Z — phone A01-WebKit-preupload-diagnostic-1: **PASS**.
  {"attempt":1,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"canvas-png","base64":17608},{"operation":"canvas-png","base64":17908},{"operation":"decode","ok":true,"width":780,"height":1538},{"operation":"canvas-png","base64":17228}],"requests":[{"at":1792555111286,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button \"Enter
  fullscreen\":\n - img\n- button \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button
  \"Stroke width\":\n - img\n- button \"Coloring books\":\n - img\n- button \"Save screenshot\":\n -
  img\n- button \"Create AI image, 10 free left\":\n - img\n- button \"Undo\":\n - img\n- img\n-
  button \"Collapse controls\" [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n-
  button \"Clear drawing\":\n - img\n- dialog \"AI Result\":\n - status: That didn't work\n - button
  \"Close\":\n - img\n - img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's
  give it one more go.\n - button \"Try again\":\n - img\n - text: Try again\n - button \"Report a
  problem\":\n - img\n - text: Report a problem"} Evidence:
  [screenshot](../evidence/firefox-phone-A01-WebKit-preupload-diagnostic-1-1792555114957.webp),
  [tree](../evidence/firefox-phone-A01-WebKit-preupload-diagnostic-1-1792555114957.aria.txt).

* 2026-10-21T03:58:41.347Z — phone A01-WebKit-preupload-diagnostic-2: **PASS**.
  {"attempt":2,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"canvas-png","base64":17608},{"operation":"canvas-png","base64":17908},{"operation":"decode","ok":true,"width":780,"height":1538},{"operation":"canvas-png","base64":17228}],"requests":[{"at":1792555119818,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button \"Enter
  fullscreen\":\n - img\n- button \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button
  \"Stroke width\":\n - img\n- button \"Coloring books\":\n - img\n- button \"Save screenshot\":\n -
  img\n- button \"Create AI image, 10 free left\":\n - img\n- button \"Undo\":\n - img\n- img\n-
  button \"Collapse controls\" [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n-
  button \"Clear drawing\":\n - img\n- dialog \"AI Result\":\n - status: That didn't work\n - button
  \"Close\":\n - img\n - img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's
  give it one more go.\n - button \"Try again\":\n - img\n - text: Try again\n - button \"Report a
  problem\":\n - img\n - text: Report a problem"} Evidence:
  [screenshot](../evidence/firefox-phone-A01-WebKit-preupload-diagnostic-2-1792555123394.webp),
  [tree](../evidence/firefox-phone-A01-WebKit-preupload-diagnostic-2-1792555123394.aria.txt).

* 2026-10-21T03:58:46.611Z — desktop W05-halo-lift-diagnostic-1: **PASS**.
  {"attempt":1,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1270,"stamp":1265,"trusted":true},{"phase":"frame","time":1271,"raf":1265.02},{"phase":"frame","time":1271,"raf":1265.22},{"phase":"frame","time":1275,"raf":1274.02},{"phase":"frame","time":1282,"raf":1281.92},{"phase":"frame","time":1291,"raf":1290.2},{"phase":"frame","time":1298,"raf":1298.74}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-1-1792555133443.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-1-1792555133443.aria.txt).

* 2026-10-21T03:58:55.257Z — desktop W05-halo-lift-diagnostic-2: **PASS**.
  {"attempt":2,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1029,"stamp":1026,"trusted":true},{"phase":"frame","time":1031,"raf":1026.18},{"phase":"frame","time":1031,"raf":1029.74},{"phase":"frame","time":1038,"raf":1037.64},{"phase":"frame","time":1045,"raf":1044.9},{"phase":"frame","time":1053,"raf":1052.88},{"phase":"frame","time":1063,"raf":1062.22}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-2-1792555142075.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-2-1792555142075.aria.txt).

* 2026-10-21T03:59:04.003Z — desktop W05-halo-lift-diagnostic-3: **PASS**.
  {"attempt":3,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1149,"stamp":1146,"trusted":true},{"phase":"frame","time":1150,"raf":1145.62},{"phase":"frame","time":1154,"raf":1153.98},{"phase":"frame","time":1163,"raf":1163.22},{"phase":"frame","time":1171,"raf":1170.78},{"phase":"frame","time":1180,"raf":1178.72},{"phase":"frame","time":1193,"raf":1188.28}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-3-1792555150891.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-3-1792555150891.aria.txt).

* 2026-10-21T03:59:12.869Z — desktop W05-halo-lift-diagnostic-4: **PASS**.
  {"attempt":4,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1144,"stamp":1141,"trusted":true},{"phase":"frame","time":1145,"raf":1140.66},{"phase":"frame","time":1149,"raf":1148.72},{"phase":"frame","time":1157,"raf":1156.78},{"phase":"frame","time":1165,"raf":1164.72},{"phase":"frame","time":1174,"raf":1173.6},{"phase":"frame","time":1181,"raf":1180.72}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-4-1792555159690.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-4-1792555159690.aria.txt).

* 2026-10-21T03:59:21.580Z — desktop W05-halo-lift-diagnostic-5: **PASS**.
  {"attempt":5,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1106,"stamp":1100,"trusted":true},{"phase":"frame","time":1107,"raf":1100.36},{"phase":"frame","time":1107,"raf":1106.14},{"phase":"frame","time":1116,"raf":1115.62},{"phase":"frame","time":1124,"raf":1123.66},{"phase":"frame","time":1130,"raf":1130.48},{"phase":"frame","time":1139,"raf":1138.88}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-5-1792555168424.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-5-1792555168424.aria.txt).

* 2026-10-21T03:59:30.549Z — desktop W05-halo-lift-diagnostic-6: **PASS**.
  {"attempt":6,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1243,"stamp":1238,"trusted":true},{"phase":"frame","time":1243,"raf":1238.64},{"phase":"frame","time":1244,"raf":1240.12},{"phase":"frame","time":1250,"raf":1249.5},{"phase":"frame","time":1258,"raf":1257.7},{"phase":"frame","time":1266,"raf":1266.06},{"phase":"frame","time":1273,"raf":1272.78}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-6-1792555177455.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-6-1792555177455.aria.txt).

* 2026-10-21T03:59:39.426Z — desktop W05-halo-lift-diagnostic-7: **PASS**.
  {"attempt":7,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1094,"stamp":1091,"trusted":true},{"phase":"frame","time":1095,"raf":1091.1},{"phase":"frame","time":1095,"raf":1094.44},{"phase":"frame","time":1103,"raf":1102.84},{"phase":"frame","time":1113,"raf":1112.98},{"phase":"frame","time":1121,"raf":1120.9},{"phase":"frame","time":1129,"raf":1129.34}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-7-1792555186290.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-7-1792555186290.aria.txt).

* 2026-10-21T03:59:48.144Z — desktop W05-halo-lift-diagnostic-8: **PASS**.
  {"attempt":8,"engine":"firefox","waitMs":5500,"retainedHalo":false,"halos":[],"clock":[{"phase":"released","time":1095,"stamp":1090,"trusted":true},{"phase":"frame","time":1095,"raf":1086.06},{"phase":"frame","time":1101,"raf":1101.06},{"phase":"frame","time":1109,"raf":1109.8},{"phase":"frame","time":1119,"raf":1119.3},{"phase":"frame","time":1128,"raf":1127.34},{"phase":"frame","time":1134,"raf":1134.6}],"limits":"One
  trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or
  product-state write."} Evidence:
  [screenshot](../evidence/firefox-desktop-W05-halo-lift-diagnostic-8-1792555194997.webp),
  [tree](../evidence/firefox-desktop-W05-halo-lift-diagnostic-8-1792555194997.aria.txt).

* 2026-10-21T03:59:58.260Z — desktop W04-W14-update-revision-fixture: **PASS**.
  {"waitingBeforeHide":"installed","inkPreventedReload":true,"blankHiddenReloaded":true,"navigations":["http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/"],"offlineAfterUpdateDrew":true,"offlineFixture":"Stop
  this case’s local proxy after the new worker takes control.","limits":"Changed-worker and version
  fixture uses the same qualified app artifact, not a second release. Hidden state is a named
  headless fixture."} Evidence:
  [screenshot](../evidence/firefox-desktop-W04-W14-update-revision-fixture-1792555210964.webp),
  [tree](../evidence/firefox-desktop-W04-W14-update-revision-fixture-1792555210964.aria.txt).

* 2026-10-21T04:00:14.496Z — phone W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/firefox-phone-W03-W14-offline-host-loss-1792555227609.webp),
  [tree](../evidence/firefox-phone-W03-W14-offline-host-loss-1792555227609.aria.txt).

* 2026-10-21T04:00:29.485Z — tablet W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/firefox-tablet-W03-W14-offline-host-loss-1792555243308.webp),
  [tree](../evidence/firefox-tablet-W03-W14-offline-host-loss-1792555243308.aria.txt).

* 2026-10-21T04:00:45.211Z — desktop W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/firefox-desktop-W03-W14-offline-host-loss-1792555257681.webp),
  [tree](../evidence/firefox-desktop-W03-W14-offline-host-loss-1792555257681.aria.txt).

* 2026-10-21T04:01:27.876Z — phone W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- button \"Enter fullscreen\":\n - img\n- strong:
  Add Splotch to your home screen\n- text: Opens full-screen, just like a real app\n- button
  \"Install\":\n - img\n - text: Install\n- button \"Not now\":\n - img\n - img\n- button
  \"Settings\":\n - img\n- button \"Expand controls\":\n - img\n- status\n- status\n- button \"Clear
  drawing\":\n - img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named
  beforeinstallprompt fixture, not OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/firefox-phone-W01-W02-install-event-1792555293161.webp),
  [tree](../evidence/firefox-phone-W01-W02-install-event-1792555293161.aria.txt).

* 2026-10-21T04:01:35.481Z — desktop W01-W02-install-event: **PASS**. {"tree":"- button
  \"Purple\"\n- button \"Blue\"\n- button \"Teal\"\n- button \"Green\"\n- button \"Yellow\"\n-
  button \"Orange\"\n- button \"Red\"\n- button \"Pink\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/firefox-desktop-W01-W02-install-event-1792555300323.webp),
  [tree](../evidence/firefox-desktop-W01-W02-install-event-1792555300323.aria.txt).

* 2026-10-21T04:01:43.258Z — narrow W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n-
  img\n- button \"Enter fullscreen\":\n - img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/firefox-narrow-W01-W02-install-event-1792555308140.webp),
  [tree](../evidence/firefox-narrow-W01-W02-install-event-1792555308140.aria.txt).

* 2026-10-21T04:01:50.514Z — desktop W11-two-tab-settings: **PASS**.
  {"newTabReadFlat":true,"firstTabReloadReadDark":true,"flatPreserved":true,"limits":"Sequential
  writes and reloads; no live synchronization guarantee inferred."} Evidence:
  [screenshot](../evidence/firefox-desktop-W11-two-tab-settings-1792555323011.webp),
  [tree](../evidence/firefox-desktop-W11-two-tab-settings-1792555323011.aria.txt).

* 2026-10-21T04:02:09.409Z — phone P02-W12-many-pictures: **PASS**.
  {"count":25,"distinctPictures":25,"urls":{"createdPNG":25,"downloadLinks":25,"retainedDownloadUrls":0,"retainedByType":{"image/webp":350}},"estimateBefore":{"quota":10737418240,"usage":131232},"estimateAfter":{"quota":10737418240,"usage":16310366},"images":[{"name":"splotch-2026-10-21_00-02-11.png","bytes":548635,"width":780,"height":1538,"sha256":"9a0a1d39ff27c5ed4d7fa24a336befa0357fff22e6722e894961b58847dd4764"},{"name":"splotch-2026-10-21_00-02-15.png","bytes":552177,"width":780,"height":1538,"sha256":"4d5285f30b2c2814ffdfe38856ebaca18e07f4e108e316b707342b4e6bfb4a5f"},{"name":"splotch-2026-10-21_00-02-19.png","bytes":555789,"width":780,"height":1538,"sha256":"6a104e79346f0ba73f40b4229385386a3af87f49c040b0a016b1e4488a2ab93f"},{"name":"splotch-2026-10-21_00-02-23.png","bytes":559275,"width":780,"height":1538,"sha256":"b4535b67d690598e1cb871505661e03afb948806478266ab24b7a82db395a817"},{"name":"splotch-2026-10-21_00-02-28.png","bytes":562776,"width":780,"height":1538,"sha256":"31394471417ce5f39fac570905c406c0ce8d542a0a65cde481c064615c1cf1e9"},{"name":"splotch-2026-10-21_00-02-32.png","bytes":566116,"width":780,"height":1538,"sha256":"02db7fe20124e725c55e765bce594d375593ba0854ce05d0596a0534074f6407"},{"name":"splotch-2026-10-21_00-02-37.png","bytes":569636,"width":780,"height":1538,"sha256":"6b7326bbaf090f3585cecb702744d041e54983b8c408ffdd41c181ef783bab40"},{"name":"splotch-2026-10-21_00-02-41.png","bytes":572908,"width":780,"height":1538,"sha256":"da189355752c02f8be6b0b1d2dbf2973494250e0a37245d6b8a6196f1a98fff1"},{"name":"splotch-2026-10-21_00-02-45.png","bytes":576337,"width":780,"height":1538,"sha256":"091dd17f1fc8adbb6ecae3f358d5adafffde2727c06d57b88b0953dcabeadf18"},{"name":"splotch-2026-10-21_00-02-49.png","bytes":579776,"width":780,"height":1538,"sha256":"5f3f6f629d2ba370e8c8d0b036eff2a1e3b9d287ffcd01022d70e1fa9f97353e"},{"name":"splotch-2026-10-21_00-02-54.png","bytes":583325,"width":780,"height":1538,"sha256":"78813efc29669beaaee2932b3e0d4651ebd1eb99c5b87142a370c813ca9fae97"},{"name":"splotch-2026-10-21_00-02-59.png","bytes":586688,"width":780,"height":1538,"sha256":"e5e27c2290097f053174ec54902d04801b5f5fd3be72bf08138779e21339339b"},{"name":"splotch-2026-10-21_00-03-03.png","bytes":590076,"width":780,"height":1538,"sha256":"c90c61d7485c9ac595acc1c181694c21668836bb5b176ae4b6744104cac7372d"},{"name":"splotch-2026-10-21_00-03-07.png","bytes":593414,"width":780,"height":1538,"sha256":"7fa4f445ac7a35446900b9f1efd8f98662cf04a9b1638767baf38a6bfe0b7d1c"},{"name":"splotch-2026-10-21_00-03-12.png","bytes":597037,"width":780,"height":1538,"sha256":"23f6cb064e203353183ddf40dc7d59475116a418b707c6bd1617798726bfc888"},{"name":"splotch-2026-10-21_00-03-16.png","bytes":600258,"width":780,"height":1538,"sha256":"e27b734cc77f6eddb2699745e6ad101134751be864f12d7a63161029a4a921c7"},{"name":"splotch-2026-10-21_00-03-21.png","bytes":604025,"width":780,"height":1538,"sha256":"fcd0ab4e9d2d709c761678e88e6e4ac28eec83ca8e19a132b4d427774e502534"},{"name":"splotch-2026-10-21_00-03-25.png","bytes":607421,"width":780,"height":1538,"sha256":"be3e3ecd4b1966d41e72b165a4d1947c65b596cbfb24ce398d036073c136c466"},{"name":"splotch-2026-10-21_00-03-30.png","bytes":611156,"width":780,"height":1538,"sha256":"ab508e2e6b7aa354171c26f1256930297b15d27afda5c1bfb9e5226ec8d26e2d"},{"name":"splotch-2026-10-21_00-03-34.png","bytes":614418,"width":780,"height":1538,"sha256":"8a77d62cd9ef45cb7da842647adff01a06a7b881756cd74ae7d4587fc1458d97"},{"name":"splotch-2026-10-21_00-03-38.png","bytes":617934,"width":780,"height":1538,"sha256":"697097d3358ffac525dae805a9ab364d44ac6cdbb8b7cbf787100f1730f58b50"},{"name":"splotch-2026-10-21_00-03-43.png","bytes":621269,"width":780,"height":1538,"sha256":"1315d33164b198f5c09d651c951cabd3a9aa00cc8962c25c2d2ddb2391368fc9"},{"name":"splotch-2026-10-21_00-03-47.png","bytes":624855,"width":780,"height":1538,"sha256":"7071d617e1de1a646844f7fa9bbaeeac9b7a3454b6a542a58e36c8a755910592"},{"name":"splotch-2026-10-21_00-03-52.png","bytes":628062,"width":780,"height":1538,"sha256":"4b76da747dfad0a893cc0bbd9fe2cb3758acf182cd4799fdecb147757f52ccb8"},{"name":"splotch-2026-10-21_00-03-56.png","bytes":631387,"width":780,"height":1538,"sha256":"4f0a3d38129b6275e68cbc520957648ee3038bbed6d64dd0913d662e52b7206b"}],"reloadStartsBlank":true,"limits":"Download
  object URLs checked directly; total storage estimates also include automatic book downloads. Heap
  collection and real quota exhaustion are not inferred."} Evidence:
  [screenshot](../evidence/firefox-phone-P02-W12-many-pictures-1792555437602.webp),
  [tree](../evidence/firefox-phone-P02-W12-many-pictures-1792555437602.aria.txt).

* 2026-10-21T04:04:14.018Z — phone P02-W12-many-pictures: **PASS**.
  {"count":25,"distinctPictures":25,"distinctDecodedPictures":25,"urls":{"createdPNG":25,"downloadLinks":25,"retainedDownloadUrls":0,"retainedByType":{"image/webp":350}},"estimateBefore":{"quota":10737418240,"usage":131232},"estimateAfter":{"quota":10737418240,"usage":16310366},"images":[{"name":"splotch-2026-10-21_00-04-15.png","bytes":548635,"width":780,"height":1538,"sha256":"ef5e7b8a6303cfa3fc349c602c6ed2c1f7c111c2ce31463cd4bd46095c4b56f7","pixelSha256":"788cfd0481e3625053b8db0f22f7f1950f65b5bbd6154e82e5d221bea38def86"},{"name":"splotch-2026-10-21_00-04-19.png","bytes":552177,"width":780,"height":1538,"sha256":"bfcdde64b42cb684004fca460f1f7efb586dcd5588fbef4c5af9d7637d3ad768","pixelSha256":"03719663bc4267d605dac518a3aa116cbe00b459af7e9e9c91c2d1c170b1f99c"},{"name":"splotch-2026-10-21_00-04-24.png","bytes":555789,"width":780,"height":1538,"sha256":"5efd071e2afb08c8f168d76745dd4e53ea771f9f49e05d66415c366111091137","pixelSha256":"c4fb0676f9f0fe3c5fd0118b81f1fe8530f7f5aeb7fae23895287b08f18d55f4"},{"name":"splotch-2026-10-21_00-04-28.png","bytes":559275,"width":780,"height":1538,"sha256":"9bbb7d30c31d32578be1a342d11ada2dbe53cfcac012afa90dee4186aaf4667f","pixelSha256":"fed8484b1da6aa58e9dc1cf85c405e29ad6115ddd7676c27c6ee3259d84ba1b1"},{"name":"splotch-2026-10-21_00-04-32.png","bytes":562776,"width":780,"height":1538,"sha256":"f3b7f8fd20d8d29904d6f96aee028a5feaafe2e050b309ed5b0e75995bb19875","pixelSha256":"362b764b80347c8fe44f0c152821747734a6059109887790c6b83b4f913f7e08"},{"name":"splotch-2026-10-21_00-04-37.png","bytes":566116,"width":780,"height":1538,"sha256":"0a09cf3c65979e902d257deb3debffc340954d4467b3ba8fdb2145f11fad3815","pixelSha256":"cddc6568c7a085cbc462745c88c519a28d800d4f90965490a7e1d1bf194d6a92"},{"name":"splotch-2026-10-21_00-04-42.png","bytes":569636,"width":780,"height":1538,"sha256":"ffcf27b3797fba7d5d6ad9fc7e3d4be58da13649f802266dda6020ba659844a8","pixelSha256":"c28d9e88723bcf6cd6851d2d2a81d503cbc6cebf26384762a9a5fcd0a4949310"},{"name":"splotch-2026-10-21_00-04-46.png","bytes":572908,"width":780,"height":1538,"sha256":"bbc6a71166d27f8b65161a3580a6ffa98739d3716007b044beae834370da0518","pixelSha256":"b77761326d9ada02f6d01df50a5184d79ffa7abf5e912db44b152bf9726fcae3"},{"name":"splotch-2026-10-21_00-04-50.png","bytes":576337,"width":780,"height":1538,"sha256":"35728622596c98fd0a7074c93bc0b8116913c32e1f7dc1264f769dca37ca768b","pixelSha256":"b42e2562ade7dfe2f7ed317b87ea057826d83cd81bc9a872e695cc6ce1e53766"},{"name":"splotch-2026-10-21_00-04-55.png","bytes":579776,"width":780,"height":1538,"sha256":"e92c98013c1aa6a1d6132dcfedc67f574fb8132bfd6f18d4ab68030d3da3b1cf","pixelSha256":"44a0f71d3bf78ca77c7fb4b8a567d4244c9612ed420cdd4c7b5214fec9a85dfa"},{"name":"splotch-2026-10-21_00-04-59.png","bytes":583325,"width":780,"height":1538,"sha256":"964f12770343b93036bc67d4ba5177281fac2f841eea447cd520d24fc4c116f6","pixelSha256":"54846c1affd6149318428b24c7452d48dce2d8962563619050144a1701c7572a"},{"name":"splotch-2026-10-21_00-05-03.png","bytes":586688,"width":780,"height":1538,"sha256":"3a1503fb56b641e5cc8f6c979a4ca69d2814d0ef10da6ec20e250791453ad48a","pixelSha256":"b2847ddabb78fe60afcc8c0986cc7d922124333af7bb492cbaef44a6ec940b9d"},{"name":"splotch-2026-10-21_00-05-07.png","bytes":590076,"width":780,"height":1538,"sha256":"47209ffe1e25786dcc81ab3b6db34cae67e6e0595b1882444942bcb4ba1198ab","pixelSha256":"0cc25a3cc0eb79f8bad4c0304a093a6d9e624d77b268e0ba174957f0e8b2dec8"},{"name":"splotch-2026-10-21_00-05-12.png","bytes":593414,"width":780,"height":1538,"sha256":"cecfe512b64a1bdca90265f48a3df93fb8a3091e22658658caec8211321c6d89","pixelSha256":"38dc6bd13b5a2a6eaac289b43e352526d6ec4c593fcba61049d9964bc97cc10c"},{"name":"splotch-2026-10-21_00-05-16.png","bytes":597037,"width":780,"height":1538,"sha256":"cee658d1c4dada57e2b9326b6420fc6a162ceb02185f176b4d8ce9b99a06f84f","pixelSha256":"c5ed7880cd4d2abbe9ac02fbff4f60296ed6b1102f8c8b8ac48b7ad90c3c0347"},{"name":"splotch-2026-10-21_00-05-21.png","bytes":600258,"width":780,"height":1538,"sha256":"13b784286fa1a73057c472ddd56cd7a2a5aab34ed12ffda6b674f8b688fa4009","pixelSha256":"f9cf2b518597bfb8d8ae0958d7220d97e6b6317f06b96df92837cdb04ca587fa"},{"name":"splotch-2026-10-21_00-05-25.png","bytes":604025,"width":780,"height":1538,"sha256":"ec9da37913ffa81e462458b26f3c0e4ae2d252a93a6f0ae69bc834a88e43f667","pixelSha256":"ab9dc9e364a476ce9c35aa4d24f38e223da4eff8105047ece617681976f29d0c"},{"name":"splotch-2026-10-21_00-05-29.png","bytes":607421,"width":780,"height":1538,"sha256":"f679329ecfe427607429d34570793bcf0352f68290ba960cbb109bba17902725","pixelSha256":"520e8c97da640596b79abfe16096a84c754ed62a2877f3cfc9f5399b48e4f508"},{"name":"splotch-2026-10-21_00-05-34.png","bytes":611156,"width":780,"height":1538,"sha256":"b65b71c1b67a8dc0f72ae3dea085152a07ff514a4ffc9b978c0e922ae0d09f16","pixelSha256":"51b17ff037468066d4539c0cf1956f4e5a463d7d96a64cb5b86c4c36ca74a37c"},{"name":"splotch-2026-10-21_00-05-38.png","bytes":614418,"width":780,"height":1538,"sha256":"fa3388639b758e47a3feb1cbb34c0e8d2d25bc02f8bbccb913aa2bdfbc285831","pixelSha256":"8710d7b852f7bb8fe9b2ab89e4dd36fe898e5dcae5d245eae366caab384d684d"},{"name":"splotch-2026-10-21_00-05-42.png","bytes":617934,"width":780,"height":1538,"sha256":"2a8246337a8ecc8c9d82df24a708a5d5bf74655bd8af1fe85ada495b69c67876","pixelSha256":"5d533dcbb00fccdd3a756f21d8cb5e14d52abe8da6ab9d117db5167a2435c637"},{"name":"splotch-2026-10-21_00-05-46.png","bytes":621269,"width":780,"height":1538,"sha256":"cc863a75c5c0ba9689b27ef2fb060c16f0968dc5813fe5750e210f23076a1ed9","pixelSha256":"7d699ffe78f236dcd0a478f77e6ff1ac29a3e62d5d803950165fe828a6d2f5a1"},{"name":"splotch-2026-10-21_00-05-51.png","bytes":624855,"width":780,"height":1538,"sha256":"477fa5cbd8e09dc0696be7fafd6007d93e61636b22da12f4e5c4bfd1d57c563f","pixelSha256":"f6b0e435fb36d5c64471d8907b0253b93903b135eae43209e655a8f6125a5851"},{"name":"splotch-2026-10-21_00-05-55.png","bytes":628062,"width":780,"height":1538,"sha256":"eb492a39553ed6bac9b3aed25277d436b5134714f1a82affe889196762974b05","pixelSha256":"434e93e13946c05bd8d51ef63a9c1a17eb967c5fac639e20f5096fbbe76fc2be"},{"name":"splotch-2026-10-21_00-05-59.png","bytes":631387,"width":780,"height":1538,"sha256":"564cbd6f5540ede3a288d36caa7ae6f2aa61aee7b68c2c5fc1b381f2f064ef9b","pixelSha256":"b7d8fab2cf4f3476459b07ee066c7e2f11d3cb23b1c77b30a7e0fc89e8457ff2"}],"reloadStartsBlank":true,"limits":"Download
  object URLs checked directly; total storage estimates also include automatic book downloads. Heap
  collection and real quota exhaustion are not inferred."} Evidence:
  [screenshot](../evidence/firefox-phone-P02-W12-many-pictures-1792555560040.webp),
  [tree](../evidence/firefox-phone-P02-W12-many-pictures-1792555560040.aria.txt).

- 2026-10-21T04:24:30.917Z — phone D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/firefox-phone-D02-D05-brush-ink-undo-1792556701627.webp),
  [tree](../evidence/firefox-phone-D02-D05-brush-ink-undo-1792556701627.aria.txt).

- 2026-10-21T04:25:03.746Z — desktop D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/firefox-desktop-D02-D05-brush-ink-undo-1792556734598.webp),
  [tree](../evidence/firefox-desktop-D02-D05-brush-ink-undo-1792556734598.aria.txt).

- 2026-10-21T04:25:40.825Z — phone D04-D05-page-magic-eraser-theme: **PASS**.
  {"lightMagicChangedArt":true,"eraserRestoredOutline":true,"undoRestoredMagic":true,"darkArtChanged":true,"darkMagicPainted":true,"erased":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"restored":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"One
  path on Farm; fill registration and texture are judged from originals, not the envelope score."}
  Evidence:
  [screenshot](../evidence/firefox-phone-D04-D05-page-magic-eraser-theme-1792556763171.webp),
  [tree](../evidence/firefox-phone-D04-D05-page-magic-eraser-theme-1792556763171.aria.txt).

- 2026-10-21T04:26:08.133Z — phone X01-X03-W09-W10-cssZoom200: **PASS**. {"surrogate":"CSS zoom
  2","settingsEntered":true,"dismissal":"Escape","closeButtonBefore":{"x":417,"y":105.5999984741211,"width":96,"height":96.00000762939453},"drawAndUndo":true,"limits":"This
  completes the CSS surrogate using a keyboard dismissal. The Close pointer target remains outside
  the viewport; real browser-chrome zoom cannot be set by this remote Playwright browser connection
  and stays unproven. No actual browser zoom verdict."} Evidence:
  [screenshot](../evidence/firefox-phone-X01-X03-W09-W10-cssZoom200-1792556771868.webp),
  [tree](../evidence/firefox-phone-X01-X03-W09-W10-cssZoom200-1792556771868.aria.txt).
