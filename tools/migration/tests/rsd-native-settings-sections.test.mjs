import {
  caller,
  records,
  root,
  host,
  mount,
  checkedSwitch,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { hubSessions } from './rsd-native-settings-hub-mocks.mjs';
import { solveParentGate } from './rsd-parent-gate-keypad.mjs';
import {
  button,
  click,
  drawingScreen,
  dottedRows,
  hubRow,
  hubRows,
  hubSwitches,
  rerender,
  storedSettings,
} from './rsd-native-settings-fixture.mjs';
import { act, createElement } from 'react';
import { Animated } from 'react-native';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { FLY_IN_TRANSFORM } from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import {
  REDUCE_MOTION_HELP,
  REDUCE_MOTION_LABEL,
} from '../../../experiments/native-architecture/src/settings/reduceMotion.ts';
import {
  NATIVE_SETTINGS_SECTIONS,
  SECTION_SUBTITLES,
} from '../../../experiments/native-architecture/src/settings/settingsSections.ts';
import { SETTINGS_ACTIVITY_DOTS_START_SESSION } from '../../../experiments/native-architecture/src/settings/settingsSessions.ts';
import {
  RELEASE_NOTES,
  WHATS_NEW_STAMP,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import {
  PENCIL_ERASER_HELP,
  PENCIL_ERASER_LABEL,
} from '../../../experiments/native-architecture/src/settings/pencilEraser.ts';

const WHATS_NEW = "What's New";
// The Color Picker flies in through the shipping overshoot keyframe, or fades under Reduce Motion.
async function openColorPicker() {
  const timing = vi.spyOn(Animated, 'timing');
  try {
    await rerender({ settingsOpen: false, colorPickerOpen: true });
    expect(host.querySelector('[aria-label="Color Picker"]')).not.toBeNull();
    const overshoot = FLY_IN_TRANSFORM.find((frame) => frame.scale > 1).scale;
    return timing.mock.calls.some(([, config]) => config.toValue === overshoot) ? 'fly' : 'fade';
  } finally {
    timing.mockRestore();
  }
}

it('lists every shipping section in order with its icon tile and shipping status line', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  const listed = NATIVE_SETTINGS_SECTIONS.filter(({ id }) => id !== 'setup');
  expect(hubRows().map((row) => row.getAttribute('aria-label').split(', ')[0])).toEqual(
    listed.map(({ label }) => label)
  );
  expect(hubRows().map((row) => row.getAttribute('aria-label'))).toEqual([
    'Appearance, Night Mode · portrait lock',
    'Sound, Muted',
    `Tool Drawer, ${SECTION_SUBTITLES.allToolsShowing}`,
    `Accessibility, ${SECTION_SUBTITLES.accessibility}`,
    'Coloring, 0 extra books ready',
    'AI Art, Turned off',
    `Saving, ${SECTION_SUBTITLES.saveOnDeleteOff}`,
    `Parent Center, ${SECTION_SUBTITLES.parentCenter}`,
    `Feedback, ${SECTION_SUBTITLES.feedback}`,
    `${WHATS_NEW}, ${SECTION_SUBTITLES.whatsnew}`,
    `About, Version ${WHATS_NEW_STAMP}`,
  ]);
  await openSettingsSection('Accessibility');
  expect(host.querySelector('[data-native-modal="Accessibility"]')).not.toBeNull();
  expect(hubRows()).toEqual([]);
  await click('Back');
  expect(hubRows()).toHaveLength(listed.length);
});

it('answers Night Mode and Sound with switches on their hub rows and no others', async () => {
  const settings = storedSettings({ soundEnabled: true, soundVolume: 100 });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(hubSwitches().map((node) => node.getAttribute('aria-label'))).toEqual([
    'Night Mode',
    'Sound',
  ]);
  checkedSwitch(button('Night Mode'), false);
  checkedSwitch(button('Sound'), true);
  expect(hubRow('Sound').getAttribute('aria-label')).toBe('Sound, Volume 100%');
  await click('Night Mode');
  checkedSwitch(button('Night Mode'), true);
  expect(settings.stored().appearance).toBe('dark');
  await click('Sound');
  checkedSwitch(button('Sound'), false);
  expect(hubRow('Sound').getAttribute('aria-label')).toBe('Sound, Muted');
  expect(settings.stored()).toMatchObject({ appearance: 'dark', soundEnabled: false });
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
});

it('holds both hub switches while a hub choice saves, so a second tap is never dropped', async () => {
  const settings = storedSettings({ soundEnabled: true });
  const finishNight = holdNextWrite(settings.storage);
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await click('Night Mode');
  expect(caller.product.sound.settings.status).toBe('saving');
  for (const label of ['Night Mode', 'Sound']) expect(button(label).disabled, label).toBe(true);
  await act(async () => button('Sound').click());
  await finishNight();
  for (const label of ['Night Mode', 'Sound']) expect(button(label).disabled, label).toBe(false);
  checkedSwitch(button('Sound'), true);
  await click('Sound');
  expect(settings.storage.write).toHaveBeenCalledTimes(2);
  expect(settings.stored()).toMatchObject({ appearance: 'dark', soundEnabled: false });
});

it('words the Sound and Coloring rows from the volume and the downloaded books', async () => {
  storedSettings({ soundEnabled: true, soundVolume: 25, orientation: 'auto' });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(hubRow('Sound').getAttribute('aria-label')).toBe('Sound, Volume 25%');
  expect(hubRow('Appearance').getAttribute('aria-label')).toBe('Appearance, Night Mode');
  for (const [installed, subtitle] of [
    [['dinosaur'], 'Coloring, 1 extra book ready'],
    [['dinosaur', 'ocean'], 'Coloring, 2 extra books ready'],
  ]) {
    caller.library = {
      ...caller.library,
      state: { ...caller.library.state, installed: installed.map((id) => ({ id })) },
    };
    await rerender({});
    expect(hubRow('Coloring').getAttribute('aria-label')).toBe(subtitle);
  }
});

it('opens Feedback from its hub row in place of Settings', async () => {
  storedSettings();
  drawingScreen({
    closeSettings: vi.fn(() => {
      caller.screen.settingsOpen = false;
    }),
  });
  await mount(createElement(RsdDrawingScreen));
  await act(async () => hubRow('Feedback').click());
  expect(caller.screen.closeSettings).toHaveBeenCalled();
  expect(caller.product.feedback.state.open).toBe(true);
  await rerender({});
  expect(host.querySelector('[data-native-modal="Settings"]')).toBeNull();
  expect(host.querySelector('[data-native-modal="Send Feedback"]')).not.toBeNull();
});

it('drills into an AI Art page from its hub row', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('AI Art');
  expect(host.querySelector('[data-native-modal="AI Art"]')).not.toBeNull();
  await click('Back');
  expect(hubRow('AI Art')).toBeDefined();
});

