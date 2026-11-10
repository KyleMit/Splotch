# Codex method challenge of the RN go/no-go campaign plan

Lane: method challenge. 2026-11-09, Codex CLI 0.167.0 (`gpt-6.1-sol`, effort high) through the
`run-rival-agent` broker, two free-form question turns against a snapshot of this tree (RN product
code = 427756f14). The rival read `CAMPAIGN.md`, `owner-packet.md`, the Oct 22 desk review and its
evidence, the issue 2690 comments of 10-18/10-19/10-21, and both frozen checkouts. It ran no device,
network or AI commands and requested no escalations. Its answer is condensed below where repetitive;
thresholds are its proposed campaign rules, not perceptual standards.

Claude spot-checked the load-bearing references: all exist as cited (RN `SplotchPaperReplay.swift`
calls `paper.dispatch` directly; shipping `engine.ts` rejects non-pen starts inside
`COLOR_CHANGE_DEBOUNCE_MS`; the 10-18 comment's "fresh shipping SDK27 stops at lifecycle
enforcement"; the 10-18 Galaxy pair was RN Release vs shipping **Debug**; the 724 ms RN web FCP in
`docs/scratchpad/2026-10-19-rn-web-static-first-paint/README.md`; shipping's
`perf:ios:bundled:frames` targets `capacitor.config.json` `appId` = the store `art.splotch.app`).

**Verdict:** revise the method before spending the 20 hours. As planned, the breadth pass can find
reasons to reject either arm but cannot establish that RN is clearly better on iPad. Make the
24-hour call provisional, and keep "architecture preference" separate from "permission to release".

## 1. What could make the decision wrong

| Trap                                            | How it misleads                                                                                                                                                                | Correction                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instruments called "architecture-neutral"       | RN `docs/PROFILING.md`: Android view frames need not map to ink-surface frames — a smooth halo can coexist with stale ink. WebView compositor work can escape app attribution. | Show the metric detects visibly stalled ink in **each** arm before scoring; keep `gfxinfo`/probes diagnostic until then.                            |
| iOS trace scoped to the app process             | Shipping work spans app + WebContent + GPU; RN timing ends at submission.                                                                                                      | Animation Hitches with `--all-processes`; score `hitches-frame-lifetimes`, not detected hitches (shipping `docs/PROFILING-IPAD.md`).                |
| "Same scripted input" entering different layers | RN replay bypasses UIKit hit testing and gesture arbitration; shipping's DOM-synthetic path bypasses browser work.                                                             | Drive both through the same OS gesture path (XCUITest/WDA); treat in-app replays as renderer experiments only.                                      |
| Synthetic cadence changes the workload          | Shipping `PROFILING-CAMPAIGNS.md` "Input cadence is a result": 47 vs 116 moves/s changed loss dramatically; synthetic iPad input looked clean where a hand stalled 1.4 s.      | Record delivered moves, contacts, admission, visible ink; don't score a low-jank run that drew less.                                                |
| Release vs Debug, mixed sources                 | The 1.50% vs 2.10% pair is RN Release vs shipping Debug at older sources; its launch pair was 312 vs 677 ms, not the later 296 vs 381. Combining them is a fictional pair.     | Fresh Release/Release from the two pins; record hash, flags, OS, WebView. v1.6.0 only as cross-check.                                               |
| Warming away the first stroke                   | Excluding late replays is right for steady-state renderer cost but would erase the exact failure a toddler meets.                                                              | Two outcomes: replay validity (steady state) and first-use failure. Keep every attempt.                                                             |
| Misattributing iPad holds                       | The ~140 ms 10-19 hold vs `DEVELOPMENT.md`'s 25–50 ms drawable waits caused by live syslog.                                                                                    | Post-collect logs; uninstrumented control; split launch-first / post-Clear / post-Settings / later strokes.                                         |
| Process-cold ≠ ready to draw                    | `TotalTime` and initial frame can finish before paper accepts a stroke.                                                                                                        | Measure first accepted stroke and first visible ink separately from launch.                                                                         |
| Three samples as a verdict                      | Thousands of frames in one run are not independent trials.                                                                                                                     | Three for screening; promote decision-changing cells to interleaved paired repeats with a predeclared stopping rule. "Not measured" ≠ "equivalent". |
| Refresh-rate normalization                      | 120 Hz vs 60 Hz can both show zero missed budgets with different ink responsiveness.                                                                                           | Report measured cadence, absolute ms and missed-budget time separately; record Low Power Mode.                                                      |

