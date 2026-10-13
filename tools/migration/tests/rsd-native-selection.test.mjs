import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
import {
  caller,
  records,
  root,
  host,
  mount,
  checkedRadio,
  visibleSelection,
  assertDisabledBoundary,
  createPickerCaller,
  openSettingsSection,
} from './rsd-native-selection-host.mjs';
import { act, createElement, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { html } from 'react-strict-dom';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { NativeFrame } from '../../../experiments/native-architecture/src/rsdDrawing/NativeFrame.tsx';
import {
  RsdAction,
  RsdPaintAction,
  styles,
} from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import {
  NativeDialog,
  NativeSoundSettingsDialog,
} from '../../../experiments/native-architecture/src/rsdDrawing/NativeDialog.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import {
  DRAWING_SCALE,
  TOUCH_TARGET,
} from '../../../experiments/native-architecture/src/drawing/theme.ts';
it('uses the released native renderer for checked radio state and selected treatment', async () => {
  await mount(
    createElement(RsdAction, {
      label: 'Blue paint',
      selection: 'radio',
      selected: true,
      onClick() {},
    })
  );
  const node = host.querySelector('button');
  checkedRadio(node);
  visibleSelection(node);
  const selected = node.dataset.nativeBackground;
  await act(async () =>
    root.render(
      createElement(RsdAction, {
        label: 'Blue paint',
        selection: 'radio',
        selected: false,
        onClick() {},
      })
    )
  );
  expect(host.querySelector('button').dataset.checked).toBe('false');
  expect(host.querySelector('button').dataset.nativeBackground).not.toBe(selected);
});
it('maps sound switch and preserves actual disabled input suppression', async () => {
  const clicked = vi.fn();
  await mount(
    createElement(RsdAction, {
      label: 'Sound',
      selection: 'switch',
      selected: true,
      disabled: true,
      onClick: clicked,
    })
  );
  const node = host.querySelector('button');
  expect(node.getAttribute('role')).toBe('switch');
  expect(node.dataset.checked).toBe('true');
  await act(async () => node.click());
  expect(clicked).not.toHaveBeenCalled();
});
it('demonstrates aria-pressed-only and missing selected-style negatives through the released renderer', async () => {
  await mount(
    createElement(
      html.button,
      { role: 'radio', 'aria-pressed': true, style: styles.action, onClick() {} },
      'Old selection'
    )
  );
  expect(() => checkedRadio(host.querySelector('button'))).toThrow('Missing native checked radio');
  const ordinary = host.querySelector('button').dataset.nativeBackground;
  await act(async () =>
    root.render(
      createElement(
        html.button,
        { role: 'radio', 'aria-checked': true, style: styles.action, onClick() {} },
        'Missing treatment'
      )
    )
  );
  const withoutSelectionStyle = host.querySelector('button');
  checkedRadio(withoutSelectionStyle);
  expect(withoutSelectionStyle.dataset.nativeBackground).toBe(ordinary);

  await act(async () =>
    root.render(
      createElement(RsdAction, {
        label: 'Selected',
        selection: 'radio',
        selected: true,
        onClick() {},
      })
    )
  );
  expect(host.querySelector('button').dataset.nativeBackground).not.toBe(ordinary);
});
it('keeps one selected choice after real control input in a named group', async () => {
  function Group() {
    const [selected, setSelected] = useState('Blue');
    return createElement(
      html.div,
      { role: 'radiogroup', 'aria-label': 'Paint colors' },
      ['Blue', 'Red'].map((color) =>
        createElement(RsdAction, {
          key: color,
          label: color,
          selection: 'radio',
          selected: selected === color,
          onClick: () => setSelected(color),
        })
      )
    );
  }
  await mount(createElement(Group));
  expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('Paint colors');
  await act(async () =>
    [...host.querySelectorAll('button')].find((node) => node.textContent === 'Red').click()
  );
  const selected = [...host.querySelectorAll('button')].filter(
    (node) => node.dataset.checked === 'true'
  );
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toBe('Red');
});

it('propagates disabled true and false through the released native renderer without changing identity', async () => {
  const onClick = vi.fn();
  let mountedNode;
  for (const disabled of [true, false, true, false]) {
    const element = createElement(RsdAction, {
      label: 'Transition action',
      disabled,
      onClick,
    });
    if (!root) await mount(element);
    else await act(async () => root.render(element));
    const props = records.props.findLast(
      (entry) => entry.accessibilityLabel === 'Transition action'
    );
    assertDisabledBoundary(props, disabled);
    const node = host.querySelector('button');
    mountedNode ??= node;
    expect(node).toBe(mountedNode);
    expect(node.getAttribute('aria-label')).toBe('Transition action');
    const before = onClick.mock.calls.length;
    await act(async () => node.click());
    expect(onClick.mock.calls.length).toBe(before + (disabled ? 0 : 1));
  }
});

