import { chromium, webkit } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { actionFailures, actionRows, summarizeActions } from './action-stats.mjs';
import { parsePerfArgs } from './args.mjs';
import { profilingUrl, runActionSweep, selectedActions } from './ipad-actions.mjs';
import { profilePath } from './paths.mjs';
import { buildAndPreview } from './preview.mjs';
import { ROOT, fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import { waitForUrl } from '../lib/net.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';

const ACTION_PROBE_FILE = join(ROOT, 'scripts', 'perf', 'action-probe.js');
const DEFAULT_VIEWPORT = { width: 1512, height: 982 };
const DEFAULT_DEVICE_SCALE_FACTOR = 2;
const READY_TIMEOUT_MS = 60_000;
const REPEAT_SETTLE_MS = 500;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const SESSION_ID = 'desktop';

const ENGINES = {
  chromium,
  webkit,
};

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`--${name} must be a positive number`);
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer`);
  return parsed;
}

function resolveViewport(value) {
  if (!value) return DEFAULT_VIEWPORT;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) fail(`--viewport=${value} must use WIDTHxHEIGHT`);
  return {
    width: positiveInteger(match[1], 'viewport width'),
    height: positiveInteger(match[2], 'viewport height'),
  };
}

function cssAttributeValue(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

class DesktopWebDriver {
  constructor(page) {
    this.page = page;
    this.elements = new Map();
    this.elementSequence = 0;
    this.pointer = { x: 0, y: 0 };
  }

  orientation() {
    const viewport = this.page.viewportSize();
    return viewport.width > viewport.height ? 'LANDSCAPE' : 'PORTRAIT';
  }

  async registerElement(locator) {
    if ((await locator.count()) === 0) throw new Error('Desktop element was not found');
    const id = `desktop-element-${++this.elementSequence}`;
    this.elements.set(id, locator.first());
    return { [ELEMENT_KEY]: id };
  }

  async elementRect(id) {
    if (id === 'desktop-webview') return this.windowRect();
    const bounds = await this.elements.get(id)?.boundingBox();
    if (!bounds) throw new Error(`Desktop element ${id} has no visible bounds`);
    return bounds;
  }

  windowRect() {
    const viewport = this.page.viewportSize();
    return { x: 0, y: 0, width: viewport.width, height: viewport.height };
  }

  async movePointer(x, y, durationMs) {
    const steps = Math.max(1, Math.round(durationMs / 16));
    const start = this.pointer;
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      const next = {
        x: start.x + (x - start.x) * progress,
        y: start.y + (y - start.y) * progress,
      };
      await this.page.mouse.move(next.x, next.y);
      if (durationMs > 0) await sleep(durationMs / steps);
    }
    this.pointer = { x, y };
  }

  async performActions(sources) {
    const actions = sources.find((source) => source.type === 'pointer')?.actions ?? [];
    for (const action of actions) {
      if (action.type === 'pointerMove') {
        await this.movePointer(action.x, action.y, action.duration ?? 0);
      } else if (action.type === 'pointerDown') {
        await this.page.mouse.down();
      } else if (action.type === 'pointerUp') {
        await this.page.mouse.up();
      } else if (action.type === 'pause') {
        await sleep(action.duration ?? 0);
      }
    }
  }

  async setOrientation(orientation) {
    if (orientation === this.orientation()) return;
    const viewport = this.page.viewportSize();
    await this.page.setViewportSize({ width: viewport.height, height: viewport.width });
  }

  async request(method, path, body = {}) {
    if (method === 'GET' && path.endsWith('/contexts')) return ['WEBVIEW_desktop'];
    if (method === 'POST' && path.endsWith('/context')) return null;
    if (method === 'GET' && path.endsWith('/orientation')) return this.orientation();
    if (method === 'POST' && path.endsWith('/orientation')) {
      await this.setOrientation(body.orientation);
      return null;
    }
    if (method === 'GET' && path.endsWith('/window/rect')) return this.windowRect();
    if (method === 'POST' && path.endsWith('/actions')) {
      await this.performActions(body.actions);
      return null;
    }
    if (method === 'POST' && path.endsWith('/element')) {
      if (body.using === 'class name' && body.value === 'XCUIElementTypeWebView') {
        return { [ELEMENT_KEY]: 'desktop-webview' };
      }
      if (body.using === 'accessibility id') {
        const value = cssAttributeValue(body.value);
        return this.registerElement(this.page.locator(`[aria-label="${value}"]`));
      }
      if (body.using === 'css selector') {
        return this.registerElement(this.page.locator(body.value));
      }
    }
    const elementMatch = /\/element\/([^/]+)\/(rect|click)$/.exec(path);
    if (elementMatch?.[2] === 'rect' && method === 'GET') {
      return this.elementRect(elementMatch[1]);
    }
    if (elementMatch?.[2] === 'click' && method === 'POST') {
      const locator = this.elements.get(elementMatch[1]);
      if (!locator) throw new Error(`Unknown desktop element ${elementMatch[1]}`);
      await locator.click();
      return null;
    }
    throw new Error(`Unsupported desktop WebDriver request: ${method} ${path}`);
  }
}

function browserLaunchOptions(engineName, headless) {
  return engineName === 'chromium'
    ? { headless, executablePath: chromiumExecutablePath(chromium) }
    : { headless };
}

export async function runDesktopActions(argv = process.argv.slice(2)) {
  const { flag, has, port, build } = parsePerfArgs(
    {
      entry: true,
      extra: [
        'engine',
        'url',
        'viewport',
        'device-scale-factor',
        'headed',
        'actions',
        'repeats',
        'label',
        'output',
        'report-only',
      ],
    },
    argv
  );
  const engineName = flag('engine', 'webkit');
  const engine = ENGINES[engineName];
  if (!engine) fail(`--engine must be one of ${Object.keys(ENGINES).join(', ')}`);
  const viewport = resolveViewport(flag('viewport'));
  const deviceScaleFactor = positiveNumber(
    flag('device-scale-factor', DEFAULT_DEVICE_SCALE_FACTOR),
    'device-scale-factor'
  );
  const repeats = positiveInteger(flag('repeats', '3'), 'repeats');
  const actions = selectedActions(flag('actions'));
  const headless = !has('headed');
  const externalUrl = flag('url');
  const preview = externalUrl
    ? { base: new URL(externalUrl).toString(), stop: () => {} }
    : await buildAndPreview(port, { build });
  const { base, stop } = preview;
  if (externalUrl) await waitForUrl(base, READY_TIMEOUT_MS);
  let browser;

  try {
    browser = await engine.launch(browserLaunchOptions(engineName, headless));
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    const page = await context.newPage();
    const client = new DesktopWebDriver(page);
    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    const originalOrientation = client.orientation();
    const samples = [];

    for (let repeat = 1; repeat <= repeats; repeat++) {
      const loadedUrl = profilingUrl(base, repeat);
      await page.goto(loadedUrl, { waitUntil: 'load' });
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#drawingCanvas');
          return !!canvas && canvas.width > 0;
        },
        undefined,
        { timeout: READY_TIMEOUT_MS }
      );
      await page.evaluate(readFileSync(ACTION_PROBE_FILE, 'utf8'));
      await sleep(REPEAT_SETTLE_MS);
      console.log(`\nDesktop action sweep ${repeat}/${repeats}`);
      samples.push(
        ...(await runActionSweep({
          client,
          sessionId: SESSION_ID,
          execute,
          actions,
          originalOrientation,
        }))
      );
    }

    const summaries = summarizeActions(samples);
    const failures = actionFailures(summaries);
    const output =
      flag('output') ??
      join(profilePath('desktop-actions', engineName, flag('label', 'full-suite')), 'actions.json');
    mkdirSync(dirname(output), { recursive: true });
    const artifact = {
      device: {
        name: `Mac desktop (${engineName})`,
        os: process.platform,
      },
      appUrl: base,
      engine: engineName,
      viewport: { ...viewport, deviceScaleFactor },
      headless,
      actions: [...actions],
      repeats,
      samples,
      summaries,
      passed: failures.length === 0,
    };
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log('\nDesktop discrete action response');
    console.table(actionRows(summaries));
    console.log(`\nWrote ${output}`);
    if (failures.length && !has('report-only')) {
      throw new Error(
        `Action frame gates failed: ${failures.map((summary) => summary.label).join(', ')}`
      );
    }
    return artifact;
  } finally {
    await browser?.close();
    stop();
  }
}

if (isMain(import.meta.url)) runMain(runDesktopActions);
