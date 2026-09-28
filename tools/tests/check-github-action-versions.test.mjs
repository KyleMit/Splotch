import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInventory,
  compareWithLatest,
  listPinFiles,
} from '../check-github-action-versions.mjs';

const CACHE_SHA = '55cc8345863c7cc4c66a329aec7e433d2d1c52a9';
const DIGIT_LED_SHA = '11bd71901bbe5b1630ceea73d27597364c9af683';

const fixtures = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-gha-versions-'));
  fixtures.push(root);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

const refsOf = (entries) => new Map(entries.map(([ref, hint]) => [ref, { hint, uses: [] }]));

describe('the pin inventory', () => {
  it('reads the composite actions a workflow calls as well as the workflow', () => {
    const root = repoWith({
      '.github/workflows/ci.yml': [
        'jobs:',
        '  test:',
        '    steps:',
        '      - uses: actions/checkout@v7',
        '      - uses: ./.github/actions/setup',
      ].join('\n'),
      '.github/actions/setup/action.yml': [
        'runs:',
        '  using: composite',
        '  steps:',
        `    - uses: actions/cache@${CACHE_SHA} # v6.1.0`,
      ].join('\n'),
      '.github/actions/setup/README.md': 'uses: actions/not-a-pin@v1',
    });

    const files = listPinFiles(root);
    const inventory = buildInventory(root, files);

    expect(files).toEqual(['.github/actions/setup/action.yml', '.github/workflows/ci.yml']);
    expect([...inventory.keys()].sort()).toEqual(['actions/cache', 'actions/checkout']);
    expect(inventory.get('actions/cache').refs.get(CACHE_SHA)).toEqual({
      hint: 'v6.1.0',
      uses: [{ file: '.github/actions/setup/action.yml', line: 4 }],
    });
  });
});

describe('comparing pins with the latest release', () => {
  it('reads a SHA pin by its version comment', () => {
    expect(compareWithLatest(refsOf([[CACHE_SHA, 'v6.1.0']]), 'v7.0.0')).toEqual({
      behind: [CACHE_SHA],
      unversioned: [],
    });
  });

  it('reports a SHA pin with no version comment instead of reading its digits as a major', () => {
    expect(compareWithLatest(refsOf([[DIGIT_LED_SHA, undefined]]), 'v12.0.0')).toEqual({
      behind: [],
      unversioned: [DIGIT_LED_SHA],
    });
  });

  it('passes a tag pin at the latest major', () => {
    expect(compareWithLatest(refsOf([['v7', undefined]]), 'v7.2.0')).toEqual({
      behind: [],
      unversioned: [],
    });
  });
});
