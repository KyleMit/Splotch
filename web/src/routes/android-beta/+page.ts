// This route is web-only. It explains how to install the native Android app, so
// it is pointless inside that app — and its Play Store links inside an iOS
// binary are an App Review 2.3.10 rejection.
//
// Two layers keep it out of the native export, because they drop different
// things. This flag drops the prerendered HTML (adapter-static's `strict: false`
// allows the gap, the same way /api, /admin, and /dev are skipped; the root
// +layout.ts turns prerendering on for everything, so the override is what
// creates it). The build-time exclusion in web/nativeExcludedRoutes.ts drops the
// module *source*, which is what keeps the Play Store URLs, the testers' group
// link, and the support address out of the shipped JS chunk.
//
// tools/native/check-native-bundle.mjs scans the built native output for those
// strings and fails the build if either layer stops working.
export const prerender = !__IS_CAPACITOR__;
