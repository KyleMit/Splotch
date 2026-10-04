import { expect, test, type Page } from '@playwright/test';
import { invokeAiGeneration, prepareAiGeneration } from './ai-harness';
import { openDrawer } from './flows-harness';

// Getting back into a generation that was sent to the corner (ADR-0116). The
// two controls that promise to do it are the polaroid and the Magic Button that
// started the run, and only one of them was wired: the button is disabled while
// `generating`, so it never dispatched the tap, and the restore branch behind it
// had no reachable caller at all. Both routes are driven here through the real
// chrome for that reason — and so is what they land on, since a picture that
// finished while it waited must come back revealed rather than behind its own
// progress dial.
// Watch it run with:
//   npm run test:e2e:headed -- ai-minimize

const PHONE_VIEWPORT = { width: 320, height: 568 };
// A slow worker still gets progress frames inside the visible retirement.
const PROGRESS_EXIT_OBSERVATION_MS = 10_000;
// The restored blur must advance as well as the unquantized dial.
const HIDDEN_PROGRESS_ADVANCE_PERCENT = 3;
// The corner rounds to whole percent while the dial retains its fraction.
const CORNER_PROGRESS_ROUNDING_PERCENT = 1;

const modal = 'dialog.ai-result-modal';
const polaroid = '.ai-waiting-polaroid';
const magicButton = '#aiImageButton';

// The dial's remaining wedge, which shrinks from 360deg as the run fills. Read
// off the live element because it is the only published trace of where the run
// actually is. A dial that hasn't mounted yet reads as "no progress at all"
// rather than throwing, so the polls below wait for it instead of failing on a
// starved worker that hasn't rendered the reopened modal yet.
function dialAngle(page: Page) {
  return page.evaluate(() => {
    const dial = document.querySelector('.dial');
    if (!dial) return Number.POSITIVE_INFINITY;
    return Number.parseFloat(getComputedStyle(dial).getPropertyValue('--angle'));
  });
}

