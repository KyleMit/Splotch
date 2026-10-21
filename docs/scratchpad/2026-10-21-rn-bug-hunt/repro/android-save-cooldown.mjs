import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { SCREENSHOT_COOLDOWN_MS } from '../../../../web/src/lib/drawing/screenshotTiming.ts';
import { adb, capture, guard, input, OUT } from './android-driver.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const LOCAL = '/private/tmp/rn-hunt-save-burst.jsonl';
const REMOTE = '/data/local/tmp/rn-hunt-save-burst.jsonl';
const REGISTER_DELAY_MS = 1500;
const PRESS_MS = 32;
const GAP_MS = 140;
const BURST_TAPS = 8;
const DRAWING_CROP = { left: 250, top: 1300, width: 600, height: 500 };
const registration = JSON.parse(
  readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
);
function ownedImages() {
  const output = adb(
    'shell',
    `content query --uri content://media/external/images/media --projection _id:owner_package_name:is_pending --where "owner_package_name='${PACKAGE}'"`
  ).toString();
  return { output, ids: [...output.matchAll(/_id=(\d+)/g)].map((match) => Number(match[1])) };
}
function saveCenter(xml) {
  const node = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map(([value]) => value)
    .find((value) => value.includes('content-desc="Save screenshot"'));
  assert.ok(node, 'No Save screenshot control');
  assert.ok(node.includes('enabled="true"'), 'Save unavailable before burst');
  const [left, top, right, bottom] = [...node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)]
    .slice(1)
    .map(Number);
  return [Math.round((left + right) / 2), Math.round((top + bottom) / 2)];
}
function published(output, id) {
  const row = output.split('\n').find((line) => line.includes(`_id=${id},`));
  assert.ok(row?.includes('is_pending=0'), `Image ${id} not published`);
}
async function purplePixels(name) {
  const { data, info } = await sharp(`${OUT}/${name}.png`)
    .extract(DRAWING_CROP)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [r, g, b] = data.subarray(offset, offset + 3);
    if (r >= 130 && r <= 210 && g >= 50 && g <= 155 && b >= 170) count++;
  }
  return count;
}
function burst([x, y]) {
  const commands = [registration, { id: 1, command: 'delay', duration: REGISTER_DELAY_MS }];
  const emit = (events) =>
    commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
  for (let index = 0; index < BURST_TAPS; index++) {
    emit([
      3,
      47,
      0,
      3,
      57,
      11 + index,
      3,
      55,
      0,
      3,
      53,
      x,
      3,
      54,
      y,
      3,
      48,
      10,
      1,
      330,
      1,
      1,
      325,
      1,
    ]);
    commands.push({ id: 1, command: 'delay', duration: PRESS_MS });
    emit([3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0]);
    commands.push({ id: 1, command: 'delay', duration: GAP_MS });
  }
  writeFileSync(LOCAL, commands.map((command) => JSON.stringify(command)).join('\n') + '\n');
  adb('push', LOCAL, REMOTE);
  guard();
  const started = Date.now();
  adb('shell', 'uinput', REMOTE);
  return Date.now() - started;
}

try {
  input('swipe', 400, 900, 700, 1100, 500);
  const beforeState = capture('android-save-cooldown-before');
  const center = saveCenter(beforeState);
  const beforePixels = await purplePixels('android-save-cooldown-before');
  const before = ownedImages();
  const burstWallMs = burst(center);
  assert.ok(
    burstWallMs - REGISTER_DELAY_MS < SCREENSHOT_COOLDOWN_MS,
    'Burst exceeded cooldown window'
  );
  input('swipe', 400, 1400, 700, 1600, 500);
  capture('android-save-cooldown-after-burst');
  const after = ownedImages();
  const created = after.ids.filter((id) => !before.ids.includes(id));
  assert.equal(created.length, 1, 'Save burst did not create exactly one owned image');
  published(after.output, created[0]);
  const afterPixels = await purplePixels('android-save-cooldown-after-burst');
  assert.ok(afterPixels > beforePixels, 'Drawing after burst did not add ink');
  input('tap', ...center);
  capture('android-save-cooldown-after-next');
  const next = ownedImages();
  const nextCreated = next.ids.filter((id) => !after.ids.includes(id));
  assert.equal(nextCreated.length, 1, 'Save did not recover after cooldown');
  published(next.output, nextCreated[0]);
  writeFileSync(
    `${OUT}/android-save-cooldown-results.json`,
    JSON.stringify(
      {
        burstTaps: BURST_TAPS,
        scheduledBurstMs: BURST_TAPS * (PRESS_MS + GAP_MS),
        burstWallMs,
        registerDelayMs: REGISTER_DELAY_MS,
        cooldownMs: SCREENSHOT_COOLDOWN_MS,
        before: before.ids,
        after: after.ids,
        next: next.ids,
        created,
        nextCreated,
        drawingCrop: DRAWING_CROP,
        drawingPurplePixels: { before: beforePixels, after: afterPixels },
      },
      null,
      2
    ) + '\n'
  );
  writeFileSync(
    `${OUT}/android-save-cooldown-mediastore.txt`,
    `Before\n${before.output}\nAfter burst\n${after.output}\nAfter cooldown\n${next.output}`
  );
} finally {
  adb('shell', 'rm', '-f', REMOTE);
}
