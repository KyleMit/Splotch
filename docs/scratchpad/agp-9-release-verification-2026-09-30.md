# AGP 9 release verification

Issue [2554](https://github.com/KyleMit/Splotch/issues/2554) addresses Play's specific
recommendation to upgrade AGP to 9.0 or higher. R8 was already enabled in the published 1.6.0
release.

## Toolchain and migration

Google Maven metadata advertised stable AGP 9.4.1. The
[AGP 9.4 compatibility table](https://developer.android.com/build/releases/agp-9-4-0-release-notes)
requires Gradle 9.6.0 and Build Tools 36.0.0. The project retains JDK 21, Capacitor 8.5.2, minSDK
24, compile/target SDK 36, and version 1.6.0/code 8.

The wrapper was generated twice: first with the old wrapper's `wrapper` task, then with Gradle 9.6.0
itself. The distribution SHA-256 is
`87a2216cc1f9122192d4e0fe905ffdf1b4c72cff797e9f733b174e157cadd396`; the generated wrapper JAR
SHA-256 `497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7` matches Gradle's official
wrapper checksum. Only the repository's tracked macOS/Linux wrapper files are retained.

The app's exact asset exclusion filter moved from `defaultConfig.aaptOptions` to `androidResources`.
Built-in Kotlin and the new DSL remain enabled. Every installed native module configured and
compiled without dependency patches or compatibility opt-outs.

The first release compile exposed the
[AGP 9 dependency-constraint default change](https://developer.android.com/build/releases/agp-9-0-0-release-notes):
the app compiled against transitive AndroidX Core 1.13.0 while runtime selected Capacitor's 1.17.0.
`MainActivity` uses `WindowCompat.enableEdgeToEdge`, so the app declares Core directly at the shared
`androidxCoreVersion`. This preserves the existing 1.17.0 pin and the earlier edge-to-edge fix.

## Artifact comparison

The exact-base build used main at 84d1d45e3886668c6754f6b36aa729eb4bf7e7c5. Both bundles used the
same production static web assets, current version, and disposable local test key. The published
artifact was only read; neither production signing material nor the published release was modified.

| Value                       | Exact base (AGP 8.13.0) | Result (AGP 9.4.1) |
| --------------------------- | ----------------------- | ------------------ |
| Embedded version/code       | 1.6.0 / 8               | 1.6.0 / 8          |
| Embedded R8 compiler        | 8.13.6                  | 9.4.24             |
| R8 minimum API              | 24                      | 24                 |
| Raw AAB bytes               | 8,769,038               | 8,779,738          |
| Embedded mapping bytes      | 10,352,834              | 10,618,426         |
| Uncompressed DEX bytes      | 1,427,932               | 1,387,648          |
| Compressed DEX bytes        | 668,297                 | 663,543            |
| Uncompressed asset bytes    | 6,155,523               | 6,155,523          |
| Uncompressed resource bytes | 2,793,635               | 2,793,635          |

Exact-base AAB SHA-256: `928f7ef9e6c2d2debc8a50e7a72534a431115fb906d44a1adbbe1add6ea34573`. Result
AAB SHA-256: `7c85f799b917026a281f48ed812f010b0382d4f68b34580cbcf3f32f84535bf3`. Result R8 map hash:
`38292dc85325a12d91a011f303ff7dc0e5c90063a761820512443f198b382411`.

The raw bundle grew 10,700 bytes while uncompressed DEX shrank 40,284 bytes. These are artifact
measurements, not evidence of a runtime memory or speed improvement. Play's download-size figures
are a separate measurement.

For comparison, the published GitHub v1.6.0 AAB is 8,796,729 bytes, SHA-256
`73e02d686a95f799aa5ac2d4afb90f8b9ce92c4b21ade4a08c6cd113da79f1ab`, with R8 8.13.6 and a
10,361,271-byte mapping. Its identity with the Play-uploaded bundle remains unverified; it is not
the exact base for this unit.

## Optimization and runtime evidence

The complete `:app:bundleRelease :app:assembleRelease` build succeeded. R8 and integrated resource
shrinking ran; the AAB embeds its mapping and AGP metadata. Effective `configuration.txt` contains
no `-dontoptimize`, `-dontshrink`, or `-dontobfuscate`. Capacitor's consumer
`-keep public class * extends com.getcapacitor.Plugin { *; }` remains. `seeds.txt` retains plugin
constructors, including PhotoLibrary, DeviceLock, ColoringPacks, SystemBack, Preferences, and
SecureStorage, under the strict keep defaults. No speculative keep-rule narrowing was applied.

On the campaign-owned API 33 emulator with WebView 150, the non-debuggable, test-signed Release APK:

* Passed the unchanged Maestro launch/first-paint smoke.
* Drew and saved a 3,524,285-byte PNG into shared `Pictures/Splotch` through the native PhotoLibrary
  chunked bridge.
* Persisted the light theme across a cold process restart.
* Completed native ColoringPackWorker jobs; Settings reported seven extra books ready.
* Reported installed minSDK 24, targetSDK 36, version 1.6.0/code 8, without the debuggable flag.

API 24 and API 34–36 were not locally runtime-tested. The existing tag gate retains API 24/33
Release smoke coverage. No Play upload occurred, and recommendation clearance must be checked after
the next uploaded bundle is analyzed. Local artifacts use a disposable certificate and are
verification outputs, not store-upload artifacts.

## Verification commands and controls

* `npm run android:bundle` on the exact base, then the Gradle helper's
  `:app:bundleRelease :app:assembleRelease` on the migrated toolchain.
* `npm run android:verify`: signature verified with the disposable test certificate.
* `npm run release:publish -- --only=android --dry-run`: version and embedded R8 mapping verified;
  nothing uploaded.
* `ANDROID_SERIAL=emulator-5560 npm run test:android:device`: passed against the Release APK.
* `npm run check`, `npm run lint`, `npm run format:check`: passed.
* `npm run test:tools`: 282 files / 6,631 tests passed after staging the new module so the
  tracked-path documentation guard could resolve it.
* The publisher mapping guard accepts a mapped version-matching fixture and rejects missing, empty,
  wrong-compiler, missing-version, and header-only mappings. Removing the publisher's guard
  temporarily made all five rejection tests fail; restoring it made all six tests pass.

The mapping guard proves embedded R8 processing/deobfuscation evidence, not every optimizer setting.
Existing release-configuration guards pin minification, resource shrinking, and the optimized
default rules. Dependency Gradle scripts still emit deprecations for future Gradle 10; they do not
prevent the pinned Gradle 9 build.
