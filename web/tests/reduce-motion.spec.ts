import { expect, test, type Page } from '@playwright/test';

import { CALM_FADE_MS, SECTION_SLIDE_MS } from '../src/lib/motionDurations';
import { REDUCE_MOTION_ATTRIBUTE } from '../src/lib/platform/reducedMotion';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { gotoApp, openSettingsModal } from './helpers';
import { openDrawer } from './flows-harness';
import { revealAiResult } from './ai-harness';

// Reduce Motion (issue #2093) has two triggers — the Settings switch and the OS
// preference — resolved into one attribute on <html> that live treatments read
// and entrance cues capture at start. These prove each trigger reaches the CSS
// cues and JS callers alike, and that an explicit choice overrides the OS.

const root = (page: Page) => page.locator('html');

// The cues app.css styles globally, read off probe elements wearing the same
// classes the engine and the actions apply. Asserting the animated values at
// full motion first is what makes the reduced values mean something.
async function globalCues(page: Page) {
  return page.evaluate((motionAttribute) => {
    const startReduced = document.documentElement.hasAttribute(motionAttribute)
      ? ' [data-start-reduced-motion]'
      : '';
    // Several cues style a descendant of the element that carries the state
    // class, so a probe builds the whole chain and reads the innermost. Each
    // layer is an element name plus a space-separated list of classes and
    // [attributes]. The label is `element`, not `tag`: e2e-engine-tags.test.mjs
    // reads a `tag` key anywhere in a spec as a Playwright tag, and a labelled
    // tuple element reads as one.
    const probe = (...layers: [element: string, parts: string][]) => {
      let root: HTMLElement | undefined;
      let leaf: HTMLElement | undefined;
      for (const [element, parts] of layers) {
        const el = document.createElement(element);
        for (const part of parts.split(' ').filter(Boolean)) {
          if (part.startsWith('[')) {
            const [name, value] = part.slice(1, -1).split('=');
            el.setAttribute(name, value ?? '');
          } else el.classList.add(part);
        }
        leaf?.appendChild(el);
        root ??= el;
        leaf = el;
      }
      document.body.appendChild(root!);
      const style = getComputedStyle(leaf!);
      const read = {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        display: style.display,
      };
      root!.remove();
      return read;
    };
    return {
      undoSpin: probe(['div', 'undo-firing']).animationName,
      undoGhost: probe(['div', 'undo-ink-motion']).display,
      clearSheet: probe(['div', 'clear-sheet-motion']).display,
      unavailable: probe(['div', `action-unavailable${startReduced}`]).animationName,
      confirmFlyIn: probe([
        'dialog',
        `confirm-card modal-dialog modal-fly-in [open]${startReduced}`,
      ]).animationName,
      // No per-dialog class: the shared treatment is what every fly-in modal
      // gets, including the four that carried no fade of their own.
      dialogFlyIn: probe(['dialog', `modal-dialog modal-fly-in [open]${startReduced}`])
        .animationName,
      screenshotPop: probe(
        ['div', `screenshot-capture-feedback${startReduced}`],
        ['span', '[data-icon=camera]']
      ).animationName,
      // The one cue that slows instead of stopping: it is the only sign the
      // button gives that a generation is still running.
      aiSpinPace: probe(
        ['div', 'actions-panel'],
        ['button', 'action-button loading'],
        ['span', 'action-icon']
      ).animationDuration,
    };
  }, REDUCE_MOTION_ATTRIBUTE);
}

const FULL_MOTION_CUES = {
  undoSpin: 'undo-spin',
  undoGhost: 'block',
  clearSheet: 'block',
  unavailable: 'action-unavailable-shake, action-unavailable-flash',
  confirmFlyIn: 'dialogFlyFromOrigin',
  dialogFlyIn: 'dialogFlyFromOrigin',
  screenshotPop: 'screenshot-capture',
  aiSpinPace: '1s',
};

const REDUCED_CUES = {
  undoSpin: 'none',
  undoGhost: 'none',
  clearSheet: 'none',
  unavailable: 'action-unavailable-flash',
  confirmFlyIn: 'modalFadeIn',
  dialogFlyIn: 'modalFadeIn',
  screenshotPop: 'none',
  aiSpinPace: '2.4s',
};

