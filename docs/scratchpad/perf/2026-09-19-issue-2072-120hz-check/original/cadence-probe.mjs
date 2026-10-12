// Unscored pre-capture check: open /dev/engine, record 5 s of idle rAF intervals, report the page's
// cadence, viewport, DPR, UA, and served entry. Closes its tab.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const [base, label] = process.argv.slice(2);
const S = '<serial>', PORT = 9233;
const adb = (...a) => spawnSync('adb', ['-s', S, ...a], { encoding: 'utf8' }).stdout;
const url = `${base}?probe=${label}-${Date.now()}`;
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, 'com.android.chrome');
adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
try {
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = browser.contexts()[0].pages().find((p) => p.url() === url); if (!page) await new Promise((r) => setTimeout(r, 500)); }
  await page.bringToFront();
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const st = []; let on = true;
    const tick = (t) => { st.push(t); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await new Promise((res) => setTimeout(res, 5000)); on = false;
    const g = st.slice(1).map((t, i) => t - st[i]).sort((a, b) => a - b);
    const entry = performance.getEntriesByType('resource').map((x) => x.name).find((n) => n.includes('/entry/start.'));
    return { frames: g.length, median: g[g.length >> 1], p05: g[Math.floor(g.length * 0.05)], p95: g[Math.floor(g.length * 0.95)], max: g.at(-1), W: innerWidth, H: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, entry: entry?.split('/').pop(), orientation: screen.orientation?.type };
  });
  console.log(JSON.stringify({ label, hz: adb('shell', 'dumpsys', 'display').match(/renderFrameRate\s+([\d.]+)/)?.[1], ...r }));
  await page.close();
} finally { await browser.close().catch(() => {}); spawnSync('adb', ['-s', S, 'forward', '--remove', `tcp:${PORT}`]); }
