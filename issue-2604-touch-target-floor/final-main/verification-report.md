# Fresh merged-main Android verification for issue 2604

Source 86248cc9e6501d7dfdd66230a2cf9e7e3c0ca91c; merged PR2614. Fresh frozen install, env-cleared native static export, optimized release APK/AAB and release Lint completed on this clean detached source. These artifacts and this final runtime are fresh; earlier source artifacts are comparison evidence only.

- Version 1.6.0, code 8; minSdk 24, targetSdk 36; non-debuggable, R8 and resource shrinking enabled.
- APK 7,947,534 bytes; SHA256 0c097988a1a604bdfab6595ee9079f06c41c36599b23d24673bf8efcd7c96aee.
- AAB 8,794,675 bytes; SHA256 618ec642d6da652d91f6317e4957eb334893f4248896f8691d3f2586ab3d9b95.
- Disposable evaluation certificate SHA256 af6f609663e826ef2c2fc8285a74cc88b0b039602cb18c49eddfb063b5aab926; private key and signing properties excluded from evidence. APK/apksigner, AAB/jarsigner and bundletool validation succeeded. Installed APK was independently pulled and matched exact bytes, version and signature.
- All 249 native static files/6,125,219 bytes matched both APK and AAB embedded bytes. Startup budget retained 28 modulepreloads; static payload is below 7,000,000 bytes.
- Actual final JUnit `OK (1 test)`, test status 0, runner final code −1, ADB exit 0; elapsed 899.077s. Strict post-verifier exit 0.
- API 36, WebView 133.0.6943.137, verified Apple M5 host GLES; 720×1280 screen, density280/1.75screen-px per dp. Actual sensor inputs 9.81:0:0 then0:9.81:0 changed landscape1280×720 back to portrait720×1280. Rendered 24px/64px fixtures independently measure 1.75 screen-px per CSS-px in both axes, matching density; PNG-painted bounds and inflated AX bounds are recorded separately.

| Control | Earlier supported-runtime comparison | Fresh merged-main result |
| --- | --- | --- |
| Night Mode AX bounds | 52.571 × 34.286dp; undersized-height warning | 52.571 × 50.286dp |
| Night Mode actual activation | 69.714 × 64.000dp; bounded coarse/refined extent already at least48dp | 69.714 × 68.000dp; 241 every-pixel interiors, nine edges/corners, outside negatives and adjacent Sound isolation |
| Close AX / actual activation | Earlier AX44.571×45.714dp warning; actual Close span not captured in that baseline | Fresh AX 48.571×49.714dp; actual unbroken 66.286 × 56.000dp; every interior pixel counted until first gap, excluding the nonactivating upper offset 42/outerisland; four rounded-inside diagonals and blank-header outside negative |
| Dark radio activation | No baseline effective span claimed | Verified central floor 48.571 × 48.571dp; every screen pixel, four rounded-inside points and outside negative |
| Compact Settings Sound / Auto | No fresh baseline compact claim | Both-axis AX≥48dp; added Sound edge activates and leaves Night unchanged; Auto added edge accepts actual portrait sensor stimulus |

The BEFORE runtime is immutable source a1953747181cf00c2d5f0a13f4a4f14b2641944b, scoped shared CSS/components equivalent to base 4c9394e8f283f4358aed6169415eeb440bd66ea9. It is an earlier supported-runtime comparison, not a newly captured final-main baseline. Before effective Night activation already exceeded48dp; this finding was native accessibility/CSS height, not demonstrated narrow actual activation. Extended activation beyond AX is measured behavior; its underlying WebView adjustment/scaling mechanism is not diagnosed.

29 exact visible/clickable WEB semantic nodes were verified across hub, portrait Appearance, compact landscape and returned portrait: Button for Close/Back, ToggleButton for switches, RadioButton for choices. All selected bounds meet48dp in both axes. Each exact node ID has no TouchTargetSizeCheck result, including NOT_RUN. Successful eligible ATF nodes emit no PASS record. Current roots are reacquired with cleared UiAutomation caches; duplicate TextView leaves are excluded from semantic-control coverage. The narrowed collector avoids the retained broad navigation/stale-node failures. Seeded native VIEW24 emits ERROR; seeded WEB24 emits WARNING with manual verification guidance; each correctly labeled64 positive node is present, visible, clickable, exact role/origin and eligible with no result or NOT_RUN. Container and other-check silence is not coverage.

