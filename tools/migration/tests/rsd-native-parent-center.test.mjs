import { act, createElement, useEffect, useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host, mount, records, checkedSwitch } from './rsd-native-selection-host.mjs';
import { createDrawingProduct } from '../../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdParentCenterSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentCenterSection.tsx';
import { RsdParentGateSheet } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateSheet.tsx';
import { RsdAction } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import {
  PARENT_GATE_KEYPAD_KEYS,
  PARENT_GATE_SHAKE_MS,
} from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { GATE_LOCKOUT_BASE_MS } from '../../../experiments/native-architecture/src/feedback/gateLockout.ts';
import {
  PARENT_GATE_KEY_HEIGHT_PX,
  PARENT_GATE_KEY_ICON_PX,
  PARENT_GATE_KEY_ICONS,
  PARENT_GATE_KEY_LABELS,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateKeypad.tsx';
import { gateKey, gateProblem, solveParentGate, tapGateKeys } from './rsd-parent-gate-keypad.mjs';
import { WHATS_NEW_STAMP } from '../../../experiments/native-architecture/src/settings/whatsNew.ts';

const read = (path) => readFileSync(join(import.meta.dirname, '../../..', path), 'utf8');
async function click(label) {
  const button = host.querySelector(`[aria-label="${label}"]`);
  expect(button, label).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
function ProductFixture({ storage, onOwner }) {
  const [, update] = useState(0);
  const [instance] = useState(() =>
    createDrawingProduct(storage, () => update((value) => value + 1))
  );
  onOwner(instance);
  useEffect(() => {
    void instance.settings.load();
    return instance.dispose;
  }, [instance]);
  const state = instance.getState();
  return createElement(
    DrawingAppearanceProvider,
    { preference: 'dark' },
    createElement(RsdAction, {
      label: 'Parent Center fixture entry',
      onClick: instance.openParentCenter,
    }),
    state.parentCenterOpen ? createElement(RsdParentCenterSection, { owner: instance }) : null,
    state.gate.open
      ? createElement(RsdParentGateSheet, { owner: instance, state: state.gate })
      : null
  );
}
async function mountProduct(
  storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) }
) {
  let owner;
  await mount(
    createElement(ProductFixture, { storage, onOwner: (instance) => (owner = instance) })
  );
  return owner;
}
it('mounts actual RSD shared gate, policy radio state, confirmation and persisted master controls', async () => {
  const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
  const owner = await mountProduct(storage);
  await click('Parent Center fixture entry');
  expect(storage.write).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Grown-ups only');
  await solveParentGate();
  const master = host.querySelector('[aria-label="AI picture creation"]');
  checkedSwitch(master, false);
  expect(
    records.props.findLast((props) => props.accessibilityLabel === 'AI picture creation')
      .accessibilityState.checked
  ).toBe(false);
  await click('AI picture creation');
  checkedSwitch(host.querySelector('[aria-label="AI picture creation"]'), true);
  expect(owner.port.consent().enabled).toBe(true);
  expect(JSON.parse(storage.write.mock.calls[0][0]).aiEnabled).toBe(true);
  expect(
    host.querySelector('[aria-label="Every time: Reporting an AI picture"]').dataset.checked
  ).toBe('true');
  await click('Per session: Reporting an AI picture');
  expect(owner.getState().settings.parentPolicies.imageReport).toBe('session');
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    version: 10,
    parentPolicies: { imageReport: 'session' },
  });
  await click('Never: Opening Parent Center');
  expect(owner.getState().settings.parentPolicies.parentCenter).toBe('always');
  expect(host.textContent).toContain('without a check on this device');
  await click('Confirm Parent Center Never');
  expect(owner.getState().settings.parentPolicies.parentCenter).toBe('never');
  await click('Keep drawing');
  await click('Parent Center fixture entry');
  expect(host.textContent).not.toContain('Grown-ups only');
});

it("keeps a failed AI-disable save pending and retryable after the queued What's New stamp writes", async () => {
  let stored = null;
  let rejectDisable;
  const storage = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  const owner = await mountProduct(storage);
  await click('Parent Center fixture entry');
  await solveParentGate();
  await click('AI picture creation');
  expect(JSON.parse(stored)).toMatchObject({ aiEnabled: true, whatsNewSeen: null });
  storage.write.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectDisable = reject;
      })
  );
  await click('AI picture creation');
  expect(owner.getState().settings.status).toBe('saving');
  await act(async () => owner.settings.markWhatsNewSeen());
  expect(storage.write).toHaveBeenCalledTimes(2);
  await act(async () => rejectDisable(new Error('disk full')));
  expect(storage.write).toHaveBeenCalledTimes(3);
  expect(JSON.parse(stored)).toMatchObject({ aiEnabled: true, whatsNewSeen: WHATS_NEW_STAMP });
  expect(owner.getState().settings).toMatchObject({
    status: 'ready',
    aiEnabled: true,
    saved: false,
    whatsNewSeen: WHATS_NEW_STAMP,
  });
  checkedSwitch(host.querySelector('[aria-label="AI picture creation"]'), true);
  expect(host.textContent).toContain('Parent Center choices were not saved');
  await click('Retry saving Parent Center choices');
  expect(JSON.parse(stored)).toMatchObject({ aiEnabled: false, whatsNewSeen: WHATS_NEW_STAMP });
  expect(owner.getState().settings).toMatchObject({ aiEnabled: false, saved: true });
  checkedSwitch(host.querySelector('[aria-label="AI picture creation"]'), false);
});

