import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReadmeHero } from '../gen-readme-hero.mjs';

const { stop, launch } = vi.hoisted(() => ({ stop: vi.fn(), launch: vi.fn() }));
vi.mock('../../lib/vite-server.mjs', () => ({
  portListenerPids: () => [],
  spawnViteServer: () => ({ server: { exitCode: null }, stop }),
}));
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

const EXISTING_IMAGE = Buffer.from('existing README hero');

describe('README capture server identity', () => {
  let directory;
  let output;

  beforeEach(() => {
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), 'readme-hero-server-'));
    output = join(directory, 'hero.webp');
    writeFileSync(output, EXISTING_IMAGE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each(['<html>another server</html>', 'null', '{}', '{"repoRoot":42}'])(
    'rejects invalid identity %s and preserves the existing hero',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
      await expect(generateReadmeHero(['--out', output])).rejects.toThrow(
        'Invalid checkout identity from http://localhost:5199/; choose an unused --port.'
      );
      expect(stop).toHaveBeenCalledOnce();
      expect(launch).not.toHaveBeenCalled();
      expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
    }
  );

  it('rejects a different checkout before launching the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ repoRoot: '/another-checkout' }))
    );
    await expect(generateReadmeHero(['--out', output])).rejects.toThrow(
      'http://localhost:5199/ is serving another checkout: /another-checkout; choose an unused --port.'
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(launch).not.toHaveBeenCalled();
    expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
  });
});
