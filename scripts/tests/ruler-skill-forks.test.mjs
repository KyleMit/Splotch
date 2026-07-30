import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyRulerSkillForks } from '../apply-ruler-skill-forks.mjs';
import { sharedNoteSource } from '../mirror-skill-notes.mjs';

const roots = [];

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-ruler-skill-forks-'));
  roots.push(root);
  return root;
}

function write(root, path, body) {
  const output = join(root, path);
  mkdirSync(join(output, '..'), { recursive: true });
  writeFileSync(output, body);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('applyRulerSkillForks', () => {
  it('replaces complete runner-specific skill packages and notes', () => {
    const root = makeRoot();
    write(
      root,
      '.ruler/skill-forks/claude/skills/provider-workflow/SKILL.md.template',
      'claude skill\n'
    );
    write(
      root,
      '.ruler/skill-forks/codex/skills/provider-workflow/SKILL.md.template',
      'codex skill\n'
    );
    write(
      root,
      '.ruler/skill-forks/claude/skill-notes/provider-workflow.md.template',
      'claude note\n'
    );
    write(
      root,
      '.ruler/skill-forks/codex/skill-notes/provider-workflow.md.template',
      'codex note\n'
    );
    write(root, '.claude/skills/provider-workflow/stale.txt', 'stale\n');
    write(root, '.claude/skills/shared/SKILL.md', 'shared\n');

    expect(applyRulerSkillForks(root)).toEqual({ skills: 2, notes: 2 });
    expect(readFileSync(join(root, '.claude/skills/provider-workflow/SKILL.md'), 'utf8')).toBe(
      'claude skill\n'
    );
    expect(readFileSync(join(root, '.agents/skills/provider-workflow/SKILL.md'), 'utf8')).toBe(
      'codex skill\n'
    );
    expect(existsSync(join(root, '.claude/skills/provider-workflow/stale.txt'))).toBe(false);
    expect(readFileSync(join(root, '.claude/skills/shared/SKILL.md'), 'utf8')).toBe('shared\n');
    expect(readFileSync(join(root, '.agents/skill-notes/provider-workflow.md'), 'utf8')).toBe(
      '<!-- Source: .ruler/skill-forks/codex/skill-notes/provider-workflow.md.template -->\n\ncodex note\n'
    );
  });

  it('rejects a fork that also has a shared skill implementation', () => {
    const root = makeRoot();
    write(
      root,
      '.ruler/skill-forks/claude/skills/provider-workflow/SKILL.md.template',
      'claude skill\n'
    );
    write(root, '.ruler/skills/provider-workflow/SKILL.md', 'shared skill\n');

    expect(() => applyRulerSkillForks(root)).toThrow(
      'ruler skill fork must not also have a shared implementation'
    );
  });

  it('requires a complete package for every configured runner', () => {
    const root = makeRoot();
    write(
      root,
      '.ruler/skill-forks/claude/skills/provider-workflow/SKILL.md.template',
      'claude skill\n'
    );

    expect(() => applyRulerSkillForks(root)).toThrow(
      'ruler skill fork provider-workflow is missing complete package(s) for: codex'
    );
  });

  it('rejects raw Markdown that Ruler would concatenate into root instructions', () => {
    const root = makeRoot();
    write(
      root,
      '.ruler/skill-forks/codex/skills/provider-workflow/SKILL.md.template',
      'codex skill\n'
    );
    write(root, '.ruler/skill-forks/codex/skills/provider-workflow/reference.md', 'unsafe\n');

    expect(() => applyRulerSkillForks(root)).toThrow(
      'Markdown in a ruler skill fork must end in .md.template'
    );
  });

  it('rejects a fork note without a matching runner-specific skill', () => {
    const root = makeRoot();
    write(root, '.ruler/skill-forks/codex/skill-notes/provider-workflow.md.template', 'orphan\n');

    expect(() => applyRulerSkillForks(root)).toThrow('ruler skill fork note has no matching skill');
  });

  // The collision check looked for a bare .md shared note until shared notes
  // moved to SHARED_NOTE_SUFFIX, so a fork could silently coexist with a shared
  // note authored under the canonical suffix — the ADR-0058 isolation this guard
  // exists to enforce.
  it('rejects a fork whose skill also has a shared note at the canonical suffix', () => {
    const root = makeRoot();
    write(
      root,
      '.ruler/skill-forks/claude/skills/provider-workflow/SKILL.md.template',
      'claude skill\n'
    );
    write(
      root,
      '.ruler/skill-forks/codex/skills/provider-workflow/SKILL.md.template',
      'codex skill\n'
    );
    write(
      root,
      '.ruler/skill-forks/claude/skill-notes/provider-workflow.md.template',
      'claude note\n'
    );
    write(
      root,
      '.ruler/skill-forks/codex/skill-notes/provider-workflow.md.template',
      'codex note\n'
    );
    write(root, `.ruler/skill-notes/${sharedNoteSource('provider-workflow')}`, 'shared note\n');

    expect(() => applyRulerSkillForks(root)).toThrow(
      'ruler skill fork must not also have a shared note'
    );
  });
});