it('rejects omitted false state from the old disabled-only path through the released renderer', async () => {
  for (const disabled of [true, false]) {
    const element = createElement(
      html.button,
      { role: 'radio', 'aria-label': 'Old transition', 'aria-checked': false, disabled },
      'Old transition'
    );
    if (!root) await mount(element);
    else await act(async () => root.render(element));
  }
  const props = records.props.findLast((entry) => entry.accessibilityLabel === 'Old transition');
  expect(() => assertDisabledBoundary(props, false)).toThrow(
    'Missing explicit native disabled boolean'
  );
});

function blueSwatch(props) {
  return createElement(RsdPaintAction, {
    color: 'Blue',
    size: TOUCH_TARGET,
    disabled: false,
    ...props,
  });
}

it('renders paint as a round swatch with its name, Selection Ring, actual color and owned touch size', async () => {
  const onClick = vi.fn();
  const swatchProps = () =>
    records.props.findLast((entry) => entry.accessibilityLabel === 'Blue paint');
  await mount(blueSwatch({ selected: true, onClick }));
  const props = swatchProps();
  assertDisabledBoundary(props, false);
  expect(props.accessibilityState.checked).toBe(true);
  expect(props.style.minWidth).toBe(TOUCH_TARGET);
  expect(props.style.minHeight).toBe(TOUCH_TARGET);
  expect(props.style.borderRadius).toBe(TOUCH_TARGET / 2);
  expect(props.style.borderColor).toBe('#62A2E9');
  const selectedNode = host.querySelector('button');
  expect(selectedNode.getAttribute('role')).toBe('radio');
  expect(selectedNode.getAttribute('aria-label')).toBe('Blue paint');
  expect(selectedNode.textContent).toBe('');
  expect(records.props.some((entry) => entry.style?.backgroundColor === '#62A2E9')).toBe(true);
  await act(async () => selectedNode.click());
  expect(onClick).toHaveBeenCalledOnce();
  await act(async () => root.render(blueSwatch({ selected: false, onClick })));
  const unselectedNode = host.querySelector('button');
  expect(unselectedNode).toBe(selectedNode);
  expect(unselectedNode.dataset.checked).toBe('false');
  expect(swatchProps().style.borderColor).toBe('transparent');
  await act(async () => root.render(blueSwatch({ selected: true, onClick })));
  expect(swatchProps().style.borderColor).toBe('#62A2E9');
});

it('keeps actual failed-write recovery copy live inside the Settings modal and clears it after retry', async () => {
  let current;
  let refresh = () => {};
  const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
  const owner = createSoundSettings({ read: async () => null, write }, (state) => {
    current = state;
    refresh();
  });
  await owner.load();
  function Settings() {
    const [, update] = useState(0);
    refresh = () => update((value) => value + 1);
    return createElement(NativeSoundSettingsDialog, nativeSettingsProps(owner, current));
  }
  try {
    await mount(createElement(Settings));
    await openSettingsSection('Sound');
    await act(async () => host.querySelector('[aria-label="Drawing sound on"]').click());
    const modal = host.querySelector('[data-native-modal="Sound"]');
    expect(modal).not.toBeNull();
    const close = modal.querySelector('[data-testid="rsd-dialog-footer"] button:last-child');
    expect(close.getAttribute('aria-label')).toBe('Keep drawing');
    expect(close.closest('section')).toBeNull();
    expect(modal.textContent).toContain('could not be saved');
    expect(modal.querySelector('[aria-live="polite"]').textContent).toBe(current.message);
    expect(write).toHaveBeenCalledOnce();
    await act(async () => host.querySelector('[aria-label="Try saving settings again"]').click());
    expect(modal.textContent).not.toContain('could not be saved');
    expect(write).toHaveBeenCalledTimes(2);
  } finally {
    owner.dispose();
  }
});