// Cues a component owns, which Svelte scopes to a generated class — so unlike
// the globals above they can only be read off the running app. The drawer's is
// read as the custom property that feeds its transition shorthand, because the
// shorthand only applies while the drawer is actually moving.
async function componentCues(page: Page) {
  const modal = page.locator('#settingsModal');
  return {
    settingsFlyIn: await modal.evaluate((el) => getComputedStyle(el).animationName),
    toggleThumb: await modal
      .locator('.toggle-switch-thumb')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    drawerTravel: await page
      .locator('.actions-drawer')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--drawer-transition').trim()),
  };
}

function expectFullMotionComponents(cues: Awaited<ReturnType<typeof componentCues>>) {
  expect(cues.settingsFlyIn).toBe('dialogFlyFromOrigin');
  expect(cues.toggleThumb).toBe('0.2s');
  expect(cues.drawerTravel).toContain('grid-template-columns');
}

function expectReducedComponents(cues: Awaited<ReturnType<typeof componentCues>>) {
  expect(cues.settingsFlyIn).toBe('modalFadeIn');
  expect(cues.toggleThumb).toBe('0s');
  expect(cues.drawerTravel).not.toContain('grid-template');
  // A fade, not `transition: none`: ActionsPanel finishes the drawer's motion
  // state in ontransitionend, which never fires without a property to end on.
  expect(cues.drawerTravel).toContain('opacity');
}

// The Settings table-of-contents jump is one of the two JS callers of the
// effective answer: it glides at full motion and lands in one step when reduced.
const PANE_REST_POLL_MS = 100;
const JUMP_SETTLE_MS = 1500;

async function tocJumpSteps(page: Page) {
  return page.locator('.settings-pane').evaluate(
    async (pane, { restPollMs, settleMs }) => {
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // An earlier glide still in flight would be counted as this jump's steps.
      for (let last = NaN; last !== pane.scrollTop; await pause(restPollMs)) last = pane.scrollTop;

      const seen = new Set<number>();
      const record = () => seen.add(Math.round(pane.scrollTop));
      pane.addEventListener('scroll', record);
      pane
        .closest('dialog')!
        .querySelector<HTMLElement>('.settings-nav [data-section="about"]')!
        .click();
      await pause(settleMs);
      pane.removeEventListener('scroll', record);
      return seen.size;
    },
    { restPollMs: PANE_REST_POLL_MS, settleMs: JUMP_SETTLE_MS }
  );
}

async function openAccessibility(page: Page) {
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Accessibility' }).click();
  const toggle = page.getByRole('switch', { name: 'Reduce Motion' });
  await expect(toggle).toBeInViewport();
  return toggle;
}

test('the switch reduces every covered cue while the OS has no preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoApp(page);
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await globalCues(page)).toEqual(FULL_MOTION_CUES);

  const toggle = await openAccessibility(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByText('Calmer screens help children who are sensitive to movement')
  ).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)).toBe(
    'reduce'
  );
  expect(await globalCues(page)).toEqual(REDUCED_CUES);
  expect(await tocJumpSteps(page)).toBe(1);
  expect(await componentCues(page)).toMatchObject({
    settingsFlyIn: 'dialogFlyFromOrigin',
    toggleThumb: '0s',
  });

  // The first thing a parent sees after asking for calm is Settings itself, so
  // prove the card reopened under the switch no longer launches at them.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openSettingsModal(page);
  expect(await componentCues(page)).toMatchObject({ settingsFlyIn: 'modalFadeIn' });
});

test('the OS preference reduces the same cues and the switch reads as on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await globalCues(page)).toEqual(REDUCED_CUES);

  const toggle = await openAccessibility(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)
  ).toBeNull();
  // Settings opened while the OS answer already held, so its own fly-in is the
  // reduced one rather than a card that launched before the switch was read.
  expectReducedComponents(await componentCues(page));
});

test('turning the switch off overrides a reduce-motion OS, across a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  const toggle = await openAccessibility(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)).toBe(
    'full'
  );
  expect(await globalCues(page)).toEqual(FULL_MOTION_CUES);
  expect(await componentCues(page)).toMatchObject({ settingsFlyIn: 'modalFadeIn' });

  await gotoApp(page);
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  await openSettingsModal(page);
  expect(await tocJumpSteps(page)).toBeGreaterThan(3);
  expectFullMotionComponents(await componentCues(page));
});

