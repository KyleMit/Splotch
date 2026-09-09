// The Splotch app contract. Every selector, hook, mark and seam the harness may touch, declared
// once; the drift guards that hold them against the components stay in the Splotch repo.
import {
  defineApp,
  type LockState,
  type PageFunction,
  type PrimeReport,
  type Query,
  type Selector,
  type Step,
} from 'perf-rig';

export const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'] as const;
export type Brush = (typeof BRUSHES)[number];
export type Orientation = 'PORTRAIT' | 'LANDSCAPE';
type RotationLock = LockState<Orientation>;

const BRUSH_BUTTON = {
  pen: '#penBrushButton',
  crayon: '#crayonBrushButton',
  magic: '#magicBrushButton',
  eraser: '#eraserButton',
} satisfies Record<Brush, Selector>;

// SECTIONS in web/src/lib/components/settings/sections.ts, in nav order; the phase-0 drift test
// holds the two lists together. Every member binds to its own row and completion condition.
export const SETTINGS_SECTIONS = [
  'appearance',
  'sound',
  'controls',
  'coloring',
  'ai',
  'saving',
  'parentCenter',
  'setup',
  'feedback',
  'whatsnew',
  'about',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
/** The nav labels the sweep's action labels quote; held to SECTIONS by the same drift test. */
export const SETTINGS_SECTION_LABEL = {
  appearance: 'Appearance',
  sound: 'Sound',
  controls: 'Tool Drawer',
  coloring: 'Coloring',
  ai: 'AI Art',
  saving: 'Saving',
  parentCenter: 'Parent Center',
  setup: 'Install',
  feedback: 'Feedback',
  whatsnew: "What's New",
  about: 'About',
} satisfies Record<SettingsSection, string>;
const sectionRow = (section: SettingsSection) => `#settingsModal button[data-section="${section}"]`;

const EXPAND_CONTROLS = 'button[aria-label="Expand controls"]';
const SETTINGS_BUTTON = '#settingsButton';
const SETTINGS_CLOSE = '#settingsModal button[aria-label="Close"]';
const COMPACT_SHELL_MARKER = '#settingsModal .quick-toggles';
const ACTION_PANEL = '.actions-panel[data-action-panel-live]';
export const RESOLVED_THEME =
  'document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")';
const HYDRATED = 'typeof window.__committedBrushMode === "function"';
const SETTINGS_OPEN = 'document.querySelector("#settingsModal")?.open === true';
const SETTINGS_CLOSED = 'document.querySelector("#settingsModal")?.open !== true';
// SettingsModal.svelte's COMPACT_QUERY and WIDE_QUERY (TABLET_MIN_SIDE_PX − 1); compact wins where
// a landscape phone matches both, as the component resolves it. Drift-tested in phase 0.
const SETTINGS_SHELL =
  '(matchMedia("(orientation: landscape) and (max-height: 599px)").matches ? "compact" : matchMedia("(min-width: 700px)").matches ? "wide" : "hub")';
export const panelHas = (attribute: string) =>
  `document.querySelector(${JSON.stringify(ACTION_PANEL)})?.hasAttribute(${JSON.stringify(attribute)}) === true`;
export const panelLacks = (attribute: string) =>
  `document.querySelector(${JSON.stringify(ACTION_PANEL)})?.hasAttribute(${JSON.stringify(attribute)}) === false`;

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
// The Appearance pane is proved by its theme picker, which every sectioned shell renders; the
// rotation lock is not on a tablet's pane, so waiting for it would time out against the product.
const openAppearance: readonly Step[] = [
  {
    kind: 'ifPresent',
    target: '#themeOption-light',
    then: [],
    else: [
      { kind: 'click', target: sectionRow('appearance') },
      { kind: 'waitPresent', target: '#themeOption-light', timeoutMs: 10_000 },
    ],
  },
];
// The compact shell renders the lock as quick toggles on its first screen; the sectioned shells in
// the Appearance pane.
const openLockControls: readonly Step[] = [
  { kind: 'ifPresent', target: COMPACT_SHELL_MARKER, then: [], else: openAppearance },
];

// Transcribed from campaign-state.mjs's readCompactLockedOrientation and
// readSectionedLockedOrientation: the lock keeps which orientation it holds, and both contradictory
// states the product cannot legally show throw rather than read as unlocked. Valid only with the
// lock controls on the page, which is what the query's `before` steps guarantee.
const ROTATION_LOCK_STATE = `(() => {
  const portrait = document.querySelector("#quickLockPortrait");
  const landscape = document.querySelector("#quickLockLandscape");
  if (portrait && landscape) {
    const pressed = [portrait, landscape].filter((b) => b.getAttribute("aria-pressed") === "true");
    if (pressed.length > 1) throw new Error("Compact Settings reports both rotation-lock orientations selected");
    return { locked: pressed[0] === portrait ? "PORTRAIT" : pressed[0] === landscape ? "LANDSCAPE" : null };
  }
  const lock = document.querySelector("#lockRotationToggle");
  if (!lock) return "platform-owned";
  const locked = lock.getAttribute("aria-checked") === "true";
  const force = document.querySelector("#forceLandscapeToggle");
  if (locked && !force) throw new Error("Settings reports rotation locked without its orientation control");
  return { locked: locked ? (force.getAttribute("aria-checked") === "true" ? "LANDSCAPE" : "PORTRAIT") : null };
})()`;
const LOCK_RELEASED = `(() => { const s = ${ROTATION_LOCK_STATE}; return s !== "platform-owned" && s.locked === null; })()`;
const lockHolds = (orientation: Orientation) =>
  `(() => { const s = ${ROTATION_LOCK_STATE}; return s !== "platform-owned" && s.locked === ${JSON.stringify(orientation)}; })()`;
const quickLock = (orientation: Orientation) =>
  orientation === 'LANDSCAPE' ? '#quickLockLandscape' : '#quickLockPortrait';
const holdsLock = (state: RotationLock): state is { readonly locked: Orientation } =>
  state !== 'platform-owned' && state.locked !== null;
const releaseLock: readonly Step[] = [
  ...openSettings,
  ...openLockControls,
  {
    kind: 'ifPresent',
    target: COMPACT_SHELL_MARKER,
    then: [{ kind: 'click', target: '[id^=quickLock][aria-pressed=true]' }],
    else: [{ kind: 'click', target: '#lockRotationToggle' }],
  },
  { kind: 'until', expression: LOCK_RELEASED, equals: true, timeoutMs: 10_000 },
  ...closeSettings,
];
const restoreLock = (orientation: Orientation): readonly Step[] => [
  ...openSettings,
  ...openLockControls,
  {
    kind: 'ifPresent',
    target: COMPACT_SHELL_MARKER,
    then: [{ kind: 'click', target: quickLock(orientation) }],
    else: [
      { kind: 'click', target: '#lockRotationToggle' },
      { kind: 'waitPresent', target: '#forceLandscapeToggle', timeoutMs: 10_000 },
      ...(orientation === 'LANDSCAPE'
        ? [
            {
              kind: 'retryUntil' as const,
              expression: lockHolds('LANDSCAPE'),
              equals: true,
              settleMs: 400,
              timeoutMs: 10_000,
              body: [{ kind: 'click' as const, target: '#forceLandscapeToggle' }],
            },
          ]
        : []),
    ],
  },
  { kind: 'until', expression: lockHolds(orientation), equals: true, timeoutMs: 10_000 },
  ...closeSettings,
];
// The lock is verified by the `until` inside each procedure while its controls are on the page; the
// postcondition proves the dialog was left closed, because the lock expression cannot be answered
// once the lazy modal is gone.
const settingsLeftClosed = () => ({ expression: SETTINGS_CLOSED, equals: true, timeoutMs: 25_000 });

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
    // build:cap writes the native export into the same directory (build-variant.mjs); the export is
    // defined by the web-only files it drops. A browser capture refuses it and a capture delivered
    // into the packaged WebView requires it (ADR-0135).
    variants: [
      {
        name: 'web',
        markerFile: '_headers',
        absentFiles: [],
        servesFor: ['browser'],
        remedy:
          'web/build holds the web build; run `npm run perf:build:cap` before a native capture.',
      },
      {
        name: 'native-static-export',
        markerFile: 'index.html',
        absentFiles: ['_headers', '_redirects'],
        servesFor: ['remote-preview', 'packaged'],
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
    variant: { values: ['compact', 'hub', 'wide'], read: SETTINGS_SHELL },
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
              else: [...openAppearance, { kind: 'click', target: `#themeOption-${theme}` }],
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
            read: {
              name: 'read-rotation-lock',
              before: [...openSettings, ...openLockControls],
              expression: ROTATION_LOCK_STATE,
              after: closeSettings,
            } satisfies Query<RotationLock>,
            release: {
              name: 'release-rotation-lock',
              steps: (state: RotationLock) => (holdsLock(state) ? releaseLock : []),
              postcondition: settingsLeftClosed,
            },
            restore: {
              name: 'restore-rotation-lock',
              steps: (state: RotationLock) => (holdsLock(state) ? restoreLock(state.locked) : []),
              postcondition: settingsLeftClosed,
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
    // Clear activates by a drag from the button across the screen, never a click.
    clear: {
      selector: '#clearButton',
      gesture: { kind: 'drag', fraction: 0.48, durationMs: 450 },
      ready: 'document.querySelector("#screenshotButton")?.disabled === true',
    },
    screenshot: { selector: '#screenshotButton' },
    // The app writes data-drawer-open with toggleAttribute (actionButtonLayout.ts), so its value
    // is the empty string; presence is the state.
    expandDrawer: { selector: EXPAND_CONTROLS, ready: panelHas('data-drawer-open') },
    collapseDrawer: {
      selector: 'button[aria-label="Collapse controls"]',
      ready: panelLacks('data-drawer-open'),
    },
    brushMenu: {
      selector: '#brushButton',
      ready: 'document.querySelector("#brushButton")?.getAttribute("aria-expanded") === "true"',
    },
    crayonBrush: {
      selector: BRUSH_BUTTON.crayon,
      ready: `document.querySelector(${JSON.stringify(ACTION_PANEL)})?.dataset.brush === "crayon"`,
    },
    magicBrush: {
      selector: BRUSH_BUTTON.magic,
      ready: `document.querySelector(${JSON.stringify(ACTION_PANEL)})?.dataset.brush === "magic"`,
    },
    eraser: {
      selector: BRUSH_BUTTON.eraser,
      ready: `document.querySelector(${JSON.stringify(ACTION_PANEL)})?.dataset.brush === "eraser"`,
    },
    penBrush: { selector: BRUSH_BUTTON.pen, ready: panelLacks('data-brush') },
    strokeWidthMenu: {
      selector: '#strokeWidthButton',
      ready:
        'document.querySelector("#strokeWidthButton")?.getAttribute("aria-expanded") === "true"',
    },
    strokeWidthOption: {
      selector: '.stroke-width-menu button[aria-pressed="false"]',
      ready:
        'document.querySelector(".stroke-width-menu button[aria-pressed=\\"true\\"]") !== null && document.querySelector("#strokeWidthButton")?.getAttribute("aria-expanded") === "false"',
    },
    strokeWidthLarge: { selector: 'button[aria-label="Size 5"]' },
    settings: { selector: SETTINGS_BUTTON, ready: SETTINGS_OPEN },
    closeSettings: { selector: SETTINGS_CLOSE, ready: SETTINGS_CLOSED, activation: 'dom' },
    settingsBack: { selector: '#settingsModal .settings-back' },
    // Transcribed from settingsSectionMeasurement in capture-xcuitest-actions.mjs: the wide pane is
    // a table of contents over one scrolling pane, so a click scrolls and the row reports a reading
    // position; the hub drills in and shows its back control; Parent Center may open its gate first.
    settingsSection: {
      members: SETTINGS_SECTIONS,
      selector: (section: SettingsSection) => sectionRow(section),
      ready: (section: SettingsSection, { variant }: { variant: string | null }) => {
        const opened =
          variant === 'wide'
            ? `document.querySelector(${JSON.stringify(sectionRow(section))})?.getAttribute("aria-current") === "location"`
            : 'document.querySelector("#settingsModal .settings-back") !== null';
        return section === 'parentCenter'
          ? `document.querySelector("#parentalGate")?.open === true || (${opened})`
          : opened;
      },
      activation: 'dom',
    },
    closeParentalGate: {
      selector: '#parentalGate button[aria-label="Close"]',
      ready: 'document.querySelector("#parentalGate")?.open !== true',
    },
    themeLight: {
      selector: '#themeOption-light',
      ready: 'document.documentElement.dataset.theme === "light"',
    },
    themeDark: {
      selector: '#themeOption-dark',
      ready: 'document.documentElement.dataset.theme === "dark"',
    },
    quickNightToggle: { selector: '#quickNightToggle' },
    soundToggle: { selector: '#soundToggle' },
    quickSoundToggle: { selector: '#quickSoundToggle' },
    saveOnDeleteToggle: { selector: '#saveOnDeleteToggle' },
    advancedControlsToggle: { selector: '#advancedControlsToggle' },
    quickAdvancedControlsToggle: { selector: '#quickAdvancedControlsToggle' },
    screenshotToggle: { selector: '#screenshotToggle' },
    coloringBooks: {
      selector: '#coloringBookButton',
      ready: 'document.querySelector("#coloring-book-dialog")?.open === true',
    },
    coloringBack: { selector: '#coloring-book-dialog .coloring-back-button' },
    coloringBook: {
      selector: '#coloring-book-dialog button[aria-label$="coloring book"]',
      ready:
        'document.querySelector("#coloring-book-dialog button[aria-label$=\\"coloring page\\"]") !== null',
      activation: 'dom',
    },
    coloringPage: {
      selector: '#coloring-book-dialog button[aria-label$="coloring page"]',
      ready:
        'document.querySelector("#coloring-book-dialog")?.open !== true && document.querySelector("#coloringOverlay")?.classList.contains("overlay-ready") && document.querySelector("#coloringOverlay")?.naturalWidth > 0',
      activation: 'dom',
    },
    coloringPages: { selector: '#coloring-book-dialog' },
    clearColoringPage: {
      selector: '#coloring-book-dialog button[aria-label^="Clear active coloring page:"]',
      ready:
        'document.querySelector("#coloring-book-dialog")?.open !== true && document.querySelector("#coloringOverlay")?.hidden === true',
    },
    paletteSwatch: {
      selector: '.color-swatch[data-color]:not(.active):not(.gradient-swatch)',
      ready: '!!document.querySelector(".color-swatch.active")',
    },
    colorPicker: {
      selector: '.gradient-swatch',
      ready: 'document.querySelector("#color-picker")?.open === true',
    },
    colorPickerHexagon: {
      selector: '#color-picker .hexagon:not(.selected)',
      ready: 'document.querySelector("#color-picker")?.open !== true',
    },
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
