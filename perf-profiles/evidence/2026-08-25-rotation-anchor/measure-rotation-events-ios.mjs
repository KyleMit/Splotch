// Issue 1197: is Safari's ~40ms first-frame-after-rotation the app or the
// browser? Measures orientationchange -> resize -> first rAF on BOTH the floor
// control (cheapest possible page) and the real app, same Safari, same iPad.
const APPIUM = process.env.APPIUM ?? 'http://127.0.0.1:4723';
const UDID = process.env.UDID ?? '00008103-0006202E3CF1001E';
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const PAGES = {
  floor: process.env.FLOOR_URL ?? 'http://192.168.40.53:4177/',
  app: process.env.APP_URL ?? 'http://192.168.40.53:4173/',
};
const SETTLE_MS = 4000;

const api = async (method, path, body) => {
  const response = await fetch(`${APPIUM}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(payload).slice(0, 300)}`);
  return payload.value;
};

const SNIPPET = `
  window.__rot = { orientationchangeAt: null, resizeAt: null, frames: [] };
  const mark = (key) => (event) => {
    if (window.__rot[key] === null) window.__rot[key] = performance.now();
  };
  window.addEventListener('orientationchange', mark('orientationchangeAt'), true);
  window.addEventListener('resize', mark('resizeAt'), true);
  const loop = (t) => { window.__rot.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return true;
`;

const READBACK = `
  const r = window.__rot;
  const anchor = r.orientationchangeAt ?? r.resizeAt;
  const firstFrameAfter = (at) => {
    const f = r.frames.find((t) => t >= at);
    return f === undefined ? null : Math.round((f - at) * 10) / 10;
  };
  return {
    orientationToResizeMs: r.orientationchangeAt !== null && r.resizeAt !== null
      ? Math.round((r.resizeAt - r.orientationchangeAt) * 10) / 10 : null,
    ffFromOrientationMs: r.orientationchangeAt !== null ? firstFrameAfter(r.orientationchangeAt) : null,
    ffFromResizeMs: r.resizeAt !== null ? firstFrameAfter(r.resizeAt) : null,
    sawOrientation: r.orientationchangeAt !== null,
  };
`;

const session = await api('POST', '/session', {
  capabilities: {
    alwaysMatch: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': UDID,
      'appium:xcodeConfigFile': `${process.cwd()}/ios/local.xcconfig`,
      'appium:updatedWDABundleId': 'art.splotch.WebDriverAgentRunner',
      'appium:wdaLocalPort': 8100,
      'appium:browserName': 'Safari',
      'appium:newCommandTimeout': 300,
    },
    firstMatch: [{}],
  },
});
const id = session.sessionId;
const execute = (script) => api('POST', `/session/${id}/execute/sync`, { script, args: [] });

const rotateAndRead = async (target, measured) => {
  if (measured) await execute(SNIPPET);
  await api('POST', `/session/${id}/orientation`, { orientation: target });
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  return measured ? execute(READBACK) : null;
};

try {
  // Interleaved arms: sequential blocks drifted together in the first run, so
  // each measured rotation is paired in time with the other arm's. The first
  // rotation after a navigation skips orientationchange, so each visit burns
  // one throwaway rotation before measuring.
  const results = { floor: [], app: [] };
  let orientation = 'LANDSCAPE';
  const flip = () => (orientation = orientation === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE');
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const [name, url] of Object.entries(PAGES)) {
      await api('POST', `/session/${id}/url`, { url });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      await rotateAndRead(orientation, false);
      flip();
      const reading = await rotateAndRead(orientation, true);
      flip();
      results[name].push(reading);
      console.log(
        `round ${round} ${name}: orient->resize ${reading.orientationToResizeMs}ms, ` +
          `ff(orient) ${reading.ffFromOrientationMs}ms, ff(resize) ${reading.ffFromResizeMs}ms` +
          (reading.sawOrientation ? '' : '  [no orientationchange]')
      );
    }
  }
  for (const [name, rows] of Object.entries(results)) {
    const values = rows
      .map((r) => r.ffFromOrientationMs)
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    console.log(`${name}: ff(orient) sorted = ${values.join(', ')}`);
  }
} finally {
  await api('DELETE', `/session/${id}`).catch(() => null);
}
