// The React Native app the stores ship: its identity, and where its native projects and
// release artifacts live, as paths relative to the repository root. The native projects
// declare the identity themselves (applicationId in android/app/build.gradle,
// PRODUCT_BUNDLE_IDENTIFIER in the Xcode project); tools/release/tests/native-app.test.mjs
// fails when either drifts from these values.
import { join } from 'node:path';

// The installed store app. Only a store build carries it (build-native-release.mjs).
export const STORE_APP_ID = 'art.splotch.app';
// Every other build, Release included, so a local install never replaces the store copy.
export const DEV_APP_ID = `${STORE_APP_ID}.dev`;

export const NATIVE_APP_DIR = join('.');
export const ANDROID_PROJECT_DIR = join(NATIVE_APP_DIR, 'android');
export const IOS_PROJECT_DIR = join(NATIVE_APP_DIR, 'ios');
export const IOS_PROJECT_NAME = 'Splotch';

const ANDROID_OUTPUTS = join(ANDROID_PROJECT_DIR, 'app', 'build', 'outputs');
export const RELEASE_AAB = join(ANDROID_OUTPUTS, 'bundle', 'release', 'app-release.aab');
export const RELEASE_APK = join(ANDROID_OUTPUTS, 'apk', 'release', 'app-release.apk');

const IOS_BUILD = join(IOS_PROJECT_DIR, 'build');
export const RELEASE_ARCHIVE = join(IOS_BUILD, `${IOS_PROJECT_NAME}.xcarchive`);
export const RELEASE_IPA_DIR = join(IOS_BUILD, 'ipa');
export const RELEASE_IPA = join(RELEASE_IPA_DIR, `${IOS_PROJECT_NAME}.ipa`);
