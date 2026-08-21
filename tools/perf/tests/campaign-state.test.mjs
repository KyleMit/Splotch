import { describe, expect, it } from 'vitest';
import {
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
});
