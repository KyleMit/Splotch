// See https://svelte.dev/docs/kit/types#app.d.ts for the App namespace.
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}

    // The Netlify adapter exposes the function invocation context here.
    // `waitUntil` keeps the function alive past the response for background
    // work (see generate-image's usage write); both are optional because
    // local dev (`vite dev`) has no Netlify context at all.
    interface Platform {
      context?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  }

  // Compile-time constants injected by `define` in vite.config.js. Code guards
  // them with `typeof __X__ !== 'undefined'`, so they're declared (not assumed
  // present) — `const` is enough for type-checking those guards.
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
  const __NATIVE_API_BASE__: string;
  const __IS_CAPACITOR__: boolean;
  // Build-flag (PERF_MARKS=true) that enables the drawing engine's user-timing
  // marks for the profiling harness. Literal false in normal builds, so the
  // guarded blocks dead-code-eliminate and never reach production.
  const __PERF_MARKS__: boolean;

  // Capacitor injects this global in the native shell and once @capacitor/core
  // loads on the web. Read off the global (see src/lib/platform.ts) so the
  // module stays SSR-safe; declared optional because it's absent under Node.

  var Capacitor: { isNativePlatform?: () => boolean; getPlatform?: () => string } | undefined;

  // File System Access API — used by lib/drawing/folderSave.ts for silent
  // folder saves on desktop Chromium. The bundled TS lib doesn't declare the
  // picker, and queryPermission/requestPermission aren't on the standard handle
  // types, so declare only the surface we touch. skipLibCheck smooths over any
  // overlap with the partial built-in types.
  type FileSystemPermissionMode = 'read' | 'readwrite';

  interface Window {
    showDirectoryPicker(options?: {
      mode?: FileSystemPermissionMode;
      startIn?: string;
    }): Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream {
    write(data: Blob | BufferSource | string): Promise<void>;
    close(): Promise<void>;
  }
}

export {};