const SETTINGS_LAYOUTS = [
  { name: 'phone portrait', width: 390, height: 844, hasSwitch: true },
  { name: 'phone landscape', width: 844, height: 390, hasSwitch: false },
  { name: 'tablet portrait', width: 768, height: 1024, hasSwitch: true },
  { name: 'tablet landscape', width: 1024, height: 768, hasSwitch: true },
] as const;

async function visibleReduceMotionSwitch(page: Page) {
  if (await page.locator('.settings-nav').count()) {
    await page.locator('.settings-nav [data-section="accessibility"]').click();
  } else {
    await page.locator('.hub-row[data-section="accessibility"]').click();
  }
  const toggle = page.getByRole('switch', { name: 'Reduce Motion' });
  await expect(toggle).toBeVisible();
  return toggle;
}

async function expectSettingsStaysLanded(page: Page, changeMotion: () => Promise<void>) {
  const dialog = page.locator('#settingsModal');
  const before = await dialog.boundingBox();
  await dialog.evaluate((el) => (el.dataset.animationRestarts = '0'));
  await changeMotion();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(await dialog.boundingBox()).toEqual(before);
  expect(await dialog.evaluate((el) => el.dataset.animationRestarts)).toBe('0');
  expect(await dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(dialog).toBeVisible();
}

for (const layout of SETTINGS_LAYOUTS) {
  test(`changing Reduce Motion leaves open Settings still in ${layout.name}`, async ({ page }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoApp(page);
    const dialog = await openSettingsModal(page);
    await dialog.evaluate((el) => {
      el.dataset.animationRestarts = '0';
      el.addEventListener('animationstart', (event) => {
        if (event.target === el) {
          el.dataset.animationRestarts = String(Number(el.dataset.animationRestarts) + 1);
        }
      });
    });

    const firstToggle = layout.hasSwitch ? await visibleReduceMotionSwitch(page) : null;
    await expectSettingsStaysLanded(page, async () => {
      if (firstToggle) await firstToggle.click();
      else await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
    });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await openSettingsModal(page);
    expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe('modalFadeIn');

    const secondToggle = layout.hasSwitch ? await visibleReduceMotionSwitch(page) : null;
    await expectSettingsStaysLanded(page, async () => {
      if (secondToggle) await secondToggle.click();
      else await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
    });
  });
}

test('a returning device is stamped before hydration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, 'reduce'),
    [STORAGE_KEYS.reduceMotion]
  );
  // The attribute as the first stylesheet-blocked paint would see it: recorded
  // by a script that runs before any of the page's own, read at DOMContentLoaded.
  await page.addInitScript((attribute) => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as Window & { __stampedAtLoad?: boolean }).__stampedAtLoad =
        document.documentElement.hasAttribute(attribute);
    });
  }, REDUCE_MOTION_ATTRIBUTE);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(
    await page.evaluate(() => (window as Window & { __stampedAtLoad?: boolean }).__stampedAtLoad)
  ).toBe(true);
});

test('a live OS switch restamps in system mode, on a route with no appearance state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/privacy');
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
});

// The gate is raised from inside another dialog rather than from a button on
// the paper, and it is the one fly-in a parent meets before Settings opens.
test('the parental gate fades in, raised over Settings, under the switch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, 'reduce'),
    [STORAGE_KEYS.reduceMotion]
  );
  await gotoApp(page, '/', { gates: 'always' });

  await openSettingsModal(page);
  const gate = page.locator('#parentalGate');
  await expect(async () => {
    await page.locator('.settings-nav [data-section="parentCenter"]').click({ timeout: 1000 });
    await expect(gate).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  expect(await gate.evaluate((el) => getComputedStyle(el).animationName)).toBe('modalFadeIn');
});

// ─── JS-driven reveals ──────────────────────────────────────────────────────
// Svelte runs a `transition:` through Element.animate (its own transitions.js),
// so a JS reveal never lands in a stylesheet and no computed style reads it
// back — CSS cannot reach it and neither can the probes above. Recording the
// calls is the handle a spec has on one, and unlike reading getAnimations()
// after the click, the record outlives the reveal, so a starved worker cannot
// race it. Svelte issues a zero-length dummy animation before the real one
// (it defers the keyframes until the DOM has updated), which `duration > 0`
// drops.
interface RecordedReveal {
  className: string;
  properties: string[];
  duration: number;
}

