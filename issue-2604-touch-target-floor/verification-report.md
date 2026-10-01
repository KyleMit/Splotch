PR2614 / issue2604: pre-merge verification

The scoped shared controls use one 48px source floor on both axes. This record separates CSS dimensions, Android accessibility rectangles and screen coordinates that actually activate the app. It does not certify every app target or claim physical iOS runtime coverage. A mandatory fresh final-main release build and focused native verification remain outstanding until the reviewed merge reaches green main.

After source: bfeef0558b5334f542ad1b37ad513d9f2f2196df, clean and immutable during build/capture. Before artifact source: a1953747181cf00c2d5f0a13f4a4f14b2641944b, APK SHA-256 `88461dbfd003c07773f70e6970d417ead80e15b27bd67a1fdbfd8959dcf82c88`. Relevant CSS/components/state/platform/shell inputs are byte-identical to fresh base 4c9394e8f283f4358aed6169415eeb440bd66ea9; whole-bundle equivalence is not claimed. Both installed APK hashes were independently verified.

The after release is version 1.6.0/code8, minSDK24/target36, non-debuggable, R8/resource-shrunk and signed with a disposable evaluation certificate. APK signature, AAB jar signature, bundletool validation and embedded native index/source-byte identity passed. Release Lint reports zero errors and 29 warnings; the campaign owner handles backup/OEM and splash warning dispositions.

| Artifact | SHA-256 |
| --- | --- |
| Optimized APK | `7ffe2dc813901b4c8a4930f8b4baeb63b0ad8b2c61ca771ab7f8f602ebb9b31c` |
| Optimized AAB | `adaf360b944635c229bca0c4e5e69ca8d198c1307f42ac822dece484928a5fe6` |
| Public evaluation certificate | `e048a5fc88d8ed300512e6e127a0b51ba8cbc2ccdccedc9b46cb98e6b5014359` |

The sole owned API36 emulator used supported WebView 133.0.6943.137, 720×1280 screen pixels and density 280 (1.75 screen pixels/dp). Actual SurfaceFlinger GLES identifies the Apple M5 host GPU. Exact fixture paint independently establishes 24 CSS→42×42screen and 64 CSS→112×112screen in both axes; outward-rounded AX rectangles are recorded separately. API28/WebView 66 and API33/WebView 109 are below the Chrome 111 floor and do not provide supported web-runtime coverage. Android API24–28 System-light fallback inputs are preserved.

| Measured target | Before | After |
| --- | --- | --- |
| Close AX |44.571×45.714dp; eligible WEB size WARNING |48.571×49.714dp; eligible node, no size finding or NOT_RUN |
| Night / Sound AX |52.571×34.286dp; eligible WEB height WARNING |52.571×50.286dp; eligible nodes, no size finding or NOT_RUN |
| Night activating axial span |69.714×64dp bounded sampled/refined extent |69.714×68dp; all 241 interior pixels plus nine host edges/corners activate, Sound unchanged |
| Close activating axial span |No before effective-span claim |66.286×56dp counted unbroken span; four rounded-inside diagonals activate, blank-header outside stays open |
| Dark choice verified central floor |No before effective-span claim |48.571×48.571dp; 170 pixel probes, four rounded-inside probes and outside nonactivation |

The baseline switch already activates beyond 48dp on this runtime. Its demonstrated defect is the undersized AX rectangle and source floor; no baseline activation failure is invented. Mechanisms of extended WebView activation are not diagnosed.

Close's outer boundary sampling reaches 58/57/56/56screen pixels. Full interior testing finds an upper gap at offset42, coordinate(616,176); unbroken reaches are58/57/41/56, so only 116×98screen pixels count. The idle central upper border first paints at y177. Disconnected farther hits do not inflate the accepted region. The original failed x574 probe remains unexplained and retained; subsequent complete scans activate it. No pressed-transform defect was inferred or repaired without reproduction.

Real acceleration 9.81:0:0 drives Auto into compact landscape, then the tested Auto top edge accepts 0:9.81:0 and returns to portrait. Captured sizes are 1280×720 then 720×1280. Compact Night/Sound AX are 54.286×49.143dp and Auto 94.286×65.143dp. Added Night corner activation leaves Sound unchanged; added Sound edge activation leaves Night unchanged. Portrait correctly restores the active Appearance section with Auto selected. Inspected host-GPU captures show the complete compact controls.

Actual AndroidJUnitRunner status: corrected fresh baseline OK(1test),71.64s; focused Close seventh OK(1test),58.669s; focused Close eighth OK(1test),360.086s; complete ninth AFTER OK(1test),893.805s. adb exit0 alone is not acceptance. Separate post-capture verifier exit0 asserts geometry and 29 exact semantic focus nodes: present, visible, clickable, WEB origin, exact Button/ToggleButton/RadioButton role, both AX axes≥48dp and no TouchTargetSizeCheck finding or NOT_RUN for each exact ID. Same-named non-clickable TextView leaves and container silence do not count.

