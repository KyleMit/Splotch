import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
import { records, root, host, mount, openSettingsSection } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { Animated } from 'react-native';
import { expect, it, vi } from 'vitest';
import { ModalShell } from '../../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx';
import { DialogHeader } from '../../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx';
import { ModalOriginProvider } from '../../../experiments/native-architecture/src/rsdDrawing/modalOrigin.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import { NativeSoundSettingsDialog } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsDialog.tsx';
import { RsdLeaveConfirm } from '../../../experiments/native-architecture/src/rsdDrawing/RsdLeaveConfirm.tsx';
import { RsdParentGateSheet } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateSheet.tsx';
import { RsdAction } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import { blobPath } from '../../../experiments/native-architecture/src/rsdDrawing/blob.ts';
import { MODAL_SCRIM_PLAIN } from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { BrowserBackProvider } from '../../../experiments/native-architecture/src/platform/BrowserBack.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { LEAVE_CONFIRM_COPY } from '../../../experiments/native-architecture/src/product/systemBack.ts';

const TITLE = 'Drawing tools';
const RETIRED_FOOTER_LABELS = [
  'Keep drawing',
  'Back to Settings',
  'Close feedback',
  'Cancel challenge',
  'Back to AI pictures',
  'Back to coloring books',
];

function sheet({ visible = true, size = 'sheet', onBack, onClose = () => {}, onDismiss } = {}) {
  return createElement(
    ModalShell,
    {
      visible,
      label: TITLE,
      size,
      onClose,
      onDismiss,
      header: createElement(DialogHeader, { title: TITLE, titleSize: 'xl', onBack, onClose }),
    },
    createElement(RsdAction, { label: 'Marker', onClick() {} })
  );
}

const dialog = () => host.querySelector('[role="dialog"]');
function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

const surface = () =>
  flat(records.props.findLast((props) => props.testID === 'modal-surface').style);
const modalProps = () => records.props.findLast((props) => 'onRequestClose' in props);

function frameControls() {
  const body = host.querySelector('[data-testid="modal-body"]');
  return [...dialog().querySelectorAll('button')]
    .filter((button) => !body.contains(button))
    .map((button) => button.getAttribute('aria-label'));
}

async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}

function expectNoFooter() {
  for (const label of RETIRED_FOOTER_LABELS)
    expect(host.querySelector(`[aria-label="${label}"]`), label).toBeNull();
}

function labelledTitle() {
  const id = dialog().getAttribute('aria-labelledby');
  expect(id).toBeTruthy();
  return host.querySelector(`[id="${id}"]`);
}

// Each Animated.Value's targets in the order its timings were built.
function timingTargets(timing) {
  const targets = new Map();
  for (const [value, config] of timing.mock.calls) {
    const entry = targets.get(value) ?? { to: [], ms: 0 };
    entry.to.push(Math.round(config.toValue * 1000) / 1000 || 0);
    entry.ms += config.duration;
    targets.set(value, entry);
  }
  return [...targets.values()].map(({ to, ms }) => ({ to, ms: Math.round(ms * 10) / 10 }));
}

it('frames the dialog as a card over the scrim, named by its header title, with no footer', async () => {
  await mount(sheet());
  expect(dialog().getAttribute('aria-modal')).toBe('true');
  expect(dialog().getAttribute('aria-label')).toBe(TITLE);
  const title = labelledTitle();
  expect(title.textContent).toBe(TITLE);
  expect(title.closest('[data-testid="modal-body"]')).toBeNull();
  expect(modalProps()).toMatchObject({
    transparent: true,
    statusBarTranslucent: true,
    navigationBarTranslucent: true,
    animationType: 'none',
  });
  const scrim = records.props.findLast((props) => props.testID === 'modal-scrim');
  expect(Object.assign({}, ...[scrim.style].flat())).toMatchObject({
    backgroundColor: MODAL_SCRIM_PLAIN,
  });
  expect(scrim.pointerEvents).toBe('none');
  expect(host.querySelector('[data-testid="modal-body"] [aria-label="Marker"]')).not.toBeNull();
  expect(frameControls()).toEqual(['Close']);
  const backdrop = records.props.findLast((props) => props.testID === 'modal-backdrop');
  expect(backdrop['aria-hidden']).toBe(true);
  expect(backdrop.onPress).toBeUndefined();
  expectNoFooter();
});

