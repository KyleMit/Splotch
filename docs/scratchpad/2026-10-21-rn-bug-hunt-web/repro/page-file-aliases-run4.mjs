import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, webkit, firefox, expect } from '@playwright/test';
import { localContext, fontsReady, reactHydrated, receipt, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
const files = [
  'index.html',
  'privacy.html',
  'changelog.html',
  'beta.html',
  'feedback.html',
  'admin.html',
  'design.html',
  '404.html',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  for (const js of [true, false])
    for (const file of files) {
      const s = await localContext(browser, {
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: js,
        reducedMotion: 'reduce',
      });
      const row = { at: new Date().toISOString(), engine, js, file, status: 'PASS' };
      try {
        const response = await s.page.goto(`${BASE}/${file}`);
        row.http = response.status();
        row.hash = hash(await response.body());
        expect(row.http).toBe(200);
        expect(row.hash).toBe(
          hash(readFileSync(`experiments/native-architecture/dist/web/${file}`))
        );
        await fontsReady(s.page);
        if (js) {
          await reactHydrated(s.page);
          if (file === 'index.html')
            await s.page.locator('html[data-controls-live]').waitFor({ state: 'attached' });
        }
        row.read = await receipt(s.page);
        if (file === 'index.html' && js) expect(row.read.headings).toEqual([]);
        else expect(row.read.headings).toHaveLength(1);
        expect(row.read.csp).toEqual([]);
        expect(s.errors).toEqual([]);
        expect(s.external).toEqual([]);
        row.errors = s.errors;
        row.external = s.external;
      } catch (error) {
        row.status = 'REVIEW';
        row.error = String(error.stack);
      } finally {
        await s.context.close();
        appendFileSync(`${EVIDENCE}/file-aliases.jsonl`, JSON.stringify(row) + '\n');
        console.log(
          JSON.stringify({ engine, js, file, status: row.status, error: row.error?.slice(0, 200) })
        );
      }
    }
} finally {
  await browser.close();
}
