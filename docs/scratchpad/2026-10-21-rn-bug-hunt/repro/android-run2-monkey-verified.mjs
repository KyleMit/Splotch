import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { androidNow, androidPssMb, androidVerdict } from './android-run2-verdict.mjs';
import { adb, guard, OUT } from './android-driver.mjs';
import { pause } from './android-run2-touch.mjs';
const SERIAL = 'emulator-5680',
  PKG = 'art.splotch.migration.probe';
const SEEDS = [20261021, 568036, 314159, 271828, 8675309];
const ROOT = '/data/user/0/art.splotch.migration.probe';
const BACKUP = '/data/local/tmp/rn-hunt-monkey-verified-app-snapshot';
const baseline = {
  wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
  data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim(),
};
function root(command) {
  return adb('shell', 'su', '0', 'sh', '-c', `'${command}'`).toString();
}
function restore() {
  adb('shell', 'am', 'force-stop', PKG);
  root(
    `test -d ${BACKUP}/files && rm -rf ${ROOT}/cache ${ROOT}/code_cache ${ROOT}/files ${ROOT}/shared_prefs ${ROOT}/databases ${ROOT}/no_backup && cp -a ${BACKUP}/. ${ROOT}/ && restorecon -RF ${ROOT}`
  );
}
function source(name) {
  const remote = '/data/local/tmp/rn-hunt-monkey-ui.xml';
  adb('shell', 'rm', '-f', remote);
  try {
    const result = adb('shell', 'uiautomator', 'dump', remote).toString();
    if (!result.includes('dumped to:')) return { source: '', error: result };
    const xml = adb('shell', 'cat', remote).toString();
    writeFileSync(`${OUT}/${name}.xml`, xml);
    return { source: xml, error: null };
  } catch (error) {
    return { source: '', error: String(error) };
  }
}
const all = [];
let backed = false;
const uid = adb('shell', 'cmd', 'package', 'list', 'packages', '-U', PKG)
  .toString()
  .match(/uid:(\d+)/)?.[1];
if (!uid || Number(uid) < 10000) throw new Error('No dedicated app UID');
const firewallTag = 'rn-hunt-monkey-verified-20261021';
const firewallArgs = `OUTPUT -m owner --uid-owner ${uid} -m comment --comment ${firewallTag} -j REJECT`;
const installedRules = [];
const settingsSnapshot = () =>
  Object.fromEntries(
    ['system', 'secure', 'global'].map((namespace) => [
      namespace,
      adb('shell', 'settings', 'list', namespace)
        .toString()
        .split('\n')
        .filter((line) => !/^android_id=|^bluetooth_address=|^advertising_id=/.test(line))
        .join('\n'),
    ])
  );
