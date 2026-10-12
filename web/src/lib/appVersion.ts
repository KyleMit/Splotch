// `__APP_VERSION__` is a Vite compile-time constant (ADR-0010), so it is
// undefined in contexts that don't go through the app build (e.g. a bare unit
// test run) — hence the guard.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
