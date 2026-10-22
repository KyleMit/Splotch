import { emptyDrawing } from '../../../src/drawing/model.ts';
import { caller, records, host, mount, checkedSwitch } from './rsd-native-selection-host.mjs';
import { solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { hubSessions, sectionVisits } from './rsd-native-settings-hub-mocks.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { WHATS_NEW_STAMP } from '../../../src/settings/whatsNewStamp.ts';
import { DRAWING_BRAND, DRAWING_SCALE } from '../../../src/drawing/theme.ts';
import {
  MODAL_GUTTER_MIN_PX,
  modalFrame,
  settingsShell,
} from '../../../src/rsdDrawing/modalGeometry.ts';
import { WIDE_SHELL } from '../../../src/rsdDrawing/RsdSettingsWide.tsx';

import { ORIENTATION_COLUMN_MAX_WIDTH_PX } from '../../../src/rsdDrawing/RsdOrientationPicker.tsx';
import { COMPACT_SHELL } from '../../../src/rsdDrawing/RsdSettingsCompact.tsx';
import {
  NAV_ROW_CLEARANCE_PX,
  SCROLL_END_EPSILON_PX,
  SCROLLSPY_LINE_INSET_PX,
} from '../../../src/settings/settingsPane.ts';
import {
  NATIVE_SETTINGS_SECTIONS,
  sectionHeading,
} from '../../../src/settings/settingsSections.ts';
import { SETTINGS_ACTIVITY_DOTS_START_SESSION } from '../../../src/settings/settingsSessions.ts';
import { SECTION_JUMP_INSET_PX } from '../../../src/lib/components/settings/paneScroll.ts';

const shipping = (path) =>
  readFileSync(join(import.meta.dirname, '../../../src/lib/components', path), 'utf8');
const PANE = shipping('settings/paneScroll.ts');

const TABLET = { width: 1366, height: 1024, scale: 2, fontScale: 1 };
const SMALL_TABLET = { width: 1024, height: 768, scale: 2, fontScale: 1 };
const PHONE_LANDSCAPE = { width: 844, height: 390, scale: 3, fontScale: 1 };
const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };

describe("the shipping shells' geometry", () => {
  it('picks the phone, wide and compact shells where SettingsModal does', () => {
    const wideFloor = Number(
      /SETTINGS_WIDE_MIN_WIDTH_PX = (\d+);/.exec(
        readFileSync(join(import.meta.dirname, '../../../src/lib/breakpoints.ts'), 'utf8')
      )[1]
    );
    expect(settingsShell(PHONE)).toBe('phone');
    expect(settingsShell({ width: wideFloor - 1, height: 1000 })).toBe('phone');
    expect(settingsShell({ width: wideFloor, height: 1000 })).toBe('wide');
    expect(settingsShell(SMALL_TABLET)).toBe('wide');
    expect(settingsShell(TABLET)).toBe('wide');
    // A landscape phone is wide enough for the sidebar, and still gets the quick toggles.
    expect(settingsShell(PHONE_LANDSCAPE)).toBe('compact');
    expect(settingsShell({ width: 667, height: 375 })).toBe('compact');
  });

  it.each([
    [900, 599.98, 'compact'],
    [900, 600, 'wide'],
    [599.98, 599.98, 'phone'],
    [600, 600, 'phone'],
    [700, 700, 'wide'],
    [699.98, 1000, 'phone'],
    [700, 1000, 'wide'],
    [700, 699.98, 'wide'],
    [600, 599.98, 'compact'],
    [599.98, 600, 'phone'],
  ])('selects the %s × %s shell at a policy boundary', (width, height, shell) => {
    expect(settingsShell({ width, height })).toBe(shell);
  });

  it("reads the pane's reading line, scroll-end slack and nav clearance from paneScroll", () => {
    const constant = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(PANE)[1]);
    expect(SCROLLSPY_LINE_INSET_PX).toBe(constant('SCROLLSPY_LINE_INSET_PX'));
    expect(SCROLL_END_EPSILON_PX).toBe(constant('SCROLL_END_EPSILON_PX'));
    expect(NAV_ROW_CLEARANCE_PX).toBe(constant('NAV_ROW_CLEARANCE_PX'));
  });
});

