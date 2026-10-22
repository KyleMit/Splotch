import type { Locator } from '@playwright/test';
import { TABLET_MIN_SIDE_PX } from '../../src/lib/breakpoints.ts';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import {
  closeDialog,
  goToSettingsSection,
  openSettings,
  waitUntilSettled,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const PHONE = { width: 375, height: 812 };
// One pixel shorter and Settings drops the sidebar for the compact shell, so this is the least
// vertical room the sidebar column ever gets.
const SHORTEST_SIDEBAR_WINDOW = { width: 1024, height: TABLET_MIN_SIDE_PX };
// Far more than the pane is tall, so one turn of the wheel reaches its top.
const PANE_WHEEL_TRAVEL_PX = 5000;
const FIRST_SECTION = 'Appearance';
const LAST_SECTION = 'About';
const ROW_EDGE_TOLERANCE_PX = 1;
const TOUCH_TARGET_PX = 48;
const MIN_TITLE_GAP_PX = 16;
const REPORT_MESSAGE = 'The purple crayon draws green';

test.describe('Settings', () => {
  test('opens from the corner button and closes from its own', async ({ drawingScreen }) => {
    const settings = await openSettings(drawingScreen.page);
    await expect(settings.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();

    await closeDialog(settings);
  });

  test('its table of contents carries the pane to the section a row names', async ({
    drawingScreen,
  }) => {
    const settings = await openSettings(drawingScreen.page);
    await expect(settings.getByRole('switch', { name: 'Enable tool drawer' })).not.toBeInViewport();

    await goToSettingsSection(settings, 'Tool Drawer');

    await expect(settings.getByRole('switch', { name: 'Enable tool drawer' })).toBeInViewport();
  });

  test('scrolling the pane by hand moves the highlight with the reading position', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await openSettings(page);
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    await goToSettingsSection(settings, 'Tool Drawer');
    await expect(nav.getByRole('button', { name: 'Tool Drawer', exact: true })).toHaveAttribute(
      'aria-current',
      'location'
    );

    await settings.getByRole('switch', { name: 'Enable tool drawer' }).hover();
    await page.mouse.wheel(0, -PANE_WHEEL_TRAVEL_PX);

    await expect(nav.getByRole('button', { name: 'Appearance', exact: true })).toHaveAttribute(
      'aria-current',
      'location'
    );
    await expect(nav.getByRole('button', { name: 'Tool Drawer', exact: true })).not.toHaveAttribute(
      'aria-current',
      'location'
    );
  });

  test('the theme picker answers the arrow keys, wrapping at either end', async ({
    drawingScreen,
  }) => {
    const settings = await openSettings(drawingScreen.page);
    const theme = settings.getByRole('radiogroup', { name: 'Theme' });
    await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked();

    await theme.getByRole('radio', { name: 'System' }).focus();
    await drawingScreen.page.keyboard.press('ArrowRight');
    await expect(theme.getByRole('radio', { name: 'Light' })).toBeChecked();
    await drawingScreen.page.keyboard.press('ArrowLeft');
    await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked();
    await drawingScreen.page.keyboard.press('ArrowLeft');
    await expect(theme.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  test('Sound keeps one volume, and muting everything remembers the sources left on', async ({
    drawingScreen,
  }) => {
    const settings = await openSettings(drawingScreen.page);
    await goToSettingsSection(settings, 'Sound');
    const master = settings.getByRole('switch', { name: 'Sound', exact: true });
    const drawing = settings.getByRole('switch', { name: 'Drawing', exact: true });
    const deleting = settings.getByRole('switch', { name: 'Deleting', exact: true });
    const volume = settings.getByRole('slider', { name: /^Volume/ });
    await expect(drawing).toBeChecked();
    await expect(deleting).toBeChecked();

    await deleting.click();
    await expect(deleting).not.toBeChecked();
    await master.click();
    await expect(volume).toHaveCount(0);
    await expect(drawing).toHaveCount(0);
    await expect(deleting).toHaveCount(0);

    await master.click();
    await expect(volume).toBeVisible();
    await expect(drawing).toBeChecked();
    await expect(deleting).not.toBeChecked();
  });

  test('What is New names the current release and links the whole changelog', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await openSettings(page);
    await goToSettingsSection(settings, "What's New");
    await expect(settings.getByRole('heading', { level: 3, name: 'Updates' })).toBeInViewport();
    await expect(
      settings.getByRole('region', { name: 'Updates' }).getByRole('heading', { level: 4 })
    ).toHaveText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);

    await settings.getByRole('link', { name: 'See all releases' }).click();

    await expect(page).toHaveURL(/\/changelog/);
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
  });

  test('sends the device info a parent opted into along with a bug report', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const bodies: { device?: unknown }[] = [];
    await page.route('**/api/report', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Feedback');
    await settings.getByRole('textbox', { name: 'What went wrong?' }).fill(REPORT_MESSAGE);
    await settings.getByRole('checkbox', { name: /Include device info/ }).check();
    await expect(settings.getByText('What will be sent?')).toBeVisible();

    await settings.getByRole('button', { name: 'Send report', exact: true }).click();

    await expect(settings.getByText('Thanks for your feedback.')).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].device).toMatchObject({ platform: 'Web' });
  });

  test('sends no device info unless the parent opts in', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const bodies: { device?: unknown }[] = [];
    await page.route('**/api/report', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Feedback');
    await settings.getByRole('textbox', { name: 'What went wrong?' }).fill(REPORT_MESSAGE);

    await settings.getByRole('button', { name: 'Send report', exact: true }).click();

    await expect(settings.getByText('Thanks for your feedback.')).toBeVisible();
    expect(bodies[0].device).toBeUndefined();
  });

  test('reopening Settings while a report is on its way lets the report land', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const landed: string[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/report', async (route) => {
      await held;
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
        .then(() => landed.push('delivered'));
    });
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Feedback');
    await settings.getByRole('textbox', { name: 'What went wrong?' }).fill(REPORT_MESSAGE);
    await settings.getByRole('button', { name: 'Send report', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    await closeDialog(settings);
    await openSettings(page);
    release();

    await expect.poll(() => landed).toEqual(['delivered']);
  });
});