test.describe('a generation minimized to the corner', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
  });

  test('goes to the polaroid, and the polaroid brings it back', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    await page.getByLabel('Keep drawing while this is made').click();

    await expect(page.locator(polaroid)).toBeVisible();
    await expect(page.locator(modal)).toBeHidden();

    await page.locator(polaroid).click();
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator(polaroid)).toBeHidden();
  });

  test('says how to leave, rather than leaving it to the X', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    // The X and the backdrop do the same thing, but both read as cancelling the
    // picture — which is the one thing minimizing must never be taken for.
    await page.getByRole('button', { name: 'Keep drawing while you wait' }).click();

    await expect(page.locator(polaroid)).toBeVisible();
    await expect(page.locator(modal)).toBeHidden();
  });

  test('is what the Magic Button reveals while it is still running', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    // The button lives in the collapsed action drawer, so the polaroid is the
    // route that needs no steps — but a parent who opens the drawer while a run
    // waits must not find the control that started it inert.
    await openDrawer(page);

    // The whole finding: while `generating` this button was disabled, so the tap
    // never left the DOM and the restore branch behind it was dead code.
    const button = page.locator(magicButton);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-label', 'Show the picture being made');
    await expect(button).toHaveAttribute('aria-busy', 'false');

    await button.click();
    await expect(page.locator(modal)).toBeVisible();
  });

  test('comes back to the picture, not to a dial catching up to it', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    await endpoint.succeed();
    await expect(page.locator(polaroid)).toContainText('Ready!');

    await page.locator(polaroid).click();

    // Already revealed on arrival: the run finished in the corner, so there is
    // nothing left to animate and nothing to make the child wait through again.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  test('keeps the run where it got to while it waited', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();

    // Any measurable fill will do — the point is the comparison, not the value.
    await expect.poll(() => dialAngle(page)).toBeLessThan(355);
    const beforeMinimize = await dialAngle(page);

    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();
    await page.locator(polaroid).click();
    await expect(page.locator(modal)).toBeVisible();

    // The dial used to own the loop that filled it, so remounting it restarted
    // the run's progress from zero — telling a child who had already waited that
    // their picture was only just beginning.
    await expect.poll(() => dialAngle(page)).toBeLessThan(beforeMinimize);
  });

  test('pauses progress painting only after retirement and resumes before the first restored paint', async ({
    page,
  }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();
    await endpoint.waitForFirstRequest();
    await page.addStyleTag({
      content: `${modal}.closing { animation-duration: ${PROGRESS_EXIT_OBSERVATION_MS}ms; }`,
    });

    const probe = await page.evaluateHandle(() => {
      const dialog = document.querySelector('dialog.ai-result-modal');
      const dial = document.querySelector('.dial');
      const preview = document.querySelector('.stage-img.preview');
      if (
        !(dialog instanceof HTMLDialogElement) ||
        !(dial instanceof HTMLElement) ||
        !(preview instanceof HTMLImageElement)
      ) {
        throw new Error('The generating dialog has no progress presentation');
      }
      let closed = false;
      const writes = { retiringDial: 0, retiringPreview: 0, hiddenDial: 0, hiddenPreview: 0 };
      const recordWrites = (records: MutationRecord[]) => {
        for (const record of records) {
          if (closed && !dialog.open) {
            if (record.target === dial) writes.hiddenDial += 1;
            if (record.target === preview) writes.hiddenPreview += 1;
          } else if (dialog.open && dialog.classList.contains('closing')) {
            if (record.target === dial) writes.retiringDial += 1;
            if (record.target === preview) writes.retiringPreview += 1;
          }
        }
      };
      const observer = new MutationObserver(recordWrites);
      observer.observe(dial, { attributes: true, attributeFilter: ['style'] });
      observer.observe(preview, { attributes: true, attributeFilter: ['style'] });
      dialog.addEventListener(
        'close',
        () => {
          recordWrites(observer.takeRecords());
          closed = true;
        },
        { once: true }
      );
      function cornerProgressPercent() {
        const fill = document.querySelector('.ai-waiting-polaroid .progress-fill');
        if (!(fill instanceof HTMLElement)) throw new Error('The waiting print has no progress');
        return Number.parseFloat(fill.style.width);
      }
      const presentation = () => {
        return {
          progressPercent:
            (1 - Number.parseFloat(dial.style.getPropertyValue('--angle')) / 360) * 100,
          blurPx: Number.parseFloat(preview.style.filter.replace('blur(', '')),
        };
      };
      let restoredFrame: Promise<
        ReturnType<typeof presentation> & { cornerPercent: number; open: boolean }
      > | null = null;
      return {
        snapshot() {
          recordWrites(observer.takeRecords());
          return {
            ...writes,
            ...presentation(),
            closed,
            open: dialog.open,
            cornerPercent: cornerProgressPercent(),
          };
        },
        finishExit() {
          for (const animation of dialog.getAnimations()) animation.finish();
        },
        observeRestore() {
          const print = document.querySelector('.ai-waiting-polaroid');
          if (!(print instanceof HTMLButtonElement))
            throw new Error('The waiting print is missing');
          restoredFrame = new Promise((resolve) => {
            print.addEventListener(
              'click',
              () => {
                const cornerPercent = cornerProgressPercent();
                requestAnimationFrame(() =>
                  resolve({ ...presentation(), cornerPercent, open: dialog.open })
                );
              },
              { once: true, capture: true }
            );
          });
        },
        restored() {
          if (!restoredFrame) throw new Error('No restore observation is armed');
          return restoredFrame;
        },
        stop() {
          observer.disconnect();
        },
      };
    });

    await page.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect
      .poll(() => probe.evaluate((probe) => probe.snapshot().retiringDial))
      .toBeGreaterThan(0);
    await expect
      .poll(() => probe.evaluate((probe) => probe.snapshot().retiringPreview))
      .toBeGreaterThan(0);
    expect(await probe.evaluate((probe) => probe.snapshot().open)).toBe(true);

    await probe.evaluate((probe) => probe.finishExit());
    await expect.poll(() => probe.evaluate((probe) => probe.snapshot().closed)).toBe(true);
    const held = await probe.evaluate((probe) => probe.snapshot());
    await expect
      .poll(() => probe.evaluate((probe) => probe.snapshot().cornerPercent))
      .toBeGreaterThan(held.cornerPercent + HIDDEN_PROGRESS_ADVANCE_PERCENT);
    const hidden = await probe.evaluate((probe) => probe.snapshot());
    expect(hidden.hiddenDial).toBe(0);
    expect(hidden.hiddenPreview).toBe(0);
    expect(hidden.progressPercent).toBe(held.progressPercent);
    expect(hidden.blurPx).toBe(held.blurPx);

    await probe.evaluate((probe) => probe.observeRestore());
    await page.locator(polaroid).click();
    const restored = await probe.evaluate((probe) => probe.restored());
    expect(restored.open).toBe(true);
    expect(restored.progressPercent).toBeGreaterThanOrEqual(
      restored.cornerPercent - CORNER_PROGRESS_ROUNDING_PERCENT
    );
    expect(restored.blurPx).toBeLessThan(held.blurPx);
    await probe.evaluate((probe) => probe.stop());
    await probe.dispose();
    await endpoint.fail();
  });

  test('keeps progress painting live when a retirement is interrupted', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await expect(page.locator(modal)).toBeVisible();
    await endpoint.waitForFirstRequest();
    await page.addStyleTag({
      content: `${modal}.closing { animation-duration: ${PROGRESS_EXIT_OBSERVATION_MS}ms; }`,
    });
    await page.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(page.locator(modal)).toHaveClass(/closing/);
    await expect(page.locator(modal)).toHaveAttribute('open', '');
    const beforeRestore = await dialAngle(page);

    await invokeAiGeneration(page);
    await expect(page.locator(modal)).not.toHaveClass(/closing/);
    await expect(page.locator(modal)).toHaveAttribute('open', '');
    await expect.poll(() => dialAngle(page)).toBeLessThan(beforeRestore);
    await endpoint.fail();
  });

  test('stops calling the picture unfinished once it is finished', async ({ page }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    await endpoint.succeed();
    await expect(page.locator(polaroid)).toContainText('Ready!');

    // The corner says "Ready!"; the control that opens it said "being made"
    // until whenever the parent next found it — the one place in this flow a
    // screen reader gets a different answer than the screen.
    await openDrawer(page);
    await expect(page.locator(magicButton)).toHaveAttribute(
      'aria-label',
      'Show your finished picture'
    );
  });

  test('says the run failed rather than promising a picture that is not coming', async ({
    page,
  }) => {
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    await endpoint.fail();
    await expect(page.locator(polaroid)).toContainText('Oh no');

    // A failed run leaves `generating` false too, so the arm that announces a
    // finished picture also caught the one state where there is no picture —
    // the button and the print it opens told a screen reader opposite things.
    await openDrawer(page);
    await expect(page.locator(magicButton)).toHaveAttribute('aria-label', "Show what didn't work");
    await expect(page.locator(polaroid)).toHaveAttribute(
      'aria-label',
      "That didn't work — tap to see"
    );
  });

  test('never wiggles itself off the top of the screen', async ({ page }) => {
    // Landscape is where this binds: the print sits at the top of the canvas
    // with only its own inset above it, and the wiggle plus the badge hanging
    // off its corner reach higher than the print ever does at rest.
    await page.setViewportSize({ width: 1024, height: 700 });
    const endpoint = await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    await endpoint.succeed();
    await expect(page.locator(polaroid)).toContainText('Ready!');

    // One pass of the wiggle covers every extreme; the two after it repeat.
    const WIGGLE_PASS_MS = 1800;
    const highest = await page.evaluate(
      (durationMs) =>
        new Promise<{ print: number; badge: number; left: number }>((resolve) => {
          const print = document.querySelector('.ai-waiting-polaroid');
          const badge = document.querySelector('.polaroid-badge');
          if (!print || !badge) throw new Error('the ready polaroid is not mounted');
          const started = performance.now();
          const seen = { print: Infinity, badge: Infinity, left: Infinity };
          const sample = () => {
            const printBox = print.getBoundingClientRect();
            seen.print = Math.min(seen.print, printBox.top);
            seen.left = Math.min(seen.left, printBox.left);
            seen.badge = Math.min(seen.badge, badge.getBoundingClientRect().top);
            if (performance.now() - started > durationMs) {
              resolve(seen);
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
      WIGGLE_PASS_MS
    );

    // The badge is the part that reaches highest, and it went 4px past the top
    // of the screen before the print's inset was sized for it.
    expect(highest.badge).toBeGreaterThanOrEqual(0);
    expect(highest.print).toBeGreaterThanOrEqual(0);
    expect(highest.left).toBeGreaterThanOrEqual(0);
  });

  test('keeps its polaroid above the chrome it is pinned beside', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();
    // modalDialog keeps a closing dialog in the top layer until its exit finishes.
    await expect(page.locator(modal)).not.toHaveAttribute('open', /.*/);

    // A tie is settled by DOM order, and the banner mounts second — which left
    // the chip this replaced completely covered and the paid run unreachable.
    // The palette is the other neighbour: the print is pinned to the corner
    // beside it and its tilt grazes that edge, so it has to paint over it.
    const layers = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? Number(getComputedStyle(el).zIndex) : null;
      };
      return {
        polaroid: read('.ai-waiting-polaroid'),
        banner: read('.install-banner'),
        palette: read('.color-palette'),
      };
    });
    expect(layers.polaroid).toBeGreaterThan(950);
    expect(layers.polaroid).toBeGreaterThan(layers.palette ?? 0);

    // And it actually receives the tap at its own centre.
    const box = await page.locator(polaroid).boundingBox();
    if (!box) throw new Error('the polaroid has no bounds');
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.ai-waiting-polaroid') !== null,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(onTop).toBe(true);
  });

  test('leaves every color on the palette uncovered', async ({ page }) => {
    await prepareAiGeneration(page);
    await invokeAiGeneration(page);
    await page.getByLabel('Keep drawing while this is made').click();
    await expect(page.locator(polaroid)).toBeVisible();

    const print = await page.locator(polaroid).boundingBox();
    if (!print) throw new Error('the polaroid has no bounds');

    // Grazing the palette's edge is the intent; sitting on a swatch is not —
    // every color has to stay pickable with a picture waiting in the corner.
    const swatches = await page.locator('.color-swatch:visible').all();
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      const box = await swatch.boundingBox();
      if (!box) continue;
      const overlaps =
        box.x < print.x + print.width &&
        print.x < box.x + box.width &&
        box.y < print.y + print.height &&
        print.y < box.y + box.height;
      expect(overlaps).toBe(false);
    }
  });
});
