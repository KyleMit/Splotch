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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { html } from 'react-strict-dom';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  RsdAction,
  styles,
} from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import {
  RsdMoreColorsSwatch,
  RsdPaintAction,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSwatch.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { PALETTE_COLORS } from '../../../web/src/lib/palette.ts';
import { NativeSoundSettingsDialog } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsDialog.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { RsdIconButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';

it.each(['light', 'dark'])(
  'uses shipping paint names at the native boundary in %s',
  async (theme) => {
    const shipping = (file) =>
      readFileSync(join(import.meta.dirname, '../../../web/src/lib/components', file), 'utf8');
    const white = shipping('ColorPalette.svelte').match(
      /label=\{shown === hex \? label : '([^']+)'\}/
    )[1];
    const custom = shipping('ColorSwatch.svelte').match(
      /aria-label=\{flat \? flat.label : '([^']+)'\}/
    )[1];
    expect(shipping('ColorSwatch.svelte')).not.toMatch(/role=|aria-checked=|aria-pressed=/);
    const expected = PALETTE_COLORS.map(({ label }) =>
      theme === 'dark' && label === 'Black' ? white : label
    );
    expected.push(custom);
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(
          html.div,
          null,
          ...PALETTE_COLORS.map(({ label }) =>
            createElement(RsdPaintAction, {
              key: label,
              color: label,
              size: TOUCH_TARGET,
              selected: label === 'Purple',
              disabled: false,
              onClick() {},
            })
          ),
          createElement(RsdMoreColorsSwatch, {
            size: TOUCH_TARGET,
            custom: null,
            disabled: false,
            onClick() {},
          })
        )
      )
    );
    expect(
      [...host.querySelectorAll('button')].map((node) => node.getAttribute('aria-label'))
    ).toEqual(expected);
    for (const label of expected) {
      const props = records.props.findLast((props) => props.accessibilityLabel === label);
      expect(props.role, label).toBe('button');
      expect(props.accessibilityState?.checked, label).toBeUndefined();
      expect(props.accessibilityState?.selected, label).toBeUndefined();
    }
  }
);
it.each(['tile', 'flyout'])('maps a %s pressed button into native selected state', async (skin) => {
  for (const file of ['BrushControl', 'BrushMenu', 'StrokeWidthMenu']) {
    const shipping = readFileSync(
      join(import.meta.dirname, `../../../web/src/lib/components/${file}.svelte`),
      'utf8'
    );
    expect(shipping).toContain('aria-pressed=');
    expect(shipping).not.toContain('role="radio"');
  }
  for (const selected of [true, false]) {
    const props = {
      skin,
      icon: 'brush-pen',
      label: 'Pen',
      selected,
      onPress() {},
      ...(skin === 'tile' ? { size: 60 } : { base: 60, scale: 1, Outline: () => null }),
    };
    if (!root) await mount(createElement(RsdIconButton, props));
    else await act(async () => root.render(createElement(RsdIconButton, props)));
    const native = records.props.findLast((entry) => entry.accessibilityLabel === 'Pen');
    expect(native.role).toBe('button');
    expect(native.accessibilityState?.selected).toBe(selected);
    expect(native.accessibilityState?.checked).toBeUndefined();
  }
});
it('uses the released native renderer for checked radio state and selected treatment', async () => {
  await mount(
    createElement(RsdAction, {
      label: 'Blue',
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
        label: 'Blue',
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
    await act(async () => host.querySelector('[role="switch"][aria-label="Sound"]').click());
    const modal = host.querySelector('[data-native-modal="Settings"]');
    expect(modal).not.toBeNull();
    const close = modal.querySelector('[aria-label="Close"]');
    expect(close).not.toBeNull();
    expect(close.closest('[data-testid="modal-body"]')).toBeNull();
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

it('propagates paint availability both ways without losing its selected color or accessible name', async () => {
  let mountedNode;
  for (const disabled of [false, true, false]) {
    const element = blueSwatch({ selected: true, disabled, onClick() {} });
    if (!root) await mount(element);
    else await act(async () => root.render(element));
    const props = records.props.findLast((entry) => entry.accessibilityLabel === 'Blue');
    assertDisabledBoundary(props, disabled);
    expect(props.accessibilityState.checked).toBeUndefined();
    expect(props.accessibilityState.selected).toBeUndefined();
    const node = host.querySelector('button');
    mountedNode ??= node;
    expect(node).toBe(mountedNode);
    expect(node.getAttribute('aria-label')).toBe('Blue');
  }
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
    let more = host.querySelector('[aria-label="Custom Color"]');
    expect(more.disabled).toBe(true);
    expect(more.closest('[role="radiogroup"]')).toBeNull();
    await act(async () => {
      caller.screen.disabled = false;
      await owner.setColor('#123456');
    });
    setColor.mockClear();
    more = host.querySelector('[aria-label="Custom Color"]');
    expect(more.disabled).toBe(false);
    await act(async () => more.click());
    expect(open).toHaveBeenCalledOnce();
    const picker = host.querySelector('[aria-label="Color Picker"]');
    expect(picker).not.toBeNull();
    // Shipping's modal leaves the swatch behind it at full strength and out of reach.
    expect(host.querySelector('[aria-label="Custom Color"]').disabled).toBe(false);
    await act(async () => host.querySelector('[aria-label="Custom Color"]').click());
    expect(open).toHaveBeenCalledOnce();
    await act(async () => picker.querySelector('[aria-label="#E63946"]').click());
    expect(setColor).toHaveBeenCalledExactlyOnceWith('#E63946');
    expect(caller.sound.settings.selectedColor).toBe('#E63946');
    expect(close).toHaveBeenCalledOnce();
    expect(setColor.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(host.querySelector('[aria-label="Color Picker"]')).toBeNull();
    await act(async () => host.querySelector('[aria-label="Custom Color"]').click());
    await act(async () => host.querySelector('[data-testid="modal-backdrop"]').click());
    expect(close).toHaveBeenCalledTimes(2);
    expect(setColor).toHaveBeenCalledExactlyOnceWith('#E63946');
    expect(caller.sound.settings.selectedColor).toBe('#E63946');
    expect(host.querySelector('[aria-label="Color Picker"]')).toBeNull();
  } finally {
    owner.dispose();
  }
});

it.each([
  ['coloringBookEnabled', 'Coloring', 'Coloring book', 'Coloring book'],
  ['undoButtonEnabled', 'Tool Drawer', 'Undo', 'Undo'],
  ['strokeWidthControlEnabled', 'Tool Drawer', 'Stroke width', 'Stroke width'],
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
        version: 16,
        [property]: false,
        aiEnabled: false,
      });
      expect(host.textContent).not.toContain('Grown-Ups Only');
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
      version: 16,
      saveOnDeleteEnabled: true,
    });
  } finally {
    owner.dispose();
  }
});
