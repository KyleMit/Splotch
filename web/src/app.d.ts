// See https://svelte.dev/docs/kit/types#app.d.ts for the App namespace.
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Compile-time constants injected by `define` in vite.config.js. Code guards
  // them with `typeof __X__ !== 'undefined'`, so they're declared (not assumed
  // present) — `const` is enough for type-checking those guards.
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
  const __NATIVE_API_BASE__: string;
  const __IS_CAPACITOR__: boolean;

  // Capacitor injects this global in the native shell and once @capacitor/core
  // loads on the web. Read off the global (see src/lib/platform.ts) so the
  // module stays SSR-safe; declared optional because it's absent under Node.
  // eslint-disable-next-line no-var
  var Capacitor:
    | { isNativePlatform?: () => boolean; getPlatform?: () => string }
    | undefined;
}

export {};
