import { describe, expect, it } from 'vitest';
import {
  PLATFORM_OWNS_ROTATION,
  setNativeRotationLock,
  parseCampaignTheme,
  parseCampaignOrientation,
  settingsSectionRow,
  themeRoundTripPlan,
} from '../lib/campaign-state.mjs';

describe('performance campaign state', () => {
  it('accepts only the campaign theme vocabulary', () => {
    expect(parseCampaignTheme(undefined)).toBeNull();
    expect(parseCampaignTheme('LIGHT')).toBe('light');
    expect(parseCampaignTheme('dark')).toBe('dark');
    expect(() => parseCampaignTheme('system')).toThrow('--theme must be light or dark');
  });

  it('accepts only the WebDriver orientation vocabulary', () => {
    expect(parseCampaignOrientation(undefined)).toBeNull();
    expect(parseCampaignOrientation('portrait')).toBe('PORTRAIT');
    expect(parseCampaignOrientation('LANDSCAPE')).toBe('LANDSCAPE');
    expect(() => parseCampaignOrientation('square')).toThrow(
      '--orientation must be PORTRAIT or LANDSCAPE'
    );
  });

  it('restores a light baseline after the fixed measured theme round trip', () => {
    expect(themeRoundTripPlan('light')).toEqual({
      setup: 'dark',
      measured: [
        { from: 'dark', to: 'light' },
        { from: 'light', to: 'dark' },
      ],
      restore: 'light',
    });
    expect(themeRoundTripPlan('dark').restore).toBeNull();
  });

  it('addresses the persisted Appearance row in both Settings shells', () => {
    expect(settingsSectionRow('appearance')).toBe(
      '#settingsModal button[data-section="appearance"]'
    );
  });
  describe('native rotation lock', () => {
    // Settings is already proven open on the Appearance pane before the toggle is
    // read, so these stubs answer only what the setup helpers ask along the way.
    function settingsStub(toggleState) {
      const clicked = [];
      const execute = async (script) => {
        if (script.includes('target.click()')) {
          clicked.push(script.match(/querySelector\((".*?")\)/)?.[1]);
          return true;
        }
        if (script.includes("'#settingsModal')?.open === true")) return true;
        if (script.includes("'#settingsModal')?.open !== true")) return true;
        if (script.includes("'#themeOption-light') !== null")) return true;
        if (script.includes('return toggle ?')) return toggleState;
        if (script.includes("'#lockRotationToggle')?.getAttribute")) return true;
        return null;
      };
      return { execute, clicked };
    }

    it('reports that the platform owns rotation when the product renders no toggle', async () => {
      const { execute, clicked } = settingsStub(null);

      await expect(setNativeRotationLock(execute, false)).resolves.toBe(PLATFORM_OWNS_ROTATION);
      expect(clicked).not.toContain('"#lockRotationToggle"');
    });

    it('returns the prior lock state without touching an already-correct toggle', async () => {
      const { execute, clicked } = settingsStub(false);

      await expect(setNativeRotationLock(execute, false)).resolves.toBe(false);
      expect(clicked).not.toContain('"#lockRotationToggle"');
    });

    it('flips a locked toggle and reports the state it must restore', async () => {
      const { execute, clicked } = settingsStub(true);

      await expect(setNativeRotationLock(execute, false)).resolves.toBe(true);
      expect(clicked).toContain('"#lockRotationToggle"');
    });
  });
});
