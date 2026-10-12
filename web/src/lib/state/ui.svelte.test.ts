import { describe, expect, it } from 'vitest';
import { createUi } from './ui.svelte';

describe('ui state', () => {
  it('starts with nothing requested and no slider drag in progress', () => {
    const ui = createUi();

    expect(ui.requestedSettingsSection).toBeNull();
    expect(ui.resizingActionButtons).toBe(false);
  });

  it('holds a deep-link request until the modal consumes it', () => {
    const ui = createUi();

    ui.requestSettingsSection('parentCenter');
    expect(ui.requestedSettingsSection).toBe('parentCenter');

    ui.clearRequestedSettingsSection();
    expect(ui.requestedSettingsSection).toBeNull();
  });

  it('tracks the button-size slider drag', () => {
    const ui = createUi();

    ui.setResizingActionButtons(true);
    expect(ui.resizingActionButtons).toBe(true);

    ui.setResizingActionButtons(false);
    expect(ui.resizingActionButtons).toBe(false);
  });
});
