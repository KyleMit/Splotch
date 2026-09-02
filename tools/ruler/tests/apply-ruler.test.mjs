import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DIRECT_PROVIDER_PATHS,
  FORBIDDEN_DIRECT_PROVIDER_SOURCES,
  RULER_STEP_PATHS,
  withPreservedDirectProviderPaths,
} from '../apply-ruler.mjs';
import { sharedNoteSource } from '../mirror-skill-notes.mjs';
import { DIRECT_PROVIDER_SKILLS, directNoteNames } from '../lib/direct-provider-skills.mjs';

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

describe('Ruler apply steps', () => {
  it('resolves every child step beside the entry point', () => {
    expect(Object.keys(RULER_STEP_PATHS)).toEqual(['mirrorSkillNotes', 'applySkillForks']);
    expect(Object.values(RULER_STEP_PATHS).filter((path) => !existsSync(path))).toEqual([]);
  });
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

  // The guard listed only the bare .md path until shared notes moved to
  // SHARED_NOTE_SUFFIX, which left a note authored under the canonical suffix
  // able to shadow the direct provider package unnoticed.
  it('rejects a shared note source for the direct provider skill at the canonical suffix', () => {
    const root = makeRoot();
    const source = join(root, '.ruler', 'skill-notes', sharedNoteSource('burn-down-audits'));
    mkdirSync(join(source, '..'), { recursive: true });
    writeFileSync(source, 'competing shared note\n');

    expect(() => withPreservedDirectProviderPaths(root, () => {})).toThrow(
      'direct provider skill must not have a Ruler source'
    );
  });

  it('still rejects a stray bare-.md shared note for the direct provider skill', () => {
    const root = makeRoot();
    const source = join(root, '.ruler', 'skill-notes', 'burn-down-audits.md');
    mkdirSync(join(source, '..'), { recursive: true });
    writeFileSync(source, 'competing shared note\n');

    expect(() => withPreservedDirectProviderPaths(root, () => {})).toThrow(
      'direct provider skill must not have a Ruler source'
    );
  });

  it('preserves only the providers declared for a direct skill', () => {
    expect(DIRECT_PROVIDER_SKILLS).toContainEqual({
      name: 'implement-issue-stack',
      providers: ['codex'],
    });
    expect(directNoteNames('codex')).toContain('implement-issue-stack.md');
    expect(directNoteNames('claude')).not.toContain('implement-issue-stack.md');
  });

  it('preserves both providers for the two-sided rival launcher', () => {
    expect(DIRECT_PROVIDER_SKILLS).toContainEqual({
      name: 'run-rival-agent',
      providers: ['claude', 'codex'],
    });
    for (const provider of ['claude', 'codex']) {
      expect(directNoteNames(provider)).toContain('run-rival-agent.md');
    }
  });

  it('rejects a competing shared source for the Codex-only direct skill', () => {
    const root = makeRoot();
    const source = join(root, '.ruler', 'skills', 'implement-issue-stack');
    mkdirSync(source, { recursive: true });

    expect(() => withPreservedDirectProviderPaths(root, () => {})).toThrow(
      'direct provider skill must not have a Ruler source'
    );
  });

  it('rejects an undeclared Claude fork for the Codex-only direct skill', () => {
    const root = makeRoot();
    const source = join(root, '.ruler', 'skill-forks', 'claude', 'skills', 'implement-issue-stack');
    mkdirSync(source, { recursive: true });

    expect(() => withPreservedDirectProviderPaths(root, () => {})).toThrow(
      'direct provider skill must not have a Ruler source'
    );
  });
});
