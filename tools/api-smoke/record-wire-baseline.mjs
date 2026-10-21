#!/usr/bin/env node
// Records what SvelteKit's adapter-netlify function answers to the wire-diff corpus
// (lib/wire-corpus.mjs), the baseline the plain Netlify Functions are held to by
// tests/wire-diff.test.mjs. Run it against a production `npm run build`:
//
//   node tools/api-smoke/record-wire-baseline.mjs <path to sveltekit-render.mjs> [out.json]
//
// The committed fixtures/wire-baseline.json was recorded this way from the last
// commit whose SvelteKit function still served /api; the PR that moved them names it.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';
import { applyWireEnv, driveWireCorpus } from './lib/wire-corpus.mjs';

const [functionPath, outPath = 'tools/api-smoke/fixtures/wire-baseline.json'] =
  process.argv.slice(2);
if (!functionPath) {
  console.error('usage: record-wire-baseline.mjs <sveltekit-render.mjs> [out.json]');
  process.exit(2);
}

// Set before the import: the adapter hands process.env to SvelteKit when the module loads.
applyWireEnv(process.env);
const { default: handle } = await import(pathToFileURL(resolve(functionPath)).href);

const results = await driveWireCorpus(handle);
writeFileSync(outPath, await format(JSON.stringify(results), { parser: 'json' }));
console.log(`[wire-baseline] ${Object.keys(results).length} responses -> ${outPath}`);
