// The Splotch app contract. Every selector, hook, mark and seam the harness may touch, declared
// once; the drift guards that hold them against the components stay in the Splotch repo.
import {
  defineApp,
  type LockState,
  type PageFunction,
  type PrimeReport,
  type Selector,
  type Step,
} from 'perf-rig';

export const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'] as const;
export type Brush = (typeof BRUSHES)[number];

const BRUSH_BUTTON = {
  pen: '#penBrushButton',
  crayon: '#crayonBrushButton',
  magic: '#magicBrushButton',
  eraser: '#eraserButton',
} satisfies Record<Brush, Selector>;

const EXPAND_CONTROLS = 'button[aria-label="Expand controls"]';
const SETTINGS_BUTTON = '#settingsButton';
const SETTINGS_CLOSE = '#settingsModal button[aria-label="Close"]';
const COMPACT_SHELL_MARKER = '#settingsModal .quick-toggles';
const APPEARANCE_SECTION = '#settingsModal button[data-section="appearance"]';
const RESOLVED_THEME =
  'document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")';
const HYDRATED = 'typeof window.__committedBrushMode === "function"';
const SETTINGS_OPEN = 'document.querySelector("#settingsModal")?.open === true';
const SETTINGS_CLOSED = 'document.querySelector("#settingsModal")?.open !== true';

// Sources shipped verbatim into the bootstrap; the real bodies live in tools/perf/lib today.
const ERASER_FILL_APPLY =
  'function applyEraserFill() { /* eraser-fill.mjs: paint #7c4dff into every canvas[data-live-tile] whose data-tile-backing matches; report {pending} or {tiles, backings, transparentTiles} */ }' as PageFunction<
    [],
    PrimeReport
  >;
const ERASER_FILL_VERIFY =
  'function verifyEraserFill() { /* eraser-fill.mjs verify-only mode */ }' as PageFunction<
    [],
    PrimeReport
  >;
const UNDO_DRIVE =
  'function driveUndo(index) { /* undo-driver.mjs: click #undoButton, await one new engine.undo measure and one rAF */ }' as PageFunction<
    [number],
    {
      index: number;
      startedAt: number;
      endedAt: number;
      engineMs: number;
      nextFrameMs: number;
      beforeCount: number;
      afterCount: number;
    } | null
  >;

const openSettings: readonly Step[] = [
  {
    kind: 'retryUntil',
    expression: SETTINGS_OPEN,
    equals: true,
    settleMs: 400,
    timeoutMs: 20_000,
    body: [{ kind: 'click', target: SETTINGS_BUTTON }],
  },
];
const closeSettings: readonly Step[] = [
  { kind: 'click', target: SETTINGS_CLOSE },
  { kind: 'until', expression: SETTINGS_CLOSED, equals: true, timeoutMs: 25_000 },
  { kind: 'settle', ms: 1100, reason: 'dialog close transition and shell re-render' },
];
const openAppearance: readonly Step[] = [
  {
    kind: 'ifPresent',
    target: '#lockRotationToggle',
    then: [],
    else: [
      { kind: 'click', target: APPEARANCE_SECTION },
      { kind: 'waitPresent', target: '#lockRotationToggle', timeoutMs: 10_000 },
    ],
  },
];

// The rotation lock lives in the Appearance section of the sectioned shell and as quick toggles in
// the compact shell; tablets render none (the platform owns rotation). The lock read feeds release,
// whose result feeds restore, so an unlocked device is never locked on the way out.
const ROTATION_LOCK_STATE =
  '(() => { const q = document.querySelector("#quickLockPortrait, #quickLockLandscape"); if (q) return document.querySelector("[id^=quickLock][aria-pressed=true]") ? "locked" : "unlocked"; const t = document.querySelector("#lockRotationToggle"); if (!t) return "platform-owned"; return t.getAttribute("aria-checked") === "true" ? "locked" : "unlocked"; })()';

