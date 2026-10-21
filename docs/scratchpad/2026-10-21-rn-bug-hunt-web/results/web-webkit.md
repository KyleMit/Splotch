# webkit results

Candidate b236d639160459eecd60900926c759af5d4ae080. Browser 26.6. Remote engine admission confirmed;
phase complete. See summary.md and coverage-scope.md for final adjudication and remaining axes. PASS
applies only to stated assertions. BLOCKED includes harness failures pending triage.

* 2026-10-21T02:55:39.057Z — phone W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/webkit-phone-W06-mouse-contact-1792551346026.webp),
  [tree](../evidence/webkit-phone-W06-mouse-contact-1792551346026.aria.txt).

* 2026-10-21T02:55:47.927Z — tablet W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/webkit-tablet-W06-mouse-contact-1792551354849.webp),
  [tree](../evidence/webkit-tablet-W06-mouse-contact-1792551354849.aria.txt).

* 2026-10-21T02:55:56.695Z — desktop W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true},{"tool":"mouse","trusted":true}],"separate":3,"joined":1,"driverAdmitted":true}
  Evidence: [screenshot](../evidence/webkit-desktop-W06-mouse-contact-1792551363901.webp),
  [tree](../evidence/webkit-desktop-W06-mouse-contact-1792551363901.aria.txt).

* 2026-10-21T02:56:05.846Z — phone W06-trusted-touch-dots: **PASS**.
  {"events":[{"tool":"touch","trusted":true},{"tool":"touch","trusted":true},{"tool":"touch","trusted":true}],"undo":3,"limits":"Trusted
  touch taps only. Continuous touch/pen/multitouch in WebKit and Firefox remains unproven without a
  supported remote touch drag API."} Evidence:
  [screenshot](../evidence/webkit-phone-W06-trusted-touch-dots-1792551368926.webp),
  [tree](../evidence/webkit-phone-W06-trusted-touch-dots-1792551368926.aria.txt).

* 2026-10-21T02:56:10.652Z — tablet W06-trusted-touch-dots: **PASS**.
  {"events":[{"tool":"touch","trusted":true},{"tool":"touch","trusted":true},{"tool":"touch","trusted":true}],"undo":3,"limits":"Trusted
  touch taps only. Continuous touch/pen/multitouch in WebKit and Firefox remains unproven without a
  supported remote touch drag API."} Evidence:
  [screenshot](../evidence/webkit-tablet-W06-trusted-touch-dots-1792551373749.webp),
  [tree](../evidence/webkit-tablet-W06-trusted-touch-dots-1792551373749.aria.txt).

* 2026-10-21T02:56:15.618Z — desktop D07-idle-gap: **PASS**.
  {"connectingMidpointUnchanged":true,"limits":"Recheck of known fixed 3019; 1.5s idle intentionally
  crosses dropped-pointer cutoff."} Evidence:
  [screenshot](../evidence/webkit-desktop-D07-idle-gap-1792551378704.webp),
  [tree](../evidence/webkit-desktop-D07-idle-gap-1792551378704.aria.txt).

* 2026-10-21T02:56:21.591Z — phone D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/webkit-phone-D02-D05-brush-ink-undo-1792551411100.webp),
  [tree](../evidence/webkit-phone-D02-D05-brush-ink-undo-1792551411100.aria.txt).

* 2026-10-21T02:56:52.612Z — phone D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/webkit-phone-D08-palette-1792551429544.webp),
  [tree](../evidence/webkit-phone-D08-palette-1792551429544.aria.txt).

* 2026-10-21T02:57:10.949Z — phone D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/webkit-phone-D09-custom-color-1792551439559.webp),
  [tree](../evidence/webkit-phone-D09-custom-color-1792551439559.aria.txt).

* 2026-10-21T02:57:20.974Z — phone D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/webkit-phone-D10-widths-1792551451857.webp),
  [tree](../evidence/webkit-phone-D10-widths-1792551451857.aria.txt).

* 2026-10-21T02:57:33.266Z — phone D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/webkit-phone-D11-deep-history-1792551490235.webp),
  [tree](../evidence/webkit-phone-D11-deep-history-1792551490235.aria.txt).

* 2026-10-21T02:58:11.679Z — phone P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-58-13.png","format":"png","width":780,"height":1538,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/webkit-phone-P01-P02-download-1792551493348.webp),
  [tree](../evidence/webkit-phone-P01-P02-download-1792551493348.aria.txt).

* 2026-10-21T02:58:15.995Z — tablet D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/webkit-tablet-D02-D05-brush-ink-undo-1792551525523.webp),
  [tree](../evidence/webkit-tablet-D02-D05-brush-ink-undo-1792551525523.aria.txt).

* 2026-10-21T02:58:47.078Z — tablet D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/webkit-tablet-D08-palette-1792551544097.webp),
  [tree](../evidence/webkit-tablet-D08-palette-1792551544097.aria.txt).

* 2026-10-21T02:59:05.623Z — tablet D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/webkit-tablet-D09-custom-color-1792551554341.webp),
  [tree](../evidence/webkit-tablet-D09-custom-color-1792551554341.aria.txt).

* 2026-10-21T02:59:15.838Z — tablet D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-D10-widths-1792551567131.webp),
  [tree](../evidence/webkit-tablet-D10-widths-1792551567131.aria.txt).

* 2026-10-21T02:59:28.640Z — tablet D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/webkit-tablet-D11-deep-history-1792551605560.webp),
  [tree](../evidence/webkit-tablet-D11-deep-history-1792551605560.aria.txt).

* 2026-10-21T03:00:07.067Z — tablet P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_23-00-08.png","format":"png","width":1640,"height":2210,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/webkit-tablet-P01-P02-download-1792551608780.webp),
  [tree](../evidence/webkit-tablet-P01-P02-download-1792551608780.aria.txt).

* 2026-10-21T03:00:11.392Z — desktop D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/webkit-desktop-D02-D05-brush-ink-undo-1792551640726.webp),
  [tree](../evidence/webkit-desktop-D02-D05-brush-ink-undo-1792551640726.aria.txt).

* 2026-10-21T03:00:42.229Z — desktop D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/webkit-desktop-D08-palette-1792551659259.webp),
  [tree](../evidence/webkit-desktop-D08-palette-1792551659259.aria.txt).

* 2026-10-21T03:01:00.768Z — desktop D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator:
  locator('[data-testid=\"pointer-halos\"]')\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall
  log:\n - Expect \"toHaveCount\" locator('[data-testid=\"pointer-halos\"]') with timeout 5000ms\n -
  waiting for locator('[data-testid=\"pointer-halos\"]')\n 14 × locator resolved to 1 element\n -
  unexpected value \"1\"\n"} Evidence:
  [screenshot](../evidence/webkit-desktop-D09-custom-color-1792551668876.webp),
  [tree](../evidence/webkit-desktop-D09-custom-color-1792551668876.aria.txt).

* 2026-10-21T03:01:10.376Z — desktop D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-D10-widths-1792551683757.webp),
  [tree](../evidence/webkit-desktop-D10-widths-1792551683757.aria.txt).

* 2026-10-21T03:01:25.268Z — desktop D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/webkit-desktop-D11-deep-history-1792551722498.webp),
  [tree](../evidence/webkit-desktop-D11-deep-history-1792551722498.aria.txt).

* 2026-10-21T03:02:03.999Z — desktop P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_23-02-05.png","format":"png","width":2392,"height":1600,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/webkit-desktop-P01-P02-download-1792551725690.webp),
  [tree](../evidence/webkit-desktop-P01-P02-download-1792551725690.aria.txt).

* 2026-10-21T03:02:09.044Z — phone S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/webkit-phone-S01-section-entry-1792551758556.webp),
  [tree](../evidence/webkit-phone-S01-section-entry-1792551758556.aria.txt).

* 2026-10-21T03:02:40.363Z — phone S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/webkit-phone-S02-appearance-persist-1792551766392.webp),
  [tree](../evidence/webkit-phone-S02-appearance-persist-1792551766392.aria.txt).

