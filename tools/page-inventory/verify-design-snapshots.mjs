import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { DESIGN_BUNDLE_OUT, SHARED_STYLESHEET } from './lib/design-snapshot.mjs';
import { PAGE_INVENTORY_THEMES } from './lib/page-inventory-data.mjs';
import { PAGE_INVENTORY_VIEWPORTS } from './lib/page-inventory-report.mjs';

const REFERENCE_DEFAULT = join(ROOT, 'scrapbook/page-inventory');
const SPOT_CHECK_REFERENCE = join(ROOT, '.scrapbook-scratch/page-inventory-spot-check');

// A snapshot is a still of a screenshot, so any difference is a serialization
// bug rather than a rendering one. The budget is not zero because WebP is lossy
// and the two encoders round a handful of edge pixels differently.
const DEFAULT_TOLERANCE_PERCENT = 0.5;
const CHANNEL_DIFFERENCE_THRESHOLD = 24;

export function parseSnapshotName(fileName) {
  const match = fileName.match(/^(.+?)--(.+?)--(.+)--(light|dark)\.html$/);
  if (!match) return undefined;
  const [, group, id, viewportId, themeId] = match;
  const viewport = PAGE_INVENTORY_VIEWPORTS.find((candidate) => candidate.id === viewportId);
  const theme = PAGE_INVENTORY_THEMES.find((candidate) => candidate.id === themeId);
  if (!viewport || !theme) return undefined;
  return {
    group,
    id,
    viewport,
    theme,
    referencePath: `assets/${group}/${id}--${viewportId}--${themeId}.webp`,
  };
}

// Counted per pixel rather than per channel so a wholesale colour shift and a
// one-channel rounding wobble cannot report the same number.
export function differingPixelPercent(a, b, channels) {
  if (a.length !== b.length) return 100;
  let differing = 0;
  for (let offset = 0; offset < a.length; offset += channels) {
    for (let channel = 0; channel < channels; channel += 1) {
      if (Math.abs(a[offset + channel] - b[offset + channel]) > CHANNEL_DIFFERENCE_THRESHOLD) {
        differing += 1;
        break;
      }
    }
  }
  return (differing / (a.length / channels)) * 100;
}

async function rawPixels(input, width, height) {
  return sharp(input)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function compareSnapshot(browser, snapshot, bundle, reference) {
  const { viewport, theme } = snapshot;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: theme.id,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(bundle, snapshot.fileName)).href, {
      waitUntil: 'load',
    });
    await page.evaluate(() => document.fonts.ready);
    const rendered = await page.screenshot({ type: 'png' });
    const expected = join(reference, snapshot.referencePath);
    if (!existsSync(expected)) return { ...snapshot, skipped: 'no reference capture' };
    const [actualPixels, expectedPixels] = await Promise.all([
      rawPixels(rendered, viewport.width, viewport.height),
      rawPixels(expected, viewport.width, viewport.height),
    ]);
    return {
      ...snapshot,
      difference: differingPixelPercent(
        actualPixels.data,
        expectedPixels.data,
        actualPixels.info.channels
      ),
    };
  } finally {
    await context.close();
  }
}

export function parseVerifyOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      bundle: { type: 'string' },
      reference: { type: 'string' },
      tolerance: { type: 'string' },
      surface: { type: 'string', multiple: true, default: [] },
    },
  });
  const tolerance =
    values.tolerance === undefined ? DEFAULT_TOLERANCE_PERCENT : Number(values.tolerance);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(`--tolerance must be a non-negative number, got ${values.tolerance}`);
  }
  const bundle = values.bundle ? join(ROOT, values.bundle) : DESIGN_BUNDLE_OUT;
  const reference = values.reference
    ? join(ROOT, values.reference)
    : existsSync(join(REFERENCE_DEFAULT, 'assets'))
      ? REFERENCE_DEFAULT
      : SPOT_CHECK_REFERENCE;
  return { bundle, reference, tolerance, surfaces: values.surface };
}

export async function verifyDesignSnapshots(argv = process.argv.slice(2)) {
  const { bundle, reference, tolerance, surfaces } = parseVerifyOptions(argv);
  // A capture that fails partway leaves snapshots behind without the stylesheet
  // they all link, and every one of them then renders unstyled — which reads as
  // a fidelity collapse rather than the incomplete run it is.
  if (existsSync(bundle) && !existsSync(join(bundle, SHARED_STYLESHEET))) {
    throw new Error(
      `${relative(ROOT, join(bundle, SHARED_STYLESHEET))} is missing, so the last capture did not finish — re-run npm run capture:page-inventory`
    );
  }
  const surfaceDirectory = join(bundle, 'surfaces');
  if (!existsSync(surfaceDirectory)) {
    throw new Error(
      `No design snapshots at ${relative(ROOT, surfaceDirectory)} — run npm run capture:page-inventory first`
    );
  }
  const snapshots = readdirSync(surfaceDirectory)
    .filter((fileName) => fileName.endsWith('.html'))
    .map((fileName) => {
      const parsed = parseSnapshotName(fileName);
      return parsed && { ...parsed, fileName: join('surfaces', fileName) };
    })
    .filter(Boolean)
    .filter((snapshot) => !surfaces.length || surfaces.some((name) => snapshot.id.includes(name)));
  if (!snapshots.length) throw new Error('No snapshots matched');

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const results = [];
  try {
    for (const snapshot of snapshots) {
      results.push(await compareSnapshot(browser, snapshot, bundle, reference));
    }
  } finally {
    await browser.close();
  }

  const failures = results.filter(({ difference }) => difference > tolerance);
  for (const result of results.sort((a, b) => (b.difference ?? -1) - (a.difference ?? -1))) {
    const verdict = result.skipped ?? `${result.difference.toFixed(2)}% differing pixels`;
    console.log(
      `${result.difference > tolerance ? 'FAIL' : 'ok  '} ${result.group}/${result.id} ${result.viewport.id} ${result.theme.id} — ${verdict}`
    );
  }
  console.log(
    `\n${results.length - failures.length}/${results.length} snapshots render within ${tolerance}% of their capture`
  );
  if (failures.length) {
    throw new Error(`${failures.length} snapshot(s) do not match the app they were captured from`);
  }
}

if (isMain(import.meta.url)) runMain(verifyDesignSnapshots);