export const splotch = defineApp({
  name: 'splotch',
  build: {
    outputDir: 'web/build',
    build: { command: ['npm', 'run', 'build'] },
    serve: {
      command: ['node', 'tools/run-web-tool.mjs', 'vite', 'preview', '--host'],
      portFlag: '--port',
      readyWhen: 'listening',
    },
    seams: { env: { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' } },
    identity: {
      strategy: 'chunks',
      entryModule: '/_app/immutable/entry/start\\.[^"\']+\\.js',
      immutableChunk: '/_app/immutable/[A-Za-z0-9._\\-/]+\\.js',
    },
    refusedVariants: [
      {
        name: 'native-static-export',
        markerFile: 'index.html',
        absentFiles: ['_headers', '_redirects'],
        remedy: 'web/build holds the Capacitor export; run `npm run perf:build` before serving.',
      },
    ],
    provenanceFile: '.perf-build-provenance.json',
  },
  page: {
    path: '/',
    surface: '#drawingCanvas',
    outputSurfaces: { selector: 'canvas[data-live-tile]', proof: 'pixels' },
    hitTestAncestor: '.canvas-stack',
    hydrated: HYDRATED,
    resting: {
      expression: '!document.querySelector(".paper-view")?.hasAttribute("data-paper-active")',
    },
    paper: {
      element: '.paper-view',
      activeAttribute: 'data-paper-active',
      artShowing:
        '(() => { const img = document.querySelector("#coloringOverlay"); return !!img && !!img.src && !img.hidden; })()',
    },
    liftIndicator: '.brush-ring, .eraser-bubble',
  },
  hooks: {
    historyDepth: {
      depth: '(d => d.snapshots ?? d.historyLength)(window.__drawingDebug.getUndoDebug())',
      extra: {
        liveRasters: 'window.__drawingDebug.getUndoDebug().liveRasters',
        rasterBytes: 'window.__drawingDebug.getUndoDebug().rasterBytes',
        baseRasters: 'window.__drawingDebug.getUndoDebug().baseRasters',
        baseRasterBytes: 'window.__drawingDebug.getUndoDebug().baseRasterBytes',
        historyLength: 'window.__drawingDebug.getUndoDebug().historyLength',
      },
      quiescent:
        '(d => d.pendingCommands === 0 && d.historyLength <= d.snapshots)(window.__drawingDebug.getUndoDebug())',
    },
    topology: 'window.__drawingDebug.getLiveSurfaceTopology?.() ?? null',
    bundledReportMailbox: { object: 'window.__bundledCaptureReport', schema: 1 },
    downloadSink: { global: '__screenshotSaveSink' },
  },
  marks: {
    namespace: 'engine.',
    measures: {
      draw: 'engine.draw',
      commit: 'engine.commit',
      undo: 'engine.undo',
      resize: 'engine.resize',
      fold: 'engine.fold',
      scanEmpty: 'engine.scanEmpty',
      crayonShadow: 'engine.crayonShadow',
    },
    attribution: { draw: 'engine.draw', commit: 'engine.commit' },
    pairedEnd: ['engine.undo'],
  },
  state: {
    seed: { localStorage: { 'splotch-install-dismissed': '1' } },
    dimensions: {
      theme: {
        values: ['light', 'dark'],
        read: RESOLVED_THEME,
        set: {
          name: 'theme-through-settings',
          steps: (theme) => [
            ...openSettings,
            {
              kind: 'ifPresent',
              target: COMPACT_SHELL_MARKER,
              then: [
                {
                  kind: 'retryUntil',
                  expression:
                    'document.querySelector("#quickNightToggle")?.getAttribute("aria-checked")',
                  equals: String(theme === 'dark'),
                  settleMs: 400,
                  timeoutMs: 10_000,
                  body: [{ kind: 'click', target: '#quickNightToggle' }],
                },
              ],
              else: [
                {
                  kind: 'ifPresent',
                  target: '#themeOption-light',
                  then: [],
                  else: [
                    { kind: 'click', target: APPEARANCE_SECTION },
                    { kind: 'waitPresent', target: '#themeOption-light', timeoutMs: 10_000 },
                  ],
                },
                { kind: 'click', target: `#themeOption-${theme}` },
              ],
            },
            { kind: 'until', expression: RESOLVED_THEME, equals: theme, timeoutMs: 20_000 },
            ...closeSettings,
          ],
          postcondition: (theme) => ({
            expression: RESOLVED_THEME,
            equals: theme,
            timeoutMs: 20_000,
          }),
        },
      },
      orientation: {
        values: ['PORTRAIT', 'LANDSCAPE'],
        read: 'innerWidth > innerHeight ? "LANDSCAPE" : "PORTRAIT"',
        set: {
          via: 'transport',
          capability: 'orientation',
          map: { PORTRAIT: 'PORTRAIT', LANDSCAPE: 'LANDSCAPE' },
          lock: {
            read: `(() => { const settingsWasOpen = ${SETTINGS_OPEN}; return ${ROTATION_LOCK_STATE}; })()`,
            release: {
              name: 'release-rotation-lock',
              steps: (state: LockState) =>
                state !== 'locked'
                  ? []
                  : [
                      ...openSettings,
                      {
                        kind: 'ifPresent',
                        target: COMPACT_SHELL_MARKER,
                        then: [{ kind: 'click', target: '[id^=quickLock][aria-pressed=true]' }],
                        else: [...openAppearance, { kind: 'click', target: '#lockRotationToggle' }],
                      },
                      {
                        kind: 'until',
                        expression: ROTATION_LOCK_STATE,
                        equals: 'unlocked',
                        timeoutMs: 10_000,
                      },
                      ...closeSettings,
                    ],
              postcondition: (state: LockState) => ({
                expression: ROTATION_LOCK_STATE,
                equals: state === 'platform-owned' ? 'platform-owned' : 'unlocked',
                timeoutMs: 10_000,
              }),
            },
            restore: {
              name: 'restore-rotation-lock',
              steps: (state: LockState) =>
                state !== 'locked'
                  ? []
                  : [
                      ...openSettings,
                      {
                        kind: 'ifPresent',
                        target: COMPACT_SHELL_MARKER,
                        then: [{ kind: 'click', target: '#quickLockPortrait' }],
                        else: [...openAppearance, { kind: 'click', target: '#lockRotationToggle' }],
                      },
                      {
                        kind: 'until',
                        expression: ROTATION_LOCK_STATE,
                        equals: 'locked',
                        timeoutMs: 10_000,
                      },
                      ...closeSettings,
                    ],
              postcondition: (state: LockState) => ({
                expression: ROTATION_LOCK_STATE,
                equals: state,
                timeoutMs: 10_000,
              }),
            },
          },
        },
      },
    },
  },
  tools: {
    values: BRUSHES,
    committed: 'window.__committedBrushMode()',
    select: {
      name: 'select-brush',
      steps: (brush) => [
        {
          kind: 'retryUntil',
          expression: `window.__committedBrushMode?.() === ${JSON.stringify(brush)}`,
          equals: true,
          settleMs: 500,
          timeoutMs: 12_000,
          attempts: 4,
          body: [
            { kind: 'click', target: EXPAND_CONTROLS },
            { kind: 'waitVisible', target: '#brushButton', timeoutMs: 3000 },
            { kind: 'click', target: '#brushButton' },
            { kind: 'waitVisible', target: BRUSH_BUTTON[brush], timeoutMs: 3000 },
            { kind: 'click', target: BRUSH_BUTTON[brush] },
          ],
        },
      ],
      postcondition: (brush) => ({
        expression: 'window.__committedBrushMode()',
        equals: brush,
        timeoutMs: 12_000,
      }),
    },
    dismissMenus: {
      name: 'close-brush-menu',
      steps: [
        {
          kind: 'retryUntil',
          expression: '!document.querySelector("#penBrushButton")?.offsetParent',
          equals: true,
          settleMs: 500,
          timeoutMs: 5000,
          attempts: 3,
          body: [{ kind: 'click', target: '#brushButton' }],
        },
      ],
      postcondition: {
        expression: '!document.querySelector("#penBrushButton")?.offsetParent',
        equals: true,
        timeoutMs: 2000,
      },
    },
    prime: {
      eraser: {
        name: 'fill-tiles-with-ink',
        apply: ERASER_FILL_APPLY,
        verify: ERASER_FILL_VERIFY,
        settleMs: 400,
        budgetMs: 4000,
        idleFramesBetweenPasses: 2,
      },
    },
    admits: { pen: ['undo'] },
  },
  controls: {
    undo: {
      selector: '#undoButton',
      enabled: '!document.querySelector("#undoButton").disabled',
      measure: 'engine.undo',
      activation: 'dom',
      drive: UNDO_DRIVE,
    },
    clear: {
      selector: '#clearButton',
      ready: 'document.querySelector("#screenshotButton").disabled === true',
    },
    screenshot: { selector: '#screenshotButton' },
    expandDrawer: {
      selector: EXPAND_CONTROLS,
      ready:
        'document.querySelector(".actions-panel[data-action-panel-live]")?.dataset.drawerOpen === "true"',
    },
    collapseDrawer: {
      selector: 'button[aria-label="Collapse controls"]',
      ready:
        'document.querySelector(".actions-panel[data-action-panel-live]")?.dataset.drawerOpen !== "true"',
    },
    brushMenu: {
      selector: '#brushButton',
      ready: 'document.querySelector("#brushButton").getAttribute("aria-expanded") === "true"',
    },
    crayonBrush: {
      selector: BRUSH_BUTTON.crayon,
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "crayon"',
    },
    magicBrush: {
      selector: BRUSH_BUTTON.magic,
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "magic"',
    },
    eraser: {
      selector: BRUSH_BUTTON.eraser,
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "eraser"',
    },
    penBrush: {
      selector: BRUSH_BUTTON.pen,
      ready: '!document.querySelector(".actions-panel")?.dataset.brush',
    },
    strokeWidthMenu: { selector: '#strokeWidthButton' },
    strokeWidthOption: { selector: '.stroke-width-menu button[aria-pressed="false"]' },
    strokeWidthLarge: { selector: 'button[aria-label="Size 5"]' },
    settings: { selector: SETTINGS_BUTTON, ready: SETTINGS_OPEN },
    closeSettings: { selector: SETTINGS_CLOSE, ready: SETTINGS_CLOSED },
    settingsSection: {
      selector: '#settingsModal button[data-section]',
      ready: '!!document.querySelector("#settingsModal .settings-pane, #settingsModal .hub-list")',
    },
    parentCenter: {
      selector: '#settingsModal button[data-section="parent"]',
      ready: '!!document.querySelector("#parentalGate")',
    },
    closeParentalGate: { selector: '#parentalGate button[aria-label="Close"]' },
    themeLight: {
      selector: '#themeOption-light',
      ready: 'document.documentElement.dataset.theme === "light"',
    },
    themeDark: {
      selector: '#themeOption-dark',
      ready: 'document.documentElement.dataset.theme === "dark"',
    },
    quickNightToggle: { selector: '#quickNightToggle', ready: 'true' },
    soundToggle: { selector: '#soundToggle' },
    quickSoundToggle: { selector: '#quickSoundToggle' },
    saveOnDeleteToggle: { selector: '#saveOnDeleteToggle' },
    advancedControlsToggle: { selector: '#advancedControlsToggle' },
    quickAdvancedControlsToggle: { selector: '#quickAdvancedControlsToggle' },
    screenshotToggle: { selector: '#screenshotToggle' },
    coloringBooks: {
      selector: '#coloringBookButton',
      ready: '!!document.querySelector("#coloring-book-dialog")',
    },
    coloringBook: { selector: 'button[aria-label$="coloring book"]' },
    coloringPage: {
      selector: 'button[aria-label$="coloring page"]',
      ready: 'document.querySelector("#coloringOverlay")?.classList.contains("overlay-ready")',
    },
    coloringPages: { selector: '#coloring-book-dialog' },
    clearColoringPage: {
      selector: 'button[aria-label^="Clear active coloring page:"]',
      ready: 'document.querySelector("#coloringOverlay")?.hidden === true',
    },
    paletteSwatch: { selector: '.color-swatch[data-color]:not(.active)', ready: 'true' },
    colorPicker: {
      selector: '.gradient-swatch',
      ready: '!!document.querySelector("#color-picker")',
    },
    colorPickerHexagon: { selector: '#color-picker .hexagon:not(.selected)' },
  },
  native: {
    android: {
      package: 'art.splotch.app',
      activity: '.MainActivity',
      webviewClass: 'android.webkit.WebView',
      packagedOrigin: 'https://localhost',
      build: { command: ['npm', 'run', 'perf:build:cap'] },
      install: { command: ['npm', 'run', 'android:run:device'] },
    },
    ios: {
      bundleId: 'art.splotch.app',
      packagedOrigin: 'capacitor://localhost',
      build: { command: ['npm', 'run', 'perf:build:cap'] },
      install: { command: ['npm', 'run', 'ios:run:device'] },
    },
    remotePreviewSupported: true,
  },
});

export type Splotch = typeof splotch;