* 2026-10-21T03:02:48.154Z — phone X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/webkit-phone-X04-W07-settings-focus-1792551769977.webp),
  [tree](../evidence/webkit-phone-X04-W07-settings-focus-1792551769977.aria.txt).

* 2026-10-21T03:02:51.684Z — phone X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/webkit-phone-X06-undo-shortcut-1792551779707.webp),
  [tree](../evidence/webkit-phone-X06-undo-shortcut-1792551779707.aria.txt).

* 2026-10-21T03:03:01.452Z — phone L02-viewport-rotation: **PASS**.
  {"original":{"width":390,"height":844},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/webkit-phone-L02-viewport-rotation-1792551786107.webp),
  [tree](../evidence/webkit-phone-L02-viewport-rotation-1792551786107.aria.txt).

* 2026-10-21T03:03:07.830Z — tablet S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/webkit-tablet-S01-section-entry-1792551818793.webp),
  [tree](../evidence/webkit-tablet-S01-section-entry-1792551818793.aria.txt).

* 2026-10-21T03:03:40.767Z — tablet S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/webkit-tablet-S02-appearance-persist-1792551827169.webp),
  [tree](../evidence/webkit-tablet-S02-appearance-persist-1792551827169.aria.txt).

* 2026-10-21T03:03:48.885Z — tablet X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"DIV","label":"Button
  Size","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Something's
  broken","inDialog":true},{"tag":"TEXTAREA","label":"What went
  wrong?","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"DIV","label":"Button
  Size","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Something's
  broken","inDialog":true},{"tag":"TEXTAREA","label":"What went
  wrong?","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/webkit-tablet-X04-W07-settings-focus-1792551830896.webp),
  [tree](../evidence/webkit-tablet-X04-W07-settings-focus-1792551830896.aria.txt).

* 2026-10-21T03:03:52.688Z — tablet X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/webkit-tablet-X06-undo-shortcut-1792551840850.webp),
  [tree](../evidence/webkit-tablet-X06-undo-shortcut-1792551840850.aria.txt).

* 2026-10-21T03:04:02.721Z — tablet L02-viewport-rotation: **PASS**.
  {"original":{"width":820,"height":1180},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/webkit-tablet-L02-viewport-rotation-1792551847533.webp),
  [tree](../evidence/webkit-tablet-L02-viewport-rotation-1792551847533.aria.txt).

* 2026-10-21T03:04:09.333Z — desktop S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/webkit-desktop-S01-section-entry-1792551881521.webp),
  [tree](../evidence/webkit-desktop-S01-section-entry-1792551881521.aria.txt).

* 2026-10-21T03:04:43.320Z — desktop S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/webkit-desktop-S02-appearance-persist-1792551889745.webp),
  [tree](../evidence/webkit-desktop-S02-appearance-persist-1792551889745.aria.txt).

* 2026-10-21T03:04:51.453Z — desktop X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"DIV","label":"Button
  Size","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Something's
  broken","inDialog":true},{"tag":"TEXTAREA","label":"What went
  wrong?","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"DIV","label":"Button
  Size","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Never","inDialog":true},{"tag":"BUTTON","label":"Something's
  broken","inDialog":true},{"tag":"TEXTAREA","label":"What went
  wrong?","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/webkit-desktop-X04-W07-settings-focus-1792551893198.webp),
  [tree](../evidence/webkit-desktop-X04-W07-settings-focus-1792551893198.aria.txt).

* 2026-10-21T03:04:54.982Z — desktop X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/webkit-desktop-X06-undo-shortcut-1792551902950.webp),
  [tree](../evidence/webkit-desktop-X06-undo-shortcut-1792551902950.aria.txt).

* 2026-10-21T03:05:04.726Z — desktop L02-viewport-rotation: **PASS**.
  {"original":{"width":1280,"height":800},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/webkit-desktop-L02-viewport-rotation-1792551909493.webp),
  [tree](../evidence/webkit-desktop-L02-viewport-rotation-1792551909493.aria.txt).

* 2026-10-21T03:05:11.270Z — narrow S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/webkit-narrow-S01-section-entry-1792551939783.webp),
  [tree](../evidence/webkit-narrow-S01-section-entry-1792551939783.aria.txt).

* 2026-10-21T03:05:41.481Z — narrow S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/webkit-narrow-S02-appearance-persist-1792551947513.webp),
  [tree](../evidence/webkit-narrow-S02-appearance-persist-1792551947513.aria.txt).

* 2026-10-21T03:05:49.193Z — narrow X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"About,
  Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/webkit-narrow-X04-W07-settings-focus-1792551950965.webp),
  [tree](../evidence/webkit-narrow-X04-W07-settings-focus-1792551950965.aria.txt).

* 2026-10-21T03:05:52.613Z — narrow X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/webkit-narrow-X06-undo-shortcut-1792551960582.webp),
  [tree](../evidence/webkit-narrow-X06-undo-shortcut-1792551960582.aria.txt).

* 2026-10-21T03:06:02.240Z — narrow L02-viewport-rotation: **PASS**.
  {"original":{"width":320,"height":740},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/webkit-narrow-L02-viewport-rotation-1792551966815.webp),
  [tree](../evidence/webkit-narrow-L02-viewport-rotation-1792551966815.aria.txt).

* 2026-10-21T03:06:09.095Z — phone S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/webkit-phone-S03-volume-sources-1792551975217.webp),
  [tree](../evidence/webkit-phone-S03-volume-sources-1792551975217.aria.txt).

* 2026-10-21T03:06:16.944Z — phone S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/webkit-phone-S04-drawer-brush-disable-1792551988924.webp),
  [tree](../evidence/webkit-phone-S04-drawer-brush-disable-1792551988924.aria.txt).

* 2026-10-21T03:06:30.610Z — phone S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/webkit-phone-S05-accessibility-endpoints-1792551998373.webp),
  [tree](../evidence/webkit-phone-S05-accessibility-endpoints-1792551998373.aria.txt).

* 2026-10-21T03:06:40.087Z — phone S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/webkit-phone-S06-coloring-toggle-1792552006242.webp),
  [tree](../evidence/webkit-phone-S06-coloring-toggle-1792552006242.aria.txt).

* 2026-10-21T03:06:47.936Z — phone S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/webkit-phone-S08-camera-autosave-1792552014113.webp),
  [tree](../evidence/webkit-phone-S08-camera-autosave-1792552014113.aria.txt).

* 2026-10-21T03:06:55.808Z — phone G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/webkit-phone-G01-G03-G04-parent-policy-keyboard-1792552041989.webp),
  [tree](../evidence/webkit-phone-G01-G03-G04-parent-policy-keyboard-1792552041989.aria.txt).

* 2026-10-21T03:07:23.750Z — tablet S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/webkit-tablet-S03-volume-sources-1792552050458.webp),
  [tree](../evidence/webkit-tablet-S03-volume-sources-1792552050458.aria.txt).

* 2026-10-21T03:07:32.340Z — tablet S04-drawer-brush-disable: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('dialog').first().locator('[aria-label=\"Eraser\"][aria-checked]')\u001b[22m\n"}
  Evidence: [screenshot](../evidence/webkit-tablet-S04-drawer-brush-disable-1792552065137.webp),
  [tree](../evidence/webkit-tablet-S04-drawer-brush-disable-1792552065137.aria.txt).

* 2026-10-21T03:07:46.821Z — tablet S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-S05-accessibility-endpoints-1792552074983.webp),
  [tree](../evidence/webkit-tablet-S05-accessibility-endpoints-1792552074983.aria.txt).

* 2026-10-21T03:07:56.844Z — tablet S06-coloring-toggle: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name:
  /^Coloring(,|$)/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-tablet-S06-coloring-toggle-1792552088434.webp),
  [tree](../evidence/webkit-tablet-S06-coloring-toggle-1792552088434.aria.txt).

* 2026-10-21T03:08:10.246Z — tablet S08-camera-autosave: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name:
  /^Saving(,|$)/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-tablet-S08-camera-autosave-1792552101863.webp),
  [tree](../evidence/webkit-tablet-S08-camera-autosave-1792552101863.aria.txt).