test.describe('Settings on a phone', () => {
  test.use({ viewport: PHONE });

  test('opens a section from the hub, with Back and Close at touch size, and Back returns', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const hub = await openSettings(page);

    await hub.getByRole('button', { name: /^Appearance, / }).click();

    const section = page.getByRole('dialog', { name: 'Appearance' });
    const back = section.getByRole('button', { name: 'Back', exact: true });
    const close = section.getByRole('button', { name: 'Close', exact: true });
    await waitUntilSettled(back);
    await waitUntilSettled(close);
    const [backBox, closeBox, titleBox] = [
      await back.boundingBox(),
      await close.boundingBox(),
      await section.getByRole('heading', { level: 2, name: 'Appearance' }).boundingBox(),
    ];
    expect(backBox).toMatchObject({ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX });
    expect(closeBox).toMatchObject({ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX });
    expect(backBox?.y).toBe(closeBox?.y);
    expect((titleBox?.x ?? 0) - ((backBox?.x ?? 0) + TOUCH_TARGET_PX)).toBeGreaterThanOrEqual(
      MIN_TITLE_GAP_PX
    );

    await back.click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });
});

test.describe('Settings and the browser Back button on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Back closes Settings, spends one drawing guard, and only then leaves the drawing screen', async ({
    page,
  }) => {
    await page.goto('/privacy');
    const drawingScreen = await openDrawingScreen(page);
    await drawingScreen.drawStroke();
    const settings = await openSettings(page);

    await page.goBack();
    await expect(settings).toBeHidden();
    await expect(page).toHaveURL(/\/$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

interface SidebarColumn {
  overflowY: string;
  overflowing: boolean;
  scrollTop: number;
  top: number;
  bottom: number;
  activeRow: { top: number; bottom: number } | null;
}

// The nearest box above the table of contents that clips it, read from computed style because
// Playwright scrolls a row into view even where no gesture could.
function sidebarColumnOf(nav: Locator): Promise<SidebarColumn> {
  return nav.evaluate((element) => {
    let column = element.parentElement;
    while (column && getComputedStyle(column).overflowY === 'visible')
      column = column.parentElement;
    if (!column) throw new Error('Nothing clips the table of contents');
    const box = column.getBoundingClientRect();
    const active = element.querySelector('[aria-current="location"]')?.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(column).overflowY,
      overflowing: column.scrollHeight > column.clientHeight,
      scrollTop: column.scrollTop,
      top: box.top,
      bottom: box.bottom,
      activeRow: active ? { top: active.top, bottom: active.bottom } : null,
    };
  });
}

test.describe('Settings with the least room a sidebar gets', () => {
  test.use({ viewport: SHORTEST_SIDEBAR_WINDOW });

  test('the table of contents can still reach every section', async ({ drawingScreen }) => {
    const settings = await openSettings(drawingScreen.page);
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    await waitUntilSettled(nav);

    const column = await sidebarColumnOf(nav);
    expect(column.overflowing).toBe(true);
    expect(column.overflowY).toMatch(/auto|scroll/);

    const last = nav.getByRole('button', { name: LAST_SECTION, exact: true });
    await expect(settings.getByRole('heading', { name: LAST_SECTION })).not.toBeInViewport();
    await last.click();
    await expect(last).toHaveAttribute('aria-current', 'location');
    await expect(settings.getByRole('heading', { name: LAST_SECTION })).toBeInViewport();
  });

  test('reopening after a jump to the end lands back on the first row, in view', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const settings = await openSettings(page);
    const nav = settings.getByRole('navigation', { name: 'Settings sections' });
    await waitUntilSettled(nav);
    await goToSettingsSection(settings, LAST_SECTION);
    await expect.poll(async () => (await sidebarColumnOf(nav)).scrollTop).toBeGreaterThan(0);
    await closeDialog(settings);

    const reopened = await openSettings(page);
    const reopenedNav = reopened.getByRole('navigation', { name: 'Settings sections' });
    await expect(
      reopenedNav.getByRole('button', { name: FIRST_SECTION, exact: true })
    ).toHaveAttribute('aria-current', 'location');
    await expect
      .poll(async () => {
        const { activeRow, top, bottom } = await sidebarColumnOf(reopenedNav);
        return (
          activeRow !== null &&
          activeRow.top >= top - ROW_EDGE_TOLERANCE_PX &&
          activeRow.bottom <= bottom + ROW_EDGE_TOLERANCE_PX
        );
      })
      .toBe(true);
    await expect(reopened.getByRole('heading', { name: FIRST_SECTION })).toBeInViewport();
  });
});
