import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { capture, tap, OUT } from './android-driver.mjs';
import { restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands } from './android-run2-touch.mjs';
const results = [];
for (const mode of ['calibrated'])
  for (let run = 1; run <= 3; run++) {
    const name = `android-run2-magic-${mode}-timing-${run}`;
    const xml = restart(`${name}-blank`);
    if (xml.includes('content-desc="Expand controls"')) tap('Expand controls');
    tap('Purple');
    tap('Brushes');
    tap('Magic brush');
    tap('Stroke width');
    tap('Size 3');
    let commands;
    if (mode === 'original')
      commands = readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8')
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
    else {
      const points = Array.from({ length: 76 }, (_, i) => [
        Math.round(540 + Math.sin(i * 0.13) * 220),
        Math.round(1250 + Math.cos(i * 0.09) * 430),
      ]);
      commands = pathCommands([points]);
      commands.splice(1, 0, { id: 1, command: 'inject', events: [0, 0, 0] });
    }
    await inject(name, commands, true);
    capture(name);
    tap('Undo');
    capture(`${name}-undo`);
    const trace = readFileSync(`${OUT}/${name}.getevent.txt`, 'utf8');
    const device = trace.match(/add device \d+: (\S+)\s+name:\s+"RN Hunt Touchscreen"/)?.[1];
    assert.ok(device, 'Virtual touch device missing');
    const lines = trace.split('\n').filter((s) => s.includes(`${device}:`));
    let x = 0,
      y = 0,
      down = false;
    const frames = [];
    let downAt, upAt;
    for (const s of lines) {
      const at = Number(s.match(/\[\s*([\d.]+)\]/)?.[1]);
      if (s.includes('ABS_MT_POSITION_X')) x = parseInt(s.trim().split(/\s+/).at(-1), 16);
      if (s.includes('ABS_MT_POSITION_Y')) y = parseInt(s.trim().split(/\s+/).at(-1), 16);
      if (s.includes('BTN_TOUCH') && s.includes('DOWN')) {
        down = true;
        downAt = at;
      }
      if (s.includes('BTN_TOUCH') && s.includes('UP')) {
        down = false;
        upAt = at;
      }
      if (s.includes('SYN_REPORT') && down) frames.push({ at, x, y });
    }
    const deltas = frames.slice(1).map((p, i) => ({
      gapMs: (p.at - frames[i].at) * 1000,
      jumpPx: Math.hypot(p.x - frames[i].x, p.y - frames[i].y),
    }));
    const result = {
      mode,
      run,
      device,
      frames: frames.length,
      downAt,
      upAt,
      firstMove: deltas[0],
      maxGapMs: Math.max(...deltas.map((d) => d.gapMs)),
      maxJumpPx: Math.max(...deltas.map((d) => d.jumpPx)),
      events: frames,
    };
    writeFileSync(`${OUT}/${name}.trace-summary.json`, JSON.stringify(result, null, 2) + '\n');
    results.push(result);
    console.log(JSON.stringify({ ...result, events: undefined }));
    if (mode === 'calibrated') {
      assert.ok(result.maxGapMs < 100, 'Calibrated stream has an idle-sized gap');
      assert.ok(result.maxJumpPx < 100, 'Calibrated stream has a recovery-sized jump');
    }
  }
tap('Brushes');
tap('Pen');
writeFileSync(
  `${OUT}/android-run2-magic-timing-results.json`,
  JSON.stringify(results, null, 2) + '\n'
);
