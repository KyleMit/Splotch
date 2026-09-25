# Fix-cycle timing report

## Scope and method

This report uses only `manifest.json`, the 41 finished session reports, and the 41 finished
`*-timing.json` ledgers under the 2026-08-31 Codex session-report directory. No raw transcript was
read.

All timestamps are UTC. Durations are interval unions, never arithmetic sums of overlapping
intervals. Each category was unioned independently. `Delivery union` is the union of every
categorized core-session interval except `user/approval/external idle`; it is not the sum of the
category figures. `Capture` means the ledger category `profiling/measurement`. `Device` is the union
of `device reservation+validation` and `install/launch/reset/cleanup`. `Response` is only observable
response latency recorded by the ledgers; no hidden reasoning time is inferred. Category figures
overlap one another and must not be added.

The ten fix groups below assign each of the 27 core sessions exactly once. Their delivery unions
must also not be added across groups because independently running core sessions overlap in wall
time. The correctly unioned campaign-wide, non-idle categorized core interval is **4d 6h 44m 31s**.

Finer per-PR allocation is reported only when a report or ledger exposes a stable
issue/PR/branch/commit/task marker. Where a session interleaved several PRs, reviews, captures, or
background commands without stable per-fix boundaries, the result is marked **unsegmentable**.

### Source coverage and exclusions

* **Core sessions included in timing totals (27):** `01a0556d-5324-7f02-b38f-4c9d0426d506`,
  `01a04d49-fc00-7f20-a37b-aeb55d7d018f`, `01a049ec-f2d2-7f93-808a-f54dd7330118`,
  `01a047b9-a9bd-7ee2-9897-c1da3e839e59`, `01a04260-402b-7840-bbe0-740997b1bd00`,
  `01a03f61-9a16-7b83-847f-786c032fc9e3`, `01a03d72-fbae-7a61-83ce-0122cb0e8c66`,
  `01a03d10-b25f-7d20-9e12-9df8808f4847`, `01a03b48-fac8-7621-9e95-1abd9698bc66`,
  `01a03a8c-f603-7d30-933c-d6d96ac1721b`, `01a038a2-7db2-7c41-b6d1-494db975c2d2`,
  `01a03302-c62e-7de3-958b-d1f146a42f4b`, `01a030e0-545b-75c3-925c-c03f291f81e5`,
  `01a02e2c-c6f6-7ac2-a939-23c342b9a7b9`, `01a0221a-3afc-78f2-8530-da79ee9d9362`,
  `01a01b9b-4712-71d1-8b25-a58265c01abd`, `01a01b7f-c814-71c1-94b2-4bea57a1c097`,
  `28542214-61b6-40b1-bf07-f9f8ba043a99`, `6e508a29-39cc-45ff-9dd4-3d79dc1c4d13`,
  `aad29a65-527a-4977-8210-25432a61b059`, `80cceecf-8285-4ad7-b132-92a1c6a8641c`,
  `3e6f6f97-83a3-4945-a288-b4724cdd6602`, `d2249b1c-c2d7-5484-9146-f6d23293668f`,
  `abcb7ded-1b02-5495-ab45-407ec19e3037`, `7c37d255-8494-5f99-a40f-7dcee3e25013`,
  `332ba4fb-4e2f-45a9-a3fc-934d386561df`, `4d4e2ec9-2663-54f3-9f57-a0a5e2a01b12`.
* **Auxiliary planning sessions, evidence only and explicitly excluded from implementation totals
  (4):** `56595d7d-e331-4da5-8d0e-39e70cdee3e8`, `f7618b89-7d05-41a0-8dfe-b9947cddd31a`,
  `51590def-6ca9-4eec-9e97-2cae3232bddf`, `91dcbd84-0a06-438e-9a73-3df3057c219d`.
