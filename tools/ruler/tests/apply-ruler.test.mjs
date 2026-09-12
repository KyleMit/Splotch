import { afterEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

function pathTarget(root, path) {
  return path.endsWith('.md') ? join(root, path) : join(root, path, 'SKILL.md');
}

function pathContents(root, path) {
  return readFileSync(pathTarget(root, path), 'utf8');
}

// Deliberately matches any staging shape anywhere under the checkout rather
// than importing the current prefix: the defect this guards against was staging
// inside a provider tree, so moving it back there has to trip this too.
function stagingResidue(root) {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => /ruler-restore/.test(entry));
}

function providerContents(root) {
  return DIRECT_PROVIDER_PATHS.map((path) => pathContents(root, path));
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

  // The restore loop had no per-entry handling, so the first unwritable provider
  // tree abandoned every later entry — leaving them as `ruler apply` had left
  // them, deleted — and the next run blamed its own missing-source precondition.
  // A regular file where the tree belongs stands in for the sandboxed reviewer's
  // write denial: it fails the same mkdir, and unlike a chmod it is not a no-op
  // for a session running as root.
  it('restores every restorable package and names the ones it could not', () => {
    const root = makeRoot();
    const before = providerContents(root);
    const blockedRoot = join('.agents', 'skills');
    const blocked = DIRECT_PROVIDER_PATHS.filter((path) => path.startsWith(`${blockedRoot}/`));
    const restorable = DIRECT_PROVIDER_PATHS.filter((path) => !blocked.includes(path));

    let thrown;
    try {
      withPreservedDirectProviderPaths(root, () => {
        rmSync(join(root, '.claude'), { recursive: true, force: true });
        rmSync(join(root, blockedRoot), { recursive: true, force: true });
        writeFileSync(join(root, blockedRoot), 'not a directory\n');
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown?.message).toBeDefined();
    for (const path of blocked) expect(thrown.message).toContain(path);
    for (const path of restorable) {
      expect(pathContents(root, path), `${path} was abandoned`).toBe(
        before[DIRECT_PROVIDER_PATHS.indexOf(path)]
      );
    }
    expect(thrown.message).toContain('git restore --');
  });

  // Copy-before-remove is the other half of the fix, and no filesystem fault
  // reaches it deterministically on every platform: a chmod is a no-op as root,
  // and the copy's destination is a private staging root a test cannot poison.
  // So the copy and the rename are injected. A failing copy has to leave the
  // committed package exactly as it was — that is the whole point of staging.
  it('leaves the target intact when the copy into staging fails', () => {
    const root = makeRoot();
    const before = providerContents(root);
    const failing = DIRECT_PROVIDER_PATHS[2];
    const effects = {
      copy: (source, destination, options) => {
        // Faithful to a mid-copy failure: cpSync writes part of the tree before
        // it throws, so the fault has to leave a partial stage behind too.
        if (source.endsWith(failing)) {
          mkdirSync(destination, { recursive: true });
          writeFileSync(join(destination, 'SKILL.md'), 'partial\n');
          throw new Error('simulated copy denial');
        }
        cpSync(source, destination, options);
      },
      rename: renameSync,
    };

    let thrown;
    try {
      withPreservedDirectProviderPaths(
        root,
        () => {
          for (const path of DIRECT_PROVIDER_PATHS) {
            writeFileSync(pathTarget(root, path), 'regenerated\n');
          }
        },
        effects
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown.message).toContain(failing);
    expect(thrown.message).toContain('simulated copy denial');
    expect(pathContents(root, failing)).toBe('regenerated\n');
    for (const path of DIRECT_PROVIDER_PATHS.filter((entry) => entry !== failing)) {
      expect(pathContents(root, path)).toBe(before[DIRECT_PROVIDER_PATHS.indexOf(path)]);
    }
    expect(stagingResidue(root)).toEqual([]);
  });

  // The rename is the one step that cannot keep the target: it runs after the
  // target is removed. What the run owes the operator then is the path, so the
  // `git restore` in the message repairs it.
  it('names a target the rename out of staging could not replace', () => {
    const root = makeRoot();
    const failing = DIRECT_PROVIDER_PATHS[2];
    const effects = {
      copy: cpSync,
      rename: (source, destination) => {
        if (destination.endsWith(failing)) throw new Error('simulated rename denial');
        renameSync(source, destination);
      },
    };

    let thrown;
    try {
      withPreservedDirectProviderPaths(
        root,
        () => {
          for (const path of DIRECT_PROVIDER_PATHS) {
            writeFileSync(pathTarget(root, path), 'regenerated\n');
          }
        },
        effects
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown.message).toContain(`git restore -- ${failing}`);
    expect(existsSync(join(root, failing))).toBe(false);
    expect(stagingResidue(root)).toEqual([]);
  });

  // The staging root is created per run at the repo root, so a stale stage from
  // a hard-killed run can neither be met by a later run nor be loaded as a skill
  // out of a provider tree. A no-op run must not leave one either.
  it('leaves no staging root behind, including when nothing needs restoring', () => {
    const root = makeRoot();

    withPreservedDirectProviderPaths(root, () => {});
    expect(stagingResidue(root)).toEqual([]);

    expect(() =>
      withPreservedDirectProviderPaths(root, () => {
        rmSync(join(root, '.claude'), { recursive: true, force: true });
        rmSync(join(root, '.agents', 'skills'), { recursive: true, force: true });
        writeFileSync(join(root, '.agents', 'skills'), 'not a directory\n');
      })
    ).toThrow();
    expect(stagingResidue(root)).toEqual([]);
  });

  // `ruler apply` can fail before it reaches a provider tree, and then the
  // packages in it need no write at all — the run must report only the failure
  // it hit, not manufacture restore failures against packages already correct.
  it('skips a package generation never replaced', () => {
    const root = makeRoot();
    const before = providerContents(root);
    const untouched = join(root, '.agents', 'skills');
    const guarded = statSync(untouched).mtimeMs;

    expect(() =>
      withPreservedDirectProviderPaths(root, () => {
        rmSync(join(root, '.claude'), { recursive: true, force: true });
        throw new Error('ruler EPERM on .agents');
      })
    ).toThrow('ruler EPERM on .agents');

    expect(providerContents(root)).toEqual(before);
    expect(statSync(untouched).mtimeMs).toBe(guarded);
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
