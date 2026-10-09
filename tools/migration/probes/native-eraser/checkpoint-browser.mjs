import {
  installObservation,
  retained,
  preserveObservation,
  captureLive,
} from './checkpoint-observation.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';

const VIEWPORT = { width: 1200, height: 1100 };
const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const PAGE_TIMEOUT_MS = 30_000;
const FAILURE_TIMEOUT_MS = 15_000;
const MEMORY_SAMPLE_MS = 200;
const PROTECTED = { left: 80, top: 80, width: 680, height: 480 };
const ALPHA_THRESHOLD = 4;
const SETUP_EVIDENCE_LIMITS = { textChars: 8192, domChars: 32768, storageKeys: 100 };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function argument(name) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  assert.ok(value, `--${name}= is required`);
  return value;
}

function positive(name) {
  const value = Number(argument(name));
  assert.ok(Number.isFinite(value) && value > 0, `--${name} must be positive`);
  return value;
}

async function assertSource(receipt) {
  assert.equal(resolve(receipt.worktree), process.cwd());
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    receipt.head
  );
  for (const file of receipt.files) {
    const actual = sha(await readFile(join(receipt.worktree, file.path)));
    assert.equal(actual, file.sha256, `Source changed: ${file.path}`);
  }
}

function processTreeRss(pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set([pid]);
  for (;;) {
    const prior = owned.size;
    for (const [child, parent] of rows) if (owned.has(parent)) owned.add(child);
    if (owned.size === prior) break;
  }
  return rows.filter(([child]) => owned.has(child)).reduce((sum, [, , rss]) => sum + rss, 0) * 1024;
}

const line = (brush, color, y) => ({
  brush,
  color,
  points: [120, 680].map((x) => ({ x, y })),
});
const cornerErase = () => ({ brush: 'eraser', points: [{ x: 960, y: 740 }] });
const cornerPaint = () => ({ brush: 'marker', color: 'Green', points: [{ x: 960, y: 690 }] });
const rich = [
  line('pencil', 'Purple', 140),
  line('marker', 'Red', 200),
  { ...line('crayon', 'Blue', 300), seed: 4294967295 },
  {
    brush: 'crayon',
    color: 'Yellow',
    seed: 17,
    points: [240, 360].map((y) => ({ x: 400, y })),
  },
  {
    brush: 'magic',
    rainbow: 3,
    points: [120, 680].map((x) => ({ x, y: 450 })),
  },
];
const drawing = (strokes) => ({ version: 3, pageId: 'blank', rainbow: 3, strokes });

async function decoded(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.split(',')[1], 'base64');
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function hasInk(image) {
  return image.data.some((value, index) => index % 4 === 3 && value >= ALPHA_THRESHOLD);
}

async function transparentPngs(observation) {
  const result = [];
  for (const data of observation.retained) {
    const image = await decoded(data);
    assert.equal(image.info.width, PAPER_WIDTH);
    assert.equal(image.info.height, PAPER_HEIGHT);
    if (image.data.some((value, index) => index % 4 === 3 && value < 255)) result.push(data);
  }
  return result;
}

async function protectedPixels(data) {
  return sharp(Buffer.from(data.split(',')[1], 'base64'))
    .ensureAlpha()
    .extract(PROTECTED)
    .raw()
    .toBuffer();
}

