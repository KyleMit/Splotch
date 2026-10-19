// What the web shell's boot script and style (tools/migration/prerender-native-web.mjs) and the app
// agree on about the prerendered first frame. The build imports these values, so both sides read one
// declaration.

// The shell defines this property as the paper texture's data URI; the paper falls back to the
// texture file wherever it is undefined (the not-found shell).
export const PAPER_TEXTURE_PROPERTY = '--paper-texture';
// The drawing paper's input element, where the boot script plays its pre-engine burst.
export const PAPER_INPUT_TEST_ID = 'drawing-paper';
// Stamped on <html> once the drawing engine listens, and once the drawing controls do; until then
// the shell answers touches itself and keeps them from the app.
export const DRAWING_LIVE_ATTRIBUTE = 'data-drawing-live';
export const CONTROLS_LIVE_ATTRIBUTE = 'data-controls-live';
// The window property where the boot script keeps the pointers down on the paper before the engine
// listens, by pointer id, so the engine can take each one over where it is.
export const EARLY_POINTERS_GLOBAL = '__splotchEarlyPointers';
