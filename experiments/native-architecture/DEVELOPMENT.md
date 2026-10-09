# Drawing development checkpoint

This candidate is a runnable development slice. It does not select a migration framework or certify
Release builds. The shipping Capacitor app and its native smoke flow are separate.

The screen supports strokes, paint colors, Pencil and Marker, Undo, Clear, PNG sharing, and saving
and reopening pictures in app-private storage. Saved pictures survive an app restart. The native
renderer is `react-native-svg`; PNG export uses its raster `toDataURL` callback and Expo file and
sharing APIs.

## Local iOS development

Use Node 24 and the Ruby version in `Gemfile`. Install JavaScript packages at the repository root
with `pnpm install --frozen-lockfile`. Run ordinary `bundle install` from this directory using an
isolated bundle path. On this host, Ruby/OpenSSL needs `SSL_CERT_FILE=/etc/ssl/cert.pem` to use the
system CA bundle; certificate verification stays enabled. CocoaPods must run with the same Ruby and
bundle environment. `nkf` and JSON below 3 are explicit Gemfile compatibility requirements.

Select an available simulator with `xcrun simctl list devices available`. Choose an unused port with
`npm --silent run show:free-port`; the example uses 5300. From this directory, start Metro:

```sh
node ../../node_modules/expo/bin/cli start --port 5300 --localhost --max-workers 2
```

In another terminal with the same package and Ruby environment, build and install:

```sh
NODE_BINARY="$(command -v node)" node ../../node_modules/expo/bin/cli run:ios \
  --device "$SIMULATOR_ID" --configuration Debug --port 5300
```

The maintained bundle recipe admits Debug and Release. Release retains its ambient override
refusals. Debug uses the supported React Native Metro route. An installed simulator app can be
launched directly when desktop GUI activation is unavailable:

```sh
xcrun simctl launch --terminate-running-process "$SIMULATOR_ID" art.splotch.migration.probe \
  -RCT_jsLocation localhost:5300
```

`RCT_jsLocation` is the installed React Native bundle provider's supported user-default key. Match
its value to the chosen Metro port. The Debug app needs Metro. Build a standalone Release app with
the same package and Ruby environment:

```sh
NODE_BINARY="$(command -v node)" node ../../node_modules/expo/bin/cli run:ios \
  --device "$SIMULATOR_ID" --configuration Release --no-bundler
```

Do not combine `--port` with `--no-bundler`; Expo refuses that combination. Launch the installed
Release app without `RCT_jsLocation` or Metro:

```sh
xcrun simctl launch --terminate-running-process "$SIMULATOR_ID" art.splotch.migration.probe
```

CocoaPods writes the project, workspace, lock, privacy manifest and generated dependency tree.
Preserve those development outputs separately from maintained template sources. The maintained
source checker continues to reject generated paths; do not feed a working CocoaPods tree into it as
accepted template input.

## Local Android Release

Use Node 24, JDK 17 and an Android SDK containing platform 36, Build Tools 35.0.0 and 36.0.0, NDK
27.1.12297006, CMake 3.30.5, and platform-tools. The app selects Build Tools 36; Expo library
compilation also consumes AGP's Build Tools 35 default. Supply a disposable external keystore named
`candidate-release.keystore` and its signing values. The maintained candidate refuses a missing or
project-local Release keystore.

From this directory, with `JAVA_HOME`, `ANDROID_HOME` and the signing variables set:

```sh
printf 'sdk.dir=%s\ncmake.dir=%s\n' "$ANDROID_HOME" "$ANDROID_HOME/cmake/3.30.5" \
  > android/local.properties
(
cd android
./gradlew --no-daemon --no-parallel --max-workers=2 \
  -Pandroid.builder.sdkDownload=false -Pandroid.cmakeVersion=3.30.5 \
  -Pkotlin.compiler.execution.strategy=in-process -PhermesV1Enabled=true \
  -Psplotch.probe.release.storeFile="$CANDIDATE_RELEASE_STORE" \
  -Psplotch.probe.release.storePassword="$CANDIDATE_RELEASE_STORE_PASSWORD" \
  -Psplotch.probe.release.keyAlias="$CANDIDATE_RELEASE_KEY_ALIAS" \
  -Psplotch.probe.release.keyPassword="$CANDIDATE_RELEASE_KEY_PASSWORD" \
  assembleRelease
)
```

The signed, minified APK is `android/app/build/outputs/apk/release/app-release.apk`. Choose an
available emulator or device serial, then install and launch without Metro:

```sh
adb -s "$ANDROID_SERIAL" install -r android/app/build/outputs/apk/release/app-release.apk
adb -s "$ANDROID_SERIAL" shell am start -W -n art.splotch.migration.probe/.MainActivity
```

Preserve generated Gradle/CMake outputs separately from maintained native template source. Signing
with this disposable key supports local development; it does not establish store signing.

## Recorded scope

Browser and iOS simulator interactions are development evidence. A physical phone was unavailable at
the first checkpoint. Store signing, supported OS floors, performance comparison and final migration
acceptance remain separate requirements.
