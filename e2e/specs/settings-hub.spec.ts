import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import {
  armParentCenterGate,
  openSettings,
  settledBox,
  solveParentGate,
} from '../support/group-c.ts';

// The phone Settings shell: a hub of section rows that drills into one section at a time, with an
// inline switch on the two rows worth flipping without leaving the list. The wide shell's table of
// contents over one continuous pane is covered by settings-toc.spec.ts.

const PHONE = { width: 460, height: 852 };
const AI_PHONE = { width: 390, height: 844 };
const ACTIVITY_SESSIONS_KEY = 'splotch-settings-activity-session-count';
const SECTIONS_SEEN_KEY = 'splotch-parent-sections-seen';
// The settings activity dots start on the sixth session.
const SESSIONS_BEFORE_DOTS = 4;
const SWITCH_TARGET_HEIGHT_PX = 48;
const TARGET_EDGE_INSET_PX = 1;
const SWITCH_TARGET_POINTS = [
  ['top left', 0, 0],
  ['top', 0.5, 0],
  ['top right', 1, 0],
  ['right', 1, 0.5],
  ['bottom right', 1, 1],
  ['bottom', 0.5, 1],
  ['bottom left', 0, 1],
  ['left', 0, 0.5],
] as const;

const hubRow = (hub: Locator, section: string) =>
  hub.getByRole('button', { name: new RegExp(`^${section}`) });

async function openPhoneHub(page: Page, size = PHONE) {
  await page.setViewportSize(size);
  await openDrawingScreen(page);
  const hub = await openSettings(page);
  await expect(hub.getByRole('switch', { name: 'Night Mode' })).toBeVisible();
  await settledBox(hub.getByRole('switch', { name: 'Night Mode' }));
  return hub;
}

function storedValue(page: Page, key: string) {
  return page.evaluate((name) => localStorage.getItem(name), key);
}

test('the hub drills into a section and back', async ({ page }) => {
  const hub = await openPhoneHub(page);
  const toolDrawer = page.getByRole('dialog', { name: 'Tool Drawer' });
  // Nothing is drilled into yet, so a section's own controls are not mounted.
  await expect(page.getByRole('switch', { name: 'Enable tool drawer' })).toHaveCount(0);

  await hubRow(hub, 'Tool Drawer').click();
  await expect(toolDrawer.getByRole('switch', { name: 'Enable tool drawer' })).toBeVisible();

  await toolDrawer.getByRole('button', { name: 'Back' }).click();
  await expect(toolDrawer).toBeHidden();
  await expect(page.getByRole('switch', { name: 'Enable tool drawer' })).toHaveCount(0);
});

// Every move unmounts the control that held focus, so each proves focus lands on its replacement
// rather than falling to the document.
test('drilling into a section focuses its heading, and Back refocuses its row', async ({
  page,
}) => {
  const hub = await openPhoneHub(page);

  await hubRow(hub, 'Tool Drawer').click();
  const section = page.getByRole('dialog', { name: 'Tool Drawer' });
  await expect(section.getByRole('heading', { name: 'Tool Drawer' })).toBeFocused();

  await section.getByRole('button', { name: 'Back' }).click();
  await expect(hubRow(hub, 'Tool Drawer')).toBeFocused();
});

test('unlocking Parent Center focuses its heading once the challenge has closed', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openDrawingScreen(page);
  await armParentCenterGate(page);
  const hub = await openSettings(page);

  await hubRow(hub, 'Parent Center').click();
  await expect(page.getByRole('dialog', { name: 'Grown-Ups Only' })).toBeVisible();
  await solveParentGate(page);

  const section = page.getByRole('dialog', { name: 'Parent Center' });
  await expect(section.getByRole('heading', { name: 'Parent Center', exact: true })).toBeFocused();
});