it.each([
  ['sheet', { width: 402, height: 874 }, null, 370, null],
  ['sheet', { width: 375, height: 812 }, { left: 20, right: 0 }, 335, null],
  ['settings', { width: 390, height: 844 }, null, 358, null],
  ['settings', { width: 1366, height: 1024 }, null, 860, 760],
  ['settings', { width: 844, height: 390 }, null, 640, null],
  ['gate', { width: 390, height: 844 }, null, 336, null],
  ['gate', { width: 844, height: 390 }, null, 560, null],
  ['gate', { width: 834, height: 1194 }, null, 420, null],
  ['gate', { width: 1366, height: 1024 }, null, 480, null],
  ['confirm', { width: 1366, height: 1024 }, null, 336, null],
])(
  'sizes a %s card in a %o window (insets %o) to the shipping width',
  async (size, window, insets, width, height) => {
    records.dimensions = { ...window, scale: 1, fontScale: 1 };
    if (insets) records.insets = { top: 0, bottom: 0, ...insets };
    await mount(sheet({ size }));
    expect(surface().width).toBe(width);
    expect(surface().height).toBe(height ?? undefined);
  }
);

it('goes back from the header Back and closes from the header Close, Back first in focus order', async () => {
  const onBack = vi.fn();
  const onClose = vi.fn();
  await mount(sheet({ onBack, onClose }));
  expect(frameControls()).toEqual(['Back', 'Close']);
  await click('Back');
  expect(onBack).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  await click('Close');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();
});

