// The safe-area matrix on the React Native web export: the drawing screen at every device profile
// and orientation in web/src/lib/safeAreaMatrix/ (docs/SAFE-AREA.md), under that device's real
// insets through CDP's Emulation.setSafeAreaInsetsOverride and its rotation through the screen
// orientation the OS would report. Chromium has the only such seam, and DevTools' device presets
// report every inset as zero, so this is the one place the app is laid out as anything but a
// rectangle. Each scenario must hold:
//
// * the insets reach the app: env(safe-area-inset-*) resolves to them;
// * every drawing control's tap point sits inside the claimable region (the Clear Button hangs
//   off the right edge by design, so a box-containment rule would fail on intended design);
// * the page never scrolls;
// * the Notch Band paints exactly the edges diagnose() selects, each at its inset's depth;
// * the coloring picker's card clears the side insets.
//
// With --gallery <dir> it also writes each scenario's screenshot and an index.html of them, one
// section per profile with the claimable region outlined: the matrix by eye.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isPhoneLandscape } from '../../web/src/lib/breakpoints.ts';
import {
  sizeClassOf,
  supportedOrientations,
} from '../../web/src/lib/safeAreaMatrix/deviceProfile.ts';
import { DEVICE_PROFILES } from '../../web/src/lib/safeAreaMatrix/devices.ts';
import { appliedInsets, diagnose } from '../../web/src/lib/safeAreaMatrix/diagnostics.ts';
import {
  ORIENTATION_ANGLES,
  ORIENTATION_LABELS,
  isLandscape,
} from '../../web/src/lib/safeAreaMatrix/orientations.ts';
import { CONTROLS_LIVE_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { isMain, runMain } from '../lib/proc.mjs';
import { NATIVE_WEB_EXPORT_DIR } from './build-native-web.mjs';
import { serveExport } from './check-native-web-pages-without-js.mjs';

// Scenarios run this many at a time, each in its own context.
const PARALLEL_SCENARIOS = 4;
const LIVE_TIMEOUT_MS = 30_000;
const SETTLE_POLL_MS = 100;
const SETTLE_TIMEOUT_MS = 5_000;
// CDP rounds every inset to a whole CSS pixel, and a layout can land half a pixel either side.
const INSET_TOLERANCE_PX = 1;
const GALLERY_TILE_PX = 300;

// The controls the drawing screen always shows, each by the accessible name a person reaches it by.
const DRAWING_CONTROLS = [
  { name: 'clear button', selector: 'button[aria-label="Clear drawing"]' },
  { name: 'settings button', selector: 'button[aria-label="Settings"]' },
  { name: 'drawer toggle', selector: 'button[aria-label="Expand controls"]' },
];
const COLOR_BUTTON = { name: 'color button', selector: '[data-testid="rsd-color-button-slot"]' };
const PALETTE = { name: 'palette', selector: '[data-testid="rsd-palette-paints"]' };
// Only an Android browser tab has a URL bar worth reclaiming (useFullscreen.web.ts), so the toggle
// gets an expectation either way: absent is a valid state, absent everywhere is not.
const FULLSCREEN_TOGGLE = {
  name: 'fullscreen toggle',
  selector: '[data-testid="rsd-fullscreen-dock"]',
};
const ANDROID_BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36';
const MODAL_CARD = '[data-testid="modal-card"]';

// The screen orientation a portrait-natural device reports at each rotation angle.
const ORIENTATION_TYPES = {
  0: 'portraitPrimary',
  90: 'landscapePrimary',
  180: 'portraitSecondary',
  270: 'landscapeSecondary',
};

const EDGES = ['top', 'right', 'bottom', 'left'];
const BAND_EDGES = ['top', 'left', 'right'];

function expectsFullscreenToggle(profile) {
  return profile.platform === 'android' && profile.surface === 'browser';
}

export function safeAreaScenarios(profiles = DEVICE_PROFILES) {
  return profiles.flatMap((profile) =>
    supportedOrientations(profile).map((orientation) => {
      const insets = appliedInsets(profile, orientation);
      const landscape = isLandscape(orientation);
      const width = landscape ? profile.viewport.height : profile.viewport.width;
      const height = landscape ? profile.viewport.width : profile.viewport.height;
      return {
        profile,
        orientation,
        // CDP applies whole pixels, so the scenario expects what the page will actually report.
        insets: Object.fromEntries(EDGES.map((edge) => [edge, Math.round(insets[edge])])),
        width,
        height,
        bandEdges: diagnose(profile, orientation)?.bandEdges ?? [],
        controls: [
          ...DRAWING_CONTROLS,
          isPhoneLandscape(width, height) ? COLOR_BUTTON : PALETTE,
          ...(expectsFullscreenToggle(profile) ? [FULLSCREEN_TOGGLE] : []),
        ],
        fullscreenToggle: expectsFullscreenToggle(profile),
      };
    })
  );
}

// Runs in the page: what the scenario's checks read, all in one pass.
function readScenario({ controls, fullscreenSelector }) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden';
  document.body.appendChild(probe);
  const env = {};
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    probe.style.width = `env(safe-area-inset-${edge})`;
    env[edge] = Number.parseFloat(getComputedStyle(probe).width);
  }
  probe.remove();
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
  const boxOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  // Only what a person could see counts: an element hidden, or transparent through its own opacity
  // or an ancestor's, is neither a control to press nor a strip that covers an inset.
  const seen = (element) =>
    element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const shown = (element) => seen(element) && element.getBoundingClientRect().width > 0;
  const boxes = Object.fromEntries(
    controls.map(({ name, selector }) => {
      const element = [...document.querySelectorAll(selector)].find(shown);
      return [name, element ? boxOf(element) : null];
    })
  );
  // The Notch Band's strips: hidden from assistive technology, never hit-tested, and anchored to
  // the edge they cover along its whole length (RsdNotchBand.tsx). Any other element shaped so
  // would be a strip covering the same inset, which the paint rule is about either way.
  const layers = [...document.querySelectorAll('[aria-hidden="true"]')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.position === 'absolute' && style.pointerEvents === 'none' && seen(element);
    })
    .map((element) => ({
      box: boxOf(element),
      fill: getComputedStyle(element).backgroundColor,
    }));
  // A strip runs the whole length of its edge and covers less than half the screen across it,
  // which tells it from a full-screen layer such as the paper.
  const strip = (along, across, length, depth) =>
    along === length && across > 0 && across < depth / 2;
  const anchored = {
    top: ({ box }) =>
      box.x === 0 && box.y === 0 && strip(box.width, box.height, viewport.width, viewport.height),
    left: ({ box }) =>
      box.x === 0 && box.y === 0 && strip(box.height, box.width, viewport.height, viewport.width),
    right: ({ box }) =>
      box.x + box.width === viewport.width &&
      box.y === 0 &&
      strip(box.height, box.width, viewport.height, viewport.width),
  };
  const transparent = (fill) => fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent';
  const bands = Object.fromEntries(
    Object.entries(anchored).map(([edge, isAnchored]) => {
      const painted = layers.filter((layer) => isAnchored(layer) && !transparent(layer.fill));
      const extents = painted.map(({ box }) => (edge === 'top' ? box.height : box.width));
      return [edge, extents];
    })
  );
  return {
    env,
    viewport,
    boxes,
    fullscreenToggles: document.querySelectorAll(fullscreenSelector).length,
    overflow: {
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    },
    bands,
  };
}

