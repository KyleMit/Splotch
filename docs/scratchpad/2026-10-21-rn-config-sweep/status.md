# Progress

* 10:25Z — Read brief, mobile/testing guidance and lifecycle oracle. API34 APK installed/launched.
  Plan written before 10:55Z. No other device addressed; original hunt evidence untouched.
* 10:27Z — emulator-5688: font-smallest runner completed; evidence awaits review.
* 10:28Z — emulator-5688: density-larger runner completed; evidence awaits review.
* 10:28Z — emulator-5688: density-smaller runner completed; evidence awaits review.
* 10:28Z — emulator-5688: night-on runner completed; evidence awaits review.
* 10:29Z — emulator-5688: night-off runner completed; evidence awaits review.
* 10:29Z — emulator-5688: contrast-on runner completed; evidence awaits review.
* 10:30Z — emulator-5688: bold-on runner completed; evidence awaits review.
* 10:30Z — emulator-5688: app-locale-fr runner completed; evidence awaits review.
* 10:31Z — emulator-5688: app-locale-ar runner completed; evidence awaits review.
* 10:33Z — RN-CONFIG-001 confirmed on two fresh API34 processes: high-contrast text hides ink until
  Undo redraws it; no activity recreation. Manifest guard: 3 tests passed.
* 10:33Z — emulator-5688: system-locale-fr-FR captured.
* 10:34Z — System-locale helper successfully changed effective API34 locale to French without
  recreation. Found that deleting absent-original font_weight_adjustment leaves effective weight
  300; explicit 0 then deletion is required before device signoff. Restoration fix queued.
* 10:34Z — emulator-5688: system-locale-ar captured.
* 10:34Z — emulator-5688: rotation-landscape captured.
* 10:35Z — emulator-5688: rotation-portrait captured.
* 10:35Z — emulator-5688: navigation-threebutton captured.
* 10:35Z — emulator-5688: navigation-gestural captured.
* 10:44Z — API34 real split entered through Recents; half and two-thirds bounds verified,
  drawing/history retained. Correcting a divider drag that missed its snapped handle; earlier
  small/exit labels are superseded, not accepted transitions.
* 10:46Z — RN-CONFIG-002 confirmed on two fresh API34 processes: expanded action icons vanish at the
  short split size; ink and history survive. Corrected split exits verified full-screen.
* 10:48Z — emulator-5690: font-largest runner blocked; restoration command issued.
* 10:48Z — emulator-5690: font-smallest runner blocked; restoration command issued.
* 10:48Z — emulator-5690: density-larger runner blocked; restoration command issued.
* 10:48Z — emulator-5690: density-smaller runner blocked; restoration command issued.
* 10:48Z — API34 phase complete:21 cases (16 pass,2 fail,2 known RTL,1 unsupported). Probe stopped;
  stored settings/input restored and audited. Effective English restored; locale backing-property
  empty-to-en-US difference reserved for final cleanup. API36 tablet install/drawing phase started
  before 11:20Z.
* 10:49Z — emulator-5690: night-on runner blocked; restoration command issued.
* 10:49Z — emulator-5690: night-off runner blocked; restoration command issued.
* 10:49Z — emulator-5690: contrast-on runner blocked; restoration command issued.
* 10:49Z — emulator-5690: bold-on runner blocked; restoration command issued.
* 10:49Z — emulator-5690: app-locale-fr runner blocked; restoration command issued.
* 10:49Z — emulator-5690: app-locale-ar runner blocked; restoration command issued.
* 10:51Z — emulator-5690: font-largest runner completed; evidence awaits review.
* 10:51Z — emulator-5690: font-smallest runner completed; evidence awaits review.
* 10:52Z — emulator-5690: density-larger runner completed; evidence awaits review.
* 10:52Z — emulator-5690: density-smaller runner completed; evidence awaits review.
* 10:53Z — emulator-5690: night-on runner completed; evidence awaits review.
* 10:53Z — emulator-5690: night-off runner completed; evidence awaits review.
* 10:54Z — emulator-5690: contrast-on runner completed; evidence awaits review.
* 10:55Z — emulator-5690: bold-on runner completed; evidence awaits review.
* 10:55Z — emulator-5690: app-locale-fr runner completed; evidence awaits review.
* 10:55Z — Tablet accepted font/density/theme/contrast/bold cases recorded. RN-CONFIG-001 also
  observed on API36 once; attached to existing twice-confirmed defect. Initial tablet
  no-ink/onboarding batch archived under preflight-rejected and excluded from coverage.