it('overrides the device with the in-app Reduce Motion switch and follows it again on a match', async () => {
  records.reduceMotion = false;
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  expect(host.textContent).toContain(REDUCE_MOTION_HELP);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), true);
  expect(settings.stored().reduceMotion).toBe('reduce');
  expect(await openColorPicker()).toBe('fade');
  await rerender({ settingsOpen: true, colorPickerOpen: false });
  await openSettingsSection('Accessibility');
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  expect(settings.stored().reduceMotion).toBe('system');
  expect(await openColorPicker()).toBe('fly');
});

it('shows a device Reduce Motion as on, and keeps motion when the parent turns it off', async () => {
  records.reduceMotion = true;
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  checkedSwitch(button(REDUCE_MOTION_LABEL), true);
  await click(REDUCE_MOTION_LABEL);
  checkedSwitch(button(REDUCE_MOTION_LABEL), false);
  expect(settings.stored().reduceMotion).toBe('full');
  expect(await openColorPicker()).toBe('fly');
});

it.each([
  ['never opened', null],
  ['opened for an earlier release', RELEASE_NOTES[1].version],
])(
  "dots What's New while the current release is unseen (%s) and clears it once viewed",
  async (_name, whatsNewSeen) => {
    const settings = storedSettings({ whatsNewSeen });
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    expect(dottedRows()).toEqual([`${WHATS_NEW}, ${SECTION_SUBTITLES.whatsnew}, new`]);
    await act(async () => hubRow(WHATS_NEW).click());
    expect(host.querySelector('[data-native-modal="Updates"]')).not.toBeNull();
    for (const release of RELEASE_NOTES) {
      expect(host.textContent).toContain(release.dateLabel);
      expect(host.textContent).toContain(release.sections[0].blocks[0].text);
    }
    expect(settings.stored().whatsNewSeen).toBe(WHATS_NEW_STAMP);
    await click('Back');
    expect(dottedRows()).toEqual([]);
    expect(settings.storage.write).toHaveBeenCalledOnce();
    await openSettingsSection(WHATS_NEW);
    expect(settings.storage.write).toHaveBeenCalledOnce();
  }
);