* 2026-10-21T03:08:23.667Z — tablet G01-G03-G04-parent-policy-keyboard: **BLOCKED**.
  {"error":"expect(locator).toBeChecked() failed\n\nLocator: getByRole('radiogroup', { name:
  'Opening Parent Center parental gate frequency', exact: true }).getByRole('radio', { name: 'Per
  session', exact: true })\nExpected: checked\nTimeout: 5000ms\nError: element(s) not found\n\nCall
  log:\n - Expect \"toBeChecked\" getByRole('radiogroup', { name: 'Opening Parent Center parental
  gate frequency', exact: true }).getByRole('radio', { name: 'Per session', exact: true }) with
  timeout 5000ms\n - waiting for getByRole('radiogroup', { name: 'Opening Parent Center parental
  gate frequency', exact: true }).getByRole('radio', { name: 'Per session', exact: true })\n"}
  Evidence:
  [screenshot](../evidence/webkit-tablet-G01-G03-G04-parent-policy-keyboard-1792552111718.webp),
  [tree](../evidence/webkit-tablet-G01-G03-G04-parent-policy-keyboard-1792552111718.aria.txt).

* 2026-10-21T03:08:33.626Z — desktop S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/webkit-desktop-S03-volume-sources-1792552119965.webp),
  [tree](../evidence/webkit-desktop-S03-volume-sources-1792552119965.aria.txt).

* 2026-10-21T03:08:41.681Z — desktop S04-drawer-brush-disable: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('dialog').first().locator('[aria-label=\"Eraser\"][aria-checked]')\u001b[22m\n"}
  Evidence: [screenshot](../evidence/webkit-desktop-S04-drawer-brush-disable-1792552134333.webp),
  [tree](../evidence/webkit-desktop-S04-drawer-brush-disable-1792552134333.aria.txt).

* 2026-10-21T03:08:56.262Z — desktop S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-S05-accessibility-endpoints-1792552144552.webp),
  [tree](../evidence/webkit-desktop-S05-accessibility-endpoints-1792552144552.aria.txt).

* 2026-10-21T03:09:06.365Z — desktop S06-coloring-toggle: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name:
  /^Coloring(,|$)/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-desktop-S06-coloring-toggle-1792552157953.webp),
  [tree](../evidence/webkit-desktop-S06-coloring-toggle-1792552157953.aria.txt).

* 2026-10-21T03:09:19.739Z — desktop S08-camera-autosave: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name:
  /^Saving(,|$)/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-desktop-S08-camera-autosave-1792552171386.webp),
  [tree](../evidence/webkit-desktop-S08-camera-autosave-1792552171386.aria.txt).

* 2026-10-21T03:09:33.162Z — desktop G01-G03-G04-parent-policy-keyboard: **BLOCKED**.
  {"error":"expect(locator).toBeChecked() failed\n\nLocator: getByRole('radiogroup', { name:
  'Opening Parent Center parental gate frequency', exact: true }).getByRole('radio', { name: 'Per
  session', exact: true })\nExpected: checked\nTimeout: 5000ms\nError: element(s) not found\n\nCall
  log:\n - Expect \"toBeChecked\" getByRole('radiogroup', { name: 'Opening Parent Center parental
  gate frequency', exact: true }).getByRole('radio', { name: 'Per session', exact: true }) with
  timeout 5000ms\n - waiting for getByRole('radiogroup', { name: 'Opening Parent Center parental
  gate frequency', exact: true }).getByRole('radio', { name: 'Per session', exact: true })\n"}
  Evidence:
  [screenshot](../evidence/webkit-desktop-G01-G03-G04-parent-policy-keyboard-1792552181252.webp),
  [tree](../evidence/webkit-desktop-G01-G03-G04-parent-policy-keyboard-1792552181252.aria.txt).

* 2026-10-21T03:09:43.677Z — phone C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":780,"height":1538},"coloringRequests":45,"badColoringResponses":[],"networkReceipt":"evidence/webkit-phone-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/webkit-phone-C01-P01-farm-composite-1792552197810.webp),
  [tree](../evidence/webkit-phone-C01-P01-farm-composite-1792552197810.aria.txt).

* 2026-10-21T03:09:59.542Z — phone D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"1a70ba050826ba660f17b4a877cd77a8b78616227b0e56c5785727f6460eaea0","restoredDigest":"1a70ba050826ba660f17b4a877cd77a8b78616227b0e56c5785727f6460eaea0","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/webkit-phone-D12-short-full-clear-drag-1792552211380.webp),
  [tree](../evidence/webkit-phone-D12-short-full-clear-drag-1792552211380.aria.txt).

* 2026-10-21T03:10:13.070Z — phone W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/webkit-phone-W05-eraser-hover-1792552215921.webp),
  [tree](../evidence/webkit-phone-W05-eraser-hover-1792552215921.aria.txt).

* 2026-10-21T03:10:17.600Z — phone W08-root-overflow: **PASS**.
  {"overflow":{"scroll":390,"width":390,"height":844},"picker":{"x":44,"y":167.5,"width":302,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/webkit-phone-W08-root-overflow-1792552219046.webp),
  [tree](../evidence/webkit-phone-W08-root-overflow-1792552219046.aria.txt).

* 2026-10-21T03:10:20.729Z — tablet C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":1640,"height":2210},"coloringRequests":47,"badColoringResponses":[],"networkReceipt":"evidence/webkit-tablet-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-C01-P01-farm-composite-1792552235433.webp),
  [tree](../evidence/webkit-tablet-C01-P01-farm-composite-1792552235433.aria.txt).

* 2026-10-21T03:10:37.354Z — tablet D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":492,"height":552,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"9509b480a69d6774422db3e542d7741db3ad7f7ffac09959355e1e3bd8a47dcb","restoredDigest":"9509b480a69d6774422db3e542d7741db3ad7f7ffac09959355e1e3bd8a47dcb","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-D12-short-full-clear-drag-1792552249150.webp),
  [tree](../evidence/webkit-tablet-D12-short-full-clear-drag-1792552249150.aria.txt).

* 2026-10-21T03:10:50.922Z — tablet W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/webkit-tablet-W05-eraser-hover-1792552253784.webp),
  [tree](../evidence/webkit-tablet-W05-eraser-hover-1792552253784.aria.txt).

* 2026-10-21T03:10:55.573Z — tablet W08-root-overflow: **PASS**.
  {"overflow":{"scroll":820,"width":820,"height":1180},"picker":{"x":109,"y":335.5,"width":602,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/webkit-tablet-W08-root-overflow-1792552257116.webp),
  [tree](../evidence/webkit-tablet-W08-root-overflow-1792552257116.aria.txt).

* 2026-10-21T03:10:58.944Z — desktop C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":2392,"height":1600},"coloringRequests":45,"badColoringResponses":[],"networkReceipt":"evidence/webkit-desktop-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-C01-P01-farm-composite-1792552273511.webp),
  [tree](../evidence/webkit-desktop-C01-P01-farm-composite-1792552273511.aria.txt).

* 2026-10-21T03:11:15.427Z — desktop D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":717,"height":400,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"b066c7328e0693a777304d8677bc382b179493ee29826ceebbd09ae20c74daf7","restoredDigest":"b066c7328e0693a777304d8677bc382b179493ee29826ceebbd09ae20c74daf7","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-D12-short-full-clear-drag-1792552287267.webp),
  [tree](../evidence/webkit-desktop-D12-short-full-clear-drag-1792552287267.aria.txt).

* 2026-10-21T03:11:29.028Z — desktop W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/webkit-desktop-W05-eraser-hover-1792552291939.webp),
  [tree](../evidence/webkit-desktop-W05-eraser-hover-1792552291939.aria.txt).

* 2026-10-21T03:11:33.724Z — desktop W08-root-overflow: **PASS**.
  {"overflow":{"scroll":1280,"width":1280,"height":800},"picker":{"x":339,"y":145.5,"width":602,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/webkit-desktop-W08-root-overflow-1792552295300.webp),
  [tree](../evidence/webkit-desktop-W08-root-overflow-1792552295300.aria.txt).

* 2026-10-21T03:11:37.201Z — narrow C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":192,"height":332,"changedPixels":216,"mean":0.0033048862115127174,"max":2,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":640,"height":1330},"coloringRequests":46,"badColoringResponses":[],"networkReceipt":"evidence/webkit-narrow-coloring-network.json","limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/webkit-narrow-C01-P01-farm-composite-1792552311051.webp),
  [tree](../evidence/webkit-narrow-C01-P01-farm-composite-1792552311051.aria.txt).