test('the sixth session dots only the sections not read during the quiet period', async ({
  page,
}) => {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('sessions-seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('sessions-seeded', '1');
      }
    },
    [ACTIVITY_SESSIONS_KEY, String(SESSIONS_BEFORE_DOTS)]
  );
  const hub = await openPhoneHub(page);

  await expect(hubRow(hub, 'AI Art')).toHaveAccessibleName(/^AI Art, Turned off$/);
  await expect
    .poll(() => storedValue(page, ACTIVITY_SESSIONS_KEY))
    .toBe(String(SESSIONS_BEFORE_DOTS + 1));

  await hubRow(hub, 'AI Art').click();
  await expect(page.getByRole('dialog', { name: 'AI Art' })).toBeVisible();
  await expect
    .poll(async () => (await storedValue(page, SECTIONS_SEEN_KEY)) ?? '')
    .toContain('"ai"');

  await page.reload();
  await openSettings(page);
  const reopened = page.getByRole('dialog', { name: 'Settings' });
  await expect(hubRow(reopened, 'AI Art')).not.toHaveAccessibleName(/new/);
  await expect(hubRow(reopened, 'Tool Drawer')).toHaveAccessibleName(/Tool Drawer.*new/);
  await expect
    .poll(() => storedValue(page, ACTIVITY_SESSIONS_KEY))
    .toBe(String(SESSIONS_BEFORE_DOTS + 2));
});

// The hub answers its two most-flipped booleans in place, and every other row is a plain drill-in,
// so a row's trailing edge reads one way, a switch or nothing, rather than as switch versus chevron.
test('the hub carries inline switches only on the two rows that lead it', async ({ page }) => {
  const hub = await openPhoneHub(page);

  await expect(hub.getByRole('switch')).toHaveCount(2);
  await expect(hub.getByRole('switch', { name: 'Night Mode' })).toBeVisible();
  await expect(hub.getByRole('switch', { name: 'Sound' })).toBeVisible();
  const rows = await hub
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''));
  expect(rows.slice(0, 3)).toEqual([
    'Close',
    expect.stringMatching(/^Appearance/),
    expect.stringMatching(/^Sound/),
  ]);
});

test('a hub switch acts on its setting without leaving the list', async ({ page }) => {
  const hub = await openPhoneHub(page);
  const soundSwitch = hub.getByRole('switch', { name: 'Sound' });
  await expect(soundSwitch).toBeChecked();

  await soundSwitch.click();

  // The row stays where it is, because the switch is not a drill-in, and its summary reports the
  // setting the switch just changed.
  await expect(soundSwitch).not.toBeChecked();
  await expect(hubRow(hub, 'Sound')).toHaveAccessibleName('Sound, Muted');
  // Drilling in shows the same setting: one boolean, two ways to reach it.
  await hubRow(hub, 'Sound').click();
  await expect(
    page.getByRole('dialog', { name: 'Sound' }).getByRole('switch', { name: 'Sound' })
  ).not.toBeChecked();
});

test('the Sound summary names a single enabled source and an empty mix', async ({ page }) => {
  const hub = await openPhoneHub(page);
  await hubRow(hub, 'Sound').click();
  const section = page.getByRole('dialog', { name: 'Sound' });

  await section.getByRole('switch', { name: 'Deleting' }).click();
  await section.getByRole('button', { name: 'Back' }).click();
  await expect(hubRow(hub, 'Sound')).toHaveAccessibleName('Sound, Volume 50% · drawing only');

  await hubRow(hub, 'Sound').click();
  await section.getByRole('switch', { name: 'Drawing' }).click();
  await section.getByRole('button', { name: 'Back' }).click();
  await expect(hubRow(hub, 'Sound')).toHaveAccessibleName('Sound, No sources');
});

test('AI Art reports its off state in the phone hub', async ({ page }) => {
  const hub = await openPhoneHub(page, AI_PHONE);

  await expect(hubRow(hub, 'AI Art')).toHaveAccessibleName('AI Art, Turned off');
});

test('AI Art leaves its setup controls out until its master switch is on', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
  );
  const hub = await openPhoneHub(page, AI_PHONE);
  await hubRow(hub, 'AI Art').click();
  const section = page.getByRole('dialog', { name: 'AI Art' });
  const master = section.getByRole('switch', { name: 'Create AI Images' });
  await expect(master).not.toBeChecked();
  await expect(section.getByRole('heading', { name: 'What turning this on does' })).toBeVisible();
  await expect(section.getByRole('textbox', { name: 'OpenAI API Key' })).toHaveCount(0);
  await expect(section.getByRole('switch', { name: 'Customize AI Style' })).toHaveCount(0);

  await master.click();

  await expect(section.getByRole('textbox', { name: 'OpenAI API Key' })).toBeVisible();
  await expect(section.getByRole('switch', { name: 'Customize AI Style' })).toBeAttached();
  await expect(section.getByRole('heading', { name: 'What turning this on does' })).toHaveCount(0);
});

