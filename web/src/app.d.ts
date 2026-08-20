// See https://svelte.dev/docs/kit/types#app.d.ts for the App namespace.
declare global {
  namespace App {
    // Pins the shape both hooks.client.ts's and hooks.server.ts's `handleError`
    // already return: `{ message: GENERIC_ERROR_MESSAGE }`.
    interface Error {
      message: string;
    }

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
  // Build-flag (PUBLIC_ENABLE_DEV_HARNESS=true) that keeps test/profiling
  // seams in opted-in bundles. Literal false in release builds.
  const __DEV_HARNESS__: boolean;

  // Capacitor injects this global in the native shell and once @capacitor/core
  // loads on the web. Read off the global (see src/lib/platform/index.ts) so the
  // module stays SSR-safe; declared optional because it's absent under Node.

  var Capacitor: { isNativePlatform?: () => boolean; getPlatform?: () => string } | undefined;

  // File System Access API — used by lib/drawing/folderSave.ts for silent
  // folder saves on desktop Chromium. The bundled TS lib doesn't declare the
  // picker, and queryPermission/requestPermission aren't on the standard handle
  // types, so declare only the surface we touch. skipLibCheck smooths over any
  // overlap with the partial built-in types.
  type FileSystemPermissionMode = 'read' | 'readwrite';

  // Chromium-only event; not in the default TS DOM lib.
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  interface NetworkInformation {
    saveData?: boolean;
  }

  interface Navigator {
    connection?: NetworkInformation;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }

  interface DocumentEventMap {
    resume: Event;
  }

  interface Window {
    // Read-only test/profiling seam, installed by lib/boot/devHarnessSeam.ts in
    // builds compiled with PUBLIC_ENABLE_DEV_HARNESS or PERF_MARKS
    // (ADRs 0080/0086) — hence optional: release builds never define it.
    __committedBrushMode?: () => import('$lib/state/tool.svelte').BrushType;
    showDirectoryPicker(options?: {
      mode?: FileSystemPermissionMode;
      startIn?: string;
    }): Promise<FileSystemDirectoryHandle>;
    // Read-only profiling seam, installed by the same gated boot step as
    // __committedBrushMode (ADRs 0083/0085/0086) — see lib/boot/devHarnessSeam.ts.
    __drawingDebug?: {
      getDrawingWorkDebug: typeof import('$lib/drawing/engine').getDrawingWorkDebug;
      getLiveSurfaceTopology: typeof import('$lib/drawing/engine').getLiveSurfaceTopology;
      getUndoDebug: typeof import('$lib/drawing/engine').getUndoDebug;
    };
    // Dev-gated invoke handle for the production AI flow (ADR-0109).
    __aiGenerate?: typeof import('$lib/drawing/aiImage').generateAiImage;
    // Dev-gated engine-rendered stroke replay for store hero captures (ADR-0122).
    __replayStroke?: typeof import('$lib/boot/devHarnessSeam').replayStoreDrawingStroke;
    // Instrumented-build persistence boundary for native screenshot profiling.
    // The release bundle drops both the branch and this property name.
    __screenshotSaveSink?: (blob: Blob, baseName: string) => void | Promise<void>;
    // Set before boot by the store-asset generator, read through
    // lib/storeCapture.ts — the one seam the app takes an input on, and the
    // release bundle drops it with its readers.
    __storeCapture?: boolean;
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