export function claimableRegion(insets, viewport) {
  return {
    left: insets.left,
    top: insets.top,
    right: viewport.width - insets.right,
    bottom: viewport.height - insets.bottom,
  };
}

// Every way the drawing screen read for one scenario departs from the matrix's rules.
export function scenarioProblems(scenario, read) {
  const { insets, bandEdges } = scenario;
  const problems = [];
  for (const edge of EDGES)
    if (!(Math.abs(read.env[edge] - insets[edge]) <= INSET_TOLERANCE_PX))
      problems.push(`env(safe-area-inset-${edge}) is ${read.env[edge]}, not ${insets[edge]}`);
  const safe = claimableRegion(insets, read.viewport);
  for (const { name } of scenario.controls) {
    const box = read.boxes[name];
    if (!box) {
      problems.push(`the ${name} is missing`);
      continue;
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < safe.left || x > safe.right || y < safe.top || y > safe.bottom)
      problems.push(
        `the ${name}'s tap point (${Math.round(x)}, ${Math.round(y)}) is outside the claimable region`
      );
  }
  const toggles = scenario.fullscreenToggle ? 1 : 0;
  if (read.fullscreenToggles !== toggles)
    problems.push(`${read.fullscreenToggles} fullscreen toggles, not ${toggles}`);
  if (read.overflow.x > 0 || read.overflow.y > 0)
    problems.push(`the page scrolls by ${read.overflow.x}×${read.overflow.y}`);
  for (const edge of BAND_EDGES) {
    const extents = read.bands[edge];
    const expected = bandEdges.includes(edge);
    if (expected !== extents.length > 0)
      problems.push(`the ${edge} band is ${extents.length ? 'painted' : 'unpainted'}`);
    for (const extent of expected ? extents : [])
      if (!(Math.abs(extent - insets[edge]) <= INSET_TOLERANCE_PX))
        problems.push(`the ${edge} band is ${extent} px deep, not ${insets[edge]}`);
  }
  return problems;
}

