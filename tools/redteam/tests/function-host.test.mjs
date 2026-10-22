import { existsSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startNetlifyFunctionHost } from '../../lib/netlify-function-host.mjs';
import { runSafetyEvaluation } from '../run-safety-evaluation.mjs';
import { buildReport } from '../lib/safety-report.mjs';

vi.mock('../../lib/netlify-function-host.mjs', () => ({ startNetlifyFunctionHost: vi.fn() }));
vi.mock('../lib/fixture-crypto.mjs', () => ({
  REDTEAM_ENV_HINT: 'test-only credentials',
  loadRedteamEnv: vi.fn(),
  decryptDir: vi.fn(),
}));
vi.mock('../lib/safety-report.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  buildReport: vi.fn(() => '/private/tmp/redteam-report.html'),
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal()),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

let originalArgv;
beforeEach(() => {
  vi.clearAllMocks();
  originalArgv = process.argv;
  process.argv = ['node', 'run-safety-evaluation.mjs'];
  vi.stubEnv('OPENAI_API_KEY', 'not-a-usable-openai-key');
  vi.stubEnv('REDTEAM_FIXTURE_KEY', 'test-only-fixture-key');
  vi.stubEnv('REDTEAM_NO_OPEN', '1');
  readdirSync.mockReturnValue(['safe-example.png.enc']);
  existsSync.mockReturnValue(false);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No provider request is allowed'));
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('redteam function host', () => {
  it('uses development function runtime and awaits shutdown without sending missing fixtures', async () => {
    const close = vi.fn();
    startNetlifyFunctionHost.mockResolvedValue({ origin: 'http://127.0.0.1:5198', close });

    await runSafetyEvaluation();

    expect(startNetlifyFunctionHost).toHaveBeenCalledExactlyOnceWith({
      mode: 'development',
      port: 5198,
      env: {
        ALLOWED_TOKENS_LIST: 'redteam-token',
        GENERATE_DEADLINE_MS_OVERRIDE: '300000',
      },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(buildReport).toHaveBeenCalledWith(
      expect.objectContaining({
        base: 'http://127.0.0.1:5198',
        results: [expect.objectContaining({ id: 'safe-example', outcome: 'missing' })],
      })
    );
  });

  it('records host startup failure as an aborted run with an error report', async () => {
    startNetlifyFunctionHost.mockRejectedValue(new Error('EADDRINUSE'));

    await runSafetyEvaluation();

    expect(process.exitCode).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(buildReport).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            id: 'safe-example',
            outcome: 'error',
            detail: expect.stringContaining('EADDRINUSE'),
          }),
        ],
      })
    );
  });
});
