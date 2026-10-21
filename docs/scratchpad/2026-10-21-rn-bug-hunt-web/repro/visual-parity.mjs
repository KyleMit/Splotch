import { chromium, webkit, firefox, expect } from '@playwright/test';
import { mkdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pixelDifference, boxDifferences, controlBoxes, saveJson } from './visual-metrics.mjs';

const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const ROOT = `${OUT}/evidence/visual`;
const engines = { chromium, webkit, firefox };
const engine = process.env.HUNT_ENGINE ?? 'chromium';
const viewports = [
  ['phone-320x568', 320, 568],
  ['phone-375x667', 375, 667],
  ['phone-390x844', 390, 844],
  ['phone-412x915', 412, 915],
  ['phone-844x390', 844, 390],
  ['tablet-820x1180', 820, 1180],
  ['tablet-1180x820', 1180, 820],
  ['desktop-1280x800', 1280, 800],
  ['desktop-1920x1080', 1920, 1080],
];
const chosen = viewports.filter(
  ([id]) =>
    (engine === 'chromium' || !id.startsWith('tablet')) &&
    (!process.env.HUNT_VIEWPORTS || process.env.HUNT_VIEWPORTS.split(',').includes(id))
);
const themes = ['light', 'dark'],
  styles = ['buttons', 'bare'],
  sizes = [100, 130];
const states = [
  'blank',
  'drawer',
  'picker',
  'brush',
  'width',
  'settings',
  'clear-drag',
  'coloring',
];
const button = (p, name) =>
  p.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let active = '',
  completed = 0;
