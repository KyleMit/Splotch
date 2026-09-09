// The Splotch app contract. Every selector, hook, mark and seam the harness may touch, declared
// once. Values are the ones the 2026-09 harness targets (see boundary.md); the drift guards that
// hold them against the components stay in the Splotch repo.
import { defineApp } from 'perf-rig';

const EXPAND_CONTROLS = 'button[aria-label="Expand controls"]';
const SETTINGS_MODAL = '#settingsModal';
const COMPACT_SHELL_MARKER = '#settingsModal .quick-toggles';

export const splotch = defineApp({
  name: 'splotch',
  build: {
    outputDir: 'web/build',
    buildCommand: ['npm', 'run', 'build'],
    serveCommand: [
      'node',
      'tools/run-web-tool.mjs',
      'vite',
      'preview',
      '--port',
      '{port}',
      '--host',
    ],
    seams: {
      env: { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' },
      present: 'typeof window.__committedBrushMode === "function"',
    },
    identity: {
      entryModule: /\/_app\/immutable\/entry\/start\.[^"']+\.js/,
      immutableChunk: /\/_app\/immutable\/[A-Za-z0-9._\-/]+\.js/g,
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
    outputSurfaces: 'canvas[data-live-tile]',
    hitTestAncestor: '.canvas-stack',
    hydrated: 'typeof window.__committedBrushMode === "function"',
    resting: '!document.querySelector(".paper-view")?.hasAttribute("data-paper-active")',
    toleratedQueryParams: [
      'probe',
      'verify',
      'arm',
      'rehydrate',
      'perf-actions',
      'perf-android-web',
    ],
    allowsSameOriginScript: true,
  },
  hooks: {
    committedMode: 'window.__committedBrushMode()',
    historyDepth: {
      read: 'window.__drawingDebug.getUndoDebug()',
      fields: [
        'snapshots',
        'liveRasters',
        'rasterBytes',
        'baseRasters',
        'baseRasterBytes',
        'historyLength',
      ],
      quiescent:
        '(d => d.pendingCommands === 0 && d.historyLength <= d.snapshots)(window.__drawingDebug.getUndoDebug())',
    },
    topology: 'window.__drawingDebug.getLiveSurfaceTopology?.() ?? null',
    bundledReportMailbox: {
      object: 'window.__bundledCaptureReport',
      storageKeyIsNonce: true,
      schema: 1,
    },
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
    pairedEnd: ['engine.undo'],
  },
  state: {
    seed: { 'splotch-install-dismissed': '1' },
    dimensions: {
      theme: {
        values: ['light', 'dark'],
        read: 'document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")',
        set: {
          name: 'theme-through-settings',
          values: ['light', 'dark'],
          steps: (theme) => [
            {
              kind: 'retryUntil',
              expression: 'document.querySelector("#settingsModal")?.open === true',
              equals: true,
              attempts: 4,
              body: [{ kind: 'click', target: 'button[aria-label="Settings"]' }],
            },
            {
              kind: 'ifVisible',
              target: COMPACT_SHELL_MARKER,
              then: [
                {
                  kind: 'retryUntil',
                  expression:
                    'document.querySelector("#quickNightToggle")?.getAttribute("aria-checked")',
                  equals: String(theme === 'dark'),
                  attempts: 2,
                  body: [{ kind: 'click', target: '#quickNightToggle' }],
                },
              ],
              else: [
                {
                  kind: 'ifVisible',
                  target: '#themeOption-light',
                  then: [],
                  else: [
                    {
                      kind: 'click',
                      target: `${SETTINGS_MODAL} button[data-section="appearance"]`,
                    },
                  ],
                },
                { kind: 'click', target: `#themeOption-${theme}` },
              ],
            },
            { kind: 'click', target: `${SETTINGS_MODAL} button[aria-label="Close"]` },
          ],
          postcondition: (theme) => ({
            expression:
              'document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")',
            equals: theme,
            timeoutMs: 5000,
          }),
        },
      },
      orientation: {
        values: ['PORTRAIT', 'LANDSCAPE'],
        read: 'innerWidth > innerHeight ? "LANDSCAPE" : "PORTRAIT"',
        platformOwned: ['ios-tablet', 'android-tablet', 'desktop'],
      },
    },
  },
  modes: {
    values: ['pen', 'crayon', 'magic', 'eraser'],
    select: {
      name: 'select-brush',
      values: ['pen', 'crayon', 'magic', 'eraser'],
      steps: (brush) => [
        { kind: 'click', target: EXPAND_CONTROLS },
        { kind: 'waitVisible', target: '#brushButton' },
        { kind: 'click', target: '#brushButton' },
        { kind: 'waitVisible', target: BRUSH_BUTTON[brush]! },
        { kind: 'click', target: BRUSH_BUTTON[brush]! },
      ],
      postcondition: (brush) => ({
        expression: 'window.__committedBrushMode()',
        equals: brush,
        timeoutMs: 12000,
      }),
    },
    dismissMenus: {
      name: 'close-brush-menu',
      steps: [
        {
          kind: 'retryUntil',
          expression: '!document.querySelector("#penBrushButton")?.offsetParent',
          equals: true,
          attempts: 3,
          body: [{ kind: 'click', target: '#brushButton' }],
        },
      ],
      postcondition: {
        expression: '!document.querySelector("#penBrushButton")?.offsetParent',
        equals: true,
      },
    },
    prime: {
      eraser: {
        name: 'fill-tiles-with-ink',
        steps: [
          {
            kind: 'evaluate',
            functionSource: 'function fillTiles(color) { /* eraser-fill.mjs source */ }',
            args: ['#7c4dff'],
            recordAs: 'eraserFill',
          },
          { kind: 'settle', ms: 400, reason: 'let the fill commit before verifying' },
          {
            kind: 'evaluate',
            functionSource: 'function verifyTiles() { /* sample five points opaque */ }',
            recordAs: 'eraserFillVerified',
          },
        ],
        postcondition: {
          expression: 'window.__perfRigLast.eraserFillVerified === true',
          equals: true,
        },
      },
    },
    admits: { pen: ['undo'] },
  },
  controls: {
    undo: {
      selector: '#undoButton',
      enabled: '!document.querySelector("#undoButton").disabled',
      measure: 'engine.undo',
      activate: 'dom',
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
      selector: '#crayonBrushButton',
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "crayon"',
    },
    magicBrush: {
      selector: '#magicBrushButton',
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "magic"',
    },
    eraser: {
      selector: '#eraserButton',
      ready: 'document.querySelector(".actions-panel")?.dataset.brush === "eraser"',
    },
    penBrush: {
      selector: '#penBrushButton',
      ready: '!document.querySelector(".actions-panel")?.dataset.brush',
    },
    strokeWidthMenu: { selector: '#strokeWidthButton' },
    strokeWidthOption: { selector: '.stroke-width-menu button[aria-pressed="false"]' },
    settings: {
      selector: 'button[aria-label="Settings"]',
      ready: 'document.querySelector("#settingsModal")?.open === true',
    },
    closeSettings: {
      selector: '#settingsModal button[aria-label="Close"]',
      ready: 'document.querySelector("#settingsModal")?.open !== true',
    },
    settingsSection: { selector: '#settingsModal button[data-section]' },
    themeLight: {
      selector: '#themeOption-light',
      ready: 'document.documentElement.dataset.theme === "light"',
    },
    themeDark: {
      selector: '#themeOption-dark',
      ready: 'document.documentElement.dataset.theme === "dark"',
    },
    quickNightToggle: { selector: '#quickNightToggle' },
    coloringBooks: {
      selector: '#coloringBookButton',
      ready: '!!document.querySelector("#coloring-book-dialog")',
    },
    coloringBook: { selector: 'button[aria-label$="coloring book"]' },
    coloringPage: {
      selector: 'button[aria-label$="coloring page"]',
      ready: 'document.querySelector("#coloringOverlay")?.classList.contains("overlay-ready")',
    },
    clearColoringPage: { selector: 'button[aria-label^="Clear active coloring page:"]' },
    paletteSwatch: { selector: '.color-swatch[data-color]:not(.active)', ready: 'true' },
    colorPicker: {
      selector: '.gradient-swatch',
      ready: '!!document.querySelector("#color-picker")',
    },
    colorPickerHexagon: { selector: '#color-picker .hexagon:not(.selected)' },
    rotate: { selector: 'html', activate: 'trusted' },
  },
  native: {
    android: {
      package: 'art.splotch.app',
      activity: '.MainActivity',
      webviewClass: 'android.webkit.WebView',
      packagedOrigin: 'https://localhost',
    },
    ios: {
      bundleId: 'art.splotch.app',
      packagedOrigin: 'capacitor://localhost',
      wdaBundleId: 'art.splotch.WebDriverAgentRunner',
      xcodeConfigFile: 'ios/local.xcconfig',
    },
    remotePreviewSupported: true,
  },
  engineHarness: {
    path: '/dev/engine',
    ready: 'window.__engineReady === true',
    api: 'window.__engine',
  },
});

const BRUSH_BUTTON: Record<string, string> = {
  pen: '#penBrushButton',
  crayon: '#crayonBrushButton',
  magic: '#magicBrushButton',
  eraser: '#eraserButton',
};
