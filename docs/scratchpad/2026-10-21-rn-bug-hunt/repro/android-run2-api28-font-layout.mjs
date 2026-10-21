import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deviceDriver, OUT, PKG, nodes, center, pause } from './android-device-driver.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const parentOnly = process.argv.includes('--parent-only');
const RESTORE_SETTLE_MS = 500;
const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = parentOnly
    ? 'android-run2-emulator-5684-font2-parent-corrected'
    : 'android-run2-emulator-5684-font2';
const baseline = JSON.parse(readFileSync(`${OUT}/android-run2-${serial}-baseline.json`));
const checks = [],
  cleanupErrors = [];
let currentSection = null,
  scenarioError = null,
  source = '',
  startStamp = androidNow(serial),
  sinceMs = Date.now();
try {
  assert.equal(
    d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(),
    baseline.font
  );
  d.adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0');
  d.restart();
  assert.equal(d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(), '2.0');
  source = d.capture(`${prefix}-root`);
  startStamp = androidNow(serial);
  sinceMs = Date.now();
  for (const section of parentOnly
    ? ['Parent Center']
    : [
        'Appearance',
        'Sound',
        'Tool Drawer',
        'Accessibility',
        'Coloring',
        'AI Art',
        'Saving',
        'Parent Center',
      ]) {
    currentSection = section;
    const tag = `${prefix}-${section.replaceAll(' ', '-')}`;
    d.tap('Settings');
    d.scrollTap(section);
    source = d.capture(`${tag}-opened`);
    const question = source.match(/What is (\d+) times (\d+)\?/);
    if (question) {
      for (const digit of String(Number(question[1]) * Number(question[2]))) {
        const xml = d.source();
        const button = nodes(xml).find(
          (n) =>
            n.visible &&
            n.token.includes('class="android.widget.Button"') &&
            n.token.includes(`content-desc="${digit}"`)
        );
        assert.ok(button, `No visible digit button ${digit}`);
        d.input('tap', ...center(button.token));
      }
      d.tap('Check answer');
      source = d.capture(`${tag}-gate-passed`);
      assert.ok(source.includes('Generating an AI image'), 'Gate did not open Parent Center');
    }
    const close = nodes(source).find(
      (node) => node.visible && node.token.includes('content-desc="Close"')
    );
    assert.ok(close, `${section}: no visible Close`);
    const point = center(close.token);
    d.tap('Close');
    source = d.capture(`${tag}-closed`);
    assert.ok(source.includes('content-desc="Drawing paper"'));
    checks.push({
      id: `font2-${section}-close`,
      status: 'pass',
      closeCenter: point,
      gateSolved: Boolean(question),
    });
  }
} catch (error) {
  scenarioError = String(error);
  if (currentSection)
    checks.push({
      id: `font2-${currentSection}-close`,
      status: 'needs-review',
      error: scenarioError,
    });
  process.exitCode = 1;
  try {
    source = d.capture(`${prefix}-error`);
  } catch {}
} finally {
  const verdict = androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source });
  for (const [label, action] of [
    [
      'restore font',
      () => {
        d.adb(
          'shell',
          'settings',
          baseline.font === 'null' ? 'delete' : 'put',
          'system',
          'font_scale',
          ...(baseline.font === 'null' ? [] : [baseline.font])
        );
      },
    ],
    ['stop probe', () => d.adb('shell', 'am', 'force-stop', PKG)],
    ['remove driver XML', () => d.cleanup()],
  ])
    try {
      action();
    } catch (error) {
      cleanupErrors.push({ label, error: String(error) });
    }
  pause(RESTORE_SETTLE_MS);
  if (
    baseline.font === 'null' &&
    d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim() !== 'null'
  ) {
    d.adb('shell', 'settings', 'delete', 'system', 'font_scale');
    pause(RESTORE_SETTLE_MS);
  }
  const restoredFont = d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim();
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      { device: serial, checks, scenarioError, cleanupErrors, restoredFont, ...verdict },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length || restoredFont !== baseline.font) process.exitCode = 1;
  console.log(checks.length, verdict.verdict, scenarioError, cleanupErrors);
}
