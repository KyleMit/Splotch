// Frozen evidence, not maintained automation: the instrument behind the
// placement and behavior tables in ../popover-api-flyout-eval-2026-08.md, kept
// so the decision can be re-measured against a future engine instead of rebuilt
// from that prose. Nothing imports it and no npm script runs it — it is
// deliberately outside tools/ (ADR-0108's tree is for repo automation, which
// this is not). It reads no app code, so it cannot fail when the app changes;
// re-check harness.html against app.css before trusting a fresh run.
//
//   node docs/scratchpad/popover-probe/probe.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, 'harness.html');

const VIEWPORTS = {
  'landscape tablet 1024x768': { width: 1024, height: 768 },
  'portrait tablet 768x1024': { width: 768, height: 1024 },
  'portrait phone 390x844': { width: 390, height: 844 },
};

function rel(menu, trigger) {
  return {
    dx: +(menu.x - trigger.x).toFixed(1),
    dyBottomToTop: +(trigger.y - (menu.y + menu.height)).toFixed(1),
    x: +menu.x.toFixed(1),
    y: +menu.y.toFixed(1),
    w: +menu.width.toFixed(1),
    h: +menu.height.toFixed(1),
  };
}

const browser = await chromium.launch();
const results = {};

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport });
  await page.goto(url);
  results[label] = {};
  for (const mode of ['custom', 'popover', 'popover-anchored']) {
    await page.evaluate((m) => window.__applyMode(m), mode);
    await page.click('#brushButton');
    await page.waitForTimeout(30);
    const boxes = await page.evaluate(() => {
      const t = document.getElementById('brushButton').getBoundingClientRect();
      const m = document.getElementById('brushMenu').getBoundingClientRect();
      return { t: t.toJSON(), m: m.toJSON() };
    });
    results[label][mode] = rel(boxes.m, boxes.t);
  }
  await page.close();
}

console.log('=== A. Placement: flyout box vs its trigger button ===');
for (const [label, modes] of Object.entries(results)) {
  console.log('\n' + label);
  for (const [mode, box] of Object.entries(modes)) {
    console.log(
      `  ${mode.padEnd(8)} left=${box.x} top=${box.y} ${box.w}x${box.h}  ` +
        `dx(menu.left - trigger.left)=${box.dx}  gap(trigger.top - menu.bottom)=${box.dyBottomToTop}`
    );
  }
}

// === B. Interaction: tap the trigger while its own popover is open ===
const page = await browser.newPage({
  viewport: VIEWPORTS['landscape tablet 1024x768'],
});
await page.goto(url);
const interaction = {};
for (const mode of ['custom', 'popover']) {
  await page.evaluate((m) => window.__applyMode(m), mode);
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  const afterFirst = await page.evaluate(() => window.__state());
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  const afterSecond = await page.evaluate(() => window.__state());
  const log = await page.evaluate(() => window.__log.slice());
  interaction[mode] = { afterFirst, afterSecond, log };
}

console.log('\n=== B. Second tap on the same trigger (should close, not reopen) ===');
for (const [mode, r] of Object.entries(interaction)) {
  console.log(`\n  ${mode}`);
  console.log('    after tap 1:', JSON.stringify(r.afterFirst));
  console.log('    after tap 2:', JSON.stringify(r.afterSecond));
  console.log('    event order:', r.log.join(' | '));
}

// === C. Mutual exclusion: open brush, then tap the stroke trigger ===
console.log('\n=== C. Mutual exclusion (open brush, then tap stroke) ===');
for (const mode of ['custom', 'popover']) {
  await page.evaluate((m) => window.__applyMode(m), mode);
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  await page.click('#strokeButton');
  await page.waitForTimeout(30);
  const state = await page.evaluate(() => window.__state());
  const log = await page.evaluate(() => window.__log.slice());
  console.log(`  ${mode.padEnd(8)}`, JSON.stringify(state));
  console.log('           event order:', log.join(' | '));
}

// === D. Outside dismissal ===
console.log('\n=== D. Outside tap dismissal ===');
for (const mode of ['custom', 'popover']) {
  await page.evaluate((m) => window.__applyMode(m), mode);
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  await page.mouse.click(900, 120);
  await page.waitForTimeout(30);
  const state = await page.evaluate(() => window.__state());
  const log = await page.evaluate(() => window.__log.slice());
  console.log(`  ${mode.padEnd(8)}`, JSON.stringify(state), '|', log.join(' | '));
}

// === E. Escape dismissal ===
console.log('\n=== E. Escape dismissal ===');
for (const mode of ['custom', 'popover']) {
  await page.evaluate((m) => window.__applyMode(m), mode);
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(30);
  const state = await page.evaluate(() => window.__state());
  console.log(`  ${mode.padEnd(8)}`, JSON.stringify(state));
}

// === F. Drawer clip escape (overflow:hidden while the drawer is collapsing) ===
console.log('\n=== F. Clipped by .actions-drawer-inner overflow:hidden ===');
for (const mode of ['custom', 'popover']) {
  await page.evaluate((m) => window.__applyMode(m), mode);
  await page.evaluate(() => document.body.removeAttribute('data-drawer-open'));
  await page.click('#brushButton');
  await page.waitForTimeout(30);
  const visible = await page.evaluate(() => {
    const m = document.getElementById('brushMenu');
    const r = m.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      rect: [Math.round(r.x), Math.round(r.y)],
      hitInsideMenu: m.contains(hit),
    };
  });
  console.log(`  ${mode.padEnd(8)}`, JSON.stringify(visible));
  await page.evaluate(() => document.body.setAttribute('data-drawer-open', ''));
}

const support = await page.evaluate(() => ({
  popoverSupported: 'showPopover' in HTMLElement.prototype,
  ua: navigator.userAgent,
}));
console.log('\nengine:', support.ua, '| popover supported:', support.popoverSupported);

await browser.close();
