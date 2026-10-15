import { caller, records, host, mount, checkedSwitch } from './rsd-native-selection-host.mjs';
import { solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { hubSessions, sectionVisits } from './rsd-native-settings-hub-mocks.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  DRAWING_BRAND,
  DRAWING_SCALE,
} from '../../../experiments/native-architecture/src/drawing/theme.ts';
import {
  MODAL_GUTTER_MIN_PX,
  modalFrame,
  settingsShell,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import { WIDE_SHELL } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsWide.tsx';
import { PICKER_METRICS } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSegmentedPicker.tsx';
import { ORIENTATION_COLUMN_MAX_WIDTH_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdOrientationPicker.tsx';
import { COMPACT_SHELL } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsCompact.tsx';
import {
  NAV_ROW_CLEARANCE_PX,
  SCROLL_END_EPSILON_PX,
  SCROLLSPY_LINE_INSET_PX,
  navRevealOffset,
  sectionJumpOffset,
  spiedSectionAt,
  stackedOffsets,
} from '../../../experiments/native-architecture/src/settings/settingsPane.ts';
import {
  NATIVE_SETTINGS_SECTIONS,
  sectionHeading,
} from '../../../experiments/native-architecture/src/settings/settingsSections.ts';
import { WHATS_NEW_STAMP } from '../../../experiments/native-architecture/src/settings/whatsNewStamp.ts';
import { SETTINGS_ACTIVITY_DOTS_START_SESSION } from '../../../experiments/native-architecture/src/settings/settingsSessions.ts';
import { SECTION_JUMP_INSET_PX } from '../../../web/src/lib/components/settings/paneScroll.ts';

const shipping = (path) =>
  readFileSync(join(import.meta.dirname, '../../../web/src/lib/components', path), 'utf8');
const WIDE = shipping('settings/WideShell.svelte');
const COMPACT = shipping('settings/CompactShell.svelte');
const SETTINGS = shipping('SettingsModal.svelte');
const PANE = shipping('settings/paneScroll.ts');

const TABLET = { width: 1366, height: 1024, scale: 2, fontScale: 1 };
const SMALL_TABLET = { width: 1024, height: 768, scale: 2, fontScale: 1 };
const PHONE_LANDSCAPE = { width: 844, height: 390, scale: 3, fontScale: 1 };
const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };

// The declarations of the first `selector {` rule in a shipping source.
function rule(source, selector) {
  const open = source.indexOf(`${selector} {`);
  expect(open, selector).toBeGreaterThanOrEqual(0);
  return source.slice(open, source.indexOf('}', open));
}

function declaration(block, property) {
  const value = new RegExp(`\\n\\s*${property}: ([^;]+);`).exec(block)?.[1];
  expect(value, property).toBeDefined();
  return value;
}

const px = (value) => {
  expect(value).toMatch(/^(?:0|\d+px)$/);
  return Number.parseFloat(value);
};
const lengths = (shorthand) => shorthand.split(/\s+/).map(px);

describe("the shipping shells' geometry", () => {
  it('picks the phone, wide and compact shells where SettingsModal does', () => {
    const wideFloor = Number(
      /SETTINGS_WIDE_MIN_WIDTH_PX = (\d+);/.exec(
        readFileSync(join(import.meta.dirname, '../../../web/src/lib/breakpoints.ts'), 'utf8')
      )[1]
    );
    expect(SETTINGS).toContain(
      'const WIDE_QUERY = `(min-width: ${SETTINGS_WIDE_MIN_WIDTH_PX}px)`;'
    );
    expect(SETTINGS).toContain('compact: PHONE_LANDSCAPE_QUERY');
    expect(settingsShell(PHONE)).toBe('phone');
    expect(settingsShell({ width: wideFloor - 1, height: 1000 })).toBe('phone');
    expect(settingsShell({ width: wideFloor, height: 1000 })).toBe('wide');
    expect(settingsShell(SMALL_TABLET)).toBe('wide');
    expect(settingsShell(TABLET)).toBe('wide');
    // A landscape phone is wide enough for the sidebar, and still gets the quick toggles.
    expect(settingsShell(PHONE_LANDSCAPE)).toBe('compact');
    expect(settingsShell({ width: 667, height: 375 })).toBe('compact');
  });

  it('pads the compact header as CompactShell does', () => {
    const [top, inline, bottom] = lengths(
      declaration(rule(COMPACT, '.settings-header-compact'), 'padding')
    );
    expect(modalFrame('settings', PHONE_LANDSCAPE, MODAL_GUTTER_MIN_PX).header).toEqual({
      top,
      inline,
      bottom,
    });
    expect(modalFrame('settings', TABLET, MODAL_GUTTER_MIN_PX).header.top).not.toBe(top);
  });

  it('lays the wide split out as WideShell does', () => {
    const split = rule(WIDE, '.settings-split');
    expect(px(/--section-gap: ([^;]+);/.exec(split)[1])).toBe(WIDE_SHELL.sectionGap);
    expect(px(declaration(split, 'gap'))).toBe(WIDE_SHELL.splitGap);
    const [top, inline, bottom] = lengths(declaration(split, 'padding'));
    expect(WIDE_SHELL.split).toEqual({ top, inline, bottom });
    const nav = rule(WIDE, '.settings-nav');
    expect(px(declaration(nav, 'width'))).toBe(WIDE_SHELL.navWidth);
    expect(nav).toContain(`top / 100% ${WIDE_SHELL.navShade}px no-repeat scroll`);
    const [paneTop, right, paneBottom, left] = lengths(
      declaration(rule(WIDE, '.settings-pane'), 'padding')
    );
    expect(WIDE_SHELL.pane).toEqual({ top: paneTop, right, bottom: paneBottom, left });
    expect(declaration(rule(WIDE, '.settings-pane-title'), 'margin')).toBe(
      `0 0 ${WIDE_SHELL.titleGap}px`
    );
  });

  it('sizes the quick toggles, their fade and the portrait note as CompactShell does', () => {
    const scroll = rule(COMPACT, '.quick-toggles-scroll');
    expect(px(/--scroll-cue-height: ([^;]+);/.exec(scroll)[1])).toBe(COMPACT_SHELL.cueHeight);
    expect(declaration(scroll, 'padding')).toBe(
      `0 ${COMPACT_SHELL.inline}px var(--scrollport-bottom-padding)`
    );
    expect(declaration(rule(COMPACT, '.quick-toggles'), 'grid-template-columns')).toBe(
      'repeat(2, 1fr)'
    );
    const note = rule(COMPACT, '.portrait-note');
    const [top, inline, bottom] = lengths(declaration(note, 'padding'));
    expect(COMPACT_SHELL.note).toMatchObject({
      top,
      inline,
      bottom,
      gap: px(declaration(note, 'gap')),
    });
    expect(px(declaration(rule(COMPACT, ':global(.portrait-note-icon)'), 'width'))).toBe(
      COMPACT_SHELL.note.icon
    );
  });

  it('stacks the orientation options below the track width OrientationPicker does', () => {
    const picker = shipping('settings/OrientationPicker.svelte');
    expect(picker).toContain(
      `@container orientation-picker (max-width: ${ORIENTATION_COLUMN_MAX_WIDTH_PX}px)`
    );
    expect(picker).toContain('--segment-option-direction: column;');
    expect(picker).toContain(`--segment-option-gap: ${PICKER_METRICS.COLUMN_OPTION_GAP_PX}px;`);
    expect(picker).toContain(
      `--segment-option-padding: var(--space-1) ${PICKER_METRICS.COLUMN_OPTION_PADDING_INLINE_PX}px;`
    );
  });

  it("reads the pane's reading line, scroll-end slack and nav clearance from paneScroll", () => {
    const constant = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(PANE)[1]);
    expect(SCROLLSPY_LINE_INSET_PX).toBe(constant('SCROLLSPY_LINE_INSET_PX'));
    expect(SCROLL_END_EPSILON_PX).toBe(constant('SCROLL_END_EPSILON_PX'));
    expect(NAV_ROW_CLEARANCE_PX).toBe(constant('NAV_ROW_CLEARANCE_PX'));
  });
});

