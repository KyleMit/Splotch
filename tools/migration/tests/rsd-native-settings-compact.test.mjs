import { host, mount, records } from './rsd-native-selection-host.mjs';
import { createElement } from 'react';
import { expect, it } from 'vitest';
import {
  COMPACT_SHELL,
  NOTE_PINNED_MAX_FONT_SCALE,
  RsdSettingsCompact,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsCompact.tsx';

// React Native's font scale at iOS's largest accessibility text size (AX5).
const AX5_FONT_SCALE = 3.571;
const NOTE = 'Switch to portrait for the full settings.';

const toggle = (id, label) => ({ id, label, checked: false, disabled: false, onToggle() {} });

async function openCompact(fontScale) {
  records.dimensions = { width: 844, height: 390, scale: 3, fontScale };
  await mount(
    createElement(
      RsdSettingsCompact,
      {
        sound: toggle('quickSoundToggle', 'Sound'),
        night: toggle('quickNightToggle', 'Night Mode'),
        toolDrawer: { checked: true, disabled: false, onToggle() {} },
        orientation: 'portrait',
        busy: false,
        onOrientationChange() {},
      },
      null
    )
  );
}

const note = () => host.querySelector('[data-testid="portrait-note"]');
const noteStyle = () =>
  Object.assign(
    {},
    ...[records.props.findLast((props) => props.testID === 'portrait-note').style]
      .flat(Infinity)
      .filter(Boolean)
  );
const quickSwitches = () => [...host.querySelectorAll('[role="switch"]')];

it('pins the pointer to portrait under the scrolling toggles at ordinary text sizes, as shipping does', async () => {
  await openCompact(NOTE_PINNED_MAX_FONT_SCALE);
  expect(note().textContent).toBe(NOTE);
  expect(note().closest('section')).toBeNull();
  expect(quickSwitches()[0].closest('section')).not.toBeNull();
  expect(noteStyle()).toMatchObject({
    paddingLeft: COMPACT_SHELL.note.inline,
    paddingRight: COMPACT_SHELL.note.inline,
  });
});

// Pinned at AX5 in phone landscape, the note wrapped over most of the shell and clipped the
// toggles' labels in the sliver left to them (#2985).
it('scrolls the pointer to portrait in after the toggles at accessibility text sizes', async () => {
  await openCompact(AX5_FONT_SCALE);
  const scroller = note().closest('section');
  expect(scroller).not.toBeNull();
  expect(note().textContent).toBe(NOTE);
  expect(quickSwitches()).toHaveLength(3);
  for (const control of quickSwitches()) expect(scroller.contains(control)).toBe(true);
  expect(note().nextElementSibling).toBeNull();
  expect(noteStyle()).toMatchObject({ paddingLeft: 0, paddingRight: 0 });
});
