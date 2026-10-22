import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { ROOT, isMain, run, runMain } from '../lib/proc.mjs';
import { DEV_APP_ID, RELEASE_APK } from '../release/lib/native-app.mjs';
import { DEVELOPMENT_SIMULATOR_APP } from '../release/build-native-release.mjs';
import { ADB } from './android/lib/android-toolchain.mjs';
import { maestroPath } from './lib/maestro.mjs';
import { readHostedTestApiOrigin, requireVirtualTarget } from './lib/hosted-api-journey.mjs';

const HOSTED_PREFLIGHT_TIMEOUT_MS = 15_000;
const ANDROID_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);

export async function runHostedApiJourney(args) {
  const origin = readHostedTestApiOrigin(process.env);
  const { values } = parseArgs({
    args,
    options: { platform: { type: 'string' }, device: { type: 'string' } },
  });
  const { platform, device } = values;
  const simulators =
    platform === 'ios'
      ? JSON.parse(
          execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
            encoding: 'utf8',
          })
        ).devices
      : {};
  requireVirtualTarget(platform, device, simulators);
  if (
    platform === 'android' &&
    execFileSync(ADB, ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu'], {
      encoding: 'utf8',
    }).trim() !== '1'
  )
    throw new Error('The explicit Android target is not an emulator');
  const response = await fetch(`${origin}/api/generate-image`, {
    method: 'OPTIONS',
    redirect: 'error',
    signal: AbortSignal.timeout(HOSTED_PREFLIGHT_TIMEOUT_MS),
  });
  if (!response.ok || response.headers.get('x-robots-tag') !== 'noindex')
    throw new Error('The hosted target did not identify itself as the isolated test deploy');
  const env = { ...process.env, EXPO_PUBLIC_SPLOTCH_API_ORIGIN: origin };
  if (platform === 'android') {
    const abi = execFileSync(ADB, ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi'], {
      encoding: 'utf8',
    }).trim();
    if (!ANDROID_ABIS.has(abi)) throw new Error('The emulator has an unsupported Android ABI');
    env.ORG_GRADLE_PROJECT_reactNativeArchitectures = abi;
  }
  run(
    process.execPath,
    [
      'tools/release/build-native-release.mjs',
      platform === 'android' ? 'apk' : 'development-simulator',
    ],
    { cwd: ROOT, env }
  );
  requireVirtualTarget(platform, device, simulators);
  if (platform === 'android') {
    run(ADB, [
      '-s',
      device,
      'shell',
      'settings',
      'put',
      'secure',
      'immersive_mode_confirmations',
      'confirmed',
    ]);
    run(ADB, ['-s', device, 'install', '-r', join(ROOT, RELEASE_APK)]);
  } else run('xcrun', ['simctl', 'install', device, join(ROOT, DEVELOPMENT_SIMULATOR_APP)]);
  run(maestroPath(), ['--device', device, 'test', '.maestro/api-generation.yaml'], { cwd: ROOT });
  console.log(
    `PASS hosted generation UI: ${platform}, ${device}, Release ${DEV_APP_ID}, ${origin}`
  );
}

if (isMain(import.meta.url)) runMain(() => runHostedApiJourney(process.argv.slice(2)));
