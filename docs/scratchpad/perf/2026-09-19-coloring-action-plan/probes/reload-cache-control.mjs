// Control: does Cache Storage survive a reload in this Playwright context at
// all? Writes a cache the app knows nothing about, reloads, and reads it back
// before the app's pack manager could have run (document-start) and after.
// Usage: node reload-cache-control.mjs <base-url> <engine> <output.json>
import { writeFileSync } from 'node:fs';
import * as playwright from '@playwright/test';

const [base, engineName, output] = process.argv.slice(2);
const read = `(async () => {
  const out = {};
  for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).length;
  return out;
})()`;
// A fourth argument names a profile directory: the persistent-context variant.
const profileDir = process.argv[5];
const browser = profileDir ? null : await playwright[engineName].launch({ headless: true });
const context = profileDir
  ? await playwright[engineName].launchPersistentContext(profileDir, { headless: true })
  : await browser.newContext();
const page = await context.newPage();
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const cache = await caches.open('control-not-a-pack');
  await cache.put('/control-entry', new Response('kept'));
});
const record = { engine: engineName, persistent: Boolean(profileDir), beforeReload: await page.evaluate(read) };
await page.reload({ waitUntil: 'commit' });
record.atCommit = await page.evaluate(read);
await page.waitForTimeout(5_000);
record.after5s = await page.evaluate(read);
const other = await context.newPage();
await other.goto(new URL('/privacy', base).toString(), { waitUntil: 'load' });
record.secondTabSameContext = await other.evaluate(read);
await (browser ?? context).close();
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record));
