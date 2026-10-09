import {
  ANDROID_STORAGE_PERMISSION_REMOVALS,
  APPLE_BUNDLE_OVERRIDES,
  HERMES_COMPILER_VERSION,
  NATIVE_CONTRACT,
  RELEASE_KEYSTORE_NAME,
  RELEASE_SIGNING_PROPERTIES,
} from './native-source-contract.mjs';
import { transformAppleSceneDelegate, transformAppleScenePlist } from './native-apple-scene.mjs';

const OMITTED_NATIVE_MEMBERS = new Set([
  'package/android/gitignore',
  'package/android/gradlew.bat',
  'package/android/app/debug.keystore',
  'package/android/app/src/debug/AndroidManifest.xml',
  'package/android/app/src/debugOptimized/AndroidManifest.xml',
  'package/ios/gitignore',
  'package/ios/.xcode.env',
]);

const TRANSFORMATION_NAMES = new Map([
  ['package/android/app/build.gradle', 'candidate-release-contract'],
  ['package/android/gradle.properties', 'explicit-android-contract'],
  ['package/android/gradle/wrapper/gradle-wrapper.properties', 'pinned-wrapper-distribution'],
  ['package/android/app/src/main/java/com/helloworld/MainActivity.kt', 'candidate-kotlin-identity'],
  [
    'package/android/app/src/main/java/com/helloworld/MainApplication.kt',
    'candidate-kotlin-identity',
  ],
  [
    'package/android/app/src/main/AndroidManifest.xml',
    'reviewed-network-and-private-storage-policy',
  ],
  ['package/android/app/proguard-rules.pro', 'candidate-turbomodule-rules'],
  ['package/ios/Podfile', 'explicit-pod-contract'],
  ['package/ios/Podfile.properties.json', 'explicit-apple-contract'],
  ['package/ios/HelloWorld.xcodeproj/project.pbxproj', 'candidate-apple-identity-and-bundling'],
  ['package/ios/HelloWorld/AppDelegate.swift', 'reviewed-expo-scene-support'],
  ['package/ios/HelloWorld/Info.plist', 'reviewed-apple-network-and-scene-policy'],
  ['package/ios/HelloWorld/Images.xcassets/Contents.json', 'formatted-template-resource'],
  [
    'package/ios/HelloWorld/Images.xcassets/AppIcon.appiconset/Contents.json',
    'formatted-template-resource',
  ],
]);

export function templateTransformationName(path) {
  return TRANSFORMATION_NAMES.get(path) ?? 'unchanged';
}

export function requiresTemplateOriginalText(path) {
  return candidateTemplateTarget(path) !== null && templateTransformationName(path) !== 'unchanged';
}

export function assertRequiredTemplateMembers(paths) {
  for (const path of [...TRANSFORMATION_NAMES.keys(), ...OMITTED_NATIVE_MEMBERS]) {
    if (!paths.has(path)) throw new Error(`Required template recipe member is absent: ${path}`);
  }
}