it('sends Escape, the Android Back button and a scrim press to the dialog close', async () => {
  records.os = 'android';
  const onClose = vi.fn();
  const session = { currentDrawing: () => emptyDrawing() };
  await mount(createElement(BrowserBackProvider, { session }, sheet({ onClose })));
  await act(async () => modalProps().onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(records.backListeners.size).toBe(1);
  await act(async () => [...records.backListeners].forEach((listener) => listener()));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(records.exits).toBe(0);
  await act(async () => host.querySelector('[data-testid="modal-backdrop"]').click());
  expect(onClose).toHaveBeenCalledTimes(3);
});

function openerScreen(visible, onDismiss) {
  return createElement(
    ReduceMotionPreferenceProvider,
    { preference: 'system' },
    createElement(
      ModalOriginProvider,
      null,
      createElement(NativeFrame, null, createElement('span', null, 'paper')),
      sheet({ visible, onDismiss })
    )
  );
}

it.each(['ios', 'android'])(
  'flies in from the opening press, flies back toward it, and reports the dismissal once on %s',
  async (os) => {
    records.os = os;
    records.dimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
    const onDismiss = vi.fn();
    const timing = vi.spyOn(Animated, 'timing');
    const parallel = vi.spyOn(Animated, 'parallel');
    try {
      await mount(openerScreen(false, onDismiss));
      const frame = records.props.findLast((props) => props.testID === 'rsd-safe-area-frame');
      expect(
        frame.onStartShouldSetResponderCapture({ nativeEvent: { pageX: 40, pageY: 760 } })
      ).toBe(false);
      await act(async () => root.render(openerScreen(true, onDismiss)));
      expect(timingTargets(timing)).toEqual([
        { to: [1], ms: 200 },
        { to: [-169.6, 0, 0, 0], ms: 360 },
        { to: [381.6, 0, 0, 0], ms: 360 },
        { to: [0.2, 1.032, 0.994, 1], ms: 360 },
        { to: [0.5, 1], ms: 136.8 },
      ]);
      timing.mockClear();
      let finishExit;
      parallel.mockImplementationOnce((animations) => ({
        start(done) {
          animations.forEach((animation) => animation.start());
          finishExit = () => done({ finished: true });
        },
        stop() {},
      }));
      await act(async () => root.render(openerScreen(false, onDismiss)));
      expect(timingTargets(timing)).toEqual([
        { to: [0], ms: 200 },
        { to: [-112], ms: 200 },
        { to: [252], ms: 200 },
        { to: [0.4], ms: 200 },
        { to: [0], ms: 200 },
      ]);
      expect(dialog()).not.toBeNull();
      expect(onDismiss).not.toHaveBeenCalled();
      await act(async () => finishExit());
      expect(dialog()).toBeNull();
      expect(onDismiss).toHaveBeenCalledOnce();
    } finally {
      timing.mockRestore();
      parallel.mockRestore();
    }
  }
);

function motionScreen(open) {
  return createElement(
    ReduceMotionPreferenceProvider,
    { preference: 'system' },
    open ? sheet() : null
  );
}

async function openedUnder(reduced) {
  records.reduceMotion = reduced;
  const timing = vi.spyOn(Animated, 'timing');
  try {
    await mount(motionScreen(false));
    await act(async () => root.render(motionScreen(true)));
    return timingTargets(timing);
  } finally {
    timing.mockRestore();
  }
}

it('flies a dialog that mounts as it opens when the device allows motion', async () => {
  expect(await openedUnder(false)).toContainEqual({ to: [0.2, 1.032, 0.994, 1], ms: 360 });
});

it('fades a dialog that mounts as it opens under the device Reduce Motion', async () => {
  expect(await openedUnder(true)).toEqual([
    { to: [1], ms: 200 },
    { to: [1], ms: 200 },
  ]);
});

it.each(['light', 'dark'])(
  'draws the Back and Close blobs from the shipping elliptical radii in %s',
  async (theme) => {
    await mount(
      createElement(DrawingAppearanceProvider, { preference: theme }, sheet({ onBack() {} }))
    );
    const palette = DRAWING_THEMES[theme];
    const back = host.querySelector('[aria-label="Back"] path');
    expect(back.getAttribute('d')).toBe(blobPath('radiusBlob1', 48, 48));
    expect(back.getAttribute('d')).toContain('A27.84 21.6 ');
    expect(back.getAttribute('fill')).toBe(palette.brandWash);
    expect(back.getAttribute('stroke')).toBeNull();
    const close = host.querySelector('[aria-label="Close"] path');
    expect(close.getAttribute('d')).toBe(blobPath('radiusBlob2', 48, 48, 1));
    expect(close.getAttribute('fill')).toBe(palette.surface);
    expect(close.getAttribute('stroke')).toBe(palette.borderWarm);
    expect(close.getAttribute('stroke-width')).toBe('2');
  }
);

async function settingsDialog(onClose) {
  let current;
  const owner = createSoundSettings({ read: async () => null, write: async () => {} }, (state) => {
    current = state;
  });
  await owner.load();
  await mount(
    createElement(NativeSoundSettingsDialog, { ...nativeSettingsProps(owner, current), onClose })
  );
  return () => owner.dispose();
}

it('heads the Settings hub with Settings and Close, and a section with Back to the hub', async () => {
  const onClose = vi.fn();
  const dispose = await settingsDialog(onClose);
  try {
    expect(labelledTitle().textContent).toBe('Settings');
    expect(frameControls()).toEqual(['Close']);
    expectNoFooter();
    await openSettingsSection('Sound');
    expect(labelledTitle().textContent).toBe('Sound');
    expect(frameControls()).toEqual(['Back', 'Close']);
    expectNoFooter();
    await act(async () => modalProps().onRequestClose());
    expect(labelledTitle().textContent).toBe('Settings');
    expect(onClose).not.toHaveBeenCalled();
    await openSettingsSection('Sound');
    await click('Back');
    expect(labelledTitle().textContent).toBe('Settings');
    expect(host.querySelector('[role="list"] button[aria-label^="Sound, "]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await click('Close');
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    dispose();
  }
});

it('floats only the Close on the parental gate card, named by the heading in its body', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const owner = {
    gate: { dismiss: vi.fn(), press: vi.fn() },
    retargetParentCenter: vi.fn(),
  };
  const state = {
    open: true,
    feature: 'ai',
    x: 3,
    y: 4,
    input: '',
    locked: false,
    shaking: false,
    message: '',
    announcement: '',
    announcementId: 0,
  };
  await mount(createElement(RsdParentGateSheet, { owner, state }));
  const title = labelledTitle();
  expect(title.textContent).toBe('Grown-ups only');
  expect(title.closest('[data-testid="modal-body"]')).not.toBeNull();
  expect(frameControls()).toEqual(['Close']);
  expectNoFooter();
  expect(surface().width).toBe(336);
  await click('Close');
  expect(owner.gate.dismiss).toHaveBeenCalledOnce();
});

it('asks Leave Splotch? on a confirm card whose two choices are its only way out', async () => {
  records.os = 'android';
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const session = { currentDrawing: () => ({ ...emptyDrawing(), strokes: [{}] }) };
  await mount(createElement(BrowserBackProvider, { session }, createElement(RsdLeaveConfirm)));
  expect(dialog()).toBeNull();
  await act(async () => [...records.backListeners].forEach((listener) => listener()));
  expect(labelledTitle().textContent).toBe(LEAVE_CONFIRM_COPY.title);
  expect(frameControls()).toEqual([]);
  expect(host.querySelector('[aria-label="Close"]')).toBeNull();
  expect(surface().width).toBe(336);
  await click(LEAVE_CONFIRM_COPY.stay);
  expect(dialog()).toBeNull();
  expect(records.exits).toBe(0);
});

// The next Animated.parallel, the exit, holds its completion until the test releases it.
function holdNextExit() {
  const parallel = vi.spyOn(Animated, 'parallel');
  const held = {};
  parallel.mockImplementationOnce((animations) => ({
    start(done) {
      animations.forEach((animation) => animation.start());
      held.finish = () => done({ finished: true });
    },
    stop() {},
  }));
  return held;
}

it('takes no action from a card that is leaving', async () => {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const leaving = (visible) =>
    createElement(
      ModalShell,
      {
        visible,
        label: TITLE,
        size: 'sheet',
        onClose,
        header: createElement(DialogHeader, { title: TITLE, titleSize: 'xl', onClose }),
      },
      createElement(RsdAction, { label: 'Marker', onClick: onAction })
    );
  await mount(leaving(true));
  const held = holdNextExit();
  try {
    await act(async () => root.render(leaving(false)));
    expect(dialog()).not.toBeNull();
    expect(records.props.findLast((props) => props.testID === 'modal-card').pointerEvents).toBe(
      'none'
    );
    for (const label of ['Marker', 'Close']) {
      const control = host.querySelector(`[aria-label="${label}"]`);
      expect(control.disabled, label).toBe(true);
      await act(async () => control.click());
    }
    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => held.finish());
    expect(dialog()).toBeNull();
  } finally {
    vi.restoreAllMocks();
  }
});

it('cannot leave the app from the Leave Splotch? card once Keep drawing has closed it', async () => {
  records.os = 'android';
  const session = { currentDrawing: () => ({ ...emptyDrawing(), strokes: [{}] }) };
  await mount(createElement(BrowserBackProvider, { session }, createElement(RsdLeaveConfirm)));
  await act(async () => [...records.backListeners].forEach((listener) => listener()));
  const held = holdNextExit();
  try {
    await click(LEAVE_CONFIRM_COPY.stay);
    expect(dialog()).not.toBeNull();
    const leave = host.querySelector(`[aria-label="${LEAVE_CONFIRM_COPY.leave}"]`);
    expect(leave.disabled).toBe(true);
    await act(async () => leave.click());
    expect(records.exits).toBe(0);
    await act(async () => held.finish());
    expect(dialog()).toBeNull();
    expect(records.exits).toBe(0);
  } finally {
    vi.restoreAllMocks();
  }
});
