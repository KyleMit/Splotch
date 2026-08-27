// Set the per-op glaze return on the running iPad build, without a rebuild.
//
// The value has to be judged by eye at hand speed, and rebuild-and-reinstall
// makes that a three-minute loop per candidate. This makes it ten seconds.
// Dev-harness builds only — the setter does not exist in a shipped bundle.
//
//   node tools/perf/ios/set-crayon-glaze-return.mjs 0.06

import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APPIUM = process.env.APPIUM_URL ?? 'http://127.0.0.1:4723';
const UDID = process.env.IOS_UDID ?? '00008103-0006202E3CF1001E';

const value = Number.parseFloat(process.argv[2] ?? '');
if (!Number.isFinite(value) || value < 0 || value > 1) {
  console.error('usage: set-crayon-glaze-return.mjs <0..1>');
  process.exit(1);
}

async function call(method, path, body) {
  const response = await fetch(`${APPIUM}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (payload.value?.error) throw new Error(`${path}: ${payload.value.message}`);
  return payload.value;
}

const session = await call('POST', '/session', {
  capabilities: {
    alwaysMatch: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': UDID,
      'appium:xcodeConfigFile': join(ROOT, 'ios', 'local.xcconfig'),
      'appium:updatedWDABundleId': 'art.splotch.WebDriverAgentRunner',
      'appium:bundleId': 'art.splotch.app',
      'appium:newCommandTimeout': 120,
    },
    firstMatch: [{}],
  },
});
const id = session.sessionId ?? session.value?.sessionId;

try {
  const contexts = await call('GET', `/session/${id}/contexts`);
  const webview = contexts.find((c) => c !== 'NATIVE_APP');
  if (!webview) throw new Error(`no webview context in ${JSON.stringify(contexts)}`);
  await call('POST', `/session/${id}/context`, { name: webview });
  const applied = await call('POST', `/session/${id}/execute/sync`, {
    script: `
      if (!window.__setCrayonGlazeReturn) return null;
      return window.__setCrayonGlazeReturn(${value});
    `,
    args: [],
  });
  if (applied === null) {
    throw new Error('no __setCrayonGlazeReturn on the page — not a dev-harness build?');
  }
  console.log(`per-op glaze return = ${applied}`);
} finally {
  await call('DELETE', `/session/${id}`).catch((error) => {
    console.warn(`session ${id} did not close: ${error.message}`);
  });
}
