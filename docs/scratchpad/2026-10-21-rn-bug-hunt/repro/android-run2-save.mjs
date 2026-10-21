import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { open, toggle, restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
const PKG = 'art.splotch.migration.probe',
  STAGE = `/data/user/0/${PKG}/cache/splotch-photo-library-v1`,
  BACKUP = `${STAGE}.rn-hunt-backup`;
function root(cmd) {
  return adb('shell', 'su', '0', 'sh', '-c', `'${cmd}'`).toString();
}
function images() {
  const text = adb(
    'shell',
    `content query --uri content://media/external/images/media --projection _id:owner_package_name:is_pending --where "owner_package_name='${PKG}'"`
  ).toString();
  return { text, ids: [...text.matchAll(/_id=(\d+)/g)].map((m) => +m[1]) };
}
async function pulled(id, name) {
  const bytes = adb(
    'exec-out',
    'content',
    'read',
    '--uri',
    `content://media/external/images/media/${id}`
  );
  writeFileSync(`${OUT}/${name}.png`, bytes);
  const pixels = await sharp(bytes).raw().toBuffer();
  return createHash('sha256').update(pixels).digest('hex');
}
async function clear(name) {
  await inject(name, pathCommands([line([1015, 451], [500, 950])]));
}
const checks = [];
let fault = false;
try {
  let xml = open('Saving', 'android-run2-autosave-enable');
  toggle(xml, 'Auto-Save on Delete', false);
  capture('android-run2-autosave-enabled');
  tap('Close');
  await inject('android-run2-autosave-ink', pathCommands([line([350, 900], [760, 1400])]));
  capture('android-run2-autosave-before');
  const before = images();
  await clear('android-run2-autosave-clear');
  capture('android-run2-autosave-after');
  pause(2000);
  const saved = images(),
    created = saved.ids.filter((n) => !before.ids.includes(n));
  assert.equal(created.length, 1);
  assert.match(saved.text, new RegExp(`_id=${created[0]}.*is_pending=0`));
  const autoHash = await pulled(created[0], 'android-run2-autosaved-output');
  checks.push({ case: 'actual-auto-save-on-delete', status: 'pass', created, autoHash });
  const blankBefore = images();
  await clear('android-run2-autosave-empty-clear');
  capture('android-run2-autosave-empty-after');
  assert.deepEqual(images().ids, blankBefore.ids);
  checks.push({ case: 'empty-clear-no-auto-save', status: 'pass' });
  for (let run = 1; run <= 2; run++) {
    tap('Brushes');
    tap('Pen');
    tap('Purple');
    await inject(
      `android-run2-save-failure-${run}-ink`,
      pathCommands([line([350, 950], [750, 1500])])
    );
    const prior = images();
    tap('Save screenshot');
    capture(`android-run2-save-failure-${run}-reference`);
    const ref = images().ids.filter((n) => !prior.ids.includes(n));
    assert.equal(ref.length, 1);
    const reference = await pulled(ref[0], `android-run2-save-failure-${run}-reference-output`);
    root(`test -d ${STAGE} && test ! -e ${BACKUP} && mv ${STAGE} ${BACKUP} && touch ${STAGE}`);
    fault = true;
    const initial = images();
    await clear(`android-run2-save-failure-${run}-clear`);
    xml = capture(`android-run2-save-failure-${run}-banner`);
    assert.ok(xml.includes('Try again'), 'No held-picture retry');
    assert.deepEqual(images().ids, initial.ids, 'Faulted save created media');
    root(`rm ${STAGE} && mv ${BACKUP} ${STAGE}`);
    fault = false;
    restart(`android-run2-save-failure-${run}-restored-after-death`);
    xml = capture(`android-run2-save-failure-${run}-durable-banner`);
    assert.ok(xml.includes('Try again'), 'Failure did not survive restart');
    tap('Try again');
    capture(`android-run2-save-failure-${run}-retried`);
    pause(2000);
    const after = images(),
      ids = after.ids.filter((n) => !initial.ids.includes(n));
    assert.equal(ids.length, 1);
    const actual = await pulled(ids[0], `android-run2-save-failure-${run}-retry-output`);
    assert.equal(actual, reference, 'Retry saved different pixels');
    checks.push({
      case: `save-failure-${run}-durable-exact-pixel-retry`,
      status: 'pass',
      referenceId: ref[0],
      retriedId: ids[0],
      reference,
      actual,
    });
  }
  xml = open('Saving', 'android-run2-autosave-restore');
  toggle(xml, 'Auto-Save on Delete', true);
  capture('android-run2-autosave-restored');
  tap('Close');
} finally {
  if (fault) {
    root(`rm ${STAGE} && mv ${BACKUP} ${STAGE}`);
    fault = false;
  }
  writeFileSync(
    `${OUT}/android-run2-save-results.json`,
    JSON.stringify({ checks, cacheFaultRestored: !fault }, null, 2) + '\n'
  );
}