* 2026-10-21T03:11:52.767Z — narrow D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":192,"height":332,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"533cb865af7eb0a10bf1a7dac0f4a25be255ce82c8c2062e5532323e5f07071d","restoredDigest":"533cb865af7eb0a10bf1a7dac0f4a25be255ce82c8c2062e5532323e5f07071d","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/webkit-narrow-D12-short-full-clear-drag-1792552324174.webp),
  [tree](../evidence/webkit-narrow-D12-short-full-clear-drag-1792552324174.aria.txt).

* 2026-10-21T03:12:05.861Z — narrow W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/webkit-narrow-W05-eraser-hover-1792552328672.webp),
  [tree](../evidence/webkit-narrow-W05-eraser-hover-1792552328672.aria.txt).

* 2026-10-21T03:12:10.325Z — narrow W08-root-overflow: **PASS**.
  {"overflow":{"scroll":320,"width":320,"height":740},"picker":{"x":39,"y":115.5,"width":242,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/webkit-narrow-W08-root-overflow-1792552331752.webp),
  [tree](../evidence/webkit-narrow-W08-root-overflow-1792552331752.aria.txt).

* 2026-10-21T03:12:13.394Z — phone X01-X03-W09-W10-dark: **PASS**.
  {"mode":"dark","media":{"dark":true,"reduce":false,"forced":false,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-dark-1792552338495.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-dark-1792552338495.aria.txt).

* 2026-10-21T03:12:20.181Z — phone X01-X03-W09-W10-reduce: **PASS**.
  {"mode":"reduce","media":{"dark":false,"reduce":true,"forced":false,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-reduce-1792552345302.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-reduce-1792552345302.aria.txt).

* 2026-10-21T03:12:26.988Z — phone X01-X03-W09-W10-forced: **PASS**.
  {"mode":"forced","media":{"dark":false,"reduce":false,"forced":true,"font":"16px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-forced-1792552352116.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-forced-1792552352116.aria.txt).

* 2026-10-21T03:12:33.782Z — phone X01-X03-W09-W10-text200: **PASS**.
  {"mode":"text200","media":{"dark":false,"reduce":false,"forced":false,"font":"32px","zoom":"1"},"drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS
  zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains
  separate."} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-text200-1792552358885.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-text200-1792552358885.aria.txt).

* 2026-10-21T03:12:40.552Z — phone X01-X03-W09-W10-cssZoom200: **BLOCKED**. {"error":"locator.click:
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
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792552370457.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792552370457.aria.txt).

* 2026-10-21T03:12:52.393Z — phone A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792552383823.webp),
  [tree](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792552383823.aria.txt).

* 2026-10-21T03:13:05.374Z — tablet A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792552397177.webp),
  [tree](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792552397177.aria.txt).

* 2026-10-21T03:13:18.848Z — desktop A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792552410300.webp),
  [tree](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792552410300.aria.txt).

* 2026-10-21T03:13:31.993Z — phone A04-A05-serverError: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-serverError-1792552418418.webp),
  [tree](../evidence/webkit-phone-A04-A05-serverError-1792552418418.aria.txt).

* 2026-10-21T03:13:39.948Z — phone A04-A05-bare502: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-bare502-1792552426393.webp),
  [tree](../evidence/webkit-phone-A04-A05-bare502-1792552426393.aria.txt).

* 2026-10-21T03:13:47.943Z — phone A04-A05-malformedJson: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-malformedJson-1792552434384.webp),
  [tree](../evidence/webkit-phone-A04-A05-malformedJson-1792552434384.aria.txt).

* 2026-10-21T03:13:55.964Z — phone A04-A05-wrongType: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-wrongType-1792552442548.webp),
  [tree](../evidence/webkit-phone-A04-A05-wrongType-1792552442548.aria.txt).

* 2026-10-21T03:14:04.135Z — phone A04-A05-throttled: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-throttled-1792552450751.webp),
  [tree](../evidence/webkit-phone-A04-A05-throttled-1792552450751.aria.txt).

