import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chromiumExecutablePath } from '../lib/playwright.mjs';

let browsersPath;

function installBuild(build, sub = 'chrome-linux') {
  const dir = join(browsersPath, build, sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'chrome'), '');
  return join(dir, 'chrome');
}

const missingPinnedBuild = { executablePath: () => join(browsersPath, 'pinned', 'chrome') };

beforeEach(() => {
  browsersPath = mkdtempSync(join(tmpdir(), 'pw-browsers-'));
  vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', browsersPath);
  vi.stubEnv('PLAYWRIGHT_CHROMIUM', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(browsersPath, { recursive: true, force: true });
});

describe('chromiumExecutablePath', () => {
  it('returns PLAYWRIGHT_CHROMIUM ahead of the pinned build and the cache', () => {
    const pinned = installBuild('pinned-present');
    installBuild('chromium-1228');
    vi.stubEnv('PLAYWRIGHT_CHROMIUM', '/custom/chrome');

    expect(chromiumExecutablePath({ executablePath: () => pinned })).toBe('/custom/chrome');
  });

  it("defers to Playwright's own binary when the pinned build exists", () => {
    const pinned = installBuild('pinned-present');
    installBuild('chromium-1228');

    expect(chromiumExecutablePath({ executablePath: () => pinned })).toBeUndefined();
  });

  it('falls back to the numerically newest cached build', () => {
    installBuild('chromium-999');
    installBuild('chromium-1223');
    const newest = installBuild('chromium-1228', 'chrome-linux64');

    expect(chromiumExecutablePath(missingPinnedBuild)).toBe(newest);
  });

  it('skips a cached build with no chrome binary', () => {
    const complete = installBuild('chromium-1223');
    mkdirSync(join(browsersPath, 'chromium-1228', 'chrome-linux'), { recursive: true });

    expect(chromiumExecutablePath(missingPinnedBuild)).toBe(complete);
  });

  it('falls through to Playwright when resolving the pinned build throws and nothing is cached', () => {
    const throwing = {
      executablePath: () => {
        throw new Error('no registry');
      },
    };

    expect(chromiumExecutablePath(throwing)).toBeUndefined();
  });
});
