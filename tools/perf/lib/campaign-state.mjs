import { pollUntil, sleep } from '../../lib/proc.mjs';
import { rethrowIfBroken } from './error-classification.mjs';

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
// One owner for every Settings selector both capture transports touch. The
// split-capture bootstrap has to do this setup INSIDE the page — it has no
// script channel to drive these helpers through, and the route's CSP forbids
// eval — so its control FLOW is written separately, against these same
// constants. The helpers below consume them too; when they carried their own
// copies, "owned here" was a comment rather than a fact, and a Settings rename
// could leave one transport working while the other silently timed out.
export const COMPACT_SHELL_MARKER = '#settingsModal .quick-toggles';
export const SETTINGS_MODAL = '#settingsModal';
export const SETTINGS_BUTTON = 'button[aria-label="Settings"]';
export const SETTINGS_CLOSE_BUTTON = '#settingsModal button[aria-label="Close"]';
export const QUICK_NIGHT_TOGGLE = '#quickNightToggle';
export const QUICK_LOCK_PORTRAIT = '#quickLockPortrait';
export const QUICK_LOCK_LANDSCAPE = '#quickLockLandscape';
export const LOCK_ROTATION_TOGGLE = '#lockRotationToggle';
export const FORCE_LANDSCAPE_TOGGLE = '#forceLandscapeToggle';
export const themeOption = (theme) => `#themeOption-${theme}`;

export async function settingsShellIsCompact(execute) {
  return execute(`return document.querySelector('${COMPACT_SHELL_MARKER}') !== null;`);
}

export const settingsSectionRow = (section) =>
  `${SETTINGS_MODAL} button[data-section=${JSON.stringify(section)}]`;

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

// Why a readiness payload may not be scored, or null when it may. Pure so the
// refusal can be tested without a device — the runners previously inlined this
// and nothing exercised either branch.
//
// Absence is refused as firmly as a mismatch: a page that cannot say which theme
// it is showing cannot prove what it measured, and treating silence as consent
// is how the request-echo defect worked in the first place.
export function readinessThemeProblem(ready, requestedTheme) {
  const observed = ready?.resolvedTheme;
  if (!observed) {
    return 'the page did not report a resolved theme — it cannot prove which theme it measured';
  }
  if (requestedTheme && observed !== requestedTheme) {
    return `the page resolved to ${observed}, not the requested ${requestedTheme}`;
  }
  return null;
}

export async function readResolvedTheme(execute) {
  return execute(`return ${RESOLVED_THEME_EXPRESSION};`);
}

