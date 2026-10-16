import {
  caller,
  records,
  root,
  host,
  mount,
  checkedSwitch,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { hubSessions, sectionVisits } from './rsd-native-settings-hub-mocks.mjs';
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
import { heldBrushLabel as brushLabel } from './rsd-native-toolbar-fixture.mjs';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Animated } from 'react-native';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { RsdSettingsHub } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsHub.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
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
  WHATS_NEW_COPY,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import { WHATS_NEW_STAMP } from '../../../experiments/native-architecture/src/settings/whatsNewStamp.ts';
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
  const listed = NATIVE_SETTINGS_SECTIONS;
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
    `Install, ${SECTION_SUBTITLES.setup}`,
    `Feedback, ${SECTION_SUBTITLES.feedback}`,
    `${WHATS_NEW}, ${SECTION_SUBTITLES.whatsnew}`,
    `About, Version ${WHATS_NEW_STAMP}`,
  ]);
  await openSettingsSection('Accessibility');
  const settingsName = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/SettingsModal.svelte'),
    'utf8'
  ).match(/aria-label="([^"]+)"/)[1];
  expect(host.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe(settingsName);
  expect(host.querySelector('[role="heading"]').textContent).toBe('Accessibility');
  expect(hubRows()).toEqual([]);
  await click('Back');
  expect(hubRows()).toHaveLength(listed.length);
});

it('dots every unseen section and clears each dot when that section is visited', async () => {
  storedSettings({
    parentPolicies: {
      ai: 'never',
      imageReport: 'never',
      externalLinks: 'never',
      feedback: 'never',
      parentCenter: 'never',
    },
  });
  sectionVisits.snapshot = '{}';
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  expect(dottedRows()).toHaveLength(NATIVE_SETTINGS_SECTIONS.length);
  for (const { id, label, contentStamp } of NATIVE_SETTINGS_SECTIONS) {
    await act(async () => hubRow(label).click());
    expect(JSON.parse(sectionVisits.snapshot)[id], id).toBe(contentStamp);
    await click('Back');
    expect(hubRow(label).getAttribute('aria-label'), id).not.toMatch(/, new$/);
  }
  expect(dottedRows()).toEqual([]);
  expect(sectionVisits.write).toHaveBeenCalledTimes(NATIVE_SETTINGS_SECTIONS.length);
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

// Shipping's setResolvedTheme: a quick toggle writes System when the device already shows the
// look it asks for, so a light-device parent who turns Night Mode on and back off is on System.
it('writes the loosest preference from the Night Mode switch', async () => {
  records.scheme = 'light';
  const settings = storedSettings({ appearance: 'system' });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await click('Night Mode');
  expect(settings.stored().appearance).toBe('dark');
  await click('Night Mode');
  checkedSwitch(button('Night Mode'), false);
  expect(settings.stored().appearance).toBe('system');
});

it('lets a dark device take Night Mode back to System from a light pin', async () => {
  records.scheme = 'dark';
  const settings = storedSettings({ appearance: 'light' });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  checkedSwitch(button('Night Mode'), false);
  await click('Night Mode');
  checkedSwitch(button('Night Mode'), true);
  expect(settings.stored().appearance).toBe('system');
});

// Shipping stores each choice synchronously, so neither switch dims or refuses for a save.
it('keeps both hub switches live while a hub choice saves, and writes a tap made meanwhile', async () => {
  const settings = storedSettings({ soundEnabled: true });
  const finishNight = holdNextWrite(settings.storage);
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await click('Night Mode');
  expect(settings.storage.write).toHaveBeenCalledOnce();
  for (const label of ['Night Mode', 'Sound']) expect(button(label).disabled, label).toBe(false);
  await act(async () => button('Sound').click());
  checkedSwitch(button('Sound'), false);
  await finishNight();
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

it('drills into Feedback from its hub row, as into every other section', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await act(async () => hubRow('Feedback').click());
  expect(caller.screen.closeSettings).not.toHaveBeenCalled();
  expect(caller.product.feedback.state.open).toBe(false);
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
  expect(host.querySelector('[data-native-modal="Send Feedback"]')).toBeNull();
  await click('Back');
  expect(hubRow('Feedback')).toBeDefined();
});

it('drills into an AI Art page from its hub row', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('AI Art');
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
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
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
    const [current, ...earlier] = RELEASE_NOTES;
    expect(host.textContent).toContain(current.dateLabel);
    expect(host.textContent).toContain(current.sections[0].blocks[0].text);
    for (const release of earlier) expect(host.textContent).not.toContain(release.dateLabel);
    expect(host.textContent).toContain(WHATS_NEW_COPY.allReleases);
    expect(JSON.parse(sectionVisits.snapshot).whatsnew).toBe(WHATS_NEW_STAMP);
    await click('Back');
    expect(dottedRows()).toEqual([]);
    expect(sectionVisits.write).toHaveBeenCalledOnce();
    expect(settings.storage.write).not.toHaveBeenCalled();
    await openSettingsSection(WHATS_NEW);
    expect(sectionVisits.write).toHaveBeenCalledOnce();
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
  expect(settings.storage.write).toHaveBeenCalledOnce();
  await click('Back');
  expect(dottedRows()).toHaveLength(1);
  await openSettingsSection(WHATS_NEW);
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
  expect(settings.storage.write).toHaveBeenCalledOnce();
  await act(async () => finishWrite());
  expect(settings.storage.write).toHaveBeenCalledOnce();
  expect(caller.product.sound.settings).toMatchObject({
    reduceMotion: 'reduce',
    whatsNewSeen: null,
  });
  expect(JSON.parse(sectionVisits.snapshot).whatsnew).toBe(WHATS_NEW_STAMP);
  await click('Back');
  expect(dottedRows()).toEqual([]);
});

async function pencilDoubleTap() {
  expect(caller.pencilDoubleTap, 'Pencil double-tap listener').toBeTypeOf('function');
  await act(async () => caller.pencilDoubleTap());
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
  await click('Eraser');
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
  const finishVolume = holdNextWrite(settings.storage);
  const owner = caller.product.sound.owner.settings;
  await act(async () => void owner.setSoundVolume(73));
  expect(settings.storage.write).toHaveBeenCalledOnce();
  await pencilDoubleTap();
  expect(brushLabel()).toBe('Brush: Eraser');
  await finishVolume();
  expect(settings.stored()).toMatchObject({ soundVolume: 73, applePencilSeen: true });
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
  const failPolicy = holdNextWrite(settings.storage);
  let relaxing;
  await act(async () => {
    relaxing = product.setPolicy('feedback', 'session');
  });
  await failPolicy(new Error('disk full'));
  await act(async () => relaxing);
  const feedback = () => product.getState().settings.parentPolicies.feedback;
  expect(feedback()).toBe('always');
  expect(product.getState().settings.saved).toBe(false);
  await pencilDoubleTap();
  expect(settings.stored()).toMatchObject({ applePencilSeen: true });
  expect(settings.stored().parentPolicies.feedback).toBe('always');
  expect(product.getState().settings).toMatchObject({ saved: false, applePencilSeen: true });
  expect(product.getState().settings.message).toContain('Parent Center choices were not saved');
  await act(async () => product.retryParentSave());
  expect(settings.stored().parentPolicies.feedback).toBe('session');
  expect(product.getState().settings.saved).toBe(true);
  expect(feedback()).toBe('session');
});

it('starts the Settings exit without rendering unchanged native drill-in rows again', async () => {
  records.os = 'android';
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  const labels = hubRows()
    .filter((row) => !row.closest('[data-testid="hub-tile"]').querySelector('[role="switch"]'))
    .map((row) => row.getAttribute('aria-label'));
  expect(labels).toHaveLength(NATIVE_SETTINGS_SECTIONS.length - hubSwitches().length);
  const renderedRows = () =>
    Object.fromEntries(
      labels.map((label) => [
        label,
        records.props.filter((props) => props.accessibilityLabel === label).length,
      ])
    );
  const before = renderedRows();
  expect(Object.values(before).every((count) => count > 0)).toBe(true);
  let atStart;
  let finish;
  const parallel = vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
    start(done) {
      atStart = renderedRows();
      animations.forEach((animation) => animation.start());
      finish = () => done({ finished: true });
    },
    stop() {},
  }));
  try {
    await rerender({ settingsOpen: false });
    expect(atStart).toEqual(before);
    expect(renderedRows()).toEqual(before);
    for (const label of ['Night Mode', 'Sound', 'Close'])
      expect(button(label).disabled, label).toBe(true);
    expect(records.props.findLast((props) => props.testID === 'modal-card').pointerEvents).toBe('none');
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
    await act(async () => finish());
    expect(host.querySelector('[data-native-modal="Settings"]')).toBeNull();
  } finally {
    parallel.mockRestore();
  }
});

