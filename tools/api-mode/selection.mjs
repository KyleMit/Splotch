import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, isMain } from '../lib/proc.mjs';
import {
  CONFIGURATION_PATH,
  EDGE_DIRECTORY,
  SELECTION_PATH,
  configurationSource,
  readApiMode,
  selectionSource,
} from '../lib/api-mode.mjs';

// root is a test seam for isolated build fixtures; the deploy writes this checkout.
export function prepareApiMode(env, root = ROOT) {
  const mode = readApiMode(env);
  const selection = join(root, SELECTION_PATH);
  mkdirSync(dirname(selection), { recursive: true });
  writeFileSync(selection, selectionSource(mode));
  writeFileSync(join(root, CONFIGURATION_PATH), configurationSource(mode));
  const edge = join(root, EDGE_DIRECTORY);
  rmSync(edge, { force: true, recursive: true });
  mkdirSync(edge, { recursive: true });
  if (mode === 'test')
    writeFileSync(
      join(edge, 'noindex.ts'),
      readFileSync(new URL('../lib/noindex-response.ts', import.meta.url))
    );
  return mode;
}

if (isMain(import.meta.url)) console.log(`API build mode: ${prepareApiMode(process.env)}`);
