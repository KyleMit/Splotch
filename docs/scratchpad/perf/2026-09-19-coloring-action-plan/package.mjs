// Rewrites MANIFEST.json from the packaged files.
//   node docs/scratchpad/perf/2026-09-19-coloring-action-plan/package.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const entries = ['controls', 'probes', 'runs'].flatMap((dir) =>
  readdirSync(join(HERE, dir))
    .sort()
    .map((name) => {
      const path = `${dir}/${name}`;
      const sha256 = createHash('sha256').update(readFileSync(join(HERE, path))).digest('hex');
      return { path, sha256 };
    })
);
writeFileSync(join(HERE, 'MANIFEST.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} manifest entries`);
