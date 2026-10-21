import { chromium, webkit, firefox } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
const out = [];
for (const [name, type] of Object.entries({ chromium, webkit, firefox })) {
  let browser;
  try {
    browser = await type.launch({ headless: true, timeout: 15000 });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: 'block',
    });
    await context.route('**', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' ? r.fallback() : r.abort()
    );
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:6100');
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 15000 });
    out.push({ name, status: 'ready', version: browser.version() });
  } catch (error) {
    out.push({ name, status: 'blocked', error: stripVTControlCharacters(String(error)) });
  } finally {
    await browser?.close().catch(() => {});
  }
  writeFileSync(
    'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/browser-capabilities.json',
    JSON.stringify(out, null, 2) + '\n'
  );
  console.log(
    name,
    out.at(-1).status,
    out
      .at(-1)
      .error?.split('\n')
      .find((l) => /FATAL|Permission|EPERM|Sandbox|denied/.test(l)) ?? ''
  );
}
