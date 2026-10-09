import { checkpointFixtures } from './checkpoint-fixtures.mjs';
import {
  assertMemoryBudget,
  createBrowserMemory,
  finishBrowserAccounting,
  recordResourcePhase,
} from './checkpoint-resources.mjs';
import { installObservation, retained } from './checkpoint-observation.mjs';
import {
  PROTECTED,
  sha,
  decoded,
  hasInk,
  transparentPngs,
  protectedPixels,
  inkCaptures,
  causalCases,
  preserveObservation,
} from './checkpoint-evidence.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const VIEWPORT = { width: 1200, height: 1100 };
const PAGE_TIMEOUT_MS = 30_000;
const FAILURE_TIMEOUT_MS = 15_000;
const MEMORY_SAMPLE_MS = 200;
const SETUP_EVIDENCE_LIMITS = { textChars: 8192, domChars: 32768, storageKeys: 100 };

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
  assert.equal(positive('replay-budget-ms'), 60000);
  assert.equal(positive('rss-growth-budget-mib'), 256);
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
  let server, browser, sampler, page, memoryOwner;
  let baselineRss;
  const replayStarted = performance.now();
  const fixtures = checkpointFixtures();
  report.pageErrors = [];
  report.observations = [];
  report.resourcePhases = [];
  report.fixtures = [];
  const resource = (phase) => {
    peakRss = recordResourcePhase(
      report.resourcePhases,
      phase,
      performance.now() - replayStarted,
      memoryOwner.sample(),
      peakRss
    );
  };
  let memoryFailure;
  let peakRss = 0;
  try {
    server = await chromium.launchServer({ headless: true });
    report.ownedBrowserPid = server.process().pid;
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true });
    page = await context.newPage();
    memoryOwner = createBrowserMemory(report.ownedBrowserPid);
    report.baselineMemory = memoryOwner.sample();
    baselineRss = report.baselineMemory.rssBytes;
    peakRss = baselineRss;
    sampler = setInterval(() => {
      try {
        peakRss = Math.max(peakRss, memoryOwner.sample().rssBytes);
      } catch (error) {
        memoryFailure ??= String(error);
      }
    }, MEMORY_SAMPLE_MS);
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    const errors = report.pageErrors;
    page.on('pageerror', (error) => errors.push(error.message));
    await installObservation(page, PROTECTED);
    const pick = (name) => page.getByRole('button', { name, exact: true }).click();
    async function openFixture(
      name,
      fixture,
      retainAll = true,
      fullDiagnostics = phase !== 'depth'
    ) {
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
        { suffix: String(report.fixtures.length), fixture, retainAll, causal: fullDiagnostics }
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
      report.checks.causal = await causalCases({
        openFixture,
        exportFixture,
        page,
        fixtures: fixtures.causal,
      });
      assert.ok(
        report.checks.causal.comparisons.every((item) => item.strictRgbaEqual),
        'Causal protected raw RGBA comparison failed; diagnostic only'
      );
    } else {
      await openFixture('reference', fixtures.reference, true, true);
      const reference = await exportFixture('reference');
      const referenceInk = inkCaptures(reference, fixtures.reference.strokes).find(
        (item) => item.record.owner.kind === 'picture-ink'
      )?.data;
      assert.ok(referenceInk, 'No transparent production ink capture was observed');
      assert.ok(hasInk(await decoded(referenceInk)));
      const expectedProtected = await protectedPixels(referenceInk);
      if (phase === 'small') {
        await openFixture('roundtrip', fixtures.roundtrip);
        const roundtrip = await exportFixture('roundtrip');
        const roundtripInk = inkCaptures(roundtrip, fixtures.roundtrip.strokes);
        assert.ok(
          roundtripInk.length >= 2,
          'Checkpoint and final production PNG were not both observed'
        );
        for (const { record, data } of roundtripInk) {
          assert.ok(
            record.scene.prefixLength + record.scene.remainingLength >=
              fixtures.reference.strokes.length
          );
          assert.ok(
            expectedProtected.equals(await protectedPixels(data)),
            'Matching-prefix PNG->Image checkpoint changed protected RGBA pixels'
          );
        }
        const loaded = roundtrip.events.find((event) => event.type === 'checkpoint-image-load');
        assert.ok(loaded, 'No actual SVG checkpoint image load observed');
        assert.ok(
          roundtrip.captures.some((capture) => capture.at >= loaded.at),
          'No production PNG captured after actual checkpoint image load'
        );
        assert.ok(roundtrip.maxMaskDepth <= 1);
        report.checks.roundtrip = true;

        await openFixture('redreference', fixtures.redreference);
        const redReference = inkCaptures(
          await exportFixture('red-reference'),
          fixtures.redreference.strokes
        ).find((item) => item.record.owner.kind === 'picture-ink')?.data;
        await openFixture('futureink', fixtures.futureink);
        const futureInk = inkCaptures(
          await exportFixture('future-ink'),
          fixtures.futureink.strokes
        ).find((item) => item.record.owner.kind === 'picture-ink')?.data;
        assert.ok(
          (await protectedPixels(redReference)).equals(await protectedPixels(futureInk)),
          'Later paint was erased or earlier covered ink returned'
        );
        report.checks.futureInk = true;

        await openFixture('failure', fixtures.failure);
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
          fixtures.failure,
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
        const deep = fixtures.depth.strokes;
        assert.equal(deep.length, 1000);
        const replayStart = performance.now();
        await openFixture('depth', fixtures.depth, false);
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
        assert.deepEqual(depth.diagnosticErrors, []);
        const checkpoints = depth.details.filter((item) => item.owner.kind === 'checkpoint');
        assert.equal(
          checkpoints.length,
          498,
          'Rich-prefix depth did not replay every erase boundary'
        );
        for (const item of depth.details.filter((item) => item.scene)) {
          const length = item.scene.prefixLength + item.scene.remainingLength;
          assert.equal(
            item.scene.drawnOperationPrefixJsonSha256,
            sha(JSON.stringify(deep.slice(0, length)))
          );
        }
        for (const item of depth.captures.filter((item) => item.cornerAlpha === 0))
          assert.equal(
            item.protectedRgbaSha256,
            sha(expectedProtected),
            'A serial stage changed protected raw RGBA'
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
    assertMemoryBudget(baselineRss, peakRss, rssGrowthBudgetBytes, memoryFailure);
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
    await finishBrowserAccounting(report, {
      observe: async () => {
        if (!page || page.isClosed()) return { status: 'not-collected-page-closed' };
        return preserveObservation(output, 'terminal', await retained(page));
      },
      verifySource: async () => {
        await assertSource(source);
        return 'exact';
      },
      beginClosing: () => memoryOwner?.beginClosing(),
      closeBrowser: async () => {
        if (!browser) return 'not-created';
        await browser.close();
        return true;
      },
      closeServer: async () => {
        if (!server) return 'not-created';
        await server.close();
        return true;
      },
      sample: () => {
        try {
          const sample = memoryOwner?.sample();
          if (sample) peakRss = Math.max(peakRss, sample.rssBytes);
          return sample;
        } catch (error) {
          memoryFailure ??= String(error);
          throw error;
        }
      },
      stopSampling: () => {
        if (sampler) clearInterval(sampler);
      },
      enforceBudget: () =>
        assertMemoryBudget(baselineRss, peakRss, rssGrowthBudgetBytes, memoryFailure),
      memory: () => ({
        baselineRss,
        peakRss,
        growthBytes: baselineRss === undefined ? undefined : peakRss - baselineRss,
        samplingFailure: memoryFailure ?? null,
        baselinePhase: 'Owned Chromium after context/page creation, before first app navigation',
        endPhase:
          'After awaited supplemental diagnostic, source verification and owned browser shutdown',
        samplingIntervalMs: MEMORY_SAMPLE_MS,
      }),
      elapsed: () => performance.now() - replayStarted,
    });
    if (report.status === 'failed') process.exitCode = 1;
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output }));
  }
}

await main();
