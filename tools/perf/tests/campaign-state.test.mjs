import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_OWNS_ROTATION,
  RESOLVED_THEME_EXPRESSION,
  ensureCampaignTheme,
  releaseNativeRotationLock,
  restoreNativeRotationLock,
  parseCampaignTheme,
  parseCampaignOrientation,
  settingsSectionRow,
  themeRoundTripPlan,
  COMPACT_SHELL_MARKER,
  QUICK_NIGHT_TOGGLE,
  SETTINGS_BUTTON,
  SETTINGS_CLOSE_BUTTON,
  SETTINGS_MODAL,
  themeOption,
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
    function settingsStub({ locked = false, orientation = 'portrait', controls = true } = {}) {
      const state = { locked, orientation, clicked: [] };
      const execute = async (script) => {
        if (script.includes('target.click()')) {
          const serializedSelector = script.match(/querySelector\((".*?")\)/)?.[1];
          const selector = serializedSelector ? JSON.parse(serializedSelector) : null;
          state.clicked.push(selector);
          if (selector === '#lockRotationToggle') state.locked = !state.locked;
          if (selector === '#forceLandscapeToggle') {
            state.orientation = state.orientation === 'landscape' ? 'portrait' : 'landscape';
          }
          return true;
        }
        if (script.includes("'#settingsModal')?.open === true")) return true;
        if (script.includes("'#settingsModal')?.open !== true")) return true;
        if (script.includes('.quick-toggles')) return false;
        if (script.includes("'#themeOption-light') !== null")) return true;
        if (script.includes('const lock =')) {
          if (!controls) return null;
          return {
            locked: state.locked,
            forceLandscape: state.orientation === 'landscape',
            forceControlPresent: state.locked,
          };
        }
        if (script.includes("'#lockRotationToggle')?.getAttribute")) {
          return script.includes("=== 'true'") ? state.locked : !state.locked;
        }
        if (script.includes("'#forceLandscapeToggle')?.getAttribute")) {
          return (
            String(state.orientation === 'landscape') === script.match(/=== '(true|false)'/)?.[1]
          );
        }
        return null;
      };
      return { execute, state };
    }

    it('reports that the platform owns rotation when the product renders no toggle', async () => {
      const { execute, state } = settingsStub({ controls: false });

      await expect(releaseNativeRotationLock(execute)).resolves.toBe(PLATFORM_OWNS_ROTATION);
      expect(state.clicked).not.toContain('#lockRotationToggle');
    });

    it('returns the prior lock state without touching an already-correct toggle', async () => {
      const { execute, state } = settingsStub();

      await expect(releaseNativeRotationLock(execute)).resolves.toEqual({
        lockedOrientation: null,
      });
      expect(state.clicked).not.toContain('#lockRotationToggle');
    });

    it('releases and restores the sectioned shell lock with its exact side', async () => {
      const { execute, state } = settingsStub({ locked: true, orientation: 'landscape' });

      const initial = await releaseNativeRotationLock(execute);
      expect(initial).toEqual({ lockedOrientation: 'landscape' });
      expect(state.locked).toBe(false);

      await restoreNativeRotationLock(execute, initial);
      expect(state).toMatchObject({ locked: true, orientation: 'landscape' });
      expect(state.clicked.filter((selector) => selector === '#lockRotationToggle')).toHaveLength(
        2
      );
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
      if (script.includes('const lock =')) return null;
      return null;
    };
    return { execute, clickCount: () => clicks };
  }

  it('re-clicks until the dialog actually opens', async () => {
    const { execute, clickCount } = hydratingStub({ clicksBeforeOpen: 2 });

    await expect(releaseNativeRotationLock(execute)).resolves.toBe(PLATFORM_OWNS_ROTATION);
    expect(clickCount()).toBeGreaterThan(2);
  });

  it('does not click again once the dialog is open', async () => {
    const { execute, clickCount } = hydratingStub({ clicksBeforeOpen: 0 });

    await releaseNativeRotationLock(execute);

    // One open click, plus the close click that closeSettings sends.
    expect(clickCount()).toBe(2);
  });

  it('opens a dialog that mounts only after the eager trigger is clicked', async () => {
    vi.useFakeTimers();
    let modalMounted = false;
    let modalOpen = false;
    const clicked = [];
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        const serializedSelector = script.match(/querySelector\((".*?")\)/)?.[1];
        const selector = serializedSelector ? JSON.parse(serializedSelector) : null;
        clicked.push(selector);
        if (selector === SETTINGS_BUTTON) {
          modalMounted = true;
          modalOpen = true;
        }
        if (selector === SETTINGS_CLOSE_BUTTON) modalOpen = false;
        return true;
      }
      if (script.includes("'#settingsModal') !== null")) return modalMounted;
      if (script.includes("'#settingsModal')?.open === true")) return modalOpen;
      if (script.includes("'#settingsModal')?.open !== true")) return !modalOpen;
      if (script.includes("'#themeOption-light') !== null")) return true;
      if (script.includes('const lock =')) return null;
      return false;
    };

    try {
      const result = releaseNativeRotationLock(execute);
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe(PLATFORM_OWNS_ROTATION);
      expect(clicked).toContain(SETTINGS_BUTTON);
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('the compact Settings shell', () => {
  // A landscape phone renders CompactShell, whose theme control is a Night Mode
  // toggle rather than the three-way picker, and whose rotation lock is a
  // Portrait/Landscape picker rather than #lockRotationToggle. Both are different
  // elements, not absent ones — reading them as absent is what stalled every
  // Android landscape cell.
  function compactStub({ theme = 'light', lockedOrientation = null } = {}) {
    const state = { theme, lockedOrientation, clicked: [] };
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        const selector = script.match(/querySelector\("(.*?)"\)/)?.[1];
        state.clicked.push(selector);
        if (selector === '#quickNightToggle') {
          state.theme = state.theme === 'dark' ? 'light' : 'dark';
        }
        if (selector === '#quickLockPortrait') {
          state.lockedOrientation = state.lockedOrientation === 'portrait' ? null : 'portrait';
        }
        if (selector === '#quickLockLandscape') {
          state.lockedOrientation = state.lockedOrientation === 'landscape' ? null : 'landscape';
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
      if (script.includes('const portrait =')) {
        return state.lockedOrientation ? [state.lockedOrientation] : [];
      }
      if (script.includes('#quickLockPortrait') && script.includes("!== 'true'")) {
        return state.lockedOrientation === null;
      }
      if (script.includes('#quickLockPortrait') && script.includes("=== 'true'")) {
        return state.lockedOrientation === 'portrait';
      }
      if (script.includes('#quickLockLandscape') && script.includes("=== 'true'")) {
        return state.lockedOrientation === 'landscape';
      }
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

  it('releases and restores the compact picker with its exact selected side', async () => {
    const { execute, state } = compactStub({ lockedOrientation: 'landscape' });

    const initial = await releaseNativeRotationLock(execute);
    expect(initial).toEqual({ lockedOrientation: 'landscape' });
    expect(state.lockedOrientation).toBeNull();

    await restoreNativeRotationLock(execute, initial);
    expect(state.lockedOrientation).toBe('landscape');
    expect(state.clicked.filter((selector) => selector === '#quickLockLandscape')).toHaveLength(2);
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

// Every Settings selector both capture transports depend on, bound to the markup
// that has to provide it. Two transports drive these controls — the Appium path
// through a script channel, the split path from inside the page — and a rename in
// SettingsModal, CompactShell or AppearanceSection would otherwise leave one
// working and the other silently timing out until a device session found it.
//
// The constants are the single owner; this is what makes "owned here" a fact
// rather than a comment.
describe('the Settings selectors both transports share', () => {
  const source = (path) => readFileSync(join(ROOT, 'web', 'src', 'lib', path), 'utf8');
  const settingsModal = source('components/SettingsModal.svelte');
  const pressFeedbackCloseButton = source('components/PressFeedbackCloseButton.svelte');
  const settingsButton = source('components/SettingsButton.svelte');
  const compactShell = source('components/settings/CompactShell.svelte');
  const appearanceSection = source('components/settings/AppearanceSection.svelte');
  const sections = source('components/settings/sections.ts');

  it('finds the dialog and its close control in SettingsModal', () => {
    expect(SETTINGS_MODAL).toBe('#settingsModal');
    expect(settingsModal).toContain('id="settingsModal"');
    expect(SETTINGS_CLOSE_BUTTON).toContain('aria-label="Close"');
    expect(settingsModal).toContain('<PressFeedbackCloseButton');
    expect(pressFeedbackCloseButton).toMatch(/<button[^>]*aria-label="Close"/);
  });

  it('finds the button that opens it', () => {
    expect(SETTINGS_BUTTON).toBe('button[aria-label="Settings"]');
    expect(settingsButton).toContain('aria-label="Settings"');
  });

  it('finds the compact shell marker and its night toggle', () => {
    expect(COMPACT_SHELL_MARKER.endsWith('.quick-toggles')).toBe(true);
    expect(compactShell).toContain('class="quick-toggles"');
    expect(QUICK_NIGHT_TOGGLE).toBe('#quickNightToggle');
    expect(compactShell).toContain('id="quickNightToggle"');
  });

  // The sectioned shell's options carry literal ids, so the constant and the
  // markup can be compared directly rather than by shape.
  it('finds both theme options the campaign selects', () => {
    for (const theme of ['light', 'dark']) {
      expect(appearanceSection, theme).toContain(`id: '${themeOption(theme).slice(1)}'`);
    }
  });

  it('finds the Appearance row the sectioned shell navigates through', () => {
    expect(settingsSectionRow('appearance')).toContain('data-section="appearance"');
    expect(settingsModal).toContain('data-section={section.id}');
    expect(sections).toContain("id: 'appearance'");
  });
});