* 2026-10-21T03:14:12.364Z — phone A04-A05-refusal: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Report
  this refusal', exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not
  found\n\nCall log:\n - Expect \"toBeVisible\" getByRole('button', { name: 'Report this refusal',
  exact: true }) with timeout 15000ms\n - waiting for getByRole('button', { name: 'Report this
  refusal', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-refusal-1792552473910.webp),
  [tree](../evidence/webkit-phone-A04-A05-refusal-1792552473910.aria.txt).

* 2026-10-21T03:14:35.493Z — phone S07-dummy-key-persistence: **PASS**.
  {"dummyOnly":true,"verifiedThroughFixture":true,"masked":true,"noPlaintextLocalStorage":true,"reloadRetained":true,"forgetPersisted":true,"fieldShortcutDidNotUndoInk":true,"requests":[{"at":1792552479828,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792552480079,"method":"POST","host":"splotch.art","path":"/api/verify-key","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"application/json","bytes":53},"credential":[],"reply":200},{"at":1792552484129,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792552484946,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"No
  real key; encryption implementation covered by existing vault tests, not inferred from masking."}
  Evidence: [screenshot](../evidence/webkit-phone-S07-dummy-key-persistence-1792552487385.webp),
  [tree](../evidence/webkit-phone-S07-dummy-key-persistence-1792552487385.aria.txt).

* 2026-10-21T03:14:48.917Z — phone A06-ticket-poll-success: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  30000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A06-ticket-poll-success-1792552525300.webp),
  [tree](../evidence/webkit-phone-A06-ticket-poll-success-1792552525300.aria.txt).

* 2026-10-21T03:15:26.849Z — phone A07-offline-reconnect: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  15000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A07-offline-reconnect-1792552548308.webp),
  [tree](../evidence/webkit-phone-A07-offline-reconnect-1792552548308.aria.txt).

* 2026-10-21T03:15:49.852Z — phone W13-ai-idb-quota: **BLOCKED**.
  {"error":"expect(received).toBeGreaterThan(expected)\n\nExpected: > 0\nReceived: 0"} Evidence:
  [screenshot](../evidence/webkit-phone-W13-ai-idb-quota-1792552556291.webp),
  [tree](../evidence/webkit-phone-W13-ai-idb-quota-1792552556291.aria.txt).

* 2026-10-21T03:15:58.529Z — phone G02-wrong-answer-lockout: **PASS**.
  {"wrongAnswers":3,"problems":["What is 5 times 7?","What is 5 times 9?","What is 4 times
  6?"],"lockedMs":30278,"disabledDuringLockout":true,"recoveredAndSolved":true,"limits":"Real 30s
  base lockout; subsequent exponential lockouts not exercised."} Evidence:
  [screenshot](../evidence/webkit-phone-G02-wrong-answer-lockout-1792552602973.webp),
  [tree](../evidence/webkit-phone-G02-wrong-answer-lockout-1792552602973.aria.txt).

* 2026-10-21T03:16:45.162Z — phone W03-W14-offline-shell: **BLOCKED**. {"error":"page.reload: WebKit
  encountered an internal error\nCall log:\n\u001b[2m - waiting for navigation until
  \"load\"\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-phone-W03-W14-offline-shell-1792552610239.webp),
  [tree](../evidence/webkit-phone-W03-W14-offline-shell-1792552610239.aria.txt).

* 2026-10-21T03:16:51.938Z — tablet W03-W14-offline-shell: **BLOCKED**. {"error":"page.reload:
  WebKit encountered an internal error\nCall log:\n\u001b[2m - waiting for navigation until
  \"load\"\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-tablet-W03-W14-offline-shell-1792552615491.webp),
  [tree](../evidence/webkit-tablet-W03-W14-offline-shell-1792552615491.aria.txt).

* 2026-10-21T03:16:57.278Z — desktop W03-W14-offline-shell: **BLOCKED**. {"error":"page.reload:
  WebKit encountered an internal error\nCall log:\n\u001b[2m - waiting for navigation until
  \"load\"\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-desktop-W03-W14-offline-shell-1792552620860.webp),
  [tree](../evidence/webkit-desktop-W03-W14-offline-shell-1792552620860.aria.txt).

* 2026-10-21T03:17:02.682Z — phone W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/webkit-phone-W01-W02-install-event-1792552627254.webp),
  [tree](../evidence/webkit-phone-W01-W02-install-event-1792552627254.aria.txt).

* 2026-10-21T03:17:09.010Z — desktop W01-W02-install-event: **PASS**. {"tree":"- button
  \"Purple\"\n- button \"Blue\"\n- button \"Teal\"\n- button \"Green\"\n- button \"Yellow\"\n-
  button \"Orange\"\n- button \"Red\"\n- button \"Pink\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/webkit-desktop-W01-W02-install-event-1792552633782.webp),
  [tree](../evidence/webkit-desktop-W01-W02-install-event-1792552633782.aria.txt).

* 2026-10-21T03:17:15.612Z — narrow W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n-
  img\n- strong: Add Splotch to your home screen\n- text: Opens full-screen, just like a real app\n-
  button \"Install\":\n - img\n - text: Install\n- button \"Not now\":\n - img\n - img\n- button
  \"Settings\":\n - img\n- button \"Expand controls\":\n - img\n- status\n- status\n- button \"Clear
  drawing\":\n - img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named
  beforeinstallprompt fixture, not OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/webkit-narrow-W01-W02-install-event-1792552640219.webp),
  [tree](../evidence/webkit-narrow-W01-W02-install-event-1792552640219.aria.txt).

* 2026-10-21T03:17:21.858Z — desktop W11-two-tab-settings: **PASS**.
  {"newTabReadFlat":true,"firstTabReloadReadDark":true,"flatPreserved":true,"limits":"Sequential
  writes and reloads; no live synchronization guarantee inferred."} Evidence:
  [screenshot](../evidence/webkit-desktop-W11-two-tab-settings-1792552651121.webp),
  [tree](../evidence/webkit-desktop-W11-two-tab-settings-1792552651121.aria.txt).

* 2026-10-21T03:17:33.119Z — phone C02-C03-C04-S06-library: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: true\nReceived:
  false\n\nCall Log:\n- Timeout 60000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-phone-C02-C03-C04-S06-library-1792552719036.webp),
  [tree](../evidence/webkit-phone-C02-C03-C04-S06-library-1792552719036.aria.txt).

* 2026-10-21T03:20:54.620Z — phone P02-W12-many-pictures: **PASS**.
  {"count":25,"distinctPictures":25,"urls":{"createdPNG":25,"downloadLinks":25,"retainedDownloadUrls":0,"retainedByType":{"image/webp":110}},"estimateBefore":{"quota":1048576000,"usage":16},"estimateAfter":{"quota":1048576000,"usage":16659569},"images":[{"name":"splotch-2026-10-20_23-20-55.png","bytes":708054,"width":780,"height":1538,"sha256":"da9218b38ec310f60860e4e59014e097bdeefde64efb7f0349a9320f65aef0c6"},{"name":"splotch-2026-10-20_23-21-00.png","bytes":711870,"width":780,"height":1538,"sha256":"32850d16ff157bab24088ac6d9af230036ff488f27cbe3a6999868459dcb86b1"},{"name":"splotch-2026-10-20_23-21-04.png","bytes":716660,"width":780,"height":1538,"sha256":"a09eaf2a67544da449bcc368a8a27241d31c23d01b5ed7e9809ca4d932bc7269"},{"name":"splotch-2026-10-20_23-21-09.png","bytes":720580,"width":780,"height":1538,"sha256":"b1304723d8e8ee0d8f7817c5c8a79430d300ad47abcf30c49abe9ff8e0ec631e"},{"name":"splotch-2026-10-20_23-21-13.png","bytes":725216,"width":780,"height":1538,"sha256":"545487a1430d0b596ddfb4555a0591bf42cd3516eff6eaec130a18facd8a835b"},{"name":"splotch-2026-10-20_23-21-18.png","bytes":729419,"width":780,"height":1538,"sha256":"d569070afe8a249fc221773415e6bf20b718c415c28f4418f9bcd2b3c4d72fc2"},{"name":"splotch-2026-10-20_23-21-22.png","bytes":733712,"width":780,"height":1538,"sha256":"dc0b1630ce988e440c95a32a485c458a7c845c01e7c6335fc30c98fdf72a7c75"},{"name":"splotch-2026-10-20_23-21-26.png","bytes":737554,"width":780,"height":1538,"sha256":"7f3b35e07b62681f6bf76d03960ef21141f6ffbd39c7d28f90a1391f268508c9"},{"name":"splotch-2026-10-20_23-21-31.png","bytes":742189,"width":780,"height":1538,"sha256":"e9c37461b17802b5c8e3362ab0961daf739787446b6195a4bd81ee62617a7f5f"},{"name":"splotch-2026-10-20_23-21-35.png","bytes":746912,"width":780,"height":1538,"sha256":"8d982ff04ae2725db1596b4eb22dcd20278068717c042367df6f98cfb4f008a2"},{"name":"splotch-2026-10-20_23-21-40.png","bytes":751106,"width":780,"height":1538,"sha256":"68646bf64e8292a53ff436288c53accfbdc69a600c38b1b18482f1166e0a0290"},{"name":"splotch-2026-10-20_23-21-44.png","bytes":755500,"width":780,"height":1538,"sha256":"d187d9b9cbfbb2c526708167f0feee5036db18c24b0810eaa5f2ca1f974f5516"},{"name":"splotch-2026-10-20_23-21-49.png","bytes":759144,"width":780,"height":1538,"sha256":"ab36471a88a7c8f84a94fbb97f7d165ac01c42496dfb6253c102acfaeb85b3e5"},{"name":"splotch-2026-10-20_23-21-53.png","bytes":763174,"width":780,"height":1538,"sha256":"f10e766cb0aeb37f5b67140ed25a199f0a2dc01a893a8cf67ac13fceb4f76823"},{"name":"splotch-2026-10-20_23-21-57.png","bytes":767857,"width":780,"height":1538,"sha256":"251807ceb4ddc7d06b693041586d1467f13d15756413c7a0d0126b2442ac56b0"},{"name":"splotch-2026-10-20_23-22-02.png","bytes":772565,"width":780,"height":1538,"sha256":"a20c19837babb022914a69e42c51bc8ddece313ace7f01b3ddf7787715c4aef2"},{"name":"splotch-2026-10-20_23-22-06.png","bytes":776542,"width":780,"height":1538,"sha256":"226b0fb33473c46f519ce718e8fcb94d662dbacd1e515d6c5053a88136460d05"},{"name":"splotch-2026-10-20_23-22-11.png","bytes":779866,"width":780,"height":1538,"sha256":"88caff176b78de198e54d8798a861b485d6bc449a5d6ca07bb0b2a00fc4264b6"},{"name":"splotch-2026-10-20_23-22-15.png","bytes":784945,"width":780,"height":1538,"sha256":"a9dfc3ff47c179c9f0b16852ca75bb58dc4ab7fee6255ce2cbe0711516b9fad2"},{"name":"splotch-2026-10-20_23-22-20.png","bytes":789557,"width":780,"height":1538,"sha256":"22f2c482b486cf27eddee36dc993214113c14da3eef5d05dbccf5047add72a2d"},{"name":"splotch-2026-10-20_23-22-24.png","bytes":792949,"width":780,"height":1538,"sha256":"02470439a3c7888adbfd20793262bb03e08b896f69b0a7b95b7f2a94841cc0e0"},{"name":"splotch-2026-10-20_23-22-28.png","bytes":797635,"width":780,"height":1538,"sha256":"38e1c85d4cf0d14cad1df9970072711bf4250d975de36ce5f5f25d7f3d2852c5"},{"name":"splotch-2026-10-20_23-22-33.png","bytes":802687,"width":780,"height":1538,"sha256":"69799a77c28b922c79d1b97b5d58800db28c8bcf2e021b4ac7330813a339f785"},{"name":"splotch-2026-10-20_23-22-37.png","bytes":805893,"width":780,"height":1538,"sha256":"ac04599800a961308c928a5d4701cac5dfa0f04ad0cf98ecad5235dd4e7a5874"},{"name":"splotch-2026-10-20_23-22-42.png","bytes":810258,"width":780,"height":1538,"sha256":"9049c47940df50f5f741c99976f8350f7880726525184d09c2124919b93b80bc"}],"reloadStartsBlank":true,"limits":"Download
  object URLs checked directly; total storage estimates also include automatic book downloads. Heap
  collection and real quota exhaustion are not inferred."} Evidence:
  [screenshot](../evidence/webkit-phone-P02-W12-many-pictures-1792552962780.webp),
  [tree](../evidence/webkit-phone-P02-W12-many-pictures-1792552962780.aria.txt).

* 2026-10-21T03:22:57.023Z — phone A01-WebKit-preupload-diagnostic-1: **PASS**.
  {"attempt":1,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":780,"height":1538}],"requests":[{"at":1792552975568,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button
  \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button \"Stroke width\":\n - img\n- button
  \"Coloring books\":\n - img\n- button \"Save screenshot\":\n - img\n- button \"Create AI image, 10
  free left\":\n - img\n- button \"Undo\":\n - img\n- img\n- button \"Collapse controls\"
  [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n- button \"Clear drawing\":\n -
  img\n- dialog \"AI Result\":\n - status: That didn't work\n - button \"Close\":\n - img\n -
  img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's give it one more go.\n -
  button \"Try again\":\n - img\n - text: Try again\n - button \"Report a problem\":\n - img\n -
  text: Report a problem"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-1-1792552978839.webp),
  [tree](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-1-1792552978839.aria.txt).

* 2026-10-21T03:23:05.098Z — phone A01-WebKit-preupload-diagnostic-2: **PASS**.
  {"attempt":2,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":780,"height":1538}],"requests":[{"at":1792552983629,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button
  \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button \"Stroke width\":\n - img\n- button
  \"Coloring books\":\n - img\n- button \"Save screenshot\":\n - img\n- button \"Create AI image, 10
  free left\":\n - img\n- button \"Undo\":\n - img\n- img\n- button \"Collapse controls\"
  [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n- button \"Clear drawing\":\n -
  img\n- dialog \"AI Result\":\n - status: That didn't work\n - button \"Close\":\n - img\n -
  img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's give it one more go.\n -
  button \"Try again\":\n - img\n - text: Try again\n - button \"Report a problem\":\n - img\n -
  text: Report a problem"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-2-1792552986942.webp),
  [tree](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-2-1792552986942.aria.txt).

* 2026-10-21T03:23:34.695Z — phone A01-WebKit-preupload-diagnostic-1: **PASS**.
  {"attempt":1,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"canvas-png","base64":37420},{"operation":"canvas-png","base64":37420},{"operation":"decode","ok":true,"width":780,"height":1538},{"operation":"canvas-png","base64":43420}],"requests":[{"at":1792553013195,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button
  \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button \"Stroke width\":\n - img\n- button
  \"Coloring books\":\n - img\n- button \"Save screenshot\":\n - img\n- button \"Create AI image, 10
  free left\":\n - img\n- button \"Undo\":\n - img\n- img\n- button \"Collapse controls\"
  [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n- button \"Clear drawing\":\n -
  img\n- dialog \"AI Result\":\n - status: That didn't work\n - button \"Close\":\n - img\n -
  img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's give it one more go.\n -
  button \"Try again\":\n - img\n - text: Try again\n - button \"Report a problem\":\n - img\n -
  text: Report a problem"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-1-1792553016658.webp),
  [tree](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-1-1792553016658.aria.txt).

* 2026-10-21T03:23:42.858Z — phone A01-WebKit-preupload-diagnostic-2: **PASS**.
  {"attempt":2,"diagnostics":[{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"decode","ok":true,"width":556,"height":426},{"operation":"put","database":"splotch-beta-ai-vault-v1"},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"decode","ok":true,"width":448,"height":448},{"operation":"canvas-png","base64":37420},{"operation":"canvas-png","base64":37420},{"operation":"decode","ok":true,"width":780,"height":1538},{"operation":"canvas-png","base64":43420}],"requests":[{"at":1792553021401,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200}],"tree":"-
  button \"Purple\"\n- button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button
  \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n- img\n- button
  \"Settings\":\n - img\n- button \"Brushes\":\n - img\n- button \"Stroke width\":\n - img\n- button
  \"Coloring books\":\n - img\n- button \"Save screenshot\":\n - img\n- button \"Create AI image, 10
  free left\":\n - img\n- button \"Undo\":\n - img\n- img\n- button \"Collapse controls\"
  [expanded]:\n - img\n- status: AI Art choice saved.\n- status\n- button \"Clear drawing\":\n -
  img\n- dialog \"AI Result\":\n - status: That didn't work\n - button \"Close\":\n - img\n -
  img\n - heading \"Hmm, that didn't work\" [level=2]\n - paragraph: Let's give it one more go.\n -
  button \"Try again\":\n - img\n - text: Try again\n - button \"Report a problem\":\n - img\n -
  text: Report a problem"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-2-1792553024726.webp),
  [tree](../evidence/webkit-phone-A01-WebKit-preupload-diagnostic-2-1792553024726.aria.txt).

* 2026-10-21T03:23:53.695Z — phone C02-C03-C04-S06-library: **PASS**.
  {"heldDownloadDidNotBlockInk":true,"installed":"Coloring\nColoring book\n\nShow coloring pages and
  download new books automatically\n\nDownload over mobile data\n\nAllows automatic picture
  downloads when Wi-Fi isn't available\n\nDownloaded pictures\n\n7 of 7 extra books · 16.8
  MB\n\nEvery coloring book is ready offline\n\nRemove downloaded
  pictures","extraBookDrewOffline":true,"removed":"Coloring\nColoring book\n\nShow coloring pages
  and download new books automatically\n\nDownload over mobile data\n\nAllows automatic picture
  downloads when Wi-Fi isn't available\n\nDownloaded pictures\n\n0 of 7 extra books · 0.0
  MB\n\nRemove downloaded pictures","starterSurvivedRemovalOffline":true,"limits":"Named held asset
  fixture; Save-Data policy and cancel-in-flight removal remain separate."} Evidence:
  [screenshot](../evidence/webkit-phone-C02-C03-C04-S06-library-1792553170670.webp),
  [tree](../evidence/webkit-phone-C02-C03-C04-S06-library-1792553170670.aria.txt).

* 2026-10-21T03:26:12.974Z — phone D04-D05-page-magic-eraser-theme: **PASS**.
  {"lightMagicChangedArt":true,"eraserRestoredOutline":true,"undoRestoredMagic":true,"darkArtChanged":true,"darkMagicPainted":true,"erased":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"restored":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"One
  path on Farm; fill registration and texture are judged from originals, not the envelope score."}
  Evidence:
  [screenshot](../evidence/webkit-phone-D04-D05-page-magic-eraser-theme-1792553193844.webp),
  [tree](../evidence/webkit-phone-D04-D05-page-magic-eraser-theme-1792553193844.aria.txt).

* 2026-10-21T03:26:36.454Z — desktop W04-W14-update-revision-fixture: **BLOCKED**.
  {"error":"page.reload: WebKit encountered an internal error\nCall log:\n\u001b[2m - waiting for
  navigation until \"load\"\u001b[22m\n"} Evidence:
  [screenshot](../evidence/webkit-desktop-W04-W14-update-revision-fixture-1792553207152.webp),
  [tree](../evidence/webkit-desktop-W04-W14-update-revision-fixture-1792553207152.aria.txt).

* 2026-10-21T03:26:49.571Z — phone L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/webkit-phone-L03-browser-back-1792553214696.webp),
  [tree](../evidence/webkit-phone-L03-browser-back-1792553214696.aria.txt).

* 2026-10-21T03:26:56.287Z — tablet L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/webkit-tablet-L03-browser-back-1792553221518.webp),
  [tree](../evidence/webkit-tablet-L03-browser-back-1792553221518.aria.txt).

* 2026-10-21T03:27:03.135Z — desktop L03-browser-back: **PASS**.
  {"coarse":false,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":false,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/webkit-desktop-L03-browser-back-1792553227668.webp),
  [tree](../evidence/webkit-desktop-L03-browser-back-1792553227668.aria.txt).

* 2026-10-21T03:29:26.540Z — phone W03-W14-offline-host-loss: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: true\nReceived:
  false\n\nCall Log:\n- Timeout 45000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-phone-W03-W14-offline-host-loss-1792553411768.webp),
  [tree](../evidence/webkit-phone-W03-W14-offline-host-loss-1792553411768.aria.txt).

* 2026-10-21T03:30:13.502Z — tablet W03-W14-offline-host-loss: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: true\nReceived:
  false\n\nCall Log:\n- Timeout 45000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-tablet-W03-W14-offline-host-loss-1792553459704.webp),
  [tree](../evidence/webkit-tablet-W03-W14-offline-host-loss-1792553459704.aria.txt).

* 2026-10-21T03:31:28.131Z — phone W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/webkit-phone-W03-W14-offline-host-loss-1792553500541.webp),
  [tree](../evidence/webkit-phone-W03-W14-offline-host-loss-1792553500541.aria.txt).

* 2026-10-21T03:31:42.333Z — tablet W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/webkit-tablet-W03-W14-offline-host-loss-1792553515815.webp),
  [tree](../evidence/webkit-tablet-W03-W14-offline-host-loss-1792553515815.aria.txt).

* 2026-10-21T03:31:57.750Z — desktop W03-W14-offline-host-loss: **PASS**.
  {"before":{"secure":true,"controller":"http://127.0.0.1:6153/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6153/"]},"serverStopped":true,"reloadWorked":true,"drawAndUndoWorked":true,"lazySoundOpened":true,"cachedFarmSelected":true,"limits":"Simulate
  a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS
  airplane mode is not claimed."} Evidence:
  [screenshot](../evidence/webkit-desktop-W03-W14-offline-host-loss-1792553531709.webp),
  [tree](../evidence/webkit-desktop-W03-W14-offline-host-loss-1792553531709.aria.txt).

* 2026-10-21T03:32:24.356Z — desktop W04-W14-update-revision-fixture: **PASS**.
  {"waitingBeforeHide":"installed","inkPreventedReload":true,"blankHiddenReloaded":true,"navigations":["http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/"],"offlineAfterUpdateDrew":true,"offlineFixture":"Stop
  this case’s local proxy after the new worker takes control.","limits":"Changed-worker and version
  fixture uses the same qualified app artifact, not a second release. Hidden state is a named
  headless fixture."} Evidence:
  [screenshot](../evidence/webkit-desktop-W04-W14-update-revision-fixture-1792553556043.webp),
  [tree](../evidence/webkit-desktop-W04-W14-update-revision-fixture-1792553556043.aria.txt).

* 2026-10-21T03:32:52.650Z — tablet S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/webkit-tablet-S04-drawer-brush-disable-1792553585119.webp),
  [tree](../evidence/webkit-tablet-S04-drawer-brush-disable-1792553585119.aria.txt).

* 2026-10-21T03:33:07.243Z — tablet S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-S06-coloring-toggle-1792553594111.webp),
  [tree](../evidence/webkit-tablet-S06-coloring-toggle-1792553594111.aria.txt).

* 2026-10-21T03:33:15.996Z — tablet S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/webkit-tablet-S08-camera-autosave-1792553602450.webp),
  [tree](../evidence/webkit-tablet-S08-camera-autosave-1792553602450.aria.txt).

* 2026-10-21T03:33:24.251Z — tablet G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/webkit-tablet-G01-G03-G04-parent-policy-keyboard-1792553637552.webp),
  [tree](../evidence/webkit-tablet-G01-G03-G04-parent-policy-keyboard-1792553637552.aria.txt).

* 2026-10-21T03:33:59.710Z — desktop S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/webkit-desktop-S04-drawer-brush-disable-1792553652627.webp),
  [tree](../evidence/webkit-desktop-S04-drawer-brush-disable-1792553652627.aria.txt).

* 2026-10-21T03:34:14.706Z — desktop S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-S06-coloring-toggle-1792553661492.webp),
  [tree](../evidence/webkit-desktop-S06-coloring-toggle-1792553661492.aria.txt).

* 2026-10-21T03:34:23.289Z — desktop S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/webkit-desktop-S08-camera-autosave-1792553669874.webp),
  [tree](../evidence/webkit-desktop-S08-camera-autosave-1792553669874.aria.txt).

* 2026-10-21T03:34:31.698Z — desktop G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/webkit-desktop-G01-G03-G04-parent-policy-keyboard-1792553702694.webp),
  [tree](../evidence/webkit-desktop-G01-G03-G04-parent-policy-keyboard-1792553702694.aria.txt).

* 2026-10-21T03:35:13.941Z — desktop D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/webkit-desktop-D09-custom-color-1792553723575.webp),
  [tree](../evidence/webkit-desktop-D09-custom-color-1792553723575.aria.txt).

- 2026-10-21T04:24:14.534Z — phone X01-X03-W09-W10-cssZoom200: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792556663542.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792556663542.aria.txt).

- 2026-10-21T04:26:31.086Z — phone X01-X03-W09-W10-cssZoom200: **PASS**. {"surrogate":"CSS zoom
  2","settingsEntered":true,"dismissal":"Escape","closeButtonBefore":{"x":417,"y":105.625,"width":96,"height":96},"drawAndUndo":true,"limits":"This
  completes the CSS surrogate using a keyboard dismissal. The Close pointer target remains outside
  the viewport; real browser-chrome zoom cannot be set by this remote Playwright browser connection
  and stays unproven. No actual browser zoom verdict."} Evidence:
  [screenshot](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792556794623.webp),
  [tree](../evidence/webkit-phone-X01-X03-W09-W10-cssZoom200-1792556794623.aria.txt).

- 2026-10-21T08:07:39.884Z — phone A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792570071431.webp),
  [tree](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792570071431.aria.txt).

- 2026-10-21T08:07:52.980Z — tablet A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792570084738.webp),
  [tree](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792570084738.aria.txt).

- 2026-10-21T08:08:06.441Z — desktop A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792570098001.webp),
  [tree](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792570098001.aria.txt).

- 2026-10-21T08:08:19.647Z — phone A04-A05-serverError: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-serverError-1792570106116.webp),
  [tree](../evidence/webkit-phone-A04-A05-serverError-1792570106116.aria.txt).

- 2026-10-21T08:08:27.637Z — phone A04-A05-bare502: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-bare502-1792570114147.webp),
  [tree](../evidence/webkit-phone-A04-A05-bare502-1792570114147.aria.txt).

- 2026-10-21T08:08:35.704Z — phone A04-A05-malformedJson: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-malformedJson-1792570122214.webp),
  [tree](../evidence/webkit-phone-A04-A05-malformedJson-1792570122214.aria.txt).

