import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deviceDriver, OUT, PKG } from './android-device-driver.mjs';

export function permissionHelper() {
  const d = deviceDriver('emulator-5684');
  const source = new URL('./QaPermissionFlags.java', import.meta.url);
  assert.ok(readFileSync(source, 'utf8').includes(`PACKAGE = ${JSON.stringify(PKG)}`));
  const buildDir = mkdtempSync('/private/tmp/rn-hunt-api28-permissions-');
  const classes = join(buildDir, 'classes'),
    jar = join(buildDir, 'permission.jar');
  const javaHome = '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home';
  const d8 = join(homedir(), 'Library/Android/sdk/build-tools/36.0.0/d8');
  const remote = '/data/local/tmp/rn-hunt-api28-permission.jar';
  const build = [];
  const run = (binary, args, options = {}) => {
    const output = execFileSync(binary, args, { timeout: 30000, encoding: 'utf8', ...options });
    build.push({ binary, args, output });
    return output;
  };
  mkdirSync(classes);
  run(join(javaHome, 'bin/javac'), ['--release', '8', '-d', classes, source.pathname]);
  run(d8, ['--min-api', '24', '--output', jar, join(classes, 'QaPermissionFlags.class')], {
    env: { ...process.env, JAVA_HOME: javaHome },
  });
  d.adb('push', jar, remote);
  writeFileSync(
    `${OUT}/android-run2-api28-permission-helper-build.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
        jarSha256: createHash('sha256').update(readFileSync(jar)).digest('hex'),
        build,
      },
      null,
      2
    ) + '\n'
  );
  return {
    read(action = 'inspect') {
      assert.ok(['inspect', 'clear-user'].includes(action));
      return d
        .adb(
          'shell',
          'su',
          '0',
          'sh',
          '-c',
          `'CLASSPATH=${remote} app_process /system/bin QaPermissionFlags ${action}'`
        )
        .toString()
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
    },
    cleanup() {
      d.adb('shell', 'rm', '-f', remote);
      rmSync(buildDir, { recursive: true, force: true });
    },
  };
}
