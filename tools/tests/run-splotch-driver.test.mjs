import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const sourcePath = '.ruler/skills/run-splotch/driver.mjs';
const source = readFileSync(join(repoRoot, sourcePath), 'utf8');
const SITE_SERVER = realpathSync(join(repoRoot, 'tools/lib/site-server.mjs'));

// The source and generated copies have the same depth; Ruler's own drift gate binds their bytes.
const DRIVER_DIRS = [
  '.ruler/skills/run-splotch',
  '.claude/skills/run-splotch',
  '.agents/skills/run-splotch',
];

describe('run-splotch driver', () => {
  it.each(DRIVER_DIRS)('resolves the owned site lifecycle from %s', (dir) => {
    const match = source.match(/import \{([^}]+)\} from '([^']*site-server\.mjs)';/);
    expect(match?.[1]).toContain('spawnSiteServer');
    expect(realpathSync(resolve(repoRoot, dir, match[2]))).toBe(SITE_SERVER);
  });

  it('uses the real drawing-screen helper and verifies the drawn pixels', () => {
    const match = source.match(/import \{ openDrawingScreen \} from '([^']+)';/);
    expect(realpathSync(resolve(dirname(join(repoRoot, sourcePath)), match[1]))).toBe(
      realpathSync(join(repoRoot, 'e2e/support/drawing.ts'))
    );
    expect(source).toContain('await openDrawingScreen(page)');
    expect(source).toContain('await screen.inkedPixels(stroke)');
    expect(source).toContain('if (inked === 0) throw new Error');
  });

  it('releases kept servers with durable stdio and prints their process group', () => {
    expect(source).toContain('values.keep ? RELEASABLE_STDIO');
    expect(source).toContain('ownedSite.release()');
    expect(source).toContain('kill -- -${ownedSite.server.pid}');
  });

  it('vouches for its own listener and never clears an occupied port', () => {
    expect(source).toContain('listeners.includes(ownedSite.server.pid)');
    expect(source).not.toMatch(
      /freePort|kill-port|child_process|vite-server|drawingCanvas|__engineReady/
    );
  });
});
