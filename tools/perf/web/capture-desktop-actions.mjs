import { chromium, firefox, webkit } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MIN_GATED_SAMPLES,
  WARMUP_REPEATS,
  actionFailures,
  actionRows,
  rotationFirstFrameNa,
  summarizeActions,
} from '../lib/action-stats.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { profilingUrl, runActionSweep, selectedActions } from '../ios/capture-xcuitest-actions.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { assertServedBuildIsFresh, buildAndPreview } from '../lib/profile-preview.mjs';
import { ROOT, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { chromiumExecutablePath } from '../../lib/playwright.mjs';
import { PlaywrightWebDriver } from '../lib/webdriver-client.mjs';
import {
  ensureCampaignTheme,
  parseCampaignTheme,
  readResolvedTheme,
} from '../lib/campaign-state.mjs';

const ACTION_PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js');
// The runtime this transport is judged as (tools/perf/lib/input-fidelity.mjs
// vocabulary, and the mac-* targets' declared `captureRuntime`). One runtime
// spans all three engines; rotation first-frame applicability additionally
// keys on the engine (ROTATION_INERT_DESKTOP_ENGINES).
const DESKTOP_CAPTURE_RUNTIME = 'desktop-playwright';
const DEFAULT_VIEWPORT = { width: 1512, height: 982 };
const DEFAULT_DEVICE_SCALE_FACTOR = 2;
const READY_TIMEOUT_MS = 60_000;
const REPEAT_SETTLE_MS = 500;
const SESSION_ID = 'desktop';

const ENGINES = {
  chromium,
  firefox,
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

export function resolveViewport(value) {
  if (!value) return DEFAULT_VIEWPORT;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) fail(`--viewport=${value} must use WIDTHxHEIGHT`);
  return {
    width: positiveInteger(match[1], 'viewport width'),
    height: positiveInteger(match[2], 'viewport height'),
  };
}

export function hasMinimumActionRepeats(repeats) {
  return repeats >= WARMUP_REPEATS + MIN_GATED_SAMPLES;
}

function browserLaunchOptions(engineName, headless) {
  return engineName === 'chromium'
    ? { headless, executablePath: chromiumExecutablePath(chromium) }
    : { headless };
}

// The artifact envelope, as a pure value (the drivenCaptureArtifact pattern):
// the fields a later reader TRUSTS — `captureRuntime` feeding the matrix's
// runtime-agreement check and `engine` feeding the per-engine rotation
// declaration — can be asserted without launching a browser.
export function desktopActionsArtifact({
  engineName,
  base,
  viewport,
  deviceScaleFactor,
  headless,
  theme,
  settingsShell,
  actions,
  repeats,
  samples,
  summaries,
  passed,
}) {
  return {
    device: {
      name: `Mac desktop (${engineName})`,
      os: process.platform,
    },
    appUrl: base,
    engine: engineName,
    // Recorded so the matrix's runtime-agreement check has an artifact side
    // to compare against the target's declared runtime — a desktop capture
    // folded into a device target (or vice versa) must collide, not score
    // under the other's rotation rules.
    captureRuntime: DESKTOP_CAPTURE_RUNTIME,
    viewport: { ...viewport, deviceScaleFactor },
    headless,
    theme,
    settingsShell,
    actions,
    repeats,
    samples,
    summaries,
    passed,
  };
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
        'allow-foreign-build',
        'theme',
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
  const repeats = positiveInteger(flag('repeats', '4'), 'repeats');
  if (!hasMinimumActionRepeats(repeats)) {
    fail(`--repeats must provide one warmup and ${MIN_GATED_SAMPLES} scored samples`);
  }
  const actions = selectedActions(flag('actions'));
  const requestedTheme = parseCampaignTheme(flag('theme'));
  const headless = !has('headed');
  const externalUrl = flag('url');
  const preview = externalUrl
    ? { base: new URL(externalUrl).toString(), stop: () => {} }
    : await buildAndPreview(port, { build });
  const { base, stop } = preview;
  // A `--url` capture skips buildAndPreview, which is where the build is normally
  // proved — and that is the path every campaign cell takes, so without this the
  // identity assertion covered only the path nobody uses.
  if (externalUrl) {
    await waitForUrl(base, READY_TIMEOUT_MS);
    await assertServedBuildIsFresh(base, { allowForeignBuild: has('allow-foreign-build') });
  }
  let browser;

  try {
    browser = await engine.launch(browserLaunchOptions(engineName, headless));
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    const page = await context.newPage();
    const client = new PlaywrightWebDriver(page, { useWheelForScroll: true });
    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    const originalOrientation = await client.orientation();
    let settingsShell = null;
    const samples = [];
    const expectedLabels = new Set();
    let baselineTheme;

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
      await ensureCampaignTheme(execute, requestedTheme);
      baselineTheme = await readResolvedTheme(execute);
      await page.evaluate(readFileSync(ACTION_PROBE_FILE, 'utf8'));
      await sleep(REPEAT_SETTLE_MS);
      console.log(`\nDesktop action sweep ${repeat}/${repeats}`);
      const sweep = await runActionSweep({
        client,
        sessionId: SESSION_ID,
        execute,
        actions,
        originalOrientation,
        baselineTheme,
      });
      settingsShell = sweep.settingsShell;
      if (repeat <= WARMUP_REPEATS) {
        for (const sample of sweep.samples) expectedLabels.add(sample.label);
      }
      samples.push(
        ...sweep.samples.map((sample) => ({
          ...sample,
          repeat,
          warmup: repeat <= WARMUP_REPEATS,
        }))
      );
    }

    const summaries = summarizeActions(samples, expectedLabels, {}, (label) =>
      rotationFirstFrameNa(DESKTOP_CAPTURE_RUNTIME, label, engineName)
    );
    const failures = actionFailures(summaries);
    const output =
      flag('output') ??
      join(profilePath('desktop-actions', engineName, flag('label', 'full-suite')), 'actions.json');
    mkdirSync(dirname(output), { recursive: true });
    const artifact = desktopActionsArtifact({
      engineName,
      base,
      viewport,
      deviceScaleFactor,
      headless,
      theme: baselineTheme,
      settingsShell,
      actions: [...actions],
      repeats,
      samples,
      summaries,
      passed: failures.length === 0,
    });
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
