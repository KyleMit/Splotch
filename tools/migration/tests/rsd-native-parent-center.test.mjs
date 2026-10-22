import { act, createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host, mount, records, checkedRadio } from './rsd-native-selection-host.mjs';
import {
  SECTION,
  choose,
  click,
  clickText,
  mountProduct,
  openParentCenter,
  policyGroup,
  policyNote,
  policyOption,
} from './rsd-native-parent-center-fixture.mjs';
import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
import { createSoundSettings } from '../../../src/settings/soundSettings.ts';
import { NativeSoundSettingsDialog } from '../../../src/rsdDrawing/RsdSettingsDialog.tsx';
import {
  PARENT_GATE_ERROR_MESSAGE,
  PARENT_GATE_KEYPAD_KEYS,
  PARENT_GATE_SHAKE_MS,
} from '../../../src/parentCenter/parentGate.ts';
import { PARENT_FEATURES } from '../../../src/parentCenter/parentPolicy.ts';
import {
  PARENT_CENTER_COPY,
  PARENT_HELP,
  PARENT_LABELS,
  PARENT_MODE_LABELS,
} from '../../../src/parentCenter/parentCenterCopy.ts';
import { PARENT_GATE_COPY } from '../../../src/parentCenter/parentGateCopy.ts';
import { GATE_LOCKOUT_BASE_MS } from '../../../src/feedback/gateLockout.ts';
import { PARENT_GATE_KEY_LABELS } from '../../../src/rsdDrawing/RsdParentGateKeypad.tsx';
import {
  GATE_MODAL,
  finishGateHold,
  expectGateEquation,
  expectGateEquationGeometry,
  gateKey,
  gateProblem,
  tapGateKeys,
} from './rsd-parent-gate-keypad.mjs';
import { WHATS_NEW_STAMP } from '../../../src/settings/whatsNewStamp.ts';
import { paletteHex } from '../../../src/lib/palette.ts';
import { colorFamilyShade } from '../../../src/lib/hexPickerLayout.ts';

// The store whose rules bound the policies, switched per test.
const storePlatform = vi.hoisted(() => ({ os: 'ios' }));
vi.mock('../../../src/platform/parentPlatform.ts', () => ({
  get PARENT_PLATFORM() {
    return storePlatform.os;
  },
}));

const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const TABLET = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
const CONFIRM_MODAL = `[data-native-modal="${PARENT_CENTER_COPY.confirmTitle}"]`;
const AI_SWITCH = '[aria-label="Create AI Images"]';
// Math.random 0.5 picks operand 6 every time: a two-digit answer (36) on every problem.
const FIXED_OPERAND_RANDOM = 0.5;
const FIXED_ANSWER_DIGITS = [3, 6];
const REGENERATED_OPERAND_RANDOM = 0.9;
const REGENERATED_ANSWER_DIGITS = [8, 1];

