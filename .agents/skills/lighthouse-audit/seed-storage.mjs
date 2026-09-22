#!/usr/bin/env node
// Seed localStorage for an origin into a Chrome profile directory before a
// Lighthouse run, so a "first visit" can start from a persisted startup
// setting (dark theme, bare toolbar, drawer open, …) the way a returning
// child's device does. Lighthouse 12 resets file_systems, shader_cache,
// service_workers, cache_storage and the HTTP cache between runs but leaves
// localStorage alone, so a value written here survives into the audited page.
//
// Every request from the seeding page is answered locally with an empty
// no-store document: nothing real is fetched, so the HTTP cache the audit's
// first visit must find cold stays cold.
//
// Usage: node seed-storage.mjs <profileDir> <origin> <key=value>[;<key=value>…]
//        [--chrome <path>]

import { chromium } from '@playwright/test';

const [profileDir, origin, pairs] = process.argv.slice(2);
const chromeIdx = process.argv.indexOf('--chrome');
const executablePath = chromeIdx > -1 ? process.argv[chromeIdx + 1] : undefined;
if (!profileDir || !origin || !pairs) {
  console.error(
    'usage: seed-storage.mjs <profileDir> <origin> <key=value;key=value> [--chrome <path>]'
  );
  process.exit(2);
}

const entries = pairs
  .split(';')
  .filter(Boolean)
  .map((pair) => {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`bad --storage entry "${pair}" (want key=value)`);
    return [pair.slice(0, eq), pair.slice(eq + 1)];
  });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
try {
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'cache-control': 'no-store' },
      body: '<!doctype html><title>seed</title>',
    })
  );
  await page.goto(new URL('/__lighthouse-seed', origin).href);
  const written = await page.evaluate((items) => {
    for (const [key, value] of items) localStorage.setItem(key, value);
    return Object.keys(localStorage).length;
  }, entries);
  console.log(`  seeded ${entries.length} localStorage key(s) for ${origin} (${written} present)`);
} finally {
  await context.close();
}
