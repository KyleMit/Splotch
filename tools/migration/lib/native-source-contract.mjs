import { createHash } from 'node:crypto';
import { assertAppleSceneContract } from './native-apple-scene.mjs';

export const NATIVE_CONTRACT = Object.freeze({
  identity: 'art.splotch.migration.probe',
  entry: 'src/index.ts',
  module: 'main',
  nodeVersion: 'v24.16.0',
  android: Object.freeze({
    minSdk: 24,
    compileSdk: 36,
    targetSdk: 36,
    buildTools: '36.0.0',
    ndk: '27.1.12297006',
  }),
  ios: Object.freeze({ deploymentTarget: '16.4', scheme: 'HelloWorld' }),
  gradle: Object.freeze({
    distributionUrl: 'https://services.gradle.org/distributions/gradle-9.3.1-bin.zip',
    distributionSha256: 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06',
    wrapperSha256: 'b3a875ddc1f044746e1b1a55f645584505f4a10438c1afea9f15e92a7c42ec13',
  }),
});

export const RELEASE_SIGNING_PROPERTIES = Object.freeze({
  storeFile: 'splotch.probe.release.storeFile',
  storePassword: 'splotch.probe.release.storePassword',
  keyAlias: 'splotch.probe.release.keyAlias',
  keyPassword: 'splotch.probe.release.keyPassword',
});

export const RELEASE_KEYSTORE_NAME = 'candidate-release.keystore';

export const APPLE_BUNDLE_OVERRIDES = Object.freeze([
  'ENTRY_FILE',
  'CLI_PATH',
  'BUNDLE_COMMAND',
  'SKIP_BUNDLING',
  'EXTRA_PACKAGER_ARGS',
  'BUNDLE_CONFIG',
  'CONFIG_JSON',
  'CONFIG_CMD',
  'NODE_ARGS',
  'SOURCEMAP_FILE',
  'BUNDLE_NAME',
  'COMPOSE_SOURCEMAP_PATH',
]);

export const HERMES_COMPILER_VERSION = '250829098.0.17';

const ANDROID_MANIFEST_TOOLS_NAMESPACE = 'http://schemas.android.com/tools';
export const ANDROID_STORAGE_PERMISSION_REMOVALS = Object.freeze([
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

const SHIPPING_IDENTITY = 'art.splotch.app';
const KOTLIN_DIRECTORY = `android/app/src/main/java/${NATIVE_CONTRACT.identity.replaceAll('.', '/')}`;

function text(files, path) {
  const value = files.get(path);
  if (!Buffer.isBuffer(value)) throw new Error(`Missing maintained native source: ${path}`);
  return value.toString('utf8');
}

function requireMatch(source, expression, label) {
  if (!expression.test(source)) throw new Error(`Native contract mismatch: ${label}`);
}

function requireCount(source, expression, count, label) {
  const matches = source.match(expression) ?? [];
  if (matches.length !== count) throw new Error(`Native contract mismatch: ${label}`);
}

function properties(source) {
  const result = new Map();
  for (const line of source.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) throw new Error('Invalid native properties');
    const name = line.slice(0, index).trim();
    if (result.has(name)) throw new Error(`Duplicate native property: ${name}`);
    result.set(
      name,
      line
        .slice(index + 1)
        .trim()
        .replaceAll('\\:', ':')
    );
  }
  return result;
}

function requireProperties(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual.get(key) !== String(value))
      throw new Error(`Native contract mismatch: ${label}.${key}`);
  }
}

function assertAndroidProperties(files) {
  const android = NATIVE_CONTRACT.android;
  requireProperties(
    properties(text(files, 'android/gradle.properties')),
    {
      'android.minSdkVersion': android.minSdk,
      'android.compileSdkVersion': android.compileSdk,
      'android.targetSdkVersion': android.targetSdk,
      'android.buildToolsVersion': android.buildTools,
      'android.ndkVersion': android.ndk,
      newArchEnabled: true,
      hermesEnabled: true,
      EX_DEV_CLIENT_NETWORK_INSPECTOR: false,
    },
    'android'
  );
  requireProperties(
    properties(text(files, 'android/gradle/wrapper/gradle-wrapper.properties')),
    {
      distributionUrl: NATIVE_CONTRACT.gradle.distributionUrl,
      distributionSha256Sum: NATIVE_CONTRACT.gradle.distributionSha256,
      validateDistributionUrl: true,
      distributionBase: 'GRADLE_USER_HOME',
      zipStoreBase: 'GRADLE_USER_HOME',
    },
    'wrapper'
  );
  const wrapper = files.get('android/gradle/wrapper/gradle-wrapper.jar');
  if (
    !wrapper ||
    createHash('sha256').update(wrapper).digest('hex') !== NATIVE_CONTRACT.gradle.wrapperSha256
  )
    throw new Error('Candidate Gradle wrapper JAR changed');
}