const progress = (message) =>
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — VISUAL ${engine}: ${message}\n`
  );
const heartbeat = setInterval(
  () => progress(`active ${active}; ${completed} completed pairs this process.`),
  25 * 60 * 1000
);
mkdirSync(ROOT, { recursive: true });
const browser = await engines[engine].connect('ws://127.0.0.1:6190/', { timeout: 15000 });
process.once('SIGTERM', () => {
  void browser.close().finally(() => process.exit(124));
});

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const a = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.allSettled(a.map((a) => a.finished));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await pause(420);
}
async function snapshot(page, arm, path) {
  let prev = '',
    equal = 0,
    last,
    frames = 0;
  const start = Date.now();
  while (Date.now() - start < 8000) {
    last = await page.screenshot({ caret: 'hide' });
    frames++;
    const sha = createHash('sha256').update(last).digest('hex');
    equal = Date.now() - start >= 1000 && sha === prev ? equal + 1 : 0;
    prev = sha;
    if (equal >= 2) break;
    await pause(150);
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, last);
  return {
    boxes: await controlBoxes(page, arm),
    settled: equal >= 2,
    frames,
    ms: Date.now() - start,
    sha256: prev,
  };
}
async function newArm(arm, viewport, theme, style, size) {
  const touch = !viewport[0].startsWith('desktop');
  const context = await browser.newContext({
    viewport: { width: viewport[1], height: viewport[2] },
    deviceScaleFactor: 1,
    hasTouch: touch,
    ...(engine === 'firefox' ? {} : { isMobile: touch }),
    colorScheme: theme,
    serviceWorkers: 'block',
  });
  const external = [],
    errors = [],
    localBlobs = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (
      u.protocol === 'blob:' &&
      ['http://127.0.0.1:6150', 'http://127.0.0.1:6151'].includes(u.origin)
    ) {
      localBlobs.push(route.request().url());
      return route.continue();
    }
    if (u.hostname === '127.0.0.1' && !u.pathname.startsWith('/api/')) return route.continue();
    external.push(route.request().method() + ' ' + route.request().url());
    return route.abort('blockedbyclient');
  });
  const seed = JSON.parse(readFileSync(`${OUT}/evidence/${arm}-visual-seed.json`, 'utf8'));
  if (arm === 'rn') {
    const value = JSON.parse(seed['splotch-candidate:sound-v1']);
    value.appearance = theme;
    value.toolbarStyle = style;
    value.buttonScale = size;
    value.soundEnabled = false;
    seed['splotch-candidate:sound-v1'] = JSON.stringify(value);
  } else {
    seed['splotch-theme'] = theme;
    seed['splotch-toolbar-style'] = style;
    seed['splotch-action-button-scale'] = String(size);
    seed['splotch-sound-enabled'] = 'false';
  }
  seed['splotch-drawer-open'] = 'false';
  await context.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${arm === 'rn' ? 6150 : 6151}/`);
  if (arm === 'rn') await page.locator('html[data-drawing-live][data-controls-live]').waitFor();
  else {
    await page.waitForFunction(() => {
      const c = document.querySelector('#drawingCanvas');
      return c && c.width !== 300 && document.querySelector('[data-action-panel-live]');
    });
  }
  await expect(button(page, 'Settings')).toBeVisible();
  await settle(page);
  return { page, context, errors, external, localBlobs, arm };
}
async function expand(page) {
  const e = button(page, 'Expand controls');
  if (await e.isVisible()) await e.click();
  await expect(button(page, 'Collapse controls')).toBeVisible();
  await settle(page);
}
async function dismiss(page) {
  await page.keyboard.press('Escape');
  await settle(page);
}
async function paint(page, arm) {
  const paper = page.locator(arm === 'rn' ? '[data-testid="drawing-paper"]' : '#drawingCanvas'),
    r = await paper.boundingBox();
  const y = r.y + r.height * 0.45;
  await page.mouse.move(r.x + r.width * 0.35, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      r.x + r.width * (0.35 + (0.25 * i) / 12),
      y + Math.sin((i / 12) * Math.PI) * 30
    );
    await pause(12);
  }
  await page.mouse.up();
  await page.mouse.move(1, 1);
  await settle(page);
}
async function setupState(s, state) {
  const { page, arm } = s;
  if (state === 'blank') return;
  await expand(page);
  if (state === 'drawer') return;
  if (state === 'picker') {
    if (!(await button(page, 'Custom Color').isVisible())) {
      const color = page
        .getByRole('button', { name: /^(Color|Colors|Choose color)$/i })
        .filter({ visible: true })
        .first();
      await color.click();
      await settle(page);
    }
    await button(page, 'Custom Color').click();
    await expect(page.getByRole('dialog', { name: 'Color Picker', exact: true })).toBeVisible();
    await settle(page);
    return;
  }
  if (state === 'brush') {
    await button(page, 'Brushes').click();
    await expect(
      arm === 'rn'
        ? page.getByRole('group', { name: 'Brush Menu', exact: true })
        : page.locator('.brush-menu')
    ).toBeVisible();
    await settle(page);
    return;
  }
  if (state === 'width') {
    await button(page, 'Stroke width').click();
    await expect(
      arm === 'rn'
        ? page.getByRole('group', { name: 'Stroke Width Menu', exact: true })
        : page.locator('.stroke-width-menu')
    ).toBeVisible();
    await settle(page);
    return;
  }
  if (state === 'settings') {
    await expect(async () => {
      if (!(await page.getByRole('dialog', { name: 'Settings', exact: true }).isVisible()))
        await button(page, 'Settings').click();
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });
    await settle(page);
    return;
  }
  if (state === 'clear-drag') {
    await paint(page, arm);
    const b = await button(page, 'Clear drawing').boundingBox();
    const x = Math.min(b.x + b.width / 2, page.viewportSize().width - 8),
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(
      x - Math.min(120, page.viewportSize().width * 0.3),
      Math.min(y + 20, page.viewportSize().height - 10),
      { steps: 12 }
    );
    await settle(page);
    await expect
      .poll(async () => {
        const moved = await button(page, 'Clear drawing').boundingBox();
        return Math.abs(moved.x - b.x) + Math.abs(moved.y - b.y);
      })
      .toBeGreaterThan(2);
    return {
      input: 'trusted mouse',
      from: { x, y },
      before: b,
      heldBox: await button(page, 'Clear drawing').boundingBox(),
    };
  }
  if (state === 'coloring') {
    await button(page, 'Coloring books').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    const cat = button(page, 'Cat coloring page');
    if (!(await cat.isVisible())) {
      const farm = page
        .getByRole('button', { name: /^Farm(,|$)/ })
        .filter({ visible: true })
        .first();
      await farm.click();
      await settle(page);
    }
    await cat.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (arm === 'shipping') {
      await expect(page.locator('#coloringOverlay.overlay-ready')).toBeVisible();
      await page.waitForFunction(() => {
        const image = document.querySelector('#coloringOverlay');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      });
    }
    await settle(page);
    return;
  }
}
try {
  for (const viewport of chosen)
    for (const theme of themes)
      for (const style of styles)
        for (const size of sizes) {
          if (
            process.env.HUNT_CONFIGS &&
            !process.env.HUNT_CONFIGS.split(',').includes(`${theme}-${style}-${size}`)
          )
            continue;
          const captures = {};
          for (const arm of ['shipping', 'rn']) {
            let s;
            try {
              s = await newArm(arm, viewport, theme, style, size);
              for (const state of states) {
                const id = `${engine}/${viewport[0]}/${theme}-${style}-${size}/${state}`,
                  directory = `${ROOT}/${id}`;
                mkdirSync(directory, { recursive: true });
                active = id + '/' + arm;
                if (existsSync(`${directory}/${arm}.json`) && !process.env.HUNT_RETAKE) continue;
                let row = {
                  id,
                  arm,
                  engine,
                  browserVersion: browser.version(),
                  viewport: { width: viewport[1], height: viewport[2] },
                  theme,
                  style,
                  size,
                  state,
                };
                try {
                  const stateReceipt = await setupState(s, state);
                  const capture = await snapshot(s.page, arm, `${directory}/${arm}.png`);
                  const root = await s.page.locator('html').evaluate((e) => ({
                    attrs: Object.fromEntries([...e.attributes].map((a) => [a.name, a.value])),
                    font: getComputedStyle(e).fontSize,
                    fontFaces: [...document.fonts].map((f) => ({
                      family: f.family,
                      status: f.status,
                      weight: f.weight,
                    })),
                    textSamples: [
                      ...document.querySelectorAll(
                        'h2,[role="heading"],dialog[open] button,[role="dialog"] button'
                      ),
                    ]
                      .filter((n) => n.getBoundingClientRect().width > 0)
                      .slice(0, 5)
                      .map((n) => {
                        const s = getComputedStyle(n);
                        return {
                          text: n.textContent?.slice(0, 90),
                          family: s.fontFamily,
                          size: s.fontSize,
                          weight: s.fontWeight,
                          lineHeight: s.lineHeight,
                        };
                      }),
                  }));
                  row = {
                    ...row,
                    status: 'CAPTURED',
                    ...capture,
                    stateReceipt,
                    root,
                    errors: [...s.errors],
                    external: [...s.external],
                    allowedLocalBlobs: [...s.localBlobs],
                  };
                } catch (e) {
                  row = { ...row, status: 'BLOCKED', error: e.message };
                  await s.page
                    .screenshot({ path: `${directory}/${arm}-blocked.png` })
                    .catch(() => {});
                }
                saveJson(`${directory}/${arm}.json`, row);
                captures[`${state}/${arm}`] = row;
                if (state === 'clear-drag') {
                  await s.page.mouse.up();
                  await settle(s.page);
                  await button(s.page, 'Clear drawing').focus();
                  await s.page.keyboard.press('Enter');
                  await settle(s.page);
                } else if (['picker', 'brush', 'width', 'settings'].includes(state))
                  await dismiss(s.page);
              }
            } catch (e) {
              progress(`${active} arm setup failed: ${e.message.slice(0, 200)}`);
              throw e;
            } finally {
              await s?.context.close();
            }
          }
          for (const state of states) {
            const id = `${engine}/${viewport[0]}/${theme}-${style}-${size}/${state}`,
              dir = `${ROOT}/${id}`;
            const a = JSON.parse(readFileSync(`${dir}/shipping.json`, 'utf8')),
              b = JSON.parse(readFileSync(`${dir}/rn.json`, 'utf8'));
            const row = {
              id,
              engine,
              viewport: viewport[0],
              theme,
              style,
              size,
              state,
              shipping: a.status,
              rn: b.status,
            };
            if (a.status === 'CAPTURED' && b.status === 'CAPTURED') {
              row.pixel = await pixelDifference(
                `${dir}/shipping.png`,
                `${dir}/rn.png`,
                `${dir}/diff.png`
              );
              row.boxDifferences = boxDifferences(a.boxes, b.boxes).filter(
                (d) => d.key !== 'drawer-container-shipping-only'
              );
              row.unsettled = [a, b].filter((r) => !r.settled).map((r) => r.arm);
              row.status = 'COMPARED';
            } else {
              row.status = 'BLOCKED';
              row.errors = { shipping: a.error, rn: b.error };
            }
            saveJson(`${dir}/comparison.json`, row);
            appendFileSync(`${ROOT}/comparisons.jsonl`, JSON.stringify(row) + '\n');
            completed++;
          }
          progress(
            `completed ${viewport[0]} ${theme}/${style}/${size}; ${completed} pairs this process.`
          );
          console.log(
            JSON.stringify({
              at: new Date().toISOString(),
              engine,
              viewport: viewport[0],
              theme,
              style,
              size,
              completed,
            })
          );
        }
} finally {
  clearInterval(heartbeat);
  await browser.close();
  progress(`process ended; ${completed} pairs. Browser connection closed.`);
}