const settingsBefore = settingsSnapshot();
writeFileSync(
  `${OUT}/android-run2-monkey-verified-os-before.json`,
  JSON.stringify(settingsBefore, null, 2) + '\n'
);
try {
  guard();
  for (const binary of ['iptables', 'ip6tables']) {
    let exists = false;
    try {
      root(`${binary} -C ${firewallArgs}`);
      exists = true;
    } catch {}
    if (exists) throw new Error('Pre-existing campaign firewall rule');
    root(`${binary} -I ${firewallArgs}`);
    installedRules.push(binary);
  }
  adb('shell', 'am', 'force-stop', PKG);
  root(`test ! -e ${BACKUP} && cp -a ${ROOT} ${BACKUP}`);
  backed = true;
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  pause(2000);
  writeFileSync(
    `${OUT}/android-run2-monkey-verified-network.json`,
    JSON.stringify(
      {
        baseline,
        offline: {
          wifi: adb('shell', 'cmd', 'wifi', 'status').toString(),
          data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString(),
        },
        seeds: SEEDS,
      },
      null,
      2
    )
  );
  for (const seed of SEEDS) {
    restore();
    adb('shell', 'svc', 'wifi', 'disable');
    adb('shell', 'svc', 'data', 'disable');
    adb('shell', 'cmd', 'statusbar', 'collapse');
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
    pause(5000);
    guard();
    const name = `android-run2-monkey-verified-${seed}`,
      sinceMs = Date.now(),
      startStamp = androidNow(SERIAL),
      memStart = androidPssMb(SERIAL, PKG);
    let output = '',
      exit = 0;
    const args = [
      '-s',
      SERIAL,
      'shell',
      'monkey',
      '-p',
      PKG,
      '--pct-syskeys',
      '0',
      '--pct-nav',
      '0',
      '--pct-majornav',
      '0',
      '--pct-appswitch',
      '0',
      '-s',
      String(seed),
      '--throttle',
      '50',
      '-v',
      '3000',
    ];
    console.log(new Date().toISOString(), 'START', seed);
    try {
      output = execFileSync('adb', args, {
        encoding: 'utf8',
        timeout: 20 * 60 * 1000,
        maxBuffer: 64 << 20,
      });
    } catch (error) {
      exit = error.status ?? 1;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    pause(4000);
    writeFileSync(`${OUT}/${name}.monkey.txt`, output);
    writeFileSync(`${OUT}/${name}.png`, adb('exec-out', 'screencap', '-p'));
    let ui = source(name);
    const initialSourceError = ui.error;
    if (ui.error) {
      pause(35000);
      ui = source(`${name}-settled`);
    }
    let rawLogcat = '',
      logcatExit = 0;
    const logcatFile = `${OUT}/${name}.logcat.txt`;
    try {
      rawLogcat = execFileSync(
        'adb',
        [
          '-s',
          SERIAL,
          'logcat',
          '-d',
          '-T',
          startStamp,
          '-b',
          'crash,main,system',
          '-v',
          'threadtime',
          'AndroidRuntime:*',
          'libc:*',
          'DEBUG:*',
          'ReactNativeJS:*',
          'lowmemorykiller:*',
          'ActivityManager:*',
          '*:S',
        ],
        { encoding: 'utf8', timeout: 45000, maxBuffer: 64 << 20 }
      );
    } catch (error) {
      logcatExit = error.status ?? 1;
      rawLogcat = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    writeFileSync(logcatFile, rawLogcat);
    const verdict = androidVerdict({
      serial: SERIAL,
      pkg: PKG,
      startStamp,
      sinceMs,
      source: ui.source,
    });
    const reports = output
      .split('\n')
      .filter((s) => /\/\/ (CRASH|NOT RESPONDING)|Monkey aborted/.test(s));
    const helperVerdict = verdict.verdict;
    if (reports.some((s) => /CRASH|NOT RESPONDING/.test(s)) && verdict.verdict === 'alive')
      verdict.verdict = 'crashed';
    const result = {
      device: SERIAL,
      seed,
      eventsRequested: 3000,
      throttleMs: 50,
      startedAt: new Date(sinceMs).toISOString(),
      durationMs: Date.now() - sinceMs,
      monkeyExit: exit,
      rawLogcatRead: { exit: logcatExit, bytes: Buffer.byteLength(rawLogcat), file: logcatFile },
      monkeyReported: reports,
      networkStats: output.split('\n').find((line) => line.includes('Network stats:')) ?? null,
      droppedEvents: output.split('\n').find((line) => line.includes('Dropped:')) ?? null,
      helperVerdict,
      offlineAtEnd: {
        wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
        data: adb('shell', 'settings', 'get', 'global', 'mobile_data').toString().trim(),
      },
      initialSourceError,
      eventsInjected: Number(output.match(/Events injected:\s*(\d+)/)?.[1] ?? 0),
      scenarioError: exit
        ? `monkey exited ${exit}`
        : logcatExit
          ? `logcat exited ${logcatExit}`
          : ui.error,
      memStart,
      foreground: adb('shell', 'dumpsys', 'window', 'displays')
        .toString()
        .match(/mCurrentFocus=([^\n]+)/)?.[1],
      ...verdict,
    };
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify(result, null, 2) + '\n');
    all.push(result);
    console.log(new Date().toISOString(), 'END', seed, result.verdict, result.scenarioError);
  }
} finally {
  const cleanupErrors = [];
  let snapshotRestored = !backed;
  const cleanup = (label, action) => {
    try {
      action();
    } catch (error) {
      cleanupErrors.push({ label, error: String(error) });
    }
  };
  cleanup('stop probe', () => adb('shell', 'am', 'force-stop', PKG));
  if (backed) {
    cleanup('restore app snapshot', () => {
      restore();
      snapshotRestored = true;
    });
    if (snapshotRestored) cleanup('remove owned snapshot', () => root(`rm -rf ${BACKUP}`));
  }
  for (const binary of installedRules)
    cleanup(`remove ${binary} rule`, () => root(`${binary} -D ${firewallArgs}`));
  cleanup('restore Wi-Fi', () =>
    adb('shell', 'svc', 'wifi', baseline.wifi === '1' ? 'enable' : 'disable')
  );
  cleanup('restore data', () =>
    adb('shell', 'svc', 'data', baseline.data === '1' ? 'enable' : 'disable')
  );
  cleanup('remove owned XML', () =>
    adb('shell', 'rm', '-f', '/data/local/tmp/rn-hunt-monkey-ui.xml')
  );
  if (snapshotRestored)
    cleanup('return probe', () => adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`));
  const settingsAfter = settingsSnapshot();
  const osDifferences = [];
  const parse = (text) =>
    new Map(
      text
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1)];
        })
    );
  for (const namespace of ['system', 'secure', 'global']) {
    const before = parse(settingsBefore[namespace]),
      after = parse(settingsAfter[namespace]);
    for (const key of new Set([...before.keys(), ...after.keys()]))
      if (before.get(key) !== after.get(key))
        osDifferences.push({
          namespace,
          key,
          before: before.get(key) ?? null,
          after: after.get(key) ?? null,
        });
  }
  writeFileSync(
    `${OUT}/android-run2-monkey-verified-summary.json`,
    JSON.stringify(
      {
        baseline,
        results: all,
        restored: cleanupErrors.length === 0,
        snapshotRestored,
        uid,
        firewallRules: installedRules,
        settingsBefore,
        settingsAfter,
        osDifferences,
        osRestorationVerificationPending: true,
        logcatCoverage: {
          status:
            all.length === SEEDS.length && all.every((row) => row.rawLogcatRead.exit === 0)
              ? 'readable through controlled adapter with raw exit-code proof'
              : 'incomplete',
        },
        cleanupErrors,
      },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length) {
    console.error(JSON.stringify(cleanupErrors));
    process.exitCode = 1;
  }
}
