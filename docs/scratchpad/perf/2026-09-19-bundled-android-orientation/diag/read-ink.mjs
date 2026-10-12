// Diagnostic only (not production): attach to the running bundled app over CDP and report
// the committed brush, viewport, and inked-sample count of the live tiles (64x64 downscale per tile).
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { canvasDeltaFunctionSource } from '../../../../tools/perf/split-capture/lib/page-bootstrap.mjs';
const serial = process.argv[2];
const port = 9236;
const adb = (...args) => spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).stdout.trim();
const pid = adb('shell', 'pidof', 'art.splotch.app').split(/\s+/)[0];
const unix = adb('shell', 'cat', '/proc/net/unix');
const socket = unix.includes(`webview_devtools_remote_${pid}`) ? `webview_devtools_remote_${pid}` : unix.match(/webview_devtools_remote_\d+/)?.[0];
adb('forward', `tcp:${port}`, `localabstract:${socket}`);
try {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('https://localhost'));
  const result = await page.evaluate(`(() => { ${canvasDeltaFunctionSource()}; const d = sampleCanvasDelta();
    return { committed: window.__committedBrushMode?.(), viewport: [innerWidth, innerHeight],
      orientationType: screen.orientation?.type, inkedSamples: d.inkedSamples, surfaces: d.surfaces,
      lockSetting: localStorage.getItem('splotch-lock-rotation') }; })()`);
  console.log(JSON.stringify(result));
  await browser.close();
} finally {
  adb('forward', '--remove', `tcp:${port}`);
}
