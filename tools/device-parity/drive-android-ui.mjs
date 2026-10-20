// A small UiAutomator-dump driver for Android, needing no Appium session:
//   dump              every labelled node with its resource id, focus, and bounds
//   focus             the focused node
//   tap <label-regex> taps the first node whose content-desc or text matches
//   keys <keycode...> sends key events (never KEYCODE_BACK)
// Every command first checks that the app under test holds Display0's focus.
import { fail, isMain, runMain } from '../lib/proc.mjs';
import { display0Focus, focusedPackage, readDisplays } from './lib/android-display.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { adb, sendAndroidKey } from './lib/device-commands.mjs';

const COMMANDS = ['dump', 'focus', 'tap', 'keys'];
const DUMP_PATH = '/sdcard/device-parity-ui.xml';
const FLAGS = { serial: { type: 'string' }, bundle: { type: 'string' } };

export function parseAndroidUiFlags(argv) {
  const { values, positionals } = parseFlags(argv, {
    options: FLAGS,
    required: ['serial', 'bundle'],
    positionals: true,
  });
  const [command, ...args] = positionals;
  if (!COMMANDS.includes(command)) fail(`command must be one of ${COMMANDS.join(', ')}`);
  if ((command === 'tap' || command === 'keys') && !args.length) {
    fail(`${command} needs an argument`);
  }
  return { serial: values.serial, bundleId: values.bundle, command, args };
}

function dumpNodes(serial) {
  adb(serial, 'shell', 'uiautomator', 'dump', DUMP_PATH);
  const xml = adb(serial, 'exec-out', 'cat', DUMP_PATH);
  return [...xml.matchAll(/<node ([^>]*)\/?>/g)].map((node) =>
    Object.fromEntries([...node[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))
  );
}

const labelOf = (node) => node['content-desc'] || node.text || '';

export function driveAndroidUi({ serial, bundleId, command, args }) {
  const focus = display0Focus(readDisplays(serial));
  if (focusedPackage(focus) !== bundleId) throw new Error(`foreground: ${focus}`);
  if (command === 'keys') {
    for (const keycode of args) sendAndroidKey(serial, keycode);
    return;
  }
  const nodes = dumpNodes(serial);
  if (command === 'dump') {
    for (const node of nodes.filter(labelOf)) {
      const focused = node.focused === 'true' ? 'FOCUSED' : '';
      console.log(JSON.stringify(labelOf(node)), node['resource-id'] || '', focused, node.bounds);
    }
  } else if (command === 'focus') {
    for (const node of nodes.filter((candidate) => candidate.focused === 'true')) {
      console.log('focused:', node['resource-id'] || node.class, labelOf(node), node.bounds);
    }
  } else {
    const pattern = new RegExp(args[0]);
    const node = nodes.find(
      (candidate) =>
        pattern.test(candidate['content-desc'] || '') || pattern.test(candidate.text || '')
    );
    if (!node) throw new Error(`no ${args[0]}`);
    const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
    adb(serial, 'shell', 'input', 'tap', String((x1 + x2) >> 1), String((y1 + y2) >> 1));
    console.log('tapped', labelOf(node));
  }
}

if (isMain(import.meta.url)) {
  runMain(async () => driveAndroidUi(parseAndroidUiFlags(process.argv.slice(2))));
}
