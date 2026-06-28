import { chromium } from 'playwright';
const URL = 'http://localhost:5173/';
const DIR = '/private/tmp/claude-501/-Users-kylemit-Code-Splotch/5b878f2c-47cf-4c0e-a979-1725b3c5d287/scratchpad';
async function draw(page) {
  const c = page.locator('canvas').first();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
try {
  const browser = await chromium.launch();

  // Phase 1: NO folder -> save must still work (download), not gated, no picker.
  {
    const ctx = await browser.newContext();
    let pickerCalls = 0;
    await ctx.exposeFunction('__pick', () => { pickerCalls++; });
    await ctx.addInitScript(() => {
      window.showDirectoryPicker = async () => { window.__pick(); throw new DOMException('x', 'AbortError'); };
    });
    const page = await ctx.newPage();
    let dl = false;
    page.on('download', () => (dl = true));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => { indexedDB.deleteDatabase('splotch-fs'); localStorage.setItem('splotch-drawer-open', 'true'); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await draw(page);
    await page.locator('#screenshotButton').click({ force: true });
    await page.waitForTimeout(700);
    console.log('Phase 1 (no folder): download fired =', dl, dl ? 'PASS' : 'FAIL', '| picker calls =', pickerCalls, pickerCalls === 0 ? 'PASS' : 'FAIL');
    await ctx.close();
  }

  // Phase 2: folder set (real OPFS handle) -> writes to folder, no download.
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      const proto = window.FileSystemHandle && window.FileSystemHandle.prototype;
      if (proto) { proto.queryPermission = async () => 'granted'; proto.requestPermission = async () => 'granted'; }
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle('SplotchTest', { create: true });
      };
      window.__seed = async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('SplotchTest', { create: true });
        const open = indexedDB.open('splotch-fs', 1);
        await new Promise((res, rej) => {
          open.onupgradeneeded = () => open.result.createObjectStore('handles');
          open.onsuccess = () => { const tx = open.result.transaction('handles', 'readwrite'); tx.objectStore('handles').put(dir, 'saveDir'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); };
          open.onerror = () => rej(open.error);
        });
      };
      window.__files = async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('SplotchTest', { create: true });
        const names = []; for await (const [n] of dir.entries()) names.push(n); return names;
      };
    });
    const page = await ctx.newPage();
    let dl = false;
    page.on('download', () => (dl = true));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => indexedDB.deleteDatabase('splotch-fs'));
    await page.evaluate(() => window.__seed());
    await page.evaluate(() => localStorage.setItem('splotch-drawer-open', 'true'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('#parentHelpButton').click();
    await page.waitForTimeout(600);
    const row = page.locator('div.folder-location');
    await row.scrollIntoViewIfNeeded();
    await row.screenshot({ path: DIR + '/v3-pill.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await draw(page);
    await page.locator('#screenshotButton').click({ force: true });
    await page.waitForTimeout(800);
    const files = await page.evaluate(() => window.__files());
    console.log('Phase 2 (folder set): files =', JSON.stringify(files), files.length === 1 ? 'PASS' : 'FAIL', '| download =', dl, dl === false ? 'PASS' : 'FAIL');
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
} catch (e) { console.log('ERROR', e && e.stack ? e.stack : String(e)); }