it('rejects missing and incorrect native switch checked mappings', () => {
  const node = document.createElement('button');
  node.setAttribute('role', 'switch');
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
  node.dataset.checked = 'true';
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
  node.dataset.checked = 'false';
  expect(() => checkedSwitch(node, false)).not.toThrow();
  node.setAttribute('role', 'button');
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
});

// Math.random 0.5 picks operand 6 every time: a two-digit answer (36) on every problem.
const FIXED_OPERAND_RANDOM = 0.5;
const FIXED_ANSWER_DIGITS = [3, 6];

function dabs() {
  const equation = [...host.querySelectorAll('[data-native-modal="Grown-ups only"] span')].find(
    (node) => /^\d × \d =$/.test(node.textContent)
  );
  return [...equation.parentElement.children].slice(1).map((node) => node.textContent);
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
  vi.useFakeTimers({ toFake: ['Date'] });
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

describe('RSD Parental Gate on-screen keypad', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lays out the shipping keys with their shipping labels and no device keyboard', async () => {
    await openGateOnFixedProblem();
    const modal = host.querySelector('[data-native-modal="Grown-ups only"]');
    expect(modal.querySelector('input')).toBeNull();
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

  it('opens the gated destination after the answer is tapped in and checked', async () => {
    await openGateOnFixedProblem();
    await tapGateKeys(...FIXED_ANSWER_DIGITS);
    expect(dabs()).toEqual(['3', '6']);
    expect(host.querySelector('[data-native-modal="Parent Center"]')).toBeNull();
    await tapGateKeys('Check answer');
    expect(host.querySelector('[data-native-modal="Grown-ups only"]')).toBeNull();
    expect(host.querySelector('[data-native-modal="Parent Center"]')).not.toBeNull();
  });

  it('deletes the last tapped digit before the answer is checked', async () => {
    await openGateOnFixedProblem();
    await tapGateKeys(3, 9);
    expect(dabs()).toEqual(['3', '9']);
    await tapGateKeys('Delete');
    expect(dabs()).toEqual(['3', '']);
    await tapGateKeys(6, 'Check answer');
    expect(host.querySelector('[data-native-modal="Parent Center"]')).not.toBeNull();
  });

  it('treats a wrong answer, and a digit past the answer, as a miss on a fresh problem', async () => {
    const owner = await openGateOnFixedProblem();
    await answerWrong();
    expect(host.querySelector('[data-native-modal="Parent Center"]')).toBeNull();
    expect(host.textContent).toContain('Try a new problem.');
    expect(dabs()).toEqual(['', '']);
    await tapGateKeys(3, 6, 6);
    expect(owner.getState().gate.input).toBe('');
    expect(host.querySelector('[data-native-modal="Grown-ups only"]')).not.toBeNull();
  });

  it('locks the keypad after three misses and takes the answer once the pause ends', async () => {
    await openGateOnFixedProblem();
    for (let miss = 0; miss < 3; miss += 1) await answerWrong();
    expect(host.textContent).toContain('Too many tries — wait 30 seconds');
    expect(keyLocks()).toEqual(PARENT_GATE_KEYPAD_KEYS.map(() => true));
    await tapGateKeys(...FIXED_ANSWER_DIGITS, 'Check answer');
    expect(dabs()).toEqual(['', '']);
    expect(host.textContent).toContain('Too many tries — wait 30 seconds');
    expect(host.querySelector('[data-native-modal="Parent Center"]')).toBeNull();
    vi.setSystemTime(Date.now() + GATE_LOCKOUT_BASE_MS);
    await tapGateKeys(...FIXED_ANSWER_DIGITS);
    expect(keyLocks()).toEqual(PARENT_GATE_KEYPAD_KEYS.map(() => false));
    await tapGateKeys('Check answer');
    expect(host.querySelector('[data-native-modal="Parent Center"]')).not.toBeNull();
  });

  it('pins the keys, labels, icons and key size to the shipping keypad', () => {
    const state = read('web/src/lib/state/parentalGate.svelte.ts');
    const keypad = read('web/src/lib/components/ParentalGateKeypad.svelte');
    const shippingKeys = state.match(/export const GATE_KEYPAD_KEYS = \[(.*)\] as const;/)[1];
    const checkKey = state.match(/export const GATE_CHECK_KEY = '(\w+)';/)[1];
    expect(
      shippingKeys
        .split(', ')
        .map((key) => (key === 'GATE_CHECK_KEY' ? checkKey : JSON.parse(key.replaceAll("'", '"'))))
    ).toEqual([...PARENT_GATE_KEYPAD_KEYS]);
    expect(keypad).toContain(
      `const KEY_ICONS = { delete: '${PARENT_GATE_KEY_ICONS.delete}', submit: '${PARENT_GATE_KEY_ICONS.submit}' } as const;`
    );
    expect(keypad).toContain(
      `const KEY_LABELS = { delete: '${PARENT_GATE_KEY_LABELS.delete}', submit: '${PARENT_GATE_KEY_LABELS.submit}' } as const;`
    );
    const base = keypad.match(/\.gate-key \{[^}]*height: (\d+)px;/)[1];
    expect(Number(base)).toBe(PARENT_GATE_KEY_HEIGHT_PX);
    const icon = keypad.match(/:global\(\.gate-key-icon\) \{\s*width: (\d+)px;/)[1];
    expect(Number(icon)).toBe(PARENT_GATE_KEY_ICON_PX);
  });
});