it('keeps the caller close action outside the bounded options viewport with ordinary Modal lifecycle', async () => {
  const onClose = vi.fn(),
    onDismiss = vi.fn();
  await mount(
    createElement(
      NativeDialog,
      {
        visible: true,
        label: 'Drawing tools',
        onClose,
        onDismiss,
        footer: createElement(RsdAction, {
          label: 'Keep drawing',
          disabled: false,
          onClick: onClose,
        }),
      },
      createElement(RsdAction, { label: 'Marker', onClick() {} })
    )
  );
  const viewport = records.viewports.at(-1);
  expect(viewport.testID).toBe('rsd-dialog-viewport');
  expect(viewport.accessibilityLabel).toBe('Drawing tools options');
  expect(viewport.style.flex).toBe(1);
  expect(viewport.style.minHeight).toBe(0);
  expect(viewport.removeClippedSubviews).toBe(false);
  const modal = records.props.find((entry) => entry.onRequestClose === onClose);
  expect(modal.onDismiss).toBe(onDismiss);
  expect(modal.visible).toBe(true);
  expect(modal.animationType).toBe('none');
  const options = host.querySelector('[data-testid="rsd-dialog-viewport"]');
  const footer = host.querySelector('[data-testid="rsd-dialog-footer"]');
  const close = footer.querySelector('[aria-label="Keep drawing"]');
  expect(options.querySelector('[aria-label="Marker"]')).not.toBeNull();
  expect(options.querySelector('[aria-label="Keep drawing"]')).toBeNull();
  expect(footer.closest('section')).toBeNull();
  expect(host.querySelectorAll('[aria-label="Keep drawing"]')).toHaveLength(1);
  const footerProps = records.props.find((entry) => entry.testID === 'rsd-dialog-footer');
  expect(footerProps.style.flexShrink).toBe(0);
  expect(footerProps.style.padding).toBe(DRAWING_SCALE.space4);
  expect(footerProps.style.padding).toBeGreaterThan(0);
  const closeProps = records.props.findLast((entry) => entry.accessibilityLabel === 'Keep drawing');
  expect(closeProps.style.minWidth).toBe(TOUCH_TARGET);
  expect(closeProps.style.minHeight).toBe(TOUCH_TARGET);
  await act(async () => close.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it('retains the caller-owned pictures close guard in the fixed footer', async () => {
  const onClose = vi.fn();
  const element = (busy) =>
    createElement(
      NativeDialog,
      {
        visible: true,
        label: 'Your pictures',
        onClose,
        footer: createElement(RsdAction, { label: 'Close', disabled: busy, onClick: onClose }),
      },
      createElement('span', null, 'Pictures')
    );
  await mount(element(true));
  const close = host.querySelector('[data-testid="rsd-dialog-footer"] button');
  expect(close.disabled).toBe(true);
  await act(async () => close.click());
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => root.render(element(false)));
  expect(host.querySelector('[data-testid="rsd-dialog-footer"] button')).toBe(close);
  expect(close.disabled).toBe(false);
  await act(async () => close.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it('propagates paint availability both ways without losing its selected color or accessible name', async () => {
  let mountedNode;
  for (const disabled of [false, true, false]) {
    const element = blueSwatch({ selected: true, disabled, onClick() {} });
    if (!root) await mount(element);
    else await act(async () => root.render(element));
    const props = records.props.findLast((entry) => entry.accessibilityLabel === 'Blue paint');
    assertDisabledBoundary(props, disabled);
    expect(props.accessibilityState.checked).toBe(true);
    const node = host.querySelector('button');
    mountedNode ??= node;
    expect(node).toBe(mountedNode);
    expect(node.getAttribute('aria-label')).toBe('Blue paint');
  }
});

it('owns fresh root and modal inset frames with all system edges inside each window', async () => {
  await mount(
    createElement(
      NativeFrame,
      null,
      createElement('span', { 'data-root-paper': true }, 'Paper'),
      createElement(
        NativeDialog,
        {
          visible: true,
          label: 'Drawing tools',
          onClose() {},
          footer: createElement(RsdAction, { label: 'Keep drawing', onClick() {} }),
        },
        createElement(RsdAction, { label: 'Marker', onClick() {} })
      )
    )
  );
  const providers = host.querySelectorAll('[data-safe-area-kind="provider"]');
  expect(providers).toHaveLength(2);
  const frames = records.props.filter((entry) => entry.testID === 'rsd-safe-area-frame');
  expect(frames).toHaveLength(2);
  for (const frame of frames) {
    expect(frame.mode).toBe('padding');
    expect(frame.edges).toEqual(['top', 'right', 'bottom', 'left']);
    expect(frame.style.flex).toBe(1);
  }
  const close = host.querySelector('[aria-label="Keep drawing"]');
  const frame = close.closest('[data-testid="rsd-safe-area-frame"]');
  expect(frame.parentElement.dataset.safeAreaKind).toBe('provider');
  expect(frame.contains(host.querySelector('[data-root-paper]'))).toBe(false);
  expect(close.closest('[data-testid="rsd-dialog-viewport"]')).toBeNull();
  expect(
    records.props.findLast((entry) => entry.testID === 'rsd-dialog-footer').style.padding
  ).toBe(DRAWING_SCALE.space4);
});

it('mounts the shared color picker outside Paint colors and writes through the existing settings owner', async () => {
  let refresh = () => {};
  const { owner, open, close } = createPickerCaller(() => refresh());
  await owner.load();
  function Screen() {
    const [, update] = useState(0);
    refresh = () => update((value) => value + 1);
    return createElement(RsdDrawingScreen);
  }
  try {
    await mount(createElement(Screen));
    const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
    let more = host.querySelector('[aria-label="More colors"]');
    expect(more.disabled).toBe(true);
    expect(more.closest('[role="radiogroup"]')).toBeNull();
    await act(async () => {
      caller.screen.disabled = false;
      await owner.setColor('#123456');
    });
    setColor.mockClear();
    more = host.querySelector('[aria-label="More colors"]');
    expect(more.disabled).toBe(false);
    await act(async () => more.click());
    expect(open).toHaveBeenCalledOnce();
    const picker = host.querySelector('[aria-label="Color picker"]');
    expect(picker).not.toBeNull();
    expect(host.querySelector('[aria-label="More colors"]').disabled).toBe(true);
    await act(async () => picker.querySelector('[aria-label="Use color"]').click());
    expect(setColor).toHaveBeenCalledExactlyOnceWith('#123456');
    expect(caller.sound.settings.selectedColor).toBe('#123456');
    expect(close).toHaveBeenCalledOnce();
    expect(setColor.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(host.querySelector('[aria-label="Color picker"]')).toBeNull();
    await act(async () => host.querySelector('[aria-label="More colors"]').click());
    await act(async () => {
      const keep = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'Keep drawing'
      );
      keep.click();
    });
    expect(close).toHaveBeenCalledTimes(2);
    expect(setColor).toHaveBeenCalledExactlyOnceWith('#123456');
    expect(caller.sound.settings.selectedColor).toBe('#123456');
  } finally {
    owner.dispose();
  }
});

it.each([
  ['coloringBookEnabled', 'Coloring', 'Coloring book on', 'Coloring book off'],
  ['undoButtonEnabled', 'Tool Drawer', 'Show Undo button', 'Show Undo button'],
  [
    'strokeWidthControlEnabled',
    'Tool Drawer',
    'Show drawing width controls',
    'Show drawing width controls',
  ],
])(
  'persists %s through the released native switch without a parent challenge',
  async (property, section, enabledLabel, disabledLabel) => {
    let current;
    let refresh = () => {};
    const write = vi.fn(async () => {});
    const owner = createSoundSettings({ read: async () => null, write }, (state) => {
      current = state;
      refresh();
    });
    await owner.load();
    function Settings() {
      const [, update] = useState(0);
      refresh = () => update((value) => value + 1);
      return createElement(NativeSoundSettingsDialog, nativeSettingsProps(owner, current));
    }
    try {
      await mount(createElement(Settings));
      await openSettingsSection(section);
      const on = host.querySelector(`[aria-label="${enabledLabel}"]`);
      expect(on.getAttribute('role')).toBe('switch');
      expect(on.dataset.checked).toBe('true');
      await act(async () => on.click());
      expect(host.querySelector(`[aria-label="${disabledLabel}"]`).dataset.checked).toBe('false');
      expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
        version: 11,
        [property]: false,
        aiEnabled: false,
      });
      expect(host.textContent).not.toContain('Grown-ups only');
    } finally {
      owner.dispose();
    }
  }
);

it('turns Auto-Save on Delete on through the released native switch, off by default', async () => {
  let current;
  let refresh = () => {};
  const write = vi.fn(async () => {});
  const owner = createSoundSettings({ read: async () => null, write }, (state) => {
    current = state;
    refresh();
  });
  await owner.load();
  function Settings() {
    const [, update] = useState(0);
    refresh = () => update((value) => value + 1);
    return createElement(NativeSoundSettingsDialog, nativeSettingsProps(owner, current));
  }
  try {
    await mount(createElement(Settings));
    await openSettingsSection('Saving');
    const toggle = host.querySelector('[aria-label="Auto-Save on Delete"]');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.dataset.checked).toBe('false');
    expect(host.textContent).toContain('Saves the current drawing each time the page is cleared');
    await act(async () => toggle.click());
    expect(host.querySelector('[aria-label="Auto-Save on Delete"]').dataset.checked).toBe('true');
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      version: 11,
      saveOnDeleteEnabled: true,
    });
  } finally {
    owner.dispose();
  }
});
