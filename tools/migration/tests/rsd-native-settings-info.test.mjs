import { caller, host, mount, openSettingsSection, records } from './rsd-native-selection-host.mjs';
import { GATE_MODAL, solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { act, createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { ABOUT_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAboutSection.tsx';
import { EXTERNAL_MARK_LABEL } from '../../../experiments/native-architecture/src/rsdDrawing/RsdExternalMark.tsx';
import {
  INSTALL_GUIDE_COPY,
  exitGuideSteps,
  lockGuideSteps,
} from '../../../experiments/native-architecture/src/install/installGuideCopy.ts';
import {
  RELEASE_NOTES,
  WHATS_NEW_COPY,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import { openAppPage } from '../../../experiments/native-architecture/src/platform/appPath.ts';
import { openHostedPage } from '../../../experiments/native-architecture/src/settings/hostedPages.ts';

vi.mock('../../../experiments/native-architecture/src/settings/hostedPages.ts', async (actual) => ({
  ...(await actual()),
  openHostedPage: vi.fn(),
}));

vi.mock(
  '../../../experiments/native-architecture/src/platform/appPath.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    openAppPage: vi.fn(),
  })
);

const POLICIES = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};

// A whole version 12 record, so the stored policy is the one in force.
function settingsScreen(externalLinks = 'always') {
  const stored = {
    version: 12,
    soundEnabled: false,
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'light',
    aiEnabled: false,
    parentPolicies: { ...POLICIES, externalLinks },
    coloringBookEnabled: true,
    soundLevel: 'medium',
    undoButtonEnabled: true,
    strokeWidthControlEnabled: true,
    orientation: 'portrait',
    saveOnDeleteEnabled: false,
    buttonScale: 100,
    reduceMotion: 'system',
    whatsNewSeen: null,
    pencilEraserEnabled: true,
    applePencilSeen: false,
  };
  caller.settingsStorage = {
    read: async () => JSON.stringify(stored),
    write: vi.fn(async () => {}),
  };
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'menu', brushes: ['pen', 'crayon'] },
    availableBrushes: ['pen', 'crayon'],
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
    closeSettings: vi.fn(),
    closeColorPicker: vi.fn(),
    openColorPicker: vi.fn(),
    selectInkBrush: vi.fn(),
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
}

function link(name) {
  const found = [...host.querySelectorAll('[role="link"]')].find((node) =>
    node.textContent.startsWith(name)
  );
  expect(found, name).toBeDefined();
  return found;
}

const gateShown = () => host.querySelector(GATE_MODAL) !== null;

async function press(node) {
  await act(async () => node.click());
}

beforeEach(() => {
  vi.mocked(openHostedPage).mockClear();
  vi.mocked(openAppPage).mockClear();
  settingsScreen();
});

it('opens Privacy in the app without a check and keeps GitHub behind the external-links check', async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('About');
  expect(host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`)).not.toBeNull();
  expect(host.textContent).toContain(ABOUT_COPY.tagline);
  const policy = link(ABOUT_COPY.privacy);
  expect(policy.querySelector(`[aria-label="${EXTERNAL_MARK_LABEL}"]`)).toBeNull();
  await press(policy);
  expect(openAppPage).toHaveBeenCalledWith('privacy');
  expect(gateShown()).toBe(false);
  expect(openHostedPage).not.toHaveBeenCalled();
  const github = link(ABOUT_COPY.github);
  expect(github.querySelector(`[aria-label="${EXTERNAL_MARK_LABEL}"]`)).not.toBeNull();
  await press(github);
  expect(gateShown()).toBe(true);
  await solveParentGate();
  expect(openHostedPage).toHaveBeenCalledOnce();
  expect(openHostedPage).toHaveBeenCalledWith('github');
});

it("shows only the current release under What's New, with every release one link away", async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection("What's New");
  const [current, ...earlier] = RELEASE_NOTES;
  expect(host.textContent).toContain(current.dateLabel);
  for (const release of earlier) expect(host.textContent).not.toContain(release.dateLabel);
  const headings = [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
  const listed = [...host.querySelectorAll('[role="listitem"]')].map((node) => node.textContent);
  for (const section of current.sections) {
    expect(headings).toContain(section.title);
    for (const { text } of section.blocks.filter(({ kind }) => kind === 'item'))
      expect(listed).toContain(text);
  }
  expect(host.textContent).not.toContain('• ');
  await press(link(WHATS_NEW_COPY.allReleases));
  expect(openHostedPage).not.toHaveBeenCalled();
  expect(gateShown()).toBe(false);
  expect(openAppPage).toHaveBeenCalledWith('changelog');
});

const numbered = (steps) => steps.map((step, index) => `${index + 1}.${step}`);

it.each([
  ['ios', false],
  ['ios', true],
  ['android', false],
  ['android', true],
])(
  'shows an installed %s app its lock steps, or the way out once the lock is on (locked: %s)',
  async (os, locked) => {
    records.os = os;
    caller.deviceLocked = locked;
    await mount(createElement(RsdDrawingScreen));
    await openSettingsSection('Install');
    await act(async () => {});
    const title = locked ? INSTALL_GUIDE_COPY.lockedTitle[os] : INSTALL_GUIDE_COPY.lockTitle[os];
    const heading = [...host.querySelectorAll('[role="heading"]')].find((node) =>
      node.textContent.startsWith(title)
    );
    expect(heading, title).toBeDefined();
    expect(heading.textContent.includes('✓')).toBe(locked);
    expect(host.textContent).not.toContain(INSTALL_GUIDE_COPY.title);
    const steps = [...host.querySelectorAll('[role="listitem"]')].map((node) => node.textContent);
    expect(steps).toEqual(numbered(locked ? exitGuideSteps(os) : lockGuideSteps(os)));
  }
);

it('opens nothing when the grown-up check is closed without being solved', async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('About');
  await press(link(ABOUT_COPY.github));
  expect(gateShown()).toBe(true);
  await press(host.querySelector(`${GATE_MODAL} [aria-label="Close"]`));
  expect(gateShown()).toBe(false);
  expect(openHostedPage).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
});

it('asks once per session under Per session, then opens later links at once', async () => {
  settingsScreen('session');
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('About');
  await press(link(ABOUT_COPY.github));
  expect(openHostedPage).not.toHaveBeenCalled();
  await solveParentGate();
  expect(openHostedPage).toHaveBeenLastCalledWith('github');
  await press(link(ABOUT_COPY.privacy));
  expect(caller.product.state.gate.open).toBe(false);
  expect(openAppPage).toHaveBeenLastCalledWith('privacy');
  await press(link(ABOUT_COPY.github));
  expect(openHostedPage).toHaveBeenCalledTimes(2);
  expect(gateShown()).toBe(false);
});
