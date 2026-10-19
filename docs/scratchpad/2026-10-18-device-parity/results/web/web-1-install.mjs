// WEB-1 install banner and install guide cells (T2-25, T2-26 and their behavior rows).
import {
  boot,
  button,
  capture,
  contact,
  drawStrokes,
  expandDrawer,
  collapseDrawer,
  onBothArms,
} from './harness.mjs';
import { readBanner, readDialogText } from './page-probes.mjs';

const banner = (s) => s.page.evaluate(readBanner);
const settleUi = (s, ms = 1200) => s.page.waitForTimeout(ms);

async function reachable(s, name) {
  try {
    await button(s, name).click({ trial: true, timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function bannerButton(s, name) {
  await s.page.getByRole('button', { name, exact: true }).first().click();
  await settleUi(s);
}

// A synthetic BeforeInstallPromptEvent: Chromium fires the real one only for an installable
// origin with engagement, which a headless run never reaches. It records each prompt() call.
function fireInstallPrompt() {
  window.__promptCalls = 0;
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = () => {
    window.__promptCalls += 1;
    return Promise.resolve();
  };
  event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
  window.dispatchEvent(event);
}

async function earn(s) {
  await drawStrokes(s, 2);
  const beforeGate = await banner(s);
  await drawStrokes(s, 1, 2);
  await settleUi(s);
  return { beforeGate: beforeGate.present, afterGate: await banner(s) };
}

async function storageKeys(s, pattern = /install/i) {
  return s.page.evaluate(
    (source) =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => new RegExp(source, 'i').test(key))
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      ),
    pattern.source
  );
}

async function openSettings(s) {
  await button(s, 'Settings').click();
  await s.page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 5000 });
  await settleUi(s, 1500);
}

// The phone hub opens a section by its row; the wide shell lists every section and scrolls.
async function openSettingsSection(s, title) {
  await openSettings(s);
  const row = s.page
    .locator(`button[aria-label^="${title}, "], button:has-text("${title}")`)
    .first();
  await row.click();
  await settleUi(s, 1500);
}

async function installGuideText(s) {
  await openSettingsSection(s, 'Install');
  const index = await s.page.evaluate(readDialogText);
  const step = s.page
    .locator('summary:has-text("Install as App"), button:has-text("Install as App"), [role="button"]:has-text("Install as App")')
    .filter({ visible: true })
    .first();
  const before = await step.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    expanded: element.getAttribute('aria-expanded') ?? (element.parentElement?.open === undefined ? null : String(element.parentElement.open)),
  }));
  await step.click();
  await settleUi(s, 1500);
  const steps = await s.page.evaluate(readDialogText);
  const from = (text, marker) => {
    const at = text?.lastIndexOf(marker) ?? -1;
    return at < 0 ? text?.slice(0, 700) : text.slice(at, at + 700);
  };
  const after = await step.evaluate((element) => ({
    expanded: element.getAttribute('aria-expanded') ?? (element.parentElement?.open === undefined ? null : String(element.parentElement.open)),
  }));
  return {
    index: from(index, 'Install'),
    steps: from(steps, 'Install as App'),
    disclosure: { tag: before.tag, expandedBefore: before.expanded, expandedAfter: after.expanded },
  };
}

