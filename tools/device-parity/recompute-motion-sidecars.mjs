// Recomputes the `motion` field of every step sidecar from its recording, in each batch directory
// given, after a change to the motion analysis. Needs ffmpeg and ffprobe on PATH.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, isMain, runMain } from '../lib/proc.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { motionTimeline } from './lib/motion-timeline.mjs';

export function parseRecomputeFlags(argv) {
  const { positionals } = parseFlags(argv, { options: {}, positionals: true });
  if (!positionals.length) fail('give one or more batch directories');
  return { dirs: positionals };
}

export function recomputeMotionSidecars({ dirs }) {
  const updated = [];
  for (const dir of dirs) {
    for (const video of readdirSync(dir).filter((name) => name.endsWith('.mp4'))) {
      const sidecar = join(dir, `${video.slice(0, -'.mp4'.length)}.json`);
      if (!existsSync(sidecar)) continue;
      const record = JSON.parse(readFileSync(sidecar, 'utf8'));
      record.motion = motionTimeline(join(dir, video));
      writeFileSync(sidecar, JSON.stringify(record, null, 2));
      updated.push(sidecar);
    }
  }
  console.log(`recomputed ${updated.length} sidecars`);
  return updated;
}

if (isMain(import.meta.url)) {
  runMain(async () => recomputeMotionSidecars(parseRecomputeFlags(process.argv.slice(2))));
}