export function dialogProblems(scenario, viewport, card) {
  if (!card) return ['the coloring picker shows no card'];
  const safe = claimableRegion(scenario.insets, viewport);
  const problems = [];
  if (card.x < safe.left - INSET_TOLERANCE_PX)
    problems.push(`the coloring picker's card starts at ${card.x}, inside the left inset`);
  if (card.x + card.width > safe.right + INSET_TOLERANCE_PX)
    problems.push(
      `the coloring picker's card ends at ${card.x + card.width}, inside the right inset`
    );
  return problems;
}

// Reads until two consecutive reads agree: the safe-area provider measures a frame after mount and
// the layout follows, so the first read can predate the insets.
async function settledRead(page, read, argument) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let previous = await page.evaluate(read, argument);
  while (Date.now() < deadline) {
    await page.waitForTimeout(SETTLE_POLL_MS);
    const next = await page.evaluate(read, argument);
    if (JSON.stringify(next) === JSON.stringify(previous)) return next;
    previous = next;
  }
  throw new Error(`the layout did not settle within ${SETTLE_TIMEOUT_MS} ms`);
}

async function openScenario(browser, origin, scenario) {
  const { width, height, insets, profile, orientation } = scenario;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    // The picker's card flies in from its opener under a transform the card's box includes, and a
    // slow runner can hold a mid-flight frame across two reads; reduced motion opens it in place.
    reducedMotion: 'reduce',
    ...(scenario.fullscreenToggle ? { userAgent: ANDROID_BROWSER_UA } : {}),
  });
  await context.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort()
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const angle = ORIENTATION_ANGLES[orientation];
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: ORIENTATION_TYPES[angle], angle },
  });
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: Object.fromEntries(
      EDGES.flatMap((edge) => [
        [edge, insets[edge]],
        [`${edge}Max`, insets[edge]],
      ])
    ),
  });
  // The export server resolves files and pretty URLs only; Netlify answers / with this same file.
  await page.goto(`${origin}/index.html`);
  await page.locator(`html[${CONTROLS_LIVE_ATTRIBUTE}]`).waitFor({
    state: 'attached',
    timeout: LIVE_TIMEOUT_MS,
  });
  return { context, page, label: `${profile.id} · ${orientation}` };
}

