// Drives session-payload.js on the iPad over the WebKit Inspector: one fresh
// /dev/engine load per run, the page does all timing, the host only injects
// and polls. Needs `npm run perf:serve` on the LAN first.
//   HARNESS_URL=http://<lan-ip>:4173/dev/engine OUT_DIR=<dir> \
//     node run-session.mjs <label> <restamp|glaze-direct> <paced|burst>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = new URL('../../../..', import.meta.url).pathname;
const lib = await import(`${WT}/tools/perf/lib/profile-device-session.mjs`);
const inspector = await import(`${WT}/tools/perf/lib/webkit-inspector.mjs`);
const here = dirname(fileURLToPath(import.meta.url));
const [label = "run", arm = "restamp", mode = "paced", extra = "{}"] = process.argv.slice(2);
const url = process.env.HARNESS_URL;
const outDir = process.env.OUT_DIR ?? join(here, 'runs');
const POLL_MS = 5000;
const RESULT_TIMEOUT_MS = 15 * 60_000;
if (!url) throw new Error('set HARNESS_URL to the LAN /dev/engine URL the iPad can reach');

lib.requireInspectorProxy();
await lib.ensurePreviewServer(url, 4173, false);
const { device, stopProxy } = await lib.connectDevice();
const con = lib.createDeviceConsole();
let session;
try {
  const hostStart = Date.now();
  session = await lib.openDevicePage(device, url, {
    onConsole: con.onConsole,
    ready: 'window.__engine && window.__engineReady && window.__engine.getUndoDebug',
    readyHint: 'no window.__engine',
  });
  await session.evaluate(`window.__cfg = ${JSON.stringify({ arm, mode, ...JSON.parse(extra) })};`);
  const injectAt = Date.now();
  await session.evaluate(readFileSync(join(here, 'session-payload.js'), 'utf8'));
  session.close();
  session = null;
  let result = null;
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (!result && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const page = (await inspector.listPages(device)).find((p) => p.url === url);
    if (!page) continue;
    let s;
    try {
      s = await inspector.attachToPage(page.webSocketDebuggerUrl, {
        onConsole: con.onConsole,
        commandTimeoutMs: 300_000,
      });
      result = await s.readJson('window.__session ?? null');
    } catch (e) {
      console.log('poll:', e.message);
    } finally {
      s?.close();
    }
  }
  if (!result) throw new Error('no result before the timeout');
  const out = {
    label,
    harnessUrl: url,
    device: { os: device.deviceOSVersion },
    host: { wallFromInjectMs: Date.now() - injectAt, wallTotalMs: Date.now() - hostStart, at: new Date().toISOString() },
    result,
    console: con.forReport(),
  };
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${label}.json`);
  writeFileSync(file, JSON.stringify(out));
  if (result.error) console.log('ERROR', result.error);
  else
    console.log(
      JSON.stringify({
        label,
        arm: result.arm,
        mode: result.mode,
        entry: result.entry,
        vp: result.viewport,
        phases: result.phases,
        hist: result.historyAfterUndo,
        ink: result.nonTransparentAfterUndo,
      })
    );
  console.log('wrote', file);
} finally {
  session?.close();
  stopProxy();
}
