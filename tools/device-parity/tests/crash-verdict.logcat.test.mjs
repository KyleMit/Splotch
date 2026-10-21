import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A real adb process stands in for the device: the harness's argv reaches it through
// execFileSync, so a -T value the real logcat rejects is rejected here too.
const APP = 'art.example.under.test';
const SERIAL = 'emulator-0000';
const APP_PID = 4321;
const START_STAMP = '10-19 22:15:00.000';
const LOGCAT_T_FORMAT = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const JAVA_CRASH = [
  `10-19 22:15:30.123  ${APP_PID}  ${APP_PID} E AndroidRuntime: FATAL EXCEPTION: main`,
  `10-19 22:15:30.123  ${APP_PID}  ${APP_PID} E AndroidRuntime: Process: ${APP}, PID: ${APP_PID}`,
];

const UNREADABLE_BUFFER = "logcat: Unable to open log device '/dev/log/crash'";

function fixtureAdbSource({ log, logcatError }) {
  return `#!${process.execPath}
const config = ${JSON.stringify({ pid: APP_PID, log, logcatError, format: LOGCAT_T_FORMAT.source })};
const args = process.argv.slice(4);
if (args[0] === 'logcat') {
  if (config.logcatError) {
    process.stderr.write(config.logcatError);
    process.exit(1);
  }
  const time = args[args.indexOf('-T') + 1];
  if (!new RegExp(config.format).test(time)) {
    process.stderr.write(\`logcat: -T '\${time}' not in time format.\\n\`);
    process.exit(1);
  }
  process.stdout.write(config.log.join('\\n'));
} else if (args.includes('pidof')) {
  process.stdout.write(\`\${config.pid}\\n\`);
} else if (args.includes('meminfo')) {
  process.stdout.write('TOTAL PSS:   204800');
}
`;
}

describe('androidVerdict against a fixture adb', () => {
  let sdk;
  let androidVerdict;
  const writeFixtureAdb = (config) => {
    const adb = join(sdk, 'platform-tools', 'adb');
    writeFileSync(adb, fixtureAdbSource({ log: [], logcatError: null, ...config }));
    chmodSync(adb, 0o755);
  };
  const verdict = () =>
    androidVerdict({ serial: SERIAL, pkg: APP, startStamp: START_STAMP, sinceMs: 0, source: '' });

  beforeAll(async () => {
    sdk = mkdtempSync(join(tmpdir(), 'device-parity-adb-'));
    mkdirSync(join(sdk, 'platform-tools'));
    vi.stubEnv('ANDROID_HOME', sdk);
    vi.resetModules();
    ({ androidVerdict } = await import('../lib/crash-verdict.mjs'));
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(sdk, { recursive: true, force: true });
  });

  it('rejects a quoted -T stamp the way logcat does', async () => {
    const { execFileSync } = await import('node:child_process');
    writeFixtureAdb({});
    const run = (time) =>
      execFileSync(join(sdk, 'platform-tools', 'adb'), ['-s', SERIAL, 'logcat', '-d', '-T', time], {
        stdio: 'pipe',
      });

    expect(() => run(`'${START_STAMP}'`)).toThrow(/not in time format/);
    expect(() => run(START_STAMP)).not.toThrow();
  });

  it('reads logcat, so a crash only the log records makes a live app crashed', () => {
    writeFixtureAdb({ log: JAVA_CRASH });

    const result = verdict();

    expect(result.pid).toBe(APP_PID);
    expect(result.dropbox).toEqual([]);
    expect(result.verdict).toBe('crashed');
    expect(result.fatal).toEqual([JAVA_CRASH[0]]);
  });

  it('fails the verdict when logcat cannot be read, rather than calling the running app alive', () => {
    writeFixtureAdb({ logcatError: UNREADABLE_BUFFER });

    expect(verdict).toThrow(`No verdict: logcat is unreadable (adb logcat -d -T ${START_STAMP}`);
    expect(verdict).toThrow(UNREADABLE_BUFFER);
  });
});