* **Auxiliary review sessions, evidence only and explicitly excluded from implementation totals
  (10):** `503bcdde-b035-5b89-87b2-455a1e126994`, `9c6625d1-4a1c-539d-a2e1-5e9e69f0a32b`,
  `cd2d1ac2-51b7-40e0-862b-a63732bfcc8e`, `0742f1b4-a4b8-4cb0-a7bf-3749b1d732ad`,
  `e21aeb77-bff3-443f-90cc-56555fa0a166`, `69b8d12f-ece7-4380-8997-c41808bc3965`,
  `d7a932a0-5a8a-4bf3-bd95-b2d4f78d65f7`, `ebf22b39-c9b7-42e3-9e6d-becfbf878e6c`,
  `3d85518e-44c1-4bfb-8d91-d11268217a97`, `7b134243-0632-4837-83c5-a25c49933bb5`.

## Fix 1 — issue #1161 / branch `codex/issue-1161-browser-action-performance` / PR #1163 / head `83f5aaf8`

**Core sessions:** `01a01b7f-c814-71c1-94b2-4bea57a1c097`, `01a01b9b-4712-71d1-8b25-a58265c01abd`.

**Milestones**

* Start of investigation: `2026-08-19T19:29:17.726Z` (`01a01b7f…`, raw L9).
* First code change: **21s** to the Firefox engine enablement at `19:29:38.807Z` (`01a01b7f…`, raw
  L35). The report does not expose a lower-level edit timestamp.
* First passing local validation: **3m49s** to the completed Firefox suite at `19:33:07.071Z`
  (`01a01b7f…`, raw L143).
* First useful measurement: **9m12s** to the 48-group Firefox result at `19:38:29.930Z`
  (`01a01b7f…`, raw L194); it identified the 24.98 ms coloring-books P95 and the custom-color
  activation failure.
* Physical-device validation: none; the report explicitly says no physical iOS or Android hardware
  was run (`01a01b9b…`, raw L505 `2026-08-19T20:27:37.869Z`).
* Reviewed/CI-green: PR #1163 review fixes landed and the replacement Quality job was green by
  `21:24:30.649Z`, **1h55m13s** after the initial request (`01a01b9b…`, raw L1090; final clean-head
  check L1094 `21:24:35.558Z`).

**Core interval unions:** delivery **51m05s**; build **1m01s**; test **5m24s**; capture **27m29s**;
device **0s**; response **2m00s**; failed attempts **5m49s**; recovery **4m04s**; handoff **10s**;
CI/network wait **5m02s**.

**Approaches and repetitions:** three consequential mechanisms were separated: visible-swatch
targeting, custom-color activation at `pointerdown`, and worker-based Magic-sheet rasterization. The
useful browser sweeps comprised the initial Firefox and Chromium comparisons plus focused
pre/post-fix and final full-suite reruns. Exact rebuild and recapture counts are **unsegmentable**
because build reuse (`--no-build`) and multiple action families overlap in the ledger. The reported
performance change was Chromium Magic post-action P95 25.4 ms → 9.2 ms focused and 8.9 ms full-suite
(`01a01b9b…`, raw L142/L275/L404, `20:04:54.658Z`/`20:09:05.604Z`/`20:21:24.456Z`).

## Fix 2 — deployment matrix branch `codex/performance-matrix-2026-08-20` / PRs #1191 and #1200 / commits `25beea8a`, `7c45e775`

**Core sessions:** `01a0221a-3afc-78f2-8530-da79ee9d9362`, `28542214-61b6-40b1-bf07-f9f8ba043a99`,
`6e508a29-39cc-45ff-9dd4-3d79dc1c4d13`. Auxiliary handoff session `56595d7d…` is linked evidence
only and excluded.

**Milestones**

* Start of investigation: `2026-08-21T02:15:43.394Z` from the first core timing boundary. The first
  raw report anchor is branch setup at L109 `02:19:00Z` (`01a0221a…`).
* First useful measurement: the first report exposes only the completed matrix aggregate at L4539
  `10:13:09Z`, **7h57m26s** after the core timing boundary: 9/11 targets, 34/44 target-mode cells,
  95/120 drawing artifacts passing, 22/22 undo probes passing, and 124/1,164 comparable action rows
  failing (`01a0221a…`). Earlier per-target useful boundaries are **unsegmentable**.
