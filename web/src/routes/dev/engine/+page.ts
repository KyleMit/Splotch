// Dev-only test harness for the imperative drawing engine. It mounts a real
// canvas through the real initDrawingCanvas() seam and exposes the engine's
// public API on window so the Playwright engine spec can drive it and read
// pixels back.

// The page is entirely client-side — it reads `window` at component init to
// wire the harness globals the Playwright spec drives. Under `vite dev`
// (DEV_SERVER=1 npm run test:e2e) the route would otherwise SSR and throw
// `ReferenceError: window is not defined` → a 500 that never yields
// `__engineReady`. Disabling SSR keeps the harness client-only in every flow.
export const ssr = false;
