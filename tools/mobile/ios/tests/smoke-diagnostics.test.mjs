import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFailedAppStartup, runIosSmokeWithDiagnostics } from '../lib/smoke-diagnostics.mjs';
import { runMaestroSmoke } from '../../lib/mobile-smoke-test.mjs';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:os', () => ({ homedir: () => '/diagnostic-home' }));
vi.mock('../../lib/mobile-smoke-test.mjs', () => ({ runMaestroSmoke: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe('failed iOS app startup diagnostics', () => {
  it('retains console output when the bounded relaunch is terminated', async () => {
    execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(new Error('timed out'), 'WebView failed to load', 'native error');
    });
    await captureFailedAppStartup('owned-simulator');
    expect(execFile).toHaveBeenCalledWith(
      'xcrun',
      ['simctl', 'launch', '--terminate-running-process', '--console', 'owned-simulator', 'art.splotch.app'],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      expect.any(Function)
    );
    expect(mkdir).toHaveBeenCalledWith('/diagnostic-home/.maestro/tests', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      '/diagnostic-home/.maestro/tests/ios-app-relaunch.log',
      expect.stringContaining('WebView failed to load\nnative error\ntimed out')
    );
  });

  it('records a relaunch that exits without an error', async () => {
    execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, 'WebView loaded', '');
    });
    await captureFailedAppStartup('owned-simulator');
    expect(writeFile).toHaveBeenCalledWith(
      '/diagnostic-home/.maestro/tests/ios-app-relaunch.log',
      expect.stringContaining('the original smoke result is unchanged.\nWebView loaded')
    );
  });

  it('does not relaunch a passing smoke', async () => {
    await runIosSmokeWithDiagnostics('owned-simulator');
    expect(runMaestroSmoke).toHaveBeenCalledWith({ device: 'owned-simulator' });
    expect(execFile).not.toHaveBeenCalled();
  });

  it('preserves the original smoke failure when diagnostics cannot be written', async () => {
    const smokeFailure = new Error('Settings did not paint');
    runMaestroSmoke.mockRejectedValue(smokeFailure);
    mkdir.mockRejectedValue(new Error('disk unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(runIosSmokeWithDiagnostics('owned-simulator')).rejects.toBe(smokeFailure);
      expect(warning).toHaveBeenCalledWith(
        'Could not capture app startup diagnostics:',
        expect.any(Error)
      );
    } finally {
      warning.mockRestore();
    }
  });
});
