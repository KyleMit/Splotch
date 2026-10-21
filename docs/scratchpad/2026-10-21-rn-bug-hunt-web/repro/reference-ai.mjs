import { writeFileSync } from 'node:fs';
import { connect, open, expect, OUT, ENGINE } from './driver.mjs';
import { land } from './ui.mjs';
import {
  boot,
  openSettings,
  openSection,
  expandDrawer,
} from '../../2026-10-18-device-parity/results/web/harness.mjs';
import {
  installAiFixture,
  AI_REPLIES,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const browser = await connect();
try {
  const s = await open(browser, 'phone');
  Object.assign(s, {
    base: 'http://127.0.0.1:6151',
    paper: '#drawingCanvas',
    profile: 'iphone',
    arm: 'web-prod',
  });
  const requests = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
  try {
    await boot(s);
    await openSettings(s);
    await openSection(s, 'AI Art');
    for (const [name, value] of [
      ['Create AI Images', true],
      ['Customize AI Style', true],
      ['Auto-Save AI Images', false],
    ]) {
      const toggle = s.page
        .getByRole('switch', { name, exact: true })
        .filter({ visible: true })
        .first();
      if ((await toggle.isChecked()) !== value) await toggle.click();
      await expect(toggle).toBeChecked({ checked: value });
    }
    await s.page.keyboard.press('Escape');
    await expect(s.page.getByRole('dialog')).toHaveCount(0);
    const paper = await s.page.locator('#drawingCanvas').boundingBox();
    const SAMPLE_COUNT = 24;
    const SAMPLE_INTERVAL_MS = 8;
    await s.page.mouse.move(paper.x + paper.width * 0.25, paper.y + paper.height * 0.35);
    await s.page.mouse.down();
    for (let sample = 1; sample <= SAMPLE_COUNT; sample++) {
      await s.page.mouse.move(
        paper.x + paper.width * (0.25 + (0.35 * sample) / SAMPLE_COUNT),
        paper.y + paper.height * (0.35 + (0.08 * sample) / SAMPLE_COUNT)
      );
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
    await s.page.mouse.up();
    await expandDrawer(s);
    await s.page
      .getByRole('button', { name: /AI image/ })
      .filter({ visible: true })
      .first()
      .click();
    const sticker = s.page.getByRole('button', { name: 'Sticker', exact: true });
    await expect(sticker).toBeVisible();
    await land(s);
    await sticker.click();
    await expect(s.page.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await land(s);
    expect(requests.filter((row) => row.path === '/api/generate-image')).toHaveLength(1);
    const result = {
      engine: ENGINE,
      version: browser.version(),
      source: 'shipping reference b236d639160459eecd60900926c759af5d4ae080',
      generatedFixturePicture: true,
      requests,
      limits:
        'Serve the recorded API fixture; this does not establish delivery through the hosted API.',
    };
    await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-reference-ai-result.png` });
    writeFileSync(
      `${OUT}/evidence/${ENGINE}-reference-ai.json`,
      JSON.stringify(result, null, 2) + '\n'
    );
    console.log(JSON.stringify(result));
  } finally {
    await s.ctx.close();
  }
} finally {
  await browser.close();
}
