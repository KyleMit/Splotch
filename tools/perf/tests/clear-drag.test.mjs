import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  ACCEPT_RADIUS_FACTOR,
  TOOLBAR_STORAGE_KEY,
  TOOLBAR_STYLES,
  clearDragPath,
  frameIntervalSummary,
  orientationOf,
  scrubGeometryProblem,
  parseToolbarStyles,
} from '../android/capture-clear-drag.mjs';

const read = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('drag-to-clear scrub', () => {
  it('writes the toolbar style the app reads', () => {
    expect(read('web/src/lib/storageKeys.ts')).toContain(`toolbarStyle: '${TOOLBAR_STORAGE_KEY}'`);
    const union = /export type ToolbarStyle = ([^;]+);/.exec(
      read('web/src/lib/state/settings.svelte.ts')
    )?.[1];
    expect(union?.split('|').map((member) => member.trim().replaceAll("'", ''))).toEqual(
      TOOLBAR_STYLES
    );
  });

  it('scrubs across the accept radius the app uses', () => {
    expect(read('web/src/lib/actions/dragToClearGeometry.ts')).toContain(
      `export const ACCEPT_RADIUS_FACTOR = ${ACCEPT_RADIUS_FACTOR};`
    );
  });

  it('parses toolbar styles, defaulting to both', () => {
    expect(parseToolbarStyles(undefined)).toEqual(['buttons', 'bare']);
    expect(parseToolbarStyles('Bare, bare')).toEqual(['bare']);
    expect(() => parseToolbarStyles('glass')).toThrow(/--toolbars/);
  });

  it('crosses the threshold out and back once per cycle', () => {
    const radius = 100;
    const origin = { x: 400, y: 50, radius, width: 400, height: 800 };
    const path = clearDragPath(origin, 2, 60);
    const distances = path.map(({ x, y }) => Math.hypot(x - origin.x, y - origin.y) / radius);

    expect(path).toHaveLength(120);
    expect(Math.min(...distances)).toBeLessThan(0.3);
    expect(Math.max(...distances)).toBeGreaterThan(1.3);
    const crossings = distances.slice(1).filter((d, i) => d >= 1 !== distances[i] >= 1);
    expect(crossings).toHaveLength(4);
    expect(path.every(({ x }) => x <= origin.x)).toBe(true);
  });

  it('labels orientation from the page size, square counting as portrait', () => {
    expect(orientationOf({ width: 915, height: 412 })).toBe('LANDSCAPE');
    expect(orientationOf({ width: 412, height: 915 })).toBe('PORTRAIT');
    expect(orientationOf({ width: 500, height: 500 })).toBe('PORTRAIT');
  });

  it('voids a scrub whose viewport rotated away and back', () => {
    const size = { width: 412, height: 915 };
    expect(scrubGeometryProblem({ before: size, after: size, resizes: 0 })).toBeNull();
    expect(scrubGeometryProblem({ before: size, after: size, resizes: 2 })).toMatch(/resized 2/);
    expect(
      scrubGeometryProblem({ before: size, after: { width: 412, height: 870 }, resizes: 0 })
    ).toMatch(/412x915 to 412x870/);
  });

  it('summarizes only the frames inside the scrub window', () => {
    const stamps = [0, 100, 116.7, 133.3, 150, 200, 216.7, 400];
    const summary = frameIntervalSummary(stamps, 100, 216.7);

    expect(summary.frames).toBe(6);
    expect(summary.maxMs).toBeCloseTo(50);
    expect(summary.over25Ms).toBe(1);
    expect(summary.over50Ms).toBe(0);
    expect(summary.p50Ms).toBeCloseTo(16.7, 0);
  });
});
