import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const noteSource = join(repoRoot, '.ruler', 'skill-notes');

// Ruler's recursive rule loader concatenates every .md under .ruler/ into the
// root instruction files. A skill note saved as a plain .md therefore lands in
// every session's context window — silently, and growing with each note added.
// The two sides can't share code, so they are checked against each other here.
describe('skill notes stay out of the root instruction files', () => {
  it('authors every note as .md.template', () => {
    const stray = readdirSync(noteSource).filter((file) => file.endsWith('.md'));

    expect(stray).toEqual([]);
  });

  it.each(['CLAUDE.md', 'AGENTS.md'])('does not concatenate a note into %s', (file) => {
    const instructions = readFileSync(join(repoRoot, file), 'utf8');

    expect(instructions).not.toMatch(/<!-- Source: \.ruler[/\\]skill-notes[/\\]/);
  });
});