ATF is narrowed to TouchTargetSizeCheck. Successful eligible checks produce no PASS records. Seeded native 24 yields ERROR; eligible WEB 24 yields WARNING requiring manual verification, with its label stored as text. Labeled native/WEB 64 controls are explicitly present, visible, clickable and correct VIEW/WEB origin, with no finding or NOT_RUN for their exact IDs. Rendered WEB 24 size is 42×42screen, WEB64 is 112×112screen. This does not claim an actual WEB 24 activation-span failure.

Earlier actual failures remain preserved: initial WEB 24 assertion wrongly expected ERROR rather than framework WARNING; the next stale/navigation collector failed at Appearance; subsequent cache/route failures and unreliable exact-ARGB sweeps are not hit-area passes. Sixth AFTER completed switch proof but failed its first Close edge, so remains partial. The first post-capture verifier wrongly expected a Hub after portrait return; observed UI restores Appearance. Its failed log is retained, and only that frame expectation was corrected. Source/APK histories fourth through ninth and partial coordinate checkpoints remain available.

The original full tier collected at cd8c2c47c9d6623a885e15e4621b9ac5d50e9083: 4415 unit, 45 SSR, 277 asset-generation, 23 drawing-store and 6668 tools passed. Its E2E collection preceded the new Button touch case and exposed three old 44px assertions. Product/policy raw bytes are equal cd8→69380. Final E2E at clean 69380fd28264111c42343a7f12eb6dd423dc858f passed 1161 cases, including the new actual Button edge/outside touch case and corrected fit guards. Published bfeef changes ActivePageChip comments only, preserving comment-stripped code and its 34px thumbnail; check/lint passed. Focused Chromium 40 and desktop WebKit 31 passed; keyboard and compact layout checks remain. A 24px source-floor mutation made the focused sizing guard fail and was restored. The share generator updated conservative provenance only: four PNGs/shareCards.json remain byte-identical.

Applicability: ActivePageChip, ColoringBook header/dismiss and AiResultDisclosure target/budget consumers follow the shared token with related rendered guards. Bespoke page/admin/canvas/parental-gate controls are outside this certification. HubList's 44px icon is decorative. Shared Button actual activation is browser touch coverage; no dedicated native Button caller or physical iOS runtime is claimed.

Reproduction (all native/browser stages sequential):

- Clean issue worktree: `env -u PERF_MARKS -u PUBLIC_ENABLE_DEV_HARNESS npm run build:cap`; native asset budget 6125158/7000000 and 28/28 preloads passed. Prepare scratch: `python3 prepare.py --repo /private/tmp/splotch-2601-20261001/unit2604-worktree --base /private/tmp/splotch-2601-20261001/unit2604/native-release`.
- Scratch native-release/project/android: `JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ANDROID_HOME=/Users/kylemit/Library/Android/sdk ./gradlew --no-daemon --max-workers=1 :app:assembleRelease :app:bundleRelease :app:lintRelease`.
- Scratch atf/: `JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ./gradlew --no-daemon assembleDebug assembleDebugAndroidTest`.
- Owned runtime: `ANDROID_AVD_HOME=/private/tmp/splotch-2601-20261001/avd ANDROID_USER_HOME=/private/tmp/splotch-2601-20261001/android-user ANDROID_ADB_SERVER_PORT=5047 /Users/kylemit/Library/Android/sdk/emulator/emulator -avd Splotch_Campaign_2601_API36 -port 5580 -gpu host -no-window -no-snapshot -no-audio`.
- Scratch driver: `python3 run-atf.py before-freshcache`, `python3 run-atf.py close-debug`, `python3 run-atf.py after`; retained source records actual instrumentation commands and real sensor stimuli. `python3 verify-capture.py` exit0. `measure-web-scale.cjs` independently measures fixture paint.
- Stop: `/Users/kylemit/Library/Android/sdk/platform-tools/adb -P 5047 -s emulator-5580 emu kill`; owned emulator 47575 and driver 44735 exit0. Root-owned ADB 5047 remains. No owned listener or native runtime remains active.

Durable scratch lessons: clear the AX cache and reacquire nodes after each transition; assert the observed route; calibrate pixel classifiers with actual central toggles; flush coordinates and partial results before later failures; require actual JUnit OK and explicit eligibility/no-NOT_RUN positives; count contiguous activating pixels rather than symmetric AX endpoints or disconnected outer samples. Immutable manifests exclude keys/properties, credentials, caches and dependency trees. No repository harness tooling or new issues were added.
