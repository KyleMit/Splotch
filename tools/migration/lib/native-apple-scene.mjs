import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const EXPO_SCENE_CLASS = 'EXExpoAppSceneDelegate';
const FACTORY_PROVIDER = 'ExpoReactNativeFactoryProvider';
const ORIGINAL_APP_DELEGATE = 'class AppDelegate: ExpoAppDelegate {';
const SCENE_APP_DELEGATE = `class AppDelegate: ExpoAppDelegate, ${FACTORY_PROVIDER} {`;
const LEGACY_STARTUP = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

`;
const LAUNCH_STORYBOARD = '\t<key>UILaunchStoryboardName</key>\n\t<string>SplashScreen</string>';
export const SCENE_MANIFEST_XML = `\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t\t<key>UISceneConfigurations</key>
\t\t<dict>
\t\t\t<key>UIWindowSceneSessionRoleApplication</key>
\t\t\t<array>
\t\t\t\t<dict>
\t\t\t\t\t<key>UISceneConfigurationName</key>
\t\t\t\t\t<string>Default Configuration</string>
\t\t\t\t\t<key>UISceneDelegateClassName</key>
\t\t\t\t\t<string>${EXPO_SCENE_CLASS}</string>
\t\t\t\t</dict>
\t\t\t</array>
\t\t</dict>
\t</dict>`;
const OPEN_URL_FORWARD =
  '    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';
const USER_ACTIVITY_FORWARD = `    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result`;

// These sources own cold launch options, warm-link deduplication and scene lifecycle forwarding.
const EXPO_SCENE_SOURCE_SHA256 = Object.freeze({
  'ios/AppDelegates/ExpoAppSceneDelegate.swift':
    'eb614d63c4d2c571da2a34af2666c861c99ff938bd6c93dee82e3e73a03b29bf',
  'ios/AppDelegates/ExpoReactNativeFactoryProvider.swift':
    '2e49994074c7fb4b5b7c496c51a255ff98787523c45e1ab446029532c39e774a',
  'ios/AppDelegates/SceneEventForwarder.swift':
    '12177396ef45d5573aaff31e273a898f7fda7c9833de37154dc8c51b83afa221',
});

function requireOnce(source, value, label) {
  if (source.split(value).length !== 2) throw new Error(`Native scene contract mismatch: ${label}`);
}

function replacePreimage(source, preimage, replacement, label) {
  if (source.split(preimage).length !== 2)
    throw new Error(`Template scene preimage changed: ${label}`);
  return source.replace(preimage, replacement);
}

export function transformAppleSceneDelegate(source) {
  const provider = replacePreimage(
    source,
    ORIGINAL_APP_DELEGATE,
    SCENE_APP_DELEGATE,
    'AppDelegate'
  );
  return replacePreimage(provider, LEGACY_STARTUP, '', 'legacy startup');
}

export function transformAppleScenePlist(source) {
  if (source.includes('UIApplicationSceneManifest'))
    throw new Error('Template scene manifest already exists');
  return replacePreimage(
    source,
    LAUNCH_STORYBOARD,
    `${SCENE_MANIFEST_XML}\n${LAUNCH_STORYBOARD}`,
    'launch storyboard'
  );
}

export function assertAppleSceneContract(delegate, plist) {
  requireOnce(delegate, SCENE_APP_DELEGATE, 'provider');
  for (const [statement, label] of [
    ['  var window: UIWindow?', 'window'],
    ['    let factory = ExpoReactNativeFactory(delegate: delegate)', 'factory creation'],
    ['    reactNativeFactory = factory', 'factory storage'],
    [
      '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
      'launch superclass',
    ],
    [OPEN_URL_FORWARD, 'warm URL forwarding'],
    [USER_ACTIVITY_FORWARD, 'user activity forwarding'],
  ])
    requireOnce(delegate, statement, label);
  if (
    /UIWindow\(frame:|startReactNative\(|reactNativeFactoryModuleName|UIWindowSceneDelegate|SceneEventForwarder|\bfunc scene\b|applicationDidBecomeActive|applicationWillResignActive|applicationWillEnterForeground|applicationDidEnterBackground/.test(
      delegate
    )
  )
    throw new Error('Native scene contract mismatch: duplicate startup or event owner');
  requireOnce(plist, SCENE_MANIFEST_XML, 'single-scene manifest');
  for (const key of [
    'UIApplicationSceneManifest',
    'UIApplicationSupportsMultipleScenes',
    'UISceneConfigurations',
    'UIWindowSceneSessionRoleApplication',
    'UISceneConfigurationName',
    'UISceneDelegateClassName',
  ])
    requireOnce(plist, `<key>${key}</key>`, 'single-scene key');
  requireOnce(plist, LAUNCH_STORYBOARD, 'launch storyboard');
}

function readExpoSceneFile(expoRoot, path) {
  const file = join(expoRoot, path);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(file) !== file)
    throw new Error(`Unowned Expo scene source: ${path}`);
  return readFileSync(file);
}

export function readExpoSceneSupport(candidate, expectedVersion, expectedModule) {
  const require = createRequire(join(candidate, 'package.json'));
  const packagePath = realpathSync(require.resolve('expo/package.json'));
  const expoRoot = dirname(packagePath);
  const metadata = JSON.parse(readExpoSceneFile(expoRoot, 'package.json'));
  if (
    typeof expectedVersion !== 'string' ||
    metadata.name !== 'expo' ||
    metadata.version !== expectedVersion
  )
    throw new Error('Installed Expo scene version differs from candidate pin');
  const sources = Object.entries(EXPO_SCENE_SOURCE_SHA256).map(([path, expectedSha256]) => {
    const bytes = readExpoSceneFile(expoRoot, path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expectedSha256) throw new Error(`Reviewed Expo scene source changed: ${path}`);
    return { path, sha256 };
  });
  const provider = readExpoSceneFile(
    expoRoot,
    'ios/AppDelegates/ExpoReactNativeFactoryProvider.swift'
  ).toString('utf8');
  requireOnce(provider, `return "${expectedModule}"`, 'default module');
  return { version: metadata.version, defaultModule: expectedModule, sources };
}