* First code change: **unsegmentable**. The report surfaces successful branch creation at L113/L115
  `02:19:05Z–02:19:08Z`, but not the first edit boundary.
* First passing local validation: the initial report's aggregate pass boundary is L4539 `10:13:09Z`;
  the continuation later recorded all 13 applicable CI checks passing plus two skips at L2480
  `15:43:58.276Z` (`28542214…`).
* Physical-device validation: iPad Safari completed 20/20 cells on its first attempt at L1346
  `2026-08-21T18:04:52.575Z`; later the campaign reached drawing/undo 44/44 and actions 40/44 by
  L2186 `20:19:05.194Z` (`6e508a29…`).
* Reviewed/CI-green: PR #1191 was updated and repaired to all applicable checks green by L2480
  `15:43:58.276Z` (`28542214…`); PR #1200 and the expanded 51-commit description were present by
  L2834 `22:02:48.945Z` (`6e508a29…`).

**Core interval unions:** delivery **16h20m26s**; build **9m56s**; test **12m27s**; capture
**13h27m15s**; device **18m21s**; response **4m54s**; failed attempts **47m51s**; recovery
**3h00m45s**; handoff **21m12s**; CI/network wait **29m26s**.

**Approaches and repetitions:** the work moved from an all-or-nothing raw-input generator to
preserving committed normalized evidence, then added a durable campaign queue and runtime-specific
physical paths. Rebuild count is **unsegmentable**. Recapture count is also **unsegmentable** at
command level; surfaced coverage progressed from 34/44 cells to 36/44 drawing/undo and 30/44
actions, then to 44/44 drawing/undo and 40/44 actions. Four iOS-native landscape action cells
remained uncaptured rather than being assigned synthetic precision (`6e508a29…`, raw
L318/L2186/L2834).

## Fix 3 — performance/durability stack PRs #1227–#1244 / ADR-0138

**Core sessions:** `aad29a65-527a-4977-8210-25432a61b059`, `01a02e2c-c6f6-7ac2-a939-23c342b9a7b9`.
The latter is a core review/takeover session, so its intervals are permitted in the core delivery
union but are not mislabeled as code implementation.

**Milestones**

* Start of investigation: `2026-08-23T02:38:26.826Z` (`aad29a65…`, raw L3).
* First useful measurement: **52m24s** to the mac-chrome recapture at L751–L756
  `03:30:50.948Z–03:31:16.455Z`, which moved a published 4.18% cell to 0.00% and a 316 ms paint
  maximum to about 10.3 ms (`aad29a65…`).
* First code change and first passing local validation: **unsegmentable** across the eight initial
  campaign PRs, four durability PRs, and downstream review-fix PR. The report does surface a later
  complete 2,241-test pass at L3096–L3105 `13:23:24.671Z–13:24:08.323Z` (`aad29a65…`).
* Physical-device validation: four targets were fully recaptured; both devices were left ready. The
  campaign response boundary is L1968 `09:23:52.870Z` (`aad29a65…`).
* Reviewed/CI-green: two review rounds produced 26 findings, all handled in the downstream fix PR by
  L3116 `13:27:35.505Z` (`aad29a65…`). The later core review session posted the twelve-stack verdict
  and follow-up #1244 review at L1240/L1844/L1875–L1906
  `11:09:16Z`/`12:09:27Z`/`12:55:49Z–12:56:45Z` (`01a02e2c…`). The stack was left open; no merged
  boundary is claimed.

**Core interval unions:** delivery **9h46m17s**; build **40m24s**; test **50m18s**; capture
**5h47m19s**; device **2h04m11s**; response **6m26s**; failed attempts **1h51m21s**; recovery
**1h27m12s**; handoff **2m03s**; CI/network wait **7m35s**.