// Night Mode is binary over the resolved theme, so the hub switch and the three-way picker inside
// Appearance have to agree about which way it is set.
test('the hub Night Mode switch matches the Appearance picker', async ({ page }) => {
  const hub = await openPhoneHub(page);
  const night = hub.getByRole('switch', { name: 'Night Mode' });
  await expect(night).not.toBeChecked();

  await night.click();
  await expect(night).toBeChecked();

  await hubRow(hub, 'Appearance').click();
  await expect(
    page.getByRole('dialog', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' })
  ).toBeChecked();
});

// Every edge of the 48px switch target answers it, and a tap a pixel outside leaves both switches alone.
for (const [edge, x, y] of SWITCH_TARGET_POINTS) {
  test(`the hub switch answers its ${edge} target edge without changing Sound`, async ({
    page,
  }) => {
    const hub = await openPhoneHub(page);
    const night = hub.getByRole('switch', { name: 'Night Mode' });
    const sound = hub.getByRole('switch', { name: 'Sound' });
    const box = await settledBox(night);
    expect(box.height).toBe(SWITCH_TARGET_HEIGHT_PX);

    await page.mouse.click(
      box.x + TARGET_EDGE_INSET_PX + x * (box.width - 2 * TARGET_EDGE_INSET_PX),
      box.y + TARGET_EDGE_INSET_PX + y * (box.height - 2 * TARGET_EDGE_INSET_PX)
    );

    await expect(night).toBeChecked();
    await expect(sound).toBeChecked();
  });
}

for (const side of ['above', 'below'] as const) {
  test(`a tap ${side} the hub switch target leaves both switches alone`, async ({ page }) => {
    const hub = await openPhoneHub(page);
    const night = hub.getByRole('switch', { name: 'Night Mode' });
    const box = await settledBox(night);
    const y =
      side === 'above' ? box.y - TARGET_EDGE_INSET_PX : box.y + box.height + TARGET_EDGE_INSET_PX;

    await page.mouse.click(box.x + box.width / 2, y);

    await expect(night).not.toBeChecked();
    await expect(hub.getByRole('switch', { name: 'Sound' })).toBeChecked();
  });
}

// The section's switch hides every tool its row would count, so with it off the row names the
// switch rather than a count of tools the child cannot see.
test('the Tool Drawer row names its switch rather than a tool count while it is off', async ({
  page,
}) => {
  const hub = await openPhoneHub(page);
  await expect(hubRow(hub, 'Tool Drawer')).toHaveAccessibleName(
    'Tool Drawer, Pen, crayon, magic brush & more'
  );

  await hubRow(hub, 'Tool Drawer').click();
  const section = page.getByRole('dialog', { name: 'Tool Drawer' });
  await section.getByRole('switch', { name: 'Enable tool drawer' }).click();
  await section.getByRole('button', { name: 'Back' }).click();

  await expect(hubRow(hub, 'Tool Drawer')).toHaveAccessibleName('Tool Drawer, Tool drawer off');
});

// The camera button is a way of saving a drawing, so Saving owns it, like Coloring and AI Art own
// theirs, rather than it sitting in the chip grid behind the tool drawer switch.
test('the camera button toggle lives in Saving, not the Tool Drawer', async ({ page }) => {
  const hub = await openPhoneHub(page);
  await hubRow(hub, 'Tool Drawer').click();
  const drawer = page.getByRole('dialog', { name: 'Tool Drawer' });
  await expect(drawer.getByRole('switch', { name: 'Enable tool drawer' })).toBeChecked();
  await expect(drawer.getByRole('switch', { name: 'Camera button' })).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Back' }).click();
  await hubRow(hub, 'Saving').click();
  const camera = page.getByRole('dialog', { name: 'Saving' }).getByRole('switch', {
    name: 'Camera button',
  });
  await expect(camera).toBeChecked();
  await camera.click();
  await expect(camera).not.toBeChecked();
});
