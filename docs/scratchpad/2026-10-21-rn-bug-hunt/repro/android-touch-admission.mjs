import { tap, capture, adb, guard } from './android-driver.mjs';
const packageName = 'art.splotch.migration.probe';
function restart() {
  adb('shell', 'am', 'force-stop', packageName);
  adb('shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`);
}
restart();
const initial = capture('android-restart-before-admission');
if (initial.includes('content-desc="Expand controls"')) tap('Expand controls');
tap('Brushes');
tap('Pen');
for (const mode of ['separate', 'joined']) {
  guard();
  adb('shell', 'uinput', `/data/local/tmp/rn-hunt-${mode}.jsonl`);
  const before = capture(`android-admission-${mode}-before`);
  if (!/content-desc="Undo"[^>]*enabled="true"/.test(before))
    throw new Error('No drawing accepted');
  const count = mode === 'separate' ? 3 : 1;
  for (let i = 1; i <= count; i++) {
    tap('Undo');
    const xml = capture(`android-admission-${mode}-undo-${i}`);
    const expected = i < count;
    if (new RegExp('content-desc="Undo"[^>]*enabled="' + expected + '"').test(xml) !== true)
      throw new Error(`Wrong cardinality ${mode} Undo ${i}`);
  }
}
guard();
adb('shell', 'uinput', '/data/local/tmp/rn-hunt-five.jsonl');
capture('android-five-contacts');
tap('Undo');
capture('android-five-contacts-undo');
