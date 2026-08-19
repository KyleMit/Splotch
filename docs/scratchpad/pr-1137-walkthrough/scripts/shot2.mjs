import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h, tag] of [
  [900, 900, 'desktop'],
  [400, 780, 'phone'],
]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5219/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const c = await p.locator('canvas').first().boundingBox();
  await p.mouse.move(c.x + c.width * 0.35, c.y + c.height * 0.45);
  await p.mouse.down();
  for (let i = 0; i <= 24; i++)
    await p.mouse.move(
      c.x + c.width * (0.35 + i * 0.011),
      c.y + c.height * (0.45 + Math.sin(i / 3) * 0.07)
    );
  await p.mouse.up();
  await p.waitForTimeout(300);
  const exp = p.getByLabel(/Expand controls/);
  if (await exp.isVisible().catch(() => false)) {
    await exp.click();
    await p.waitForTimeout(600);
  }
  await p.getByLabel(/Create AI image/).click();
  await p.waitForTimeout(1200);
  const box = await p.locator('.ai-style-thumb, img[class*=style-thumb]').first().boundingBox();
  console.log(
    tag,
    'thumb CSS px:',
    box && `${Math.round(box.width)}x${Math.round(box.height)}`,
    '| source 448px'
  );
  const dlg = p.locator('dialog[open]').first();
  await dlg.screenshot({ path: `.viz/out/_picker-${tag}.png` });
  await p.close();
}
await b.close();
