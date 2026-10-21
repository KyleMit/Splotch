import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { OUT, PKG, center, pause } from './android-device-driver.mjs';

const PROMPT_TIMEOUT_MS = 10000;
const PROMPT_POLL_MS = 300;
const REMOTE = '/data/local/tmp/rn-hunt-api28-permission-ui.xml';
export function answerStoragePrompt(d, tag, decision) {
  assert.equal(d.serial, 'emulator-5684');
  assert.ok(['deny', 'allow'].includes(decision));
  let focus = '';
  const deadline = Date.now() + PROMPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    focus =
      d
        .adb('shell', 'dumpsys', 'window', 'windows')
        .toString()
        .match(/mCurrentFocus=([^\n]+)/)?.[1] ?? '';
    if (/packageinstaller.*GrantPermissionsActivity/.test(focus)) break;
    pause(PROMPT_POLL_MS);
  }
  assert.match(focus, /packageinstaller.*GrantPermissionsActivity/);
  let xml = '';
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      d.adb('shell', 'rm', '-f', REMOTE);
      if (d.adb('shell', 'uiautomator', 'dump', REMOTE).toString().includes('dumped to:')) {
        xml = d.adb('shell', 'cat', REMOTE).toString();
        break;
      }
      pause(PROMPT_POLL_MS);
    }
    assert.ok(xml.includes('Splotch') && xml.includes('photos'));
    writeFileSync(`${OUT}/${tag}.xml`, xml);
    writeFileSync(`${OUT}/${tag}.png`, d.adb('exec-out', 'screencap', '-p'));
    const button = [...xml.matchAll(/<node\b[^>]*>/g)]
      .map((m) => m[0])
      .find((n) =>
        new RegExp(
          `resource-id="com(?:\\.google)?\\.android\\.packageinstaller:id/permission_${decision}_button"`
        ).test(n)
      );
    assert.ok(button, `No ${decision} button in the owned storage prompt`);
    d.adb('shell', 'input', 'tap', ...center(button).map(String));
    const returnDeadline = Date.now() + PROMPT_TIMEOUT_MS;
    const focusHistory = [];
    while (Date.now() < returnDeadline) {
      const current =
        d
          .adb('shell', 'dumpsys', 'window', 'windows')
          .toString()
          .match(/mCurrentFocus=([^\n]+)/)?.[1] ?? '';
      focusHistory.push({ at: new Date().toISOString(), focus: current });
      if (current.includes(`${PKG}/`)) {
        writeFileSync(
          `${OUT}/${tag}-return-focus.json`,
          JSON.stringify(focusHistory, null, 2) + '\n'
        );
        return;
      }
      pause(PROMPT_POLL_MS);
    }
    writeFileSync(`${OUT}/${tag}-return-focus.json`, JSON.stringify(focusHistory, null, 2) + '\n');
    writeFileSync(`${OUT}/${tag}-return-timeout.png`, d.adb('exec-out', 'screencap', '-p'));
    assert.fail('Storage prompt did not return to Splotch');
  } finally {
    d.adb('shell', 'rm', '-f', REMOTE);
  }
}