const CURRENT_SETTINGS = {
  version: 15,
  soundEnabled: true,
  strokeWidth: 'medium',
  eraserWidth: 'medium',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'light',
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
    externalLinks: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
  soundVolume: 50,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: WHATS_NEW_STAMP,
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolbarStyle: 'buttons',
  toolDrawerEnabled: true,
  screenshotEnabled: true,
  aiCustomizationEnabled: true,
  autoSaveAiEnabled: false,
};

function openSettings(dimensions, overrides = {}) {
  records.dimensions = dimensions;
  if (Object.hasOwn(overrides, 'whatsNewSeen')) {
    const stamps = JSON.parse(sectionVisits.snapshot);
    stamps.whatsnew = overrides.whatsNewSeen;
    sectionVisits.snapshot = JSON.stringify(stamps);
  }
  let stored = JSON.stringify({ ...CURRENT_SETTINGS, ...overrides });
  caller.settingsStorage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
    closeSettings: vi.fn(),
    closeColorPicker: vi.fn(),
    openColorPicker: vi.fn(),
    selectInkBrush: vi.fn(),
    notePaintChoice: vi.fn(),
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
  return { storage: caller.settingsStorage, stored: () => JSON.parse(stored) };
}

function holdNextWrite(storage) {
  let finish;
  storage.write.mockImplementationOnce(
    (next) =>
      new Promise((resolve) => {
        finish = () => resolve(next);
      })
  );
  return () => act(async () => finish());
}

const LISTED = NATIVE_SETTINGS_SECTIONS;
// Every section, Feedback and Install among them, holds its place in the one pane.
const PANE_SECTIONS = LISTED;

const sidebarRows = () => [...host.querySelectorAll('[data-testid="sidebar-row"]')];
const sidebarRow = (label) => {
  const row = sidebarRows().find((node) => node.getAttribute('aria-label').startsWith(label));
  expect(row, label).toBeDefined();
  return row;
};
// The reading position's row thickens its segment of the track to the brand rail; the wash
// behind it eases in through a transition, so the rail is what is read here.
const spiedRow = () =>
  LISTED.map(({ label }) => label).filter(
    (label) =>
      records.props.findLast(
        (props) => props.testID === 'sidebar-row' && props.accessibilityLabel?.startsWith(label)
      )?.style.borderLeftColor === DRAWING_BRAND
  );

const latest = (match) => records.props.findLast(match);
const paneScroll = () =>
  records.viewports.findLast(
    (props) => props.contentContainerStyle?.paddingLeft === WIDE_SHELL.pane.left
  );
const sectionFrames = () =>
  PANE_SECTIONS.map(({ id }) =>
    latest((props) => props.onLayout && props.children?.props?.['data-section'] === id)
  );

// Lays every pane section out at one height and reports the pane's own size.
async function layOutPane(sectionHeight, viewport) {
  await act(async () => {
    for (const frame of sectionFrames())
      frame.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 600, height: sectionHeight } },
      });
    const pane = paneScroll();
    pane.onLayout({ nativeEvent: { layout: { height: viewport } } });
    pane.onContentSizeChange(600, PANE_SECTIONS.length * (sectionHeight + WIDE_SHELL.sectionGap));
  });
}

async function scrollPane(offset) {
  await act(async () =>
    paneScroll().onScroll({ nativeEvent: { contentOffset: { x: 0, y: offset } } })
  );
}

const scrollTo = vi.fn();
afterEach(() => {
  scrollTo.mockClear();
  delete HTMLElement.prototype.scrollTo;
});

