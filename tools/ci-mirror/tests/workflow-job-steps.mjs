import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

export const testWorkflow = readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8');

// The named job's block, from its key to the next top-level job key.
export function jobBlock(yaml, jobKey) {
  const start = yaml.indexOf(`\n  ${jobKey}:\n`);
  if (start === -1) throw new Error(`No ${jobKey} job in .github/workflows/test.yml`);
  const rest = yaml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

export function runCommandsIn(block) {
  return [...block.matchAll(/^ +run: (.+)$/gm)].map(([, command]) => command.trim());
}