describe('RSD Parent Center section', () => {
  afterEach(() => {
    records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
    storePlatform.os = 'ios';
  });

  it('lists the five shipping protections as stacked cards with their help lines on a phone', async () => {
    records.dimensions = PHONE;
    await openParentCenter();
    const section = host.querySelector(SECTION);
    const names = [...section.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
    expect(names).toEqual(PARENT_FEATURES.map((feature) => PARENT_LABELS[feature]));
    for (const feature of PARENT_FEATURES) {
      expect(section.textContent).toContain(PARENT_HELP[feature]);
      expect(policyGroup(feature).getAttribute('role')).toBe('radiogroup');
      expect(policyOption(feature, 'session').textContent).toBe(PARENT_MODE_LABELS.session);
    }
    expect(section.textContent).toContain(PARENT_CENTER_COPY.intro);
    expect(section.textContent).not.toContain(PARENT_CENTER_COPY.matrixHeading);
    expect(section.textContent).toContain(
      `${PARENT_MODE_LABELS.session} ${PARENT_CENTER_COPY.sessionNote}`
    );
    expect(section.textContent).toContain(
      `${PARENT_MODE_LABELS.never} ${PARENT_CENTER_COPY.neverNote}`
    );
  });

  it('lines the protections up under one heading per mode where the list is wide', async () => {
    records.dimensions = TABLET;
    await openParentCenter();
    const section = host.querySelector(SECTION);
    expect(section.textContent).toContain(PARENT_CENTER_COPY.matrixHeading);
    for (const feature of PARENT_FEATURES) {
      const option = policyOption(feature, 'always');
      expect(option.getAttribute('aria-label')).toBe(PARENT_MODE_LABELS.always);
      expect(option.textContent).toBe('');
    }
    checkedRadio(policyOption('parentCenter', 'always'));
  });

  it('persists a policy choice in the version 12 shape', async () => {
    const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
    const owner = await openParentCenter(storage);
    checkedRadio(policyOption('imageReport', 'always'));
    await choose('imageReport', 'session');
    checkedRadio(policyOption('imageReport', 'session'));
    expect(owner.getState().settings.parentPolicies.imageReport).toBe('session');
    expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
      version: 16,
      parentPolicies: { imageReport: 'session', externalLinks: 'always' },
    });
  });

  it('asks before turning off the Parent Center check, and warns while it is off', async () => {
    const owner = await openParentCenter();
    await choose('parentCenter', 'never');
    const confirm = host.querySelector(CONFIRM_MODAL);
    expect(confirm.textContent).toContain(PARENT_CENTER_COPY.unprotected);
    expect(owner.getState().settings.parentPolicies.parentCenter).toBe('always');
    await clickText(PARENT_CENTER_COPY.keepOn);
    expect(owner.getState().settings.parentPolicies.parentCenter).toBe('always');
    expect(policyNote('parentCenter')).toBeNull();
    await choose('parentCenter', 'never');
    await clickText(PARENT_CENTER_COPY.turnOff);
    expect(owner.getState().settings.parentPolicies.parentCenter).toBe('never');
    const warning = policyNote('parentCenter');
    expect(warning.textContent).toBe(
      `${PARENT_CENTER_COPY.warningTitle}${PARENT_CENTER_COPY.unprotected}`
    );
  });

  it('keeps Never on external links unavailable on iOS and says why', async () => {
    storePlatform.os = 'ios';
    await openParentCenter();
    expect(policyOption('externalLinks', 'never').disabled).toBe(true);
    expect(policyOption('feedback', 'never').disabled).toBe(false);
    expect(policyNote('externalLinks').textContent).toBe(
      `${PARENT_CENTER_COPY.unavailableTitle}${PARENT_CENTER_COPY.unavailable}`
    );
  });

  it('offers Never on external links on Android without the iOS note', async () => {
    storePlatform.os = 'android';
    await openParentCenter();
    expect(policyOption('externalLinks', 'never').disabled).toBe(false);
    expect(policyNote('externalLinks')).toBeNull();
  });

  it('leaves the options undimmed while a choice saves, and ignores a tap until it lands', async () => {
    let stored = null;
    let land;
    const storage = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (next) => {
        stored = next;
      }),
    };
    const owner = await openParentCenter(storage);
    storage.write.mockImplementationOnce(
      (next) =>
        new Promise((resolve) => {
          land = () => {
            stored = next;
            resolve();
          };
        })
    );
    await act(async () => policyOption('feedback', 'session').click());
    expect(owner.getState().settings.status).toBe('saving');
    for (const mode of ['always', 'session'])
      expect(policyOption('feedback', mode).disabled, mode).toBe(false);
    await act(async () => policyOption('feedback', 'always').click());
    await act(async () => land());
    expect(owner.getState().settings).toMatchObject({ status: 'ready', saved: true });
    expect(JSON.parse(stored).parentPolicies.feedback).toBe('session');
    checkedRadio(policyOption('feedback', 'session'));
  });

  it("keeps a failed policy save pending and retryable after the queued What's New stamp writes", async () => {
    let stored = null;
    let rejectSave;
    const storage = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (next) => {
        stored = next;
      }),
    };
    const owner = await openParentCenter(storage);
    // The AI switch, its save and its retry live in Settings › AI Art.
    expect(host.querySelector(AI_SWITCH)).toBeNull();
    storage.write.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    await act(async () => {
      void owner.setPolicy('feedback', 'session');
    });
    expect(owner.getState().settings.status).toBe('saving');
    await act(async () => owner.settings.markWhatsNewSeen());
    expect(storage.write).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('disk full')));
    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stored)).toMatchObject({ whatsNewSeen: WHATS_NEW_STAMP });
    expect(JSON.parse(stored).parentPolicies.feedback).toBe('always');
    expect(owner.getState().settings).toMatchObject({ status: 'ready', saved: false });
    expect(host.textContent).toContain('Parent Center choices were not saved');
    await clickText('Retry saving Parent Center choices');
    expect(JSON.parse(stored).parentPolicies.feedback).toBe('session');
    expect(owner.getState().settings).toMatchObject({ saved: true });
  });

  it('leaves a failed AI Art switch save to its own section', async () => {
    const storage = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {
        throw new Error('disk full');
      }),
    };
    const owner = await openParentCenter(storage);
    await act(async () => owner.setAiEnabled(true));
    expect(owner.settings.aiSaveFailed()).toBe(true);
    expect(host.textContent).not.toContain('Retry saving Parent Center choices');
  });
});

