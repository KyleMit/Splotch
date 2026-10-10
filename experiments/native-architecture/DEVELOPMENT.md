# Drawing development checkpoint

This candidate is a runnable development slice. It does not select a migration framework or certify
Release builds. The shipping Capacitor app and its native smoke flow are separate.

The screen supports strokes, paint colors, Pencil and Marker, Undo, Clear, PNG sharing, and saving
and reopening pictures in app-private storage. Saved pictures survive an app restart. The native
renderer is `react-native-svg`; PNG export uses its raster `toDataURL` callback and Expo file and
sharing APIs.

The Stroke Width Selector offers Thin, Medium and Thick for drawing and an independent eraser
choice. Medium keeps the candidate's prior brush defaults. Widths are captured per contact and
retained by Undo, save/reopen and PNG rendering. The existing settings owner persists sound and both
width choices together; see [construction and validation limits](STROKE-WIDTH-CONSTRUCTION.md).

The maintained Android manifest removes Expo FileSystem's legacy READ_EXTERNAL_STORAGE and
WRITE_EXTERNAL_STORAGE declarations. These private save/cache paths and PNG sharing do not request
external storage grants. Validate the actual built APK's merged permissions when checking a new
native build; source markers alone do not establish its permission set.

## Independent development source

Before Metro, Expo, Bundler, CocoaPods or Gradle runs, create an independent owned disposable **full
repository** copy outside every maintained checkout. A candidate-folder copy alone omits the root
package graph and scripts. Do not use the maintained candidate as a native tool working directory.
Supply the exact reviewed commit and previously reviewed absolute tool paths:

```sh
set -eu
test ! -e "$OWNED_SOURCE"
git clone --local --no-hardlinks "$SOURCE_CHECKOUT" "$OWNED_SOURCE"
git -C "$OWNED_SOURCE" checkout --detach "$REVIEWED_SOURCE_COMMIT"
cd "$OWNED_SOURCE"
test -x "$REVIEWED_NODE"
export PATH="$(dirname "$REVIEWED_NODE"):$PATH"
test "$(command -v node)" = "$REVIEWED_NODE"
test "$(shasum -a 256 "$REVIEWED_NODE" | awk '{print $1}')" = "$REVIEWED_NODE_SHA256"
expected_node_version=$("$REVIEWED_NODE" --input-type=module --eval '
  import { NATIVE_CONTRACT } from "./tools/migration/lib/native-source-contract.mjs";
  process.stdout.write(NATIVE_CONTRACT.nodeVersion);
')
test "$("$REVIEWED_NODE" --version)" = "$expected_node_version"
pnpm --store-dir "$OWNED_CACHE/pnpm-store" install --frozen-lockfile
cd experiments/native-architecture
```

`OWNED_SOURCE` and `OWNED_CACHE` must be distinct owned directories outside maintained checkouts.
Tool installations, the pnpm store, bundle/Gradle caches and Xcode DerivedData stay outside every
checkout. JavaScript dependencies and generated per-project state belong to the disposable copy.
Record its source commit, package/lock hashes and generated changes. Preserve the maintained reader
and ignore fences: generated `.expo`, Pods, locks, environments and build outputs are not maintained
source and must not be fed back into its acceptance check.

## Local iOS development

Use the exact reviewed Node24 executable and digest, and the Ruby version in `Gemfile`. Do not
select Node from the ambient PATH. Set `REVIEWED_NODE` to the absolute qualified binary and
`REVIEWED_NODE_SHA256` to its qualification receipt's digest, then record and check the selection:

```sh
test -x "$REVIEWED_NODE"
export PATH="$(dirname "$REVIEWED_NODE"):$PATH"
test "$(command -v node)" = "$REVIEWED_NODE"
test "$(shasum -a 256 "$REVIEWED_NODE" | awk '{print $1}')" = "$REVIEWED_NODE_SHA256"
export NODE_BINARY="$REVIEWED_NODE"
export BUNDLE_PATH="$OWNED_CACHE/bundle"
export BUNDLE_USER_HOME="$OWNED_CACHE/bundle-home"
export BUNDLE_IGNORE_CONFIG=true
export GEMRC=/dev/null
export BUNDLE_FROZEN=true
export GRADLE_USER_HOME="$OWNED_CACHE/gradle"
export TMPDIR="$OWNED_CACHE/tmp"
mkdir -p "$TMPDIR"
unset EX_UPDATES_NATIVE_DEBUG
```

