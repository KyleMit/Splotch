import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  POLAROID_FLIGHT_MS,
  POLAROID_OBSERVATION_MS,
} from '../../web/src/lib/drawing/screenshotTiming.ts';

const repoRoot = join(import.meta.dirname, '..', '..');

describe('screenshot timing contract', () => {
  it('keeps the polaroid CSS flight aligned with its shared duration', () => {
    const appCss = readFileSync(join(repoRoot, 'web', 'src', 'app.css'), 'utf8');

    expect(appCss).toContain(`animation: polaroid-show ${POLAROID_FLIGHT_MS / 1_000}s`);
  });

  it('keeps the physical action observation window aligned with the shared duration', () => {
    const actionRunner = readFileSync(
      join(repoRoot, 'scripts', 'perf', 'ipad-actions.mjs'),
      'utf8'
    );
    const literal = actionRunner.match(/const SCREENSHOT_ACTION_SETTLE_MS = ([\d_]+);/)?.[1];

    expect(Number(literal?.replaceAll('_', ''))).toBe(POLAROID_OBSERVATION_MS);
  });
});