**Approaches and repetitions:** at least 13 PR delivery units are explicit, but the number of
distinct technical approaches and rebuilds is **unsegmentable**. The report gives four fully
recaptured targets and 132 campaign capture cells; it does not expose a non-overlapping
command-level recapture count (`aad29a65…`, report discussion anchored at raw L1968
`09:23:52.870Z`).

## Fix 4 — issue #1225 follow-through / PRs #1259–#1320 / branches `claude/peaceful-mclean-904420`, `claude/profiling-capture-session-8c71ec`

**Core sessions:** `80cceecf-8285-4ad7-b132-92a1c6a8641c`, `01a030e0-545b-75c3-925c-c03f291f81e5`,
`01a03302-c62e-7de3-958b-d1f146a42f4b`, `01a038a2-7db2-7c41-b6d1-494db975c2d2`,
`3e6f6f97-83a3-4945-a288-b4724cdd6602`. Auxiliary planning sessions `f7618b89…`, `51590def…`, and
`91dcbd84…` may corroborate decisions but are excluded from all totals.

**Milestones**

* Start of investigation: `2026-08-23T18:43:48.306Z` (`80cceecf…`, raw L3).
* First useful measurement: **7m07s** to the first WebKit undo-gate run at L271 `18:50:55.096Z`; it
  initially failed because the worktree lacked dependencies (`80cceecf…`). The first healthy gate
  validation was L1248 `21:53:31.770Z`, **3h09m43s** after start.
* First code change: **unsegmentable**. Ten linked PRs, several review-fix layers, and later PRs
  #1314/#1317/#1319/#1320 were interleaved without one stable cross-session edit marker.
* First passing local validation: the earliest explicit healthy WebKit gate is L1248
  `21:53:31.770Z`; later review sessions report 604, 626, 883, 904, 906, and 1,016-test green tiers,
  but their per-PR overlaps prevent a single finer boundary.
* Physical-device validation: Android/iPad work was repeatedly exercised. Two complete 20-cell
  recaptures are explicitly reported in `3e6f6f97…`; the first physical-iPad product fix measured
  103 ms → 17 ms at L1055 (`3e6f6f97…`, timestamp surfaced in the report), and the Android/iPad
  recapture inventory was handed off at L6170 `2026-08-25T18:31:58.688Z`.
* Reviewed/CI-green: PR #1273 reached 13 pass/3 skipped at raw L2285 `2026-08-24T01:17:39.843Z`
  (`80cceecf…`), but the authorized merge was denied and main stayed unchanged at L2309/L2313
  `01:28:15.200Z`/`01:28:56.828Z`. Later PR-specific review and CI boundaries exist, but one final
  cluster-wide green boundary is **unsegmentable**.

**Core interval unions:** delivery **12h46m57s**; build **28m32s**; test **31m46s**; capture
**3h25m31s**; device **1h20m38s**; response **4h53m08s**; failed attempts **29m27s**; recovery
**20m21s**; handoff **3m45s**; CI/network wait **46m00s**.

**Approaches and repetitions:** the stable markers cover initial campaign/first
review/self-heal/second review/merge-attempt, then PR-specific review campaigns through #1320.
Distinct approach count, rebuild count, and total recapture count are **unsegmentable**. Explicitly
surfaced recaptures are two complete 20-cell physical targets plus targeted A/B and readiness
captures; no auxiliary planning time is included.

## Fix 5 — instrument stack PRs #1332–#1346 / branch `codex/performance-matrix-2026-08-20`

**Core sessions:** `d2249b1c-c2d7-5484-9146-f6d23293668f`, `01a03a8c-f603-7d30-933c-d6d96ac1721b`,
`01a03b48-fac8-7621-9e95-1abd9698bc66`, `01a03d10-b25f-7d20-9e12-9df8808f4847`.

**Milestones**

* Start of investigation: `2026-08-25T18:32:38.818Z` (`d2249b1c…`, raw L3).
* First code/delivery marker: **8m17s** to PR #1332 at L298 `18:40:56.021Z`; the report does not
  expose the first edit, so this is the first defensible delivery boundary, not a claimed keystroke
  timestamp (`d2249b1c…`).
