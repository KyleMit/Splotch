// Deterministic SVG -> PNG for the vector-versus-raster agreement check.
// Invoked by graph/metrics.raster_ink_diff with [{ svg, png, width }, ...].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { isMain } from '../lib/proc.mjs';

export function renderJobs(specPath) {
  const jobs = JSON.parse(readFileSync(specPath, 'utf8'));
  let completed = 0;
  for (const job of jobs) {
    try {
      const svg = readFileSync(job.svg);
      const renderer = new Resvg(svg, {
        fitTo: { mode: 'width', value: job.width || 800 },
        background: job.background || 'white',
      });
      mkdirSync(dirname(job.png), { recursive: true });
      writeFileSync(job.png, renderer.render().asPng());
      completed++;
    } catch (error) {
      console.error(`render failed: ${job.svg}: ${error.message}`);
    }
  }
  console.log(`rendered ${completed}/${jobs.length}`);
  return completed === jobs.length ? 0 : 1;
}

if (isMain(import.meta.url)) process.exitCode = renderJobs(process.argv[2]);
