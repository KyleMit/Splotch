import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mirrorSkillNotes, sharedNoteSource } from '../mirror-skill-notes.mjs';
import { DIRECT_PROVIDER_SKILLS } from '../lib/direct-provider-skills.mjs';
import { PROVIDERS, SHARED_NOTES_SOURCE, notesDir } from '../lib/layout.mjs';

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-ruler-skill-notes-'));
  roots.push(root);
  return root;
}

function write(root, path, body) {
  const output = join(root, path);
  mkdirSync(join(output, '..'), { recursive: true });
  writeFileSync(output, body);
}

const noteIn = (root, provider, file) => join(root, notesDir(provider), file);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('mirrorSkillNotes', () => {
  it('writes each shared note to every provider tree with its source marker', () => {
    const root = makeRoot();
    write(root, join(SHARED_NOTES_SOURCE, sharedNoteSource('shared')), 'design history\n');

    mirrorSkillNotes(root);

    for (const provider of PROVIDERS) {
      expect(readFileSync(noteIn(root, provider, 'shared.md'), 'utf8')).toBe(
        '<!-- Source: .ruler/skill-notes/shared.md.template -->\n\ndesign history\n'
      );
    }
  });

  it('removes a mirrored note whose source is gone from every provider tree', () => {
    const root = makeRoot();
    write(root, join(SHARED_NOTES_SOURCE, sharedNoteSource('shared')), 'note\n');
    for (const provider of PROVIDERS) {
      write(root, join(notesDir(provider), 'old.md'), 'orphan\n');
    }

    mirrorSkillNotes(root);

    for (const provider of PROVIDERS) {
      expect(existsSync(noteIn(root, provider, 'old.md'))).toBe(false);
      expect(existsSync(noteIn(root, provider, 'shared.md'))).toBe(true);
    }
  });

  // The stale filter is per provider: a direct note is preserved only in the
  // tree its registry entry names, and is an orphan anywhere else.
  it('keeps a direct note only in the provider trees that register it', () => {
    const root = makeRoot();
    for (const { name } of DIRECT_PROVIDER_SKILLS) {
      for (const provider of PROVIDERS) {
        write(root, join(notesDir(provider), `${name}.md`), 'direct\n');
      }
    }

    mirrorSkillNotes(root);

    for (const { name, providers } of DIRECT_PROVIDER_SKILLS) {
      for (const provider of PROVIDERS) {
        expect(existsSync(noteIn(root, provider, `${name}.md`)), `${provider}: ${name}`).toBe(
          providers.includes(provider)
        );
      }
    }
    expect(
      DIRECT_PROVIDER_SKILLS.some(({ providers }) => providers.length < PROVIDERS.length)
    ).toBe(true);
  });

  // Ruler's rule loader walks .ruler/ recursively, so depth does not hide a note.
  it.each(['stray.md', join('nested', 'stray.md')])(
    'rejects a plain .md note (%s) before writing any provider tree',
    (stray) => {
      const root = makeRoot();
      write(root, join(SHARED_NOTES_SOURCE, sharedNoteSource('shared')), 'note\n');
      write(root, join(SHARED_NOTES_SOURCE, stray), 'note\n');
      write(root, join(notesDir(PROVIDERS[0]), 'old.md'), 'orphan\n');

      expect(() => mirrorSkillNotes(root)).toThrow(join(SHARED_NOTES_SOURCE, stray));

      expect(existsSync(noteIn(root, PROVIDERS[0], 'old.md'))).toBe(true);
      for (const provider of PROVIDERS) {
        expect(existsSync(noteIn(root, provider, 'shared.md'))).toBe(false);
      }
    }
  );
});