- 2026-10-21T08:08:43.762Z — phone A04-A05-wrongType: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-wrongType-1792570130328.webp),
  [tree](../evidence/webkit-phone-A04-A05-wrongType-1792570130328.aria.txt).

- 2026-10-21T08:08:51.880Z — phone A04-A05-throttled: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived: 0"}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-throttled-1792570138365.webp),
  [tree](../evidence/webkit-phone-A04-A05-throttled-1792570138365.aria.txt).

- 2026-10-21T08:08:59.931Z — phone A04-A05-refusal: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Report
  this refusal', exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not
  found\n\nCall log:\n - Expect \"toBeVisible\" getByRole('button', { name: 'Report this refusal',
  exact: true }) with timeout 15000ms\n - waiting for getByRole('button', { name: 'Report this
  refusal', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-refusal-1792570161443.webp),
  [tree](../evidence/webkit-phone-A04-A05-refusal-1792570161443.aria.txt).

- 2026-10-21T08:09:23.012Z — phone S07-dummy-key-persistence: **PASS**.
  {"dummyOnly":true,"verifiedThroughFixture":true,"masked":true,"noPlaintextLocalStorage":true,"reloadRetained":true,"forgetPersisted":true,"fieldShortcutDidNotUndoInk":true,"requests":[{"at":1792570167335,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570167590,"method":"POST","host":"127.0.0.1:6150","path":"/api/verify-key","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"application/json","bytes":53},"credential":[],"reply":200},{"at":1792570171691,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570172514,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"No
  real key; encryption implementation covered by existing vault tests, not inferred from masking."}
  Evidence: [screenshot](../evidence/webkit-phone-S07-dummy-key-persistence-1792570174987.webp),
  [tree](../evidence/webkit-phone-S07-dummy-key-persistence-1792570174987.aria.txt).

- 2026-10-21T08:09:36.536Z — phone A06-ticket-poll-success: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  30000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A06-ticket-poll-success-1792570213024.webp),
  [tree](../evidence/webkit-phone-A06-ticket-poll-success-1792570213024.aria.txt).

- 2026-10-21T08:10:14.594Z — phone A07-offline-reconnect: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  15000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/webkit-phone-A07-offline-reconnect-1792570236059.webp),
  [tree](../evidence/webkit-phone-A07-offline-reconnect-1792570236059.aria.txt).

- 2026-10-21T08:10:37.618Z — phone W13-ai-idb-quota: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('heading', { name: 'Out of
  space', exact: true })\nExpected: visible\nTimeout: 5000ms\nError: element(s) not found\n\nCall
  log:\n - Expect \"toBeVisible\" getByRole('heading', { name: 'Out of space', exact: true }) with
  timeout 5000ms\n - waiting for getByRole('heading', { name: 'Out of space', exact: true })\n"}
  Evidence: [screenshot](../evidence/webkit-phone-W13-ai-idb-quota-1792570249106.webp),
  [tree](../evidence/webkit-phone-W13-ai-idb-quota-1792570249106.aria.txt).

- 2026-10-21T08:11:17.290Z — phone A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792570280638,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570283954,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200},{"at":1792570290634,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":0},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":774,"inputLength":32563,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792570290738.webp),
  [tree](../evidence/webkit-phone-A01-A03-A08-fixture-success-1792570290738.aria.txt).

- 2026-10-21T08:11:32.346Z — tablet A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792570295886,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570299634,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200},{"at":1792570306136,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":0},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":757,"inputLength":80575,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792570306242.webp),
  [tree](../evidence/webkit-tablet-A01-A03-A08-fixture-success-1792570306242.aria.txt).

- 2026-10-21T08:11:47.835Z — desktop A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792570311191,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570315016,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200},{"at":1792570321623,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":0},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":771,"inputLength":82397,"resultLength":88588,"phase":"result"}]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792570321727.webp),
  [tree](../evidence/webkit-desktop-A01-A03-A08-fixture-success-1792570321727.aria.txt).