function assertAndroidApplication(files) {
  const source = text(files, 'android/app/build.gradle');
  for (const declaration of ['namespace', 'applicationId']) {
    requireMatch(
      source,
      new RegExp(`${declaration} "${NATIVE_CONTRACT.identity.replaceAll('.', '\\.')}"`),
      declaration
    );
  }
  for (const expression of [
    /entryFile = file\(\["node", "-e", "require\('expo\/scripts\/resolveAppEntry'\)"/,
    /getParentFile\(\)\.getAbsolutePath\(\)/,
    /bundleCommand = "export:embed"/,
    /autolinkLibrariesWithApp\(\)/,
    /minSdkVersion rootProject\.ext\.minSdkVersion/,
    /targetSdkVersion rootProject\.ext\.targetSdkVersion/,
    /compileSdk rootProject\.ext\.compileSdkVersion/,
    /buildToolsVersion rootProject\.ext\.buildToolsVersion/,
    /ndkVersion rootProject\.ext\.ndkVersion/,
    /signingConfig signingConfigs\.candidateRelease/,
    /shrinkResources true/,
    /minifyEnabled true/,
    /getDefaultProguardFile\("proguard-android-optimize\.txt"\)/,
    /throw new GradleException\("Candidate Release signing inputs are required"\)/,
  ])
    requireMatch(source, expression, 'Android Release');
  for (const name of Object.values(RELEASE_SIGNING_PROPERTIES)) {
    if (!source.includes(`'${name}'`)) throw new Error(`Missing Release signing owner: ${name}`);
  }
  if (/debug\.keystore|androiddebugkey|signingConfigs\.debug|jsc-android/.test(source)) {
    throw new Error('Candidate contains a debug signing or JSC route');
  }
  if (/reanimated|worklets|graphite/i.test(text(files, 'android/app/proguard-rules.pro')))
    throw new Error('Unused native dependency rule');
  for (const name of ['MainActivity', 'MainApplication']) {
    const kotlin = text(files, `${KOTLIN_DIRECTORY}/${name}.kt`);
    requireMatch(
      kotlin,
      new RegExp(`^package ${NATIVE_CONTRACT.identity.replaceAll('.', '\\.')}\\n`),
      'Kotlin package'
    );
    if (name === 'MainActivity')
      requireMatch(kotlin, /getMainComponentName\(\): String = "main"/, 'Android module');
    else {
      requireMatch(kotlin, /ExpoReactHostFactory\.getDefaultReactHost/, 'Expo ReactHost');
      requireMatch(kotlin, /ApplicationLifecycleDispatcher\.onApplicationCreate/, 'Expo lifecycle');
    }
  }
}

function assertAndroidManifest(files) {
  const manifest = text(files, 'android/app/src/main/AndroidManifest.xml');
  requireCount(
    manifest,
    new RegExp(`xmlns:tools="${ANDROID_MANIFEST_TOOLS_NAMESPACE.replaceAll('.', '\\.')}"`, 'g'),
    1,
    'Android manifest tools namespace'
  );
  requireCount(
    manifest,
    /<uses-permission\s+android:name="android.permission.INTERNET"\s*\/>/g,
    1,
    'network permission'
  );
  for (const permission of ANDROID_STORAGE_PERMISSION_REMOVALS) {
    requireCount(
      manifest,
      new RegExp(
        `<uses-permission\\s+android:name="${permission.replaceAll('.', '\\.')}"\\s+tools:node="remove"\\s*\\/>`,
        'g'
      ),
      1,
      `storage permission removal: ${permission}`
    );
  }
  if (
    (manifest.match(/<uses-permission\b/g) ?? []).length !==
      1 + ANDROID_STORAGE_PERMISSION_REMOVALS.length ||
    /<queries\b|usesCleartextTraffic="true"/.test(manifest)
  ) {
    throw new Error('Unreviewed Android permission, query or cleartext policy');
  }
  for (const [path, bytes] of files) {
    if (
      path.startsWith('android/') &&
      path.endsWith('AndroidManifest.xml') &&
      path !== 'android/app/src/main/AndroidManifest.xml'
    ) {
      if (/<uses-permission\b|usesCleartextTraffic="true"/.test(bytes.toString('utf8'))) {
        throw new Error(`Unreviewed Android manifest overlay: ${path}`);
      }
    }
  }
}

function assertAppleProject(files) {
  const project = text(files, 'ios/HelloWorld.xcodeproj/project.pbxproj');
  requireCount(project, /IPHONEOS_DEPLOYMENT_TARGET = /g, 4, 'Apple deployment field set');
  requireCount(project, /PRODUCT_BUNDLE_IDENTIFIER = /g, 2, 'Apple identifier field set');
  requireCount(
    project,
    new RegExp(
      `IPHONEOS_DEPLOYMENT_TARGET = ${NATIVE_CONTRACT.ios.deploymentTarget.replaceAll('.', '\\.')};`,
      'g'
    ),
    4,
    'all Apple deployment settings'
  );
  requireCount(
    project,
    new RegExp(
      `PRODUCT_BUNDLE_IDENTIFIER = ${NATIVE_CONTRACT.identity.replaceAll('.', '\\.')};`,
      'g'
    ),
    2,
    'all Apple identifiers'
  );
  const delegate = text(files, 'ios/HelloWorld/AppDelegate.swift');
  requireMatch(
    delegate,
    /Bundle\.main\.url\(forResource: "main", withExtension: "jsbundle"\)/,
    'Apple Release bundle'
  );
  for (const expression of [
    /require\('expo\/scripts\/resolveAppEntry'\)/,
    /export:embed/,
    /react-native-xcode\.sh/,
    /Candidate bundling overrides are forbidden/,
    /Candidate requires Hermes/,
    /Candidate Hermes compiler override is forbidden/,
  ])
    requireMatch(project, expression, 'Apple bundle phase');
  for (const name of APPLE_BUNDLE_OVERRIDES) {
    const selector = JSON.stringify(`"\${${name}:-}"`).slice(1, -1);
    if (!project.includes(selector))
      throw new Error(`Native contract mismatch: Apple override guard ${name}`);
  }
  requireMatch(project, /export USE_HERMES=true/, 'Apple Hermes engine');
  requireMatch(project, /export HERMES_CLI_PATH=/, 'Apple Hermes compiler');
  if (!project.includes(HERMES_COMPILER_VERSION))
    throw new Error('Native contract mismatch: Apple Hermes compiler version');
  const nodeGuard = JSON.stringify(
    `test "$("$NODE_BINARY" --version)" = "${NATIVE_CONTRACT.nodeVersion}"`
  ).slice(1, -1);
  if (!project.includes(nodeGuard)) throw new Error('Native contract mismatch: Apple Node version');
  if (
    /source .*xcode\.env|\.xcode\.env\.local|\.xcode\.env\.updates|export SKIP_BUNDLING=1/.test(
      project
    )
  ) {
    throw new Error('Unowned Apple bundle environment override');
  }
  const podfile = text(files, 'ios/Podfile');
  requireMatch(
    podfile,
    /platform :ios, podfile_properties\.fetch\('ios\.deploymentTarget'\)/,
    'Pod deployment owner'
  );
  requireMatch(podfile, /privacy_file_aggregation_enabled => true/, 'Pod privacy aggregation');
  const podProperties = JSON.parse(text(files, 'ios/Podfile.properties.json'));
  for (const [key, value] of Object.entries({
    'ios.deploymentTarget': NATIVE_CONTRACT.ios.deploymentTarget,
    'expo.jsEngine': 'hermes',
    EX_DEV_CLIENT_NETWORK_INSPECTOR: 'false',
  })) {
    if (podProperties[key] !== value) throw new Error(`Native contract mismatch: Pod.${key}`);
  }
  const plist = text(files, 'ios/HelloWorld/Info.plist');
  assertAppleSceneContract(delegate, plist);
  if (/<key>NSAllows(?:ArbitraryLoads|LocalNetworking)<\/key>\s*<true\/>/.test(plist)) {
    throw new Error('Unreviewed Apple ATS exception');
  }
}

export function assertNativeSourceContract(files, packageManifest, indexSource) {
  if (packageManifest.main !== NATIVE_CONTRACT.entry)
    throw new Error('Candidate JavaScript entry changed');
  requireMatch(
    indexSource,
    /import \{ registerRootComponent \} from 'expo';/,
    'Expo JS registration owner'
  );
  requireMatch(indexSource, /registerRootComponent\(ProbeApp\);/, 'Expo JS registration');
  for (const [path, bytes] of files) {
    if (
      path.includes('debug.keystore') ||
      /\.xcode\.env\.(?:local|updates)$/.test(path) ||
      path.endsWith('.entitlements')
    ) {
      throw new Error(`Unreviewed native source: ${path}`);
    }
    if (
      /\.(?:kt|swift|gradle|properties|plist|pbxproj|xml)$/.test(path) &&
      bytes.includes(SHIPPING_IDENTITY)
    ) {
      throw new Error(`Shipping identity in candidate source: ${path}`);
    }
  }
  assertAndroidProperties(files);
  assertAndroidApplication(files);
  assertAndroidManifest(files);
  assertAppleProject(files);
}
