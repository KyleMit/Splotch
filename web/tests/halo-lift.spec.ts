import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers';
import { openDrawer, pickBrush } from './flows-harness';

// The halo lifecycle at its hardest moment: the handoff from the grow-in to the
// lift-off. A halo's cleanup handlers hear every animation its element runs, so
// what ends the record has to be told apart from what merely stops. The steady
// mid-lift case — reduced motion cancelling a lift already running — lives with
// the other motion coverage in drawing-motion.spec.ts.

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

  test(`the ${halo.label} is released when reduced motion lands in the handoff`, async ({
    page,
  }) => {
    await gotoApp(page);
    await openDrawer(page);
    await pickBrush(page, halo.brush);
    await page.addStyleTag({ content: SLOW_HALO_GROW_IN_CSS });
    await page
      .locator('#drawingCanvas')
      .evaluate((canvas) =>
        canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, bubbles: true }))
      );
    await expect(page.locator(halo.selector)).toHaveCount(0);
    // The gap the lift's own end event cannot cover: reduced motion turned on in
    // the same task as the stroke's end, before the lift has rendered anything.
    // The grow-in is cancelled under a name the cleanup handlers ignore, and the
    // lift is cancelled while still play-pending, which fires nothing — so the
    // halo would sit over the drawing for good if the switch did not release it.
    const stranded = await page.evaluate(
      async ({ selector, strokeEnd }) => {
        const canvas = document.querySelector('#drawingCanvas')!;
        const rect = canvas.getBoundingClientRect();
        const send = (type: string) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 8,
              pointerType: 'touch',
              isPrimary: true,
              bubbles: true,
              clientX: rect.left + 300,
              clientY: rect.top + 300,
              buttons: type === 'pointerdown' ? 1 : 0,
            })
          );
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
        send(strokeEnd);
        // One microtask for Svelte's flush, so the lift is on the element and
        // the switch lands in the gap before its first rendered frame.
        await Promise.resolve();
        const lifting = element.classList.contains('lifting');
        document.documentElement.setAttribute('data-reduce-motion', '');
        return { lifting };
      },
      { selector: halo.selector, strokeEnd: halo.strokeEnd }
    );
    // The halo was on its way out, not already gone, when the switch landed.
    expect(stranded).toEqual({ lifting: true });
    await expect(page.locator(halo.selector)).toHaveCount(0);
  });
}
