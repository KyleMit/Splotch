// Real-Chromium check of the stopped-press latch, after Codex's round-2 probe: touch, mouse and
// keyboard presses on two controls while a stopped finger is held across the controls going live.
// node latch-probe.mjs
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(repo, 'package.json'));
const { chromium } = require('playwright');
const m = await import(join(repo, 'tools/migration/prerender-native-web.mjs'));
const variants = m.FIRST_FRAME_VIEWPORTS.flatMap((v) =>
  m.FIRST_FRAME_THEMES.map((t) => ({
    key: m.variantKey(v, t),
    id: `first-frame-${m.variantKey(v, t)}`,
  }))
);
const boot = m.firstFrameBootScript(variants);
const start = boot.indexOf('(function(){var P=');
const end = boot.indexOf('})();', start) + 5;
const early = boot.slice(start, end);
if (start < 0 || !early.includes('owed')) throw new Error('early input script not found');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 600, height: 600 },
  });
  const page = await context.newPage();
  await page.setContent(
    '<style>*{touch-action:none}button{position:absolute;top:100px;width:100px;height:100px}#a{left:50px}#b{left:250px}</style><div id="root"><button id="a">A</button><button id="b">B</button></div>'
  );
  await page.evaluate(early);
  await page.evaluate(() => {
    window.reached = [];
    for (const name of ['pointerdown', 'pointerup', 'click'])
      document
        .getElementById('root')
        .addEventListener(name, (e) => window.reached.push(`${e.type}:${e.target.id}`));
  });
  const cdp = await context.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const take = async (stage) => {
    results.push({ stage, reached: await page.evaluate(() => window.reached.splice(0)) });
  };
  const B = { id: 2, x: 300, y: 150 };
  await touch('touchStart', [B]);
  await take('finger on B before live (stopped)');
  await page.evaluate(() => document.documentElement.setAttribute('data-controls-live', ''));
  await page.mouse.click(100, 150);
  await take('mouse click on A while B held');
  await page.mouse.click(300, 150);
  await take('mouse click on B while B held');
  await page.locator('#a').focus();
  await page.keyboard.press('Enter');
  await take('Enter on focused A while B held');
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  await take('stopped finger lifts from B');
  await touch('touchStart', [B]);
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  await take('fresh tap on B after');
} finally {
  await browser.close();
}
for (const r of results) console.log(JSON.stringify(r));
