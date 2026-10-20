// Opens an Appium session on one device and writes the session file the other entries read.
// The Appium server, its driver (XCUITest or UiAutomator2), and the device must already be up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TCP_PORT, isMain, runMain } from '../lib/proc.mjs';
import { AppiumSession, SESSION_PLATFORMS, appiumCapabilities } from './lib/appium-session.mjs';
import { choiceFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';

const FLAGS = {
  platform: { type: 'string' },
  'appium-url': { type: 'string' },
  device: { type: 'string' },
  port: { type: 'string' },
  'wda-derived-data': { type: 'string' },
  out: { type: 'string' },
};

export function parseAppiumSessionFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['platform', 'appium-url', 'device', 'port', 'out'],
  });
  return {
    platform: choiceFlag(values, 'platform', SESSION_PLATFORMS),
    base: values['appium-url'].replace(/\/+$/, ''),
    device: values.device,
    port: numberFlag(values, 'port', TCP_PORT),
    wdaDerivedData: values['wda-derived-data'],
    out: values.out,
  };
}

export async function startAppiumSession({ platform, base, device, port, wdaDerivedData, out }) {
  const capabilities = appiumCapabilities({ platform, device, port, wdaDerivedData });
  const session = await AppiumSession.create(base, capabilities, { platform, device });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(session.record()));
  console.log('session', session.id, '->', out);
  return session;
}

if (isMain(import.meta.url)) {
  runMain(() => startAppiumSession(parseAppiumSessionFlags(process.argv.slice(2))));
}