**Web prior is contested both ways.** The 0.77 s vs 1.87 s figure has no source found. The 10-19
3.01 s vs 0.83 s is also stale: the 10-19 prerender spike reports RN at 724 ms FCP/LCP with first
scribble ~2,642 ms. Neither is admissible; rerun both exports on the same host/throttle/storage and
measure first paint **and** successful first stroke, including a stroke before hydration.

**Decision-rule boundaries.**

* False RN-win: many cosmetic wins outweighing one iPad input/save failure; instrument silence read
  as smooth ink; erased first runs; one easy SDK upgrade read as low annual upkeep.
* False shipping-win: unknown cells counted as ties; RN penalized for fixed behavior; sunk migration
  cost charged as future cost; RN's upgrade tested while shipping's upkeep is assumed free.
* Keep the tie rule, but "no demonstrated advantage" means "retain shipping for now", not "shipping
  proved equal". A shared serious defect needs a release disposition in both, not cancellation.
* Predeclare an iPad material-benefit margin and non-compensable guardrails (crash, lost picture,
  inaccessible core control, supported-device exclusion) and how much Android gain can offset iPad
  loss — before results.
* Price blocker fixes with the same half-day experiment for **either** arm; report frozen quality
  and repair cost separately.

## 2. Missing from the breadth pass

1. **Toddler contact chaos:** five-finger mash, held finger + taps on controls, palm then new
   stroke, drag across controls/offscreen re-entry, Clear/Undo/color while a contact is down.
2. **Transitions mid-work:** rotate while drawing, resize→maximize, background/lock during stroke,
   save, book download, AI polling; real auto-lock resume; Guided Access/app pinning after setup;
   system-edge gestures, Android Back.
3. **Accumulated picture:** 200-stroke and 10-minute dense Crayon/Magic sessions, then Undo, theme,
   rotate, Save, Clear (RN `skiaInkScene.ts` rebuilds history; `skiaInkLayer.ts` allocates
   paper-sized surfaces).
4. **Sound/resource states:** Sound on/off, silent switch, audio interruption, Low Power Mode, warm
   device, memory pressure; first Crayon/Magic use, not just Pen.
5. **Parent recovery:** Photos denied→Settings→grant→retry; Save-on-Clear then immediate drawing
   (verify pixels in Photos); offline launch, interrupted download, AI network loss.
6. **Users off the two flagship devices:** small iPhone, max Dynamic Type/button size,
   VoiceOver/TalkBack, Reduce Motion, floor boot/save (`docs/COMPATIBILITY.md` keeps API 24 / iOS
   16.4). Mark low-memory-device performance as unmeasured if no such hardware.
7. **Web visit states:** first, customized-settings, repeat, offline PWA, service-worker update;
   Safari/WebKit as well as Chromium; touch before hydration; dark-theme startup.