* 10:56Z — emulator-5690: app-locale-ar runner completed; evidence awaits review.
* 10:56Z — emulator-5690: system-locale-fr-FR captured.
* 10:57Z — emulator-5690: system-locale-ar captured.
* 10:57Z — emulator-5690: rotation-portrait captured.
* 10:58Z — Tablet system locales and real portrait rotation retain PID 4058/create count 1 and Undo.
  API34 offline font-survival checker passes and rejects six deliberate evidence mutations; no
  product source or CI tests changed.
* 10:58Z — emulator-5690: rotation-landscape captured.
* 10:58Z — emulator-5690: navigation-threebutton captured.
* 10:59Z — emulator-5690: navigation-gestural captured.
* 11:03Z — Tablet keyboard attach/detach accepted as real QWERTY configuration, state retained.
  Memory qualification in progress: COMPLETE rejected during foreground grace; one later COMPLETE
  receipt accepted, repeated post-resume COMPLETE can reject as above current trim level. Added
  background-state wait and RUNNING_CRITICAL fallback; rejected attempts are retained and not
  passes.
* 11:15Z — Tablet full-screen exit verified by closing only the paired Settings task; PID
  20390/create count 2 and Undo survive. Tablet freeform unavailable. Probe stopped; all restoration
  comparisons including exact locale backing property pass. API34 locale property also restored
  exactly via guest su0; API28 installation under way.
* 11:18Z — emulator-5686: font-largest runner completed; evidence awaits review.
* 11:18Z — emulator-5686: font-smallest runner completed; evidence awaits review.
* 11:19Z — emulator-5686: density-larger runner completed; evidence awaits review.
* 11:19Z — emulator-5686: density-smaller runner completed; evidence awaits review.
* 11:19Z — emulator-5686: night-on runner completed; evidence awaits review.
* 11:20Z — emulator-5686: night-off runner blocked; restoration command issued.
* 11:20Z — emulator-5686: contrast-on runner completed; evidence awaits review.
* 11:24Z — emulator-5686: system-locale-fr-FR blocked; restoration issued.
* 11:25Z — emulator-5686: system-locale-ar captured.
* 11:25Z — emulator-5686: rotation-landscape captured.
* 11:25Z — emulator-5686: rotation-portrait captured.
* 11:27Z — API28 Save after font 2.0 passed with real storage Allow: PID 4028/create count 1
  retained; one new public MediaStore PNG,1079×1888 with53821 purple ink pixels, visually verified.
  Original permission flags/pref backed up for teardown. High-contrast blanking also observed on
  API28; added to existing twice-confirmed finding.

* 11:49Z — All three device phases complete. API28 save and process-death persistence checked;
  settings, permission flags and drawer preferences restored. Two fresh isolated tablet rotation
  round trips retain settled ink/Undo; earlier cumulative-sequence blank capture remains an
  unconfirmed lead. All probe/helper processes stopped. Final evidence/count audit and summary in
  progress.

- 11:50Z — Final audit: 59 executed cases (47 pass, 4 fail observations across 2 confirmed defects,
  5 known RTL, 3 unsupported freeform); 5 API28 N/A. All 1,356 capture evidence files resolve.
  Manifest guard 3/3; survival checker passes on all 3 devices and rejects 18 deliberate negative
  controls. Restricted Markdown check passes. Sequential process audits find no probe or
  session-helper process; tracked git diff remains empty. Summary written; no commits, pushes, gh,
  web or AI requests.