* First useful measurement: the earliest surfaced live-app fill/erase/pixel probe is L889
  `19:05:21.748Z`, **32m43s** after start (`d2249b1c…`).
* First passing local validation: **unsegmentable** across the sequential PRs; the reports expose
  later full tiers, including 883 tests passing after a host rerun (`01a03d10…`, raw L505–L522
  `08:31:04.821Z–08:31:39.969Z`).
* Physical-device validation: Android eraser capture ran L2511–L2515 `21:39:35.203Z–21:41:19.891Z`,
  **3h06m56s** after start, and reported faithful input plus 1.0217% lost-frame share (`d2249b1c…`).
* Reviewed/CI-green: PRs #1332–#1346 were merged and main's rerun completed successfully at L2659
  `22:03:51.901Z`, **3h31m13s** after start (`d2249b1c…`). Subsequent core sessions independently
  reviewed the exact stack and posted/read back their comments.

**Core interval unions:** delivery **3h44m46s**; build **1m26s**; test **5m49s**; capture
**22m48s**; device **1h34m23s**; response **1h32m42s**; failed attempts **5m08s**; recovery
**1h05m37s**; handoff **11m43s**; CI/network wait **16m24s**.

**Approaches and repetitions:** twelve merged PR markers are explicit (#1332, #1333, #1334, #1335,
#1337–#1343, #1346), with two adversarial review rounds. Technical-approach and rebuild counts are
**unsegmentable** because the timing ledgers mark review/recovery phases rather than one-to-one
builds. One physical Android eraser capture is explicitly surfaced; other review probes are not
counted as recaptures.

## Fix 6 — follow-through stack PRs #1347–#1357 plus reviews #1368/#1369 / merge `c54afad`

**Core sessions:** `abcb7ded-1b02-5495-ab45-407ec19e3037`, `01a03d72-fbae-7a61-83ce-0122cb0e8c66`.

**Milestones**

* Start of investigation: `2026-08-25T21:59:41.445Z` (`abcb7ded…`, raw L3).
* First passing baseline: **3m57s** to inherited main CI green at L145–L150 `22:03:38Z–22:03:46Z`;
  implementation began after that boundary (`abcb7ded…`).
* First code change and first useful performance measurement: **unsegmentable**. The session exposed
  a seven-PR stack and local Mac Playwright work, but not the first edit/measurement boundary per
  PR.
* Physical-device validation: none for the implementation stack; the report explicitly says no
  physical iPad or Android was touched (`abcb7ded…`, raw L380/L385 `22:11:12Z`/`22:11:28.313Z`). The
  later #1368/#1369 review session reserved and proved the rig but ran no performance campaign
  (`01a03d72…`, raw L19/L34/L43 `09:42:42.925Z`/`09:44:11.591Z`/`09:44:43.420Z`).
* Reviewed/CI-green: the seven-PR stack was green and unmerged at L1814 `23:27:39.857Z`; after PR
  #1357, stack #1353 merged at L2046/L2049 `00:19:56.330Z`/`00:20:04Z`, and post-merge CI finished
  successfully at L2077 `00:23:41.571Z` (`abcb7ded…`). PR #1368/#1369 reviews were later posted and
  verified at L519–L536 `10:06:11.720Z–10:06:41.257Z` (`01a03d72…`).

**Core interval unions:** delivery **2h09m41s**; build **29m58s**; test **7m01s**; capture
**14m18s**; device **24m10s**; response **8m46s**; failed attempts **5m02s**; recovery **28m06s**;
handoff **2m49s**; CI/network wait **15m02s**.

**Approaches and repetitions:** seven work PRs, PR #1354, and review-fix PR #1357 are explicit
delivery units. Distinct technical approaches, rebuilds, and local recaptures are **unsegmentable**.
Physical recaptures are **0**; the later device time was reservation/validation and reserved-idle
time, not performance capture.

## Fix 7 — crayon/instrument work PRs #1382–#1479 / branches `perf/crayon-campaign-notes-2026-08-26`, `claude/native-crayon-perf-72a023`

**Core sessions:** `01a03f61-9a16-7b83-847f-786c032fc9e3`, `7c37d255-8494-5f99-a40f-7dcee3e25013`,
`332ba4fb-4e2f-45a9-a3fc-934d386561df`, `01a04260-402b-7840-bbe0-740997b1bd00`.

**Milestones**

* Review/setup work began at `2026-08-26T18:43:00.051Z` (`01a03f61…`, raw L9). The actual crayon
  investigation began at `20:24:07.285Z` (`7c37d255…`, raw L3); milestone deltas below use that
  implementation start.
* First useful mechanism measurement: **3h53m40s** to the Safari web attribution at L1214
  `2026-08-27T00:17:47.657Z`: baseline 1.23%, direct paint 0.64%, flat color 0.69%, pen 0.76%
  (`7c37d255…`).
* First code change and first passing local validation: **unsegmentable** across the independent
  experiment branches. The report warns that a fidelity-passing 0.00% native trial was invalidated
  by unit tests at L2011–L2063 `03:07:55.294Z–03:18:57.202Z`, so that capture is not treated as a
  pass.
* Physical-device validation: the campaign measured 16 Safari alternatives on the physical iPad; the
  native T1–T10 series reached 0.30–0.46% at L2296 `04:17:15.403Z`. The second native campaign's
  final fixed build measured five-sample crayon median 0.03% versus pen 0.05% at L2824
  `2026-08-28T02:09:36.824Z` (`332ba4fb…`).
* Reviewed/CI-green: PRs #1444, #1459, #1461, and #1449 were verified merged at L3112
  `02:46:47.431Z` (`332ba4fb…`); the broader campaign produced review, rejection documentation, and
  log PR #1479 by L3714 `09:39:53.057Z` (`7c37d255…`).

**Core interval unions:** delivery **16h49m39s**; build **5m36s**; test **21m14s**; capture
**9h04m39s**; device **48m27s**; response **3h42m29s**; failed attempts **3m10s**; recovery
**15m24s**; handoff **5m06s**; CI/network wait **2h14m24s**.

**Approaches and repetitions:** explicitly surfaced are 16 Safari alternatives, native T1–T10, and
the later no-plane/direct-per-operation glazing campaign. These sets may overlap in preparatory
branches, so no fabricated grand approach count is given. Rebuild count is **unsegmentable**. At
least one explicit rebuild-and-recapture occurred after Playwright replaced the performance-marked
i1 build (L693–L702 `22:19:33.297Z–22:20:33.316Z`, `7c37d255…`); total recaptures are unsegmentable.

## Fix 8 — remaining #1225 descendants: issues #1458/#1323/#1199/#1197/#1215, PRs #1480–#1486/#1492, commits `04ca15f2`, `c22bfead`, `b9c1872e`, `af9103c0`

**Core sessions:** `01a047b9-a9bd-7ee2-9897-c1da3e839e59`, `01a049ec-f2d2-7f93-808a-f54dd7330118`.
Auxiliary PR #1486 review session `503bcdde…` is linked evidence only and excluded.

**Milestones**

* Start of investigation: `2026-08-28T09:35:46.740Z` (`01a047b9…`, raw L9).
* First useful measurement/physical validation: **5m37s** to the synchronized baseline and
  dual-device proof at L130 `09:41:23.869Z` (`01a047b9…`).
* First code change and first passing local validation: **unsegmentable** per issue. Stable
  completion markers are #1458 at L1415 `11:38:00.743Z`, #1323 at L1985 `13:07:26.361Z`, #1199 at
  L2404 `14:00:00.828Z`, and #1197 at L3030 `16:23:11.142Z` (`01a047b9…`). #1458 was
  quarantined/closed rather than counted as a shipped pass.
* First complete #1215 result: all four 20-cell simulator/emulator targets were accepted by L2952
  `2026-08-28T23:24:47.274Z` (`01a049ec…`). Android-native changed from the wrong Appium drawing
  route at 0.81–0.82 moves/frame to split transport at about 1.03 moves/frame/60 Hz, while actions
  stayed packaged-origin Appium.
* Reviewed/CI-green: PR #1486 local checks and CI were green by L4665 `2026-08-29T02:21:31.783Z`; it
  was merged by L4694 `02:25:58.381Z`. Follow-up documentation PR #1492 was opened after the merge
  (`01a049ec…`, raw L4715/L4801 `02:27:09.247Z`/`02:29:25.384Z`).

**Core interval unions:** delivery **15h01m31s**; build **20m58s**; test **2h19m52s**; capture
**8h26m41s**; device **2h21m08s**; response **2m16s**; failed attempts **33m37s**; recovery
**2h50m49s**; handoff **10m08s**; CI/network wait **11m58s**.

**Approaches and repetitions:** six issue/task layers are explicit, with #1458 quarantined and five
continuing layers. Rebuild count is **unsegmentable**. Recaptures: exactly four complete 20-cell
simulator/emulator targets (80 accepted cells) are surfaced in the continuation; earlier partial
#1215 and issue-specific physical probes are not double-counted. The auxiliary #1486 review found
ten initial issues and later green CI, but contributes **0** to the timing totals.

## Fix 9 — zero-red/selector campaign PRs #1493–#1509 / stack #1496 / branch `codex/performance-coloring-selector-presentation-20260829`

**Core sessions:** `01a04d49-fc00-7f20-a37b-aeb55d7d018f`, `4d4e2ec9-2663-54f3-9f57-a0a5e2a01b12`.
Auxiliary reviews for #1493, #1494, #1495, #1498, #1499, #1500, #1501, and #1507 (`9c6625d1…`,
`cd2d1ac2…`, `0742f1b4…`, `e21aeb77…`, `69b8d12f…`, `d7a932a0…`, `ebf22b39…`, `3d85518e…`,
`7b134243…`) are evidence only and excluded.

