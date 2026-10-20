// Screen recording of an iOS simulator (simctl) or an Android device (screenrecord, then pulled).
import { spawn } from 'node:child_process';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';
import { adb } from './device-commands.mjs';

const RECORDING_START_TIMEOUT_MS = 8000;
const RECORDING_POLL_MS = 50;
// screenrecord prints nothing when it starts; this is how long its encoder took to begin.
const ANDROID_RECORDER_WARMUP_MS = 900;
const RECORDER_SETTLE_MS = 300;
const ANDROID_FILE_FLUSH_MS = 800;
const ANDROID_BIT_RATE = '8000000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exited = (child) => new Promise((resolve) => child.on('exit', resolve));

async function startSimulatorRecording(udid, file) {
  const child = spawn(
    'xcrun',
    ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', file],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const startedBy = Date.now() + RECORDING_START_TIMEOUT_MS;
  while (!/Recording started/.test(stderr) && Date.now() < startedBy) {
    await sleep(RECORDING_POLL_MS);
  }
  return async () => {
    child.kill('SIGINT');
    await exited(child);
  };
}

async function startAndroidRecording(serial, file) {
  const remote = `/sdcard/device-parity-${process.pid}-${Date.now()}.mp4`;
  const child = spawn(
    ADB,
    ['-s', serial, 'shell', 'screenrecord', '--bit-rate', ANDROID_BIT_RATE, remote],
    { stdio: 'ignore' }
  );
  await sleep(ANDROID_RECORDER_WARMUP_MS);
  return async () => {
    adb(serial, 'shell', 'pkill', '-INT', 'screenrecord');
    await exited(child);
    await sleep(ANDROID_FILE_FLUSH_MS);
    adb(serial, 'pull', remote, file);
    adb(serial, 'shell', 'rm', '-f', remote);
  };
}

export async function startScreenRecording({ platform, device, file }) {
  const stop =
    platform === 'ios'
      ? await startSimulatorRecording(device, file)
      : await startAndroidRecording(device, file);
  const startedAt = Date.now();
  await sleep(RECORDER_SETTLE_MS);
  return { file, startedAt, stop };
}