async function waitForUi(execute, expression, hint) {
  const ready = await pollUntil(
    () =>
      execute(`return !!(${expression});`).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
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
  // The trigger is eager but the dialog may still be waiting on the lazy overlay
  // chunk. Clicking first latches the state-driven open request (ADR-0049), and
  // retries also cover a trigger whose hydration has not landed yet.
  const opened = await pollUntil(
    async () => {
      if (await execute(`return document.querySelector('${SETTINGS_MODAL}')?.open === true;`)) {
        return true;
      }
      await clickSetupElement(execute, SETTINGS_BUTTON).catch((error) => {
        rethrowIfBroken(error);
      });
      return false;
    },
    READY_TIMEOUT_MS,
    SETTINGS_OPEN_RETRY_MS
  );
  if (!opened) throw new Error(`Timed out waiting for Settings for ${hint}`);
  // The compact shell has no sections to navigate to — its theme and orientation
  // controls sit on the one pane that just opened.
  if (await settingsShellIsCompact(execute)) return true;
  if (!(await execute(`return document.querySelector('${themeOption('light')}') !== null;`))) {
    const selector = settingsSectionRow('appearance');
    if (!(await execute(`return document.querySelector(${JSON.stringify(selector)}) !== null;`))) {
      throw new Error('Settings did not expose the Appearance section');
    }
    await clickSetupElement(execute, selector);
    await waitForUi(
      execute,
      `document.querySelector('${themeOption('light')}') !== null`,
      `Appearance section for ${hint}`
    );
  }
  return false;
}

async function closeSettings(execute, hint) {
  await clickSetupElement(execute, SETTINGS_CLOSE_BUTTON);
  await waitForUi(
    execute,
    `document.querySelector('${SETTINGS_MODAL}')?.open !== true`,
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
        `return document.querySelector('${QUICK_NIGHT_TOGGLE}')?.getAttribute('aria-checked') === '${wantsDark}';`
      );
      if (!alreadySet) await clickSetupElement(execute, QUICK_NIGHT_TOGGLE);
    } else {
      await clickSetupElement(execute, themeOption(theme));
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

async function readCompactLockedOrientation(execute) {
  const selected = await execute(`
    const portrait = document.querySelector('${QUICK_LOCK_PORTRAIT}');
    const landscape = document.querySelector('${QUICK_LOCK_LANDSCAPE}');
    if (!portrait || !landscape) return null;
    return [
      portrait.getAttribute('aria-pressed') === 'true' ? 'portrait' : null,
      landscape.getAttribute('aria-pressed') === 'true' ? 'landscape' : null,
    ].filter(Boolean);
  `);
  if (selected === null) return PLATFORM_OWNS_ROTATION;
  if (selected.length > 1) {
    throw new Error('Compact Settings reports both rotation-lock orientations selected');
  }
  return { lockedOrientation: selected[0] ?? null };
}

async function readSectionedLockedOrientation(execute) {
  const state = await execute(`
    const lock = document.querySelector('${LOCK_ROTATION_TOGGLE}');
    if (!lock) return null;
    const locked = lock.getAttribute('aria-checked') === 'true';
    const forceLandscape = document.querySelector('${FORCE_LANDSCAPE_TOGGLE}');
    return {
      locked,
      forceLandscape: forceLandscape?.getAttribute('aria-checked') === 'true',
      forceControlPresent: forceLandscape !== null,
    };
  `);
  if (state === null) return PLATFORM_OWNS_ROTATION;
  if (state.locked && !state.forceControlPresent) {
    throw new Error('Settings reports rotation locked without its orientation control');
  }
  return {
    lockedOrientation: state.locked ? (state.forceLandscape ? 'landscape' : 'portrait') : null,
  };
}

async function setCompactLockedOrientation(execute, desired) {
  const initial = await readCompactLockedOrientation(execute);
  if (initial === PLATFORM_OWNS_ROTATION) {
    throw new Error('Compact Settings no longer exposes its rotation picker');
  }
  if (initial.lockedOrientation === desired) return;
  if (initial.lockedOrientation) {
    await clickSetupElement(
      execute,
      initial.lockedOrientation === 'landscape' ? QUICK_LOCK_LANDSCAPE : QUICK_LOCK_PORTRAIT
    );
    await waitForUi(
      execute,
      `document.querySelector('${QUICK_LOCK_PORTRAIT}') !== null && document.querySelector('${QUICK_LOCK_LANDSCAPE}') !== null && document.querySelector('${QUICK_LOCK_PORTRAIT}').getAttribute('aria-pressed') !== 'true' && document.querySelector('${QUICK_LOCK_LANDSCAPE}').getAttribute('aria-pressed') !== 'true'`,
      'compact rotation lock to become disabled'
    );
  }
  if (desired) {
    const selector = desired === 'landscape' ? QUICK_LOCK_LANDSCAPE : QUICK_LOCK_PORTRAIT;
    await clickSetupElement(execute, selector);
    await waitForUi(
      execute,
      `document.querySelector('${selector}')?.getAttribute('aria-pressed') === 'true'`,
      `compact rotation lock to select ${desired}`
    );
  }
}

async function setSectionedLockedOrientation(execute, desired) {
  let current = await readSectionedLockedOrientation(execute);
  if (current === PLATFORM_OWNS_ROTATION) {
    throw new Error('Settings no longer exposes its rotation lock controls');
  }
  if (!desired) {
    if (current.lockedOrientation) {
      await clickSetupElement(execute, LOCK_ROTATION_TOGGLE);
      await waitForUi(
        execute,
        `document.querySelector('${LOCK_ROTATION_TOGGLE}')?.getAttribute('aria-checked') === 'false'`,
        'rotation lock to become disabled'
      );
    }
    return;
  }
  if (!current.lockedOrientation) {
    await clickSetupElement(execute, LOCK_ROTATION_TOGGLE);
    await waitForUi(
      execute,
      `document.querySelector('${LOCK_ROTATION_TOGGLE}')?.getAttribute('aria-checked') === 'true' && document.querySelector('${FORCE_LANDSCAPE_TOGGLE}') !== null`,
      'rotation lock controls to become enabled'
    );
    current = await readSectionedLockedOrientation(execute);
  }
  if (current.lockedOrientation !== desired) {
    await clickSetupElement(execute, FORCE_LANDSCAPE_TOGGLE);
    await waitForUi(
      execute,
      `document.querySelector('${FORCE_LANDSCAPE_TOGGLE}')?.getAttribute('aria-checked') === '${desired === 'landscape'}'`,
      `rotation lock to select ${desired}`
    );
  }
}

async function setLockedOrientation(execute, compact, desired) {
  if (compact) return setCompactLockedOrientation(execute, desired);
  return setSectionedLockedOrientation(execute, desired);
}

export async function releaseNativeRotationLock(execute) {
  const compact = await openAppearanceSettings(execute, 'rotation setup');
  try {
    const initial = compact
      ? await readCompactLockedOrientation(execute)
      : await readSectionedLockedOrientation(execute);
    if (initial !== PLATFORM_OWNS_ROTATION) {
      await setLockedOrientation(execute, compact, null);
    }
    return initial;
  } finally {
    await closeSettings(execute, 'rotation setup');
  }
}

export async function restoreNativeRotationLock(execute, initial) {
  if (initial === PLATFORM_OWNS_ROTATION || !initial?.lockedOrientation) return;
  const compact = await openAppearanceSettings(execute, 'rotation restore');
  try {
    await setLockedOrientation(execute, compact, initial.lockedOrientation);
  } finally {
    await closeSettings(execute, 'rotation restore');
  }
}
