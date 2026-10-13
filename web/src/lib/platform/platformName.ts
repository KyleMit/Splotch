// The deployment platforms, in a module of their own so a pure layer (notchBand.ts, and the native
// app that imports it) can name one without importing the browser-bound platform index.
export type Platform = 'android' | 'ios' | 'web';
