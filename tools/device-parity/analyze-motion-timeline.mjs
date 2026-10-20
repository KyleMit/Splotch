// Prints a screen recording's motion bursts (start, end, span, peak changed fraction), optionally
// inside a crop and as a JSON timeline file. Needs ffmpeg and ffprobe on PATH.
import { writeFileSync } from 'node:fs';
import { fail, isMain, runMain } from '../lib/proc.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { motionTimeline } from './lib/motion-timeline.mjs';

const FLAGS = { video: { type: 'string' }, crop: { type: 'string' }, json: { type: 'string' } };

export function parseMotionFlags(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['video'] });
  let crop = null;
  if (values.crop !== undefined) {
    const parts = values.crop.split(',').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
      fail(`--crop is x,y,w,h in source pixels, got "${values.crop}"`);
    }
    const [x, y, w, h] = parts;
    crop = { x, y, w, h };
  }
  return { video: values.video, crop, json: values.json };
}

export function analyzeMotionTimeline({ video, crop, json }) {
  const timeline = motionTimeline(video, crop);
  if (json) writeFileSync(json, JSON.stringify(timeline, null, 1));
  console.log(JSON.stringify(timeline.bursts));
  return timeline;
}

if (isMain(import.meta.url)) {
  runMain(async () => analyzeMotionTimeline(parseMotionFlags(process.argv.slice(2))));
}
