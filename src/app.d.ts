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
}

export {};
