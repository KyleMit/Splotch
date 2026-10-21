import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { adb, capture, input, OUT, tap } from './android-driver.mjs';
import { inject, pathCommands, line, pause } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';
import { paperDifference, RASTER_REPLAY_CHANNEL_TOLERANCE } from './android-run2-raster.mjs';

const PKG = 'art.splotch.migration.probe',
  SERIAL = 'emulator-5680';
const prefix = 'android-run2-memory-pressure',
  WAIT_MS = 30000,
  ADMISSION_MS = 15000,
  POLL_MS = 250;
const previous = JSON.parse(readFileSync(`${OUT}/android-run2-warm-long-session.json`));
assert.equal(previous.verdict, 'alive');
assert.equal(previous.scenarioError, null);
const pidBefore = adb('shell', 'pidof', PKG).toString().trim();
assert.equal(pidBefore, String(previous.pid));
const sinceMs = Date.now(),
  startStamp = androidNow(SERIAL),
  samples = [],
  states = [];
let scenarioError = null,
  commandError = null,
  source = '',
  paperAfterReturn = null,
  undoPaper = null;
function sample(stage) {
  const raw = adb('shell', 'dumpsys', 'meminfo', PKG).toString();
  writeFileSync(`${OUT}/${prefix}-${stage}.meminfo.txt`, raw);
  const pss = raw.match(/TOTAL PSS:\s*(\d+)/),
    native = raw.match(/Native Heap\s+(\d+)/);
  const row = {
    at: new Date().toISOString(),
    stage,
    pssKb: pss ? Number(pss[1]) : null,
    nativePssKb: native ? Number(native[1]) : null,
    pid: adb('shell', 'pidof', PKG).toString().trim(),
  };
  samples.push(row);
  console.log(row);
}
try {
  source = capture(`${prefix}-before`);
  sample('before');
  const uid = adb('shell', 'cmd', 'package', 'list', 'packages', '-U', PKG)
    .toString()
    .match(/uid:(\d+)/)?.[1];
  assert.ok(uid);
  input('keyevent', 'KEYCODE_HOME');
  pause(1500);
  const began = Date.now();
  let admitted = false;
  while (Date.now() - began < ADMISSION_MS) {
    const state = adb('shell', 'am', 'get-uid-state', uid).toString().trim();
    const focus = adb('shell', 'dumpsys', 'window', 'displays')
      .toString()
      .match(/mCurrentFocus=([^\n]+)/)?.[1];
    states.push({ at: new Date().toISOString(), state, focus });
    if (
      /\((?:LAST_ACTIVITY|CACHED_ACTIVITY|CACHED_ACTIVITY_CLIENT|CACHED_EMPTY)\)/.test(state) &&
      focus &&
      !focus.includes(PKG)
    ) {
      admitted = true;
      break;
    }
    pause(POLL_MS);
  }
  assert.ok(admitted, 'No confirmed cached background state');
  writeFileSync(
    `${OUT}/${prefix}-background-processes.txt`,
    adb('shell', 'dumpsys', 'activity', 'processes', PKG)
  );
  try {
    adb('shell', 'am', 'send-trim-memory', PKG, 'COMPLETE');
  } catch (error) {
    commandError = String(error);
  }
  sample('after-request');
  pause(WAIT_MS);
  sample('background-30s');
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  source = capture(`${prefix}-returned`);
  assert.equal(adb('shell', 'pidof', PKG).toString().trim(), pidBefore);
  paperAfterReturn = await paperDifference(
    `${OUT}/${prefix}-before.png`,
    `${OUT}/${prefix}-returned.png`,
    { left: 200, top: 600, width: 700, height: 1400 }
  );
  assert.ok(
    paperAfterReturn.maxChannelDelta <= RASTER_REPLAY_CHANNEL_TOLERANCE,
    'Memory pressure changed the retained paper'
  );
  await inject(`${prefix}-new-ink`, pathCommands([line([350, 1800], [750, 1850])]));
  capture(`${prefix}-responsive`);
  const painted = await paperDifference(
    `${OUT}/${prefix}-returned.png`,
    `${OUT}/${prefix}-responsive.png`,
    { left: 200, top: 600, width: 700, height: 1400 }
  );
  assert.ok(
    painted.maxChannelDelta > RASTER_REPLAY_CHANNEL_TOLERANCE,
    'New ink did not render after memory pressure'
  );
  tap('Undo');
  source = capture(`${prefix}-undo`);
  undoPaper = await paperDifference(`${OUT}/${prefix}-returned.png`, `${OUT}/${prefix}-undo.png`, {
    left: 200,
    top: 600,
    width: 700,
    height: 1400,
  });
  assert.ok(undoPaper.maxChannelDelta <= RASTER_REPLAY_CHANNEL_TOLERANCE);
  pause(WAIT_MS);
  sample('returned-30s');
} catch (error) {
  scenarioError = String(error);
  process.exitCode = 1;
  try {
    adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
    source = capture(`${prefix}-error`);
  } catch {}
} finally {
  const verdict = androidVerdict({ serial: SERIAL, pkg: PKG, startStamp, sinceMs, source });
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: SERIAL,
        pidBefore,
        samples,
        states,
        commandError,
        scenarioError,
        paperAfterReturn,
        undoPaper,
        ...verdict,
      },
      null,
      2
    ) + '\n'
  );
  console.log(verdict.verdict, scenarioError, commandError);
}