function readCard(selector) {
  const card = document.querySelector(selector);
  if (!card || !card.checkVisibility()) return null;
  const rect = card.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

async function checkScenario(browser, origin, scenario, gallery) {
  const { context, page, label } = await openScenario(browser, origin, scenario);
  try {
    const read = await settledRead(page, readScenario, {
      controls: scenario.controls,
      fullscreenSelector: FULLSCREEN_TOGGLE.selector,
    });
    const problems = scenarioProblems(scenario, read);
    if (gallery)
      await page.screenshot({ path: join(gallery, galleryFile(scenario)), animations: 'disabled' });
    await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
    await page.locator(MODAL_CARD).waitFor({ state: 'visible' });
    const card = await settledRead(page, readCard, MODAL_CARD);
    problems.push(...dialogProblems(scenario, read.viewport, card));
    return problems.map((problem) => `${label}: ${problem}`);
  } finally {
    await context.close();
  }
}

const galleryFile = ({ profile, orientation }) => `${profile.id}-${orientation}.png`;

const escapeHtml = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function galleryIndex(scenarios) {
  const sections = DEVICE_PROFILES.filter((profile) =>
    scenarios.some((scenario) => scenario.profile === profile)
  ).map((profile) => {
    const tiles = scenarios
      .filter((scenario) => scenario.profile === profile)
      .map((scenario) => {
        const scale = GALLERY_TILE_PX / Math.max(scenario.width, scenario.height);
        const { insets } = scenario;
        const outline = `left:${insets.left * scale}px;top:${insets.top * scale}px;right:${insets.right * scale}px;bottom:${insets.bottom * scale}px`;
        return `<figure><div class="tile" style="width:${scenario.width * scale}px;height:${scenario.height * scale}px"><img src="${galleryFile(scenario)}" alt=""><span class="safe" style="${outline}"></span></div><figcaption>${escapeHtml(ORIENTATION_LABELS[scenario.orientation])} · insets ${EDGES.map((edge) => insets[edge]).join('/')} · band ${scenario.bandEdges.join(', ') || 'none'}</figcaption></figure>`;
      })
      .join('');
    return `<section><h2>${escapeHtml(profile.label)} <small>${profile.confidence} · ${profile.surface} · ${profile.viewport.width}×${profile.viewport.height} · ${sizeClassOf(profile)}</small></h2><p>${escapeHtml(profile.models.join(' · '))}</p><p>${escapeHtml(profile.notes)}</p><div class="tiles">${tiles}</div></section>`;
  });
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Safe-area matrix · React Native web</title>
<style>body{margin:24px;font:14px/1.5 system-ui,sans-serif;max-width:1400px}section{border-top:1px solid #ccc;padding:16px 0}h2{margin:0;font-size:18px}small{font-weight:normal;color:#666}.tiles{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end}figure{margin:0}.tile{position:relative;outline:1px solid #999}.tile img{width:100%;height:100%;display:block}.safe{position:absolute;outline:2px dashed rgb(0 160 220 / 80%);pointer-events:none}figcaption{font-size:12px;color:#444;max-width:${GALLERY_TILE_PX}px}</style></head>
<body><h1>Safe-area matrix</h1><p>The React Native drawing screen at every device profile and orientation in <code>web/src/lib/safeAreaMatrix/</code>, under each device's insets. The dashed outline is the claimable region; the band names the edges the Notch Band should paint.</p>${sections.join('')}</body>
</html>
`;
}

// The band reader's positive control, run in the same Chromium before the matrix: one painted top
// strip must read as painted, and the same strip hidden, see-through, inside a see-through parent
// or unfilled must not, so a reader that stopped looking cannot pass the band rule vacuously.
const READER_CONTROL = { width: 400, height: 800, inset: 40 };
const controlStrip = (style) =>
  `<div aria-hidden="true" style="position:absolute;top:0;left:0;width:${READER_CONTROL.width}px;height:${READER_CONTROL.inset}px;pointer-events:none;background:red;${style}"></div>`;
const READER_CONTROLS = [
  ['a painted strip', controlStrip(''), [READER_CONTROL.inset]],
  ['a hidden strip', controlStrip('visibility:hidden'), []],
  ['a see-through strip', controlStrip('opacity:0'), []],
  ['a strip in a hidden parent', `<div style="visibility:hidden">${controlStrip('')}</div>`, []],
  ['a strip in a see-through parent', `<div style="opacity:0">${controlStrip('')}</div>`, []],
  ['an unfilled strip', controlStrip('background:transparent'), []],
];

async function checkBandReader(browser) {
  const { width, height } = READER_CONTROL;
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    const page = await context.newPage();
    const failures = [];
    for (const [name, markup, expected] of READER_CONTROLS) {
      await page.setContent(`<body style="margin:0;overflow:hidden">${markup}</body>`);
      const { bands } = await page.evaluate(readScenario, {
        controls: [],
        fullscreenSelector: 'none',
      });
      if (JSON.stringify(bands.top) !== JSON.stringify(expected))
        failures.push(`${name} reads as ${JSON.stringify(bands.top)}`);
    }
    if (failures.length)
      throw new Error(`The Notch Band reader fails its own control: ${failures.join('; ')}`);
  } finally {
    await context.close();
  }
}

export async function checkNativeWebSafeArea({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  scenarios = safeAreaScenarios(),
  gallery = null,
  log = console.log,
} = {}) {
  if (gallery) mkdirSync(gallery, { recursive: true });
  const server = await serveExport(exportDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const problems = [];
  try {
    await checkBandReader(browser);
    const queue = [...scenarios];
    const worker = async () => {
      for (let scenario = queue.shift(); scenario; scenario = queue.shift())
        problems.push(...(await checkScenario(browser, origin, scenario, gallery)));
    };
    await Promise.all(Array.from({ length: PARALLEL_SCENARIOS }, worker));
  } finally {
    await browser.close();
    server.close();
  }
  if (gallery) writeFileSync(join(gallery, 'index.html'), galleryIndex(scenarios));
  if (problems.length) throw new Error(problems.join('\n'));
  const profiles = new Set(scenarios.map(({ profile }) => profile.id)).size;
  log(
    `[native-web-safe-area] ${scenarios.length} scenarios across ${profiles} device profiles: the insets reach the app, every drawing control's tap point is inside the claimable region, nothing scrolls, the Notch Band paints exactly diagnose()'s edges at their insets' depth, and the coloring picker clears the side insets${gallery ? `; gallery at ${join(gallery, 'index.html')}` : ''}`
  );
}

if (isMain(import.meta.url))
  runMain(async () => {
    const { values } = parseArgs({ options: { gallery: { type: 'string' } } });
    await checkNativeWebSafeArea({ gallery: values.gallery ? resolve(values.gallery) : null });
  });