type RevealWindow = Window & { __recordedReveals?: RecordedReveal[] };

async function recordReveals(page: Page) {
  await page.addInitScript(() => {
    const reveals: RecordedReveal[] = [];
    (window as RevealWindow).__recordedReveals = reveals;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ) {
      const frames = Array.isArray(keyframes) ? keyframes : [];
      reveals.push({
        className: this.className,
        properties: [...new Set(frames.flatMap((frame) => Object.keys(frame ?? {})))].sort(),
        duration: Number((typeof options === 'object' ? options?.duration : options) ?? 0),
      });
      return animate.call(this, keyframes, options);
    };
  });
}

// The volume row inside Sound, revealed by the shared settings reveal.
const REVEALED_BLOCK = 'slider-setting';

async function revealSoundVolume(page: Page) {
  const toggle = page.locator('#soundToggle');
  // Off, then on: the second click is the reveal, and starting from off means
  // the row is genuinely entering rather than already there.
  if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click();
  await expect(page.locator(`.${REVEALED_BLOCK}`)).toHaveCount(0);
  await page.evaluate(() => void ((window as RevealWindow).__recordedReveals!.length = 0));
  await toggle.click();

  const ours = async () =>
    (await page.evaluate(() => (window as RevealWindow).__recordedReveals ?? [])).filter(
      (reveal) => reveal.className.includes(REVEALED_BLOCK) && reveal.duration > 0
    );
  await expect.poll(async () => (await ours()).length).toBe(1);
  return (await ours())[0];
}

// A slide carries the row's height, padding, and margins alongside its opacity;
// the calm reveal carries opacity and nothing else. Both tables are asserted,
// so the full-motion timing this issue must not disturb is pinned too.
const CALM_REVEAL = { opacityOnly: true, duration: CALM_FADE_MS };
const SLIDING_REVEAL = { opacityOnly: false, duration: SECTION_SLIDE_MS };

const REVEAL_TRIGGERS = [
  { name: 'the OS preference', os: 'reduce', stored: '', expected: CALM_REVEAL },
  { name: 'the switch', os: 'no-preference', stored: 'reduce', expected: CALM_REVEAL },
  { name: 'neither', os: 'no-preference', stored: '', expected: SLIDING_REVEAL },
] as const;

for (const trigger of REVEAL_TRIGGERS) {
  test(`a settings section's JS reveal follows ${trigger.name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: trigger.os });
    await page.addInitScript(
      ([key, value]) => {
        if (value) localStorage.setItem(key, value);
      },
      [STORAGE_KEYS.reduceMotion, trigger.stored] as const
    );
    await recordReveals(page);
    await gotoApp(page);
    await openSettingsModal(page);

    const reveal = await revealSoundVolume(page);
    expect(reveal.properties).toContain('opacity');
    expect({
      opacityOnly: reveal.properties.every((property) => property === 'opacity'),
      duration: reveal.duration,
    }).toEqual(trigger.expected);
  });
}

// The two places code waits on motion it can no longer assume is there: the
// drawer finishes its own transition in ontransitionend, and the launch guard
// sizes a dead zone to the dialog fly-in.
test('the drawer and the launch guard still work with Reduce Motion on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openDrawer(page);

  const panel = page.locator('.actions-panel');
  // The cascade is never armed when reduced, so nothing waits on an
  // animationend that will not come.
  await expect(page.locator('.actions-drawer')).not.toHaveClass(/opening/);

  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await expect(panel).not.toHaveAttribute('data-drawer-open', '');
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');

  await page.getByRole('button', { name: 'Expand controls' }).click();
  await expect(panel).toHaveAttribute('data-drawer-open', '');
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');

  // One tap, no retry: the guard swallows follow-ups, never the tap that opens.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#settingsModal')).toBeVisible();
});

// ─── Cues a component scopes to a pseudo-element or a branch ────────────────
// Neither is reachable from the probe table: a Svelte-scoped ::before carries a
// generated class, and the AI footer has two branches that share one keyframe.
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
          root(page).evaluate(
            (el, attribute) => el.hasAttribute(attribute),
            REDUCE_MOTION_ATTRIBUTE
          )
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