**Milestones**

* Start of investigation: `2026-08-29T11:31:31.006Z` (`01a04d49…`, raw L9).
* First useful measurement: **9m22s** to the initial eraser boundary evidence at L268
  `11:40:53.475Z`; the corrected attribution was applied by L314 `11:42:17.651Z` (`01a04d49…`).
* First code change: the first defensible corrected-boundary marker is L314, **10m47s** after start;
  the exact edit start is **unsegmentable**.
* First passing local/physical validation: representative physical iPad web/native and Android runs
  were faithful and green by L432 `11:48:28.573Z`, **16m58s** after start; later confirmation
  anchors are L639/L1378/L1476 `12:06:09.584Z`/`12:54:00.013Z`/`12:58:38.122Z`.
* Physical-device validation: both devices eventually passed touch/rotation after reconnect/passcode
  recovery at L11982 `2026-08-30T18:38:32.638Z`. The hybrid SVG architecture retained three faithful
  red selection modes at L12056/L12140 `18:42:43.952Z`/`18:46:37.598Z`; they were not retried for a
  lucky green.
* Reviewed/CI-green: successive auxiliary reviews were fixed and settled; the later core session
  verified the inherited stack through #1509 merged at L99 `2026-08-31T01:29:23.208Z` (`01a0556d…`,
  cited only as subsequent verification, not included in this fix's totals). The matrix itself was
  not regenerated to zero red (`01a04d49…`, raw L13860/L13866 `01:03:30.011Z`/`01:04:19.391Z`).

