// Exploration commands against an open Appium session, for finding names and frames by hand:
//   src [--xml-out=<file>]  named nodes with frames, values, and states
//   tap <name>               clicks the first element with that accessibility name
//   tapxy <x> <y>            taps a point (input units: iOS points, Android pixels)
//   shot <png>               simulator or Android screenshot
//   orient <PORTRAIT|LANDSCAPE>, exec <script> [json-args], win, close
import { writeFileSync } from 'node:fs';
import { POSITIVE_NUMBER, fail, isMain, runMain } from '../lib/proc.mjs';
import { parseNodes, shortTag } from './lib/accessibility-nodes.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { writeScreenshot } from './lib/device-commands.mjs';

const ARGUMENTS_NEEDED = {
  src: 0,
  tap: 1,
  tapxy: 2,
  shot: 1,
  orient: 1,
  exec: 1,
  win: 0,
  close: 0,
};
const FLAGS = {
  session: { type: 'string' },
  density: { type: 'string', default: '1' },
  'xml-out': { type: 'string' },
};

export function parseExploreFlags(argv) {
  const { values, positionals } = parseFlags(argv, {
    options: FLAGS,
    required: ['session'],
    positionals: true,
  });
  const [command, ...args] = positionals;
  if (!Object.hasOwn(ARGUMENTS_NEEDED, command)) {
    fail(`command must be one of ${Object.keys(ARGUMENTS_NEEDED).join(', ')}`);
  }
  if (args.length < ARGUMENTS_NEEDED[command]) fail(`${command} needs more arguments`);
  return {
    sessionFile: values.session,
    density: numberFlag(values, 'density', POSITIVE_NUMBER),
    xmlOut: values['xml-out'],
    command,
    args,
  };
}

function nodeLine(node) {
  const { frame } = node;
  const states = [
    node.enabled === 'false' ? 'DISABLED' : '',
    node.selected === 'true' ? 'SEL' : '',
    node.visible === 'false' ? 'hidden' : '',
  ].filter(Boolean);
  return [
    shortTag(node.tag),
    JSON.stringify(node.name),
    node.value ? `v=${JSON.stringify(node.value)}` : '',
    `${frame.x},${frame.y} ${frame.w}x${frame.h}`,
    states.join(' '),
  ].join('\t');
}

async function findByName(session, name) {
  const found = await session.findAll('accessibility id', name);
  if (found.length || session.platform !== 'android') return found;
  const quoted = JSON.stringify(name);
  return session.findAll('xpath', `//*[@text=${quoted} or @content-desc=${quoted}]`);
}

export async function exploreAppUi({ sessionFile, density, xmlOut, command, args }) {
  const session = readSessionFile(sessionFile);
  if (command === 'src') {
    const xml = await session.source();
    if (xmlOut) writeFileSync(xmlOut, xml);
    const nodes = parseNodes(xml, session.platform, density);
    for (const node of nodes.filter((candidate) => candidate.name || candidate.label)) {
      console.log(nodeLine(node));
    }
  } else if (command === 'tap') {
    const name = args.join(' ');
    const found = await findByName(session, name);
    if (!found.length) throw new Error(`no element ${name}`);
    await session.click(found[0]);
    console.log('tapped', name, found.length);
  } else if (command === 'tapxy') {
    await session.tapAt(Number(args[0]), Number(args[1]));
  } else if (command === 'shot') {
    writeScreenshot(session.platform, session.device, args[0]);
  } else if (command === 'orient') {
    await session.setOrientation(args[0]);
    console.log(await session.orientation());
  } else if (command === 'exec') {
    console.log(JSON.stringify(await session.exec(args[0], JSON.parse(args[1] ?? '{}'))));
  } else if (command === 'win') {
    console.log(JSON.stringify(await session.windowRect()));
  } else {
    await session.close();
  }
}

if (isMain(import.meta.url)) {
  runMain(() => exploreAppUi(parseExploreFlags(process.argv.slice(2))));
}
