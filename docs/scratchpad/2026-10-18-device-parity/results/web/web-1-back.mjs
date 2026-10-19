// WEB-1 browser Back cells: dialog layers, the drawing guard on touch and installed launches,
// refresh and unmount retirement, and in-app restoration (web-back.spec.ts scenarios, observed
// through URLs and visible dialogs rather than either app's history markers).
import {
  boot,
  button,
  contact,
  onBothArms,
  openDialogs,
  openSection,
  openSettings,
  solveGate,
  standaloneShim,
  where,
} from './harness.mjs';
import { SETTINGS_WIDE_MIN_WIDTH_PX } from '../../../../../web/src/lib/breakpoints.ts';

const INK = [
  [0.3, 0.4],
  [0.6, 0.45],
];

async function back(s) {
  await s.page.goBack({ timeout: 10_000 }).catch(() => {});
  await s.page.waitForTimeout(1500);
  return where(s);
}

async function enterDrawingFrom(s, path) {
  await s.page.goto(s.base + path);
  await s.page.waitForTimeout(1500);
  await boot(s);
}

async function openAboutPrivacyLink(s) {
  await openSettings(s);
  await openSection(s, 'About');
  await s.page
    .getByRole('link', { name: 'Privacy Policy' })
    .filter({ visible: true })
    .first()
    .click();
  await s.page.waitForTimeout(2000);
}

export const BACK_CELLS = {
  'back-desktop-dialog-then-page': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      await contact(s, [INK]);
      await openSettings(s);
      const open = await where(s);
      return { open, first: await back(s), second: await back(s) };
    }),

  'back-repeated-close-and-escape': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      const start = await where(s);
      const cycles = [];
      for (const how of ['Close', 'Close', 'Close', 'Escape', 'Escape', 'Escape']) {
        await openSettings(s);
        if (how === 'Close')
          await s.page
            .getByRole('button', { name: 'Close' })
            .filter({ visible: true })
            .first()
            .click();
        else await s.page.keyboard.press('Escape');
        await s.page.waitForTimeout(1200);
        cycles.push({ how, ...(await where(s)) });
      }
      return { start, cycles, back: await back(s) };
    }),

  'back-touch-guard': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      const beforeInk = await where(s);
      await contact(s, [INK]);
      const inked = await where(s);
      await openSettings(s);
      const settingsOpen = await where(s);
      const first = await back(s);
      const second = await back(s);
      await contact(s, [INK.map(([x, y]) => [x, y + 0.1])]);
      const redrawn = await where(s);
      const third = await back(s);
      return { beforeInk, inked, settingsOpen, first, second, redrawn, third };
    }),

  'back-standalone-fine-pointer': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        await enterDrawingFrom(s, '/privacy');
        const standalone = await s.page.evaluate(
          () => matchMedia('(display-mode: standalone)').matches
        );
        await contact(s, [INK]);
        const inked = await where(s);
        const first = await back(s);
        const second = await back(s);
        return { standalone, inked, first, second };
      },
      { initScripts: [standaloneShim] }
    ),

  'back-desktop-no-guard': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      await contact(s, [INK]);
      const inked = await where(s);
      return { inked, first: await back(s) };
    }),

  'back-refresh-with-dialog': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      await openSettings(s);
      const open = await where(s);
      await s.page.reload();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await s.page.waitForTimeout(2000);
      const reloaded = await where(s);
      return { open, reloaded, first: await back(s) };
    }),

  'back-direct-privacy-entry': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await s.page.goto(`${s.base}/feedback`);
      await s.page.waitForTimeout(1500);
      await s.page.goto(`${s.base}/privacy`);
      await s.page.waitForTimeout(2000);
      const atPrivacy = await where(s);
      return { atPrivacy, first: await back(s) };
    }),

  'back-in-app-restores-dialog': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/feedback');
      await openAboutPrivacyLink(s);
      const atPrivacy = await where(s);
      const first = await back(s);
      const second = await back(s);
      const third = await back(s);
      return { atPrivacy, first, second, third };
    }),

  // Arm the Parent Center check through its own control, reopen Settings, and let the gate
  // stack over it; Back retires the gate first.
  'back-nested-gate': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      await openSettings(s);
      await openSection(s, 'Parent Center');
      const group = s.page
        .getByRole('radiogroup', { name: /Opening Parent Center/ })
        .filter({ visible: true })
        .first();
      const armed = await group
        .getByRole('radio', { name: 'Every time' })
        .click({ timeout: 5000 })
        .then(() => true)
        .catch((error) => error.message.split('\n')[0]);
      await s.page.waitForTimeout(1000);
      await s.page.keyboard.press('Escape');
      await s.page.waitForTimeout(1500);
      await openSettings(s);
      await openSection(s, 'Parent Center');
      const stacked = await where(s);
      const first = await back(s);
      const second = await back(s);
      return { armed, stacked, first, second };
    }),

  // The armed check's "Never" confirm, then a viewport narrow enough to swap the Settings
  // shell, which unmounts the confirm without closing it.
  'back-unmounted-confirm': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await enterDrawingFrom(s, '/privacy');
      await openSettings(s);
      await openSection(s, 'Parent Center');
      const group = () =>
        s.page
          .getByRole('radiogroup', { name: /Opening Parent Center/ })
          .filter({ visible: true })
          .first();
      await group().getByRole('radio', { name: 'Every time' }).click({ timeout: 5000 });
      await s.page.waitForTimeout(800);
      await s.page.keyboard.press('Escape');
      await s.page.waitForTimeout(1200);
      await openSettings(s);
      await openSection(s, 'Parent Center');
      const gate = await solveGate(s).catch((error) => error.message.split('\n')[0]);
      await group().getByRole('radio', { name: 'Never' }).click({ timeout: 5000 });
      await s.page.waitForTimeout(1200);
      const confirmOpen = await where(s);
      await s.page.setViewportSize({ width: SETTINGS_WIDE_MIN_WIDTH_PX - 1, height: 900 });
      await s.page.waitForTimeout(2000);
      const narrowed = await where(s);
      const first = await back(s);
      const second = await back(s);
      return { gate, confirmOpen, narrowed, first, second };
    }),

  'back-drilled-settings-section': async (browser) => {
    const result = {};
    for (const how of ['back', 'escape']) {
      result[how] = await onBothArms(browser, 'android', async (s) => {
        await enterDrawingFrom(s, '/privacy');
        await openSettings(s);
        await openSection(s, 'Appearance');
        const drilled = await where(s);
        let after;
        if (how === 'back') after = await back(s);
        else {
          await s.page.keyboard.press('Escape');
          await s.page.waitForTimeout(1500);
          after = await where(s);
        }
        return { drilled, after, then: await back(s) };
      });
    }
    return result;
  },

  'dialog-names': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      await openSettings(s);
      return { settings: await openDialogs(s), closeVisible: await button(s, 'Close').isVisible() };
    }),
};
