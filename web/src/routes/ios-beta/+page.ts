// This route is web-only. It explains how to install the native iOS app, so it
// is pointless inside that app and its TestFlight invitation must not ship in
// the App Store binary.
//
// This flag drops the prerendered HTML. The build-time exclusion in
// web/nativeExcludedRoutes.ts separately drops the module source and its Apple
// enrollment links from the native JavaScript bundle. The post-build scan in
// tools/mobile/check-static-bundle.mjs guards both layers.
export const prerender = !__IS_CAPACITOR__;
