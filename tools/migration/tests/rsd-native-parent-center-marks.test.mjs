import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './rsd-native-selection-host.mjs';
import { PARENT_GATE_KEYPAD_KEYS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import {
  PARENT_GATE_KEY_ICONS,
  PARENT_GATE_KEY_LABELS,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateKeypad.tsx';
import { PICKER_MARK_METRICS } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSegmentedPicker.tsx';

const shipping = (path) =>
  readFileSync(join(import.meta.dirname, '../../../web/src', path), 'utf8');

describe('Grown-Ups Only keypad and policy marks against shipping', () => {
  it('pins the keys, labels and icons to the shipping keypad', () => {
    const state = shipping('lib/state/parentalGate.svelte.ts');
    const keypad = shipping('lib/components/ParentalGateKeypad.svelte');
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
  });

  it('draws the matrix radio marks at the shipping ring, edge and inset', () => {
    const section = shipping('lib/components/settings/ParentCenterSection.svelte');
    const from = section.indexOf(':global(.policy-picker .option::after) {');
    const mark = section.slice(from, section.indexOf('}', from));
    expect(mark).toContain(`width: ${PICKER_MARK_METRICS.MARK_PX}px;`);
    expect(mark).toContain(
      `border: ${PICKER_MARK_METRICS.MARK_EDGE_PX}px solid var(--icon-muted);`
    );
    expect(section).toContain(
      `box-shadow: inset 0 0 0 ${PICKER_MARK_METRICS.MARK_INSET_PX}px var(--surface);`
    );
  });
});
