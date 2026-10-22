import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { run } from '../../lib/proc.mjs';
import { runHostedApiJourney } from '../run-hosted-api-journey.mjs';

vi.mock('node:child_process', async (original) => ({
  ...(await original()),
  execFileSync: vi.fn(),
}));
vi.mock('../../lib/proc.mjs', async (original) => ({
  ...(await original()),
  isMain: () => false,
  run: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(['android', 'ios'])(
  'rejects a changed %s target after the build before installing',
  async (platform) => {
    let built = false;
    const device = platform === 'android' ? 'emulator-5556' : 'owned-simulator';
    vi.stubEnv('EXPO_PUBLIC_SPLOTCH_API_ORIGIN', 'https://test.splotch.art');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { headers: { 'x-robots-tag': 'noindex' } }))
    );
    vi.mocked(run).mockImplementation(() => {
      built = true;
    });
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      if (platform === 'ios')
        return JSON.stringify({
          devices: {
            iOS: [{ udid: device, state: built ? 'Shutdown' : 'Booted', isAvailable: true }],
          },
        });
      if (args.at(-1) === 'ro.product.cpu.abi') return 'arm64-v8a';
      return built ? '0' : '1';
    });
    await expect(runHostedApiJourney(['--platform', platform, '--device', device])).rejects.toThrow(
      platform === 'android' ? 'not an emulator' : 'explicit Android emulator'
    );
    expect(run).toHaveBeenCalledExactlyOnceWith(
      process.execPath,
      [
        'tools/release/build-native-release.mjs',
        platform === 'android' ? 'apk' : 'development-simulator',
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://test.splotch.art',
        }),
      })
    );
  }
);
