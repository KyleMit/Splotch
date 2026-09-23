import { test, expect } from '@playwright/test';
import { gotoApp, drawCommittedStroke } from './helpers';
import { openDrawer, openStrokeMenu, opaqueCanvasPixelCount, pickBrush } from './flows-harness';

for (const viewport of [
  { width: 1000, height: 650 },
  { width: 460, height: 852 },
]) {
  test(`flyout origin follows the trigger at ${viewport.width} by ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await openDrawer(page);
    await page
      .locator('.actions-panel')
      .evaluate((panel: HTMLElement) => panel.style.setProperty('--action-btn-size', '80px'));
    await page.locator('#brushButton').click();
    const origin = await page
      .locator('.flyout-menu')
      .evaluate((menu) => parseFloat(getComputedStyle(menu).transformOrigin));
    const trigger = (await page.locator('#brushButton').boundingBox())!;
    expect(origin).toBe(viewport.width > viewport.height ? trigger.width / 2 : 0);
  });
}

test('flyouts replay staggered arrivals and unmount on close', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  for (const trigger of ['#brushButton', '#strokeWidthButton']) {
    await page.locator(trigger).click();
    const menu = page.locator('.flyout-menu:not([inert])');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await expect(menu.locator('button').nth(1)).toHaveCSS('animation-delay', '0.065s');
    await page.keyboard.press('Escape');
    await expect(page.locator('.flyout-menu')).toHaveCount(0);
    await page.locator(trigger).click();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await page.keyboard.press('Escape');
  }
});

test('a stroke size pick presses its trigger, even re-picking the same size', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const trigger = page.locator('#strokeWidthButton');
  for (let pick = 0; pick < 2; pick++) {
    await openStrokeMenu(page);
    await page.locator('.flyout-menu:not([inert]) button[aria-label="Size 4"]').click();
    await expect(trigger).toHaveCSS('animation-name', 'swatch-press');
    await expect(trigger).toHaveCSS('animation-name', 'none');
  }
});

test('a halo still lifting is released when reduced motion cancels its exit', async ({ page }) => {
  await gotoApp(page);
  // Turning reduced motion on mid-lift swaps the lift for no animation, which
  // cancels it rather than ending it; the ring's record must still go. Driven
  // in one page-side script so the switch lands inside the short lift, and
  // paced on the halo's own animations rather than the clock: the grow-in has
  // to end before the lift can begin, the lift has to be running before the
  // switch can cancel it, and the cancel is dispatched only by a rendering
  // update — each of which a starved worker grants late (issue #2196).
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector('#drawingCanvas')!;
    const rect = canvas.getBoundingClientRect();
    const send = (type: string) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 9,
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
          clientX: rect.left + 300,
          clientY: rect.top + 300,
          buttons: type === 'pointerup' ? 0 : 1,
        })
      );
    // Svelte scopes a component's keyframe names with its hash, so the halo's
    // animations are matched by suffix.
    const haloSettled = (ring: Element, keyframes: string) =>
      new Promise<string>((resolve) => {
        for (const type of ['animationend', 'animationcancel'])
          ring.addEventListener(type, (e) => {
            if (e instanceof AnimationEvent && e.animationName.endsWith(keyframes)) resolve(type);
          });
      });
    send('pointerdown');
    await Promise.resolve();
    const ring = document.querySelector('.brush-ring')!;
    const growIn = await haloSettled(ring, 'halo-in');
    send('pointerup');
    await Promise.resolve();
    const lifting = ring.classList.contains('lifting');
    const lift = ring
      .getAnimations()
      .find(
        (animation): animation is CSSAnimation =>
          animation instanceof CSSAnimation && animation.animationName.endsWith('halo-out')
      );
    await lift?.ready;
    const liftPlayState = lift?.playState;
    const liftSettled = haloSettled(ring, 'halo-out');
    document.documentElement.setAttribute('data-reduce-motion', '');
    return { growIn, lifting, liftPlayState, liftEnd: await liftSettled };
  });
  expect(result).toEqual({
    growIn: 'animationend',
    lifting: true,
    liftPlayState: 'running',
    liftEnd: 'animationcancel',
  });
  await expect(page.locator('.brush-ring')).toHaveCount(0);
});

// The grow-in, widened so the release lands inside it however starved the
// worker is — the defect is about which animation a halo's cleanup handler
// hears, not about how long the grow-in lasts, and a sleep sized to the real
// 120ms would overshoot on one slow frame. Applied through a rule that outranks
// the component's own scoped declaration rather than inline on the element, so
// the halo mounts already slowed and no frame can end the grow-in first.
const SLOW_HALO_GROW_IN_MS = 5_000;
const SLOW_HALO_GROW_IN_CSS = `:root:root .brush-ring, :root:root .eraser-bubble {
  --halo-in-duration: ${SLOW_HALO_GROW_IN_MS}ms;
}`;

// Both halos grow in on press and lift off when their stroke ends; the ring
// leaves on pointerup, the bubble on pointerleave.
const HALO_LIFTS = [
  {
    label: 'brush ring',
    selector: '.brush-ring',
    brush: '#penBrushButton',
    strokeEnd: 'pointerup',
  },
  {
    label: 'eraser bubble',
    selector: '.eraser-bubble',
    brush: '#eraserButton',
    strokeEnd: 'pointerleave',
  },
] as const;

for (const halo of HALO_LIFTS) {
  test(`the ${halo.label} lifts off when its stroke ends during the grow-in`, async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await pickBrush(page, halo.brush);
    await page.addStyleTag({ content: SLOW_HALO_GROW_IN_CSS });
    // Picking a brush leaves the pointer over the canvas: the flyout closing
    // recomputes the hover target, so the eraser arrives with its bubble
    // already up. Dismiss whatever is there — synthetically, as the scenario
    // below drives the halos — and let it leave before the press that matters.
    await page
      .locator('#drawingCanvas')
      .evaluate((canvas) =>
        canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, bubbles: true }))
      );
    await expect(page.locator(halo.selector)).toHaveCount(0);
    // Ending a stroke mid-grow-in swaps `halo-in` for `halo-out`, which CANCELS
    // the grow-in — and that cancellation reaches the same cleanup handler as
    // the lift's own end. Acting on it dropped the halo's record one frame into
    // the lift, so the halo popped out of existence instead of lifting off
    // (issue #2200). Driven page-side and paced on the halo's animations: the
    // release has to land after the grow-in has rendered a frame, because an
    // animation cancelled before its first frame fires no `animationcancel` at
    // all — the safe side of the window every earlier spec sat on.
    const lift = await page.evaluate(
      async ({ selector, strokeEnd }) => {
        const canvas = document.querySelector('#drawingCanvas')!;
        const rect = canvas.getBoundingClientRect();
        const send = (type: string) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              clientX: rect.left + 300,
              clientY: rect.top + 300,
              buttons: type === 'pointerdown' ? 1 : 0,
            })
          );
        // Svelte scopes a component's keyframe names with its hash, so the
        // halo's animations are matched by suffix. Resolving on the element's
        // removal as well keeps the pre-fix product — which deletes the record
        // on the grow-in's cancel, before the lift can start — failing on the
        // assertion rather than hanging on an event that never comes.
        const settled = (element: Element, keyframes: string) =>
          new Promise<string>((resolve) => {
            let pending = true;
            const finish = (outcome: string) => {
              pending = false;
              resolve(outcome);
            };
            for (const type of ['animationend', 'animationcancel'])
              element.addEventListener(type, (e) => {
                if (e instanceof AnimationEvent && e.animationName.endsWith(keyframes))
                  finish(type);
              });
            const watchRemoval = () => {
              if (!pending) return;
              if (element.isConnected) requestAnimationFrame(watchRemoval);
              else finish('removed');
            };
            requestAnimationFrame(watchRemoval);
          });

        send('pointerdown');
        await Promise.resolve();
        const element = document.querySelector(selector)!;
        const growIn = element
          .getAnimations()
          .find(
            (animation): animation is CSSAnimation =>
              animation instanceof CSSAnimation && animation.animationName.endsWith('halo-in')
          )!;
        await growIn.ready;
        await new Promise(requestAnimationFrame);
        const growInSettled = settled(element, 'halo-in');
        const liftSettled = settled(element, 'halo-out');
        const growInPlayState = growIn.playState;
        send(strokeEnd);
        return { growInPlayState, growInEnd: await growInSettled, liftEnd: await liftSettled };
      },
      { selector: halo.selector, strokeEnd: halo.strokeEnd }
    );
    // `animationend` on the lift is the whole point: it only arrives if the
    // element outlived the grow-in's cancellation and ran the lift's full
    // duration.
    expect(lift).toEqual({
      growInPlayState: 'running',
      growInEnd: 'animationcancel',
      liftEnd: 'animationend',
    });
    await expect(page.locator(halo.selector)).toHaveCount(0);
  });
}

test('reduced motion skips all five effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openDrawer(page);
  await expect(page.locator('.actions-drawer')).not.toHaveClass(/opening/);
  await page.locator('#brushButton').click();
  await expect(page.locator('.flyout-menu')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#penBrushButton')).toHaveCSS('animation-name', 'none');
  await page.locator('#crayonBrushButton').click();
  await expect(page.locator('.brush-button-faces')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await page.locator('#undoButton').click();
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 450, y: 330 },
  ]);
  await page.locator('#clearButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
});

test('brush face rolls only for a changed explicit menu pick', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const face = page.locator('.brush-button-faces');
  await expect(face).toHaveCSS('animation-name', 'none');
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  await expect(face).toHaveCSS('animation-name', /face-roll/);
  const original = await face.elementHandle();
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test('undo retires ink immediately beneath a shrinking overlay and drawing cancels it', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('animation-name', 'undo-ink');
  expect(
    await overlay.evaluate((canvas) => Number.parseFloat(canvas.style.getPropertyValue('--ink-tx')))
  ).not.toBe(0);
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'undo-spin');
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  expect(
    await overlay.evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0)
    )
  ).toBe(true);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 450, y: 330 },
  ]);
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
});

test('the undo ghost holds its first keyframe until the frame that painted it has landed', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  // The ghost's own callbacks are registered inside the click, so each of these
  // runs after its counterpart in the same frame: one paint opportunity has to
  // pass before the ghost starts. A single requestAnimationFrame would already
  // have started it by the first sample, which is the mutant this distinguishes.
  const started = await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    const ghost = document.querySelector('.undo-ink-motion');
    const state = () => ({
      running: ghost!.classList.contains('undo-ink-running'),
      play: ghost!.getAnimations().map((animation) => animation.playState),
    });
    return new Promise<{
      atUndo: ReturnType<typeof state>;
      afterFirstFrame: ReturnType<typeof state>;
      afterSecondFrame: ReturnType<typeof state>;
    }>((resolve) => {
      const atUndo = state();
      requestAnimationFrame(() => {
        const afterFirstFrame = state();
        requestAnimationFrame(() =>
          resolve({ atUndo, afterFirstFrame, afterSecondFrame: state() })
        );
      });
    });
  });
  expect(started.atUndo).toEqual({ running: false, play: ['paused'] });
  expect(started.afterFirstFrame).toEqual({ running: false, play: ['paused'] });
  expect(started.afterSecondFrame).toEqual({ running: true, play: ['running'] });

  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toHaveCount(0);
});

test('a second undo before the first ghost has faded still runs and cleans up', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await drawCommittedStroke(page, [
    { x: 260, y: 320 },
    { x: 450, y: 360 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  await page.locator('#undoButton').click();
  await page.locator('#undoButton').click();

  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toHaveClass(/undo-ink-running/);
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
});

test('crayon undo ghost carries only the pixels the undone stroke owned', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 425, y: 200 },
    { x: 435, y: 200 },
  ]);
  await drawCommittedStroke(page, [
    { x: 295, y: 210 },
    { x: 305, y: 210 },
  ]);
  await pickBrush(page, '#crayonBrushButton');
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  const canvasBox = (await page.locator('#drawingCanvas').boundingBox())!;
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toBeVisible();
  const overlayBox = (await overlay.boundingBox())!;
  const ghostAlphaAt = (x: number, y: number) =>
    overlay.evaluate(
      (canvas: HTMLCanvasElement, point) => {
        const scale = canvas.width / point.box.width;
        const cx = Math.round((point.x - point.box.x) * scale);
        const cy = Math.round((point.y - point.box.y) * scale);
        const data = canvas.getContext('2d')!.getImageData(cx - 1, cy - 1, 3, 3).data;
        let alpha = 0;
        for (let index = 3; index < data.length; index += 4) alpha = Math.max(alpha, data[index]);
        return alpha;
      },
      { x, y, box: overlayBox }
    );
  expect(await ghostAlphaAt(canvasBox.x + 390, canvasBox.y + 229)).toBeGreaterThan(0);
  expect(await ghostAlphaAt(canvasBox.x + 430, canvasBox.y + 200)).toBe(0);
  expect(await ghostAlphaAt(canvasBox.x + 300, canvasBox.y + 210)).toBe(0);
});

test('clear sends the page off as a sheet while clearing history and still permits undo', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  const inkBefore = await opaqueCanvasPixelCount(page);
  await page.locator('#clearButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const snapshot = page.locator('.clear-sheet-motion');
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveCSS('animation-name', 'clear-sheet');
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  expect(
    await snapshot.evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0)
    )
  ).toBe(true);
  await page.locator('#undoButton').click();
  await expect(snapshot).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(inkBefore);
});

test('drawer buttons cascade only on open and retain disabled styling', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const drawer = page.locator('.actions-drawer');
  await expect(drawer).not.toHaveClass(/opening/);
  await expect(page.locator('#undoButton')).toHaveCSS('opacity', '0.3');
  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await expect(page.locator('#undoButton')).toBeHidden();
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
  const cascades = await page
    .getByRole('button', { name: 'Expand controls' })
    .evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await Promise.resolve();
      return document
        .querySelector('.actions-drawer')!
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            animation instanceof CSSAnimation && animation.animationName === 'btn-cascade'
        );
    });
  expect(cascades).toBe(true);
  await expect(drawer).not.toHaveClass(/opening/);
});

test('enabling reduced motion retires an open drawer cascade without replaying it', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await page
    .getByRole('button', { name: 'Expand controls' })
    .evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await Promise.resolve();
      document
        .querySelector('.actions-drawer')!
        .getAnimations({ subtree: true })
        .forEach((animation) => animation.pause());
    });
  await expect(page.locator('.actions-drawer')).toHaveClass(/opening/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.actions-drawer')).not.toHaveClass(/opening/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
});

test('an automatic eraser reset cancels the face roll and does not replay it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await page.locator('#brushButton').click();
  await page.locator('#eraserButton').click();
  const face = page.locator('.brush-button-faces');
  await face.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.pause())
  );
  await page.locator('.color-swatch').first().click();
  await expect(page.locator('#drawingCanvas')).not.toHaveClass(/erasing/);
  await expect(face).toHaveCSS('animation-name', 'none');
});

test('live strokes suppress new flyout, face, and undo motion', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.locator('#brushButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.brush-menu')).toHaveCSS('animation-name', 'none');
  await page.locator('#crayonBrushButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.brush-button-faces')).toHaveCSS('animation-name', 'none');
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'none');
  await page.mouse.up();
});

test('a second swatch press replays the release once the first has settled', async ({ page }) => {
  await gotoApp(page);
  const swatch = page.locator('.color-swatch[data-color]').first();
  await swatch.click();
  await expect(swatch).toHaveClass(/\breleasing\b/);
  await expect(swatch).not.toHaveClass(/\breleasing\b/);
  await swatch.click();
  await expect(swatch).toHaveClass(/\breleasing\b/);
});
