import { caller, host, mount, openSettingsSection } from './rsd-native-selection-host.mjs';
import { GATE_MODAL, solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { act, createElement } from 'react';
import { Platform } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { ABOUT_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAboutSection.tsx';
import { EXTERNAL_MARK_LABEL } from '../../../experiments/native-architecture/src/rsdDrawing/RsdExternalMark.tsx';
import { FEEDBACK_APP_VERSION } from '../../../experiments/native-architecture/src/feedback/feedbackCopy.ts';
import {
  INSTALL_GUIDE_COPY,
  lockGuideSteps,
} from '../../../experiments/native-architecture/src/install/installGuideCopy.ts';
import {
  RELEASE_NOTES,
  WHATS_NEW_COPY,
} from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import { openHostedPage } from '../../../experiments/native-architecture/src/settings/hostedPages.ts';

vi.mock('../../../experiments/native-architecture/src/settings/hostedPages.ts', async (actual) => ({
  ...(await actual()),
  openHostedPage: vi.fn(),
}));

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
  settingsScreen();
});

it('shows About as shipping does and opens its links outside the app through the route', async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('About');
  expect(host.querySelector(`[role="img"][aria-label="${ABOUT_COPY.mascot}"]`)).not.toBeNull();
  expect(host.textContent).toContain(ABOUT_COPY.tagline);
  expect(host.textContent).toContain(`${ABOUT_COPY.version} ${FEEDBACK_APP_VERSION}`);
  expect(host.textContent).not.toContain('Help and about');
  for (const [name, page] of [
    [ABOUT_COPY.privacy, 'privacy'],
    [ABOUT_COPY.github, 'github'],
  ]) {
    const found = link(name);
    expect(found.querySelector(`[aria-label="${EXTERNAL_MARK_LABEL}"]`), name).not.toBeNull();
    await press(found);
    expect(openHostedPage, name).not.toHaveBeenCalled();
    expect(gateShown(), name).toBe(true);
    expect(host.querySelector('[data-native-modal="About"]'), name).not.toBeNull();
    await solveParentGate();
    expect(openHostedPage).toHaveBeenCalledOnce();
    expect(openHostedPage).toHaveBeenCalledWith(page);
    vi.mocked(openHostedPage).mockClear();
  }
  expect(caller.screen.closeSettings).not.toHaveBeenCalled();
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
  await solveParentGate();
  expect(openHostedPage).toHaveBeenCalledOnce();
  expect(openHostedPage).toHaveBeenCalledWith('changelog');
});

it('shows an installed app the lock steps for its own platform under the lock heading', async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Install');
  const os = Platform.OS === 'android' ? 'android' : 'ios';
  expect(host.textContent).toContain(INSTALL_GUIDE_COPY.lockTitle[os]);
  expect(host.textContent).not.toContain(INSTALL_GUIDE_COPY.title);
  const steps = [...host.querySelectorAll('[role="listitem"]')].map((node) => node.textContent);
  expect(steps).toEqual(lockGuideSteps(os).map((step, index) => `${index + 1}.${step}`));
});

it('opens nothing when the grown-up check is closed without being solved', async () => {
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('About');
  await press(link(ABOUT_COPY.github));
  expect(gateShown()).toBe(true);
  await press(host.querySelector(`${GATE_MODAL} [aria-label="Close"]`));
  expect(gateShown()).toBe(false);
  expect(openHostedPage).not.toHaveBeenCalled();
  expect(host.querySelector('[data-native-modal="About"]')).not.toBeNull();
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
  expect(openHostedPage).toHaveBeenLastCalledWith('privacy');
  expect(openHostedPage).toHaveBeenCalledTimes(2);
});
