import { expect, test } from '@playwright/test';

import { REDUCE_MOTION_ATTRIBUTE } from '../src/lib/platform/reducedMotion';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { gotoApp } from './helpers';
import { revealAiResult } from './ai-harness';

// Reduce Motion cues a component scopes to a pseudo-element or a branch.
// Neither is reachable from the probe table in reduce-motion.spec.ts: a
// Svelte-scoped ::before carries a generated class, and the AI footer has two
// branches that share one keyframe.

const RING_TRIGGERS = [
  { name: 'stops both selection rings expanding', reduced: true, rings: ['none', 'none'] },
  { name: 'leaves both selection rings expanding', reduced: false, rings: ['expand', 'trail'] },
] as const;

for (const trigger of RING_TRIGGERS) {
  test(`Reduce Motion ${trigger.name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: trigger.reduced ? 'reduce' : 'no-preference' });
    await gotoApp(page);
    // Visible only: the palette trims swatches by rank at narrow viewports, and
    // a trimmed one is display:none rather than absent.
    const swatch = page.locator('.color-swatch:not(.gradient-swatch):visible').nth(1);
    await swatch.click();
    // The leading ring and the trail it drags behind it are separate
    // pseudo-elements; #2093 reached only the second.
    const rings = await swatch.evaluate((el) =>
      (['::before', '::after'] as const).map((pseudo) =>
        getComputedStyle(el, pseudo).animationName.replace(/^svelte-\w+-swatch-ring-/, '')
      )
    );
    expect(rings).toEqual(trigger.rings);
  });
}

for (const initiallyReduced of [true, false]) {
  test(`a selected color's completed ring stays settled when Reduce Motion turns ${initiallyReduced ? 'off' : 'on'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: initiallyReduced ? 'reduce' : 'no-preference' });
    await gotoApp(page);
    const swatch = page.locator('.color-swatch:not(.gradient-swatch):visible').nth(1);
    await swatch.click();
    await page.waitForTimeout(900);
    const ringAnimations = () =>
      swatch.evaluate((el) =>
        (['::before', '::after'] as const).map(
          (pseudo) => getComputedStyle(el, pseudo).animationName
        )
      );
    const before = await ringAnimations();
    await page.emulateMedia({ reducedMotion: initiallyReduced ? 'no-preference' : 'reduce' });
    expect(await ringAnimations()).toEqual(before);
    await expect(swatch).not.toHaveClass(/releasing/);
  });
}

const FOOTER_TRIGGERS = [
  { name: 'fades', reduced: true, animation: 'downloadFadeIn' },
  { name: 'pops', reduced: false, animation: 'downloadPop' },
] as const;

for (const trigger of FOOTER_TRIGGERS) {
  test(`the saved caption ${trigger.name} in, the branch the download button hides`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: trigger.reduced ? 'reduce' : 'no-preference' });
    await page.addInitScript((key) => localStorage.setItem(key, 'true'), STORAGE_KEYS.autoSaveAi);
    await revealAiResult(page);

    const caption = page.locator('.ai-result-saved');
    await expect(caption).toBeVisible();
    // Svelte scopes a component's own keyframe names at build time.
    expect(await caption.evaluate((el) => getComputedStyle(el).animationName)).toMatch(
      new RegExp(`^svelte-\\w+-${trigger.animation}$`)
    );
  });
}

for (const branch of ['saved', 'downloadButton'] as const) {
  for (const initiallyReduced of [false, true]) {
    test(`a visible AI ${branch} cue does not replay when Reduce Motion turns ${initiallyReduced ? 'off' : 'on'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: initiallyReduced ? 'reduce' : 'no-preference' });
      if (branch === 'saved') {
        await page.addInitScript(
          (key) => localStorage.setItem(key, 'true'),
          STORAGE_KEYS.autoSaveAi
        );
      }
      await revealAiResult(page);

      const footer = page.locator(branch === 'saved' ? '.ai-result-saved' : '.ai-result-download');
      await expect(footer).toBeVisible();
      await footer.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished))
      );
      const originalName = await footer.evaluate((el) => getComputedStyle(el).animationName);
      await page.emulateMedia({ reducedMotion: initiallyReduced ? 'no-preference' : 'reduce' });
      await expect
        .poll(() =>
          page
            .locator('html')
            .evaluate((el, attribute) => el.hasAttribute(attribute), REDUCE_MOTION_ATTRIBUTE)
        )
        .toBe(!initiallyReduced);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      expect(await footer.evaluate((el) => getComputedStyle(el).animationName)).toBe(originalName);
      expect(await footer.evaluate((el) => el.getAnimations().length)).toBe(0);
    });
  }
}