it('keeps memoized hub rows current for callbacks, summaries, activity dots and theme', async () => {
  let settings;
  const owner = createSoundSettings({ read: async () => null, write: async () => {} }, (state) => {
    settings = state;
  });
  await owner.load();
  const props = nativeSettingsProps(owner, settings);
  const context = { settings, brushes: props.brushState, downloadedBooks: 0, ai: null };
  const initialOpen = vi.fn();
  const latestOpen = vi.fn();
  const hub = (onOpen, downloadedBooks = 0, unseen = false, preference = 'light') =>
    createElement(
      DrawingAppearanceProvider,
      { preference },
      createElement(RsdSettingsHub, {
        sections: NATIVE_SETTINGS_SECTIONS,
        context: { ...context, downloadedBooks },
        toggles: {},
        unseen: () => unseen,
        returnTo: null,
        onOpen,
      })
    );
  try {
    await mount(hub(initialOpen));
    const soundMarkup = hubRow('Sound').querySelector('svg[data-xml]').getAttribute('data-xml');
    const before = records.props.filter((record) => record.testID === 'hub-tile').length;
    expect(before).toBeGreaterThan(0);
    await act(async () => root.render(hub(latestOpen)));
    expect(records.props.filter((record) => record.testID === 'hub-tile')).toHaveLength(before);
    await act(async () => hubRow('Coloring').click());
    expect(initialOpen).not.toHaveBeenCalled();
    expect(latestOpen).toHaveBeenCalledExactlyOnceWith('coloring');
    await act(async () => root.render(hub(latestOpen, 2, true, 'dark')));
    expect(hubRow('Coloring').getAttribute('aria-label')).toBe('Coloring, 2 extra books ready, new');
    expect(dottedRows()).toHaveLength(NATIVE_SETTINGS_SECTIONS.length);
    expect(hubRow('Sound').querySelector('svg[data-xml]').getAttribute('data-xml')).not.toBe(soundMarkup);
  } finally {
    owner.dispose();
  }
});
