import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './lib/utils.mjs';

process.chdir(ROOT);

const SOURCE_ROOT = join('.ruler', 'agent-overrides');
const TARGETS = {
  claude: '.claude',
  codex: '.agents',
};

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function assertSafeSource(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`agent override cannot be a symlink: ${path} -> ${readlinkSync(path)}`);
  }
  const sourceRoot = realpathSync(SOURCE_ROOT);
  const actual = realpathSync(path);
  if (actual !== sourceRoot && !actual.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error(`agent override escaped ${SOURCE_ROOT}: ${path}`);
  }
}

let copied = 0;
if (existsSync(SOURCE_ROOT)) {
  for (const agent of readdirSync(SOURCE_ROOT)) {
    const targetRoot = TARGETS[agent];
    if (!targetRoot) throw new Error(`unsupported ruler agent override target: ${agent}`);
    const agentRoot = join(SOURCE_ROOT, agent);
    assertSafeSource(agentRoot);

    for (const source of filesUnder(agentRoot)) {
      assertSafeSource(source);
      const sourceRelative = relative(agentRoot, source);
      if (!sourceRelative.endsWith('.template')) {
        throw new Error(`agent override source must end in .template: ${source}`);
      }
      const output = resolve(targetRoot, sourceRelative.replace(/\.template$/, ''));
      const resolvedTarget = resolve(targetRoot);
      if (output !== resolvedTarget && !output.startsWith(`${resolvedTarget}${sep}`)) {
        throw new Error(`agent override escaped ${targetRoot}: ${source}`);
      }
      if (!existsSync(output)) {
        throw new Error(`agent override must replace a Ruler-generated file: ${output}`);
      }
      mkdirSync(dirname(output), { recursive: true });
      cpSync(source, output);
      copied += 1;
    }
  }
}

console.log(`[agent-overrides] applied ${copied} runner-specific file(s)`);
