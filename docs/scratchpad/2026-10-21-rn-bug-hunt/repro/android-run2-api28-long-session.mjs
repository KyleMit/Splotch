import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { MAX_UNDO_DEPTH } from '../../../../web/src/lib/drawing/undoHistory.ts';
import { deviceDriver, PKG, OUT, nodes, center, pause } from './android-device-driver.mjs';
import { kernelTouch } from './android-run2-api28-kernel-touch.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = 'android-run2-emulator-5684-long';
const STROKES = 2000,
  BATCH = 200,
  STROKE_MS = 100,
  GAP_MS = 50,
  SETTLE_MS = 30000,
  UNDO_EVICTION_STROKES = MAX_UNDO_DEPTH;
const samples = [],
  batches = [];
const inputLog = `${OUT}/${prefix}-inputs.jsonl`,
  memoryLog = `${OUT}/${prefix}-memory.jsonl`;
writeFileSync(inputLog, '');
writeFileSync(memoryLog, '');
let completed = 0,
  scenarioError = null,
  sinceMs = Date.now(),
  startStamp = androidNow(serial);
function sample(stage) {
  const raw = d.adb('shell', 'dumpsys', 'meminfo', PKG).toString();
  writeFileSync(`${OUT}/${prefix}-${stage}.meminfo.txt`, raw);
  const pss = raw.match(/TOTAL PSS:\s*(\d+)/) ?? raw.match(/TOTAL\s+(\d+)/);
  const native = raw.match(/Native Heap\s+(\d+)/);
  const row = {
    at: new Date().toISOString(),
    strokes: completed,
    stage,
    pssKb: pss ? Number(pss[1]) : null,
    nativePssKb: native ? Number(native[1]) : null,
    nativeHeapRow: raw.split('\n').find((l) => /^\s*Native Heap\s/.test(l)),
    pid: d.adb('shell', 'pidof', PKG).toString().trim(),
  };
  samples.push(row);
  appendFileSync(memoryLog, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
  return row;
}
async function inkPixels(tag) {
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .extract({ left: 220, top: 500, width: 650, height: 1000 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let colored = 0;
  for (let i = 0; i < data.length; i += info.channels)
    if (
      Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) >
      50
    )
      colored++;
  return colored;
}
function stroke(index, eviction = false) {
  const x = 300 + ((index * 37) % 400),
    y = 650 + ((index * 53) % 700);
  d.adb(
    'shell',
    'input',
    'swipe',
    String(x),
    String(y),
    String(x + 70),
    String(y + 40),
    String(STROKE_MS)
  );
  appendFileSync(
    inputLog,
    JSON.stringify({
      index: index + 1,
      eviction,
      at: new Date().toISOString(),
      from: [x, y],
      to: [x + 70, y + 40],
      durationMs: STROKE_MS,
    }) + '\n'
  );
  pause(GAP_MS);
}
try {
  d.restart();
  let xml = d.capture(`${prefix}-start`);
  if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
  d.tap('Settings');
  d.scrollTap('Saving');
  xml = d.capture(`${prefix}-saving-precondition`);
  assert.ok(
    nodes(xml).some(
      (n) =>
        n.token.includes('content-desc="Auto-Save on Delete"') &&
        n.token.includes('class="android.widget.Switch"') &&
        n.token.includes('checked="false"')
    ),
    'Auto-Save must be off for the memory-only Clear'
  );
  d.tap('Close');
  d.tap('Purple');
  d.tap('Brushes');
  d.tap('Pen');
  d.tap('Stroke width');
  d.tap('Size 3');
  d.capture(`${prefix}-blank`);
  sinceMs = Date.now();
  startStamp = androidNow(serial);
  sample('baseline');
  for (let offset = 0; offset < STROKES; offset += BATCH) {
    d.guard();
    const at = Date.now();
    for (let j = 0; j < BATCH; j++) {
      if (j % 50 === 0) d.guard();
      stroke(offset + j);
      completed++;
    }
    batches.push({ strokes: completed, wallMs: Date.now() - at });
    sample(`strokes-${completed}`);
    d.capture(`${prefix}-${completed}`);
    appendFileSync(
      'docs/scratchpad/2026-10-21-rn-bug-hunt/status.md',
      `\n- ${new Date().toISOString().slice(11, 16)}Z API 28 supplementary memory run: ${completed}/${STROKES} delivered strokes; meminfo checkpoint saved. Phone-specific long session remains pending while emulator-5680 is unresponsive.\n`
    );
  }
  const current = d.source(),
    clear = nodes(current).find(
      (n) => n.visible && n.token.includes('content-desc="Clear drawing"')
    );
  assert.ok(clear);
  await kernelTouch(`${prefix}-clear`, [line(center(clear.token), [540, 1000])]);
  d.capture(`${prefix}-cleared`);
  assert.ok((await inkPixels(`${prefix}-2000`)) > 500, 'Long session did not leave visible ink');
  assert.equal(await inkPixels(`${prefix}-cleared`), 0, 'Clear did not clear the long-session ink');
  sample('after-clear');
  pause(SETTLE_MS);
  sample('after-clear-30s');
  for (let j = 0; j < UNDO_EVICTION_STROKES; j++) stroke(STROKES + j, true);
  d.capture(`${prefix}-undo-evicted`);
  sample('after-undo-eviction');
  pause(SETTLE_MS);
  sample('after-undo-eviction-30s');
} catch (error) {
  scenarioError = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  let source = '';
  try {
    source = d.capture(`${prefix}-final`);
  } catch {}
  const verdict = androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source });
  const baseline = samples.find((s) => s.stage === 'baseline')?.pssKb,
    peak = samples.find((s) => s.stage === 'strokes-2000')?.pssKb,
    after = samples.find((s) => s.stage === 'after-undo-eviction-30s')?.pssKb;
  const retainedGrowthKb =
    baseline !== null && baseline !== undefined && after !== null && after !== undefined
      ? after - baseline
      : null;
  const retention = {
    baselinePssKb: baseline,
    strokes2000PssKb: peak,
    peakPssKb: Math.max(...samples.map((s) => s.pssKb ?? 0)),
    afterUndoEvictionPssKb: after,
    retainedGrowthKb,
    flagForReview: retainedGrowthKb !== null && retainedGrowthKb > 0,
  };
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: serial,
        requestedStrokes: STROKES,
        completedStrokes: completed,
        undoEvictionStrokes: UNDO_EVICTION_STROKES,
        strokesPerSample: BATCH,
        strokeMs: STROKE_MS,
        gapMs: GAP_MS,
        method: 'Recorded adb input swipe, short linear strokes on admitted paper coordinates',
        scenarioError,
        batches,
        samples,
        retention,
        notes: [
          'Diagnostic emulator memory evidence, not a physical-device performance approval.',
          'Clear retains its picture for Undo; twenty subsequent strokes evict that retained picture.',
          'Counts describe successfully delivered input command sequences, not a private product counter.',
        ],
        ...verdict,
      },
      null,
      2
    ) + '\n'
  );
  d.cleanup();
  d.adb('shell', 'am', 'force-stop', PKG);
}