async function main() {
  const url = new URL(argument('url'));
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port);
  assert.ok(isAbsolute(argument('browser-registry')));
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, argument('browser-registry'));
  const output = resolve(argument('output'));
  await mkdir(output, { recursive: false });
  const source = JSON.parse(await readFile(argument('source-receipt'), 'utf8'));
  await assertSource(source);
  const phase = argument('phase');
  assert.ok(['small', 'depth', 'causal'].includes(phase));
  if (phase === 'causal') {
    assert.equal(positive('replay-budget-ms'), 60000);
    assert.equal(positive('rss-growth-budget-mib'), 256);
  }
  const replayBudgetMs = positive('replay-budget-ms');
  const rssGrowthBudgetBytes = positive('rss-growth-budget-mib') * 1024 * 1024;
  const report = {
    startedAt: new Date().toISOString(),
    source,
    url: url.href,
    phase,
    status: 'running',
    checks: {},
    memoryScope:
      'Sum of RSS for this owned Chromium process tree; shared mappings may be counted more than once. This is browser evidence only.',
    replayBudgetMs,
    rssGrowthBudgetBytes,
  };
  let server, browser, sampler, page;
  let baselineRss;
  const replayStarted = performance.now();
  report.pageErrors = [];
  report.observations = [];
  report.resourcePhases = [];
  report.fixtures = [];
  const resource = (phase) =>
    report.resourcePhases.push({
      phase,
      elapsedMs: performance.now() - replayStarted,
      rssBytes: processTreeRss(report.ownedBrowserPid),
    });
  let memoryFailure;
  let peakRss = 0;
  try {
    server = await chromium.launchServer({ headless: true });
    report.ownedBrowserPid = server.process().pid;
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
    page = await context.newPage();
    baselineRss = processTreeRss(report.ownedBrowserPid);
    peakRss = baselineRss;
    sampler = setInterval(() => {
      try {
        peakRss = Math.max(peakRss, processTreeRss(report.ownedBrowserPid));
      } catch (error) {
        memoryFailure ??= String(error);
      }
    }, MEMORY_SAMPLE_MS);
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    const errors = report.pageErrors;
    page.on('pageerror', (error) => errors.push(error.message));
    await installObservation(page);
    const pick = (name) => page.getByRole('button', { name, exact: true }).click();
    async function openFixture(name, fixture, retainAll = true) {
      const record = {
        name,
        drawing: fixture,
        admission: 'pending',
      };
      record.strokesJsonSha256 = sha(JSON.stringify(fixture.strokes));
      report.fixtures.push(record);
      resource(name + ':navigation-start');
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
      record.storageKey = await page.evaluate(
        ({ suffix, fixture, retainAll, causal }) => {
          for (const key of Object.keys(localStorage))
            if (key.startsWith('splotch-picture:')) localStorage.removeItem(key);
          const key = `splotch-picture:picture-${Date.now()}-${suffix}`;
          localStorage.setItem(key, JSON.stringify(fixture));
          globalThis.__eraserCheckpointProbe.retainAll = retainAll;
          globalThis.__eraserCheckpointProbe.causal = causal;
          return key;
        },
        { suffix: String(report.fixtures.length), fixture, retainAll, causal: phase === 'causal' }
      );
      await pick('Pictures');
      const open = page.getByRole('button', { name: /Open picture from/ });
      await expect(open).toHaveCount(1);
      record.admission = 'listed-through-production-listPictures';
      await open.click();
      await page.getByText('Picture opened. Undo returns to your previous picture.').waitFor();
      record.admission = 'opened-through-production-parser';
      await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled({
        timeout: replayBudgetMs,
      });
    }
    async function exportFixture(name) {
      resource(name + ':export-start');
      const downloaded = page.waitForEvent('download');
      await pick('Export PNG');
      const file = join(output, name + '.png');
      await (await downloaded).saveAs(file);
      await page.getByText('PNG ready. Your picture is still here.').waitFor();
      resource(name + ':export-complete');
      const observation = await retained(page);
      report.observations.push(await preserveObservation(output, name, observation));
      return observation;
    }
    if (phase === 'causal') {
      report.checks.causal = await causalCases(openFixture, exportFixture, page);
      assert.ok(
        report.checks.causal.comparisons.every((item) => item.strictRgbaEqual),
        'Causal protected raw RGBA comparison failed; diagnostic only'
      );
    } else {
      await openFixture('reference', drawing(rich));
      const reference = await exportFixture('reference');
      const referenceInk = (await transparentPngs(reference)).at(-1);
      assert.ok(referenceInk, 'No transparent production ink capture was observed');
      assert.ok(hasInk(await decoded(referenceInk)));
      const expectedProtected = await protectedPixels(referenceInk);
      if (phase === 'small') {
        await openFixture(
          'roundtrip',
          drawing([...rich, cornerErase(), cornerPaint(), cornerErase()])
        );
        const roundtrip = await exportFixture('roundtrip');
        const roundtripInk = await transparentPngs(roundtrip);
        assert.ok(
          roundtripInk.length >= 2,
          'Checkpoint and final production PNG were not both observed'
        );
        for (const png of roundtripInk)
          assert.ok(
            expectedProtected.equals(await protectedPixels(png)),
            'PNG->Image checkpoint changed protected RGBA pixels'
          );
        const loaded = roundtrip.events.find((event) => event.type === 'checkpoint-image-load');
        assert.ok(loaded, 'No actual SVG checkpoint image load observed');
        assert.ok(
          roundtrip.captures.some((capture) => capture.at >= loaded.at),
          'No production PNG captured after actual checkpoint image load'
        );
        assert.ok(roundtrip.maxMaskDepth <= 1);
        report.checks.roundtrip = true;

        const red = line('marker', 'Red', 200);
        await openFixture('redreference', drawing([red]));
        const redReference = (await transparentPngs(await exportFixture('red-reference'))).at(-1);
        await openFixture(
          'futureink',
          drawing([
            line('marker', 'Blue', 200),
            { brush: 'eraser', points: red.points },
            red,
            cornerErase(),
          ])
        );
        const futureInk = (await transparentPngs(await exportFixture('future-ink'))).at(-1);
        assert.ok(
          (await protectedPixels(redReference)).equals(await protectedPixels(futureInk)),
          'Later paint was erased or earlier covered ink returned'
        );
        report.checks.futureInk = true;

        await openFixture('failure', drawing([red]));
        const beforeFailure = await page.getByTestId('drawing-paper').screenshot();
        await page.evaluate(() => {
          globalThis.__eraserCheckpointProbe.mode = 'drop-next-svg-load';
        });
        await pick('Clear');
        await page
          .getByText(/capture.*did not finish/i)
          .first()
          .waitFor({ timeout: FAILURE_TIMEOUT_MS });
        assert.ok(
          beforeFailure.equals(await page.getByTestId('drawing-paper').screenshot()),
          'Timeout changed live artwork'
        );
        await page.evaluate(() => {
          for (const delayed of globalThis.__eraserCheckpointProbe.delayed.splice(0)) {
            delayed.callback?.call(delayed.image, new Event('load'));
            delayed.callback?.call(delayed.image, new Event('load'));
          }
        });
        assert.ok(
          beforeFailure.equals(await page.getByTestId('drawing-paper').screenshot()),
          'Late or duplicate callback changed live artwork'
        );
        await pick('Save picture');
        await page.getByText('Picture saved on this device.').waitFor();
        const saved = await page.evaluate(
          () =>
            Object.entries(localStorage)
              .filter(([key]) => key.startsWith('splotch-picture:'))
              .map(([key, value]) => ({ key, value: JSON.parse(value) }))
              .sort((a, b) => Number(b.key.split('-')[1]) - Number(a.key.split('-')[1]))[0].value
        );
        assert.deepEqual(
          saved,
          drawing([red]),
          'Failed observation changed the saved drawing/rainbow'
        );
        report.checks.timeoutRetentionAndLateCallback = true;
        const totalSmallMs = performance.now() - replayStarted;
        assert.ok(
          totalSmallMs <= replayBudgetMs,
          'SMALL replay/export/control work exceeded the supplied budget'
        );
        report.checks.smallBudget = { totalSmallMs, baselineRss, peakRss };
        assert.ok(
          report.observations.every((item) => item.maxMaskDepth <= 1 && item.maxImages <= 4),
          'Production mask/image bounds exceeded'
        );
      }
      if (phase === 'depth') {
        const deep = [
          ...rich,
          ...Array.from({ length: 995 }, (_, index) => (index % 2 ? cornerPaint() : cornerErase())),
        ];
        assert.equal(deep.length, 1000);
        const replayStart = performance.now();
        await openFixture('depth', drawing(deep), false);
        const reopenedMs = performance.now() - replayStart;
        const depth = await exportFixture('depth');
        const totalReplayExportMs = performance.now() - replayStart;
        const depthInk = await transparentPngs(depth);
        assert.equal(
          depthInk.length,
          2,
          'Initial and final transparent production depth PNG were not both retained'
        );
        for (const png of depthInk)
          assert.ok(
            expectedProtected.equals(await protectedPixels(png)),
            'Repeated checkpoints changed protected pixels'
          );
        assert.ok(
          depth.captures.length >= 499,
          'Legal-depth checkpoint workload was not exercised'
        );
        assert.ok(depth.maxMaskDepth <= 1, 'Production scene grew nested erase masks');
        assert.ok(depth.maxImages <= 4, 'Production scene retained extra checkpoint images');
        assert.ok(
          totalReplayExportMs <= replayBudgetMs,
          'Legal-depth serial replay/export exceeded the supplied budget'
        );
        report.checks.depth = {
          operations: deep.length,
          captures: depth.captures.length,
          reopenedMs,
          totalReplayExportMs,
          maxMaskDepth: depth.maxMaskDepth,
          maxImages: depth.maxImages,
          baselineRss,
          peakRss,
        };
      }
    }
    assert.equal(memoryFailure, undefined);
    assert.ok(
      peakRss - baselineRss <= rssGrowthBudgetBytes,
      'Owned browser RSS growth exceeded the supplied budget'
    );
    assert.deepEqual(errors, []);
    await assertSource(source);
    report.status = 'passed-browser-only';
  } catch (error) {
    report.status = 'failed';
    report.firstFailure = error instanceof Error ? error.stack : String(error);
    if (page && report.fixtures.at(-1)?.admission !== 'opened-through-production-parser')
      report.setupFailure = await page
        .evaluate((limits) => {
          const root = document.getElementById('root');
          return {
            appText: root?.innerText.slice(0, limits.textChars),
            appDom: root?.outerHTML.slice(0, limits.domChars),
            fixtureStorageKeys: Object.keys(localStorage)
              .filter((key) => key.startsWith('splotch-picture:'))
              .slice(0, limits.storageKeys),
          };
        }, SETUP_EVIDENCE_LIMITS)
        .catch((error) => ({ observationFailure: String(error) }));
    process.exitCode = 1;
  } finally {
    if (sampler) clearInterval(sampler);
    if (report.ownedBrowserPid) {
      try {
        peakRss = Math.max(peakRss, processTreeRss(report.ownedBrowserPid));
      } catch (error) {
        memoryFailure ??= String(error);
      }
    }
    report.memory = {
      baselineRss,
      peakRss,
      growthBytes: baselineRss === undefined ? undefined : peakRss - baselineRss,
      samplingFailure: memoryFailure ?? null,
      baselinePhase: 'Owned Chromium after context/page creation, before first app navigation',
    };
    report.totalElapsedMs = performance.now() - replayStarted;
    if (page && !page.isClosed()) {
      try {
        const observation = await retained(page);
        report.terminalObservation = await preserveObservation(output, 'terminal', observation);
      } catch (error) {
        report.terminalObservationFailure = String(error);
      }
    }
    report.sourceAfter = await assertSource(source).then(
      () => 'exact',
      (error) => {
        process.exitCode = 1;
        return String(error);
      }
    );
    await browser?.close();
    await server?.close();
    report.closedAt = new Date().toISOString();
    report.liveOwnedHandles = [];
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output }));
  }
}

