import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReadmeHero } from '../gen-readme-hero.mjs';

const SERVER_PID = 4242;
const { stop, launch, listeners } = vi.hoisted(() => ({
  stop: vi.fn(),
  launch: vi.fn(),
  listeners: vi.fn(),
}));
vi.mock('../../lib/vite-server.mjs', () => ({
  portListenerPids: listeners,
  spawnViteServer: () => ({ server: { exitCode: null, pid: SERVER_PID }, stop }),
}));
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

const EXISTING_IMAGE = Buffer.from('existing README hero');

describe('README capture server ownership', () => {
  let directory;
  let output;

  beforeEach(() => {
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), 'readme-hero-server-'));
    output = join(directory, 'hero.webp');
    writeFileSync(output, EXISTING_IMAGE);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>a server</html>')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([[[]], [[1111]], [[1111, 2222]]])(
    'rejects an answer from listeners %j before launching the browser',
    async (pids) => {
      listeners.mockReturnValueOnce([]).mockReturnValue(pids);
      await expect(generateReadmeHero(['--out', output])).rejects.toThrow(
        'http://localhost:5199/ answered, but not from the capture server this run started; choose an unused --port.'
      );
      expect(stop).toHaveBeenCalledOnce();
      expect(launch).not.toHaveBeenCalled();
      expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
    }
  );

  it('launches the browser once its own server holds the port', async () => {
    listeners.mockReturnValueOnce([]).mockReturnValue([SERVER_PID]);
    launch.mockRejectedValue(new Error('browser stub'));
    await expect(generateReadmeHero(['--out', output])).rejects.toThrow('browser stub');
    expect(launch).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
  });
});
