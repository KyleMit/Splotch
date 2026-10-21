import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await context.route('**', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort()
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('ERROR', e.message));
  await page.goto('http://127.0.0.1:6100');
  await page.getByRole('button', { name: 'Expand controls', exact: true }).waitFor();
  console.log(await page.locator('body').innerText());
  console.log(
    await page.getByRole('button').evaluateAll((nodes) =>
      nodes.map((n) => ({
        label: n.getAttribute('aria-label'),
        text: n.innerText,
        pressed: n.getAttribute('aria-pressed'),
      }))
    )
  );
  await page.screenshot({
    path: 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/chromium-phone-boot.png',
  });
  await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
  console.log(
    'EXPANDED',
    await page
      .getByRole('button')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => n.checkVisibility())
          .map((n) => n.getAttribute('aria-label') ?? n.innerText)
      )
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({
    path: 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/chromium-phone-settings.png',
  });
  console.log('SETTINGS', await page.getByRole('dialog').innerText());
  writeFileSync(
    'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/chromium-phone-inspect.txt',
    await page.locator('body').innerText()
  );
} finally {
  await browser.close();
}
