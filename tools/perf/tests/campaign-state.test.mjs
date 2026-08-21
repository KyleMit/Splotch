import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_OWNS_ROTATION,
  RESOLVED_THEME_EXPRESSION,
  ensureCampaignTheme,
  setNativeRotationLock,
  parseCampaignTheme,
  parseCampaignOrientation,
  settingsSectionRow,
  themeRoundTripPlan,
} from '../lib/campaign-state.mjs';
import { ROOT } from '../../lib/proc.mjs';

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
        if (script.includes("'#settingsModal') !== null")) return true;
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
describe('opening Settings', () => {
  // The regression this covers: a sized canvas is not a hydrated shell, so the
  // first click can land on a button with no handler yet and simply do nothing.
  function hydratingStub({ clicksBeforeOpen }) {
    let clicks = 0;
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        clicks += 1;
        return true;
      }
      if (script.includes("'#settingsModal') !== null")) return true;
      if (script.includes("'#settingsModal')?.open === true")) return clicks > clicksBeforeOpen;
      if (script.includes("'#settingsModal')?.open !== true")) return true;
      if (script.includes("'#themeOption-light') !== null")) return true;
      if (script.includes('return toggle ?')) return null;
      return null;
    };
    return { execute, clickCount: () => clicks };
  }

  it('re-clicks until the dialog actually opens', async () => {
    const { execute, clickCount } = hydratingStub({ clicksBeforeOpen: 2 });

    await expect(setNativeRotationLock(execute, false)).resolves.toBe(PLATFORM_OWNS_ROTATION);
    expect(clickCount()).toBeGreaterThan(2);
  });

  it('does not click again once the dialog is open', async () => {
    const { execute, clickCount } = hydratingStub({ clicksBeforeOpen: 0 });

    await setNativeRotationLock(execute, false);

    // One open click, plus the close click that closeSettings sends.
    expect(clickCount()).toBe(2);
  });
});
describe('the compact Settings shell', () => {
  // A landscape phone renders CompactShell, whose theme control is a Night Mode
  // toggle rather than the three-way picker, and whose rotation lock is a
  // Portrait/Landscape picker rather than #lockRotationToggle. Both are different
  // elements, not absent ones — reading them as absent is what stalled every
  // Android landscape cell.
  function compactStub({ theme = 'light' } = {}) {
    const state = { theme, clicked: [] };
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        const selector = script.match(/querySelector\("(.*?)"\)/)?.[1];
        state.clicked.push(selector);
        if (selector === '#quickNightToggle') {
          state.theme = state.theme === 'dark' ? 'light' : 'dark';
        }
        return true;
      }
      if (script.includes('.quick-toggles')) return true;
      if (script.includes("'#settingsModal') !== null")) return true;
      if (script.includes("'#settingsModal')?.open === true")) return true;
      if (script.includes("'#settingsModal')?.open !== true")) return true;
      if (script.includes('dataset.theme')) return state.theme;
      if (script.includes('#quickNightToggle')) {
        return String(state.theme === 'dark') === script.match(/=== '(\w+)'/)?.[1];
      }
      if (script.includes('return toggle ?')) return null;
      return null;
    };
    return { execute, state };
  }

  it('reaches the requested theme through the Night Mode toggle', async () => {
    const { execute, state } = compactStub({ theme: 'light' });

    await expect(ensureCampaignTheme(execute, 'dark')).resolves.toBe(true);
    expect(state.theme).toBe('dark');
    expect(state.clicked).toContain('#quickNightToggle');
    expect(state.clicked).not.toContain('#themeOption-dark');
  });

  it('never navigates to an Appearance section the shell does not have', async () => {
    const { execute, state } = compactStub({ theme: 'light' });

    await ensureCampaignTheme(execute, 'dark');

    expect(state.clicked.some((selector) => selector?.includes('data-section'))).toBe(false);
  });

  it('refuses to read a missing toggle as the platform owning rotation', async () => {
    const { execute } = compactStub();

    await expect(setNativeRotationLock(execute, false)).rejects.toThrow(
      'Rotation setup cannot run from the compact Settings shell'
    );
  });
});
describe('resolved theme expression', () => {
  // Picking the theme that already matches the system clears the override instead
  // of pinning it, so dataset.theme comes back empty for a light choice on a light
  // host. Waiting on dataset.theme alone therefore waits forever — which is exactly
  // how the compact shell's Night Mode round trip hung on its first real run.
  const resolve = (datasetTheme, prefersDark) =>
    new Function('document', 'matchMedia', `return ${RESOLVED_THEME_EXPRESSION};`)(
      { documentElement: { dataset: datasetTheme ? { theme: datasetTheme } : {} } },
      () => ({ matches: prefersDark })
    );

  it('falls back to the system preference when the override is cleared', () => {
    expect(resolve(undefined, false)).toBe('light');
    expect(resolve(undefined, true)).toBe('dark');
  });

  it('prefers an explicit override over the system preference', () => {
    expect(resolve('light', true)).toBe('light');
    expect(resolve('dark', false)).toBe('dark');
  });

  it('is what the shell-agnostic theme waits actually use', () => {
    // The three-way picker does pin an explicit override, so the sectioned path may
    // compare dataset.theme directly. Only the paths that can land on a cleared
    // override — campaign theme setup, and the compact shell's Night Mode toggle —
    // have to resolve it.
    const campaignState = readFileSync(
      join(ROOT, 'tools', 'perf', 'lib', 'campaign-state.mjs'),
      'utf8'
    );
    const actions = readFileSync(
      join(ROOT, 'tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs'),
      'utf8'
    );

    expect(campaignState).toContain('${RESOLVED_THEME_EXPRESSION} === ${JSON.stringify(theme)}');
    expect(actions).toContain("${RESOLVED_THEME_EXPRESSION} === '${enabled ? 'dark' : 'light'}'");
  });
});
