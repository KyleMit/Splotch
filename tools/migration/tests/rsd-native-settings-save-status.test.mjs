import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
import { host, mount, root } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { NativeSoundSettingsDialog } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsDialog.tsx';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';

const SAVED = 'AI Art choice saved.';
const FAILED = 'The AI Art choice was not saved. AI stays as it was. Retry saving.';

// The dialog's text a sighted reader sees: everything but its spoken-only status region.
function visibleText() {
  const dialog = host.querySelector('[role="dialog"]').cloneNode(true);
  for (const status of dialog.querySelectorAll('[role="status"]')) status.remove();
  return dialog.textContent;
}

async function settingsAfterAiSave(write) {
  let current;
  const owner = createSoundSettings({ read: async () => null, write }, (state) => {
    current = state;
  });
  await owner.load();
  const dialog = () =>
    createElement(NativeSoundSettingsDialog, nativeSettingsProps(owner, current));
  await mount(dialog());
  await act(async () => {
    await owner.setAiEnabled(true);
  });
  await act(async () => root.render(dialog()));
  return owner;
}

// Shipping's Settings show nothing for a save; a routine one here is only spoken, so it never sits
// under the AI Art sheet or behind the parental gate.
it('announces a routine save without showing it', async () => {
  const owner = await settingsAfterAiSave(async () => {});
  try {
    expect(host.querySelector('[role="status"]').textContent).toBe(SAVED);
    expect(visibleText()).not.toContain(SAVED);
    expect(host.querySelector('[aria-label="Try saving settings again"]')).toBeNull();
  } finally {
    owner.dispose();
  }
});

it('keeps a failed save on screen with its retry', async () => {
  const owner = await settingsAfterAiSave(async () => {
    throw new Error('disk full');
  });
  try {
    expect(visibleText()).toContain(FAILED);
    expect(host.querySelector('[aria-label="Try saving settings again"]')).not.toBeNull();
  } finally {
    owner.dispose();
  }
});