Sound observation: 634 observations, 634 accepted, 0 retained disagreements. Actual central OFF/ON controls in both Light and Dark calibrate paired25-pixel thumb cores and owning hub subtitles. Minimum control contrast 22.000000; every accepted observation contrast≥11.000000, actual minimum 22.000000. Each hub sweep observation corroborates the exact current owning Button subtitle (`Muted` or `Volume 50%`). The compact landscape Settings shell reached from Appearance has no owning Sound subtitle; it explicitly requires observed landscape dimensions, Close and three exact orientation RadioButtons; calibrated paired cores are independently exercised by actual central change/restoration and edge isolation. Four retained calibration PNGs were independently decoded with sharp. The bridged ToggleButtons report unreliable checked/checkable flags even while visibly ON; these flags are not a state oracle. Disagreement frames, finite settling/failure and per-observation context are retained; no convenient state oracle is chosen.

Fresh final first JUnit FAIL after 168.45s remains preserved: Night coordinate (620,355), within Night[539,311][631,399] and 103px above Sound[539,458][631,546], reported isolated SoundBefore=false then SoundAfter=true after earlier true/true readings. No pre-tap frame was retained; cause remains unexplained. Independent central four-state diagnostic plus 12 repeats found no actual Sound mutation, with exact owning subtitles and independently recomputed raw pixels. Second run was intentionally interrupted after saved compact controls proved an invalid scratch Back prerequisite; actual Process crashed/no JUnit PASS/driver1 is retained. Third full run is the acceptance candidate. No product change or release rebuild was made for observer/context corrections; all nine original ATF/Close/theme/capture/cache/selection method bodies remain byte-identical. Current harness source SHA256 b98623bae1267b535289d97033db97f24fc178deb42f8733d54da08f4a2ab1c8; every exact harness source/APK/driver identity and all earlier failures are retained.

Release Lint: zero errors, 29 warnings: 1 ManifestOrder, 1 AndroidGradlePluginVersion, 3 GradleDependency, 1 DataExtractionRules, 1 ObsoleteSdkInt, 7 UnusedResources, 2 IconDipSize, 12 IconDuplicatesConfig, 1 IconLocation. Raw XML and hash retained. Root owns final backup/OEM and splash appearance warning dispositions; no warning was suppressed.

Commands executed serially (JDK21, SDK36):

```sh
pnpm install --frozen-lockfile
env -u PERF_MARKS -u PUBLIC_ENABLE_DEV_HARNESS npm run build:cap
python3 reproduce/prepare.py --repo /private/tmp/splotch-2601-20261001/unit2604-worktree --base /private/tmp/splotch-2601-20261001/unit2604/final-main/native-release
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ANDROID_HOME=/Users/kylemit/Library/Android/sdk ./gradlew --no-daemon --max-workers=1 :app:assembleRelease :app:bundleRelease :app:lintRelease
apksigner verify --verbose --print-certs app-release.apk
jarsigner -verify app-release.aab
java -jar bundletool-all-1.18.3.jar validate --bundle=app-release.aab
java -jar bundletool-all-1.18.3.jar dump manifest --bundle=app-release.aab --module=base
python3 reproduce/inspect-release.py
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ANDROID_HOME=/Users/kylemit/Library/Android/sdk ./gradlew --no-daemon --max-workers=1 assembleDebug assembleDebugAndroidTest
emulator -avd Splotch_Campaign_2601_API 36 -port 5580 -gpu host -no-window -no-snapshot -no-audio
python3 reproduce/install-and-identify.py
python3 reproduce/run-atf.py after
python3 reproduce/verify-final.py
```

Exact absolute tool arguments, isolated ADB5047, owned emulator identities, source freeze, installed path, artifact hashes, raw logs, sensor requests and results are retained in the credential-free package. Initial scratch badging parser expected the wrong aapt label; actual sdkVersion24 and parsed AAB minSdk24/target36 were validated after correcting only the parser. Its failed receipt remains; successful artifacts were not rebuilt.

Coverage limits: this is focused Android WebView touch/accessibility runtime acceptance with seeded native/WEB controls, not app-wide accessibility certification. Shared Button actual touch behavior and shared iOS-browser effects were tested in Chromium/WebKit before merge; no dedicated native Button caller or physical iOS runtime is claimed. Bespoke page/admin/canvas/parental-gate targets are outside this issue. Decorative44px HubList icon remains. API24–28 System light theme fallback is preserved by source/guards; this capture runsAPI 36.

Cleanup: owned emulator and driver stopped, owned merged local branch deleted, clean detached final main86248 verified by fresh fetch; public pr-assets retained and foreign branches/defaultADB5037 untouched. An already dispatched inventory overlapped root server shutdown and restarted isolatedADB5047. Automatic review rejected the worker combined shutdown under the earlier retain instruction before executing it. Root service owner verified exact restartedPID27549 and stopped it through the dedicated isolated command, exit0; lsof-only confirms5047/5580/5581 free. Startup, rejection and root-safe-alternative receipts are retained.