await main();

async function causalCases(openFixture, exportFixture, page) {
  const cases = [],
    comparisons = [];
  for (const [group, prefix] of [
    ['magic', [rich[4]]],
    ['crayon-magic', rich.slice(2)],
  ]) {
    for (const masked of [false, true]) {
      const name = `${group}-${masked ? 'disjoint-mask' : 'bare'}`;
      const strokes = masked ? [...prefix, cornerErase()] : prefix;
      await openFixture(name, drawing(strokes));
      await captureLive(page);
      const observation = await exportFixture(name);
      assert.deepEqual(observation.diagnosticErrors, []);
      const ink = observation.details.filter((item) => item.scene && !item.scene.checkpointId);
      const live = ink.find((item) => item.livePaper),
        fixed = ink.find((item) => !item.livePaper);
      assert.ok(live && fixed, 'Missing matching production live/hidden ink captures');
      assert.equal(
        live.scene.drawnOperationPrefixJsonSha256,
        fixed.scene.drawnOperationPrefixJsonSha256
      );
      assert.deepEqual(live.magicSemantics, fixed.magicSemantics);
      assert.equal(fixed.magicSemantics.length, 1);
      assert.equal(fixed.magicSemantics[0].paths.length, 1);
      const serialized = observation.serialized.find((item) => item.captureId === fixed.id).text;
      assert.equal((serialized.match(/<mask\b/g) ?? []).length, masked ? 1 : 0);
      assert.deepEqual([live.geometry.rect.width, live.geometry.rect.height], [1022, 766]);
      assert.deepEqual([fixed.geometry.rect.width, fixed.geometry.rect.height], [1024, 768]);
      assert.deepEqual(fixed.serializedOuterAttributes, {
        viewBox: '0 0 1024 768',
        width: '1024',
        height: '768',
      });
      const count = observation.details.length;
      assert.equal(observation.serialized.length, count, 'Capture SVG missing');
      assert.equal(observation.callbackPngs.length, count, 'Capture PNG missing');
      for (const item of observation.details)
        assert.ok(item.documentSvgs?.svgs.length, 'Missing concurrent document SVG ID inventory');
      const get = (item) =>
        'data:image/png;base64,' +
        observation.callbackPngs.find((png) => png.captureId === item.id).base64;
      const liveBytes = await protectedPixels(get(live)),
        fixedBytes = await protectedPixels(get(fixed));
      comparisons.push({
        name: name + ':geometry-only',
        strictRgbaEqual: liveBytes.equals(fixedBytes),
        liveCaptureId: live.id,
        fixedCaptureId: fixed.id,
      });
      cases.push({ name, fixedBytes, id: fixed.id, semantics: fixed.magicSemantics });
    }
  }
  for (let index = 0; index < cases.length; index += 2) {
    const pair = cases.slice(index, index + 2);
    assert.deepEqual(pair[0].semantics, pair[1].semantics);
    comparisons.push({
      name: `fixed1024-${pair[0].name}-versus-disjoint-mask`,
      strictRgbaEqual: pair[0].fixedBytes.equals(pair[1].fixedBytes),
      captureIds: pair.map((item) => item.id),
    });
  }
  return {
    diagnosticOnly: true,
    comparisons,
    independentControl: 'Same Magic semantics; disjoint mask; same-prefix geometry.',
  };
}
