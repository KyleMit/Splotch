import { describe, expect, it } from 'vitest';
import { managedInputNames, partitionInputs } from '../gen-model-fixtures.mjs';

const SPECS = [
  { id: 'art-detail__cat-med', dim: 'square' },
  { id: 'night__owl', dim: 'tall' },
];
const SAMPLES = ['gen__boat-pond__square.svg', 'crayon__house__wide.png'];

describe('managedInputNames', () => {
  it('names one input per fixture spec and per committed sample', () => {
    expect(managedInputNames(SPECS, SAMPLES)).toEqual(
      new Set([
        'art-detail__cat-med__square.png',
        'night__owl__tall.png',
        'gen__boat-pond__square.png',
        'crayon__house__wide.png',
      ])
    );
  });
});

describe('partitionInputs', () => {
  const managed = managedInputNames(SPECS, SAMPLES);

  // The contract that costs money when it breaks: model-eval:gen-inputs makes
  // paid calls and model-eval:gen-crayon drives the live app, both writing into
  // inputs/, and their results only reach samples/ after a human has looked at
  // them. A fixtures run in that window must not delete them.
  it('keeps authored output that has not been promoted into samples/ yet', () => {
    const { owned, unclaimed } = partitionInputs(
      [
        'art-detail__cat-med__square.png',
        'gen__boat-pond__square.png',
        'mess__brand-new__wide.png',
        'crayon__balloon__tall.png',
      ],
      managed
    );
    expect(unclaimed).toEqual(['mess__brand-new__wide.png', 'crayon__balloon__tall.png']);
    expect(owned).toEqual(['art-detail__cat-med__square.png', 'gen__boat-pond__square.png']);
  });

  it('ignores everything that is not a PNG', () => {
    const { owned, unclaimed } = partitionInputs(['notes.md', '.DS_Store'], managed);
    expect(owned).toEqual([]);
    expect(unclaimed).toEqual([]);
  });
});
