import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DIRECT_PROVIDER_PATHS,
  FORBIDDEN_DIRECT_PROVIDER_SOURCES,
  withPreservedDirectProviderPaths,
} from '../ruler-apply.mjs';

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-ruler-apply-'));
  roots.push(root);
  for (const [index, path] of DIRECT_PROVIDER_PATHS.entries()) {
    const file = path.endsWith('.md') ? join(root, path) : join(root, path, 'SKILL.md');
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, `provider ${index}\n`);
  }
  return root;
}

function providerContents(root) {
  return DIRECT_PROVIDER_PATHS.map((path) => {
    const file = path.endsWith('.md') ? join(root, path) : join(root, path, 'SKILL.md');
    return readFileSync(file, 'utf8');
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('withPreservedDirectProviderPaths', () => {
  it('restores direct packages after generated trees are replaced', () => {
    const root = makeRoot();
    const before = providerContents(root);

    withPreservedDirectProviderPaths(root, () => {
      rmSync(join(root, '.claude'), { recursive: true, force: true });
      rmSync(join(root, '.agents'), { recursive: true, force: true });
      mkdirSync(join(root, '.agents', 'skills', 'shared'), { recursive: true });
      writeFileSync(join(root, '.agents', 'skills', 'shared', 'SKILL.md'), 'generated\n');
    });

    expect(providerContents(root)).toEqual(before);
    expect(existsSync(join(root, '.agents', 'skills', 'shared', 'SKILL.md'))).toBe(true);
  });

  it('restores direct packages when generation fails', () => {
    const root = makeRoot();
    const before = providerContents(root);

    expect(() =>
      withPreservedDirectProviderPaths(root, () => {
        rmSync(join(root, '.claude'), { recursive: true, force: true });
        rmSync(join(root, '.agents'), { recursive: true, force: true });
        throw new Error('generation failed');
      })
    ).toThrow('generation failed');

    expect(providerContents(root)).toEqual(before);
  });

  it('rejects a competing Ruler source for the direct provider skill', () => {
    const root = makeRoot();
    const source = join(root, FORBIDDEN_DIRECT_PROVIDER_SOURCES[0]);
    mkdirSync(source, { recursive: true });

    expect(() => withPreservedDirectProviderPaths(root, () => {})).toThrow(
      'direct provider skill must not have a Ruler source'
    );
  });
});