describe('the pane scroll geometry', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('stacks offsets from heights alone, and waits for every height', () => {
    expect(stackedOffsets([100, 200, 50], 3, 4, 60)).toEqual([4, 164, 424]);
    expect(stackedOffsets([100, undefined, 50], 3, 4, 60)).toBeNull();
  });

  it('elects the last section passing the reading line, and the last one at the scroll end', () => {
    const offsets = [0, 400, 800, 1200];
    const extent = (offset) => ({ offset, viewport: 500, content: 1500 });
    expect(spiedSectionAt(ids, offsets, extent(400 - SCROLLSPY_LINE_INSET_PX - 1))).toBe('a');
    expect(spiedSectionAt(ids, offsets, extent(400 - SCROLLSPY_LINE_INSET_PX))).toBe('b');
    expect(spiedSectionAt(ids, offsets, extent(1000 - SCROLL_END_EPSILON_PX))).toBe('d');
    // An unmeasured pane is not at its end.
    expect(spiedSectionAt(ids, offsets, { offset: 0, viewport: 0, content: 0 })).toBe('a');
    expect(spiedSectionAt(ids, offsets, { offset: 0, viewport: 500, content: 0 })).toBe('a');
  });

  it('parks a jump just under the pane top', () => {
    expect(sectionJumpOffset(500)).toBe(500 - SECTION_JUMP_INSET_PX);
  });

  it('scrolls the nav only as far as keeps the elected row clear of its edges', () => {
    const nav = { offset: 100, viewport: 300, content: 900 };
    expect(navRevealOffset({ top: 110, height: 50 }, nav)).toBe(110 - NAV_ROW_CLEARANCE_PX);
    expect(navRevealOffset({ top: 400, height: 50 }, nav)).toBe(
      400 + 50 - 300 + NAV_ROW_CLEARANCE_PX
    );
    expect(navRevealOffset({ top: 880, height: 50 }, nav)).toBe(600);
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
  });
});
describe('Parent Center in the wide shell', () => {
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
