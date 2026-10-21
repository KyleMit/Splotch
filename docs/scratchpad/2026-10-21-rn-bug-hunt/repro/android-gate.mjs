import { tap, capture, input } from './android-driver.mjs';
tap('Parent Center');
const before = capture('android-parent-gate');
const [, x, y] = before.match(/What is (\d+) times (\d+)\?/);
input('keyevent', `KEYCODE_${String(Number(x) * Number(y))[0]}`);
if (String(Number(x) * Number(y)).length === 2)
  input('keyevent', `KEYCODE_${String(Number(x) * Number(y))[1]}`);
input('keyevent', 'KEYCODE_DEL');
capture('android-gate-hardware-delete');
const last = String(Number(x) * Number(y)).at(-1);
input('keyevent', `KEYCODE_${last}`);
input('keyevent', 'KEYCODE_ENTER');
capture('android-parent-center-unlocked');