describe('the wide shell', () => {
  it('replaces the hub with a table of contents beside every section stacked in one pane', async () => {
    openSettings(TABLET);
    await mount(createElement(RsdDrawingScreen));
    expect(host.querySelector('[aria-label="Settings sections"]')).not.toBeNull();
    expect(host.querySelector('[aria-label^="Appearance, Night Mode"]')).toBeNull();
    expect(sidebarRows().map((row) => row.getAttribute('aria-label'))).toEqual(
      LISTED.map(({ label }) => label)
    );
    const paneSection = (id) =>
      latest((props) => props.onLayout && props.children?.props?.['data-section'] === id);
    for (const { id } of PANE_SECTIONS) expect(paneSection(id), id).toBeDefined();
    for (const { id } of PANE_SECTIONS) expect(host.textContent).toContain(sectionHeading(id));
    expect(spiedRow()).toEqual(['Appearance']);
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
  });

  it('marks the first wide section seen once it is measured and leaves every other section new', async () => {
    openSettings(SMALL_TABLET);
    sectionVisits.snapshot = '{}';
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(400, 500);
    expect(JSON.parse(sectionVisits.snapshot)).toEqual({ appearance: '1' });
    expect(sidebarRow('Appearance').getAttribute('aria-label')).toBe('Appearance');
    expect(sidebarRow('Sound').getAttribute('aria-label')).toBe('Sound, new');
    expect(sectionVisits.write).toHaveBeenCalledOnce();
  });

  it('moves the highlight with the reading position and marks What’s New seen on reaching it', async () => {
    const settings = openSettings(SMALL_TABLET, { whatsNewSeen: null });
    await mount(createElement(RsdDrawingScreen));
    expect(sidebarRow("What's New").getAttribute('aria-label')).toBe("What's New, new");
    await layOutPane(400, 500);
    const offsets = PANE_SECTIONS.map((_, index) => WIDE_SHELL.pane.top + index * 460);
    await scrollPane(offsets[2] - SCROLLSPY_LINE_INSET_PX + 1);
    expect(spiedRow()).toEqual(['Tool Drawer']);
    expect(settings.storage.write).not.toHaveBeenCalled();
    const whatsNew = PANE_SECTIONS.findIndex(({ id }) => id === 'whatsnew');
    await scrollPane(offsets[whatsNew] - SCROLLSPY_LINE_INSET_PX);
    expect(spiedRow()).toEqual(["What's New"]);
    expect(JSON.parse(sectionVisits.snapshot).whatsnew).toBe(WHATS_NEW_STAMP);
    expect(sidebarRow("What's New").getAttribute('aria-label')).toBe("What's New");
  });

  it('jumps the pane to a tapped section, Feedback included, without leaving Settings', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    openSettings(TABLET, { whatsNewSeen: null });
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(300, 600);
    await act(async () => sidebarRow('Saving').click());
    const saving = PANE_SECTIONS.findIndex(({ id }) => id === 'saving');
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: WIDE_SHELL.pane.top + saving * 360 - SECTION_JUMP_INSET_PX,
      animated: true,
    });
    scrollTo.mockClear();
    await act(async () => sidebarRow('Feedback').click());
    const feedback = PANE_SECTIONS.findIndex(({ id }) => id === 'feedback');
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: WIDE_SHELL.pane.top + feedback * 360 - SECTION_JUMP_INSET_PX,
      animated: true,
    });
    expect(caller.screen.closeSettings).not.toHaveBeenCalled();
    expect(caller.product.feedback.state.open).toBe(false);
    expect(host.querySelector('[data-native-modal="Send Feedback"]')).toBeNull();
  });

  it('keeps a smooth jump from marking the sections it passes', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    const settings = openSettings(TABLET, { whatsNewSeen: null });
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(300, 600);
    await act(async () => sidebarRow('About').click());
    const whatsNew = PANE_SECTIONS.findIndex(({ id }) => id === 'whatsnew');
    await scrollPane(WIDE_SHELL.pane.top + whatsNew * 360 - SCROLLSPY_LINE_INSET_PX);
    expect(spiedRow()).toEqual(["What's New"]);
    expect(settings.storage.write).not.toHaveBeenCalled();
  });

  it('hands the pane back on a drag that interrupts a smooth jump, so what it reaches is seen', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    openSettings(TABLET, { whatsNewSeen: null });
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(300, 600);
    await act(async () => sidebarRow('About').click());
    await act(async () => paneScroll().onScrollBeginDrag({ nativeEvent: {} }));
    const whatsNew = PANE_SECTIONS.findIndex(({ id }) => id === 'whatsnew');
    await scrollPane(WIDE_SHELL.pane.top + whatsNew * 360 - SCROLLSPY_LINE_INSET_PX);
    expect(spiedRow()).toEqual(["What's New"]);
    expect(JSON.parse(sectionVisits.snapshot).whatsnew).toBe(WHATS_NEW_STAMP);
  });

  it('dots only from the sixth session, as the hub does', async () => {
    hubSessions.count = SETTINGS_ACTIVITY_DOTS_START_SESSION - 1;
    openSettings(TABLET, { whatsNewSeen: null });
    await mount(createElement(RsdDrawingScreen));
    expect(sidebarRow("What's New").getAttribute('aria-label')).toBe("What's New");
  });
});

