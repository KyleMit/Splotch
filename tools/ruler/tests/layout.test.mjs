import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, RULER_SOURCE, instructionsFile, notesDir, skillsDir } from '../lib/layout.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function defaultAgents() {
  const toml = readFileSync(join(repoRoot, RULER_SOURCE, 'ruler.toml'), 'utf8');
  const list = toml.match(/^default_agents\s*=\s*\[([^\]]*)\]/m)?.[1];
  if (list === undefined) throw new Error('ruler.toml declares no default_agents');
  return [...list.matchAll(/"([^"]+)"/g)].map(([, agent]) => agent);
}

function linguistGenerated(paths) {
  const output = execFileSync('git', ['check-attr', 'linguist-generated', '--', ...paths], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const [path, , value] = line.split(': ');
        return [path, value];
      })
  );
}

// Ruler writes a tree for every runner in ruler.toml, while the note mirror, the
// fork layer, and ruler:check only visit the runners in lib/layout.mjs. Neither
// TOML nor .gitattributes can import that module, so both are read against it.
describe('the ruler provider layout', () => {
  it('lists exactly the runners ruler.toml generates for', () => {
    expect([...PROVIDERS].sort()).toEqual(defaultAgents().sort());
  });

  it('marks every generated provider path linguist-generated in .gitattributes', () => {
    const probes = PROVIDERS.flatMap((provider) => [
      instructionsFile(provider),
      join('web', 'src', instructionsFile(provider)),
      join(skillsDir(provider), 'layout-probe', 'SKILL.md'),
      join(notesDir(provider), 'layout-probe.md'),
    ]);

    expect(linguistGenerated(probes)).toEqual(
      Object.fromEntries(probes.map((probe) => [probe, 'true']))
    );
  });
});