**Core interval unions:** delivery **14h20m43s**; build **30m38s**; test **1h37m33s**; capture
**4h47m56s**; device **3h31m23s**; response **6h07m34s**; failed attempts **12m03s**; recovery
**25m49s**; handoff **1h07m38s**; CI/network wait **31m33s**.

**Approaches and repetitions:** at least five major mechanism families are explicit: refill-boundary
attribution, live nonce-gated report consumption, demanded-overlay scheduling/modal transition
removal, canonical-SVG full-page plus responsive-raster selectors, and selector-tier reduction. The
exploratory core session also measured three WebGL2 architectures. Rebuild and total recapture
counts are **unsegmentable**. Explicit repetitions include three rejected stale-report attempts,
both-commit production rebuild/recapture of the typography evidence, and faithful red Safari modes
retained without retry. Auxiliary review time is excluded even when it supplied the finding that
triggered a core correction.

## Fix 10 — physical-iPad/action stack PRs #1511/#1512/#1513/#1514/#1516/#1517/#1518 and skills PR #1519

**Core session:** `01a0556d-5324-7f02-b38f-4c9d0426d506`.

**Milestones**

* Start of investigation: core timing boundary `2026-08-31T01:27:03.226Z`; first report anchor is
  the merged-stack inventory at L99 `01:29:23.208Z`.
