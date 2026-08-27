// Draw two crossing crayon strokes in different colours on the physical iPad
// and screenshot the result, so the CROSSING — the only place the glaze is
// visible — can be judged by eye between two builds.
//
// The frame numbers cannot answer the question this asks. Campaign one's
// 2026-08-26 winner was 4x faster and was rejected on sight, so a candidate
// that changes the mix has to be looked at before it is believed.

import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APPIUM = process.env.APPIUM_URL ?? 'http://127.0.0.1:4723';
const UDID = process.env.IOS_UDID ?? '00008103-0006202E3CF1001E';
const OUT = process.argv[2] ?? 'perf-profiles/native2/appearance/shot.png';

const CROSSING_SETTLE_MS = 900;
const STROKE_STEPS = 24;
const STROKE_STEP_MS = 8;

async function call(method, path, body) {
  const response = await fetch(`${APPIUM}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (payload.value?.error) {
    throw new Error(`${path}: ${payload.value.error} — ${payload.value.message}`);
  }
  return payload.value;
}

const capabilities = {
  alwaysMatch: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': UDID,
    'appium:xcodeConfigFile': join(ROOT, 'ios', 'local.xcconfig'),
    'appium:updatedWDABundleId': 'art.splotch.WebDriverAgentRunner',
    'appium:bundleId': 'art.splotch.app',
    'appium:newCommandTimeout': 180,
  },
  firstMatch: [{}],
};

// A straight drag in native points, paced so the engine reads it as one stroke
// rather than as a lifted finger.
function dragActions(from, to) {
  const steps = [
    { type: 'pointerMove', duration: 0, x: from.x, y: from.y },
    { type: 'pointerDown', button: 0 },
  ];
  for (let i = 1; i <= STROKE_STEPS; i++) {
    steps.push({
      type: 'pointerMove',
      duration: STROKE_STEP_MS,
      x: Math.round(from.x + ((to.x - from.x) * i) / STROKE_STEPS),
      y: Math.round(from.y + ((to.y - from.y) * i) / STROKE_STEPS),
    });
  }
  steps.push({ type: 'pointerUp', button: 0 });
  return [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: steps }];
}

const session = await call('POST', '/session', { capabilities });
const id = session.sessionId ?? session.value?.sessionId;
if (!id) throw new Error('no session');

try {
  const contexts = await call('GET', `/session/${id}/contexts`);
  const webview = contexts.find((c) => c !== 'NATIVE_APP');
  if (!webview) throw new Error(`no webview context in ${JSON.stringify(contexts)}`);

  const evaluate = async (script) => {
    await call('POST', `/session/${id}/context`, { name: webview });
    const value = await call('POST', `/session/${id}/execute/sync`, { script, args: [] });
    await call('POST', `/session/${id}/context`, { name: 'NATIVE_APP' });
    return value;
  };

  const drag = async (from, to) => {
    await call('POST', `/session/${id}/actions`, { actions: dragActions(from, to) });
    await call('DELETE', `/session/${id}/actions`);
  };

  await evaluate(`
    document.querySelector('#crayonBrushButton')?.click();
    return true;
  `);
  const brush = await evaluate('return window.__committedBrushMode?.() ?? null;');
  if (brush !== 'crayon') throw new Error(`engine committed ${brush}, not crayon`);

  const size = await call('GET', `/session/${id}/window/rect`);
  const midY = Math.round(size.height / 2);
  const midX = Math.round(size.width / 2);

  const pick = async (hex) => {
    const picked = await evaluate(`
      const swatch = document.querySelector('.color-swatch[data-color="${hex}"]');
      if (!swatch) return null;
      swatch.click();
      return "${hex}";
    `);
    if (!picked) throw new Error(`no swatch for ${hex}`);
  };

  // A horizontal band, then a vertical band across it. The overlap is the only
  // pixels where the glaze does anything at all.
  await pick('#F9D24F');
  await drag({ x: midX - 260, y: midY }, { x: midX + 260, y: midY });
  await pick('#62A2E9');
  await drag({ x: midX, y: midY - 260 }, { x: midX, y: midY + 260 });

  await new Promise((resolve) => setTimeout(resolve, CROSSING_SETTLE_MS));
  const png = await call('GET', `/session/${id}/screenshot`);
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), Buffer.from(png, 'base64'));
  console.log(`wrote ${OUT}`);
} finally {
  await call('DELETE', `/session/${id}`).catch(() => {});
}