- 2026-10-21T08:12:03.234Z — phone A04-A05-serverError: **PASS**.
  {"requests":[{"at":1792570326506,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570329872,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":500},{"at":1792570330483,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-serverError-1792570331585.webp),
  [tree](../evidence/webkit-phone-A04-A05-serverError-1792570331585.aria.txt).

- 2026-10-21T08:12:13.203Z — phone A04-A05-bare502: **PASS**.
  {"requests":[{"at":1792570336482,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570339802,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":502},{"at":1792570340364,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-bare502-1792570341508.webp),
  [tree](../evidence/webkit-phone-A04-A05-bare502-1792570341508.aria.txt).

- 2026-10-21T08:12:23.154Z — phone A04-A05-malformedJson: **PASS**.
  {"requests":[{"at":1792570346432,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570349723,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200},{"at":1792570350312,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-malformedJson-1792570351436.webp),
  [tree](../evidence/webkit-phone-A04-A05-malformedJson-1792570351436.aria.txt).

- 2026-10-21T08:12:33.053Z — phone A04-A05-wrongType: **PASS**.
  {"requests":[{"at":1792570356271,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570359595,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200},{"at":1792570360194,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-wrongType-1792570361336.webp),
  [tree](../evidence/webkit-phone-A04-A05-wrongType-1792570361336.aria.txt).

- 2026-10-21T08:12:42.940Z — phone A04-A05-throttled: **PASS**.
  {"requests":[{"at":1792570366163,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570369462,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":429},{"at":1792570370061,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"429
  behavior recorded; whether immediate retry is intentional requires source/shipping comparison."}
  Evidence: [screenshot](../evidence/webkit-phone-A04-A05-throttled-1792570371191.webp),
  [tree](../evidence/webkit-phone-A04-A05-throttled-1792570371191.aria.txt).

- 2026-10-21T08:12:52.814Z — phone A04-A05-refusal: **PASS**.
  {"requests":[{"at":1792570376099,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570379381,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":422}],"recovered":false,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/webkit-phone-A04-A05-refusal-1792570380374.webp),
  [tree](../evidence/webkit-phone-A04-A05-refusal-1792570380374.aria.txt).

- 2026-10-21T08:13:01.923Z — phone S07-dummy-key-persistence: **PASS**.
  {"dummyOnly":true,"verifiedThroughFixture":true,"masked":true,"noPlaintextLocalStorage":true,"reloadRetained":true,"forgetPersisted":true,"fieldShortcutDidNotUndoInk":true,"requests":[{"at":1792570386386,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570386646,"method":"POST","host":"127.0.0.1:6150","path":"/api/verify-key","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"application/json","bytes":53},"credential":[],"reply":200},{"at":1792570390733,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570391538,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"No
  real key; encryption implementation covered by existing vault tests, not inferred from masking."}
  Evidence: [screenshot](../evidence/webkit-phone-S07-dummy-key-persistence-1792570394027.webp),
  [tree](../evidence/webkit-phone-S07-dummy-key-persistence-1792570394027.aria.txt).

- 2026-10-21T08:13:15.563Z — phone A06-ticket-poll-success: **PASS**.
  {"uploads":1,"polls":2,"requests":[{"at":1792570398822,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570402145,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":202},{"at":1792570405157,"method":"GET","host":"127.0.0.1:6150","path":"/api/generation-result","query":"?job=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":null,"upload":null,"credential":["x-installation-id"],"reply":202},{"at":1792570408160,"method":"GET","host":"127.0.0.1:6150","path":"/api/generation-result","query":"?job=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"Ticket
  then pending then image; long timeout and reload-mid-poll remain separate."} Evidence:
  [screenshot](../evidence/webkit-phone-A06-ticket-poll-success-1792570410478.webp),
  [tree](../evidence/webkit-phone-A06-ticket-poll-success-1792570410478.aria.txt).

- 2026-10-21T08:13:32.082Z — phone A07-offline-reconnect: **PASS**.
  {"offlineDidNotUpload":true,"reconnectedGenerationSucceeded":true,"requests":[{"at":1792570415354,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570418660,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"limits":"Playwright
  network-offline signal; no real endpoint delivery claimed."} Evidence:
  [screenshot](../evidence/webkit-phone-A07-offline-reconnect-1792570419474.webp),
  [tree](../evidence/webkit-phone-A07-offline-reconnect-1792570419474.aria.txt).

- 2026-10-21T08:13:41.069Z — phone W13-ai-idb-quota: **PASS**.
  {"quotaHits":1,"uploadBeforeDurableStorage":false,"retrySucceeded":true,"requests":[{"at":1792570424329,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570428222,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/png","bytes":0},"credential":["x-installation-id"],"reply":200}],"limits":"Named
  IDB put QuotaExceededError fixture; actual origin storage not filled."} Evidence:
  [screenshot](../evidence/webkit-phone-W13-ai-idb-quota-1792570429329.webp),
  [tree](../evidence/webkit-phone-W13-ai-idb-quota-1792570429329.aria.txt).
