import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Issue #461: the save pipeline (the export compositor, screenshot persistence,
// folder save, screenshot feedback) loads on demand at save time. Nothing else
// stops a future static import from silently merging it back onto the startup
// critical path, so this spec pins the prerendered `/` page's modulepreload list:
// no chunk the browser must fetch before hydration may contain the save modules'
// code.
//
// It reads the build output on disk — the default Playwright web server runs
// `vite build` first, so the output is fresh. Skipped under DEV_SERVER=1 (the
// dev server serves unbundled modules; the disk output may be stale or absent).

const outputDir = fileURLToPath(new URL('../.svelte-kit/output', import.meta.url));
const prerenderedIndex = `${outputDir}/prerendered/pages/index.html`;
const clientDir = `${outputDir}/client`;
const deferredIconsDir = fileURLToPath(new URL('../src/lib/icons/deferred', import.meta.url));

// One minification-proof string literal per lazily-loaded save module.
const SAVE_MODULE_MARKERS: Record<string, string> = {
  'exportDrawing.ts': 'handmade-paper',
  'screenshot.ts': 'allowPrompt',
  'folderSave.ts': 'Persisting the save folder failed:',
  'screenshotFeedback.ts': 'screenshot-capture-feedback',
};
const COLORING_PACK_MODULE_MARKERS: Record<string, string> = {
  'manager.ts': 'Coloring-pack download paused',
  'nativeStore.ts': 'ColoringPacks',
};

// ADR-0164: the icons under src/lib/icons/deferred/ ship in the chunk of
// lib/components/deferredIcons.ts, and a static import of that module from a
// startup module (the shape deferredIcons.test.ts's per-file import rule gives
// the regression) hauls every one of them back onto the critical path. The
// marker is path data from one deferred icon: raw SVG is inlined as a string
// literal, so it survives minification verbatim.
const DEFERRED_ICON_MARKER_LENGTH = 40;
const DEFERRED_ICON_MODULE_MARKERS: Record<string, string> = {
  'deferredIcons.ts': deferredIconPathMarker('whats-new'),
};

function deferredIconPathMarker(name: string): string {
  const svg = readFileSync(`${deferredIconsDir}/${name}.svg`, 'utf8');
  const pathData = /\sd="([^"]+)"/.exec(svg)?.[1];
  if (!pathData || pathData.length < DEFERRED_ICON_MARKER_LENGTH) {
    throw new Error(`${name}.svg has no path data long enough to serve as a marker`);
  }
  return pathData.slice(0, DEFERRED_ICON_MARKER_LENGTH);
}

test.skip(!!process.env.DEV_SERVER, 'guards the production build output');

function modulepreloadHrefs(): string[] {
  const html = readFileSync(prerenderedIndex, 'utf8');
  return [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]*>/g)]
    .map((m) => /href="([^"]+)"/.exec(m[0])?.[1])
    .filter((href): href is string => !!href);
}

test('the save pipeline stays out of the prerendered modulepreload list', () => {
  const hrefs = modulepreloadHrefs();
  expect(hrefs.length).toBeGreaterThan(0);

  let scanned = 0;
  for (const href of hrefs) {
    // ./_app/env.js is served virtually and never holds app code.
    const chunkPath = `${clientDir}/${href.replace(/^\.\//, '')}`;
    if (!existsSync(chunkPath)) continue;
    scanned++;
    const chunk = readFileSync(chunkPath, 'utf8');
    for (const [module, marker] of Object.entries(SAVE_MODULE_MARKERS)) {
      expect(
        chunk.includes(marker),
        `${module} (marker "${marker}") is back in modulepreloaded chunk ${href} — a static import has pulled the save pipeline onto the startup critical path`
      ).toBe(false);
    }
    for (const [module, marker] of Object.entries(COLORING_PACK_MODULE_MARKERS)) {
      expect(
        chunk.includes(marker),
        `${module} (marker "${marker}") is back in modulepreloaded chunk ${href} — coloring-pack I/O must stay off the drawing startup path`
      ).toBe(false);
    }
    for (const [module, marker] of Object.entries(DEFERRED_ICON_MODULE_MARKERS)) {
      expect(
        chunk.includes(marker),
        `${module} (marker "${marker}") is back in modulepreloaded chunk ${href} — a startup module imports the deferred icon registry, putting every deferred icon on the critical path`
      ).toBe(false);
    }
  }
  expect(
    scanned,
    'no modulepreload href resolved to a chunk on disk — the href format changed and this test is scanning nothing'
  ).toBeGreaterThan(0);
});

test('the save-module markers still identify code in the client build', () => {
  // Anti-vacuity check for the test above: if a marker string is renamed away,
  // it must fail loudly here instead of silently guarding nothing.
  const chunks = readdirSync(`${clientDir}/_app/immutable`, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(`${clientDir}/_app/immutable/${f}`, 'utf8'));

  for (const [module, marker] of Object.entries(SAVE_MODULE_MARKERS)) {
    expect(
      chunks.some((chunk) => chunk.includes(marker)),
      `marker "${marker}" for ${module} no longer appears anywhere in the client build — update SAVE_MODULE_MARKERS`
    ).toBe(true);
  }
  for (const [module, marker] of Object.entries(COLORING_PACK_MODULE_MARKERS)) {
    expect(
      chunks.some((chunk) => chunk.includes(marker)),
      `marker "${marker}" for ${module} no longer appears anywhere in the client build — update COLORING_PACK_MODULE_MARKERS`
    ).toBe(true);
  }
  for (const [module, marker] of Object.entries(DEFERRED_ICON_MODULE_MARKERS)) {
    expect(
      chunks.some((chunk) => chunk.includes(marker)),
      `marker "${marker}" for ${module} no longer appears anywhere in the client build — the deferred icon is not shipping at all`
    ).toBe(true);
  }
});