export function candidateTemplateTarget(path) {
  if (OMITTED_NATIVE_MEMBERS.has(path)) return null;
  if (path === 'package/LICENSE') return 'TEMPLATE-LICENSE';
  if (!/^package\/(?:android|ios)\//.test(path)) return null;
  return path
    .slice('package/'.length)
    .replace(
      'app/src/main/java/com/helloworld/',
      `app/src/main/java/${NATIVE_CONTRACT.identity.replaceAll('.', '/')}/`
    );
}

function replaceExactly(source, search, replacement, label) {
  if (source.split(search).length !== 2)
    throw new Error(`Template transformation changed: ${label}`);
  return source.replace(search, replacement);
}

function androidApplicationSource() {
  const properties = RELEASE_SIGNING_PROPERTIES;
  return `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()
def releaseSigningNames = [${Object.values(properties)
    .map((name) => `'${name}'`)
    .join(', ')}]
def releaseSigning = releaseSigningNames.collect { findProperty(it) }
if (releaseSigning.any { !it }) {
    throw new GradleException("Candidate Release signing inputs are required")
}
def releaseStore = new File(releaseSigning[0].toString())
if (!releaseStore.isAbsolute() || !releaseStore.isFile() || releaseStore.canonicalPath.startsWith(projectRoot + File.separator) || releaseStore.name != '${RELEASE_KEYSTORE_NAME}') {
    throw new GradleException("Candidate Release keystore must be an external owned file")
}

react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
    reactNativeDir = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()
    hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
    codegenDir = new File(["node", "--print", "require.resolve('@react-native/codegen/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()
    cliFile = new File(["node", "--print", "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim())
    bundleCommand = "export:embed"
    autolinkLibrariesWithApp()
}

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion
    namespace "${NATIVE_CONTRACT.identity}"
    defaultConfig {
        applicationId "${NATIVE_CONTRACT.identity}"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", '"stable"'
    }
    signingConfigs {
        candidateRelease {
            storeFile releaseStore
            storePassword releaseSigning[1].toString()
            keyAlias releaseSigning[2].toString()
            keyPassword releaseSigning[3].toString()
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.candidateRelease
            shrinkResources true
            minifyEnabled true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
            crunchPngs true
        }
    }
    packagingOptions {
        jniLibs { useLegacyPackaging false }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.facebook.react:hermes-android")
}
`;
}

function androidProperties() {
  const android = NATIVE_CONTRACT.android;
  return `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
android.useAndroidX=true
android.minSdkVersion=${android.minSdk}
android.compileSdkVersion=${android.compileSdk}
android.targetSdkVersion=${android.targetSdk}
android.buildToolsVersion=${android.buildTools}
android.ndkVersion=${android.ndk}
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
newArchEnabled=true
hermesEnabled=true
edgeToEdgeEnabled=true
EX_DEV_CLIENT_NETWORK_INSPECTOR=false
expo.useLegacyPackaging=false
`;
}

function appleBundlePhase() {
  return `set -eu
case "$CONFIGURATION" in
  Debug|Release) ;;
  *) echo "Candidate bundle phase requires Debug or Release" >&2; exit 1 ;;
esac
if [ "$CONFIGURATION" = Release ]; then
  if ${APPLE_BUNDLE_OVERRIDES.map((name) => `[ -n "\${${name}:-}" ]`).join(' || ')}; then
    echo "Candidate bundling overrides are forbidden" >&2
    exit 1
  fi
fi
case "\${USE_HERMES:-true}" in
  true) export USE_HERMES=true ;;
  *) echo "Candidate requires Hermes" >&2; exit 1 ;;
esac
case "\${NODE_BINARY:-}" in
  /*) test -x "$NODE_BINARY" ;;
  *) echo "Candidate NODE_BINARY must be owned and absolute" >&2; exit 1 ;;
esac
test "$("$NODE_BINARY" --version)" = "${NATIVE_CONTRACT.nodeVersion}" || {
  echo "Candidate NODE_BINARY must be the reviewed Node version" >&2
  exit 1
}
export PROJECT_ROOT="$(cd "$PROJECT_DIR/.." && pwd -P)"
cd "$PROJECT_ROOT"
HERMES_COMPILER_PACKAGE="$("$NODE_BINARY" --print "require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })")"
test "$("$NODE_BINARY" --print "require(process.argv[1]).version" "$HERMES_COMPILER_PACKAGE")" = "${HERMES_COMPILER_VERSION}"
HERMES_EXPECTED="$("$NODE_BINARY" --print "require('fs').realpathSync(require('path').join(require('path').dirname(process.argv[1]), 'hermesc/osx-bin/hermesc'))" "$HERMES_COMPILER_PACKAGE")"
if [ -n "\${HERMES_CLI_PATH:-}" ]; then
  HERMES_ACTUAL="$("$NODE_BINARY" --print "require('fs').realpathSync(process.argv[1])" "$HERMES_CLI_PATH")"
  if [ "$HERMES_ACTUAL" != "$HERMES_EXPECTED" ]; then
    echo "Candidate Hermes compiler override is forbidden" >&2
    exit 1
  fi
fi
test -x "$HERMES_EXPECTED"
export HERMES_CLI_PATH="$HERMES_EXPECTED"
export ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
test "$ENTRY_FILE" = "$PROJECT_ROOT/${NATIVE_CONTRACT.entry}"
export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })")"
export BUNDLE_COMMAND="export:embed"
REACT_NATIVE_XCODE="$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"
/bin/sh "$REACT_NATIVE_XCODE"
`;
}

function appleProject(source) {
  let result = source.replaceAll(
    'PRODUCT_BUNDLE_IDENTIFIER = org.name.HelloWorld;',
    `PRODUCT_BUNDLE_IDENTIFIER = ${NATIVE_CONTRACT.identity};`
  );
  result = replaceExactly(
    result,
    '"$(SRCROOT)/.xcode.env",\n\t\t\t\t"$(SRCROOT)/.xcode.env.local",',
    `"$(PROJECT_DIR)/../${NATIVE_CONTRACT.entry}",\n\t\t\t\t"$(PROJECT_DIR)/../package.json",`,
    'Apple bundle inputs'
  );
  const phase = /shellScript = "if \[\[ -f \\"\$PODS_ROOT\/\.\.\/\.xcode\.env\\".*?";/;
  if ((result.match(phase) ?? []).length !== 1) throw new Error('Template bundle phase changed');
  result = result.replace(phase, `shellScript = ${JSON.stringify(appleBundlePhase())};`);
  return result;
}

function androidManifest(source) {
  let result = source.replace(/\n\s*<!--.*?-->/gs, '');
  result = result.replace(
    /\n\s*<uses-permission\s+android:name="android\.permission\.(?:SYSTEM_ALERT_WINDOW|VIBRATE)"[^>]*\/>/g,
    ''
  );
  for (const permission of ANDROID_STORAGE_PERMISSION_REMOVALS) {
    result = replaceExactly(
      result,
      `<uses-permission android:name="${permission}" android:maxSdkVersion="32" tools:replace="android:maxSdkVersion"/>`,
      `<uses-permission android:name="${permission}" tools:node="remove"/>`,
      `Android storage permission removal: ${permission}`
    );
  }
  return result.replace(/\n\s*<queries>.*?<\/queries>/s, '');
}

function applePodfile(source) {
  let result = replaceExactly(
    source,
    "podfile_properties = JSON.parse(File.read(File.join(__dir__, 'Podfile.properties.json'))) rescue {}",
    "podfile_properties = JSON.parse(File.read(File.join(__dir__, 'Podfile.properties.json')))",
    'Pod properties'
  );
  result = replaceExactly(
    result,
    "ENV['EX_DEV_CLIENT_NETWORK_INSPECTOR'] ||= podfile_properties['EX_DEV_CLIENT_NETWORK_INSPECTOR']",
    "ENV['EX_DEV_CLIENT_NETWORK_INSPECTOR'] = 'false'",
    'Pod inspector'
  );
  result = replaceExactly(
    result,
    "platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'",
    "platform :ios, podfile_properties.fetch('ios.deploymentTarget')",
    'Pod deployment'
  );
  return replaceExactly(
    result,
    ":privacy_file_aggregation_enabled => podfile_properties['apple.privacyManifestAggregationEnabled'] != 'false'",
    ':privacy_file_aggregation_enabled => true',
    'Pod privacy aggregation'
  );
}

export function transformTemplateMember(path, bytes) {
  let source = bytes.toString('utf8');
  const change = templateTransformationName(path);
  if (path === 'package/android/app/build.gradle') source = androidApplicationSource();
  else if (path === 'package/android/gradle.properties') source = androidProperties();
  else if (path === 'package/android/gradle/wrapper/gradle-wrapper.properties')
    source += `distributionSha256Sum=${NATIVE_CONTRACT.gradle.distributionSha256}\n`;
  else if (path.endsWith('/MainActivity.kt') || path.endsWith('/MainApplication.kt'))
    source = replaceExactly(
      source,
      'package com.helloworld\n',
      `package ${NATIVE_CONTRACT.identity}\n`,
      'Kotlin package'
    );
  else if (path === 'package/android/app/src/main/AndroidManifest.xml')
    source = androidManifest(source);
  else if (path === 'package/android/app/proguard-rules.pro')
    source = '-keep class com.facebook.react.turbomodule.** { *; }\n';
  else if (path === 'package/ios/Podfile') source = applePodfile(source);
  else if (path === 'package/ios/Podfile.properties.json')
    source =
      JSON.stringify(
        {
          'expo.jsEngine': 'hermes',
          EX_DEV_CLIENT_NETWORK_INSPECTOR: 'false',
          'ios.deploymentTarget': NATIVE_CONTRACT.ios.deploymentTarget,
        },
        null,
        2
      ) + '\n';
  else if (path === 'package/ios/HelloWorld.xcodeproj/project.pbxproj')
    source = appleProject(source);
  else if (path === 'package/ios/HelloWorld/AppDelegate.swift')
    source = transformAppleSceneDelegate(source);
  else if (path === 'package/ios/HelloWorld/Info.plist')
    source = transformAppleScenePlist(
      replaceExactly(
        source,
        '<key>NSAllowsLocalNetworking</key>\n\t\t<true/>',
        '<key>NSAllowsLocalNetworking</key>\n\t\t<false/>',
        'Apple local network'
      )
    );
  else if (change === 'formatted-template-resource')
    source = JSON.stringify(JSON.parse(source), null, 2) + '\n';
  return { bytes: change === 'unchanged' ? bytes : Buffer.from(source), change };
}
