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
  orientationOption,
  themeOption,
} from '../lib/campaign-state.mjs';
import { ROOT } from '../../lib/proc.mjs';

function clickedSelector(script) {
  const serializedSelector = script.match(/querySelector\((".*?")\)/)?.[1];
  return serializedSelector ? JSON.parse(serializedSelector) : null;
}

const clickedOrientation = (selector) => selector?.match(/^#orientationOption-(\w+)$/)?.[1];
const queriedOrientation = (script) =>
  script.match(/#orientationOption-(\w+)'\)\?\.getAttribute/)?.[1];
const orientationClicks = (clicked) => clicked.filter(clickedOrientation);

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
    function settingsStub({ choice = 'auto', controls = true } = {}) {
      const state = { choice, clicked: [] };
      const execute = async (script) => {
        if (script.includes('target.click()')) {
          const selector = clickedSelector(script);
          state.clicked.push(selector);
          state.choice = clickedOrientation(selector) ?? state.choice;
          return true;
        }
        if (script.includes("'#settingsModal')?.open === true")) return true;
        if (script.includes("'#settingsModal')?.open !== true")) return true;
        if (script.includes('.quick-toggles')) return false;
        if (script.includes("'#themeOption-light') !== null")) return true;
        if (script.includes('const choices =')) return controls ? [state.choice] : null;
        const queried = queriedOrientation(script);
        if (queried) return state.choice === queried;
        return null;
      };
      return { execute, state };
    }

    it('reports that the platform owns rotation when the product renders no picker', async () => {
      const { execute, state } = settingsStub({ controls: false });

      await expect(releaseNativeRotationLock(execute)).resolves.toBe(PLATFORM_OWNS_ROTATION);
      expect(orientationClicks(state.clicked)).toEqual([]);
    });

    it('returns the prior lock state without touching an already-unlocked picker', async () => {
      const { execute, state } = settingsStub();

      await expect(releaseNativeRotationLock(execute)).resolves.toEqual({
        lockedOrientation: null,
      });
      expect(orientationClicks(state.clicked)).toEqual([]);
    });

    it('releases to Auto and restores the exact locked side', async () => {
      const { execute, state } = settingsStub({ choice: 'landscape' });

      const initial = await releaseNativeRotationLock(execute);
      expect(initial).toEqual({ lockedOrientation: 'landscape' });
      expect(state.choice).toBe('auto');

      await restoreNativeRotationLock(execute, initial);
      expect(state.choice).toBe('landscape');
      expect(orientationClicks(state.clicked)).toEqual([
        orientationOption('auto'),
        orientationOption('landscape'),
      ]);
    });

    it('rejects a picker that reports more than one selected option', async () => {
      const { execute: stubbed } = settingsStub({ choice: 'portrait' });
      const execute = async (script) =>
        script.includes('const choices =') ? ['portrait', 'auto'] : stubbed(script);

      await expect(releaseNativeRotationLock(execute)).rejects.toThrow(
        'Settings reports 2 orientation options selected'
      );
    });

    it('hands the prior lock to the caller before a failed close can swallow it', async () => {
      const { execute: stubbed, state } = settingsStub({ choice: 'portrait' });
      const execute = async (script) => {
        if (script.includes('Close') && script.includes('target.click()')) {
          throw new Error('close failed');
        }
        return stubbed(script);
      };
      let seen;

      await expect(
        releaseNativeRotationLock(execute, { onInitial: (initial) => (seen = initial) })
      ).rejects.toThrow(/close failed/);
      expect(state.choice).toBe('auto');
      expect(seen).toEqual({ lockedOrientation: 'portrait' });
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
      if (script.includes('const choices =')) return null;
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
      if (script.includes('const choices =')) return null;
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
  // toggle rather than the three-way picker. Its Orientation picker is the same
  // component the sectioned shell renders, on the one pane that opens — reading
  // either control as absent is what stalled every Android landscape cell.
  function compactStub({ theme = 'light', choice = 'auto' } = {}) {
    const state = { theme, choice, clicked: [] };
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        const selector = clickedSelector(script);
        state.clicked.push(selector);
        if (selector === '#quickNightToggle') {
          state.theme = state.theme === 'dark' ? 'light' : 'dark';
        }
        state.choice = clickedOrientation(selector) ?? state.choice;
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
      if (script.includes('const choices =')) return [state.choice];
      const queried = queriedOrientation(script);
      if (queried) return state.choice === queried;
      return null;
    };
    return { execute, state };
  }

  // Locking or unlocking can rotate the phone, which swaps CompactShell for the
  // sectioned hub (or back) while Settings stays open.
  function shellFlippingRotationStub({ choice, physicalOrientation }) {
    const state = { choice, view: 'hub', clicked: [] };
    const compact = () =>
      state.choice === 'landscape' ||
      (state.choice === 'auto' && physicalOrientation === 'landscape');
    const pickerShown = () => compact() || state.view === 'appearance';
    const execute = async (script) => {
      if (script.includes('target.click()')) {
        const selector = clickedSelector(script);
        state.clicked.push(selector);
        state.choice = clickedOrientation(selector) ?? state.choice;
        if (selector?.includes('data-section')) state.view = 'appearance';
        if (selector === SETTINGS_CLOSE_BUTTON) state.view = 'hub';
        return true;
      }
      if (script.includes("'#settingsModal')?.open === true")) return true;
      if (script.includes("'#settingsModal')?.open !== true")) return true;
      if (script.includes(COMPACT_SHELL_MARKER)) return compact();
      if (script.includes("'#themeOption-light') !== null")) {
        return !compact() && state.view === 'appearance';
      }
      if (script.includes('button[data-section') && !compact() && state.view === 'hub') return true;
      if (script.includes('const choices =')) return pickerShown() ? [state.choice] : null;
      const queried = queriedOrientation(script);
      if (queried) return pickerShown() && state.choice === queried;
      return null;
    };
    return { execute, state, compact };
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

  it('releases and restores the compact picker without leaving its pane', async () => {
    const { execute, state } = compactStub({ choice: 'landscape' });

    const initial = await releaseNativeRotationLock(execute);
    expect(initial).toEqual({ lockedOrientation: 'landscape' });
    expect(state.choice).toBe('auto');

    await restoreNativeRotationLock(execute, initial);
    expect(state.choice).toBe('landscape');
    expect(state.clicked.some((selector) => selector?.includes('data-section'))).toBe(false);
  });

  it('releases and restores across a compact-to-sectioned shell change', async () => {
    const { execute, state, compact } = shellFlippingRotationStub({
      choice: 'landscape',
      physicalOrientation: 'portrait',
    });

    const initial = await releaseNativeRotationLock(execute);
    expect(initial).toEqual({ lockedOrientation: 'landscape' });
    expect(state.choice).toBe('auto');
    expect(compact()).toBe(false);
    expect(state.clicked).toContain(settingsSectionRow('appearance'));

    await restoreNativeRotationLock(execute, initial);
    expect(state.choice).toBe('landscape');
    expect(compact()).toBe(true);
    expect(
      state.clicked.filter((selector) => selector === settingsSectionRow('appearance'))
    ).toHaveLength(2);
  });

  it('restores a portrait lock across a compact-to-sectioned shell change', async () => {
    const { execute, state, compact } = shellFlippingRotationStub({
      choice: 'auto',
      physicalOrientation: 'landscape',
    });

    await restoreNativeRotationLock(execute, { lockedOrientation: 'portrait' });

    expect(state.choice).toBe('portrait');
    expect(compact()).toBe(false);
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
  const dialogHeader = source('components/design/DialogHeader.svelte');
  const coloringBook = source('components/ColoringBook.svelte');
  const settingsButton = source('components/SettingsButton.svelte');
  const compactShell = source('components/settings/CompactShell.svelte');
  const appearanceSection = source('components/settings/AppearanceSection.svelte');
  const orientationPicker = source('components/settings/OrientationPicker.svelte');
  const sections = source('components/settings/sections.ts');

  it('finds the dialog and its close control in SettingsModal', () => {
    expect(SETTINGS_MODAL).toBe('#settingsModal');
    expect(settingsModal).toContain('id="settingsModal"');
    expect(SETTINGS_CLOSE_BUTTON).toContain('aria-label="Close"');
    expect(settingsModal).toContain('<DialogHeader');
    expect(settingsModal).toMatch(/<DialogHeader[^>]*\bcloseFeedback\b/s);
    expect(dialogHeader).toContain("closeLabel = 'Close'");
    expect(dialogHeader).toContain("control('close', closeLabel, close)");
    expect(dialogHeader).toMatch(/<button[^>]*aria-label={label}/);
  });

  it('keeps the back selectors used by the iPad capture transport', () => {
    expect(settingsModal).toContain('backClass="settings-back"');
    expect(coloringBook).toContain('backClass="coloring-back-button"');
    expect(dialogHeader).toContain('dialog-back ${backClass}');
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

  it('finds the one Orientation picker both shells render', () => {
    for (const choice of ['portrait', 'landscape', 'auto']) {
      expect(orientationPicker, choice).toContain(`id: '${orientationOption(choice).slice(1)}'`);
    }
    expect(compactShell).toContain('<OrientationPicker');
    expect(appearanceSection).toContain('<OrientationPicker');
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