Run `bundle install` only in this disposable candidate with the frozen lock and isolated bundle
paths. `BUNDLE_FROZEN=true` makes Bundler refuse a changed resolution instead of rewriting the
committed lock. `GEMRC=/dev/null` replaces RubyGems' HOME configuration filename, and
`BUNDLE_IGNORE_CONFIG=true` suppresses Bundler's local and global configuration files. These do not
disable TLS verification or authenticate an installed gem graph. These source pins do not
authenticate installed gems or their native extensions. On this host, Ruby/OpenSSL needs
`SSL_CERT_FILE=/etc/ssl/cert.pem` to use the system CA bundle; certificate verification stays
enabled. CocoaPods must use the same Ruby and bundle environment. `nkf` and JSON below3 remain
explicit Gemfile compatibility requirements.

Before pod generation, prepare **both** Xcode environment files with the same reviewed Node path.
Keep an external exact-byte reference, refuse pre-existing overrides, and retain mode/digest checks:

```sh
test ! -e ios/.xcode.env
test ! -e ios/.xcode.env.local
test ! -e ios/.xcode.env.updates
(
  umask 077
  set -C
  printf 'export NODE_BINARY="%s"\n' "$REVIEWED_NODE" > "$OWNED_CACHE/xcode-node.env"
  cp "$OWNED_CACHE/xcode-node.env" ios/.xcode.env
  cp "$OWNED_CACHE/xcode-node.env" ios/.xcode.env.local
)
verify_xcode_node() {
  test ! -e ios/.xcode.env.updates &&
  cmp ios/.xcode.env "$OWNED_CACHE/xcode-node.env" &&
  cmp ios/.xcode.env.local "$OWNED_CACHE/xcode-node.env" &&
  test "$(stat -f %Lp ios/.xcode.env)" = 600 &&
  test "$(stat -f %Lp ios/.xcode.env.local)" = 600 &&
  test "$(command -v node)" = "$REVIEWED_NODE" &&
  test "$(shasum -a 256 "$REVIEWED_NODE" | awk '{print $1}')" = "$REVIEWED_NODE_SHA256"
}
verify_xcode_node
```

Run `verify_xcode_node` after pod generation and again after compilation. Preserve and review the
complete generated project delta against its released owners, including Expo and Hermes phases; the
maintained bundle phase must remain intact. Record the actual bundle phase's Node path/digest and
require equality with the prepared values. A version string alone does not prove binary identity.
Select an external Xcode DerivedData location in Xcode's Locations settings before Expo runs;
explicit `xcodebuild` callers use `-derivedDataPath` outside the checkout.

Select an available simulator with `xcrun simctl list devices available`. Choose an unused port with
`npm --silent run show:free-port`; the example uses 5300. From the disposable candidate directory,
start Metro:

```sh
"$REVIEWED_NODE" ../../node_modules/expo/bin/cli start --port 5300 --localhost --max-workers 2
```

In another terminal with the same package and Ruby environment, build and install:

```sh
NODE_BINARY="$REVIEWED_NODE" "$REVIEWED_NODE" ../../node_modules/expo/bin/cli run:ios \
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
NODE_BINARY="$REVIEWED_NODE" "$REVIEWED_NODE" ../../node_modules/expo/bin/cli run:ios \
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

Use the same independent full-source copy and reviewed Node24 PATH, JDK17 and an Android SDK
containing platform 36, Build Tools 35.0.0 and 36.0.0, NDK 27.1.12297006, CMake 3.30.5, and
platform-tools. The app selects Build Tools 36; Expo library compilation also consumes AGP's Build
Tools 35 default. Supply a disposable external keystore named `candidate-release.keystore` and its
signing values. The maintained candidate refuses a missing or project-local Release keystore.

From the disposable candidate directory, with reviewed `JAVA_HOME`, `ANDROID_HOME`, external
`GRADLE_USER_HOME` and signing variables set:

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
