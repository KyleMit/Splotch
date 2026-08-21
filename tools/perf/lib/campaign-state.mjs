import { pollUntil, sleep } from '../../lib/proc.mjs';

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 50;
const SETUP_SETTLE_MS = 1_100;
const CAMPAIGN_THEMES = new Set(['light', 'dark']);
const CAMPAIGN_ORIENTATIONS = new Set(['PORTRAIT', 'LANDSCAPE']);

export const SETTINGS_SECTION_ROWS = '#settingsModal button[data-section]';

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

export async function readResolvedTheme(execute) {
  return execute(`
    const explicit = document.documentElement.dataset.theme;
    return explicit === 'light' || explicit === 'dark'
      ? explicit
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  `);
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
  await clickSetupElement(execute, 'button[aria-label="Settings"]');
  await waitForUi(
    execute,
    `document.querySelector('#settingsModal')?.open === true`,
    `Settings for ${hint}`
  );
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
  await openAppearanceSettings(execute, 'theme setup');
  try {
    await clickSetupElement(execute, `#themeOption-${theme}`);
    await waitForUi(
      execute,
      `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
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
  await openAppearanceSettings(execute, 'rotation setup');
  try {
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
