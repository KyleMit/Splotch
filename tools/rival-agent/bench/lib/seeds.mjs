import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, removeDisposableWorktree } from '../../worktree.mjs';

export const SEEDS_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
const SEED_FILES = Object.freeze({
  patch: 'seed.patch',
  key: 'key.json',
  repro: 'repro.mjs',
});
export const SEVERITIES = Object.freeze(['question', 'nit', 'suggestion', 'blocking']);

function validateKey(key, name) {
  if (key.name !== name) throw new Error(`seed ${name}: key names ${key.name}`);
  if (typeof key.title !== 'string' || !key.title) throw new Error(`seed ${name}: no title`);
  if (key.control === true) return key;
  if (typeof key.path !== 'string' || !key.path) throw new Error(`seed ${name}: no path`);
  const [first, last] = key.lines ?? [];
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) {
    throw new Error(`seed ${name}: lines must be [first, last]`);
  }
  if (!SEVERITIES.includes(key.severity)) throw new Error(`seed ${name}: bad severity`);
  if (!Array.isArray(key.keywords) || key.keywords.length === 0) {
    throw new Error(`seed ${name}: keywords must be a non-empty list`);
  }
  return key;
}

// A seed is a directory holding the patch that reintroduces one defect, the answer key the scorer
// reads, and a repro that exits nonzero on the seeded tree and zero on the base. A control has no
// defect: its repro passes both before and after the patch.
export function loadSeeds(directory = SEEDS_DIRECTORY, names) {
  const available = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const wanted = names ?? available;
  for (const name of wanted) {
    if (!available.includes(name)) throw new Error(`no seed named ${name} in ${directory}`);
  }
  return wanted.map((name) => {
    const seedDirectory = join(directory, name);
    for (const file of Object.values(SEED_FILES)) {
      if (!existsSync(join(seedDirectory, file))) throw new Error(`seed ${name}: missing ${file}`);
    }
    const key = validateKey(
      JSON.parse(readFileSync(join(seedDirectory, SEED_FILES.key), 'utf8')),
      name
    );
    return {
      name,
      directory: seedDirectory,
      patchPath: join(seedDirectory, SEED_FILES.patch),
      reproPath: join(seedDirectory, SEED_FILES.repro),
      control: key.control === true,
      key,
    };
  });
}

export function createBenchWorktree(repoRoot, base, directory) {
  git(repoRoot, ['worktree', 'add', '--detach', directory, base]);
  return directory;
}

export function removeBenchWorktree(repoRoot, directory) {
  removeDisposableWorktree(repoRoot, directory);
}

export function applySeed(worktree, seed) {
  git(worktree, ['apply', '--whitespace=nowarn', seed.patchPath]);
}

// The repro runs with the seeded tree as its working directory and imports the modules under test
// from there, so it exercises the tree the rival reviewed rather than the checkout running the bench.
function runRepro(worktree, seed) {
  const result = spawnSync(process.execPath, [seed.reproPath], {
    cwd: worktree,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// A seed is valid only when its repro passes on the base and fails once the patch is applied; a
// control's repro must pass both times. Anything else is a seed that would score the rival on a
// defect nobody could reproduce.
export function validateSeed({ repoRoot, base, seed, directory }) {
  createBenchWorktree(repoRoot, base, directory);
  try {
    const before = runRepro(directory, seed);
    applySeed(directory, seed);
    const after = runRepro(directory, seed);
    const ok = before.status === 0 && (seed.control ? after.status === 0 : after.status !== 0);
    return {
      name: seed.name,
      control: seed.control,
      beforeStatus: before.status,
      afterStatus: after.status,
      ok,
      detail: ok ? '' : `${before.stderr}\n${after.stderr}`.trim(),
    };
  } finally {
    removeBenchWorktree(repoRoot, directory);
  }
}
