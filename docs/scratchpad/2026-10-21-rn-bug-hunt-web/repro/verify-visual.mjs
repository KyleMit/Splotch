import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { boxDifferences } from './visual-metrics.mjs';
const SAMPLE_SIDE_PX = 16;
const MIN_THEME_CHANNEL_DIFFERENCE = 100;
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web',
  root = `${out}/evidence/visual`;
const viewports = [
  'phone-320x568',
  'phone-375x667',
  'phone-390x844',
  'phone-412x915',
  'phone-844x390',
  'tablet-820x1180',
  'tablet-1180x820',
  'desktop-1280x800',
  'desktop-1920x1080',
];
const states = [
  'blank',
  'drawer',
  'picker',
  'brush',
  'width',
  'settings',
  'clear-drag',
  'coloring',
];
const expected = new Set();
for (const engine of ['chromium', 'webkit', 'firefox'])
  for (const vp of viewports.filter((v) => engine === 'chromium' || !v.startsWith('tablet')))
    for (const theme of ['light', 'dark'])
      for (const style of ['buttons', 'bare'])
        for (const size of [100, 130])
          for (const state of states)
            expected.add(`${engine}/${vp}/${theme}-${style}-${size}/${state}`);
const comparisons = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const f = path + '/' + e.name;
    if (e.isDirectory()) walk(f);
    else if (e.name === 'comparison.json') comparisons.push(JSON.parse(readFileSync(f, 'utf8')));
  }
}
walk(root);
assert.equal(expected.size, 1472);
assert.equal(comparisons.length, expected.size);
const errors = [],
  externals = [],
  metrics = [];