describe('the compact shell', () => {
  const quick = (label) => host.querySelector(`[role="switch"][aria-label="${label}"]`);
  const QUICK_SWITCHES = ['Sound', 'Night Mode', 'Tool drawer'];

  // The orientation cell's width on a landscape phone: half the card's content row, less the gap.
  const orientationCell = (window) =>
    (modalFrame('settings', window, MODAL_GUTTER_MIN_PX).width -
      2 * COMPACT_SHELL.inline -
      DRAWING_SCALE.space2) /
    2;
  const optionDirection = (label) =>
    records.props.findLast(
      (props) => props.accessibilityLabel === label && props.style?.flexDirection
    )?.style.flexDirection;

  it.each([
    ['568x320', { width: 568, height: 320, scale: 2, fontScale: 1 }],
    ['844x390', PHONE_LANDSCAPE],
  ])(
    'stacks each orientation glyph over its label in the %s cell, as shipping does below its threshold',
    async (_name, window) => {
      openSettings(window);
      await mount(createElement(RsdDrawingScreen));
      const width = orientationCell(window);
      expect(width).toBeLessThanOrEqual(ORIENTATION_COLUMN_MAX_WIDTH_PX);
      expect(optionDirection('Landscape')).toBe('row');
      const track = latest((props) => props.testID === 'orientation-picker');
      await act(async () =>
        track.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 60 } } })
      );
      for (const label of ['Portrait', 'Landscape', 'Auto'])
        expect(optionDirection(label), label).toBe('column');
      await act(async () =>
        track.onLayout({
          nativeEvent: {
            layout: { x: 0, y: 0, width: ORIENTATION_COLUMN_MAX_WIDTH_PX + 1, height: 60 },
          },
        })
      );
      expect(optionDirection('Landscape')).toBe('row');
    }
  );

  it('shows only the quick toggles, the orientation lock and the pointer to portrait', async () => {
    const settings = openSettings(PHONE_LANDSCAPE);
    await mount(createElement(RsdDrawingScreen));
    expect(host.querySelector('[aria-label^="Appearance, Night Mode"]')).toBeNull();
    expect(host.querySelector('[aria-label="Settings sections"]')).toBeNull();
    checkedSwitch(quick('Sound'), true);
    checkedSwitch(quick('Night Mode'), false);
    checkedSwitch(quick('Tool drawer'), true);
    expect(host.textContent).toContain('Switch to portrait for the full settings.');
    await act(async () => quick('Tool drawer').click());
    checkedSwitch(quick('Tool drawer'), false);
    expect(settings.stored().toolDrawerEnabled).toBe(false);
    await act(async () => quick('Night Mode').click());
    checkedSwitch(quick('Night Mode'), true);
    expect(settings.stored().appearance).toBe('dark');
    await act(async () => host.querySelector('[role="radio"][aria-label="Landscape"]').click());
    expect(settings.stored().orientation).toBe('landscape');
  });

  // Shipping stores each choice synchronously, so no quick control dims or refuses for a save.
  it('keeps every quick control live while a choice saves, and keeps a tap made meanwhile', async () => {
    const settings = openSettings(PHONE_LANDSCAPE);
    const finish = holdNextWrite(settings.storage);
    await mount(createElement(RsdDrawingScreen));
    const soundWas = caller.product.sound.settings.soundEnabled;
    await act(async () => quick('Sound').click());
    expect(settings.storage.write).toHaveBeenCalledOnce();
    for (const label of QUICK_SWITCHES) expect(quick(label).disabled, label).toBe(false);
    expect(host.querySelector('[role="radio"][aria-label="Auto"]').disabled).toBe(false);
    await act(async () => quick('Night Mode').click());
    expect(caller.product.sound.settings).toMatchObject({
      soundEnabled: !soundWas,
      appearance: 'dark',
    });
    await finish();
    expect(settings.storage.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(settings.storage.write.mock.calls[1][0])).toMatchObject({
      soundEnabled: !soundWas,
      appearance: 'dark',
    });
    // A parent choice's save holds every action until it lands, yet leaves the sheet undimmed (#3077).
    const finishParent = holdNextWrite(settings.storage);
    await act(async () => void caller.product.sound.owner.settings.setAiEnabled(true));
    expect(caller.product.sound.settings.status).toBe('saving');
    for (const label of QUICK_SWITCHES) expect(quick(label).disabled, label).toBe(false);
    await finishParent();
  });
});
describe('Parent Center in the wide shell', () => {
  it('lands a tablet AI setup link on the AI Art section', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    openSettings(TABLET);
    caller.screen.settingsSection = 'ai';
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(300, 600);
    const index = PANE_SECTIONS.findIndex(({ id }) => id === 'ai');
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: WIDE_SHELL.pane.top + index * (300 + WIDE_SHELL.sectionGap) - SECTION_JUMP_INSET_PX,
      animated: false,
    });
  });

  const parentCenterOffset = (sectionHeight) =>
    WIDE_SHELL.pane.top +
    PANE_SECTIONS.findIndex(({ id }) => id === 'parentCenter') *
      (sectionHeight + WIDE_SHELL.sectionGap) -
    SECTION_JUMP_INSET_PX;

  it('lands the pane on Parent Center when a solved check opens Settings for it', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    openSettings(TABLET);
    caller.screen.settingsOpen = false;
    await mount(createElement(RsdDrawingScreen));
    expect(host.querySelector('[data-native-modal="Settings"]')).toBeNull();
    await act(async () => caller.product.owner.openParentCenter());
    await solveParentGate();
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Unlock these settings');
    expect(scrollTo).not.toHaveBeenCalled();
    await layOutPane(300, 600);
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: parentCenterOffset(300),
      animated: false,
    });
    await scrollPane(parentCenterOffset(300));
    expect(spiedRow()).toEqual(['Parent Center']);
    await layOutPane(300, 600);
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('opens on Appearance, with Parent Center behind its lock, when nothing asked for it', async () => {
    HTMLElement.prototype.scrollTo = scrollTo;
    openSettings(TABLET);
    await mount(createElement(RsdDrawingScreen));
    await layOutPane(300, 600);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Unlock these settings');
  });
});

it('pads the compact header as CompactShell does', () => {
  expect(modalFrame('settings', PHONE_LANDSCAPE, MODAL_GUTTER_MIN_PX).header).toEqual({
    top: 14,
    inline: 24,
    bottom: 10,
  });
  expect(modalFrame('settings', TABLET, MODAL_GUTTER_MIN_PX).header.top).not.toBe(14);
});