* First useful measurement: **16m54s** from the timing boundary to L369 `01:43:57.615Z`, which
  exposed the Safari surface-geometry cliff (`01a0556d…`).
* First code change: **unsegmentable**; the report first surfaces the 3×3 experiment result at L521
  `01:53:34.595Z`, not its edit start.
* First passing local/physical validation: the accepted 4×5 compromise was reached at L872
  `02:22:40.084Z`, **55m37s** after the timing boundary, and passed representative
  portrait/landscape crayon and Magic workloads; the broader confirmation is L1021 `02:40:08.042Z`.
* Physical-device validation: dedicated physical-iPad runner measurements were used; Playwright was
  limited to correctness/visual ordering. The reviewed exact selection commit later produced a
  faithful 20 ms P95/28 ms maximum pass at L6169 `11:37:41.863Z`, while Settings remained red.
* Reviewed/CI-green: the user confirmed the seven-PR stack merged at L8540 `15:27:28.525Z`; PR #1519
  ended ready with green CI and no remaining findings at L9498 `17:04:19.723Z`, **15h37m16s** after
  the timing boundary (`01a0556d…`).

**Core interval unions:** delivery **11h01m29s**; build **1m53s**; test **58m51s**; capture
**5h01m08s**; device **19m55s**; response **5m32s**; failed attempts **0s**; recovery **2h09m24s**;
handoff **4m07s**; CI/network wait **26m49s**.

**Approaches and repetitions:** grid geometry tested 3×3, 5×5, and accepted 4×5; overlay/selection
work tried resident-image, opacity, visibility, wrapper-layer, theme-prefetch, trusted native touch,
and two-slot predecode variants before retaining modal-retirement ordering. That is three grid
approaches plus at least seven selection variants; overlap prevents a defensible single grand count.
Rebuild and recapture counts are **unsegmentable**. The complete 11-target matrix was not recaptured
or regenerated to zero red; the delivered evidence was current physical-iPad Safari work, not an
all-target completion claim (`01a0556d…`, raw L37/L9498 `01:29:23.208Z`/`17:04:19.723Z`).

## Cross-fix cautions

* A zero or absent physical-capture count means no physical performance capture was surfaced for
  that fix; it does not mean the session never reserved a device.
* `Response` can be large in long-running Claude/Codex sessions because the ledger records only
  observable boundaries and cannot separate internal reasoning, scheduling, compaction, or
  tool-stream latency.
* Rebuild and recapture counts are deliberately marked unsegmentable whenever a build was embedded
  in a test/capture wrapper, a capture command contained multiple cells, a background command
  overlapped another interval, or the report surfaced only aggregate target coverage.
* Faithful red captures, setup refusals, invalid captures, and superseded evidence are kept
  distinct. Setup or fidelity failures are not counted as product measurements, and faithful red
  results are not silently retried into green ones.
* Auxiliary sessions may establish that a review occurred or a finding was resolved, but none of
  their time contributes to any implementation or delivery union above.