export const INSTALL_CELLS = {
  'install-android': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      const earned = await earn(s);
      const shown = await capture(s, `install-android-${s.arm}`);
      await bannerButton(s, 'How?');
      const expanded = await banner(s);
      const hint = await capture(s, `install-android-how-${s.arm}`);
      const corners = {
        expand: await reachable(s, 'Expand controls'),
        settings: await reachable(s, 'Settings'),
        clear: await reachable(s, 'Clear drawing'),
      };
      return { ...earned, shown, expanded, hint, corners, storage: await storageKeys(s) };
    }),

  'install-iphone-rotate': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      await boot(s);
      const earned = await earn(s);
      await bannerButton(s, 'How?');
      const portrait = await banner(s);
      const portraitShot = await capture(s, `install-iphone-portrait-${s.arm}`);
      await s.page.setViewportSize({ width: 844, height: 390 });
      await settleUi(s, 1500);
      const landscape = await banner(s);
      const landscapeShot = await capture(s, `install-iphone-landscape-${s.arm}`);
      const hide = landscape.buttons?.find((entry) => entry.name === 'Hide');
      if (hide) await bannerButton(s, 'Hide');
      const collapsed = await banner(s);
      return {
        earned: earned.afterGate.present,
        portrait,
        portraitShot,
        landscape,
        landscapeShot,
        collapsed,
      };
    }),

  'install-ipad': (browser) =>
    onBothArms(browser, 'ipad', async (s) => {
      await boot(s);
      const earned = await earn(s);
      await bannerButton(s, 'How?');
      return {
        earned: earned.afterGate,
        expanded: await banner(s),
        shot: await capture(s, `install-ipad-${s.arm}`),
      };
    }),

  'install-desktop-one-tap': (browser) =>
    onBothArms(browser, 'desktop', async (s) => {
      await boot(s);
      const earned = await earn(s);
      await s.page.evaluate(fireInstallPrompt);
      await settleUi(s);
      const offered = await banner(s);
      const shot = await capture(s, `install-desktop-one-tap-${s.arm}`);
      const install = offered.buttons?.find((entry) => entry.name === 'Install');
      if (install) await bannerButton(s, 'Install');
      return {
        withoutPrompt: earned.afterGate.present,
        offered,
        shot,
        promptCalls: await s.page.evaluate(() => window.__promptCalls),
        after: await banner(s),
      };
    }),

  'install-drawer-opened-over': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      const earned = await earn(s);
      await expandDrawer(s);
      const underDrawer = await banner(s);
      await drawStrokes(s, 8);
      const afterDrawerStrokes = await banner(s);
      await collapseDrawer(s);
      await settleUi(s);
      const afterCollapse = await banner(s);
      await contact(s, [
        [
          [0.4, 0.2],
          [0.6, 0.22],
        ],
      ]);
      await settleUi(s);
      return {
        earned: earned.afterGate.present,
        underDrawer: underDrawer.present,
        afterDrawerStrokes: afterDrawerStrokes.present,
        afterCollapse,
        afterOneMore: (await banner(s)).present,
        storage: await storageKeys(s),
        shot: await capture(s, `install-drawer-opened-over-${s.arm}`),
      };
    }),

  'install-drawer-persisted': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      await expandDrawer(s);
      await s.page.reload();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await settleUi(s, 2000);
      const drawerOpenAfterReload = await button(s, 'Collapse controls').isVisible();
      await drawStrokes(s, 8);
      const whileOpen = await banner(s);
      await collapseDrawer(s);
      await settleUi(s);
      const afterCollapse = await banner(s);
      await contact(s, [
        [
          [0.4, 0.2],
          [0.6, 0.22],
        ],
      ]);
      await settleUi(s);
      return {
        drawerOpenAfterReload,
        whileOpen: whileOpen.present,
        afterCollapse,
        afterOneMore: (await banner(s)).present,
        storage: await storageKeys(s),
      };
    }),

  'install-auto-clear': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      const earned = await earn(s);
      const states = [];
      for (let i = 0; i < 5; i += 1) {
        await drawStrokes(s, 1, i);
        states.push(await banner(s));
      }
      const partingShot = await capture(s, `install-auto-clear-parting-${s.arm}`);
      await s.page.waitForTimeout(5000);
      const afterParting = await banner(s);
      return {
        earned: earned.afterGate.present,
        presentAfterEach: states.map((state) => state.present),
        partingAfterEach: states.map((state) => state.parting ?? null),
        partingShot,
        afterParting,
        storage: await storageKeys(s),
      };
    }),

  'install-dismiss-persists': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      const earned = await earn(s);
      await bannerButton(s, 'Not now');
      const afterDismiss = await banner(s);
      const storageAfterDismiss = await storageKeys(s);
      await boot(s);
      await drawStrokes(s, 3);
      await settleUi(s);
      return {
        earned: earned.afterGate.present,
        afterDismiss: afterDismiss.present,
        storageAfterDismiss,
        reopened: (await banner(s)).present,
        storageAfterReopen: await storageKeys(s),
      };
    }),

  // Real sessions only: dismiss, then reopen and draw until the banner returns twice.
  'install-reprompt-sessions': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      await boot(s);
      await earn(s);
      await bannerButton(s, 'Not now');
      const sessions = [];
      for (let session = 2; session <= 14; session += 1) {
        await boot(s);
        await drawStrokes(s, 3);
        await settleUi(s);
        const state = await banner(s);
        const entry = { session, present: state.present, storage: await storageKeys(s) };
        if (state.present) {
          entry.text = state.text;
          entry.shot = await capture(s, `install-reprompt-session-${session}-${s.arm}`);
          await bannerButton(s, 'Not now');
        }
        sessions.push(entry);
      }
      return {
        shownAt: sessions.filter((entry) => entry.present).map((entry) => entry.session),
        sessions,
      };
    }),

  'install-empty-dock-band': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      await boot(s);
      await earn(s);
      await bannerButton(s, 'How?');
      const viewport = s.page.viewportSize();
      const target = await s.page.evaluate(
        ([x, y]) => {
          const element = document.elementFromPoint(x, y);
          return element
            ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.getAttribute('data-testid') ? `[${element.getAttribute('data-testid')}]` : ''}`
            : null;
        },
        [viewport.width / 2, viewport.height - 24]
      );
      const box = await s.page.locator(s.paper).boundingBox();
      const y = (viewport.height - 24 - box.y) / box.height;
      const x = (viewport.width / 2 - box.x) / box.width;
      await contact(s, [
        [
          [x, y],
          [x + 20 / box.width, y],
        ],
      ]);
      await settleUi(s);
      await expandDrawer(s);
      const undo = s.page.getByRole('button', { name: 'Undo', exact: true });
      return {
        target,
        undoEnabledAfter: await undo.evaluate(
          (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true'
        ),
        shot: await capture(s, `install-empty-dock-band-${s.arm}`),
      };
    }),

  'install-preview-appearance': async (browser) => {
    const result = {};
    for (const colorScheme of ['light', 'dark']) {
      result[colorScheme] = await onBothArms(
        browser,
        'ipad',
        async (s) => {
          await boot(s);
          await earn(s);
          const preview = await s.page.evaluate(() => {
            const image = [...document.querySelectorAll('img')].find(
              (element) =>
                element.getAttribute('src') === '/apple-touch-icon.png' && element.checkVisibility()
            );
            if (!image) return null;
            const label =
              image.parentElement?.innerText?.trim() || image.closest('div')?.innerText?.trim();
            return {
              boxShadow: getComputedStyle(image).boxShadow,
              parentShadow: getComputedStyle(image.parentElement).boxShadow,
              filter: getComputedStyle(image).filter,
              naturalWidth: image.naturalWidth,
              label,
            };
          });
          return { preview, shot: await capture(s, `install-preview-${colorScheme}-${s.arm}`) };
        },
        { context: { colorScheme } }
      );
    }
    return result;
  },

  'install-preview-forced-colors': (browser) =>
    onBothArms(
      browser,
      'iphone',
      async (s) => {
        await s.page.setViewportSize({ width: 320, height: 568 });
        await boot(s);
        await earn(s);
        const preview = await s.page.evaluate(() => {
          const image = [...document.querySelectorAll('img')].find(
            (element) =>
              element.getAttribute('src') === '/apple-touch-icon.png' && element.checkVisibility()
          );
          const probe = document.createElement('span');
          probe.style.color = 'CanvasText';
          document.body.append(probe);
          const canvasText = getComputedStyle(probe).color;
          probe.remove();
          const label = image
            ? [...image.parentElement.parentElement.querySelectorAll('*')].find(
                (element) =>
                  element.childElementCount === 0 && element.innerText?.trim() === 'Splotch'
              )
            : null;
          return {
            decoded: image ? image.complete && image.naturalWidth > 0 : null,
            labelColor: label ? getComputedStyle(label).color : null,
            canvasText,
          };
        });
        return {
          preview,
          banner: await banner(s),
          shot: await capture(s, `install-preview-forced-${s.arm}`),
        };
      },
      { context: { forcedColors: 'active', reducedMotion: 'reduce' } }
    ),

  'install-guide': async (browser) => {
    const result = {};
    for (const profile of ['iphone', 'iphone-chrome', 'ipad', 'android', 'desktop']) {
      result[profile] = await onBothArms(browser, profile, async (s) => {
        await boot(s);
        const text = await installGuideText(s);
        return { ...text, shot: await capture(s, `install-guide-${profile}-${s.arm}`) };
      });
    }
    return result;
  },
};