it.each([1, SETTINGS_ACTIVITY_DOTS_START_SESSION - 1])(
  "keeps an unseen What's New undotted in session %i, before shipping's dots begin",
  async (sessions) => {
    hubSessions.count = sessions;
    storedSettings({ whatsNewSeen: null });
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    expect(hubRow(WHATS_NEW).getAttribute('aria-label')).toBe(
      `${WHATS_NEW}, ${SECTION_SUBTITLES.whatsnew}`
    );
    expect(dottedRows()).toEqual([]);
  }
);

it("shows no dot once the current release's notes have been seen", async () => {
  const settings = storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(dottedRows()).toEqual([]);
  await openSettingsSection(WHATS_NEW);
  expect(settings.storage.write).not.toHaveBeenCalled();
});

it("keeps the What's New stamp when the section opens while another choice is still saving", async () => {
  const settings = storedSettings({ whatsNewSeen: null });
  let finishWrite;
  settings.storage.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWrite = resolve;
      })
  );
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Accessibility');
  await click(REDUCE_MOTION_LABEL);
  expect(caller.product.sound.settings.status).toBe('saving');
  await click('Back');
  expect(dottedRows()).toHaveLength(1);
  await openSettingsSection(WHATS_NEW);
  expect(host.querySelector('[data-native-modal="Updates"]')).not.toBeNull();
  expect(settings.storage.write).toHaveBeenCalledOnce();
  await act(async () => finishWrite());
  expect(settings.storage.write).toHaveBeenCalledTimes(2);
  expect(settings.stored()).toMatchObject({
    reduceMotion: 'reduce',
    whatsNewSeen: WHATS_NEW_STAMP,
  });
  await click('Back');
  expect(dottedRows()).toEqual([]);
});

async function pencilDoubleTap() {
  expect(caller.pencilDoubleTap, 'Pencil double-tap listener').toBeTypeOf('function');
  await act(async () => caller.pencilDoubleTap());
}

function brushLabel() {
  return host.querySelector('[aria-label^="Brush: "]')?.getAttribute('aria-label');
}

async function pencilScreen(overrides) {
  caller.realScreen = true;
  const settings = storedSettings(overrides);
  await mount(createElement(RsdDrawingScreen));
  if (!brushLabel()) await act(async () => button('Expand controls').click());
  expect(brushLabel()).toBe('Brush: Pen');
  return settings;
}

async function openToolDrawerSettings() {
  await click('Settings');
  await openSettingsSection('Tool Drawer');
}

