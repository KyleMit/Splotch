import { pollUntil, sleep } from '../../lib/proc.mjs';

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 50;
const SETUP_SETTLE_MS = 1_100;
// Long enough that a landed click gets to open the dialog before another is sent.
const SETTINGS_OPEN_RETRY_MS = 400;
const CAMPAIGN_THEMES = new Set(['light', 'dark']);
const CAMPAIGN_ORIENTATIONS = new Set(['PORTRAIT', 'LANDSCAPE']);

export const SETTINGS_SECTION_ROWS = '#settingsModal button[data-section]';

// A landscape phone gets CompactShell: quick toggles and a pointer to portrait
// instead of the section list (COMPACT_QUERY in SettingsModal.svelte). Its
// controls are different elements, not missing ones.
const COMPACT_SHELL_MARKER = '#settingsModal .quick-toggles';

export async function settingsShellIsCompact(execute) {
  return execute(`return document.querySelector('${COMPACT_SHELL_MARKER}') !== null;`);
}

export const settingsSectionRow = (section) =>
  `#settingsModal button[data-section=${JSON.stringify(section)}]`;

export function parseCampaignTheme(value) {
  if (value === undefined) return null;
  const theme = value.toLowerCase();
  if (!CAMPAIGN_THEMES.has(theme)) {
    throw new Error('--theme must be light or dark');
  }
  return theme;
}

export function parseCampaignOrientation(value) {
  if (value === undefined) return null;
  const orientation = value.toUpperCase();
  if (!CAMPAIGN_ORIENTATIONS.has(orientation)) {
    throw new Error('--orientation must be PORTRAIT or LANDSCAPE');
  }
  return orientation;
}

export function themeRoundTripPlan(baselineTheme) {
  return {
    setup: 'dark',
    measured: [
      { from: 'dark', to: 'light' },
      { from: 'light', to: 'dark' },
    ],
    restore: baselineTheme === 'light' ? 'light' : null,
  };
}

// Choosing the theme that already matches the system clears the explicit override
// rather than pinning it, so dataset.theme is empty exactly as often as it is set
// and is not a readiness signal on its own. Everything that waits on a theme waits
// on the resolved value, from this one definition.
export const RESOLVED_THEME_EXPRESSION =
  "(document.documentElement.dataset.theme === 'light' || document.documentElement.dataset.theme === 'dark'" +
  ' ? document.documentElement.dataset.theme' +
  " : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))";

export async function readResolvedTheme(execute) {
  return execute(`return ${RESOLVED_THEME_EXPRESSION};`);
}

async function waitForUi(execute, expression, hint) {
  const ready = await pollUntil(
    () => execute(`return !!(${expression});`).catch(() => false),
    READY_TIMEOUT_MS,
    READY_POLL_MS
  );
  if (!ready) throw new Error(`Timed out waiting for ${hint}`);
}

export async function clickSetupElement(execute, selector) {
  await execute(`
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error(${JSON.stringify(`Missing setup target ${selector}`)});
    target.click();
    return true;
  `);
}

async function openAppearanceSettings(execute, hint) {
  // A sized #drawingCanvas is what callers wait for, and it appears before the
  // shell finishes hydrating. Clicking Settings in that window is a silent no-op
  // that only surfaces as a modal which never opened, so wait for the dialog
  // itself — it mounts closed (ADR-0049 amendment) — and keep re-clicking while
  // it stays closed rather than trusting one click to land.
  await waitForUi(
    execute,
    `document.querySelector('#settingsModal') !== null`,
    `Settings shell for ${hint}`
  );
  const opened = await pollUntil(
    async () => {
      if (await execute(`return document.querySelector('#settingsModal')?.open === true;`)) {
        return true;
      }
      await clickSetupElement(execute, 'button[aria-label="Settings"]').catch(() => {});
      return false;
    },
    READY_TIMEOUT_MS,
    SETTINGS_OPEN_RETRY_MS
  );
  if (!opened) throw new Error(`Timed out waiting for Settings for ${hint}`);
  // The compact shell has no sections to navigate to — its theme and orientation
  // controls sit on the one pane that just opened.
  if (await settingsShellIsCompact(execute)) return true;
  if (!(await execute(`return document.querySelector('#themeOption-light') !== null;`))) {
    const selector = settingsSectionRow('appearance');
    if (!(await execute(`return document.querySelector(${JSON.stringify(selector)}) !== null;`))) {
      throw new Error('Settings did not expose the Appearance section');
    }
    await clickSetupElement(execute, selector);
    await waitForUi(
      execute,
      `document.querySelector('#themeOption-light') !== null`,
      `Appearance section for ${hint}`
    );
  }
  return false;
}

async function closeSettings(execute, hint) {
  await clickSetupElement(execute, '#settingsModal button[aria-label="Close"]');
  await waitForUi(
    execute,
    `document.querySelector('#settingsModal')?.open !== true`,
    `Settings to close after ${hint}`
  );
  await sleep(SETUP_SETTLE_MS);
}

export async function ensureCampaignTheme(execute, theme) {
  if (!theme || (await readResolvedTheme(execute)) === theme) return false;
  const compact = await openAppearanceSettings(execute, 'theme setup');
  try {
    if (compact) {
      // CompactShell offers Night Mode as one toggle rather than a three-way
      // theme picker, so aim at the resolved theme instead of a named option.
      const wantsDark = theme === 'dark';
      const alreadySet = await execute(
        `return document.querySelector('#quickNightToggle')?.getAttribute('aria-checked') === '${wantsDark}';`
      );
      if (!alreadySet) await clickSetupElement(execute, '#quickNightToggle');
    } else {
      await clickSetupElement(execute, `#themeOption-${theme}`);
    }
    await waitForUi(
      execute,
      `${RESOLVED_THEME_EXPRESSION} === ${JSON.stringify(theme)}`,
      `${theme} campaign theme`
    );
  } finally {
    await closeSettings(execute, 'theme setup');
  }
  return true;
}

// Tablets hand orientation to the OS window manager, so the product deliberately
// renders no in-app rotation lock there (see supportsOrientationLock). Because
// openAppearanceSettings has already proven the pane rendered, a missing toggle is
// that product answer and not a targeting failure — the distinction decides whether
// a native capture may rotate the device at all.
export const PLATFORM_OWNS_ROTATION = 'platform-owns-rotation';

export async function setNativeRotationLock(execute, locked) {
  const compact = await openAppearanceSettings(execute, 'rotation setup');
  try {
    // In the compact shell the lock is a Portrait/Landscape picker, so a missing
    // #lockRotationToggle there means "different control", not "no control" —
    // reading it as the latter would rotate the device past a lock the product
    // really does persist. Restoring that picker needs the locked side as well as
    // the fact of the lock, which this boolean contract cannot carry, so refuse
    // rather than silently lose it: orientation is prepared before rotating.
    if (compact) {
      throw new Error(
        'Rotation setup cannot run from the compact Settings shell; prepare orientation before rotating into it'
      );
    }
    const initial = await execute(`
      const toggle = document.querySelector('#lockRotationToggle');
      return toggle ? toggle.getAttribute('aria-checked') === 'true' : null;
    `);
    if (initial === null) return PLATFORM_OWNS_ROTATION;
    if (initial !== locked) {
      await clickSetupElement(execute, '#lockRotationToggle');
      await waitForUi(
        execute,
        `document.querySelector('#lockRotationToggle')?.getAttribute('aria-checked') === '${locked}'`,
        `rotation lock to become ${locked ? 'enabled' : 'disabled'}`
      );
    }
    return initial;
  } finally {
    await closeSettings(execute, 'rotation setup');
  }
}
