// Deterministic SVG -> PNG for contact sheets.
// Usage: node render.mjs jobs.json      where jobs.json = [{svg, png, width}, ...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let ok = 0;
for (const job of jobs) {
  try {
    const svg = readFileSync(job.svg);
    const r = new Resvg(svg, {
      fitTo: { mode: 'width', value: job.width || 800 },
      background: job.background || 'white',
    });
    mkdirSync(dirname(job.png), { recursive: true });
    writeFileSync(job.png, r.render().asPng());
    ok++;
  } catch (e) {
    console.error(`render failed: ${job.svg}: ${e.message}`);
  }
}
console.log(`rendered ${ok}/${jobs.length}`);