describe('Parent Center in Settings', () => {
  async function mountSettings({ dimensions = PHONE, checkDue = true } = {}) {
    records.dimensions = dimensions;
    let current;
    const owner = createSoundSettings(
      { read: async () => null, write: async () => {} },
      (state) => (current = state)
    );
    await owner.load();
    const onUnlock = vi.fn();
    const onLeave = vi.fn();
    let setUnlocked;
    function Settings() {
      const [unlocked, set] = useState(false);
      setUnlocked = set;
      return createElement(NativeSoundSettingsDialog, {
        ...nativeSettingsProps(owner, current),
        parentCenter: {
          unlocked,
          checkDue,
          onUnlock,
          onLeave,
          section: createElement('p', { 'data-testid': 'unlocked-controls' }, 'controls'),
        },
      });
    }
    await mount(createElement(Settings));
    return { onUnlock, onLeave, unlock: (value) => act(async () => setUnlocked(value)) };
  }
  const row = () => host.querySelector('[role="list"] button[aria-label^="Parent Center, "]');

  it('asks for the check from the hub row and opens the section only once it is solved', async () => {
    const settings = await mountSettings();
    await act(async () => row().click());
    expect(settings.onUnlock).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-testid="unlocked-controls"]')).toBeNull();
    expect(row()).not.toBeNull();
    await settings.unlock(true);
    expect(host.querySelector('[data-testid="unlocked-controls"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Manage Parent Center"]')).toBeNull();
    await click('Back');
    expect(settings.onLeave).toHaveBeenCalledOnce();
  });

  it("keeps the wide pane's Parent Center behind the lock card until its check is solved", async () => {
    const settings = await mountSettings({ dimensions: TABLET });
    expect(host.querySelector('[data-testid="unlocked-controls"]')).toBeNull();
    expect(host.textContent).toContain(PARENT_CENTER_COPY.lock);
    const tocRow = [...host.querySelectorAll('[data-testid="sidebar-row"]')].find((node) =>
      node.getAttribute('aria-label').startsWith('Parent Center')
    );
    await act(async () => tocRow.click());
    expect(settings.onUnlock).toHaveBeenCalledOnce();
    await settings.unlock(true);
    expect(host.querySelector('[data-testid="unlocked-controls"]')).not.toBeNull();
    expect(host.textContent).not.toContain(PARENT_CENTER_COPY.lock);
  });

  it("shows the wide pane's Parent Center outright when its policy asks for no check", async () => {
    const settings = await mountSettings({ dimensions: TABLET, checkDue: false });
    expect(host.querySelector('[data-testid="unlocked-controls"]')).not.toBeNull();
    expect(host.textContent).not.toContain(PARENT_CENTER_COPY.lock);
    expect(settings.onUnlock).not.toHaveBeenCalled();
  });

  it('stands the lock in for the controls when the section loses its check', async () => {
    const settings = await mountSettings();
    await settings.unlock(true);
    await settings.unlock(false);
    expect(host.querySelector('[data-testid="unlocked-controls"]')).toBeNull();
    expect(host.textContent).toContain(PARENT_CENTER_COPY.lock);
    await clickText(PARENT_CENTER_COPY.unlock);
    expect(settings.onUnlock).toHaveBeenCalledOnce();
  });
});

// The equation reads the question, then the answer: `=` and one dab per answer digit.
function dabs() {
  const answer = host.querySelector(`${GATE_MODAL} [role="img"]`).lastElementChild;
  return [...answer.children].slice(1).map((node) => node.textContent);
}

// The mock renderer drops aria-disabled from the DOM; RSD hands it to native as accessibilityState.
function keyLocks() {
  const keys = records.props.filter(
    (props) =>
      props.role === 'button' &&
      (!props.accessibilityLabel || ['Delete', 'Check answer'].includes(props.accessibilityLabel))
  );
  return keys
    .slice(-PARENT_GATE_KEYPAD_KEYS.length)
    .map((props) => props.accessibilityState.disabled);
}

