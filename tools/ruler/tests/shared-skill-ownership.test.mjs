import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  RULER_APPLY_ARGS,
  RULER_MANAGED_MANIFEST,
  claimSharedSkillOutputs,
} from '../apply-ruler.mjs';
import { PROVIDERS, SHARED_SKILLS_SOURCE, skillsDir } from '../lib/layout.mjs';

// Runs the installed Ruler CLI over a scratch project whose generated skill
// copies predate Ruler's ownership manifest, the state this repository's
// trees were in when Ruler 0.3.46 arrived.
const RULER_BIN = join(ROOT, 'node_modules', '.bin', 'ruler');

const RULER_CONFIG = `default_agents = [${PROVIDERS.map((p) => `"${p}"`).join(', ')}]
[gitignore]
enabled = false
[mcp]
enabled = false
[backup]
enabled = false
`;

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

const skillFile = (body) => `---\nname: demo\ndescription: A demo skill.\n---\n\n${body}\n`;
const copyOf = (provider) => join(skillsDir(provider), 'demo', 'SKILL.md');
const nativeOf = (provider) => join(skillsDir(provider), 'native', 'SKILL.md');

function scratchProject() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-ruler-ownership-'));
  roots.push(root);
  write(root, '.ruler/ruler.toml', RULER_CONFIG);
  write(root, '.ruler/AGENTS.md', '# Scratch\n');
  write(root, join(SHARED_SKILLS_SOURCE, 'demo', 'SKILL.md'), skillFile('fresh'));
  // Ruler skips skill sync entirely when the source holds no skill, so a second
  // one keeps the deletion case honest once demo's source is gone.
  write(root, join(SHARED_SKILLS_SOURCE, 'keeper', 'SKILL.md'), skillFile('kept'));
  for (const provider of PROVIDERS) {
    write(root, copyOf(provider), skillFile('stale'));
    write(root, nativeOf(provider), 'provider-native package\n');
    write(
      root,
      join(skillsDir(provider), RULER_MANAGED_MANIFEST),
      `${JSON.stringify({ version: 1, paths: [] })}\n`
    );
  }
  return root;
}

function rulerApply(root) {
  const result = spawnSync(RULER_BIN, [...RULER_APPLY_ARGS], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ruler apply failed: ${result.stderr}`);
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');

describe('shared skill ownership under Ruler', () => {
  it('reproduces the trap: Ruler alone leaves a copy that predates its manifest stale', () => {
    const root = scratchProject();
    rulerApply(root);

    for (const provider of PROVIDERS) {
      expect(read(root, copyOf(provider))).toBe(skillFile('stale'));
    }
  });

  it('refreshes every provider copy once the shared skills are claimed', () => {
    const root = scratchProject();
    claimSharedSkillOutputs(root);
    rulerApply(root);

    for (const provider of PROVIDERS) {
      expect(read(root, copyOf(provider))).toBe(skillFile('fresh'));
      expect(read(root, nativeOf(provider))).toBe('provider-native package\n');
    }
  });

  it('removes the copies of a shared skill whose source is deleted', () => {
    const root = scratchProject();
    claimSharedSkillOutputs(root);
    rulerApply(root);
    rmSync(join(root, SHARED_SKILLS_SOURCE, 'demo'), { recursive: true });
    claimSharedSkillOutputs(root);
    rulerApply(root);

    for (const provider of PROVIDERS) {
      expect(existsSync(join(root, copyOf(provider)))).toBe(false);
      expect(existsSync(join(root, skillsDir(provider), 'keeper', 'SKILL.md'))).toBe(true);
      expect(read(root, nativeOf(provider))).toBe('provider-native package\n');
    }
  });

  it('refuses a manifest whose paths are not a string list', () => {
    const root = scratchProject();
    write(root, join(skillsDir(PROVIDERS[0]), RULER_MANAGED_MANIFEST), '{"paths": "demo"}\n');

    expect(() => claimSharedSkillOutputs(root)).toThrow(/no string array of paths/);
  });
});
