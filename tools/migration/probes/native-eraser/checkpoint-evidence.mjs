import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { captureLive } from './checkpoint-observation.mjs';

const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const ALPHA_THRESHOLD = 4;
export const PROTECTED = { left: 80, top: 80, width: 680, height: 480 };
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function decoded(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.split(',')[1], 'base64');
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export function hasInk(image) {
  return image.data.some((value, index) => index % 4 === 3 && value >= ALPHA_THRESHOLD);
}

export async function transparentPngs(observation) {
  const result = [];
  for (const data of observation.retained) {
    const image = await decoded(data);
    assert.equal(image.info.width, PAPER_WIDTH);
    assert.equal(image.info.height, PAPER_HEIGHT);
    if (image.data.some((value, index) => index % 4 === 3 && value < 255)) result.push(data);
  }
  return result;
}

export async function protectedPixels(data) {
  return sharp(Buffer.from(data.split(',')[1], 'base64'))
    .ensureAlpha()
    .extract(PROTECTED)
    .raw()
    .toBuffer();
}

export function inkCaptures(observation, strokes) {
  return observation.details
    .filter((item) => item.scene && ['checkpoint', 'picture-ink'].includes(item.owner.kind))
    .map((record) => {
      const length = record.scene.prefixLength + record.scene.remainingLength;
      assert.equal(
        record.scene.drawnOperationPrefixJsonSha256,
        sha(JSON.stringify(strokes.slice(0, length)))
      );
      assert.equal(
        record.scene.prefixJsonSha256,
        sha(JSON.stringify(strokes.slice(0, record.scene.prefixLength)))
      );
      const png = observation.callbackPngs.find((item) => item.captureId === record.id);
      assert.ok(png, 'Missing callback PNG for actual captured prefix');
      return { record, data: 'data:image/png;base64,' + png.base64 };
    });
}

export async function causalCases({ openFixture, exportFixture, page, fixtures }) {
  const cases = [],
    comparisons = [],
    geometryObservations = [];
  for (const { name, prefix, masked, drawing } of fixtures) {
    const { strokes } = drawing;
    await openFixture(name, drawing);
    await captureLive(page);
    const observation = await exportFixture(name);
    assert.deepEqual(observation.diagnosticErrors, []);
    const actual = inkCaptures(observation, strokes);
    const final = actual.filter((item) => item.record.owner.kind === 'picture-ink');
    assert.equal(final.length, 1, 'Missing unique ready-plan fixed output');
    const { record: fixed, data } = final[0];
    assert.equal(fixed.scene.prefixLength + fixed.scene.remainingLength, strokes.length);
    const live = observation.details.find((item) => item.owner.kind === 'live-ink');
    assert.ok(live, 'Missing actual visible ink capture');
    assert.equal(
      live.scene.drawnOperationPrefixJsonSha256,
      fixed.scene.drawnOperationPrefixJsonSha256
    );
    const source = masked
      ? actual.find(
          (item) =>
            item.record.owner.kind === 'checkpoint' &&
            item.record.scene.drawnOperationPrefixJsonSha256 === sha(JSON.stringify(prefix))
        )?.record
      : fixed;
    assert.ok(source, 'Missing pre-first-erase source prefix');
    assert.equal(source.magicSemantics.length, 1);
    assert.equal(source.magicSemantics[0].paths.length, 1);
    if (masked)
      assert.equal(fixed.scene.checkpointBase64TextSha256, source.callbackBase64TextSha256);
    const serialized = observation.serialized.find((item) => item.captureId === fixed.id).text;
    assert.equal((serialized.match(/<mask\b/g) ?? []).length, masked ? 1 : 0);
    assert.deepEqual([live.geometry.rect.width, live.geometry.rect.height], [1022, 766]);
    assert.deepEqual([fixed.geometry.rect.width, fixed.geometry.rect.height], [1024, 768]);
    assert.deepEqual(fixed.serializedOuterAttributes, {
      viewBox: '0 0 1024 768',
      width: '1024',
      height: '768',
    });
    assert.equal(observation.serialized.length, observation.details.length, 'Capture SVG missing');
    assert.equal(
      observation.callbackPngs.length,
      observation.details.length,
      'Capture PNG missing'
    );
    for (const item of observation.details)
      assert.ok(item.documentSvgs?.svgs.length, 'Missing concurrent SVG ID inventory');
    const livePng = observation.callbackPngs.find((item) => item.captureId === live.id);
    const fixedBytes = await protectedPixels(data);
    geometryObservations.push({
      name: name + ':geometry-only',
      strictRgbaEqual: fixedBytes.equals(
        await protectedPixels('data:image/png;base64,' + livePng.base64)
      ),
      liveCaptureId: live.id,
      fixedCaptureId: fixed.id,
    });
    cases.push({ name, fixedBytes, id: fixed.id, semantics: source.magicSemantics });
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
    geometryObservations,
    independentControl:
      'Same actual fixed source prefix; checkpoint hash; disjoint mask. Responsive geometry reported separately.',
  };
}

export async function preserveObservation(output, name, observation) {
  const started = performance.now();
  const files = [];
  for (const [label, png] of [
    ['first', observation.retained[0]],
    ['last', observation.retained.at(-1)],
  ]) {
    if (!png) continue;
    const file = `${name}-${label}-transparent.png`;
    await writeFile(join(output, file), Buffer.from(png.split(',')[1], 'base64'));
    files.push(file);
  }
  for (const item of observation.callbackPngs) {
    const file = `${name}-callback-capture-${item.captureId}.png`;
    await writeFile(join(output, file), Buffer.from(item.base64, 'base64'));
    files.push({ file, captureId: item.captureId });
  }
  for (const [index, item] of observation.serialized.entries()) {
    const file = `${name}-serialized-${index}-capture-${item.captureId}.svg.txt`;
    await writeFile(join(output, file), item.text);
    files.push({
      file,
      sha256: createHash('sha256').update(item.text).digest('hex'),
      captureId: item.captureId,
    });
  }
  const retention = {
    ...observation.retention,
    serializedUtf8Bytes: observation.serialized.reduce(
      (sum, item) => sum + Buffer.byteLength(item.text),
      0
    ),
    base64Utf8Bytes: observation.retained.reduce((sum, item) => sum + Buffer.byteLength(item), 0),
    metadataJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(observation.details)),
    preservationMs: performance.now() - started,
    callbackBase64Utf8Bytes: observation.callbackPngs.reduce(
      (sum, item) => sum + Buffer.byteLength(item.base64),
      0
    ),
  };
  const summary = { ...observation, retention, files };
  for (const key of ['retained', 'callbackPngs', 'serialized']) delete summary[key];
  return summary;
}