async function openGateOnFixedProblem() {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(1_000_000);
  vi.spyOn(Math, 'random').mockReturnValue(FIXED_OPERAND_RANDOM);
  const owner = await mountProduct();
  await click('Parent Center fixture entry');
  expect(gateProblem()).toEqual({ x: 6, y: 6 });
  return owner;
}

async function answerWrong() {
  await tapGateKeys(1, 2, 'Check answer');
  vi.setSystemTime(Date.now() + PARENT_GATE_SHAKE_MS);
}

describe('RSD Parental Gate card', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
  });

  it('heads the challenge with the mascot, the shipping title and paint-daub operands', async () => {
    records.journalHostProps = true;
    await openGateOnFixedProblem();
    const modal = host.querySelector(GATE_MODAL);
    const heading = modal.querySelector('[role="heading"]');
    expect(heading.textContent).toBe(PARENT_GATE_COPY.title);
    const header = heading.parentElement.parentElement;
    expect(header.firstElementChild.tagName).toBe('svg');
    // React Native's role vocabulary has no `header`; Fabric logs and drops it.
    expect(header.hasAttribute('role')).toBe(false);
    expect(modal.textContent).toContain(PARENT_GATE_COPY.managingSubtitle);
    const equation = modal.querySelector('[role="img"]');
    expectGateEquation('What is 6 times 6?');
    expectGateEquationGeometry();
    const fills = [...equation.querySelectorAll('path')].map((path) => path.getAttribute('fill'));
    expect(fills.slice(0, 2)).toEqual([paletteHex('Purple'), colorFamilyShade('blues', 4)]);
    expect(dabs()).toEqual(['', '']);
    expect(modal.querySelector('input')).toBeNull();
    expect(modal.textContent).not.toContain(PARENT_GATE_COPY.manageLead);
  });

  it('offers the way to manage the checks from any other protected action', async () => {
    const owner = await mountProduct();
    await act(async () => owner.port.request('feedback', () => {}));
    const modal = host.querySelector(GATE_MODAL);
    expect(modal.textContent).toContain(PARENT_GATE_COPY.subtitle);
    const footer = [...modal.querySelectorAll('button')].find((node) =>
      node.textContent.startsWith(PARENT_GATE_COPY.manageLead)
    );
    expect(footer.textContent).toBe(
      `${PARENT_GATE_COPY.manageLead}${PARENT_GATE_COPY.managePlace}›${PARENT_GATE_COPY.managePolicies}`
    );
    // Native lays out a View, not Text: each place a centred row of icon and name (#3079).
    const path = footer.lastElementChild;
    expect([path, ...path.children].map((node) => node.tagName)).toEqual([
      'DIV',
      'DIV',
      'SPAN',
      'DIV',
    ]);
    for (const place of [path.children[0], path.children[2]])
      expect(place.firstElementChild.tagName).toBe('svg');
    await act(async () => footer.click());
    expect(owner.getState().gate.feature).toBe('parentCenter');
    expect(host.querySelector(GATE_MODAL).textContent).toContain(PARENT_GATE_COPY.managingSubtitle);
  });

  it('takes native hardware keys only while a challenge is mounted', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(FIXED_OPERAND_RANDOM);
    const owner = await mountProduct();
    await click('Parent Center fixture entry');
    const receiver = records.props.findLast((props) => props.testID === 'parent-gate-keyboard');
    expect(receiver).toBeDefined();
    expect(receiver.style).toMatchObject({ width: 1, height: 1 });
    await act(async () => receiver.onGateKey({ nativeEvent: { key: '3' } }));
    expect(owner.gate.getState().input).toBe('3');
    await act(async () => receiver.onGateKey({ nativeEvent: { key: 'delete' } }));
    expect(owner.gate.getState().input).toBe('');
    await act(async () => {
      receiver.onGateKey({ nativeEvent: { key: '3' } });
      receiver.onGateKey({ nativeEvent: { key: '6' } });
      receiver.onGateKey({ nativeEvent: { key: 'submit' } });
    });
    expect(owner.gate.getState().unlocked).toBe(true);
    expect(host.querySelector('[data-testid="parent-gate-keyboard"]')).toBeNull();
    expect(() => receiver.onGateKey({ nativeEvent: { key: 'unknown' } })).toThrow('Unrecognized');
    await finishGateHold();
  });

  it('holds the Unlocked card, without a close, before the destination shows', async () => {
    await openGateOnFixedProblem();
    await tapGateKeys(...FIXED_ANSWER_DIGITS, 'Check answer');
    const modal = host.querySelector(GATE_MODAL);
    expect(modal.textContent).toBe(`${PARENT_GATE_COPY.unlocked}${PARENT_GATE_COPY.unlockedSub}`);
    expect(modal.querySelector('[aria-label="Close"]')).toBeNull();
    expect(modal.querySelector('[role="status"]')).not.toBeNull();
    await finishGateHold();
    expect(host.querySelector(GATE_MODAL)).toBeNull();
    expect(host.querySelector(SECTION)).not.toBeNull();
  });

  it('lays out the shipping keys with their shipping labels and no device keyboard', async () => {
    await openGateOnFixedProblem();
    const keys = PARENT_GATE_KEYPAD_KEYS.map((key) =>
      typeof key === 'number' ? key : PARENT_GATE_KEY_LABELS[key]
    );
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'Delete', 'Check answer']);
    const rows = keys.map((key) => gateKey(key).parentElement);
    expect(new Set(rows).size).toBe(4);
    for (const [index, key] of keys.entries())
      expect(rows[index], `row of ${key}`).toBe(rows[index - (index % 3)]);
    expect(keyLocks()).toEqual(keys.map(() => false));
  });

  it('deletes the last tapped digit before the answer is checked', async () => {
    await openGateOnFixedProblem();
    await tapGateKeys(3, 9);
    expect(dabs()).toEqual(['3', '9']);
    await tapGateKeys('Delete');
    expect(dabs()).toEqual(['3', '']);
    await tapGateKeys(6, 'Check answer');
    await finishGateHold();
    expect(host.querySelector(SECTION)).not.toBeNull();
  });

  it('treats a wrong answer, and a digit past the answer, as a miss on a fresh problem', async () => {
    const owner = await openGateOnFixedProblem();
    vi.mocked(Math.random).mockReturnValue(REGENERATED_OPERAND_RANDOM);
    await answerWrong();
    expectGateEquation('What is 9 times 9?');
    expect(host.querySelector(SECTION)).toBeNull();
    expect(host.textContent).toContain(PARENT_GATE_ERROR_MESSAGE);
    expect(dabs()).toEqual(['', '']);
    await tapGateKeys(...REGENERATED_ANSWER_DIGITS);
    expect(owner.getState().gate.input).toBe('81');
    expect(owner.getState().gate.unlocked).toBe(false);
    expect(host.querySelector(SECTION)).toBeNull();
    await tapGateKeys(1);
    expect(owner.getState().gate.input).toBe('');
    expect(host.querySelector(GATE_MODAL)).not.toBeNull();
  });

  it('locks the keypad after three misses and takes the answer once the pause ends', async () => {
    await openGateOnFixedProblem();
    for (let miss = 0; miss < 2; miss += 1) await answerWrong();
    vi.mocked(Math.random).mockReturnValue(REGENERATED_OPERAND_RANDOM);
    await answerWrong();
    expect(host.textContent).toContain('Too many tries — wait 30 seconds');
    expect(keyLocks()).toEqual(PARENT_GATE_KEYPAD_KEYS.map(() => true));
    expectGateEquation('What is 9 times 9?');
    await tapGateKeys(...REGENERATED_ANSWER_DIGITS, 'Check answer');
    expect(dabs()).toEqual(['', '']);
    expect(host.textContent).toContain('Too many tries — wait 30 seconds');
    expect(host.querySelector(SECTION)).toBeNull();
    vi.setSystemTime(Date.now() + GATE_LOCKOUT_BASE_MS);
    await tapGateKeys(...REGENERATED_ANSWER_DIGITS);
    expect(keyLocks()).toEqual(PARENT_GATE_KEYPAD_KEYS.map(() => false));
    await tapGateKeys('Check answer');
    await finishGateHold();
    expect(host.querySelector(SECTION)).not.toBeNull();
  });

  it('stands the keypad beside the problem on a landscape phone', async () => {
    records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
    await openGateOnFixedProblem();
    const keypad = gateKey(1).parentElement.parentElement;
    const problem = host.querySelector(`${GATE_MODAL} [role="img"]`).parentElement;
    expect(keypad.parentElement).toBe(problem.parentElement.parentElement);
  });
});
