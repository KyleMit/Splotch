import { expect, it } from 'vitest';
import { STYLE_NAMES } from '../../src/lib/ai/styles.ts';
import { AI_STYLES } from '../../src/ai/contract.ts';

it('offers the AI styles in the order STYLE_NAMES gives the shipping picker', () => {
  expect([...AI_STYLES]).toEqual(STYLE_NAMES);
});
