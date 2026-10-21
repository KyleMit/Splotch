import { paperDifference, RASTER_REPLAY_CHANNEL_TOLERANCE } from './android-run2-raster.mjs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { MAX_UNDO_DEPTH } from '../../../../web/src/lib/drawing/undoHistory.ts';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';
import { adb, capture, guard, tap, OUT } from './android-driver.mjs';
import { restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
const PKG = 'art.splotch.migration.probe',
  SERIAL = 'emulator-5680',
  COUNT = 2000,
  BATCH = 200,
  POINTS = 18,
  SAMPLE_MS = 16,
  GAP_MS = 100;
const register = JSON.parse(
  readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
);
const warmRepeat = process.argv.includes('--warm-repeat');
const PRIMARY_PREFIX = 'android-run2-long';
const prefix = warmRepeat ? 'android-run2-warm-long' : PRIMARY_PREFIX;
const memoryPrefix = warmRepeat ? 'android-run2-warm-memory' : 'android-run2-memory';
const samples = [],
  batches = [],
  journal = `${OUT}/${prefix}-session-memory.jsonl`;
writeFileSync(journal, '');
async function inkPixels(name) {
  const { data, info } = await sharp(`${OUT}/${name}.png`)
    .extract({ left: 200, top: 600, width: 700, height: 1400 })
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
function sample(strokes, stage) {
  const raw = adb('shell', 'dumpsys', 'meminfo', PKG).toString();
  writeFileSync(`${OUT}/${memoryPrefix}-${stage}.txt`, raw);
  const pss = raw.match(/TOTAL PSS:\s*(\d+)/) ?? raw.match(/TOTAL\s+(\d+)/);
  const native = raw.match(/Native Heap\s+(\d+)/);
  const row = {
    at: new Date().toISOString(),
    strokes,
    stage,
    pssKb: pss ? +pss[1] : null,
    nativePssKb: native ? +native[1] : null,
    pid: adb('shell', 'pidof', PKG).toString().trim(),
  };
  samples.push(row);
  appendFileSync(journal, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
}
let matchedWarmPaper = null,
  scenarioError = null,
  startStamp = androidNow(SERIAL),
  sinceMs = Date.now();
try {
  if (warmRepeat) {
    const prior = JSON.parse(readFileSync(`${OUT}/${PRIMARY_PREFIX}-session.json`));
    assert.equal(prior.completedStrokes, COUNT);
    assert.equal(prior.scenarioError, null);
    assert.equal(prior.verdict, 'alive');
    assert.equal(
      adb('shell', 'pidof', PKG).toString().trim(),
      String(prior.pid),
      'Warm repeat must keep the first run process'
    );
  }
  const xml = warmRepeat ? capture(`${prefix}-start`) : restart(`${prefix}-start`);
  if (xml.includes('content-desc="Expand controls"')) tap('Expand controls');
  tap('Purple');
  tap('Brushes');
  tap('Pen');
  tap('Stroke width');
  tap('Size 3');
  capture(`${prefix}-blank`);
  sinceMs = Date.now();
  startStamp = androidNow(SERIAL);
  sample(0, 'baseline');
  for (let offset = 0; offset < COUNT; offset += BATCH) {
    guard();
    const commands = [
        register,
        { id: 1, command: 'inject', events: [0, 0, 0] },
        { id: 1, command: 'delay', duration: 1500 },
      ],
      emit = (events) => commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] }),
      delay = (duration) => commands.push({ id: 1, command: 'delay', duration });
    for (let j = 0; j < BATCH; j++) {
      const index = offset + j,
        x = 270 + ((index * 37) % 500),
        y = 700 + ((index * 53) % 1100);
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
      for (let p = 1; p <= POINTS; p++) {
        delay(SAMPLE_MS);
        emit([
          3,
          47,
          0,
          3,
          53,
          Math.round(x + 90 * Math.sin(p * 0.17)),
          3,
          54,
          Math.round(y + 70 * Math.sin(p * 0.23)),
        ]);
      }
      delay(SAMPLE_MS);
      emit([3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0]);
      delay(GAP_MS);
    }
    delay(1000);
    const local = `${OUT}/${prefix}-${offset + BATCH}.input.jsonl`,
      remote = '/data/local/tmp/rn-hunt-long-session.jsonl';
    writeFileSync(local, commands.map((c) => JSON.stringify(c)).join('\n') + '\n');
    adb('push', local, remote);
    guard();
    const at = Date.now();
    try {
      execFileSync('adb', ['-s', SERIAL, 'shell', 'uinput', remote], {
        timeout: 180000,
        maxBuffer: 8 << 20,
      });
    } finally {
      adb('shell', 'rm', '-f', remote);
    }
    batches.push({
      strokes: offset + BATCH,
      wallMs: Date.now() - at,
      scheduledMs: commands
        .filter((c) => c.command === 'delay')
        .reduce((s, c) => s + c.duration, 0),
    });
    pause(1000);
    sample(offset + BATCH, `strokes-${offset + BATCH}`);
    capture(`${prefix}-${offset + BATCH}`);
    appendFileSync(
      'docs/scratchpad/2026-10-21-rn-bug-hunt/status.md',
      `\n- ${new Date().toISOString().slice(11, 16)}Z Phone ${warmRepeat ? 'warm repeat' : 'long session'}: ${offset + BATCH}/${COUNT} strokes delivered; meminfo recorded.\n`
    );
  }
  await inject(`${prefix}-clear`, pathCommands([line([1015, 451], [500, 950])]));
  capture(`${prefix}-cleared`);
  assert.ok((await inkPixels(`${prefix}-2000`)) > 500, 'Long session has no visible ink');
  assert.equal(await inkPixels(`${prefix}-cleared`), 0, 'Clear did not remove visible ink');
  sample(COUNT, 'after-clear');
  pause(30000);
  sample(COUNT, 'after-clear-30s');
  const commands = [
      register,
      { id: 1, command: 'inject', events: [0, 0, 0] },
      { id: 1, command: 'delay', duration: 1500 },
    ],
    emit = (events) => commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
  for (let j = 0; j < MAX_UNDO_DEPTH; j++) {
    emit([
      3,
      47,
      0,
      3,
      57,
      4000 + j,
      3,
      55,
      0,
      3,
      53,
      300 + j * 20,
      3,
      54,
      1000,
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
    commands.push({ id: 1, command: 'delay', duration: 64 });
    emit([3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0]);
    commands.push({ id: 1, command: 'delay', duration: 100 });
  }
  commands.push({ id: 1, command: 'delay', duration: 1000 });
  await inject(`${prefix}-evict-clear-undo`, commands);
  capture(`${prefix}-after-undo-eviction`);
  sample(COUNT + MAX_UNDO_DEPTH, 'after-undo-eviction');
  pause(30000);
  sample(COUNT + MAX_UNDO_DEPTH, 'after-undo-eviction-30s');
  if (warmRepeat) {
    matchedWarmPaper = await paperDifference(
      `${OUT}/${prefix}-blank.png`,
      `${OUT}/${prefix}-after-undo-eviction.png`,
      { left: 200, top: 600, width: 700, height: 1400 }
    );
    assert.ok(
      matchedWarmPaper.maxChannelDelta <= RASTER_REPLAY_CHANNEL_TOLERANCE,
      'Warm memory comparison must start and end with equivalent paper'
    );
  }
} catch (error) {
  scenarioError = String(error);
  throw error;
} finally {
  let source = '';
  try {
    source = capture(`${prefix}-final`);
  } catch {}
  const verdict = startStamp
    ? androidVerdict({ serial: SERIAL, pkg: PKG, startStamp, sinceMs, source })
    : { verdict: null };
  writeFileSync(
    `${OUT}/${prefix}-session.json`,
    JSON.stringify(
      {
        device: SERIAL,
        warmRepeat,
        matchedWarmPaper,
        requestedStrokes: COUNT,
        strokesPerSample: BATCH,
        pointsPerStroke: POINTS,
        sampleMs: SAMPLE_MS,
        gapMs: GAP_MS,
        startedAt: sinceMs ? new Date(sinceMs).toISOString() : null,
        durationMs: sinceMs ? Date.now() - sinceMs : null,
        scenarioError,
        batches,
        completedStrokes: batches.at(-1)?.strokes ?? 0,
        undoEvictionStrokes: MAX_UNDO_DEPTH,
        samples,
        retention: {
          retainedGrowthKb: samples.at(-1)?.pssKb - samples[0]?.pssKb,
          flagForReview: samples.at(-1)?.pssKb - samples[0]?.pssKb > 0,
        },
        notes: [
          `Clear preserves its picture in Undo; ${MAX_UNDO_DEPTH} new actions evict it before the final samples.`,
          'Counts describe delivered uinput stroke sequences at admitted paper coordinates; no private product counter is exposed.',
        ],
        ...verdict,
      },
      null,
      2
    ) + '\n'
  );
}