for (const row of comparisons) {
  assert(expected.delete(row.id), `Unexpected or duplicate pair ${row.id}`);
  assert.equal(row.status, 'COMPARED', row.id);
  assert.equal(row.unsettled.length, 0, row.id);
  const [width, height] = row.viewport.split('-').at(-1).split('x').map(Number);
  const arms = {};
  for (const arm of ['shipping', 'rn']) {
    const dir = `${root}/${row.id}`,
      capture = JSON.parse(readFileSync(`${dir}/${arm}.json`, 'utf8')),
      bytes = readFileSync(`${dir}/${arm}.png`);
    arms[arm] = capture;
    assert.equal(capture.status, 'CAPTURED');
    assert.equal(capture.settled, true);
    assert.equal(capture.viewport.width, width);
    assert.equal(capture.viewport.height, height);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      capture.sha256,
      `${row.id}/${arm} image hash`
    );
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.format, 'png');
    assert(Object.keys(capture.boxes).length > 0, `${row.id}/${arm} has no measured controls`);
    if (capture.errors?.length) errors.push({ id: row.id, arm, errors: capture.errors });
    if (capture.external?.length) externals.push({ id: row.id, arm, requests: capture.external });
    if (row.state === 'clear-drag')
      assert(capture.stateReceipt, `${row.id}/${arm} lacks held-drag receipt`);
  }
  const boxes = boxDifferences(arms.shipping.boxes, arms.rn.boxes).filter(
    (d) => d.key !== 'drawer-container-shipping-only'
  );
  assert.deepEqual(row.boxDifferences, boxes, `${row.id} box calculation`);
  assert.equal(row.pixel.width, width);
  assert.equal(row.pixel.height, height);
  assert.equal(row.pixel.threshold, 16);
  assert(row.pixel.changedPixels >= 0 && row.pixel.changedPixels <= width * height);
  const diffMeta = await sharp(`${root}/${row.id}/diff.png`).metadata();
  assert.equal(diffMeta.width, width);
  assert.equal(diffMeta.height, height);
  metrics.push({ id: row.id, percent: row.pixel.percent, boxDifferences: boxes.length });
}
assert.equal(expected.size, 0);
assert.deepEqual(externals, [], 'Unexpected resource denied by the visual harness');
const fixtureChecks = [];
async function decodedPixelHash(path) {
  const pixels = await sharp(path).ensureAlpha().raw().toBuffer();
  return createHash('sha256').update(pixels).digest('hex');
}
async function centerLuminance(path, viewport) {
  const [width, height] = viewport.split('-').at(-1).split('x').map(Number);
  const stats = await sharp(path)
    .extract({
      left: Math.floor(width / 2 - SAMPLE_SIDE_PX / 2),
      top: Math.floor(height / 2 - SAMPLE_SIDE_PX / 2),
      width: SAMPLE_SIDE_PX,
      height: SAMPLE_SIDE_PX,
    })
    .removeAlpha()
    .stats();
  return stats.channels.reduce((sum, c) => sum + c.mean, 0) / stats.channels.length;
}
for (const engine of ['chromium', 'webkit', 'firefox'])
  for (const viewport of viewports.filter((v) => engine === 'chromium' || !v.startsWith('tablet')))
    for (const arm of ['shipping', 'rn']) {
      const file = (theme, style, size, state) =>
        `${root}/${engine}/${viewport}/${theme}-${style}-${size}/${state}/${arm}`;
      for (const theme of ['light', 'dark'])
        for (const style of ['buttons', 'bare']) {
          const a = JSON.parse(readFileSync(file(theme, style, 100, 'drawer') + '.json')),
            b = JSON.parse(readFileSync(file(theme, style, 130, 'drawer') + '.json'));
          assert(
            b.boxes['control:brushes'].width > a.boxes['control:brushes'].width,
            `${engine}/${viewport}/${arm}: size fixture did not enlarge Brushes`
          );
        }
      for (const theme of ['light', 'dark'])
        assert.notEqual(
          await decodedPixelHash(file(theme, 'buttons', 100, 'drawer') + '.png'),
          await decodedPixelHash(file(theme, 'bare', 100, 'drawer') + '.png'),
          `${engine}/${viewport}/${arm}: style fixtures identical`
        );
      assert.notEqual(
        await decodedPixelHash(file('light', 'buttons', 100, 'blank') + '.png'),
        await decodedPixelHash(file('dark', 'buttons', 100, 'blank') + '.png'),
        `${engine}/${viewport}/${arm}: theme fixtures identical`
      );
      const lightLuminance = await centerLuminance(
        file('light', 'buttons', 100, 'blank') + '.png',
        viewport
      );
      const darkLuminance = await centerLuminance(
        file('dark', 'buttons', 100, 'blank') + '.png',
        viewport
      );
      assert(
        lightLuminance > darkLuminance + MIN_THEME_CHANNEL_DIFFERENCE,
        `${engine}/${viewport}/${arm}: paper theme luminance did not change`
      );
      fixtureChecks.push({
        engine,
        viewport,
        arm,
        buttonSizeChangesBounds: true,
        styleAndThemeChangePixels: true,
        lightPaperMeanChannel: lightLuminance,
        darkPaperMeanChannel: darkLuminance,
      });
    }
const receipt = {
  at: new Date().toISOString(),
  expectedPairs: 1472,
  verifiedPairs: comparisons.length,
  verifiedOriginalPngs: comparisons.length * 2,
  verifiedDiffPngs: comparisons.length,
  sourceImageHashesMatch: true,
  dimensionsMatch: true,
  allFramesSettled: true,
  allDragStatesHaveMovementReceipts: true,
  recomputedBoxListsMatch: true,
  pageErrors: errors,
  blockedExternalRequests: externals,
  fixtureChecks,
  largestPixelDifferences: metrics.sort((a, b) => b.percent - a.percent).slice(0, 20),
};
writeFileSync(`${out}/evidence/visual-verification.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    pairs: comparisons.length,
    pageErrors: errors.length,
    externalReceipts: externals.length,
    fixtureChecks: fixtureChecks.length,
  })
);
