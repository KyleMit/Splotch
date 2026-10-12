import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECT_PROVIDER_SKILLS } from '../lib/direct-provider-skills.mjs';
import { RULER_SOURCE } from '../lib/layout.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const readSource = (file) => readFileSync(join(repoRoot, RULER_SOURCE, file), 'utf8');

// Every session loads these root instructions, and nothing else reads their
// prose lists: the skills-guide and CONTRIBUTING.md once restated the registry
// and silently dropped a skill. One statement is kept, and held to its source.
describe('root instruction prose that restates repo structure', () => {
  it('describes every registered direct provider skill in agent-files.md', () => {
    const prose = readSource('agent-files.md');

    expect(
      DIRECT_PROVIDER_SKILLS.map(({ name }) => name).filter(
        (name) => !prose.includes(`\`${name}\``)
      )
    ).toEqual([]);
  });

  it('names every nested instruction directory in knowledge-map.md', () => {
    const sentence = readSource('knowledge-map.md').match(
      /Nested `CLAUDE\.md`\/`AGENTS\.md`\s+files\s+in\s+([\s\S]*?)\s+cover\s+those\s+areas\./
    )?.[1];
    const nestedDirs = execFileSync('git', ['ls-files', '--', `*/${RULER_SOURCE}/AGENTS.md`], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((path) => `${dirname(dirname(path))}/`);

    expect(sentence).toBeDefined();
    expect(nestedDirs.length).toBeGreaterThan(0);
    expect(nestedDirs.filter((dir) => !sentence.includes(`\`${dir}\``))).toEqual([]);
  });
});
