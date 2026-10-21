import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  connect,
  open,
  boot,
  button,
  record,
  expect,
  OUT,
  ENGINE,
  stroke,
  undoDepth,
} from './driver.mjs';
import { land } from './ui.mjs';

const browser = await connect();
try {
  for (const profile of ['phone', 'tablet', 'desktop']) {
    const s = await open(browser, profile);
    try {
      await boot(s);
      await record(s, 'W06-mouse-contact', async () => {
        await s.page.evaluate(() => {
          window.__paperEvents = [];
          document
            .querySelector('[data-testid="drawing-paper"]')
            .addEventListener('pointerdown', (e) =>
              window.__paperEvents.push({ tool: e.pointerType, trusted: e.isTrusted })
            );
        });
        const paths = [
          [
            [0.25, 0.3],
            [0.6, 0.35],
          ],
          [
            [0.25, 0.45],
            [0.6, 0.5],
          ],
          [
            [0.25, 0.6],
            [0.6, 0.65],
          ],
        ];
        for (const path of paths) await stroke(s, [path], 'mouse');
        const separate = await undoDepth(s);
        expect(separate).toBe(3);
        await stroke(s, paths, 'mouse');
        const joined = await undoDepth(s);
        expect(joined).toBe(1);
        const events = await s.page.evaluate(() => window.__paperEvents);
        expect(events.some((e) => e.tool === 'mouse' && e.trusted)).toBe(true);
        return { events, separate, joined, driverAdmitted: true };
      });
    } finally {
      await s.ctx.close();
    }
  }
  for (const profile of ['phone', 'tablet']) {
    const s = await open(browser, profile);
    try {
      await boot(s);
      await record(s, 'W06-trusted-touch-dots', async () => {
        await s.page.evaluate(() => {
          window.__touchDots = [];
          document
            .querySelector('[data-testid="drawing-paper"]')
            .addEventListener('pointerdown', (e) =>
              window.__touchDots.push({ tool: e.pointerType, trusted: e.isTrusted })
            );
        });
        const b = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
        for (let i = 0; i < 3; i++) {
          await s.page.touchscreen.tap(b.x + b.width * (0.3 + i * 0.15), b.y + b.height * 0.4);
          await new Promise((r) => setTimeout(r, 450));
        }
        const depth = await undoDepth(s);
        expect(depth).toBe(3);
        const events = await s.page.evaluate(() => window.__touchDots);
        expect(events.filter((e) => e.tool === 'touch' && e.trusted).length).toBe(3);
        return {
          events,
          undo: depth,
          limits:
            'Trusted touch taps only. Continuous touch/pen/multitouch in WebKit and Firefox remains unproven without a supported remote touch drag API.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  if (ENGINE === 'chromium') {
    for (const profile of ['phone', 'tablet'])
      for (const count of [2, 5]) {
        const s = await open(browser, profile);
        try {
          await boot(s);
          await record(s, `D06-${count}-touches`, async () => {
            const b = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
            const points = Array.from({ length: count }, (_, i) => ({
              x: b.x + b.width * (0.25 + i * 0.12),
              y: b.y + b.height * 0.4,
              id: i + 1,
              radiusX: 4,
              radiusY: 4,
              force: 0.5,
            }));
            await s.cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: points,
            });
            for (let j = 0; j < 30; j++) {
              const moving = points.map((p) => ({
                ...p,
                y: p.y + b.height * j * 0.004,
                x: p.x + Math.sin(j / 4) * 3,
              }));
              await s.cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: moving,
              });
              await new Promise((r) => setTimeout(r, 8));
            }
            await s.page.screenshot({
              path: `${OUT}/evidence/${ENGINE}-${profile}-${count}-fingers-held.png`,
            });
            await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await land(s);
            expect(await undoDepth(s)).toBe(1);
            await stroke(s);
            expect(await undoDepth(s)).toBe(1);
            return {
              contacts: count,
              cohortUndo: 1,
              nextStrokeUndo: 1,
              input: 'trusted CDP touch',
              limits:
                'All contacts Pen; other brushes and independent lift sequence remain separate.',
            };
          });
        } finally {
          await s.ctx.close();
        }
      }
    const s = await open(browser, 'desktop');
    try {
      await boot(s);
      await record(s, 'W06-trusted-pen', async () => {
        await s.page.evaluate(() => {
          window.__penEvents = [];
          document
            .querySelector('[data-testid="drawing-paper"]')
            .addEventListener('pointerdown', (e) =>
              window.__penEvents.push({
                tool: e.pointerType,
                trusted: e.isTrusted,
                pressure: e.pressure,
              })
            );
        });
        const b = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
        await s.cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: b.x + b.width * 0.3,
          y: b.y + b.height * 0.4,
          button: 'left',
          buttons: 1,
          pointerType: 'pen',
          force: 0.3,
        });
        for (let j = 1; j <= 25; j++) {
          await s.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: b.x + b.width * (0.3 + j * 0.012),
            y: b.y + b.height * (0.4 + j * 0.002),
            button: 'left',
            buttons: 1,
            pointerType: 'pen',
            force: 0.7,
          });
          await new Promise((r) => setTimeout(r, 8));
        }
        await s.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: b.x + b.width * 0.6,
          y: b.y + b.height * 0.45,
          button: 'left',
          buttons: 0,
          pointerType: 'pen',
        });
        await land(s);
        expect(await undoDepth(s)).toBe(1);
        const events = await s.page.evaluate(() => window.__penEvents);
        expect(events.some((e) => e.tool === 'pen' && e.trusted)).toBe(true);
        return {
          events,
          undo: 1,
          limits: 'CDP pen pressure values; physical stylus fidelity unproven.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'desktop');
    try {
      await boot(s);
      await record(s, 'D07-idle-gap', async () => {
        const b = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
        const clip = {
          x: b.x + b.width * 0.5 - 3,
          y: b.y + b.height * 0.5 - 3,
          width: 6,
          height: 6,
        };
        const hash = async () =>
          createHash('sha256')
            .update(await s.page.screenshot({ clip }))
            .digest('hex');
        const blank = await hash();
        await s.page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.3);
        await s.page.mouse.down();
        await s.page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.35, { steps: 10 });
        await new Promise((r) => setTimeout(r, 1500));
        await s.page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.7);
        await s.page.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.72, { steps: 6 });
        await s.page.mouse.up();
        await land(s);
        await button(s.page, 'Purple').hover();
        expect(await hash()).toBe(blank);
        return {
          connectingMidpointUnchanged: true,
          limits:
            'Recheck of known fixed 3019; 1.5s idle intentionally crosses dropped-pointer cutoff.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} input batch ended; trusted mouse on three profiles, Chromium trusted pen/multitouch where applicable, and idle-gap regression attempted.\n`
  );
} finally {
  await browser.close();
}