it('records the first Apple Pencil double-tap, erases with a haptic, then reveals the opt-out', async () => {
  const settings = await pencilScreen();
  await openToolDrawerSettings();
  expect(host.querySelector(`[aria-label="${PENCIL_ERASER_LABEL}"]`)).toBeNull();
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Eraser');
  expect(caller.haptic).toHaveBeenCalledOnce();
  expect(settings.stored()).toMatchObject({ applePencilSeen: true, pencilEraserEnabled: true });
  checkedSwitch(button(PENCIL_ERASER_LABEL), true);
  expect(host.textContent).toContain(PENCIL_ERASER_HELP);
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Pen');
  expect(caller.haptic).toHaveBeenCalledTimes(2);
});

it('keeps the opt-out hidden while the Eraser is hidden from the Tool Drawer', async () => {
  await pencilScreen({ applePencilSeen: true });
  await openToolDrawerSettings();
  button(PENCIL_ERASER_LABEL);
  await click('Show Eraser');
  expect(host.querySelector(`[aria-label="${PENCIL_ERASER_LABEL}"]`)).toBeNull();
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Pen');
  expect(caller.haptic).not.toHaveBeenCalled();
});

it('turns the double-tap off without a toggle or haptic, and keeps that choice on reopen', async () => {
  const settings = await pencilScreen({ applePencilSeen: true });
  await openToolDrawerSettings();
  await click(PENCIL_ERASER_LABEL);
  checkedSwitch(button(PENCIL_ERASER_LABEL), false);
  expect(settings.stored()).toMatchObject({ applePencilSeen: true, pencilEraserEnabled: false });
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Pen');
  expect(caller.haptic).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  const reopened = JSON.stringify(settings.stored());
  caller.settingsStorage = { read: async () => reopened, write: vi.fn(async () => {}) };
  await mount(createElement(RsdDrawingScreen));
  await openToolDrawerSettings();
  checkedSwitch(button(PENCIL_ERASER_LABEL), false);
});

function holdNextWrite(storage) {
  let finish;
  storage.write.mockImplementationOnce(
    (next) =>
      new Promise((resolve, reject) => {
        finish = (error) => (error ? reject(error) : resolve(next));
      })
  );
  return (error) => act(async () => finish(error));
}

it('keeps the first Apple Pencil detection that lands while another choice is saving', async () => {
  const settings = await pencilScreen();
  const finishColor = holdNextWrite(settings.storage);
  const owner = caller.product.sound.owner.settings;
  await act(async () => void owner.setColor('Blue'));
  expect(caller.product.sound.settings.status).toBe('saving');
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Eraser');
  await finishColor();
  expect(settings.stored()).toMatchObject({ selectedColor: 'Blue', applePencilSeen: true });
  expect(caller.product.sound.settings).toMatchObject({ applePencilSeen: true, saved: true });
  await openToolDrawerSettings();
  checkedSwitch(button(PENCIL_ERASER_LABEL), true);
});

it('keeps a failed Parent Center save pending and retryable after the Apple Pencil detection writes', async () => {
  const settings = await pencilScreen();
  const product = caller.product.owner;
  await act(async () => product.openParentCenter());
  await solveParentGate();
  expect(product.getState().parentCenterOpen).toBe(true);
  const failAi = holdNextWrite(settings.storage);
  let enabling;
  await act(async () => {
    enabling = product.setAiEnabled(true);
  });
  await failAi(new Error('disk full'));
  await act(async () => enabling);
  expect(product.getState().settings).toMatchObject({ aiEnabled: false, saved: false });
  await pencilDoubleTap();
  expect(settings.stored()).toMatchObject({ aiEnabled: false, applePencilSeen: true });
  expect(product.getState().settings).toMatchObject({ saved: false, applePencilSeen: true });
  expect(product.getState().settings.message).toContain('Parent Center choices were not saved');
  await act(async () => product.retryParentSave());
  expect(settings.stored()).toMatchObject({ aiEnabled: true, applePencilSeen: true });
  expect(product.getState().settings).toMatchObject({ aiEnabled: true, saved: true });
});
