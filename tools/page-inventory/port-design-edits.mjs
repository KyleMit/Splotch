import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import {
  BASELINE_STYLESHEET,
  DESIGN_SNAPSHOT_OUT,
  SHARED_STYLESHEET,
} from './lib/design-snapshot.mjs';
import { describeChange, diffStylesheets, indexScopeOwners } from './lib/design-port-back.mjs';

export function parsePortBackOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { bundle: { type: 'string' }, json: { type: 'boolean', default: false } },
  });
  return {
    bundle: values.bundle ? join(ROOT, values.bundle) : DESIGN_SNAPSHOT_OUT,
    json: values.json,
  };
}

function readStylesheets(bundle) {
  const edited = join(bundle, SHARED_STYLESHEET);
  const baseline = join(bundle, BASELINE_STYLESHEET);
  for (const path of [edited, baseline]) {
    if (!existsSync(path)) {
      throw new Error(
        `${relative(ROOT, path)} is missing — run npm run capture:page-inventory to regenerate the bundle`
      );
    }
  }
  return { edited: readFileSync(edited, 'utf8'), baseline: readFileSync(baseline, 'utf8') };
}

function buildScopeOwners(bundle) {
  const surfaces = join(bundle, 'surfaces');
  const owners = new Map();
  if (!existsSync(surfaces)) return owners;
  for (const fileName of readdirSync(surfaces)) {
    if (fileName.endsWith('.html')) {
      indexScopeOwners(readFileSync(join(surfaces, fileName), 'utf8'), owners);
    }
  }
  return owners;
}

export async function portDesignEdits(argv = process.argv.slice(2)) {
  const { bundle, json } = parsePortBackOptions(argv);
  const { edited, baseline } = readStylesheets(bundle);
  const changes = diffStylesheets(baseline, edited);

  if (!changes.length) {
    console.log(
      `No style changes in ${relative(ROOT, join(bundle, SHARED_STYLESHEET))} — the bundle still matches the app.`
    );
    return;
  }

  const owners = buildScopeOwners(bundle);
  if (json) {
    console.log(JSON.stringify({ changes }, null, 2));
    return;
  }

  const declarationCount = changes.reduce((sum, change) => sum + change.declarations.length, 0);
  console.log(
    `${declarationCount} changed declaration(s) across ${changes.length} rule(s).\nEach rule names the Svelte file and line that rendered an element it matches.\n`
  );
  for (const change of changes) console.log(`${describeChange(change, owners)}\n`);
  console.log(
    'Apply these to the named .svelte files (or web/src/tokens.css for a token), then re-run npm run capture:page-inventory to refresh the bundle.'
  );
}

if (isMain(import.meta.url)) runMain(portDesignEdits);
