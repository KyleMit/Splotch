// The supported web-browser floor is declared only here and pinned explicitly
// so it never silently drifts with Vite's default (`baseline-widely-available`
// moves up every year). INVARIANT: the ios/safari versions here MUST stay <=
// the native iOS IPHONEOS_DEPLOYMENT_TARGET (ios/App/App.xcodeproj) — the
// native app serves this exact bundle to every device that can install it, so
// a web floor newer than the deployment target ships syntax/CSS an installable
// device's WebView can't run. Enforced by web/src/browserFloor.test.ts.
export const BROWSER_TARGETS = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];