8. **Matched upkeep:** pair the Expo upgrade with a time-boxed shipping toolchain/native-dependency
   exercise (RN's prerender relies on Expo internals in `tools/migration/prerender-native-web.mjs`).
9. **Release feasibility:** signing/export prerequisites for both; dev-ID installs cannot prove
   same-ID update or rollback — label it unverified.

The owner packet lets every case be skipped; make three mandatory (section 6). For AI, pre-allocate
the $10 to matched native success paths (iPad first), use fixtures for failure branches, and treat
an exhausted budget as unknown, not pass.

## 3. Top 5 blocker candidates per arm (first 24 h)

Investigation targets, not assertions. A confirmed breach blocks accepting that frozen candidate
until repaired or dispositioned.

### RN

| # | Suspect (evidence)                                                                                                                                           | Cheap test                                                                                                                                  | Blocker if                                                                                                 |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 | **iPad first ink stalls** (10-19 ~140 ms; today's first-replay lateness; `SkiaInk.tsx` adopts paper at first contact; replay on main queue; syslog confound) | 20–30 min: logs post-collected; 10 cold + 10 warm/post-Clear first touches, Sound on/off, paired with shipping; all-process frame lifetimes | Repeatable >100 ms first-ink delay, missing first stroke, or freeze surviving the no-live-log control      |
| 2 | **Dense drawing/rebuild pauses, memory, blank ink** (`skiaInkScene.ts` rebuild, `skiaInkLayer.ts` surfaces, `skiaViewPicture.ts` lifetimes)                  | 20 min/device: 200 dense mixed strokes + 20 s no-lift Crayon; Undo, rotate, theme, resume; ×3 with memory                                   | Crash, ink loss/corruption, repeatable >100 ms core-action stall, or memory growth across identical cycles |
| 3 | **Core controls fail in constrained layout / assistive use** (desk-review receipts for shared iPad 3121/3122, Android 3142)                                  | 15–20 min: iPad resize→tap Purple→maximize both orientations; Galaxy min split; max font; VoiceOver/TalkBack Settings round-trip            | Color tap closes/minimizes the app, essential action unusable, parent cannot finish/exit core flow         |
| 4 | **Native save/AI recovery** (past file-write/Blob/PNG/Keychain defects fakes missed; `src/platform/photoLibrary.ts`, `unsavedPictures.ts`)                   | 15–25 min/platform: deny Photos, Save/Clear, grant, relaunch, retry; one budgeted AI success + save                                         | Lost picture, saved pixels ≠ drawing, settings/credentials don't persist, AI fails where control succeeds  |
| 5 | **Web paints fast but drops early use / mishydrates** (ADR-0180; Expo-internal prerender)                                                                    | 15–20 min: matched Slow 4G/4× CPU, fresh + customized storage; stroke at FCP; hold through startup then tap; offline repeat                 | Stuck control, wrong persisted state, no offline drawing, or worse first successful stroke than shipping   |

### Shipping

| # | Suspect (evidence)                                                                                                                                          | Cheap test                                                                                                                      | Blocker if                                                                                                          |
| - | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1 | **Real-touch iPad compositing stalls** (shipping `PROFILING-IPAD.md` hand-only stalls; `strokeRasterQueue.ts` crayon batching)                              | 20–30 min: same Pen/Crayon/Magic workload as RN, blank + dense, all-process frame lifetimes; bundled WKWebView, not Safari      | Repeated >100 ms visible freezes or a latency gap meeting the section 4 RN-benefit rule                             |
| 2 | **Rapid color→draw or interrupted contact loses ink** (`engine.ts:startDrawing` drops non-pen starts inside `COLOR_CHANGE_DEBOUNCE_MS`; `scribbleGuard.ts`) | 10–15 min: 20 quick color-pick→short strokes, palm→finger, drag across controls, edge re-entry; same on RN                      | Ordinary finger strokes repeatedly vanish, stuck contacts, ink invisible until repaint                              |
| 3 | **iPad window controls obstruct toddler actions** (3121/3122 reproduce in shipping too)                                                                     | 10 min: 3 resize→Purple→Zoom cycles per orientation, then draw and reopen Settings                                              | Color tap triggers OS Close/Minimize, or controls hidden until rotate/relaunch                                      |
| 4 | **Clear/save/permission recovery loses the picture** (`engine.ts:prepareCanvasExport` async snapshot; `unsavedPictureStore.ts` iOS termination notes)       | 15–20 min: dense Crayon→Save/Clear→draw immediately; deny/grant Photos, relaunch, retry; inspect pixels                         | Old picture vanishes, new ink contaminates export, empty/corrupt retry, success with no file                        |
| 5 | **"Low-risk" arm can't produce the next iPad build** (10-18: fresh shipping SDK27 stops at lifecycle enforcement)                                           | 30–60 min, stop at first failure: dev-ID **Release** of shipping main on the rig's Xcode + iPad; launch, rotate, Save, relaunch | No reproducible usable Release, or a required toolchain repair with no feasible path inside the half-day experiment |

## 4. iPad: what would convince

**Ideal (needs a finger and a 240 fps camera, so later):** matched Release builds, interleaved
AB/BA, no live syslog; 10 paired runs per superiority scenario over two sessions, 20 cold and 60
warm first strokes per arm. "RN clearly better" = P95 touch-to-ink ≥16.7 ms **and** ≥25% better,
consistent across sessions; or shipping repeatedly freezes ≥100 ms where RN does not and RN halves
lost in-contact presentation time — plus RN warm first-dot P95 ≤50 ms, cold ≤75 ms, no repeatable

> 100 ms first dot, no regression in other brushes/dense history/post-Clear, no guardrail failure,
> and masked owner sessions agree.

**RN is not clearly better if:** the gain exists only in `gfxinfo`, submission counts or a 120-vs-60
label; the ~140 ms first-stroke hold persists where shipping has none; both arms are smooth within
margin; drawing improves but a serious iPad save/interaction/accessibility/lifecycle regression has
no repair; or only warm, sound-off, blank, synthetic runs favour RN. An invalid shipping comparator
means "unanswered", not "RN worse". Android gains cannot answer the iPad question.

## 5. Follow-up: the unattended version (no finger, no camera)

| Method                                          | Existing tooling                                                                                                                                                                                                                                              | Proves / cannot prove                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **WDA/XCUITest coordinate gestures, both apps** | RN `tools/device-parity/run-gesture-sequence.mjs`; better: shipping `tools/perf/lib/trusted-gesture-plan.mjs:trustedGestureActions` sent through RN's Appium session `/actions`, `NATIVE_APP` for both. **Shared adapter missing.**                           | OS delivery, hit testing, real handlers. Not digitizer onset, palm rejection, or feel. Equal requests ≠ equal delivery — count received moves. |
| **All-process Animation Hitches**               | `xcrun xctrace record --template 'Animation Hitches' --device <device> --all-processes --time-limit 30s …`, export `hitches-frame-lifetimes` (shipping docs). **Shared scorer missing.**                                                                      | Common presentation evidence across processes; not new-ink pixels or touch-to-photon.                                                          |
| **USB pixel witness**                           | WDA `GET /screenshot` works for either app. Continuous timestamped physical-iPad capture **missing** (RN `screen-recording.mjs` is simulator-only on iOS).                                                                                                    | Final ink and corruption; coarse freezes only after calibration. Never derive 16.7 ms gains from host timestamps.                              |
| **Per-arm probes/replays**                      | RN `EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1` + `DEVICECTL_CHILD_SplotchReplay=…` on `art.splotch.app.dev`. Shipping `perf:ios:bundled:frames` **targets the store bundle ID `art.splotch.app` — do not run unchanged** (campaign hard rule); needs a dev-ID adapter. | Attribution only; RN `firstDotMs` ends at submission, shipping marks end before presentation.                                                  |

**Agent-scoreable rules.**

| Outcome                     | Rule                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provisional RN advantage    | Dense-Crayon, 6 valid pairs in two blocks: shipping has an ink-associated ≥100 ms freeze in ≥4, RN in none; RN cuts lost in-contact presentation time ≥50% in **every** pair, median ≥100 ms per 20 s run; workload matched, coverage validated, no guardrail failure (6/6 same direction = sign test p 0.031). |
| Presentation-only advantage | Same thresholds in frame lifetimes but pixels unvalidated: report narrowly; **not** "clearly better for users".                                                                                                                                                                                                 |
| Not demonstrated            | Misses margins, reverses between blocks, relies on replay/submission counters, or input/witness validity unresolved. Repeatable RN contact/export loss, crash or control regression defeats it. Broken comparator = unknown.                                                                                    |
| First-stroke gate           | Keep every attempt; count accepted contacts, ink, stalls. The 50/75 ms P95 limits **cannot be certified** with these tools.                                                                                                                                                                                     |
| Final call                  | Waits for the three owner cases. Tie or unproven = retain shipping provisionally, without claiming equivalence.                                                                                                                                                                                                 |

**First 24 hours (~20 active h, rig-locked):** 4 h build/verify both dev Releases and OS gestures;
≤2 h shared gesture adapter + frame-surface mapping + witness feasibility (if unresolved, narrow the
verdict and stop building instruments); 4 h iPad: 6 paired 20 s dense-Crayon runs (3+3, AB/BA) + 3
pairs each blank Pen and Magic; 2 h: 6 cold starts per arm and 6 warm starts per arm in each of
ordinary/post-Clear/post-Settings; 3 h: 3 functional repeats per arm of held/multi-contact,
rotate/resume, window→maximize, Photos deny/retry, Clear→new-ink export; 2 h Galaxy blocker smoke +
matched web first-paint/first-stroke; 3 h reserve (one confirmation per suspect blocker, scoring,
owner setup; unused reserve extends iPad pairs toward 10). **Smallest sample that flips the call:**
two independent reproductions establish a serious failure; three pairs can show a large lead but not
superiority; six valid pairs meeting the rule can flip the provisional preference toward RN.
**Later:** 10-pair confirmation, 20 cold/60 warm, thermal/dense sessions, accessibility/floor
devices, matched upgrades, camera latency.

## 6. Proposed mandatory owner cases (masked A/B, counterbalanced, WDA detached)

1. **First stroke.** Open process-terminated blank builds A→B→B→A, Pen, Sound on. Draw a short
   stroke as soon as paper appears; Clear and repeat; open/close Settings and repeat. Compare
   missing first ink, delayed first dot, whether the line follows the finger; record A/B/same.
2. **Dense Crayon.** Open matching prefilled 200-stroke pictures B→A→A→B, same Crayon width, Sound
   on. Slow loops and fast scribbles for 30 s; Undo ×3; draw again. Compare finger-to-line gap,
   freezes, sound breaks, recovery after Undo.
3. **Palm and held contact.** Blank builds A→B→B→A. Rest a palm while drawing, lift and restart;
   hold one finger while another changes color or opens Settings, then resume. Compare ignored
   strokes, stuck contacts, accidental actions, recovery without relaunch.

## Ranked plan changes (most likely to change the decision first)

1. Fair iPad Release/Release pair through the same OS gesture path, measuring first accepted stroke
   and visible ink, **before** broad screenshots — 60–90 min + builds.
2. Calibrate instrument coverage in both arms (all-process frame lifetimes; prove a stalled-ink
   control is detected) — 30–45 min.
3. Keep every cold first-stroke attempt; split late-replay exclusion from first-use failure — 20–30
   min, shared with 1.
4. Preregister margins, non-compensable failures, unknown/tie handling, paired confirmation — 15
   min.
5. Palm/multi-touch/held-contact, rotation and window→maximize matrix on both arms — 30–45 min.
6. Photos denial/relaunch/retry and Clear→new-ink export integrity before AI spend — 30–45 min.
7. Replace both web headlines with matched applied-throttle first-paint + first-successful-stroke,
   incl. customized/repeat/offline visits — 30–45 min.
8. Dense-history rebuild and 10-minute sound-on sessions with memory/thermal — 45–60 min.
9. Three mandatory owner feel cases; reserve paired native AI success attempts in the ledger — 20
   min owner + 20–40 min device.
10. Match the Expo upgrade with a shipping current-toolchain/release-feasibility exercise (SDK27
    lifecycle risk); label floor/channel proof unverified — 60–120 min.

These replace lower-value breadth work rather than adding to the 20-hour budget.
